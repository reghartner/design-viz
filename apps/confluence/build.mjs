import { build } from 'esbuild';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const app = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(app, '../..');
const preview = process.argv.includes('--preview');
const outdir = path.join(app, preview ? 'preview' : 'static/viewer');
const exports = ['buildConfluenceExport', 'buildConfluenceConfig', 'confluenceSections',
  'confluenceDisplayPage', 'confluenceSourceUrl', 'CONFLUENCE_INPUT_BYTES',
  'SKIN_NAMES', 'renderPage', 'applySkinClasses'];
const core = (await Promise.all(['canon.js','validator.js','engine.js','confluence.js'].map(name =>
  readFile(path.join(root, 'src', name), 'utf8')))).join('\n') + '\nexport {' + exports.join(',') + '};';

await rm(outdir, {recursive:true, force:true});
await mkdir(outdir, {recursive:true});
await build({
  absWorkingDir:app, entryPoints:[preview ? 'src/preview.mjs' : 'src/entry.mjs'],
  outfile:path.join(outdir, 'app.js'), bundle:true, format:'iife', target:'es2020',
  minify:true, legalComments:'eof', loader:{'.woff2':'file','.woff':'file'}, assetNames:'fonts/[name]-[hash]',
  plugins:[{name:'shared-renderer',setup(build){
    build.onResolve({filter:/^flowview-core$/},()=>({path:'core',namespace:'flowview'}));
    build.onLoad({filter:/.*/,namespace:'flowview'},()=>({contents:core,loader:'js'}));
  }}]
});
const css = await Promise.all(['src/style.flowview.css','src/style.core.css','apps/confluence/src/app.css'].map(name=>readFile(path.join(root,name),'utf8')));
await writeFile(path.join(outdir,'style.css'),css.join('\n'));
const html = (await readFile(path.join(app,'src/index.html'),'utf8'))
  .replace('<!-- ICONS -->',await readFile(path.join(root,'src/icons.svg'),'utf8'));
await writeFile(path.join(outdir,'index.html'),html);
for (const font of ['ibm-plex-sans','ibm-plex-mono','sora'])
  await writeFile(path.join(outdir,`${font}-LICENSE.txt`),
    await readFile(path.join(app,'node_modules/@fontsource',font,'LICENSE')));
console.log(`Built ${path.relative(root,outdir)} (${preview ? 'local preview with simulated bridge; never deploy' : 'Forge Custom UI'})`);
