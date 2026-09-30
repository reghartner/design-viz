import {cp,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {repo} from './prepare.mjs';
// Editor/viewer contracts do not require installing the Confluence or Backstage apps.
export default async function prepare(){
  execFileSync('python3',[path.join(repo,'tools/build.py')],{stdio:'inherit'});
  const output=await mkdtemp(path.join(tmpdir(),'flowview-editor-'));process.env.FLOWVIEW_BROWSER_ROOT=output;
  await cp(path.join(repo,'workbench/flowspec.html'),path.join(output,'workbench.html'));
  execFileSync('python3',[path.join(repo,'tools/browser-tests/fixtures/build-editor.py'),repo,path.join(output,'lifetime')],{stdio:'inherit'});
  for(const dir of [output,path.join(output,'lifetime')]){
    await cp(path.join(repo,'workbench/catalog.json'),path.join(dir,'catalog.json'));await writeFile(path.join(dir,'starters.json'),'[]');
  }
  return ()=>rm(output,{recursive:true,force:true});
}
