import config from './playwright.config.mjs';
// Offline review UI only: no product build or host integration setup is needed.
export default {...config,globalSetup:undefined,reporter:'list',outputDir:'test-results-review'};
