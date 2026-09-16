'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context={URL,console};vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../../src/canon.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../../src/validator.js'),'utf8'),context);
// Copy JSON values across the VM boundary only when comparing prototypes.
module.exports=context.FlowCanon;
module.exports.validateSpec=raw=>context.validate(context.normalize(raw));
