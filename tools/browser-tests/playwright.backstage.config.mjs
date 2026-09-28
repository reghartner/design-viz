import config from './playwright.config.mjs';
export default {...config,globalSetup:'./helpers/prepare-backstage.mjs',reporter:'list',outputDir:'test-results-backstage'};
