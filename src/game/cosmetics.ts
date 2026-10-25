import { RepeatWrapping, SRGBColorSpace, Texture } from 'three';
import { canvasTexture } from './util/toon';

export type ColorId =
  | 'coral'
  | 'mango'
  | 'mint'
  | 'sky'
  | 'grape'
  | 'bubblegum'
  | 'cream'
  | 'midnight';

export type PatternId = 'solid' | 'stripes' | 'dots' | 'zigzag' | 'stars' | 'checker';

export type HatId =
  | 'none'
  | 'propeller'
  | 'crown'
  | 'antenna'
  | 'ducky'
  | 'cone'
  | 'halo'
  | 'flower';

export type EmoteId = 'wave' | 'flex' | 'facepalm' | 'dance';
export type CosmeticKind = 'color' | 'pattern' | 'hat' | 'emote';

export interface ColorDefinition {
  id: ColorId;
  name: string;
  hex: string;
  accent: string;
}

/** Sunrise Carnival palette. The first four are the starter colors. */
export const BEAN_COLORS: readonly ColorDefinition[] = [
  { id: 'coral', name: 'Coral', hex: '#ff6b6b', accent: '#fff6e5' },
  { id: 'mango', name: 'Mango', hex: '#ffc145', accent: '#7a4b13' },
  { id: 'mint', name: 'Mint', hex: '#59d9b0', accent: '#fff6e5' },
  { id: 'sky', name: 'Sky', hex: '#57c7ff', accent: '#fff6e5' },
  { id: 'grape', name: 'Grape', hex: '#a78bfa', accent: '#fff6e5' },
  { id: 'bubblegum', name: 'Bubblegum', hex: '#ff9ecb', accent: '#7b3155' },
  { id: 'cream', name: 'Cream', hex: '#fff6e5', accent: '#ff6b6b' },
  { id: 'midnight', name: 'Midnight', hex: '#3b4a6b', accent: '#ffc145' },
];

export interface BeanLook {
  colorId: ColorId;
  patternId: PatternId;
  hatId: HatId;
  emoteId: EmoteId;
}

export interface CosmeticDefinition<Id extends string = string> {
  id: Id;
  name: string;
  cost: number;
  starter: boolean;
}

/** Six patterns. Solid and Stripes are free; the rest are kudos unlocks. */
export const PATTERN_CATALOGUE: readonly CosmeticDefinition<PatternId>[] = [
  { id: 'solid', name: 'Solid', cost: 0, starter: true },
  { id: 'stripes', name: 'Stripes', cost: 0, starter: true },
  { id: 'dots', name: 'Dots', cost: 50, starter: false },
  { id: 'zigzag', name: 'Zigzag', cost: 80, starter: false },
  { id: 'stars', name: 'Stars', cost: 120, starter: false },
  { id: 'checker', name: 'Checker', cost: 200, starter: false },
];

/** Eight hats. Every hat is built procedurally in Bean.createHat. */
export const HAT_CATALOGUE: readonly CosmeticDefinition<HatId>[] = [
  { id: 'none', name: 'None', cost: 0, starter: true },
  { id: 'propeller', name: 'Propeller', cost: 0, starter: true },
  { id: 'cone', name: 'Cone', cost: 100, starter: false },
  { id: 'antenna', name: 'Antenna', cost: 120, starter: false },
  { id: 'crown', name: 'Tiny Crown', cost: 150, starter: false },
  { id: 'ducky', name: 'Ducky', cost: 180, starter: false },
  { id: 'halo', name: 'Halo', cost: 250, starter: false },
  { id: 'flower', name: 'Wildflower', cost: 400, starter: false },
];

/** Four emotes. The bean animation changes shape per selected emote. */
export const EMOTE_CATALOGUE: readonly CosmeticDefinition<EmoteId>[] = [
  { id: 'wave', name: 'Wave', cost: 0, starter: true },
  { id: 'flex', name: 'Flex', cost: 50, starter: false },
  { id: 'facepalm', name: 'Facepalm', cost: 80, starter: false },
  { id: 'dance', name: 'Dance', cost: 150, starter: false },
];

export function colorCatalogue(): readonly CosmeticDefinition<ColorId>[] {
  return BEAN_COLORS.map((color, index) => ({
    id: color.id,
    name: color.name,
    cost: colorCost(index),
    starter: index < 4,
  }));
}

function colorCost(index: number): number {
  return [0, 0, 0, 0, 60, 80, 120, 150][index] ?? 150;
}

export const DEFAULT_LOOK: BeanLook = {
  colorId: 'coral',
  patternId: 'stripes',
  hatId: 'propeller',
  emoteId: 'wave',
};

export const PLAYER_LOOK: BeanLook = { ...DEFAULT_LOOK };

export function cosmeticKey(kind: CosmeticKind, id: string): string {
  return `${kind}:${id}`;
}

export function starterUnlocks(): string[] {
  return [
    ...colorCatalogue()
      .filter((item) => item.starter)
      .map((item) => cosmeticKey('color', item.id)),
    ...PATTERN_CATALOGUE.filter((item) => item.starter).map((item) => cosmeticKey('pattern', item.id)),
    ...HAT_CATALOGUE.filter((item) => item.starter).map((item) => cosmeticKey('hat', item.id)),
    ...EMOTE_CATALOGUE.filter((item) => item.starter).map((item) => cosmeticKey('emote', item.id)),
  ];
}

export function isCosmeticKind(value: unknown): value is CosmeticKind {
  return value === 'color' || value === 'pattern' || value === 'hat' || value === 'emote';
}

export function isColorId(value: unknown): value is ColorId {
  return typeof value === 'string' && BEAN_COLORS.some((color) => color.id === value);
}

export function isPatternId(value: unknown): value is PatternId {
  return typeof value === 'string' && PATTERN_CATALOGUE.some((item) => item.id === value);
}

export function isHatId(value: unknown): value is HatId {
  return typeof value === 'string' && HAT_CATALOGUE.some((item) => item.id === value);
}

export function isEmoteId(value: unknown): value is EmoteId {
  return typeof value === 'string' && EMOTE_CATALOGUE.some((item) => item.id === value);
}

export function emoteFor(id: EmoteId): CosmeticDefinition<EmoteId> {
  return EMOTE_CATALOGUE.find((item) => item.id === id) ?? EMOTE_CATALOGUE[0]!;
}

export function cosmeticCatalogue(kind: CosmeticKind): readonly CosmeticDefinition[] {
  switch (kind) {
    case 'color':
      return colorCatalogue();
    case 'pattern':
      return PATTERN_CATALOGUE;
    case 'hat':
      return HAT_CATALOGUE;
    case 'emote':
      return EMOTE_CATALOGUE;
  }
}

export function cosmeticItem(kind: CosmeticKind, id: string): CosmeticDefinition | undefined {
  return cosmeticCatalogue(kind).find((item) => item.id === id);
}

export function allCosmetics(): Array<{ kind: CosmeticKind; item: CosmeticDefinition }> {
  const kinds: readonly CosmeticKind[] = ['color', 'pattern', 'hat', 'emote'];
  return kinds.flatMap((kind) => cosmeticCatalogue(kind).map((item) => ({ kind, item })));
}

export function cosmeticName(kind: CosmeticKind, id: string): string {
  return cosmeticItem(kind, id)?.name ?? id;
}

export function colorFor(id: ColorId): ColorDefinition {
  return BEAN_COLORS.find((color) => color.id === id) ?? BEAN_COLORS[0]!;
}

/**
 * Generate the bean's body pattern on a canvas. The resulting texture wraps
 * around the capsule; patterns are designed on a 512 square so the seam is a
 * non-issue from gameplay distance. No image assets, no network requests.
 */
export function createPatternTexture(look: BeanLook): Texture {
  const body = colorFor(look.colorId);
  const accent = body.accent;
  const texture = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = body.hex;
    ctx.fillRect(0, 0, w, h);

    // Soft vertical shading keeps the flat toon colour from feeling dead.
    const shade = ctx.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, 'rgba(255,255,255,0.16)');
    shade.addColorStop(0.55, 'rgba(255,255,255,0)');
    shade.addColorStop(1, 'rgba(36,50,74,0.14)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = accent;
    ctx.strokeStyle = accent;
    switch (look.patternId) {
      case 'stripes': {
        ctx.globalAlpha = 0.9;
        for (let i = 0; i < 6; i += 1) {
          const x = i * 86 + 18;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + 22, 0);
          ctx.lineTo(x + 40, h);
          ctx.lineTo(x + 18, h);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'dots': {
        ctx.globalAlpha = 0.92;
        for (let row = 0; row < 5; row += 1) {
          const offset = row % 2 === 0 ? 0 : 52;
          for (let col = 0; col < 6; col += 1) {
            ctx.beginPath();
            ctx.arc(col * 96 + offset + 28, row * 104 + 52, 19, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
      case 'zigzag': {
        ctx.globalAlpha = 0.92;
        ctx.lineWidth = 24;
        ctx.lineJoin = 'round';
        for (let row = 0; row < 4; row += 1) {
          const y = 80 + row * 118;
          ctx.beginPath();
          for (let x = -20; x <= w + 20; x += 62) {
            const pointY = y + (Math.floor(x / 62) % 2 === 0 ? 0 : 34);
            if (x === -20) ctx.moveTo(x, pointY);
            else ctx.lineTo(x, pointY);
          }
          ctx.stroke();
        }
        break;
      }
      case 'stars': {
        ctx.globalAlpha = 0.92;
        for (let row = 0; row < 3; row += 1) {
          for (let col = 0; col < 4; col += 1) {
            drawStar(ctx, 70 + col * 136 + (row % 2) * 36, 92 + row * 156, 30, 13);
          }
        }
        break;
      }
      case 'checker': {
        ctx.globalAlpha = 0.72;
        const tile = 64;
        for (let y = 0; y < h / tile; y += 1) {
          for (let x = 0; x < w / tile; x += 1) {
            if ((x + y) % 2 === 0) ctx.fillRect(x * tile, y * tile, tile, tile);
          }
        }
        break;
      }
      case 'solid':
      default:
        ctx.globalAlpha = 0.32;
        ctx.fillRect(0, h - 28, w, 28);
        break;
    }
    ctx.globalAlpha = 1;
  });
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  inner: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? radius : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}
