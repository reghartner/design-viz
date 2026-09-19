import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'packages/app/e2e-tests',
  testMatch: 'flowview.spec.ts',
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: process.env.BACKSTAGE_URL || 'http://localhost:3000',
    channel: 'chrome',
    viewport: { width: 1700, height: 1200 },
    screenshot: 'only-on-failure',
  },
  reporter: 'list',
  outputDir: '../../.local/browser-results',
});
