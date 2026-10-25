import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Honest performance evidence. The CI/dev container has no GPU, so Chromium
 * falls back to SwiftShader software rasterisation; the resulting number is
 * recorded rather than asserted against the 55 fps hardware target.
 */
test('measures average FPS in a full show at 1440x810', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/?seed=20260418');
  await page.getByRole('button', { name: 'PLAY SHOW' }).click();
  await expect(page.locator('.round-intro')).toBeVisible();
  await page.evaluate(() => {
    window.__tumble?.beginRound();
    window.__tumble?.setQuality('high');
  });
  await expect(page.locator('#hud')).toBeVisible();
  await page.waitForTimeout(1200);

  const sample = async (seconds: number): Promise<{ avgFps: number; frames: number; avgMs: number; p95Ms: number }> =>
    page.evaluate(async (duration) => {
      const deltas: number[] = [];
      let last = performance.now();
      return await new Promise((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          deltas.push(now - last);
          last = now;
          if (now - start >= duration * 1000) {
            const usable = deltas.slice(2).sort((a, b) => a - b);
            const average = usable.reduce((sum, value) => sum + value, 0) / usable.length;
            resolve({
              avgFps: Number((1000 / average).toFixed(1)),
              frames: usable.length,
              avgMs: Number(average.toFixed(1)),
              p95Ms: Number(usable[Math.floor(usable.length * 0.95)]?.toFixed(1) ?? 0),
            });
            return;
          }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    }, seconds);

  const high = await sample(20);
  await page.evaluate(() => window.__tumble?.setQuality('low'));
  await page.waitForTimeout(600);
  const low = await sample(8);

  const report = {
    viewport: '1440x810',
    showSeed: '20260418',
    renderer: await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const gl = canvas?.getContext('webgl2');
      const extension = gl?.getExtension('WEBGL_debug_renderer_info');
      return extension
        ? String(gl?.getParameter(extension.UNMASKED_RENDERER_WEBGL))
        : 'unknown';
    }),
    high,
    low,
    note: 'Software WebGL (no /dev/dri in this container). Hardware target is 55 fps; this environment cannot represent it.',
  };
  writeFileSync(
    path.resolve('docs/evidence/phase4-fps.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(`FPS report: ${JSON.stringify(report)}`);
  expect(high.frames).toBeGreaterThan(0);
  expect(low.frames).toBeGreaterThan(0);
  expect(errors, errors.join('\n')).toEqual([]);
});
