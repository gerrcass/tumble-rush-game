import { Rng } from '../Rng';

/**
 * Pure course grammar for Sunrise Scramble.
 *
 * The Course builds the exact same sections every run; the seed only varies
 * authored parameters inside that grammar. Keeping the plan pure makes the
 * seed contract testable without a WebGL context, and gives phase-three bots a
 * stable description of the route.
 */
export type CourseSectionId = 'A' | 'B' | 'C' | 'D' | 'E';

export interface CourseSectionPlan {
  id: CourseSectionId;
  name: string;
  startZ: number;
  endZ: number;
  accent: number;
  laneScale: number;
  hazardPhase: number;
}

export interface CourseShortcutPlan {
  enabled: boolean;
  side: -1 | 1;
  z: number;
  width: number;
}

/**
 * M2 pacing: the 174 u lap alone cannot last 45–90 s once the pack runs at a
 * humanized 0.62–0.78 of max speed, so Sunrise Scramble runs the same five
 * authored sections twice. Lap 2 is a pure translation of the existing grammar
 * (no new section, collider recipe, or art direction).
 */
export const COURSE_LAP_COUNT = 2;
/** Lap 2 starts just beyond lap 1's raised finish/lap gate. */
export const COURSE_LAP_OFFSET_Z = -184;
/** Lap 2 sits on top of lap 1's finish deck so the lap gate is a real surface. */
export const COURSE_LAP_OFFSET_Y = 4.5;

export interface CoursePlan {
  seed: number;
  startZ: number;
  /** End of a single lap's section E, in local (lap 1) coordinates. */
  finishZ: number;
  /** Total authored length of one lap in world units (160–196). */
  length: number;
  /** Number of times the five-section grammar is authored. */
  lapCount: number;
  lapOffsetZ: number;
  lapOffsetY: number;
  /** Final finish-gate z after every lap; `finishZ + lapOffsetZ * (laps-1)`. */
  courseFinishZ: number;
  /** Start-to-final-gate length in world units (one lap times lapCount). */
  courseLength: number;
  laneScale: number;
  platformOffset: number;
  hurdleHeight: number;
  sweeperSpeed: number;
  pusherSpeed: number;
  conveyorSpeed: number;
  finishWidth: number;
  shortcut: CourseShortcutPlan;
  propColors: readonly number[];
  crowdArrangement: readonly number[];
  sections: readonly CourseSectionPlan[];
}

const SECTION_LAYOUT: ReadonlyArray<{
  id: CourseSectionId;
  name: string;
  startZ: number;
  endZ: number;
  accent: number;
}> = [
  { id: 'A', name: 'BUNTING RUN', startZ: 18, endZ: -18, accent: 0xffc145 },
  { id: 'B', name: 'WHIRLYBIRD ALLEY', startZ: -18, endZ: -56, accent: 0x59d9b0 },
  { id: 'C', name: 'JELLY JUMPS', startZ: -56, endZ: -96, accent: 0x57c7ff },
  { id: 'D', name: 'SLIME SLIDE', startZ: -96, endZ: -132, accent: 0xa78bfa },
  { id: 'E', name: 'CROWN GATE', startZ: -132, endZ: -156, accent: 0xff6b6b },
];

const COLOR_POOL = [0xff6b6b, 0xffc145, 0x59d9b0, 0x57c7ff, 0xa78bfa, 0xff9ecb] as const;

export function planCourse(seed: number): CoursePlan {
  const rng = new Rng((seed ^ 0xc0a55e) >>> 0);
  const laneScale = rng.float(0.85, 1.15);
  const platformOffset = rng.float(-0.75, 0.75);
  const hurdleHeight = rng.float(0.5, 0.72);
  const sweeperSpeed = rng.float(0.75, 1.15) * (rng.chance(0.5) ? 1 : -1);
  const pusherSpeed = rng.float(1.9, 2.8);
  const conveyorSpeed = rng.float(2.2, 3.4);
  const finishWidth = rng.float(7.5, 9.5);
  const sections = SECTION_LAYOUT.map((section, index) => ({
    ...section,
    laneScale: laneScale * rng.float(0.94, 1.06),
    hazardPhase: rng.float(0, Math.PI * 2) + index * 0.7,
  }));
  const shortcutSide: -1 | 1 = rng.chance(0.5) ? -1 : 1;
  const shortcut: CourseShortcutPlan = {
    enabled: rng.chance(0.58),
    side: shortcutSide,
    z: rng.float(-120, -108),
    width: rng.float(1.15, 1.7),
  };
  const propColors = [0, 1, 2, 3, 4].map(() => rng.pick(COLOR_POOL));
  const crowdArrangement = Array.from({ length: 8 }, () => rng.float(0, 1));
  // The authored finish deck/gate, not the section envelope. Keep this in
  // lockstep with Course.finishPosition; METRICS and README quote the same
  // 174 u lap / 358 u two-lap lengths.
  const finishZ = -156;
  const courseFinishZ = finishZ + COURSE_LAP_OFFSET_Z * (COURSE_LAP_COUNT - 1);

  return {
    seed: seed >>> 0,
    startZ: 18,
    finishZ,
    length: 18 - finishZ,
    lapCount: COURSE_LAP_COUNT,
    lapOffsetZ: COURSE_LAP_OFFSET_Z,
    lapOffsetY: COURSE_LAP_OFFSET_Y,
    courseFinishZ,
    courseLength: 18 - courseFinishZ,
    laneScale,
    platformOffset,
    hurdleHeight,
    sweeperSpeed,
    pusherSpeed,
    conveyorSpeed,
    finishWidth,
    shortcut,
    propColors,
    crowdArrangement,
    sections,
  };
}

/** A short human-readable list of the seeded choices (evidence / debug). */
export function describeCoursePlan(plan: CoursePlan): string[] {
  return [
    `length ${plan.length.toFixed(0)}u`,
    `lane ${(plan.laneScale * 100).toFixed(0)}%`,
    `lane offset ${plan.platformOffset.toFixed(2)}`,
    `hurdle ${plan.hurdleHeight.toFixed(2)}u`,
    `sweeper ${plan.sweeperSpeed.toFixed(2)}`,
    `pusher ${plan.pusherSpeed.toFixed(2)}`,
    `conveyor ${plan.conveyorSpeed.toFixed(2)}`,
    `finish width ${plan.finishWidth.toFixed(1)}u`,
    plan.shortcut.enabled
      ? `shortcut ${plan.shortcut.side === 1 ? 'right' : 'left'} @ ${plan.shortcut.z.toFixed(0)}`
      : 'shortcut closed',
    `colors ${plan.propColors.map((color) => color.toString(16).padStart(6, '0')).join('/')}`,
  ];
}
