import {defineConfig} from '@playwright/test';
// Focused static-page contracts; no localhost helper or host integration fixtures.
export default defineConfig({testDir:'./tests',testMatch:'folder-agent.spec.mjs',workers:1,retries:0,
  timeout:45000,expect:{timeout:10000},reporter:'list',
  use:{browserName:'chromium',headless:true,viewport:{width:1440,height:1000},reducedMotion:'reduce',
    screenshot:'only-on-failure',trace:'retain-on-failure'}});
