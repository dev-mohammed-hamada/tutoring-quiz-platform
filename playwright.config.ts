import { defineConfig } from '@playwright/test';

/**
 * Phone width, against the production shape: one Node process serving both the
 * API and the built SPA on :3000, exactly as the container does. 375x667 is the
 * narrowest phone the centre's students are likely to have — and narrower than
 * Chrome will let a real window go on macOS, which is why this is the only place
 * the layout gets checked at its true target width.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,          // one database, and the one-attempt rule is stateful
  workers: 1,
  reporter: process.env.CI ? 'list' : 'line',
  use: {
    // The full Chromium in headless mode rather than Playwright's stripped
    // headless shell, so the browser under test is the build a person actually
    // browses with. `playwright install chromium` provides both.
    channel: 'chromium',
    baseURL: 'http://localhost:3000',
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
    locale: 'en-JO',
    timezoneId: 'Asia/Amman',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm start',
    url: 'http://localhost:3000/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgres://mohammedhamada@localhost:5432/quiz_e2e' },
  },
});
