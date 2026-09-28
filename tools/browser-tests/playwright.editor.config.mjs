import config from './playwright.config.mjs';
export default {...config,globalSetup:'./helpers/prepare-editor.mjs',reporter:'list',outputDir:'test-results-editor'};
