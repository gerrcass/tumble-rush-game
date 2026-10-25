/**
 * Pure mix maths for the procedural audio engine.
 *
 * Keeping the gain/voice rules in one dependency-free module means the settings
 * UI, the profile and the unit tests all agree on what "muted", "ducked" and
 * "too many voices" mean without touching Web Audio.
 */

/** The hard ceiling from the spec: twelve simultaneous synth voices. */
export const MAX_AUDIO_VOICES = 12;

/** How far the music bus drops while the Show is paused. Never zero. */
export const PAUSE_MUSIC_DUCK = 0.24;
export const PAUSE_SFX_DUCK = 0.5;

export interface MixSettings {
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  paused: boolean;
}

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Master gain is only ever a mute switch; buses carry the mix. */
export function masterGain(muted: boolean): number {
  return muted ? 0 : 1;
}

/** A gentle curve keeps 50% feeling like half volume rather than half amplitude. */
export function volumeCurve(value: number): number {
  return Math.pow(clampVolume(value), 1.35);
}

type MusicMix = Pick<MixSettings, 'musicVolume' | 'muted'> & { paused?: boolean };
type SfxMix = Pick<MixSettings, 'sfxVolume' | 'muted'> & { paused?: boolean };

export function musicBusGain(settings: MusicMix): number {
  if (settings.muted) return 0;
  return volumeCurve(settings.musicVolume) * (settings.paused === true ? PAUSE_MUSIC_DUCK : 1);
}

export function sfxBusGain(settings: SfxMix): number {
  if (settings.muted) return 0;
  return volumeCurve(settings.sfxVolume) * (settings.paused === true ? PAUSE_SFX_DUCK : 1);
}

/** True when another voice may be allocated inside the twelve-voice budget. */
export function canPlayVoice(activeVoices: number, limit = MAX_AUDIO_VOICES): boolean {
  return activeVoices < limit;
}

/** Music leaves headroom for gameplay sounds instead of stealing the last slots. */
export function musicVoiceBudget(activeVoices: number, limit = MAX_AUDIO_VOICES): boolean {
  return activeVoices < Math.max(1, limit - 2);
}

/**
 * Normalize a stored mix without trusting localStorage. The profile layer owns
 * persistence; this helper is what the Settings screen and audio callbacks use.
 */
export function normalizeMix(raw: Partial<MixSettings> | null | undefined): MixSettings {
  const source = raw ?? {};
  return {
    musicVolume: clampVolume(source.musicVolume ?? 0.6),
    sfxVolume: clampVolume(source.sfxVolume ?? 0.7),
    muted: source.muted === true,
    paused: source.paused === true,
  };
}
