#!/usr/bin/env node
'use strict';
// Explicit one-time setup, never invoked by arrange-spec.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
function preparePayloads(directory=__dirname){
 const root=path.resolve(directory,'../..'),loader=path.join(root,'tools/source-loader.cjs');
 const native=path.join(directory,'generated-native.html'),backend=path.join(root,'tools/canon/generated-runtime.cjs');
 if(fs.existsSync(loader)&&fs.existsSync(path.join(root,'src/source-bundles.json'))){
  // A checkout has no generated files. Always rebuild both from the same trusted
  // sources, including when setup follows a source update; no Python is needed.
  const html=require(path.join(directory,'build-payload.cjs')).payload();
  const runtime=require(loader).moduleSource('backend','cjs');
  fs.mkdirSync(path.dirname(backend),{recursive:true});fs.writeFileSync(backend,runtime);fs.writeFileSync(native,html);
 }else if(!fs.existsSync(native)||!fs.existsSync(backend)){
  throw Error('Authoring kit is missing packaged runtimes; download a current complete kit, or run setup in a complete checkout');
 }
}
function main(){
 preparePayloads();
 for(const [command,args] of [[process.platform==='win32'?'npm.cmd':'npm',['ci','--prefix',__dirname]],
  [process.execPath,[path.join(__dirname,'node_modules/playwright-core/cli.js'),'install','chromium','--only-shell']]]){
  const result=spawnSync(command,args,{stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);
 }
}
module.exports={preparePayloads};
if(require.main===module){try{main();}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}}
