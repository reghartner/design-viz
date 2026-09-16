'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context={URL,console};vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../../src/canon.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../../src/validator.js'),'utf8'),context);
// Copy JSON values across the VM boundary only when comparing prototypes.
module.exports=context.FlowCanon;
module.exports.validateSpec=raw=>context.validate(context.normalize(raw));
// Reuse the viewer's pure routing helpers for repository links. Load lazily so
// scanners that only need the portable evidence schema do not load the renderer.
module.exports.viewerRouting=()=>{
  if(!context.sectionReferences)vm.runInContext(fs.readFileSync(path.join(__dirname,'../../src/engine.js'),'utf8'),context);
  return {blocksOf:context.blocksOf,sectionReferences:context.sectionReferences,buildHash:context.buildHash,
    diagramPathList:context.diagramPathList,stepKeys:context.stepKeys,stepFailures:context.stepFailures,stepReference:context.stepReference};
};
