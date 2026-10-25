import { describe, expect, it } from 'vitest';
import {
  MAX_AUDIO_VOICES,
  PAUSE_MUSIC_DUCK,
  canPlayVoice,
  clampVolume,
  masterGain,
  musicBusGain,
  musicVoiceBudget,
  normalizeMix,
  sfxBusGain,
  volumeCurve,
} from '../game/audio/mix';
import { particleBudget } from '../game/fx/Bursts';
import {
  PROFILE_STORAGE_KEY,
  createDefaultProfile,
  normalizeProfile,
  readProfile,
  saveProfile,
  type ProfileStorage,
} from '../game/profile';

class MemoryStorage implements ProfileStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

describe('audio mixer maths', () => {
  it('clamps volumes and never trusts a non-finite setting', () => {
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(1.4)).toBe(1);
    expect(clampVolume(Number.NaN)).toBe(0);
    expect(normalizeMix({ musicVolume: 2, sfxVolume: -0.1 }).musicVolume).toBe(1);
    expect(normalizeMix({ musicVolume: 2, sfxVolume: -0.1 }).sfxVolume).toBe(0);
  });

  it('mutes the whole mix without forgetting the bus levels', () => {
    expect(masterGain(true)).toBe(0);
    expect(masterGain(false)).toBe(1);
    expect(musicBusGain({ musicVolume: 0.6, muted: true })).toBe(0);
    expect(sfxBusGain({ sfxVolume: 0.7, muted: true })).toBe(0);
    expect(musicBusGain({ musicVolume: 0.6, muted: false })).toBeGreaterThan(0);
  });

  it('ducks pause music but leaves it recoverable', () => {
    const playing = musicBusGain({ musicVolume: 0.6, muted: false, paused: false });
    const paused = musicBusGain({ musicVolume: 0.6, muted: false, paused: true });
    expect(paused).toBeLessThan(playing);
    expect(paused).toBeCloseTo(playing * PAUSE_MUSIC_DUCK, 6);
    expect(paused).toBeGreaterThan(0);
  });

  it('keeps 0% truly silent and follows a monotonic curve', () => {
    expect(musicBusGain({ musicVolume: 0, muted: false })).toBe(0);
    expect(sfxBusGain({ sfxVolume: 0, muted: false })).toBe(0);
    expect(volumeCurve(0.25)).toBeLessThan(volumeCurve(0.75));
    expect(volumeCurve(1)).toBe(1);
  });

  it('never allocates past the twelve-voice cap', () => {
    expect(MAX_AUDIO_VOICES).toBe(12);
    expect(canPlayVoice(11)).toBe(true);
    expect(canPlayVoice(12)).toBe(false);
    expect(canPlayVoice(13)).toBe(false);
    // Music reserves the last two slots for gameplay/UI effects.
    expect(musicVoiceBudget(9)).toBe(true);
    expect(musicVoiceBudget(10)).toBe(false);
  });
});

describe('profile audio settings', () => {
  it('round-trips the live mix and mute flag through storage', () => {
    const storage = new MemoryStorage();
    const profile = createDefaultProfile('2026-04-18');
    profile.settings.musicVolume = 0.25;
    profile.settings.sfxVolume = 0.4;
    profile.settings.muted = true;
    expect(saveProfile(profile, storage)).toBe(true);
    const loaded = readProfile(storage);
    expect(loaded.recovered).toBe(false);
    expect(loaded.profile.settings.musicVolume).toBe(0.25);
    expect(loaded.profile.settings.sfxVolume).toBe(0.4);
    expect(loaded.profile.settings.muted).toBe(true);
  });

  it('repairs out-of-range audio values from a corrupt profile', () => {
    const normalized = normalizeProfile({
      version: 1,
      settings: { musicVolume: 12, sfxVolume: -3, muted: 'yes' },
    });
    expect(normalized.settings.musicVolume).toBe(1);
    expect(normalized.settings.sfxVolume).toBe(0);
    expect(normalized.settings.muted).toBe(false);
  });

  it('rejects a corrupt stored payload and falls back to defaults', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_STORAGE_KEY, '{"version":1,"settings":oops}');
    const loaded = readProfile(storage);
    expect(loaded.recovered).toBe(true);
    expect(loaded.profile.settings.musicVolume).toBe(0.6);
    expect(loaded.profile.settings.sfxVolume).toBe(0.7);
    expect(loaded.profile.settings.muted).toBe(false);
  });
});

describe('particle budget', () => {
  it('scales down for low quality and again for reduced motion', () => {
    const high = particleBudget('high', false);
    const low = particleBudget('low', false);
    const reduced = particleBudget('high', true);
    expect(high.maxParticles).toBeGreaterThan(low.maxParticles);
    expect(reduced.maxParticles).toBeLessThan(low.maxParticles);
    expect(reduced.scale).toBeLessThan(low.scale);
    expect(high.maxParticles).toBeLessThanOrEqual(180);
  });
});
