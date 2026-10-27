import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests.
 * - Set PW_BASE_URL to test a deployed site instead of a local production build.
 * - Set PW_WEBKIT=1 to add a real WebKit (Safari engine) iPhone project when the
 *   WebKit browser is installed (`npx playwright install webkit`). Without it the
 *   iPhone project emulates an iPhone 13 viewport, touch, and user agent in Chromium.
 */
const baseURL = process.env.PW_BASE_URL ?? 'http://localhost:4173';
const iphone = devices['iPhone 13'];

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL, trace: 'off' },
  webServer: process.env.PW_BASE_URL
    ? undefined
    : { command: 'npm run build && npx vite preview --port 4173 --strictPort', url: baseURL, reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'iphone-emulated', use: { ...iphone, browserName: 'chromium', defaultBrowserType: 'chromium' } },
    ...(process.env.PW_WEBKIT ? [{ name: 'iphone-webkit', use: { ...iphone } }] : []),
  ],
});
