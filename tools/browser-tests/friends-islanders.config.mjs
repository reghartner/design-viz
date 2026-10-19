import base from './playwright.config.mjs';
export default {...base,globalSetup:'./helpers/prepare-friends.mjs',testMatch:['friends-islanders.spec.mjs','skin-precedence.spec.mjs'],use:{...base.use,viewport:{width:1440,height:1000}}};
