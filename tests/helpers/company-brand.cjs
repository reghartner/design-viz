'use strict';

const vm = require('node:vm');
const {readSource,sourceRecords} = require('../../tools/source-loader.cjs');

function companyConfig() {
  const context = {};
  vm.runInNewContext(readSource('company-brand.config.js'), context);
  return JSON.parse(JSON.stringify(context.FLOWVIEW_COMPANY_BRAND_CONFIG));
}

function companyBrand(config = companyConfig()) {
  const image = typeof config.logo === 'string' &&
    /^data:image\/(?:png|jpeg|webp);base64,/i.test(config.logo);
  return {
    app: config.companyName,
    ...(image ? {logoImage:config.logo} : {logo:config.logo}),
    accent: config.primaryColor,
    bg: config.primaryColor,
    fg: config.secondaryColor
  };
}

function validatorSourceWithCompanyConfig(config) {
  return sourceRecords(['validator.js']).map(record => record.file === 'company-brand.config.js'
    ? 'var FLOWVIEW_COMPANY_BRAND_CONFIG = Object.freeze(' + JSON.stringify(config) + ');'
    : record.source).join('\n');
}

module.exports = {companyConfig,companyBrand,validatorSourceWithCompanyConfig};
