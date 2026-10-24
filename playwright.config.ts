import { defineConfig, devices, chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * Prefer Playwright's managed Chromium (the image has it preinstalled). If that
 * revision is missing, fall back to a system Chromium so the smoke suite still
 * runs in stripped-down environments.
 */
const managed = chromium.executablePath();
const fallbackCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/snap/bin/chromium',
];
const fallback = fallbackCandidates.find(
  (candidate): candidate is string => typeof candidate === 'string' && existsSync(candidate),
);
const executablePath = !existsSync(managed) && fallback ? fallback : undefined;
const launchOptions = {
  ...(executablePath ? { executablePath } : {}),
  args: ['--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 810 },
    launchOptions,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 810 }, launchOptions },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
