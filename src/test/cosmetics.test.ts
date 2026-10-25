import { describe, expect, it } from 'vitest';
import { Bean } from '../game/player/Bean';
import {
  BEAN_COLORS,
  DEFAULT_LOOK,
  EMOTE_CATALOGUE,
  HAT_CATALOGUE,
  PATTERN_CATALOGUE,
  colorCatalogue,
  cosmeticCatalogue,
  cosmeticItem,
  cosmeticKey,
  cosmeticName,
  createPatternTexture,
  starterUnlocks,
} from '../game/cosmetics';

describe('cosmetics catalog', () => {
  it('has exactly 8 colors, 6 patterns, 8 hats and 4 emotes', () => {
    expect(BEAN_COLORS).toHaveLength(8);
    expect(colorCatalogue()).toHaveLength(8);
    expect(PATTERN_CATALOGUE).toHaveLength(6);
    expect(HAT_CATALOGUE).toHaveLength(8);
    expect(EMOTE_CATALOGUE).toHaveLength(4);
    for (const kind of ['color', 'pattern', 'hat', 'emote'] as const) {
      const ids = cosmeticCatalogue(kind).map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('unlocks the documented starter set for free', () => {
    const starters = starterUnlocks();
    expect(starters.filter((key) => key.startsWith('color:'))).toHaveLength(4);
    expect(starters.filter((key) => key.startsWith('pattern:'))).toHaveLength(2);
    expect(starters.filter((key) => key.startsWith('hat:'))).toHaveLength(2);
    expect(starters.filter((key) => key.startsWith('emote:'))).toHaveLength(1);
    for (const key of starters) {
      const [kind, id] = key.split(':') as ['color' | 'pattern' | 'hat' | 'emote', string];
      expect(cosmeticItem(kind, id)?.starter).toBe(true);
      expect(cosmeticItem(kind, id)?.cost).toBe(0);
    }
  });

  it('gives every non-starter a sensible kudos price and a display name', () => {
    for (const { kind, item } of [
      ...colorCatalogue().map((entry) => ({ kind: 'color' as const, item: entry })),
      ...PATTERN_CATALOGUE.map((entry) => ({ kind: 'pattern' as const, item: entry })),
      ...HAT_CATALOGUE.map((entry) => ({ kind: 'hat' as const, item: entry })),
      ...EMOTE_CATALOGUE.map((entry) => ({ kind: 'emote' as const, item: entry })),
    ]) {
      expect(item.name.length).toBeGreaterThan(1);
      expect(item.cost).toBeGreaterThanOrEqual(0);
      expect(item.cost).toBeLessThanOrEqual(kind === 'hat' ? 400 : kind === 'pattern' ? 200 : 150);
      if (!item.starter) expect(item.cost).toBeGreaterThan(0);
      expect(cosmeticName(kind, item.id)).toBe(item.name);
      expect(cosmeticKey(kind, item.id)).toBe(`${kind}:${item.id}`);
    }
  });

  it('builds a pattern texture for every pattern', () => {
    for (const pattern of PATTERN_CATALOGUE) {
      const texture = createPatternTexture({ ...DEFAULT_LOOK, patternId: pattern.id });
      expect(texture.image).toBeTruthy();
      texture.dispose();
    }
  });

  it('constructs and disposes a bean for every color, pattern, hat and emote', () => {
    const looks = [
      ...BEAN_COLORS.map((color) => ({ ...DEFAULT_LOOK, colorId: color.id })),
      ...PATTERN_CATALOGUE.map((pattern) => ({ ...DEFAULT_LOOK, patternId: pattern.id })),
      ...HAT_CATALOGUE.map((hat) => ({ ...DEFAULT_LOOK, hatId: hat.id })),
      ...EMOTE_CATALOGUE.map((emote) => ({ ...DEFAULT_LOOK, emoteId: emote.id })),
    ];
    for (const look of looks) {
      const bean = new Bean({ look, outline: true, name: 'Test' });
      expect(bean.group.children.length).toBeGreaterThan(2);
      expect(bean.look.colorId).toBe(look.colorId);
      bean.dispose();
    }
  });
});
