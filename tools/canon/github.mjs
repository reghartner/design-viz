#!/usr/bin/env node
/* Company-side runner. Reads trusted default-branch files only. PR contents and
   watched service code are never executed or used as workflow instructions. */
import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {registry,stateFile} from './registry.mjs';
import {scan,decide,effectiveSpecs,GitHubSources,reportMarkdown} from './drift.mjs';
import C from './core.cjs';

const env=process.env,repo=env.GITHUB_REPOSITORY,token=env.GITHUB_TOKEN;
const api=(env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/,'');
const command=process.argv[2],dryRun=env.FLOWVIEW_DRY_RUN==='true';
const report={version:1,command,dryRun,repository:repo,startedAt:new Date().toISOString(),status:'running',findings:[],actions:[]};
async function request(route,method='GET',body){
  const r=await fetch(api+'/repos/'+repo+route,{method,signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:body===undefined?undefined:JSON.stringify(body)});
  if(!r.ok)throw new Error('GitHub '+method+' '+route+' failed ('+r.status+').');
  return r.status===204?null:r.json();
}
function summary(){
  const esc=value=>String(value).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const lines=['# Flowview GitHub drift scan','',`Status: **${report.status}**${dryRun?' · report only (no GitHub writes)':''}`,`Command: ${command}`,`Completed: ${report.finishedAt}`,''];
  if(report.diagrams!==undefined)lines.push(`${report.diagrams} diagrams · ${report.references} code references · ${report.findings.length} findings`,'');
  if(report.status==='complete' && command==='scan' && !report.findings.length)lines.push('No referenced code changed.','');
  for(const a of report.actions)lines.push('- '+esc(a.message)+(a.url?' — [review]('+a.url+')':''));
  if(report.error)lines.push('','Error: '+esc(report.error));
  if(report.findings.some(r=>r.error))lines.push('','Some references could not be read or located. Their repair reports require attention; this is not a clean scan.');
  lines.push('','Source changes are evidence for human review, not an automatic judgment of behavioral impact.');
  return lines.join('\n')+'\n';
}
async function run(){
  if(!repo || !token || !env.FLOWVIEW_REGISTRY)throw new Error('Set GITHUB_REPOSITORY, GITHUB_TOKEN, and FLOWVIEW_REGISTRY.');
  if(!['scan','decision'].includes(command))throw new Error('Use scan or decision.');
  if(env.FLOWVIEW_DRY_RUN && !['true','false'].includes(env.FLOWVIEW_DRY_RUN))throw new Error('FLOWVIEW_DRY_RUN must be true or false.');
  if(dryRun && command!=='scan')throw new Error('Report-only mode is supported for scans, not decisions.');
  const meta=await request(''),branch=meta.default_branch,base=(await request('/git/ref/heads/'+encodeURIComponent(branch))).object.sha;
  const checkedOut=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  if(base!==checkedOut)throw new Error('Default branch moved. Rerun against its latest revision.');
  report.baseRevision=base;report.registry=env.FLOWVIEW_REGISTRY;
  const reg=await registry(env.FLOWVIEW_REGISTRY),statePath='.flowview/drift-state.json',state=await stateFile(statePath);
  if(!reg.specs.length)throw new Error('The registry contains no diagrams.');
  report.diagrams=reg.specs.length;report.references=reg.specs.reduce((n,s)=>n+C.references(s).length,0);
  const source=new GitHubSources({token:env.FLOWVIEW_SOURCE_TOKEN || token,host:new URL(env.GITHUB_SERVER_URL || 'https://github.com').host,apiBase:api});
  const result=await scan(reg.specs,source,state);report.findings=result.findings;

  async function commitFiles(files,message,parent=base){
    const parentCommit=await request('/git/commits/'+parent);
    const tree=await request('/git/trees','POST',{base_tree:parentCommit.tree.sha,tree:files.map(f=>({path:f.path,mode:'100644',type:'blob',content:f.content}))});
    return (await request('/git/commits','POST',{message,tree:tree.sha,parents:[parent]})).sha;
  }
  if(command==='scan'){
    for(const review of result.findings){
      if(!['open','repair'].includes(review.status)){
        report.actions.push({id:review.id,outcome:'resolved',message:'Retained '+review.status+' decision for '+review.reference.path});continue;
      }
      const head='flowview/drift/'+review.id,existing=await request('/pulls?state=all&head='+encodeURIComponent(repo.split('/')[0]+':'+head));
      if(existing.length){
        const pr=existing[0];report.actions.push({id:review.id,outcome:'existing',number:pr.number,url:pr.html_url,message:'Reused '+pr.state+' review for '+review.reference.path});continue;
      }
      if(dryRun){report.actions.push({id:review.id,outcome:'would-open',message:'Would open a '+review.status+' review for '+review.reference.path});continue;}
      const markdown=reportMarkdown([review]);
      // Reuse a branch left by an interrupted run, without forcing any history.
      const refs=await request('/git/matching-refs/heads/'+head);
      if(!refs.some(r=>r.ref==='refs/heads/'+head)){
        const commit=await commitFiles([{path:'.flowview/reviews/'+review.id+'.json',content:JSON.stringify(review,null,2)+'\n'},{path:'.flowview/reviews/'+review.id+'.md',content:markdown}],'Report diagram drift '+review.id);
        await request('/git/refs','POST',{ref:'refs/heads/'+head,sha:commit});
      }
      const pr=await request('/pulls','POST',{title:'Flowview drift: '+review.reference.path,head,base:branch,body:'<!-- flowview-drift:'+review.id+' -->\n\n'+markdown+'\nChoose an explicit disposition. Label `flowview/no-impact` and close to accept the reviewed revision. Label `flowview/regression` and include a `Regression ticket: https://...` line before closing to retain expected behavior. For intended changes, update the affected specs through a reviewed PR. Plain closure never advances a baseline.'});
      report.actions.push({id:review.id,outcome:'opened',number:pr.number,url:pr.html_url,message:'Opened review for '+review.reference.path});
      console.log('Opened review '+review.id);
    }
    // Missing permissions/files/anchors must not look like a successful clean
    // scheduled scan. Preserve the repair evidence and any review PRs first.
    if(result.findings.some(r=>r.error))throw new Error('Some source references need repair. See the report and repair review PRs.');
  }else{
    const event=JSON.parse(await readFile(env.GITHUB_EVENT_PATH,'utf8')),number=event.pull_request?.number;
    if(!number)throw new Error('A pull request event is required.');
    const pr=await request('/pulls/'+number),match=/^flowview\/drift\/([a-f0-9]{20})$/.exec(pr.head.ref);
    if(pr.state!=='closed' || !match || pr.head.repo?.full_name!==repo || pr.user.type!=='Bot')throw new Error('Only closed, same-repository bot drift reviews are accepted.');
    const labels=pr.labels.map(l=>l.name),id=match[1];
    if(!pr.body?.includes('<!-- flowview-drift:'+id+' -->'))throw new Error('Review marker mismatch.');
    const actor=event.sender?.login;
    if(!actor)throw new Error('A repository maintainer must record the decision.');
    const permission=(await request('/collaborators/'+encodeURIComponent(actor)+'/permission')).permission;
    if(!['admin','write','maintain'].includes(permission))throw new Error('A repository maintainer must record the decision.');
    const noImpact=labels.includes('flowview/no-impact'),regression=labels.includes('flowview/regression');
    if(!noImpact && !regression){report.actions.push({id,outcome:'unchanged',message:'No explicit disposition; baseline unchanged.'});return;}
    if(noImpact===regression)throw new Error('Choose exactly one explicit disposition label.');
    const ticket=/^Regression ticket:\s*(https?:\/\/\S+)\s*$/mi.exec(pr.body)?.[1];
    const disposition=noImpact?'no-impact':'regression',prior=state.reviews[id];
    if(prior?.decision?.disposition===disposition && (!regression || prior.ticket===ticket)){
      report.actions.push({id,outcome:'already-recorded',message:'This '+disposition+' decision is already recorded.'});return;
    }
    const review=result.findings.find(r=>r.id===id);
    if(!review)throw new Error('Source changed since this report; rescan and review the current diff.');
    const blob=await request('/contents/.flowview/reviews/'+id+'.json?ref='+pr.head.sha);
    const original=JSON.parse(Buffer.from(blob.content,'base64').toString('utf8'));
    if(original.id!==id || original.before?.text!==review.before?.text || original.after?.text!==review.after?.text || JSON.stringify(original.reference)!==JSON.stringify(review.reference))throw new Error('Reported evidence changed; rescan before accepting.');
    if(noImpact){
      const pinned=C.locate(await source.file(review.reference.repository,original.head,review.reference.path),review.reference.anchor);
      if(pinned.error || pinned.text!==review.after.text)throw new Error('Pinned report evidence does not match the reviewed source.');
      review.head=original.head;review.after=pinned;
    }
    const next=decide(reg.specs,result.state,id,{disposition,reason:'Reviewed in '+pr.html_url,ticket,actor});
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
    report.actions.push({id,outcome:'recorded',disposition,commit,message:'Recorded '+disposition+' for '+review.reference.path});
    console.log('Recorded '+id+' at '+commit);
  }
}
try{await run();report.status='complete';}
catch(e){report.status='failed';report.error=e.message;console.error(e.message);process.exitCode=1;}
finally{
  report.finishedAt=new Date().toISOString();
  const directory=path.resolve(env.FLOWVIEW_REPORT_DIR || '.local/canon-github');await mkdir(directory,{recursive:true});
  const markdown=summary();
  await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');
  await writeFile(path.join(directory,'report.md'),markdown+'\n'+reportMarkdown(report.findings));
  if(env.GITHUB_STEP_SUMMARY)await appendFile(env.GITHUB_STEP_SUMMARY,markdown);
  console.log(JSON.stringify({status:report.status,diagrams:report.diagrams,references:report.references,findings:report.findings.length,report:directory}));
}
