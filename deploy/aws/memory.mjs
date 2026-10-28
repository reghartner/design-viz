// Only the loopback mock and tests import this adapter. Production Lambda has
// no fake-token parser, mock-user list or environment switch for fake auth.
import {HttpError} from './service.mjs';
export function memoryAdapters(){
  const members=new Map(),projects=new Map(),operations=new Map(),revisions=new Map(),receipts=new Map(),uploads=new Map(),snapshots=new Map();
  const key=(...v)=>v.join('|'),clone=v=>v==null?v:structuredClone(v);
  const faults={upload:false,freeze:false,commit:false};
  const store={
    member:async sub=>clone(members.get(sub)),project:async(t,p)=>clone(projects.get(key(t,p))),
    projects:async t=>[...projects.values()].filter(p=>p.teamId===t).map(clone),
    operation:async(t,o)=>clone(operations.get(key(t,o))),receipt:async(t,o)=>clone(receipts.get(key(t,o))),
    createOperation:async op=>{if(!operations.has(key(op.teamId,op.operationId)))operations.set(key(op.teamId,op.operationId),clone(op));},
    revision:async(t,p,r)=>clone(revisions.get(key(t,p,r))),
    revisions:async(t,p)=>[...revisions.values()].filter(r=>r.teamId===t && r.projectId===p).sort((a,b)=>b.revision-a.revision).map(clone),
    commit:async(op,record,result)=>{
      if(faults.commit)throw Error('Injected database failure.');
      if((projects.get(key(op.teamId,op.projectId))?.revision || 0)!==op.baseRevision || receipts.has(key(op.teamId,op.operationId)))throw Error('Conditional transaction failed.');
      projects.set(key(op.teamId,op.projectId),clone(record));revisions.set(key(op.teamId,op.projectId,record.revision),clone(record));receipts.set(key(op.teamId,op.operationId),clone(result));
    }
  };
  const objects={
    uploadURL:async key=>'/objects/upload/'+encodeURIComponent(key),downloadURL:async key=>'/objects/read/'+encodeURIComponent(key),
    readUpload:async(k,max)=>{const raw=uploads.get(k);if(raw==null)return null;if(Buffer.byteLength(raw)>max)throw new HttpError(400,'Upload too large.');try{return JSON.parse(raw);}catch{throw new HttpError(400,'Malformed upload.');}},
    readImmutable:async k=>clone(snapshots.get(k)),
    freeze:async(k,v)=>{if(faults.freeze)throw Error('Injected snapshot failure.');if(!snapshots.has(k))snapshots.set(k,clone(v));}
  };
  return {store,objects,members,projects,operations,revisions,receipts,uploads,snapshots,faults};
}
