import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3100);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // e2e never reaches a live provider: fund API calls are mocked in the browser, and the server's provider is off.
    env: { NAV_PROVIDER: 'none', NEXT_TELEMETRY_DISABLED: '1' },
  },
});
