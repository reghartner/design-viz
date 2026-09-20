'use strict';
/* Pure source owners only: no engine, inspector or satellite controller. */
const vm = require('node:vm');
const {readSource} = require('../tools/source-loader.cjs');
module.exports = function commandContext(families){
  const context = {URL};
  for (const name of ['document', 'window'])
    Object.defineProperty(context, name, {get(){ throw new Error('Unexpected DOM access: ' + name); }});
  vm.createContext(context);
  for (const name of ['validator.js', 'workbench/source-edit.js', 'workbench/targets.js',
    'workbench/commands/common.js', ...families.map(name => 'workbench/commands/' + name + '.js')])
    vm.runInContext(readSource(name), context);
  return context;
};
