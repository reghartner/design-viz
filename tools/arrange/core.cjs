'use strict';
// Only authoring CLIs use this bootstrap. Production backend bundlers keep the
// static canon/core.cjs dependency; source-free kits already carry that module.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'../..'),corePath=path.join(root,'tools/canon/core.cjs');
let core;
if(fs.existsSync(path.join(root,'src/source-bundles.json'))){
 const source=require('../source-loader.cjs').moduleSource('backend','cjs')+'\nmodule.exports.arrangementLayouts=Object.fromEntries(PanelRegistry.types().map(type=>[type,PanelRegistry.get(type).layout||{}]));\n';
 const compiled=new Module(corePath,module);compiled.filename=corePath;compiled.paths=module.paths;compiled._compile(source,corePath);
 core=compiled.exports;require.cache[corePath]=compiled;
}else{
 core=require('../canon/core.cjs');
 core.arrangementLayouts=require('./layouts.json');
}
module.exports=core;
if(require.main===module)process.stdout.write(JSON.stringify(core.arrangementLayouts));
