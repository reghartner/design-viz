import {chromium} from '@playwright/test';
import {cp,readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export const repo=path.resolve(fileURLToPath(new URL('../../..',import.meta.url)));
const fixture=name=>fileURLToPath(new URL('../fixtures/'+name,import.meta.url));

export default async function prepare(){
  // Fail before building anything if the pinned browser is unavailable.
  let browser;
  try{browser=await chromium.launch();console.log('Required Chromium: '+browser.version());}
  catch(error){throw new Error('Required Chromium could not launch. Run npm run install:browser --prefix tools/browser-tests (CI: playwright install --with-deps chromium).',{cause:error});}
  finally{if(browser)await browser.close();}
  const output=await mkdtemp(path.join(tmpdir(),'flowview-browser-'));
  process.env.FLOWVIEW_BROWSER_ROOT=output;
  try {
    await cp(path.join(repo,'workbench/flowspec.html'),path.join(output,'workbench.html'));
    execFileSync('python3',[fixture('build-editor.py'),repo,path.join(output,'lifetime')],{stdio:'inherit'});
    for(const directory of [output,path.join(output,'lifetime')])await cp(path.join(repo,'workbench/catalog.json'),path.join(directory,'catalog.json'));
    const raw=JSON.parse(await readFile(path.join(repo,'examples/chime-radar/chime-radar.spec.json'),'utf8'));
    function pause(value){if(!value||typeof value!=='object')return;if(value.diagram)value.diagram.autoplay=false;Object.values(value).forEach(pause);}
    pause(raw);
    const spec=path.join(output,'spec.json');
    await writeFile(spec,JSON.stringify(raw));
    execFileSync('python3',[path.join(repo,'tools/inject.py'),spec,path.join(repo,'template/flowview.html'),path.join(output,'standalone.html')],{stdio:'inherit'});
    await rm(spec); // Offline test receives only the newly injected HTML.
    execFileSync(process.execPath,[path.join(repo,'apps/confluence/build.mjs')],{stdio:'inherit'});
    await cp(path.join(repo,'apps/confluence/static/viewer'),path.join(output,'forge'),{recursive:true});
    const app=path.join(repo,'apps/backstage');
    const {build}=await import(pathToFileURL(path.join(app,'node_modules/esbuild/lib/main.js')));
    await mkdir(path.join(output,'native'));
    await build({absWorkingDir:app,stdin:{resolveDir:app,loader:'tsx',contents:await readFile(fixture('native-host.tsx'),'utf8')},bundle:true,format:'iife',outfile:path.join(output,'native/app.js'),define:{'process.env.NODE_ENV':'"production"'},minify:true});
    await cp(fixture('native-host.html'),path.join(output,'native/index.html'));
  } catch(error) {await rm(output,{recursive:true,force:true});throw error;}
  return ()=>rm(output,{recursive:true,force:true});
}
