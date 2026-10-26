import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { planShow } from '../src/game/levels/coursePlan';

const ROUTE_SEEDS = [20260418, 20365147, 20574605];
const ARENA_SEEDS = { rings: 20260418, spiral: 20365147, gearworks: 20574605 } as const;

function sectionStart(seed: number, id: string, lap = 0): number {
  const plan = planShow(seed);
  const section = plan.course.laps[lap]!.sections.find((entry) => entry.id === id);
  if (!section) throw new Error(`seed ${seed} lap ${lap + 1} has no section ${id}`);
  return section.startZ;
}

test.describe('M3 evidence', () => {
  test('captures the M3 canonical set and samples the render budget', async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    // Menu Daily chip.
    await page.goto('/?seed=20260418');
    await expect(page.locator('#play-show')).toBeVisible();
    await page.evaluate(() => window.__tumble?.setQuality('high'));
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.resolve('docs/evidence/m3-menu-daily.png') });

    // Show Card in the Round intro.
    await page.getByRole('button', { name: 'PLAY SHOW' }).click();
    await expect(page.locator('.round-intro__show-card')).toBeVisible();
    await page.evaluate(() => window.__tumble?.setQuality('high'));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.resolve('docs/evidence/m3-show-card.png') });

    // Remixed results card: finish the Course and let the results overlay show.
    await page.evaluate(() => window.__tumble?.beginRound());
    await page.evaluate(() => window.__tumble?.simulate(1));
    await page.evaluate(() => window.__tumble?.forcePlayerWin());
    await expect(page.locator('.results')).toBeVisible();
    await expect(page.locator('.results__show-card')).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.resolve('docs/evidence/m3-results-show-card.png') });

    // The two new sections, framed from the real Course.
    for (const [id, seed, file] of [
      ['F', 20679334, 'm3-tumbler-tangle.png'],
      ['G', 20365147, 'm3-bounce-bazaar.png'],
    ] as const) {
      await page.goto(`/?seed=${seed}`);
      await expect(page.locator('#play-show')).toBeVisible();
      await page.evaluate(() => window.__tumble?.setQuality('high'));
      await page.getByRole('button', { name: 'PLAY SHOW' }).click();
      await page.evaluate(() => window.__tumble?.beginRound());
      // Let the DOM TUMBLE! stamp finish its beat before framing the section.
      await page.waitForTimeout(2600);
      const z = sectionStart(seed, id);
      await page.evaluate((targetZ) => {
        // Stand on the previous module's landing lip and look down the new
        // section, so its sign, hazard beat and floor are all in frame.
        window.__tumble?.teleport(0, 0.6, targetZ + 3);
        window.__tumble?.simulate(0.6);
        window.__tumble?.lookAt(0, 0.9, targetZ - 10);
      }, z);
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.resolve(`docs/evidence/${file}`) });
    }

    // Three arena plans.
    for (const [arena, seed] of Object.entries(ARENA_SEEDS)) {
      await page.goto(`/?seed=${seed}`);
      await expect(page.locator('#play-show')).toBeVisible();
      await page.evaluate(() => window.__tumble?.setQuality('high'));
      await page.evaluate(() => window.__tumble?.startMode('hexapop'));
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        window.__tumble?.simulate(1.2);
        window.__tumble?.setCamera(0.7, 0.22, 19);
        window.__tumble?.lookAt(0, -1.5, 0);
      });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.resolve(`docs/evidence/m3-arena-${arena}.png`) });
      expect(await page.evaluate(() => window.__tumble?.plan.arena)).toBe(arena);
    }

    // Render-budget samples: three route signatures and three arena plans.
    const samples: Array<Record<string, unknown>> = [];
    for (const seed of ROUTE_SEEDS) {
      await page.goto(`/?seed=${seed}`);
      await expect(page.locator('#play-show')).toBeVisible();
      await page.evaluate(() => window.__tumble?.setQuality('high'));
      await page.evaluate(() => window.__tumble?.startMode('course'));
      await page.waitForTimeout(300);
      await page.evaluate(() => window.__tumble?.simulate(0.5));
      const info = await page.evaluate(() => window.__tumble?.renderInfo);
      const plan = await page.evaluate(() => window.__tumble?.plan);
      samples.push({
        mode: 'course',
        seed,
        signature: plan?.courseSignature,
        arena: plan?.arena,
        calls: info?.calls,
        triangles: info?.triangles,
        geometries: info?.geometries,
        textures: info?.textures,
      });
    }
    for (const [arena, seed] of Object.entries(ARENA_SEEDS)) {
      await page.goto(`/?seed=${seed}`);
      await expect(page.locator('#play-show')).toBeVisible();
      await page.evaluate(() => window.__tumble?.setQuality('high'));
      await page.evaluate(() => window.__tumble?.startMode('hexapop'));
      await page.waitForTimeout(300);
      await page.evaluate(() => window.__tumble?.simulate(0.5));
      const info = await page.evaluate(() => window.__tumble?.renderInfo);
      samples.push({
        mode: 'hexapop',
        seed,
        arena,
        calls: info?.calls,
        triangles: info?.triangles,
        geometries: info?.geometries,
        textures: info?.textures,
      });
    }
    for (const sample of samples) {
      expect(Number(sample.calls)).toBeLessThanOrEqual(320);
      expect(Number(sample.triangles)).toBeLessThanOrEqual(200_000);
    }
    writeFileSync(
      path.resolve('docs/evidence/m3-performance.json'),
      `${JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          viewport: '1440x810',
          quality: 'high',
          host: 'SwiftShader (software rasteriser; not a hardware FPS claim)',
          budget: { calls: 320, triangles: 200_000 },
          samples,
        },
        null,
        2,
      )}\n`,
    );

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
