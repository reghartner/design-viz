/* Publisher build only. Packed consumers load dist and never need this checkout. */
import {build as buildJs} from 'esbuild';
import {rollup} from 'rollup';
import {dts} from 'rollup-plugin-dts';
import {execFileSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const app=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(import.meta.url);
const out=path.join(app,'dist');
const entries=['index','reference-proxy','new-frontend','backend'];
const external=id=>!id.startsWith('.') && !path.isAbsolute(id);
const types=await mkdtemp(path.join(tmpdir(),'flowview-package-types-'));
try {
  // Type-check and emit the authored API first; generated JS already has deliberate
  // declarations. Consumers never have to enable allowJs or inspect source files.
  execFileSync(process.execPath,[require.resolve('typescript/bin/tsc'),'-p',path.join(app,'tsconfig.build.json'),'--outDir',types],{stdio:'inherit'});
  await mkdir(path.join(types,'generated'),{recursive:true});
  for(const file of ['nativeViewer.d.ts','compatibility.d.ts'])
    await cp(path.join(app,'src/generated',file),path.join(types,'generated',file));
  await rm(out,{recursive:true,force:true});
  await mkdir(out,{recursive:true});
  // Shared chunks preserve one renderer/font owner across the optional adapters.
  await buildJs({
    absWorkingDir:app,entryPoints:Object.fromEntries(entries.map(name=>[name,'src/'+name+'.ts'])),
    outdir:out,bundle:true,splitting:true,format:'esm',platform:'neutral',target:'es2022',
    packages:'external',jsx:'automatic',chunkNames:'esm-chunks/[name]-[hash]',
  });
  const runtime=await rollup({input:Object.fromEntries(entries.map(name=>[name,path.join(out,name+'.js')])),external});
  try {
    await runtime.write({dir:out,format:'cjs',entryFileNames:'[name].cjs',chunkFileNames:'cjs-chunks/[name]-[hash].cjs',exports:'named'});
  } finally { await runtime.close(); }
  for(const name of entries){
    const declarations=await rollup({input:path.join(types,name+'.d.ts'),plugins:[dts()],external});
    try {
      await declarations.write({file:path.join(out,name+'.d.ts'),format:'es'});
      await declarations.write({file:path.join(out,name+'.d.cts'),format:'es'});
    } finally { await declarations.close(); }
  }
  await cp(path.join(app,'src/generated/FONT-LICENSES.txt'),path.join(out,'FONT-LICENSES.txt'));
  await cp(path.join(app,'../../LICENSE'),path.join(out,'LICENSE'));
  console.log('Built @flowview/backstage-plugin: core, reference-proxy, new-frontend and backend (ESM/CJS + declarations).');
} finally { await rm(types,{recursive:true,force:true}); }
