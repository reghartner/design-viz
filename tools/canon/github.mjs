#!/usr/bin/env node
/* Company-side runner. Reads trusted default-branch files only. PR contents and
   watched service code are never executed or used as workflow instructions. */
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {registry,stateFile} from './registry.mjs';
import {scan,decide,effectiveSpecs,GitHubSources,reportMarkdown} from './drift.mjs';
import C from './core.cjs';

const env=process.env,repo=env.GITHUB_REPOSITORY,token=env.GITHUB_TOKEN,api=(env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/,'');
if(!repo || !token || !env.FLOWVIEW_REGISTRY)throw new Error('Set GITHUB_REPOSITORY, GITHUB_TOKEN, and FLOWVIEW_REGISTRY.');
async function request(route,method='GET',body){
  const r=await fetch(api+'/repos/'+repo+route,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  if(!r.ok)throw new Error('GitHub '+method+' '+route+' failed ('+r.status+').');return r.status===204?null:r.json();
}
const meta=await request(''),branch=meta.default_branch,base=(await request('/git/ref/heads/'+encodeURIComponent(branch))).object.sha;
const checkedOut=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(base!==checkedOut)throw new Error('Default branch moved. Rerun against its latest revision.');
const reg=await registry(env.FLOWVIEW_REGISTRY),statePath='.flowview/drift-state.json',state=await stateFile(statePath);
const source=new GitHubSources({token:env.FLOWVIEW_SOURCE_TOKEN || token,host:new URL(env.GITHUB_SERVER_URL || 'https://github.com').host,apiBase:api});
const result=await scan(reg.specs,source,state);

async function commitFiles(files,message,parent=base){
  const parentCommit=await request('/git/commits/'+parent);
  const tree=await request('/git/trees','POST',{base_tree:parentCommit.tree.sha,tree:files.map(f=>({path:f.path,mode:'100644',type:'blob',content:f.content}))});
  return (await request('/git/commits','POST',{message,tree:tree.sha,parents:[parent]})).sha;
}
if(process.argv[2]==='scan'){
  for(const review of result.findings){
    if(!['open','repair'].includes(review.status))continue;
    const head='flowview/drift/'+review.id,existing=await request('/pulls?state=all&head='+encodeURIComponent(repo.split('/')[0]+':'+head));
    if(existing.length)continue;
    const report=reportMarkdown([review]);
    const commit=await commitFiles([{path:'.flowview/reviews/'+review.id+'.json',content:JSON.stringify(review,null,2)+'\n'},{path:'.flowview/reviews/'+review.id+'.md',content:report}],'Report diagram drift '+review.id);
    // Reuse a branch left by an interrupted run, without forcing any history.
    const refs=await request('/git/matching-refs/heads/'+head);
    if(!refs.some(r=>r.ref==='refs/heads/'+head))await request('/git/refs','POST',{ref:'refs/heads/'+head,sha:commit});
    await request('/pulls','POST',{title:'Flowview drift: '+review.reference.path,head,base:branch,body:'<!-- flowview-drift:'+review.id+' -->\n\n'+report+'\nChoose an explicit disposition. Label `flowview/no-impact` and close to accept the reviewed revision. Label `flowview/regression` and include a `Regression ticket: https://...` line before closing to retain expected behavior. For intended changes, update the affected specs through a reviewed PR. Plain closure never advances a baseline.'});
    console.log('Opened review '+review.id);
  }
}else if(process.argv[2]==='decision'){
  const event=JSON.parse(await readFile(env.GITHUB_EVENT_PATH,'utf8')),number=event.pull_request?.number;
  if(!number)throw new Error('A pull request event is required.');
  const pr=await request('/pulls/'+number),match=/^flowview\/drift\/([a-f0-9]{20})$/.exec(pr.head.ref);
  if(pr.state!=='closed' || !match || pr.head.repo?.full_name!==repo || pr.user.type!=='Bot')throw new Error('Only closed, same-repository bot drift reviews are accepted.');
  const labels=pr.labels.map(l=>l.name),id=match[1];
  if(!pr.body?.includes('<!-- flowview-drift:'+id+' -->'))throw new Error('Review marker mismatch.');
  const actor=event.sender?.login,permission=(await request('/collaborators/'+encodeURIComponent(actor)+'/permission')).permission;
  if(!['admin','write','maintain'].includes(permission))throw new Error('A repository maintainer must record the decision.');
  const noImpact=labels.includes('flowview/no-impact'),regression=labels.includes('flowview/regression');
  if(!noImpact && !regression){console.log('No explicit disposition; baseline unchanged.');process.exit(0);}
  if(noImpact===regression)throw new Error('Choose exactly one explicit disposition label.');
  const review=result.state.reviews[id];if(!review)throw new Error('Source changed since this report; rescan and review the current diff.');
  const blob=await request('/contents/.flowview/reviews/'+id+'.json?ref='+pr.head.sha);
  const original=JSON.parse(Buffer.from(blob.content,'base64').toString('utf8'));
  if(original.id!==id || original.before?.text!==review.before?.text || original.after?.text!==review.after?.text || JSON.stringify(original.reference)!==JSON.stringify(review.reference))throw new Error('Reported evidence changed; rescan before accepting.');
  if(noImpact){
    const pinned=C.locate(await source.file(review.reference.repository,original.head,review.reference.path),review.reference.anchor);
    if(pinned.error || pinned.text!==review.after.text)throw new Error('Pinned report evidence does not match the reviewed source.');
    review.head=original.head;review.after=pinned;
  }
  const ticket=/^Regression ticket:\s*(https?:\/\/\S+)\s*$/mi.exec(pr.body)?.[1];
  const next=decide(reg.specs,result.state,id,{disposition:noImpact?'no-impact':'regression',reason:'Reviewed in '+pr.html_url,ticket,actor});
  const files=[];
  if(noImpact){
    for(const spec of effectiveSpecs(reg.specs,next)){
      const entry=reg.entries.find(e=>e.id===spec.page.canon.id),relative=path.relative(process.cwd(),entry.filename);
      if(relative.startsWith('..') || path.isAbsolute(relative))throw new Error('Registry is outside the checked-out repository.');
      files.push({path:relative.split(path.sep).join('/'),content:JSON.stringify(spec,null,2)+'\n'});
    }
  }
  // Git is authoritative after materializing baseline changes. Persisting spec
  // overlays here would hide later human commits from subsequent scans.
  next.specs={};
  files.push({path:statePath,content:JSON.stringify(next,null,2)+'\n'});
  const commit=await commitFiles(files,'Record Flowview review '+id);
  // No force: branch protection and concurrent commits must remain authoritative.
  await request('/git/refs/heads/'+encodeURIComponent(branch),'PATCH',{sha:commit,force:false});
  console.log('Recorded '+id+' at '+commit);
}else throw new Error('Use scan or decision.');
