'use strict';
// Development tests only. This native renderer payload is never included in authoring kits.
const fs=require('node:fs'),path=require('node:path');
function payload({isolatedHost=false,fullDocument=false}={}){
 const {entrypoint,entrypointAssets,fontCss}=require('../../source-loader.cjs');
 const native=entrypoint('native'),assets=entrypointAssets(fullDocument?'standalone':'native');
 const css=fontCss('all')+'\n'+assets.styles.map(a=>a.source).join('\n')+(isolatedHost?'\n#view .docview,#view.docview{max-width:none!important;padding:20px!important}.doc-sec{padding-left:20px!important;padding-right:20px!important;border-left:0!important;border-right:0!important}':'');
 const source=native.body+'\n'+fs.readFileSync(path.join(__dirname,'arrangement-observer.js'),'utf8');
 if(fullDocument)return '<!doctype html><meta charset="utf-8"><style>'+css+'</style>'+assets.icons+'<div id="docview"></div><script>'+source.replace(/<\/script/gi,'<\\/script')+'</script>';
 return '<!doctype html><meta charset="utf-8"><style>'+css+'\nhtml,body{margin:0}#view{padding:20px}.docview{max-width:none;margin:0}*,*::before,*::after{animation:none!important;transition:none!important}</style>'+assets.icons+'<main id="view"></main><script>'+source.replace(/<\/script/gi,'<\\/script')+'</script>';
}
module.exports={payload};
if(require.main===module)process.stdout.write(payload());
