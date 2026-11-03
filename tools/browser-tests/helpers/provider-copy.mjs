/* #878 provider copy checks for connected folders. "Copy matches" (ticket #878,
   Test + flip) means: providers.json providersSha256 == sha256(payloadText) ==
   state.json providersSha256; its payload sourceKind is the source in use and its
   consumerId is the consumer's frozen identity (the candidate spec has no page.canon); its specs
   carry the provider text the consumer renders; and the bundled validate.js, run
   without flags on the consumer, exits 0. */
import {expect} from './test.mjs';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';

export const COPY_REMEDY='folder-agent.py refresh-sources --source-repo <repository>';
const sha256=text=>createHash('sha256').update(text,'utf8').digest('hex');

// A comparable summary of the copy and the state.json beside it.
export async function copySummary(support){
  let copy,state;
  try{copy=JSON.parse(await readFile(path.join(support,'providers.json'),'utf8'));state=JSON.parse(await readFile(path.join(support,'state.json'),'utf8'));}
  catch(error){return {unavailable:error.code || error.message};}
  if(typeof copy.payloadText!=='string')return {headerOnly:copy};
  const payload=JSON.parse(copy.payloadText),base=(payload.specs || []).find(spec=>spec.page?.canon?.id==='base');
  return {whole:copy.providersSha256===sha256(copy.payloadText),named:typeof state.providersSha256==='string' && state.providersSha256===copy.providersSha256,
    sourceKind:payload.sourceKind,snapshotSha256:typeof payload.snapshotSha256==='string',consumerId:payload.consumerId ?? null,
    specs:(payload.specs || []).map(spec=>spec.page?.canon?.id).sort(),baseApi:base?base.page.sections[0].diagram.nodes.api.title:null};
}

// Unpack the folder's authoring kit once, then run its bundled validate.js.
export function bundledValidate(support,...files){
  const tool=path.join(support,'authoring','tools','validate.js');
  const prepared=spawnSync('python3',[path.join(support,'folder-agent.py'),'prepare'],{encoding:'utf8',timeout:60000});
  expect(prepared.status,'folder-agent.py prepare: '+prepared.stderr).toBe(0);
  return spawnSync(process.execPath,[tool,...files],{encoding:'utf8',timeout:30000});
}

export async function expectCopyMatches(support,consumer,{sourceKind,baseApi,consumerId,specs=['base','middle'],snapshotSha256=sourceKind==='local'},label){
  await expect.poll(()=>copySummary(support),{message:label+': copy matches',timeout:15000})
    .toEqual({whole:true,named:true,sourceKind,snapshotSha256,consumerId,specs,baseApi});
  const result=bundledValidate(support,consumer);
  expect(result.status,label+': bundled validate.js\n'+result.stdout+result.stderr).toBe(0);
  expect(result.stdout).toContain(consumer+': 0 errors');
}

// Copy a browser-private (OPFS) session folder and its diagram file to disk so the
// bundled kit can run on it. segments name the diagram folder from the OPFS root.
export async function exportOpfsSession(page,segments,spec){
  const files=await page.evaluate(async({segments,spec})=>{
    let dir=await navigator.storage.getDirectory();for(const segment of segments)dir=await dir.getDirectoryHandle(segment);
    const support=await dir.getDirectoryHandle('.flowview-agent'),out={spec:await(await(await dir.getFileHandle(spec)).getFile()).text(),support:{}};
    for(const name of ['providers.json','state.json','editor.json','authoring-kit.json','folder-agent.py']){
      try{out.support[name]=await(await(await support.getFileHandle(name)).getFile()).text();}catch{}
    }
    return out;
  },{segments,spec});
  const folder=await mkdtemp(path.join(tmpdir(),'flowview-878-opfs-')),support=path.join(folder,'.flowview-agent');
  await mkdir(support,{recursive:true});await writeFile(path.join(folder,spec),files.spec);
  for(const [name,text] of Object.entries(files.support))await writeFile(path.join(support,name),text);
  return {folder,support,consumer:path.join(folder,spec)};
}
