import { Rng } from '../Rng';
import {
  ARENA_LABELS,
  ARENA_PLAN_IDS,
  arenaTileCount,
  type ArenaPlanId,
} from './arenaPlan';

/**
 * Pure show plan for Sunrise Scramble + Hexapop.
 *
 * One function decides the two Course routes, every module's world position,
 * the Hexapop arena plan, and the labels the UI prints. The Course level, the
 * Hexapop level, the Show Card and the variety gate all consume this plan, so
 * the card can never disagree with the floor under the player's feet.
 *
 * No Three.js, DOM or match dependency. The same seed always produces the same
 * plan.
 */
export type CourseSectionId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
export type MiddleSectionId = 'B' | 'C' | 'D' | 'F' | 'G';

export interface CourseSectionModule {
  id: CourseSectionId;
  name: string;
  /** Difficulty weight. Start/finish bookends are not weighted. */
  weight: number;
  /** Authored route length in world units, including the 2 u module lead-in. */
  length: number;
  accent: number;
  bookend: boolean;
}

/**
 * The module contract. `length` is the pitch from this module's start cursor to
 * the next module's start; the first 2 u are the route planner's inter-module
 * gap. Every middle is height-neutral at entry and exit (y 0), so any legal
 * order is playable by the same controller and bots.
 */
export const COURSE_MODULES: Readonly<Record<CourseSectionId, CourseSectionModule>> = {
  A: { id: 'A', name: 'BUNTING RUN', weight: 0, length: 36, accent: 0xffc145, bookend: true },
  B: { id: 'B', name: 'WHIRLYBIRD ALLEY', weight: 2, length: 38, accent: 0x59d9b0, bookend: false },
  C: { id: 'C', name: 'JELLY JUMPS', weight: 2, length: 40, accent: 0x57c7ff, bookend: false },
  D: { id: 'D', name: 'SLIME SLIDE', weight: 3, length: 36, accent: 0xa78bfa, bookend: false },
  E: { id: 'E', name: 'CROWN GATE', weight: 0, length: 24, accent: 0xff6b6b, bookend: true },
  F: { id: 'F', name: 'TUMBLER TANGLE', weight: 3, length: 38, accent: 0xff9ecb, bookend: false },
  G: { id: 'G', name: 'BOUNCE BAZAAR', weight: 2, length: 37, accent: 0xffc145, bookend: false },
};

export const MIDDLE_SECTION_IDS: readonly MiddleSectionId[] = ['B', 'C', 'D', 'F', 'G'];

/** The raised finish/lap deck height. */
export const COURSE_FINISH_DECK_Y = 4.5;
/** Start-to-lap-gate gap between lap 1 and lap 2 (the connector deck). */
export const COURSE_CONNECTOR_GAP = 10;
/** Each module opens with this much empty route before its first platform. */
export const COURSE_MODULE_GAP = 2;
export const COURSE_LAP_COUNT = 2;

export interface CourseSectionPlan {
  id: CourseSectionId;
  name: string;
  lap: number;
  /** World-space z where the module starts (the planner's cursor). */
  startZ: number;
  /** World-space z where the module ends (its exit boundary). */
  endZ: number;
  accent: number;
  laneScale: number;
  hazardPhase: number;
}

export interface CourseLapPlan {
  lap: number;
  /** The three middle modules in order, between the A and E bookends. */
  route: readonly MiddleSectionId[];
  /** Sum of the three middle difficulty weights (6–8). */
  difficulty: number;
  startZ: number;
  /** World-space z of the lap gate / finish gate at the end of this lap. */
  finishZ: number;
  /** Authored start-to-finish length of this lap. */
  length: number;
  /** World-space lap offset from the show's start deck. */
  offsetZ: number;
  offsetY: number;
  sections: readonly CourseSectionPlan[];
}

export interface CourseShortcutPlan {
  enabled: boolean;
  side: -1 | 1;
  /** Section-D-local z. Relocates with the module. */
  localZ: number;
  /** Lap-1 world z, for evidence and backwards-compatible debug output. */
  z: number;
  width: number;
}

export interface CoursePlan {
  seed: number;
  startZ: number;
  /** End of lap 1's section E (the lap gate). */
  finishZ: number;
  /** Authored length of one lap (165–185). */
  length: number;
  lapCount: number;
  /** Lap 2's world offset from lap 1. */
  lapOffsetZ: number;
  lapOffsetY: number;
  /** Final finish-gate z after lap 2. */
  courseFinishZ: number;
  /** Start-to-final-gate length (330–370). */
  courseLength: number;
  laps: readonly CourseLapPlan[];
  /** Flat section list, lap 1 then lap 2, in route order. */
  sections: readonly CourseSectionPlan[];
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
}

export interface ShowPlan {
  seed: number;
  course: CoursePlan;
  arena: ArenaPlanId;
  arenaLabel: string;
  arenaTileCount: number;
  /** `B-D-G/C-F-G` — the two lap routes, stable and human-readable. */
  courseSignature: string;
  /** Structured lap routes; the UI/gate do not need to parse the label. */
  lapRoutes: readonly [readonly MiddleSectionId[], readonly MiddleSectionId[]];
  /** `B-D-G / C-F-G` — the compact card line. */
  routeLabel: string;
  /** `B-D-G/C-F-G · SPIRAL` — the show identity. */
  signature: string;
  /** `COURSE B-D-G / C-F-G · ARENA SPIRAL` — the one-line Show Card. */
  label: string;
}

interface RouteOption {
  route: readonly MiddleSectionId[];
  difficulty: number;
}

function routeOptions(): RouteOption[] {
  const options: RouteOption[] = [];
  for (let a = 0; a < MIDDLE_SECTION_IDS.length; a += 1) {
    for (let b = a + 1; b < MIDDLE_SECTION_IDS.length; b += 1) {
      for (let c = b + 1; c < MIDDLE_SECTION_IDS.length; c += 1) {
        const route = [
          MIDDLE_SECTION_IDS[a]!,
          MIDDLE_SECTION_IDS[b]!,
          MIDDLE_SECTION_IDS[c]!,
        ] as const;
        const difficulty = route.reduce((sum, id) => sum + COURSE_MODULES[id].weight, 0);
        // The authored weights make every three-middle route legal (6–8), but
        // keep the filter explicit: a future module must not silently create a
        // route outside the fairness band.
        if (difficulty >= 6 && difficulty <= 8) options.push({ route, difficulty });
      }
    }
  }
  return options;
}

const ROUTE_OPTIONS = routeOptions();

const COLOR_POOL = [0xff6b6b, 0xffc145, 0x59d9b0, 0x57c7ff, 0xa78bfa, 0xff9ecb] as const;

/**
 * Pick two legal routes. Distinct three-module sets can share at most two
 * middles, so requiring the two route lists to differ is the whole overlap rule.
 */
function pickRoutes(rng: Rng): [RouteOption, RouteOption] {
  const first = rng.pick(ROUTE_OPTIONS);
  const firstKey = first.route.join('');
  const rest = ROUTE_OPTIONS.filter((option) => option.route.join('') !== firstKey);
  const second = rng.pick(rest);
  return [first, second];
}

function buildLap(
  lap: number,
  option: RouteOption,
  startZ: number,
  offsetY: number,
  params: Readonly<Record<CourseSectionId, { laneScale: number; hazardPhase: number }>>,
): CourseLapPlan {
  const sequence: CourseSectionId[] = ['A', ...option.route, 'E'];
  const sections: CourseSectionPlan[] = [];
  let cursor = startZ;
  for (const id of sequence) {
    const module = COURSE_MODULES[id];
    const moduleParams = params[id];
    sections.push({
      id,
      name: module.name,
      lap,
      startZ: cursor,
      endZ: cursor - module.length,
      accent: module.accent,
      laneScale: moduleParams.laneScale,
      hazardPhase: moduleParams.hazardPhase,
    });
    cursor -= module.length;
  }
  return {
    lap,
    route: option.route,
    difficulty: option.difficulty,
    startZ,
    finishZ: cursor,
    length: startZ - cursor,
    offsetZ: startZ - 18,
    offsetY,
    sections,
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** The full show plan. Pure, deterministic, and shared by every consumer. */
export function planShow(seed: number): ShowPlan {
  const normalizedSeed = seed >>> 0;
  const rng = new Rng((normalizedSeed ^ 0xc0a55e) >>> 0);
  const laneScale = rng.float(0.85, 1.15);
  const platformOffset = rng.float(-0.75, 0.75);
  const hurdleHeight = rng.float(0.5, 0.72);
  const sweeperSpeed = rng.float(0.75, 1.15) * (rng.chance(0.5) ? 1 : -1);
  const pusherSpeed = rng.float(1.9, 2.8);
  const conveyorSpeed = rng.float(2.2, 3.4);
  const finishWidth = rng.float(7.5, 9.5);

  // Keep the historical A–E parameter draw order: a seed's lane widths, hazard
  // phases and prop colours stay comparable with the M2 baseline. F/G use a
  // fork so adding sections cannot shift the existing values.
  const params = {} as Record<CourseSectionId, { laneScale: number; hazardPhase: number }>;
  (['A', 'B', 'C', 'D', 'E'] as const).forEach((id, index) => {
    params[id] = {
      laneScale: laneScale * rng.float(0.94, 1.06),
      hazardPhase: rng.float(0, Math.PI * 2) + index * 0.7,
    };
  });
  const extra = rng.fork(29);
  (['F', 'G'] as const).forEach((id, index) => {
    params[id] = {
      laneScale: laneScale * extra.float(0.94, 1.06),
      hazardPhase: extra.float(0, Math.PI * 2) + (index + 5) * 0.7,
    };
  });

  const shortcutSide: -1 | 1 = rng.chance(0.5) ? -1 : 1;
  const shortcutLocalZ = rng.float(-24, -12);
  const propColors = [0, 1, 2, 3, 4].map(() => rng.pick(COLOR_POOL));
  const crowdArrangement = Array.from({ length: 8 }, () => rng.float(0, 1));

  const routeRng = new Rng((normalizedSeed ^ 0x5eedc0de) >>> 0);
  const [firstRoute, secondRoute] = pickRoutes(routeRng);
  const arena = routeRng.pick(ARENA_PLAN_IDS);
  const arenaName = ARENA_LABELS[arena];

  const startZ = 18;
  const lapOne = buildLap(0, firstRoute, startZ, 0, params);
  const lapTwoStart = lapOne.finishZ - COURSE_CONNECTOR_GAP;
  const lapTwo = buildLap(
    1,
    secondRoute,
    lapTwoStart,
    // Lap 2 sits on top of lap 1's finish deck so the lap gate is a real surface.
    COURSE_FINISH_DECK_Y,
    params,
  );
  const courseFinishZ = lapTwo.finishZ;
  const courseLength = startZ - courseFinishZ;
  const firstD = lapOne.sections.find((section) => section.id === 'D');
  const shortcut: CourseShortcutPlan = {
    enabled: rng.chance(0.58),
    side: shortcutSide,
    localZ: shortcutLocalZ,
    z: (firstD?.startZ ?? -96) + shortcutLocalZ,
    width: rng.float(1.15, 1.7),
  };

  const course: CoursePlan = {
    seed: normalizedSeed,
    startZ,
    finishZ: lapOne.finishZ,
    length: lapOne.length,
    lapCount: COURSE_LAP_COUNT,
    lapOffsetZ: lapTwoStart - startZ,
    lapOffsetY: COURSE_FINISH_DECK_Y,
    courseFinishZ,
    courseLength,
    laps: [lapOne, lapTwo],
    sections: [...lapOne.sections, ...lapTwo.sections],
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
  };

  const courseSignature = `${firstRoute.route.join('-')}/${secondRoute.route.join('-')}`;
  const routeLabel = `${firstRoute.route.join('-')} / ${secondRoute.route.join('-')}`;
  return {
    seed: normalizedSeed,
    course,
    arena,
    arenaLabel: arenaName,
    arenaTileCount: arenaTileCount(arena),
    courseSignature,
    lapRoutes: [firstRoute.route, secondRoute.route],
    routeLabel,
    signature: `${courseSignature} · ${arenaName}`,
    label: `COURSE ${routeLabel} · ARENA ${arenaName}`,
  };
}

/** Backwards-compatible Course-only entry point. */
export function planCourse(seed: number): CoursePlan {
  return planShow(seed).course;
}

/** A short human-readable list of the seeded choices (evidence / debug). */
export function describeCoursePlan(plan: CoursePlan): string[] {
  return [
    `length ${plan.length.toFixed(0)}u (course ${plan.courseLength.toFixed(0)}u)`,
    `routes ${plan.laps.map((lap) => lap.route.join('-')).join(' / ')}`,
    `lane ${(plan.laneScale * 100).toFixed(0)}%`,
    `lane offset ${plan.platformOffset.toFixed(2)}`,
    `hurdle ${plan.hurdleHeight.toFixed(2)}u`,
    `sweeper ${plan.sweeperSpeed.toFixed(2)}`,
    `pusher ${plan.pusherSpeed.toFixed(2)}`,
    `conveyor ${plan.conveyorSpeed.toFixed(2)}`,
    `finish width ${plan.finishWidth.toFixed(1)}u`,
    plan.shortcut.enabled
      ? `shortcut ${plan.shortcut.side === 1 ? 'right' : 'left'} @ ${plan.shortcut.localZ.toFixed(0)}`
      : 'shortcut closed',
    `colors ${plan.propColors.map((color) => color.toString(16).padStart(6, '0')).join('/')}`,
    `lap 2 offset ${round3(plan.lapOffsetZ)}u / ${round3(plan.lapOffsetY)}u`,
  ];
}
