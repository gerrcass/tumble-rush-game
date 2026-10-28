/**
 * The M4 twist contract.
 *
 * A twist is a seeded **qualifier rule**: it changes how the Course and
 * Hexapop move, while the Crown Climb stays classic (ADR 0007). This module is
 * pure: no Three.js, DOM, Match or Level import, so the plan, the physics, the
 * UI and the gate can all read one value without a cycle.
 *
 * `CLASSIC_RULES` is the identity rule set. Every scale is 1 and the clocks are
 * the M3 constants, so a classic Round reproduces the existing physics exactly.
 */
export type TwistId = 'moon' | 'slippery' | 'rush';

export interface TwistRules {
  id: TwistId | 'classic';
  gravityScale: number;
  jumpScale: number;
  airControlScale: number;
  airDragScale: number;
  accelScale: number;
  frictionScale: number;
  hazardSpeedScale: number;
  courseTimeLimit: number;
  hexTimeLimit: number;
  hexSugarRush: number;
}

export interface TwistPlan {
  id: TwistId;
  /** Full display name, e.g. MOON GRAVITY. */
  label: string;
  /** Compact HUD name, e.g. MOON. */
  short: string;
  /** One-line rule, e.g. Low gravity. Float your jumps. */
  blurb: string;
  /** UI accent, never the only signal. */
  accent: number;
  rules: TwistRules;
}

/** The exact M3 rule set. The Crown Climb, Training Deck and menu use this. */
export const CLASSIC_RULES: TwistRules = Object.freeze({
  id: 'classic',
  gravityScale: 1,
  jumpScale: 1,
  airControlScale: 1,
  airDragScale: 1,
  accelScale: 1,
  frictionScale: 1,
  hazardSpeedScale: 1,
  courseTimeLimit: 120,
  hexTimeLimit: 49.9,
  hexSugarRush: 45,
});

const MOON_RULES: TwistRules = Object.freeze({
  ...CLASSIC_RULES,
  id: 'moon',
  gravityScale: 0.78,
  jumpScale: 0.9,
  airControlScale: 1.15,
  airDragScale: 0.9,
});

const SLIPPERY_RULES: TwistRules = Object.freeze({
  ...CLASSIC_RULES,
  id: 'slippery',
  frictionScale: 0.55,
  accelScale: 0.9,
  airDragScale: 0.85,
});

const RUSH_RULES: TwistRules = Object.freeze({
  ...CLASSIC_RULES,
  id: 'rush',
  hazardSpeedScale: 1.1,
  courseTimeLimit: 105,
  hexTimeLimit: 42.9,
  hexSugarRush: 38,
});

export const TWISTS: Readonly<Record<TwistId, TwistPlan>> = Object.freeze({
  moon: Object.freeze({
    id: 'moon',
    label: 'MOON GRAVITY',
    short: 'MOON',
    blurb: 'Low gravity. Float your jumps.',
    accent: 0x57c7ff,
    rules: MOON_RULES,
  }),
  slippery: Object.freeze({
    id: 'slippery',
    label: 'SLIPPERY',
    short: 'SLIP',
    blurb: 'Less grip. Longer slides.',
    accent: 0x59d9b0,
    rules: SLIPPERY_RULES,
  }),
  rush: Object.freeze({
    id: 'rush',
    label: 'RUSH HOUR',
    short: 'RUSH',
    blurb: 'Faster hazards. Earlier Sugar Rush.',
    accent: 0xff6b6b,
    rules: RUSH_RULES,
  }),
});

/** Stable order used by the selection and the coverage checks. */
export const TWIST_IDS: readonly TwistId[] = Object.freeze(['moon', 'slippery', 'rush']);

/**
 * Salt for the independent twist hash. This is deliberately not the route or
 * arena RNG seed: selecting the twist must not shift the M3 route/arena draw.
 */
export const TWIST_SALT = 0x74776973;

/** A 32-bit integer avalanche hash. Deterministic for every input seed. */
export function twistHash(seed: number): number {
  let value = ((seed >>> 0) ^ TWIST_SALT) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return value >>> 0;
}

/** The seeded twist for a show seed. Independent of the route/arena draw. */
export function twistForSeed(seed: number): TwistPlan {
  return TWISTS[TWIST_IDS[twistHash(seed) % TWIST_IDS.length]!];
}

/**
 * The rules for one Level mode. Course and Hexapop use the show twist; the
 * Crown, Training Deck and menu previews use the classic rule set.
 */
export function twistRulesFor(
  mode: 'course' | 'hexapop' | 'crown-climb' | 'training',
  plan: TwistPlan,
): TwistRules {
  return mode === 'course' || mode === 'hexapop' ? plan.rules : CLASSIC_RULES;
}
