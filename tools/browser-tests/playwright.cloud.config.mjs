import config from './playwright.config.mjs';
export default {...config,globalSetup:'./helpers/prepare-cloud.mjs',testMatch:'cloud-projects.spec.mjs'};
