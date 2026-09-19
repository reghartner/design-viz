/* Read catalog files as data. All remote requests go to the configured GitHub
   API; descriptor URLs never choose a network host or execute source code. */
import {parseAllDocuments} from 'yaml';
import {readFile, realpath} from 'node:fs/promises';
import path from 'node:path';

const MAX_FILE=2_000_000, MAX_TOTAL=50_000_000, MAX_FILES=500;
const object=value=>value && typeof value==='object' && !Array.isArray(value);
function httpBase(value,label){
  let u;try{u=new URL(value);}catch{throw new Error('Invalid '+label);}
  if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw new Error('Invalid '+label);
  return u.href.replace(/\/$/,'');
}
function filePath(value,base=''){
  if(typeof value!=='string'||!value||value.includes('\\')||/[\x00-\x1f?#]/.test(value)||value.startsWith('/')||/^[a-z]+:/i.test(value))throw new Error('Expected a repository-relative file path.');
  const result=path.posix.normalize(path.posix.join(base,value));
  if(result==='..'||result.startsWith('../')||result==='.')throw new Error('Catalog reference escapes its repository.');
  return result;
}
export function parseDocuments(text,label){
  if(Buffer.byteLength(text)>MAX_FILE)throw new Error('Catalog file exceeds 2 MB: '+label);
  const docs=parseAllDocuments(text,{uniqueKeys:true,version:'1.2'});
  return docs.map(doc=>{
    if(doc.errors.length||doc.warnings.length)throw new Error('Invalid or unsupported YAML in '+label);
    return doc.toJS({maxAliasCount:100});
  }).filter(value=>value!==null);
}
export async function loadRepositoryCatalog(config,reader){
  if(config?.version!==1 || !Array.isArray(config.sources) || !config.sources.length)throw new Error('Catalog sources: expected version 1 and a nonempty sources list.');
  const appUrl=httpBase(config.backstageAppUrl,'Backstage app URL'),webUrl=httpBase(config.githubUrl||'https://github.com','GitHub URL');
  const repositories=new Map(),entities=[],seen=new Set(),active=new Set(),cache=new Map();let bytes=0;
  for(const source of config.sources){
    if(!object(source)||!/^[-\w.]+\/[-\w.]+$/.test(source.repository)||source.repository.split('/').some(p=>p==='.'||p==='..')||repositories.has(source.repository)||!Array.isArray(source.paths)||!source.paths.length)throw new Error('Each source needs a unique owner/repository and catalog paths.');
    if(source.ref!==undefined && (typeof source.ref!=='string'||!source.ref.trim()))throw new Error('Invalid source ref.');
    const pin=await reader.pin(source.repository,source.ref);
    if(!pin || typeof pin.revision!=='string'||!pin.revision)throw new Error('Source did not resolve to a revision.');
    repositories.set(source.repository,{...source,...pin,paths:source.paths.map(p=>filePath(p))});
  }
  function target(value,from){
    if(typeof value!=='string')throw new Error('Catalog target must be a file path.');
    if(/^https?:\/\//i.test(value)){
      for(const source of repositories.values()){
        const prefix=webUrl+'/'+source.repository+'/blob/';
        for(const ref of [source.ref,source.revision]){
          if(ref && value.startsWith(prefix+ref+'/'))return {repository:source.repository,path:filePath(value.slice((prefix+ref+'/').length))};
        }
      }
      throw new Error('URL target is outside the configured repositories and refs. Add it to catalog-sources.json.');
    }
    return {repository:from.repository,path:filePath(value,path.posix.dirname(from.path))};
  }
  async function textAt(file){
    const key=file.repository+':'+file.path;
    if(cache.has(key))return cache.get(key);
    if(cache.size>=MAX_FILES)throw new Error('Catalog exceeds 500 source files.');
    const pending=(async()=>{
      const source=repositories.get(file.repository),text=await reader.file(file.repository,source.revision,file.path);
      if(typeof text!=='string'||Buffer.byteLength(text)>MAX_FILE)throw new Error('Invalid or oversized source file: '+file.path);
      bytes+=Buffer.byteLength(text);if(bytes>MAX_TOTAL)throw new Error('Catalog source data exceeds 50 MB.');
      return text;
    })();
    cache.set(key,pending);return pending;
  }
  async function substitute(value,from,depth=0){
    if(depth>40)throw new Error('Catalog substitution depth exceeded (possible cycle).');
    if(!value||typeof value!=='object')return value;
    if(Array.isArray(value))return Promise.all(value.map(v=>substitute(v,from,depth+1)));
    const directive=['$text','$json','$yaml'].find(key=>Object.hasOwn(value,key));
    if(directive){
      if(Object.keys(value).length!==1)throw new Error('A catalog substitution must contain only its directive.');
      const file=target(value[directive],from),text=await textAt(file);
      if(directive==='$text')return text;
      const parsed=directive==='$json'?[JSON.parse(text)]:parseDocuments(text,file.path);
      if(parsed.length!==1)throw new Error('A substitution must resolve to one document.');
      return substitute(parsed[0],file,depth+1);
    }
    const result={};
    for(const [key,child] of Object.entries(value))Object.defineProperty(result,key,{value:await substitute(child,from,depth+1),enumerable:true,writable:true,configurable:true});
    return result;
  }
  function checkExternalRefs(value,depth=0){
    if(depth>40)throw new Error('API nesting is too deep.');
    if(!value||typeof value!=='object')return;
    if(typeof value.$ref==='string'&&!value.$ref.startsWith('#'))throw new Error('Bundle external OpenAPI $ref files before catalog sync.');
    for(const child of Object.values(value))checkExternalRefs(child,depth+1);
  }
  async function visit(file){
    const key=file.repository+':'+file.path;
    if(active.has(key))throw new Error('Catalog Location cycle: '+file.path);
    if(seen.has(key))return;
    active.add(key);
    for(const raw of parseDocuments(await textAt(file),key)){
      const entity=await substitute(raw,file);
      if(!object(entity)||typeof entity.kind!=='string'||!entity.metadata?.name)throw new Error('Expected a catalog entity in '+key);
      if(entity.kind.toLowerCase()==='location'){
        if(entity.spec?.type && !['url','file'].includes(entity.spec.type))throw new Error('Unsupported Location type in '+key);
        const targets=entity.spec?.targets || (entity.spec?.target?[entity.spec.target]:[]);
        if(!Array.isArray(targets)||!targets.length)throw new Error('Location has no catalog targets: '+key);
        for(const next of targets)await visit(target(next,file));
      }else if(['component','api'].includes(entity.kind.toLowerCase())){
        if(entity.kind.toLowerCase()==='api'&&entity.spec?.type==='openapi'){
          if(typeof entity.spec.definition==='string'){
            const definitions=parseDocuments(entity.spec.definition,key+' API definition');
            if(definitions.length!==1)throw new Error('Expected one OpenAPI definition in '+key);
            entity.spec.definition=definitions[0];
          }
          checkExternalRefs(entity.spec.definition);
          for(const item of Object.values(entity.spec.definition?.paths || {})){
            if(item?.$ref || Object.values(item||{}).some(op=>object(op)&&op.$ref))throw new Error('Resolve OpenAPI path/operation $ref values before catalog sync.');
          }
        }
        entities.push(entity);
      }
    }
    active.delete(key);seen.add(key);
  }
  for(const source of repositories.values())for(const catalogPath of source.paths)await visit({repository:source.repository,path:catalogPath});
  const ids=new Set();
  for(const entity of entities){const id=(entity.kind+':'+(entity.metadata.namespace||'default')+'/'+entity.metadata.name).toLowerCase();if(ids.has(id))throw new Error('Duplicate catalog entity: '+id);ids.add(id);}
  return {entities,appUrl,files:cache.size,revisions:[...repositories.values()].map(s=>({repository:s.repository,revision:s.revision}))};
}
export function githubReader({token,apiUrl='https://api.github.com',fetchImpl=fetch}={}){
  if(!token)throw new Error('Set FLOWVIEW_CATALOG_SOURCE_TOKEN for read access to the listed source repositories.');
  const api=httpBase(apiUrl,'GitHub API URL');
  async function get(route){
    const response=await fetchImpl(api+route,{redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
    if(!response.ok)throw new Error('GitHub source read failed ('+response.status+').');
    return response.json();
  }
  return {
    async pin(repository,ref){
      const route='/repos/'+repository.split('/').map(encodeURIComponent).join('/');
      if(!ref)ref=(await get(route)).default_branch;
      const revision=(await get(route+'/commits/'+encodeURIComponent(ref))).sha;
      if(!/^[a-f0-9]{40,64}$/i.test(revision))throw new Error('GitHub ref did not resolve to an immutable commit.');
      return {ref,revision};
    },
    async file(repository,revision,filename){
      const data=await get('/repos/'+repository.split('/').map(encodeURIComponent).join('/')+'/contents/'+filename.split('/').map(encodeURIComponent).join('/')+'?ref='+encodeURIComponent(revision));
      if(data.type!=='file'||data.encoding!=='base64'||typeof data.content!=='string'||data.size>MAX_FILE)throw new Error('Expected a regular source file of at most 2 MB.');
      return Buffer.from(data.content,'base64').toString('utf8');
    }
  };
}
export function localReader(root){
  return {
    async pin(repository,ref){return {ref:ref||'local',revision:'local-fixture'};},
    async file(repository,revision,filename){
      const base=await realpath(path.join(root,repository)),resolved=await realpath(path.join(base,filename));
      if(!resolved.startsWith(base+path.sep))throw new Error('Fixture path escapes its repository.');
      return readFile(resolved,'utf8');
    }
  };
}
