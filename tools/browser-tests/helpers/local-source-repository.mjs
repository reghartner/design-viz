import {expect,paste,closeTools} from './test.mjs';
import {cloudFolder} from './cloud-folder.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {source as starter} from '../fixtures/editor-spec.mjs';
export const localSourceSpecs={
 base:{page:{title:'Provider',sections:[{id:'main',diagram:{nodes:{api:{title:'Unpublished API'}},rows:[['api']],topologyExports:{core:{nodes:['api'],edges:[]}}}}]}},
 middle:{page:{title:'Middle',sections:[{id:'main',diagram:{topologyImports:[{spec:'base',export:'core',as:'base'}],topologyExports:{core:{nodes:['base::api'],edges:[]}}}}]}},
 consumer:{page:{title:'Independent consumer',sections:[{id:'main',diagram:{nodes:{local:{title:'Local work'}},rows:[['local']],topologyImports:[{spec:'middle',export:'core',as:'shared',position:{x:400,y:180},nodePositions:{'base::api':{x:400,y:180}},nodeTracking:{'base::api':{tickets:['API-10']}},nodeOverrides:{'base::api':{style:'teal'}}}]}}]}}
};
// Exported for real external-author exercises: keep page live and let a process
// edit provider files and invoke command(...), using the generated consumer kit.
export async function separateLocalSources(page,server,{connect=true}={}){
 const disk=await cloudFolder(page),consumerFolder=path.join(disk.folder,'consumer'),support=path.join(consumerFolder,'.flowview-agent');
 await mkdir(consumerFolder,{recursive:true});
 const exact=' \n'+JSON.stringify(localSourceSpecs.consumer,null,2)+'\n';
 await writeFile(path.join(consumerFolder,'independent.spec.json'),exact);await writeFile(path.join(consumerFolder,'independent.ledger.md'),'# Independent ledger\r\nPreserve imported work.\n');
 const roots=['/sources-a/worktree','/sources-b/worktree'];
 for(const relative of roots){const root=path.join(disk.folder,relative);await mkdir(root,{recursive:true});await writeFile(path.join(root,'canon.json'),JSON.stringify({version:1,diagrams:['base','middle'].map(id=>({folder:'diagrams/'+id,owner:'group:default/local'}))}));for(const id of ['base','middle']){await mkdir(path.join(root,'diagrams',id),{recursive:true});await writeFile(path.join(root,'diagrams',id,id+'.spec.json'),JSON.stringify(localSourceSpecs[id],null,2));}}
 await page.addInitScript(()=>{
   window.providerPickerPath='/sources-a/worktree';
   window.showDirectoryPicker=async options=>window.flowviewTestDirectory(options?.id==='flowview-local-sources'?window.providerPickerPath:'/consumer');
   window.showOpenFilePicker=async()=>[await window.flowviewTestDirectory('/consumer').getFileHandle(window.consumerFileName || 'independent.spec.json')];
 });
 await page.route('**/diagrams.json',route=>route.fulfill({json:{version:3,diagrams:[]}}));
 await page.goto(server.origin+'/workbench.html');await paste(page,starter);await closeTools(page);await page.locator('#editor-tab-file').click();await page.locator('#working-file-open').click();await expect(page.locator('#src')).toHaveValue(exact);
 if(connect){await closeTools(page);await page.locator('#editor-tab-agent').click();await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-start-adopt').click();await page.locator('#folder-agent-connect').click();await expect(page.locator('#folder-agent-copy')).toBeEnabled();await page.locator('#folder-agent-guide').evaluate(el=>el.close());await closeTools(page);}
 return {...disk,consumerFolder,support,exact,roots:roots.map(root=>path.join(disk.folder,root)),
  readState:async()=>JSON.parse(await readFile(path.join(support,'state.json'),'utf8')),
  provider:async(root,id,source)=>writeFile(path.join(root,'diagrams',id,id+'.spec.json'),source),
  command:(...args)=>new Promise((resolve,reject)=>{const child=spawn('python3',[path.join(support,'folder-agent.py'),'refresh-sources',...args],{cwd:consumerFolder});let stdout='',stderr='';child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));})};
}
