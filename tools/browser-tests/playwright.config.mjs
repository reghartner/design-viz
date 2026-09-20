import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests',globalSetup:'./helpers/prepare.mjs',
  fullyParallel:false,workers:1,retries:0,forbidOnly:true,
  timeout:45000,expect:{timeout:10000},
  reporter:[['list'],['html',{open:'never'}],['json',{outputFile:'report.json'}]],
  use:{browserName:'chromium',headless:true,viewport:{width:1800,height:1200},
    reducedMotion:'reduce',locale:'en-US',timezoneId:'UTC',
    screenshot:'only-on-failure',trace:'retain-on-failure',actionTimeout:10000},
});
