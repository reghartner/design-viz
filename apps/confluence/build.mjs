import { build } from 'esbuild';
import sourceLoader from '../../tools/source-loader.cjs';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const app = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(app, '../..');
const preview = process.argv.includes('--preview');
const outdir = path.join(app, preview ? 'preview' : 'static/viewer');
const core = sourceLoader.moduleSource('forge');
const shared = sourceLoader.entrypointAssets('forge');
const fonts = shared.fonts.map(font => 'import ' + JSON.stringify(font.fontsource) + ';').join('\n');

await rm(outdir, {recursive:true, force:true});
await mkdir(outdir, {recursive:true});
await build({
  absWorkingDir:app, entryPoints:[preview ? 'src/preview.mjs' : 'src/entry.mjs'],
  outfile:path.join(outdir, 'app.js'), bundle:true, format:'iife', target:'es2020',
  minify:true, legalComments:'eof', loader:{'.woff2':'file','.woff':'file'}, assetNames:'fonts/[name]-[hash]',
  plugins:[{name:'shared-renderer',setup(build){
    build.onResolve({filter:/^flowview-(?:core|fonts)$/},args=>({path:args.path,namespace:'flowview'}));
    build.onLoad({filter:/.*/,namespace:'flowview'},args=>({contents:args.path==='flowview-fonts'?fonts:core,loader:'js',resolveDir:app}));
  }}]
});
const css = shared.styles.map(style=>style.source).concat(await readFile(path.join(app,'src/app.css'),'utf8'));
await writeFile(path.join(outdir,'style.css'),css.join('\n'));
const html = (await readFile(path.join(app,'src/index.html'),'utf8'))
  .replace('<!-- ICONS -->',shared.icons);
await writeFile(path.join(outdir,'index.html'),html);
for (const license of shared.licenses)
  await writeFile(path.join(outdir,path.basename(license.file)),license.text);
console.log(`Built ${path.relative(root,outdir)} (${preview ? 'local preview with simulated bridge; never deploy' : 'Forge Custom UI'})`);
