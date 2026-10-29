import {randomUUID} from 'node:crypto';

export const LIMITS=Object.freeze({source:4*1024*1024,ledger:256*1024,context:1024*1024,envelope:32*1024*1024});
export class HttpError extends Error {constructor(status,message,details){super(message);this.status=status;this.details=details;}}
const fail=(status,message,details)=>{throw new HttpError(status,message,details);};
const id=value=>typeof value==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const bytes=value=>Buffer.byteLength(value,'utf8');
function fields(value,allowed){if(!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(key=>!allowed.includes(key)))fail(400,'Unknown or malformed fields.');}
export function envelope(value){
  fields(value,['version','source','ledger','topologyContext']);
  if(value.version!==1 || typeof value.source!=='string' || bytes(value.source)>LIMITS.source)fail(400,'Source must be text of at most 4 MiB.');
  if(value.ledger!==null && (typeof value.ledger!=='string' || bytes(value.ledger)>LIMITS.ledger))fail(400,'Coverage ledger must be null or text of at most 256 KiB.');
  if(value.topologyContext!==null && (!value.topologyContext || typeof value.topologyContext!=='object' || Array.isArray(value.topologyContext)))fail(400,'Frozen topology context must be an object or null.');
  if(bytes(JSON.stringify(value.topologyContext))>LIMITS.context)fail(400,'Frozen topology context exceeds 1 MiB.');
  if(value.topologyContext){
    const context=value.topologyContext;fields(context,['version','id','specs','catalog','catalogURL','ephemeral','local','localSource']);
    if(context.version!==1 || typeof context.id!=='string' || !context.id || bytes(context.id)>512 || !Array.isArray(context.specs) || context.specs.length>500 || context.specs.some(spec=>!spec || typeof spec!=='object' || Array.isArray(spec)))fail(400,'Malformed frozen provider context.');
    for(const key of ['ephemeral','local'])if(key in context && typeof context[key]!=='boolean')fail(400,'Malformed frozen provider flag.');
    if('catalogURL' in context && (typeof context.catalogURL!=='string' || bytes(context.catalogURL)>4096))fail(400,'Malformed catalog address.');
    if('localSource' in context){
      const source=context.localSource;fields(source,['path','rootLabel','capturedAt']);
      if(context.local!==true || typeof source.path!=='string' || bytes(source.path)>2048 || !/^diagrams\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)+[a-z0-9]+(?:-[a-z0-9]+)*\.spec\.json$/.test(source.path))fail(400,'Malformed local source path.');
      const parts=source.path.split('/');if(parts.at(-1)!==parts.at(-2)+'.spec.json' || parts.at(-2)!==context.id)fail(400,'Local source must identify its registered diagram.');
      if(typeof source.rootLabel!=='string' || !source.rootLabel.trim() || bytes(source.rootLabel)>512 || /[\u0000-\u001f\u007f]/.test(source.rootLabel))fail(400,'Malformed local repository display label.');
      if(typeof source.capturedAt!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(source.capturedAt) || !Number.isFinite(Date.parse(source.capturedAt)) || new Date(source.capturedAt).toISOString()!==source.capturedAt)fail(400,'Malformed local snapshot timestamp.');
    }
    if('catalog' in context && (!context.catalog || context.catalog.version!==3 || !Array.isArray(context.catalog.diagrams)))fail(400,'Malformed frozen catalog.');
  }
  // This closed envelope deliberately excludes agent conversations, sessions,
  // leases, candidates, credentials and arbitrary folder files. JSON source may
  // be unfinished: persistence never treats rendering as a prerequisite.
  return {version:1,source:value.source,ledger:value.ledger,topologyContext:value.topologyContext};
}
export function createService({store,objects,now=()=>Date.now(),uuid=randomUUID}){
  async function member(subject,write=false){
    if(!subject)fail(401,'Sign in to the team library.');
    const m=await store.member(subject);
    if(!m || !id(m.teamId) || !id(m.userId) || !['editor','reader'].includes(m.role) || m.disabled)fail(403,'This account has not been invited to the library.');
    if(write && m.role!=='editor')fail(403,'This account has read-only library access.');
    return m;
  }
  async function project(m,projectId){if(!id(projectId))fail(400,'Invalid project ID.');const p=await store.project(m.teamId,projectId);if(!p)fail(404,'Project not found.');return p;}
  function publicProject(p){const {projectId,name,revision,updatedAt,updatedBy}=p;return {projectId,name,revision,updatedAt,updatedBy};}
  function revisionNumber(n){if(!Number.isSafeInteger(n) || n<0)fail(400,'Invalid revision.');}
  async function prepare(m,body){
    fields(body,['operationId','projectId','baseRevision','name','restoreRevision']);
    if(!id(body.operationId))fail(400,'Invalid operation ID.');revisionNumber(body.baseRevision);
    if(typeof body.name!=='string' || !body.name.trim() || bytes(body.name)>240)fail(400,'Project name must contain 1–240 bytes.');
    if(body.projectId!=null && !id(body.projectId))fail(400,'Invalid project ID.');
    const fingerprint=JSON.stringify({projectId:body.projectId || null,baseRevision:body.baseRevision,name:body.name,restoreRevision:body.restoreRevision ?? null});
    let existing=await store.operation(m.teamId,body.operationId);
    if(existing){if(existing.userId!==m.userId || existing.fingerprint!==fingerprint)fail(409,'Operation ID was already used for a different save.');return existing;}
    if(body.projectId){const p=await project(m,body.projectId);if(p.revision!==body.baseRevision)fail(409,'Project changed online.',{current:publicProject(p)});}
    else if(body.baseRevision!==0)fail(400,'A new project starts at revision zero.');
    if(body.restoreRevision!=null){revisionNumber(body.restoreRevision);if(!body.projectId || !body.restoreRevision)fail(400,'Choose an existing revision to restore.');}
    const operation={operationId:body.operationId,projectId:body.projectId || uuid(),teamId:m.teamId,userId:m.userId,
      baseRevision:body.baseRevision,name:body.name.trim(),fingerprint,restoreRevision:body.restoreRevision ?? null,createdAt:now(),expiresAt:Math.floor(now()/1000)+86400};
    // Conditional creation also handles two simultaneous retries of preparation.
    await store.createOperation(operation);
    existing=await store.operation(m.teamId,body.operationId);
    if(existing.userId!==m.userId || existing.fingerprint!==fingerprint)fail(409,'Operation ID was already used for a different save.');
    return existing;
  }
  const stageKey=op=>'staging/'+op.teamId+'/'+op.userId+'/'+op.operationId;
  const snapshotKey=op=>'revisions/'+op.teamId+'/'+op.projectId+'/'+op.operationId+'.json';
  async function commit(m,op){
    if(op.userId!==m.userId)fail(403,'This upload belongs to another account.');
    const completed=await store.receipt(m.teamId,op.operationId);if(completed)return completed;
    if(op.expiresAt*1000<now())fail(410,'Upload expired. Save a new copy or retry a fresh save.');
    const current=await store.project(m.teamId,op.projectId);
    if((current?.revision || 0)!==op.baseRevision)fail(409,'Project changed online.',{current:current && publicProject(current)});
    let value=await objects.readImmutable(snapshotKey(op));
    if(!value){
      if(op.restoreRevision){const prior=await store.revision(m.teamId,op.projectId,op.restoreRevision);if(!prior)fail(404,'Revision not found.');value=await objects.readImmutable(prior.key);}
      else value=await objects.readUpload(stageKey(op),LIMITS.envelope);
      if(!value)fail(400,'Upload is missing. Retry the save.');
      value=envelope(value);
      // Freeze validated bytes with a conditional write. A reusable signed PUT
      // can only mutate staging; it never names a committed revision. The first
      // finalized candidate wins across races and uncertain network retries.
      await objects.freeze(snapshotKey(op),value);
      value=envelope(await objects.readImmutable(snapshotKey(op)));
    }
    const result={projectId:op.projectId,name:op.name,revision:op.baseRevision+1,updatedAt:now(),updatedBy:m.userId};
    const record={...result,teamId:m.teamId,key:snapshotKey(op),restoredFrom:op.restoreRevision};
    try{await store.commit(op,record,result);}
    catch(error){
      const receipt=await store.receipt(m.teamId,op.operationId);if(receipt)return receipt;
      const latest=await store.project(m.teamId,op.projectId);
      if((latest?.revision || 0)!==op.baseRevision)fail(409,'Project changed online.',{current:latest && publicProject(latest)});
      throw error; // Object may be orphaned, but no phantom revision exists.
    }
    return result;
  }
  return {async request(subject,method,path,body={}){
    const m=await member(subject,method!=='GET');
    const parts=path.split('/').filter(Boolean);
    if(method==='GET' && path==='/me')return {userId:m.userId,teamId:m.teamId,role:m.role,name:m.name || m.userId};
    if(method==='GET' && path==='/projects')return {projects:(await store.projects(m.teamId)).map(publicProject)};
    if(method==='POST' && path==='/uploads'){
      const op=await prepare(m,body),receipt=await store.receipt(m.teamId,op.operationId);
      if(receipt)return {operationId:op.operationId,committed:receipt};
      if(op.expiresAt*1000<now())fail(410,'Upload expired.');
      return {operationId:op.operationId,projectId:op.projectId,uploadUrl:await objects.uploadURL(stageKey(op)),maxBytes:LIMITS.envelope};
    }
    if(method==='POST' && parts[0]==='uploads' && parts.length===3 && parts[2]==='commit'){
      if(!id(parts[1]))fail(400,'Invalid operation ID.');fields(body,[]);
      const op=await store.operation(m.teamId,parts[1]);if(!op)fail(404,'Upload not found.');return commit(m,op);
    }
    if(parts[0]==='projects' && parts.length>=2){
      const p=await project(m,parts[1]);
      if(method==='GET' && parts.length===2)return {...publicProject(p),downloadUrl:await objects.downloadURL(p.key)};
      if(method==='GET' && parts[2]==='revisions' && parts.length===3)return {revisions:(await store.revisions(m.teamId,p.projectId)).map(r=>({...publicProject(r),restoredFrom:r.restoredFrom}))};
      if(method==='POST' && parts[2]==='restore' && parts.length===3){
        fields(body,['operationId','baseRevision','revision']);
        const op=await prepare(m,{operationId:body.operationId,projectId:p.projectId,baseRevision:body.baseRevision,name:p.name,restoreRevision:body.revision});
        return commit(m,op);
      }
    }
    fail(404,'Route not found.');
  }};
}
