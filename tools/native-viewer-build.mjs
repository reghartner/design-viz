/* Build-time composition of trusted source into a native ESM renderer. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sourceLoader from './source-loader.cjs';
import {scopeNativeCss} from './native-viewer-styles.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>readFile(path.join(root,name),'utf8');
export async function nativeViewerSource(){
  const manifest=JSON.parse(await read('src/fonts/manifest.json'));
  const fonts=await Promise.all(manifest.map(async font=>({family:'Flowview Native '+font.family,weight:font.weight,
    source:'url(data:font/woff2;base64,'+(await readFile(path.join(root,'src/fonts',font.file))).toString('base64')+') format("woff2")'})));
  let css=await read('src/style.flowview.css')+'\n'+sourceLoader.readStyles('style.core.css');
  // Authored selector heads only. Type selectors keep type specificity; :root
  // becomes the internal class so its specificity and rule order are retained.
  css=scopeNativeCss(css);
  for(const family of new Set(manifest.map(font=>font.family)))css=css.split("'"+family+"'").join("'Flowview Native "+family+"'");
  const variables=[...new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(m=>m[1]))];
  css=':host{display:block;isolation:isolate;}flowview-root{all:initial;display:block;'+variables.map(name=>name+':initial;').join('')+'}\n'+css+
    '\nflowview-root{--home-max-height:560px;}flowview-root[class] .docview[class]{box-sizing:border-box;width:100%;max-width:none;padding:12px;}'+
    '.docview .copychip,.docview .embedchip{display:none;}[hidden]{display:none!important;}';
  const assets={css,fonts,icons:await read('src/icons.svg')};
  const sources=['compatibility.js','canon.js','validator.js','engine.js'].map(name=>sourceLoader.readSource(name)).join('\n');
  return '// Generated trusted native renderer; inert specs are passed to mountNativeViewer.\n'+await read('src/native/environment.js')+
    '\nconst nativeAssets='+JSON.stringify(assets)+';\nfunction nativeRuntime(environment){\n'+
    'const {document,window,setTimeout,clearTimeout,setInterval,clearInterval,requestAnimationFrame,cancelAnimationFrame,ResizeObserver,MutationObserver,CustomEvent}=environment;\n'+
    sources+'\n'+await read('src/native/mount.js')+'\nreturn (spec,options)=>mountNativeSpec(environment,spec,options);\n}\n'+
    'export function mountNativeViewer(host,spec,options={}){const environment=createNativeEnvironment(host,nativeAssets);try{return nativeRuntime(environment)(spec,options);}catch(error){environment.destroy();throw error;}}\n';
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const output=process.argv[2];if(!output)throw new Error('Usage: node tools/native-viewer-build.mjs OUTPUT.mjs');
  await mkdir(path.dirname(path.resolve(output)),{recursive:true});await writeFile(output,await nativeViewerSource());
  console.log('Built native renderer '+output);
}
