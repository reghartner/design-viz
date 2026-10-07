'use strict';
// Build-time only. The generated payload is self-contained in downloaded kits.
const fs=require('node:fs'),path=require('node:path');
function payload(){
 const {entrypoint,entrypointAssets,fontCss}=require('../source-loader.cjs');
 const native=entrypoint('native'),assets=entrypointAssets('native');
 const css=fontCss('all')+'\n'+assets.styles.map(a=>a.source).join('\n');
 const source=native.body+'\n'+fs.readFileSync(path.join(__dirname,'native.js'),'utf8');
 return '<!doctype html><meta charset="utf-8"><style>'+css+'\nhtml,body{margin:0}#view{padding:20px}.docview{max-width:none;margin:0}*,*::before,*::after{animation:none!important;transition:none!important}</style>'+assets.icons+'<main id="view"></main><script>'+source.replace(/<\/script/gi,'<\\/script')+'</script>';
}
module.exports={payload};
if(require.main===module)process.stdout.write(payload());
