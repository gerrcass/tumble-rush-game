import {
  MAX_AUDIO_VOICES,
  canPlayVoice,
  clampVolume,
  masterGain,
  musicBusGain,
  musicVoiceBudget,
  sfxBusGain,
  volumeCurve,
} from './mix';

export type MusicMode = 'menu' | 'round' | 'final';

export type SfxName =
  | 'jump'
  | 'land'
  | 'dive'
  | 'grab'
  | 'shove'
  | 'hit'
  | 'splat'
  | 'qualify'
  | 'eliminate'
  | 'countdown'
  | 'go'
  | 'crown'
  | 'ui';

export interface AudioSettings {
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
}

export interface AudioDebugState {
  started: boolean;
  muted: boolean;
  musicVolume: number;
  sfxVolume: number;
  voiceCount: number;
  mode: MusicMode;
  paused: boolean;
  contextState: string;
}

export interface AudioEngineOptions {
  musicVolume?: number;
  sfxVolume?: number;
  muted?: boolean;
}

interface Voice {
  source: AudioScheduledSourceNode;
  gain: GainNode;
}

interface ToneOptions {
  freq: number;
  endFreq?: number;
  duration: number;
  type: OscillatorType;
  gain: number;
  attack?: number;
  at?: number;
  bus: 'music' | 'sfx';
  filter?: { type: BiquadFilterType; frequency: number; q?: number };
}

interface NoiseOptions {
  duration: number;
  gain: number;
  at?: number;
  bus: 'music' | 'sfx';
  filter?: { type: BiquadFilterType; frequency: number; endFrequency?: number; q?: number };
}

const BPM = 122;
const STEP_SECONDS = 60 / BPM / 4;
const LOOP_STEPS = 64;
const LOOKAHEAD = 0.32;
const SCHEDULER_MS = 70;

/**
 * Four bars of Cmaj7 – Am7 – Fmaj7 – G7. The scheduler walks sixteenth notes
 * forever instead of restarting a buffer, so the loop has no seam: the last
 * sixteenth flows straight into the next downbeat.
 */
const CHORDS = [
  { root: 48, notes: [60, 64, 67, 71] },
  { root: 45, notes: [57, 60, 64, 67] },
  { root: 41, notes: [53, 57, 60, 64] },
  { root: 43, notes: [55, 59, 62, 65] },
] as const;

function midiToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/**
 * Original procedural show music and sound effects. Everything is oscillators
 * and generated noise; no files, no network. The engine is intentionally
 * conservative: a master mute, a music bus, an SFX bus, pause ducking and a
 * hard twelve-voice cap shared by both buses.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private readonly voices = new Set<Voice>();
  private readonly gestureAbort = new AbortController();
  private timer: number | null = null;
  private nextStepTime = 0;
  private step = 0;
  private mode: MusicMode = 'menu';
  private paused = false;
  private started = false;
  private lastBeat = -1;

  private settings: AudioSettings;

  constructor(options: AudioEngineOptions = {}) {
    this.settings = {
      musicVolume: clampVolume(options.musicVolume ?? 0.6),
      sfxVolume: clampVolume(options.sfxVolume ?? 0.7),
      muted: options.muted === true,
    };
  }

  /** Attach one-shot gesture listeners. Audio is never created before a tap/key. */
  bindGesture(target: Window): void {
    if (this.started) return;
    const unlock = (): void => this.unlock();
    const signal = this.gestureAbort.signal;
    target.addEventListener('pointerdown', unlock, { capture: true, once: true, signal });
    target.addEventListener('keydown', unlock, { capture: true, once: true, signal });
    target.addEventListener('touchstart', unlock, { capture: true, once: true, passive: true, signal });
  }

  /** Called from any real user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (this.started) return;
    const Ctor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    let ctx: AudioContext;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      return;
    }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.master.gain.value = masterGain(this.settings.muted);
    this.musicBus.gain.value = musicBusGain(this.settings);
    this.sfxBus.gain.value = sfxBusGain(this.settings);
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(ctx.destination);
    this.noiseBuffer = this.createNoise(ctx);
    this.started = true;
    this.gestureAbort.abort();
    void ctx.resume().catch(() => undefined);
    this.nextStepTime = ctx.currentTime + 0.12;
    this.timer = window.setInterval(this.schedule, SCHEDULER_MS);
    this.schedule();
  }

  get isStarted(): boolean {
    return this.started;
  }

  setSettings(settings: Partial<AudioSettings>): void {
    if (settings.musicVolume !== undefined) this.settings.musicVolume = clampVolume(settings.musicVolume);
    if (settings.sfxVolume !== undefined) this.settings.sfxVolume = clampVolume(settings.sfxVolume);
    if (settings.muted !== undefined) this.settings.muted = settings.muted;
    this.applyGains();
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.applyGains();
  }

  setMusicMode(mode: MusicMode): void {
    this.mode = mode;
  }

  getState(): AudioDebugState {
    return {
      started: this.started,
      muted: this.settings.muted,
      musicVolume: this.settings.musicVolume,
      sfxVolume: this.settings.sfxVolume,
      voiceCount: this.voices.size,
      mode: this.mode,
      paused: this.paused,
      contextState: this.ctx?.state ?? 'none',
    };
  }

  /**
   * Fire a short effect. Returns false when audio has not been unlocked, when
   * muted, or when the twelve-voice budget is full.
   */
  play(name: SfxName): boolean {
    const ctx = this.ctx;
    if (!ctx || !this.started || this.settings.muted) return false;
    if (!canPlayVoice(this.voices.size, MAX_AUDIO_VOICES)) return false;
    switch (name) {
      case 'jump':
        this.tone({
          freq: 300,
          endFreq: 720,
          duration: 0.16,
          type: 'sine',
          gain: 0.16,
          bus: 'sfx',
          filter: { type: 'lowpass', frequency: 2400 },
        });
        break;
      case 'land':
        this.tone({ freq: 150, endFreq: 62, duration: 0.12, type: 'sine', gain: 0.2, bus: 'sfx' });
        this.noise({ duration: 0.07, gain: 0.06, bus: 'sfx', filter: { type: 'lowpass', frequency: 420 } });
        break;
      case 'dive':
        this.noise({
          duration: 0.26,
          gain: 0.12,
          bus: 'sfx',
          filter: { type: 'bandpass', frequency: 1600, endFrequency: 320, q: 0.8 },
        });
        break;
      case 'grab':
        this.tone({ freq: 240, endFreq: 190, duration: 0.09, type: 'square', gain: 0.06, bus: 'sfx' });
        this.noise({ duration: 0.05, gain: 0.05, bus: 'sfx', filter: { type: 'highpass', frequency: 900 } });
        break;
      case 'shove':
        this.noise({
          duration: 0.12,
          gain: 0.1,
          bus: 'sfx',
          filter: { type: 'bandpass', frequency: 700, endFrequency: 220, q: 1.1 },
        });
        this.tone({ freq: 190, endFreq: 90, duration: 0.11, type: 'triangle', gain: 0.09, bus: 'sfx' });
        break;
      case 'hit':
        this.tone({ freq: 330, endFreq: 140, duration: 0.11, type: 'triangle', gain: 0.16, bus: 'sfx' });
        this.noise({ duration: 0.05, gain: 0.06, bus: 'sfx', filter: { type: 'bandpass', frequency: 1400, q: 1.2 } });
        break;
      case 'splat':
        this.noise({
          duration: 0.34,
          gain: 0.16,
          bus: 'sfx',
          filter: { type: 'lowpass', frequency: 900, endFrequency: 160 },
        });
        this.tone({ freq: 210, endFreq: 48, duration: 0.3, type: 'sine', gain: 0.12, bus: 'sfx' });
        break;
      case 'qualify': {
        const notes = [72, 76, 79, 84];
        notes.forEach((note, index) => {
          this.tone({
            freq: midiToFreq(note),
            duration: 0.32,
            type: 'triangle',
            gain: 0.12,
            at: ctx.currentTime + index * 0.085,
            bus: 'sfx',
            filter: { type: 'lowpass', frequency: 4200 },
          });
        });
        break;
      }
      case 'eliminate': {
        const notes = [58, 56, 54, 51];
        notes.forEach((note, index) => {
          this.tone({
            freq: midiToFreq(note),
            endFreq: midiToFreq(note) * (index === notes.length - 1 ? 0.86 : 0.985),
            duration: 0.19,
            type: 'sawtooth',
            gain: 0.07,
            at: ctx.currentTime + index * 0.16,
            bus: 'sfx',
            filter: { type: 'lowpass', frequency: 1100 },
          });
        });
        break;
      }
      case 'countdown':
        this.tone({ freq: 660, duration: 0.09, type: 'square', gain: 0.07, bus: 'sfx' });
        this.noise({ duration: 0.03, gain: 0.03, bus: 'sfx', filter: { type: 'highpass', frequency: 2000 } });
        break;
      case 'go':
        this.tone({ freq: 880, duration: 0.16, type: 'square', gain: 0.08, bus: 'sfx' });
        this.tone({
          freq: 1320,
          duration: 0.22,
          type: 'triangle',
          gain: 0.07,
          at: ctx.currentTime + 0.05,
          bus: 'sfx',
        });
        break;
      case 'crown': {
        const fanfare = [
          [60, 0],
          [64, 0.12],
          [67, 0.24],
          [72, 0.36],
          [76, 0.52],
          [79, 0.68],
          [84, 0.9],
        ] as const;
        for (const [note, delay] of fanfare) {
          this.tone({
            freq: midiToFreq(note),
            duration: 0.5,
            type: 'triangle',
            gain: 0.13,
            at: ctx.currentTime + delay,
            bus: 'sfx',
            filter: { type: 'lowpass', frequency: 5200 },
          });
          this.tone({
            freq: midiToFreq(note + 12),
            duration: 0.36,
            type: 'sine',
            gain: 0.05,
            at: ctx.currentTime + delay,
            bus: 'sfx',
          });
        }
        this.noise({ duration: 0.9, gain: 0.07, bus: 'sfx', filter: { type: 'highpass', frequency: 2400 } });
        break;
      }
      case 'ui':
      default:
        this.tone({ freq: 880, duration: 0.045, type: 'triangle', gain: 0.045, bus: 'sfx' });
        break;
    }
    return true;
  }

  dispose(): void {
    this.gestureAbort.abort();
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    for (const voice of this.voices) {
      try {
        voice.source.stop();
      } catch {
        // Already stopped.
      }
      voice.source.disconnect();
      voice.gain.disconnect();
    }
    this.voices.clear();
    this.master?.disconnect();
    this.musicBus?.disconnect();
    this.sfxBus?.disconnect();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.started = false;
  }

  // ---------------------------------------------------------------- mixer

  private applyGains(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.master?.gain.setTargetAtTime(masterGain(this.settings.muted), now, 0.02);
    this.musicBus?.gain.setTargetAtTime(musicBusGain({ ...this.settings, paused: this.paused }), now, 0.06);
    this.sfxBus?.gain.setTargetAtTime(sfxBusGain({ ...this.settings, paused: this.paused }), now, 0.04);
  }

  private createNoise(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 0x5eed1234;
    for (let i = 0; i < length; i += 1) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      data[i] = ((seed >>> 0) / 0xffffffff) * 2 - 1;
    }
    return buffer;
  }

  private track(source: AudioScheduledSourceNode, gain: GainNode): void {
    const voice: Voice = { source, gain };
    this.voices.add(voice);
    source.onended = () => {
      this.voices.delete(voice);
      source.disconnect();
      gain.disconnect();
    };
  }

  private tone(options: ToneOptions): void {
    const ctx = this.ctx;
    const bus = options.bus === 'music' ? this.musicBus : this.sfxBus;
    if (!ctx || !bus) return;
    if (options.bus === 'music' ? !musicVoiceBudget(this.voices.size) : !canPlayVoice(this.voices.size)) {
      return;
    }
    const at = options.at ?? ctx.currentTime;
    const duration = Math.max(0.02, options.duration);
    const gain = Math.min(0.22, Math.max(0.0004, options.gain));
    const osc = ctx.createOscillator();
    osc.type = options.type;
    osc.frequency.setValueAtTime(Math.max(20, options.freq), at);
    if (options.endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFreq), at + duration);
    }
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(gain, at + (options.attack ?? 0.008));
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    let tail: AudioNode = envelope;
    osc.connect(envelope);
    if (options.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = options.filter.type;
      filter.frequency.setValueAtTime(options.filter.frequency, at);
      if (options.filter.q !== undefined) filter.Q.value = options.filter.q;
      envelope.connect(filter);
      tail = filter;
    }
    tail.connect(bus);
    osc.start(at);
    osc.stop(at + duration + 0.02);
    this.track(osc, envelope);
  }

  private noise(options: NoiseOptions): void {
    const ctx = this.ctx;
    const bus = options.bus === 'music' ? this.musicBus : this.sfxBus;
    if (!ctx || !bus || !this.noiseBuffer) return;
    if (options.bus === 'music' ? !musicVoiceBudget(this.voices.size) : !canPlayVoice(this.voices.size)) {
      return;
    }
    const at = options.at ?? ctx.currentTime;
    const duration = Math.max(0.02, options.duration);
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0004, options.gain), at + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    let tail: AudioNode = envelope;
    source.connect(envelope);
    if (options.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = options.filter.type;
      filter.frequency.setValueAtTime(options.filter.frequency, at);
      if (options.filter.endFrequency !== undefined) {
        filter.frequency.exponentialRampToValueAtTime(
          Math.max(40, options.filter.endFrequency),
          at + duration,
        );
      }
      if (options.filter.q !== undefined) filter.Q.value = options.filter.q;
      envelope.connect(filter);
      tail = filter;
    }
    tail.connect(bus);
    source.start(at);
    source.stop(at + duration + 0.02);
    this.track(source, envelope);
  }

  // ----------------------------------------------------------------- music

  private schedule = (): void => {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (this.nextStepTime < now - 0.4) {
      // Tab throttling can leave the cursor far behind; resync without a burst
      // of catch-up notes.
      this.nextStepTime = now + 0.06;
    }
    while (this.nextStepTime < now + LOOKAHEAD) {
      this.scheduleStep(this.step, this.nextStepTime);
      this.nextStepTime += STEP_SECONDS;
      this.step = (this.step + 1) % LOOP_STEPS;
    }
    const beat = Math.floor(now / (STEP_SECONDS * 4));
    if (beat !== this.lastBeat) this.lastBeat = beat;
  };

  private scheduleStep(step: number, at: number): void {
    const bar = Math.floor(step / 16) % CHORDS.length;
    const chord = CHORDS[bar]!;
    const inBar = step % 16;
    const mode = this.mode;

    // Shared low pad: quiet, long, and only once per bar.
    if (inBar === 0) {
      this.tone({
        freq: midiToFreq(chord.root),
        duration: STEP_SECONDS * 16,
        type: 'sine',
        gain: mode === 'menu' ? 0.028 : 0.02,
        attack: 0.4,
        at,
        bus: 'music',
      });
      if (mode !== 'menu') {
        this.tone({
          freq: midiToFreq(chord.notes[1]!),
          duration: STEP_SECONDS * 16,
          type: 'sine',
          gain: 0.014,
          attack: 0.5,
          at,
          bus: 'music',
        });
      }
    }

    if (mode === 'menu') {
      if (inBar % 2 === 0) {
        const note = chord.notes[(inBar / 2) % chord.notes.length]!;
        this.tone({
          freq: midiToFreq(note + (inBar % 8 === 0 ? 0 : 12)),
          duration: 0.24,
          type: 'triangle',
          gain: 0.042,
          at,
          bus: 'music',
          filter: { type: 'lowpass', frequency: 3200 },
        });
      }
      if (inBar === 0 || inBar === 8) {
        this.tone({
          freq: midiToFreq(chord.root - 12),
          duration: 0.44,
          type: 'triangle',
          gain: 0.075,
          at,
          bus: 'music',
        });
      }
      if (inBar === 4 || inBar === 12) {
        this.noise({ duration: 0.05, gain: 0.012, at, bus: 'music', filter: { type: 'highpass', frequency: 5200 } });
      }
      return;
    }

    // Percussion: four-on-the-floor with a backbeat.
    if (inBar === 0 || inBar === 4 || inBar === 8 || inBar === 12) {
      this.tone({ freq: 130, endFreq: 52, duration: 0.17, type: 'sine', gain: 0.13, at, bus: 'music' });
    }
    if (mode === 'final' && (inBar === 14 || inBar === 7)) {
      this.tone({ freq: 120, endFreq: 50, duration: 0.12, type: 'sine', gain: 0.09, at, bus: 'music' });
    }
    if (inBar === 4 || inBar === 12) {
      this.noise({
        duration: 0.13,
        gain: 0.075,
        at,
        bus: 'music',
        filter: { type: 'bandpass', frequency: 1900, q: 0.7 },
      });
    }
    if (inBar % 2 === 0) {
      this.noise({
        duration: 0.035,
        gain: mode === 'final' ? 0.026 : 0.018,
        at,
        bus: 'music',
        filter: { type: 'highpass', frequency: 6500 },
      });
    }

    // Plucky bass on eighths.
    if (inBar % 2 === 0) {
      const octave = inBar === 6 || inBar === 14 ? 12 : 0;
      this.tone({
        freq: midiToFreq(chord.root - 12 + octave),
        duration: 0.18,
        type: 'triangle',
        gain: 0.085,
        at,
        bus: 'music',
        filter: { type: 'lowpass', frequency: 1300 },
      });
    }

    // Chord arpeggio, a little syncopated.
    if (inBar % 2 === 1 || inBar === 0) {
      const note = chord.notes[(Math.floor(inBar / 2) + 1) % chord.notes.length]!;
      this.tone({
        freq: midiToFreq(note + 12),
        duration: 0.14,
        type: 'triangle',
        gain: 0.035,
        at,
        bus: 'music',
        filter: { type: 'lowpass', frequency: 3800 },
      });
    }

    if (mode === 'final') {
      const melodyStep = inBar % 8;
      const phrase = [0, 2, 4, 2, 5, 4, 2, 1] as const;
      if (inBar % 2 === 0) {
        const note = chord.notes[phrase[melodyStep]! % chord.notes.length]!;
        this.tone({
          freq: midiToFreq(note + 12),
          duration: 0.22,
          type: 'square',
          gain: 0.03,
          at,
          bus: 'music',
          filter: { type: 'lowpass', frequency: 2600 },
        });
      }
    }
  }
}

export { MAX_AUDIO_VOICES, volumeCurve };
