import { dailySeed, Rng } from './Rng';
import {
  DEFAULT_LOOK,
  EMOTE_CATALOGUE,
  HAT_CATALOGUE,
  PATTERN_CATALOGUE,
  colorCatalogue,
  cosmeticItem,
  cosmeticKey,
  isColorId,
  isCosmeticKind,
  isEmoteId,
  isHatId,
  isPatternId,
  starterUnlocks,
  type BeanLook,
  type ColorId,
  type CosmeticKind,
  type EmoteId,
  type HatId,
  type PatternId,
} from './cosmetics';

export const PROFILE_VERSION = 1;
export const PROFILE_STORAGE_KEY = 'tumble-rush.profile.v1';

export const KUDOS_QUALIFY = 25;
export const KUDOS_FIRST_QUALIFY_BONUS = 50;
export const KUDOS_WIN = 100;

export type QualitySetting = 'auto' | 'high' | 'low';
export type TouchSetting = 'auto' | 'on' | 'off';

export interface ProfileSettings {
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  quality: QualitySetting;
  reducedMotion: boolean;
  cameraSensitivity: number;
  invertY: boolean;
  nameTags: boolean;
  touchControls: TouchSetting;
}

export interface DailyResult {
  date: string;
  bestFinish: number | null;
  completed: boolean;
}

export interface Profile {
  version: typeof PROFILE_VERSION;
  name: string;
  look: BeanLook;
  crowns: number;
  kudos: number;
  wins: number;
  shows: number;
  qualifications: number;
  bestFinish: number | null;
  unlocks: string[];
  settings: ProfileSettings;
  daily: DailyResult;
}

export interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const DEFAULT_SETTINGS: Readonly<ProfileSettings> = {
  musicVolume: 0.6,
  sfxVolume: 0.7,
  muted: false,
  quality: 'auto',
  reducedMotion: false,
  cameraSensitivity: 1,
  invertY: false,
  nameTags: true,
  touchControls: 'auto',
};

export function createDefaultProfile(date = dailySeed().label): Profile {
  return {
    version: PROFILE_VERSION,
    name: 'Pip',
    look: { ...DEFAULT_LOOK },
    crowns: 0,
    kudos: 100,
    wins: 0,
    shows: 0,
    qualifications: 0,
    bestFinish: null,
    unlocks: starterUnlocks(),
    settings: { ...DEFAULT_SETTINGS },
    daily: { date, bestFinish: null, completed: false },
  };
}

function safeName(value: unknown): string {
  if (typeof value !== 'string') return 'Pip';
  const cleaned = value
    .replace(/[^\p{L}\p{N} _'!.-]/gu, '')
    .trim()
    .slice(0, 16);
  return cleaned.length > 0 ? cleaned : 'Pip';
}

function number(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function integer(value: unknown, fallback: number, max = 1_000_000): number {
  return Math.min(max, Math.max(0, Math.floor(number(value, fallback, 0, max))));
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeSettings(raw: unknown): ProfileSettings {
  const source = typeof raw === 'object' && raw !== null ? (raw as Partial<ProfileSettings>) : {};
  const quality: QualitySetting =
    source.quality === 'high' || source.quality === 'low' || source.quality === 'auto'
      ? source.quality
      : DEFAULT_SETTINGS.quality;
  const touchControls: TouchSetting =
    source.touchControls === 'on' || source.touchControls === 'off' || source.touchControls === 'auto'
      ? source.touchControls
      : DEFAULT_SETTINGS.touchControls;
  return {
    musicVolume: number(source.musicVolume, DEFAULT_SETTINGS.musicVolume, 0, 1),
    sfxVolume: number(source.sfxVolume, DEFAULT_SETTINGS.sfxVolume, 0, 1),
    muted: boolean(source.muted, DEFAULT_SETTINGS.muted),
    quality,
    reducedMotion: boolean(source.reducedMotion, DEFAULT_SETTINGS.reducedMotion),
    cameraSensitivity: number(source.cameraSensitivity, DEFAULT_SETTINGS.cameraSensitivity, 0.5, 1.6),
    invertY: boolean(source.invertY, DEFAULT_SETTINGS.invertY),
    nameTags: boolean(source.nameTags, DEFAULT_SETTINGS.nameTags),
    touchControls,
  };
}

function normalizeLook(raw: unknown, unlocks: Set<string>): BeanLook {
  const source = typeof raw === 'object' && raw !== null ? (raw as Partial<BeanLook>) : {};
  const candidate: BeanLook = {
    colorId: isColorId(source.colorId) ? source.colorId : DEFAULT_LOOK.colorId,
    patternId: isPatternId(source.patternId) ? source.patternId : DEFAULT_LOOK.patternId,
    hatId: isHatId(source.hatId) ? source.hatId : DEFAULT_LOOK.hatId,
    emoteId: isEmoteId(source.emoteId) ? source.emoteId : DEFAULT_LOOK.emoteId,
  };
  const look: BeanLook = { ...DEFAULT_LOOK };
  for (const kind of ['color', 'pattern', 'hat', 'emote'] as const) {
    const id = lookValue(candidate, kind);
    if (unlocks.has(cosmeticKey(kind, id))) setLookValue(look, kind, id);
  }
  return look;
}

function lookValue(look: BeanLook, kind: CosmeticKind): string {
  switch (kind) {
    case 'color':
      return look.colorId;
    case 'pattern':
      return look.patternId;
    case 'hat':
      return look.hatId;
    case 'emote':
      return look.emoteId;
  }
}

function setLookValue(look: BeanLook, kind: CosmeticKind, id: string): void {
  if (kind === 'color' && isColorId(id)) look.colorId = id;
  else if (kind === 'pattern' && isPatternId(id)) look.patternId = id;
  else if (kind === 'hat' && isHatId(id)) look.hatId = id;
  else if (kind === 'emote' && isEmoteId(id)) look.emoteId = id;
}

/**
 * Rebuild a profile from unknown storage data. Unknown keys disappear, bad
 * values fall back to the safe default, and only real catalog IDs survive.
 * A profile from another schema version is treated as corrupt by `readProfile`.
 */
export function normalizeProfile(raw: unknown, date = dailySeed().label): Profile {
  const fallback = createDefaultProfile(date);
  if (typeof raw !== 'object' || raw === null) return fallback;
  const source = raw as Partial<Profile> & Record<string, unknown>;

  const unlocks = new Set(starterUnlocks());
  if (Array.isArray(source.unlocks)) {
    for (const value of source.unlocks) {
      if (typeof value !== 'string') continue;
      const separator = value.indexOf(':');
      if (separator <= 0) continue;
      const kind = value.slice(0, separator);
      const id = value.slice(separator + 1);
      if (!isCosmeticKind(kind) || id.length === 0) continue;
      if (cosmeticItem(kind, id)) unlocks.add(value);
    }
  }

  const bestFinish =
    typeof source.bestFinish === 'number' && Number.isFinite(source.bestFinish)
      ? Math.min(99, Math.max(1, Math.floor(source.bestFinish)))
      : null;

  const dailySource =
    typeof source.daily === 'object' && source.daily !== null
      ? (source.daily as Partial<DailyResult>)
      : {};
  const dailyDate =
    typeof dailySource.date === 'string' && dailySource.date.length >= 8
      ? dailySource.date
      : fallback.daily.date;
  const dailyBest =
    typeof dailySource.bestFinish === 'number' && Number.isFinite(dailySource.bestFinish)
      ? Math.min(99, Math.max(1, Math.floor(dailySource.bestFinish)))
      : null;

  return {
    version: PROFILE_VERSION,
    name: safeName(source.name),
    look: normalizeLook(source.look, unlocks),
    crowns: integer(source.crowns, 0),
    kudos: integer(source.kudos, fallback.kudos),
    wins: integer(source.wins, 0),
    shows: integer(source.shows, 0),
    qualifications: integer(source.qualifications, 0),
    bestFinish,
    unlocks: [...unlocks],
    settings: normalizeSettings(source.settings),
    daily: {
      date: dailyDate,
      bestFinish: dailyBest,
      completed: boolean(dailySource.completed, false),
    },
  };
}

export function todayLabel(): string {
  return dailySeed().label;
}

export interface LoadedProfile {
  profile: Profile;
  recovered: boolean;
}

export function readProfile(storage: ProfileStorage | null = browserStorage()): LoadedProfile {
  if (!storage) return { profile: createDefaultProfile(), recovered: false };
  try {
    const raw = storage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return { profile: createDefaultProfile(), recovered: false };
    const parsed = JSON.parse(raw) as { version?: unknown } | null;
    if (!parsed || parsed.version !== PROFILE_VERSION) {
      const profile = createDefaultProfile();
      storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
      return { profile, recovered: true };
    }
    return { profile: normalizeProfile(parsed), recovered: false };
  } catch {
    const profile = createDefaultProfile();
    try {
      storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // A blocked/full localStorage must never stop the show.
    }
    return { profile, recovered: true };
  }
}

export function saveProfile(profile: Profile, storage: ProfileStorage | null = browserStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

export function resetProfile(storage: ProfileStorage | null = browserStorage()): Profile {
  const profile = createDefaultProfile();
  if (storage) {
    try {
      storage.removeItem(PROFILE_STORAGE_KEY);
      storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // Ignore storage failures; the in-memory profile is still safe.
    }
  }
  return profile;
}

export function browserStorage(): ProfileStorage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** A valid, names-free display string (1–16 characters). */
export function sanitizeName(value: string): string {
  return safeName(value);
}

export function isUnlocked(profile: Profile, kind: CosmeticKind, id: string): boolean {
  return profile.unlocks.includes(cosmeticKey(kind, id));
}

export interface PurchaseResult {
  ok: boolean;
  reason: 'kudos' | 'unknown' | null;
  cost: number;
  alreadyOwned: boolean;
}

export function purchaseCosmetic(profile: Profile, kind: CosmeticKind, id: string): PurchaseResult {
  const item = cosmeticItem(kind, id);
  if (!item) return { ok: false, reason: 'unknown', cost: 0, alreadyOwned: false };
  if (isUnlocked(profile, kind, id)) return { ok: true, reason: null, cost: 0, alreadyOwned: true };
  if (profile.kudos < item.cost) {
    return { ok: false, reason: 'kudos', cost: item.cost, alreadyOwned: false };
  }
  profile.kudos -= item.cost;
  profile.unlocks.push(cosmeticKey(kind, id));
  return { ok: true, reason: null, cost: item.cost, alreadyOwned: false };
}

export function equipCosmetic(profile: Profile, kind: CosmeticKind, id: string): boolean {
  if (!isUnlocked(profile, kind, id)) return false;
  setLookValue(profile.look, kind, id);
  return true;
}

export function resetLook(profile: Profile): void {
  profile.look = { ...DEFAULT_LOOK };
}

export function randomizeLook(profile: Profile, rng: Rng): BeanLook {
  const pick = <Id extends string>(kind: CosmeticKind, ids: readonly Id[]): Id => {
    const owned = ids.filter((id) => isUnlocked(profile, kind, id));
    return rng.pick(owned.length > 0 ? owned : ids);
  };
  profile.look = {
    colorId: pick<ColorId>('color', colorCatalogue().map((item) => item.id)),
    patternId: pick<PatternId>('pattern', PATTERN_CATALOGUE.map((item) => item.id)),
    hatId: pick<HatId>('hat', HAT_CATALOGUE.map((item) => item.id)),
    emoteId: pick<EmoteId>('emote', EMOTE_CATALOGUE.map((item) => item.id)),
  };
  return profile.look;
}

/** +25 kudos, plus the once-per-show +50 first-qualification bonus. */
export function awardQualification(
  profile: Profile,
  firstOfShow: boolean,
): { kudos: number; bonus: number } {
  const bonus = firstOfShow ? KUDOS_FIRST_QUALIFY_BONUS : 0;
  const kudos = KUDOS_QUALIFY + bonus;
  profile.kudos += kudos;
  profile.qualifications += 1;
  return { kudos, bonus };
}

/** +1 crown and +100 kudos for a Show win. */
export function awardWin(profile: Profile): { kudos: number; crowns: number } {
  profile.crowns += 1;
  profile.kudos += KUDOS_WIN;
  return { kudos: KUDOS_WIN, crowns: 1 };
}

export interface ShowFinish {
  won: boolean;
  placement: number;
  daily: boolean;
  date?: string;
}

export interface ShowFinishResult {
  newBest: boolean;
  bestFinish: number | null;
}

/**
 * Career stats for a completed Show. Currency is awarded when each qualification
 * result appears, so a win is not paid twice here.
 */
export function recordShowFinish(profile: Profile, finish: ShowFinish): ShowFinishResult {
  const placement = Math.max(1, Math.floor(finish.placement));
  const previousBest = profile.bestFinish;
  profile.shows += 1;
  if (finish.won) profile.wins += 1;
  profile.bestFinish = previousBest === null ? placement : Math.min(previousBest, placement);
  const newBest = previousBest === null || placement < previousBest;
  if (finish.daily) {
    const date = finish.date ?? todayLabel();
    const previousDaily = profile.daily.date === date ? profile.daily.bestFinish : null;
    profile.daily = {
      date,
      bestFinish: previousDaily === null ? placement : Math.min(previousDaily, placement),
      completed: true,
    };
  }
  return { newBest, bestFinish: profile.bestFinish };
}

export function formatBest(best: number | null): string {
  return best ? `#${best}` : '—';
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}
