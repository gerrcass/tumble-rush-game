import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  PROFILE_STORAGE_KEY,
  awardQualification,
  awardWin,
  createDefaultProfile,
  equipCosmetic,
  isUnlocked,
  normalizeProfile,
  purchaseCosmetic,
  readProfile,
  recordShowFinish,
  resetProfile,
  saveProfile,
  type ProfileStorage,
} from '../game/profile';
import { DEFAULT_LOOK, starterUnlocks } from '../game/cosmetics';

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

describe('profile persistence and safety', () => {
  it('creates a safe starter profile with the starter cosmetics unlocked', () => {
    const profile = createDefaultProfile('2026-04-18');
    expect(profile.version).toBe(1);
    expect(profile.name).toBe('Pip');
    expect(profile.look).toEqual(DEFAULT_LOOK);
    expect(profile.kudos).toBe(100);
    expect(profile.crowns).toBe(0);
    expect(profile.bestFinish).toBeNull();
    expect(profile.unlocks.sort()).toEqual(starterUnlocks().sort());
    expect(profile.settings).toEqual(DEFAULT_SETTINGS);
    expect(profile.daily).toEqual({ date: '2026-04-18', bestFinish: null, completed: false });
  });

  it('round-trips name, look, currency, stats and settings', () => {
    const storage = new MemoryStorage();
    const profile = createDefaultProfile();
    profile.name = 'Jelly Jim';
    profile.look = { colorId: 'grape', patternId: 'stars', hatId: 'halo', emoteId: 'dance' };
    profile.unlocks.push('color:grape', 'pattern:stars', 'hat:halo', 'emote:dance');
    profile.kudos = 840;
    profile.crowns = 3;
    profile.bestFinish = 2;
    profile.settings.musicVolume = 0.22;
    profile.settings.sfxVolume = 0.31;
    profile.settings.quality = 'low';
    profile.settings.touchControls = 'off';
    profile.settings.nameTags = false;
    expect(saveProfile(profile, storage)).toBe(true);

    const loaded = readProfile(storage);
    expect(loaded.recovered).toBe(false);
    expect(loaded.profile.name).toBe('Jelly Jim');
    expect(loaded.profile.look).toEqual({
      colorId: 'grape',
      patternId: 'stars',
      hatId: 'halo',
      emoteId: 'dance',
    });
    expect(loaded.profile.kudos).toBe(840);
    expect(loaded.profile.crowns).toBe(3);
    expect(loaded.profile.bestFinish).toBe(2);
    expect(loaded.profile.settings.musicVolume).toBeCloseTo(0.22, 5);
    expect(loaded.profile.settings.quality).toBe('low');
    expect(loaded.profile.settings.touchControls).toBe('off');
    expect(loaded.profile.settings.nameTags).toBe(false);
  });

  it('resets corrupt JSON and unknown schema versions without throwing', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_STORAGE_KEY, '{not json');
    const corrupt = readProfile(storage);
    expect(corrupt.recovered).toBe(true);
    expect(corrupt.profile).toEqual(createDefaultProfile());

    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ version: 0, name: 'Old' }));
    const old = readProfile(storage);
    expect(old.recovered).toBe(true);
    expect(old.profile.name).toBe('Pip');
    expect(old.profile.version).toBe(1);
  });

  it('normalizes bad fields and never equips an unowned cosmetic', () => {
    const profile = normalizeProfile({
      version: 1,
      name: '<script>',
      look: { colorId: 'midnight', patternId: 'nope', hatId: 'halo', emoteId: 'dance' },
      kudos: -20,
      crowns: 'lots',
      unlocks: ['color:midnight', 'hat:not-real'],
      settings: { quality: 'ultra', cameraSensitivity: 99 },
    });
    expect(profile.name).toBe('script');
    expect(profile.kudos).toBe(0);
    expect(profile.crowns).toBe(0);
    expect(profile.look.patternId).toBe(DEFAULT_LOOK.patternId);
    expect(profile.look.emoteId).toBe(DEFAULT_LOOK.emoteId);
    expect(profile.settings.quality).toBe('auto');
    expect(profile.settings.cameraSensitivity).toBe(1.6);
    expect(profile.unlocks).toContain('color:midnight');
    expect(profile.unlocks).not.toContain('hat:not-real');
  });

  it('ignores malformed unlock kinds instead of throwing the profile away', () => {
    const profile = normalizeProfile({
      version: 1,
      name: 'Nova',
      kudos: 250,
      unlocks: ['bogus:thing', 'color', '::', 'color:grape', 'hat:not-real'],
    });
    expect(profile.name).toBe('Nova');
    expect(profile.kudos).toBe(250);
    expect(profile.unlocks).toContain('color:grape');
    expect(profile.unlocks).not.toContain('bogus:thing');
    expect(profile.look.colorId).toBe('coral');
  });

  it('reset restores the safe default and clears storage', () => {
    const storage = new MemoryStorage();
    const profile = createDefaultProfile();
    profile.crowns = 9;
    profile.kudos = 50;
    saveProfile(profile, storage);
    const reset = resetProfile(storage);
    expect(reset.crowns).toBe(0);
    expect(reset.kudos).toBe(100);
    expect(readProfile(storage).profile.crowns).toBe(0);
  });
});

describe('profile economy and unlocks', () => {
  it('purchases a locked cosmetic, deducts kudos, equips it and persists the unlock', () => {
    const storage = new MemoryStorage();
    const profile = createDefaultProfile();
    profile.kudos = 100;
    expect(isUnlocked(profile, 'color', 'grape')).toBe(false);
    const purchase = purchaseCosmetic(profile, 'color', 'grape');
    expect(purchase).toMatchObject({ ok: true, cost: 60, alreadyOwned: false });
    expect(profile.kudos).toBe(40);
    expect(isUnlocked(profile, 'color', 'grape')).toBe(true);
    expect(equipCosmetic(profile, 'color', 'grape')).toBe(true);
    expect(profile.look.colorId).toBe('grape');
    saveProfile(profile, storage);
    const loaded = readProfile(storage).profile;
    expect(isUnlocked(loaded, 'color', 'grape')).toBe(true);
    expect(loaded.look.colorId).toBe('grape');
    expect(loaded.kudos).toBe(40);
  });

  it('refuses an unaffordable purchase and does not equip an unowned item', () => {
    const profile = createDefaultProfile();
    profile.kudos = 10;
    const purchase = purchaseCosmetic(profile, 'hat', 'flower');
    expect(purchase.ok).toBe(false);
    expect(purchase.reason).toBe('kudos');
    expect(profile.kudos).toBe(10);
    expect(isUnlocked(profile, 'hat', 'flower')).toBe(false);
    expect(equipCosmetic(profile, 'hat', 'flower')).toBe(false);
    expect(profile.look.hatId).not.toBe('flower');
  });

  it('pays 25 per qualification with one 50 bonus, and 1 crown + 100 for a win', () => {
    const profile = createDefaultProfile();
    const first = awardQualification(profile, true);
    expect(first).toEqual({ kudos: 75, bonus: 50 });
    expect(profile.kudos).toBe(175);
    expect(profile.qualifications).toBe(1);
    const second = awardQualification(profile, false);
    expect(second).toEqual({ kudos: 25, bonus: 0 });
    expect(profile.kudos).toBe(200);
    expect(profile.qualifications).toBe(2);
    const win = awardWin(profile);
    expect(win).toEqual({ kudos: 100, crowns: 1 });
    expect(profile.crowns).toBe(1);
    expect(profile.kudos).toBe(300);
    expect(profile.wins).toBe(0);
  });

  it('keeps the best daily placement instead of overwriting it with a worse run', () => {
    const profile = createDefaultProfile('2026-04-18');
    recordShowFinish(profile, { won: false, placement: 3, daily: true, date: '2026-04-18' });
    recordShowFinish(profile, { won: false, placement: 9, daily: true, date: '2026-04-18' });
    expect(profile.daily.bestFinish).toBe(3);
    recordShowFinish(profile, { won: true, placement: 1, daily: true, date: '2026-04-18' });
    expect(profile.daily.bestFinish).toBe(1);
  });

  it('updates career best, show count and the daily result', () => {
    const profile = createDefaultProfile('2026-04-18');
    profile.bestFinish = 5;
    const first = recordShowFinish(profile, {
      won: false,
      placement: 7,
      daily: true,
      date: '2026-04-18',
    });
    expect(first.newBest).toBe(false);
    expect(profile.bestFinish).toBe(5);
    expect(profile.shows).toBe(1);
    expect(profile.daily).toEqual({ date: '2026-04-18', bestFinish: 7, completed: true });

    const second = recordShowFinish(profile, {
      won: true,
      placement: 1,
      daily: false,
      date: '2026-04-18',
    });
    expect(second.newBest).toBe(true);
    expect(profile.bestFinish).toBe(1);
    expect(profile.wins).toBe(1);
    expect(profile.shows).toBe(2);
  });
});
