import {createHash} from 'node:crypto';
import C from './core.cjs';

export const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export function initialState(){return {version:1,specs:{},reviews:{},audit:[]};}
export function effectiveSpecs(specs,state){return specs.map(s=>C.clone(state.specs[s.page.canon.id] || s));}
export class SnapshotSources {
  constructor(snapshot){this.snapshot=snapshot;}
  async head(repository){const r=this.snapshot.repositories[repository];if(!r)throw new Error('Repository is unavailable: '+repository);return r.head;}
  async file(repository,revision,path){const value=this.snapshot.repositories[repository]?.revisions[revision]?.[path];if(typeof value!=='string')throw new Error('Source file is unavailable at the pinned revision: '+path);return value;}
}

// Repository URLs are resolved only through an explicit GitHub host adapter.
// The scanner reads text; it never checks out or executes a watched repository.
export class GitHubSources {
  constructor({token,host='github.com',apiBase='https://api.github.com',fetchImpl=fetch}){
    if(!token)throw new Error('GitHub source access requires an installation token.');
    this.token=token;this.host=host;this.apiBase=apiBase.replace(/\/$/,'');this.fetch=fetchImpl;
  }
  repository(url){const u=new URL(url),parts=u.pathname.replace(/\.git$/,'').split('/').filter(Boolean);
    if(u.protocol!=='https:' || u.host!==this.host || parts.length!==2 || !parts.every(p=>/^[\w.-]+$/.test(p)))throw new Error('Repository is outside the configured GitHub integration.');
    return parts.map(encodeURIComponent).join('/');
  }
  async get(path,raw=false){
    const r=await this.fetch(this.apiBase+path,{signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+this.token,Accept:raw?'application/vnd.github.raw+json':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
    if(!r.ok)throw new Error('GitHub source read failed ('+r.status+').');
    const value=raw?await r.text():await r.json();if(raw && value.length>2_000_000)throw new Error('Source file exceeds 2 MB.');return value;
  }
  async head(repo){const name=this.repository(repo),metadata=await this.get('/repos/'+name);return (await this.get('/repos/'+name+'/commits/'+encodeURIComponent(metadata.default_branch))).sha;}
  async file(repo,revision,path){if(!/^[a-f0-9]{40,64}$/i.test(revision))throw new Error('Source revision must be immutable.');return this.get('/repos/'+this.repository(repo)+'/contents/'+path.split('/').map(encodeURIComponent).join('/')+'?ref='+revision,true);}
}

export async function scan(specs,sources,state=initialState(),now=new Date().toISOString()){
  const next=C.clone(state),groups=new Map(),heads=new Map();
  for(const spec of effectiveSpecs(specs,state)){
    const errors=C.validate(spec);if(errors.length)throw new Error(errors.join('\n'));
    if(!spec.page?.canon?.id)throw new Error('Registry diagrams require page.canon.id.');
    for(const hit of C.references(spec)){
      const r=hit.reference,key=digest([r.repository,r.path,r.revision,r.anchor]);
      if(!groups.has(key))groups.set(key,{reference:r,impacts:[]});
      groups.get(key).impacts.push({...hit,referenceId:r.id});
    }
  }
  const findings=[];
  for(const group of groups.values()){
    const ref=group.reference;let head,before,after,error;
    try{
      if(!heads.has(ref.repository))heads.set(ref.repository,await sources.head(ref.repository));head=heads.get(ref.repository);
      if(!/^[a-f0-9]{40,64}$/i.test(head))throw new Error('Head did not resolve to an immutable commit.');
      before=C.locate(await sources.file(ref.repository,ref.revision,ref.path),ref.anchor);
      after=C.locate(await sources.file(ref.repository,head,ref.path),ref.anchor);
      if(before.error || after.error)throw new Error(before.error || after.error);
      if(before.text===after.text)continue;
    }catch(e){error=e.message;}
    const impacts=group.impacts.map(({reference,...hit})=>hit);
    const scope=impacts.map(i=>[i.diagramId,i.sectionId,i.targetId,i.referenceId].join('\0')).sort();
    const id=digest([ref.repository,ref.path,ref.anchor,before?.text,after?.text,error,scope]).slice(0,20);
    const review={id,type:'drift',status:error?'repair':'open',createdAt:now,reference:ref,head,before,after,error,impacts};
    if(!next.reviews[id])next.reviews[id]=review;
    else {
      // Newly linked diagrams must not inherit a prior reviewer's acceptance.
      const old=next.reviews[id];
      const known=new Set(old.impacts.map(i=>JSON.stringify([i.diagramId,i.targetId,i.referenceId])));
      for(const i of impacts)if(!known.has(JSON.stringify([i.diagramId,i.targetId,i.referenceId]))){old.impacts.push(i);old.status=error?'repair':'open';}
    }
    findings.push(next.reviews[id]);
  }
  return {state:next,findings};
}

export function decide(specs,state,id,{disposition,reason,ticket,actor='local reviewer'},now=new Date().toISOString()){
  const next=C.clone(state),review=next.reviews[id];
  if(!review)throw new Error('Review not found.');
  if(!['open','repair','regression'].includes(review.status))throw new Error('Review is already resolved.');
  if(!reason || !reason.trim())throw new Error('A review reason is required.');
  if(!['no-impact','regression','update'].includes(disposition))throw new Error('An explicit review disposition is required. Closing alone never accepts a baseline.');
  if(disposition==='regression' && !C.http(ticket))throw new Error('Regression requires an issue URL.');
  if(review.error && disposition!=='regression')throw new Error('Repair the source reference before accepting it.');
  const current=effectiveSpecs(specs,next),byId=new Map(current.map(s=>[s.page.canon.id,s]));
  if(disposition==='update' && review.type!=='spec')throw new Error('Propose and review an updated spec before accepting changed behavior.');
  if(review.type==='spec' && disposition!=='update')throw new Error('A spec proposal requires an update decision.');
  if(disposition==='no-impact'){
    const updated=new Set();
    for(const hit of review.impacts){
      const key=hit.diagramId+'\0'+hit.referenceId;if(updated.has(key))continue;updated.add(key);
      const spec=byId.get(hit.diagramId);if(!spec)throw new Error('Affected diagram is missing.');
      const refs=C.references(spec).filter(h=>h.reference.id===hit.referenceId).map(h=>h.reference);
      if(!refs.length || refs.some(r=>r.revision!==review.reference.revision || r.repository!==review.reference.repository || r.path!==review.reference.path || JSON.stringify(r.anchor)!==JSON.stringify(review.reference.anchor)))throw new Error('Reference baseline changed; rescan before accepting.');
      for(const ref of refs){ref.revision=review.head;ref.startLine=review.after.startLine;ref.endLine=review.after.endLine;}
      next.specs[hit.diagramId]=spec;
    }
    review.status='accepted';
  }else if(disposition==='update'){
    const currentSpec=byId.get(review.diagramId);
    if(!currentSpec || digest(currentSpec)!==review.baseRevision)throw new Error('Spec changed after proposal; rebase the proposal.');
    next.specs[review.diagramId]=C.clone(review.proposedSpec);review.status='updated';
    if(review.supersedes && next.reviews[review.supersedes]){next.reviews[review.supersedes].status='superseded';next.reviews[review.supersedes].resolvedBy=id;}
    if(review.resolves && next.reviews[review.resolves]){
      const prior=next.reviews[review.resolves];
      if(!prior.impacts.some(i=>i.diagramId===review.diagramId))throw new Error('Spec proposal is unrelated to the drift review.');
      const pending=C.references(review.proposedSpec).filter(h=>prior.impacts.some(i=>i.diagramId===review.diagramId && i.referenceId===h.reference.id));
      if(pending.some(h=>h.reference.revision!==prior.head))throw new Error('Updated spec must reference the reviewed code revision.');
      prior.resolvedDiagrams=[...new Set([...(prior.resolvedDiagrams || []),review.diagramId])];
      if(prior.impacts.every(i=>prior.resolvedDiagrams.includes(i.diagramId))){prior.status='updated';prior.resolvedBy=id;}
    }
  }else {review.status='regression';review.ticket=ticket;}
  review.decision={disposition,reason,actor,at:now};next.audit.push({review:id,...review.decision});
  return next;
}

export function propose(specs,state,{id,spec,baseRevision,review:resolves},now=new Date().toISOString()){
  const current=effectiveSpecs(specs,state).find(s=>s.page.canon.id===id);
  if(!current || digest(current)!==baseRevision)throw new Error('Spec changed; reload the current revision before proposing.');
  const errors=C.validateSpec(spec).errors;if(errors.length)throw new Error(errors.join('\n'));
  if(spec.page?.canon?.id!==id)throw new Error('A proposal cannot change the diagram identity.');
  const prior=state.reviews[resolves];let supersedes;
  if(prior?.type==='spec'){
    if(prior.diagramId!==id || prior.baseRevision!==baseRevision || prior.status!=='open')throw new Error('Proposal is stale or belongs to a different diagram.');
    supersedes=prior.id;resolves=prior.resolves;
  }
  const next=C.clone(state),key=digest([id,baseRevision,spec,resolves,supersedes]).slice(0,20);
  next.reviews[key]={id:key,type:'spec',status:'open',createdAt:now,diagramId:id,baseRevision,proposedSpec:C.clone(spec),resolves,supersedes,impacts:[]};
  return {id:key,state:next};
}

export function reportMarkdown(reviews){
  return '# Flowview drift report\n\n'+reviews.map(r=>{
    const diff=r.before && r.after ? r.before.text.split('\n').map(x=>'- '+x).concat(r.after.text.split('\n').map(x=>'+ '+x)).join('\n') : r.error || '';
    return '## '+r.id+' · '+r.status+'\n\n'+(r.reference?.path || 'Spec proposal: '+r.diagramId)+'\n\n'+r.impacts.map(i=>'- '+i.diagramId+' / '+i.sectionId+' / '+i.targetId+': '+i.description).join('\n')+'\n\n```diff\n'+diff.replace(/```/g,'` ` `')+'\n```\n';
  }).join('\n');
}
