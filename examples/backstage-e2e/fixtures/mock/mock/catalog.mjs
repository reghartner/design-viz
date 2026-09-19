import {readFile} from 'node:fs/promises';
import {parseAllDocuments} from 'yaml';
import {createHash} from 'node:crypto';
const ref=e=>(e.kind+':'+(e.metadata.namespace||'default')+'/'+e.metadata.name).toLowerCase();
export async function entities(){
 const docs=parseAllDocuments(await readFile(new URL('../catalog/entities.yaml',import.meta.url),'utf8')).map(d=>d.toJS());
 for(const e of docs){
  e.metadata.uid=createHash('sha256').update(ref(e)).digest('hex').slice(0,32);
  e.metadata.etag=createHash('sha256').update(JSON.stringify(e)).digest('hex');
  e.relations=[];
  if(e.spec.owner)e.relations.push({type:'ownedBy',targetRef:e.spec.owner});
  for(const api of e.spec.providesApis||[])e.relations.push({type:'providesApi',targetRef:'api:'+e.metadata.namespace+'/'+api});
  if(e.kind==='API'){
   const file=e.spec.definition.$text;
   e.spec.definition=await readFile(new URL('../catalog/'+file,import.meta.url),'utf8');
   for(const c of docs)if(c.spec.providesApis?.includes(e.metadata.name))e.relations.push({type:'apiProvidedBy',targetRef:ref(c)});
  }
 }
 return docs.sort((a,b)=>ref(a).localeCompare(ref(b)));
}
export function queryEntities(all,params){
 let offset=0,filters=params.getAll('filter'),limit=Number(params.get('limit')||20),fields=params.get('fields');
 if(params.has('cursor')){
  let c;try{c=JSON.parse(Buffer.from(params.get('cursor'),'base64url'));}catch{throw new Error('Invalid cursor');}
  if(c.version!==1||!Number.isInteger(c.offset)||c.offset<0||!Array.isArray(c.filters))throw new Error('Invalid cursor');
  ({offset,filters,limit,fields}=c);
 }
 if(!Number.isInteger(limit)||limit<1||limit>500)throw new Error('limit must be 1..500');
 const supported=new Set(['kind','metadata.name','metadata.namespace','spec.type']);
 const value=(o,key)=>key.split('.').reduce((v,k)=>v?.[k],o);
 const groups=filters.map(filter=>filter.split(',').map(term=>{
  const index=term.indexOf('='),key=index<0?term:term.slice(0,index),expected=index<0?null:term.slice(index+1);
  if(!supported.has(key))throw new Error('Unsupported mock filter: '+key);
  return {key,expected};
 }));
 const selected=all.filter(e=>!groups.length||groups.some(g=>g.every(({key,expected})=>expected===null?value(e,key)!==undefined:String(value(e,key)||'').toLowerCase()===expected.toLowerCase())));
 const project=e=>{
  if(!fields)return e;const out={};
  for(const key of fields.split(',')){const val=value(e,key);if(val===undefined)continue;const keys=key.split('.');if(keys.some(k=>['__proto__','constructor','prototype'].includes(k)))throw new Error('Invalid field');let dst=out;keys.forEach((k,i)=>{if(i===keys.length-1)dst[k]=val;else dst=dst[k]??={};});}
  return out;
 };
 const cursor=next=>Buffer.from(JSON.stringify({version:1,offset:next,filters,limit,fields})).toString('base64url');
 return {items:selected.slice(offset,offset+limit).map(project),totalItems:selected.length,pageInfo:{...(offset+limit<selected.length?{nextCursor:cursor(offset+limit)}:{}),...(offset?{prevCursor:cursor(Math.max(0,offset-limit))}:{})}};
}
