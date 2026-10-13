import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './client/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5000',
    trace: 'on-first-retry',
    acceptDownloads: true,
    launchOptions: {
      // Let the Web Audio context resume without a user gesture so the
      // recorder's start-up path runs in headless CI.
      args: ['--autoplay-policy=no-user-gesture-required'],
    },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5000',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
