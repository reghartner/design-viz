/* Company-side catalog adapter. Host and service token come from server config,
   never from a diagram or a browser. No catalog writes or live API invocation. */
import C from './core.cjs';
function ref(entity){return (entity.kind+':'+(entity.metadata.namespace || 'default')+'/'+entity.metadata.name).toLowerCase();}
function qualify(value,kind,ns='default'){
  if(typeof value!=='string')return '';
  const typed=value.includes(':')?value:kind+':'+value;
  return (typed.includes('/')?typed:typed.replace(':',':'+ns+'/')).toLowerCase();
}
export function catalogFromEntities(entities,baseUrl){
  const warnings=[],apis=new Map(entities.filter(e=>e.kind?.toLowerCase()==='api').map(a=>[ref(a),a]));
  const entityUrl=e=>baseUrl.replace(/\/$/,'')+'/catalog/'+encodeURIComponent(e.metadata.namespace || 'default')+'/'+e.kind.toLowerCase()+'/'+encodeURIComponent(e.metadata.name);
  const services=entities.filter(e=>e.kind?.toLowerCase()==='component').map(e=>{
    const annotations=e.metadata.annotations || {},ns=e.metadata.namespace || 'default';
    const provided=(e.relations || []).filter(r=>r.type==='providesApi').map(r=>r.targetRef).concat(e.spec?.providesApis || []);
    return {entityRef:ref(e),title:e.metadata.title || e.metadata.name,owner:qualify(e.spec?.owner,'group',ns),catalogUrl:entityUrl(e),
      telemetry:{serviceName:annotations['flowview.io/telemetry-service'] || e.metadata.name},
      apis:[...new Set(provided.map(a=>qualify(a,'api',ns)))].map(id=>{
        const a=apis.get(id);if(!a){warnings.push('API '+id+' was not returned by the catalog.');return null;}
        const result={entityRef:id,title:a.metadata.title || a.metadata.name,definitionUrl:entityUrl(a),endpoints:{},operations:[]};
        if(a.spec?.type==='openapi'){
          try{
            const definition=typeof a.spec.definition==='string'?JSON.parse(a.spec.definition):a.spec.definition;
            if(!definition?.paths)throw new Error('No paths');
            for(const [route,methods] of Object.entries(definition.paths))for(const [method,op] of Object.entries(methods)){
              if(['get','post','put','patch','delete','head','options','trace'].includes(method) && op.operationId)result.operations.push({operationId:op.operationId,method:method.toUpperCase(),path:route});
            }
            for(const [i,server] of (definition.servers || []).entries())if(C.http(server.url))result.endpoints[server['x-environment'] || 'server-'+(i+1)]=server.url;
          }catch{warnings.push('API '+id+': operation picker requires a resolved OpenAPI JSON document; convert YAML in the company adapter.');}
        }
        return result;
      }).filter(Boolean)};
  });
  return {catalog:C.catalog({version:1,source:baseUrl,services}),warnings};
}
export async function fetchBackstageCatalog({backendUrl,appUrl,token,fetchImpl=fetch}){
  if(!C.http(backendUrl) || !C.http(appUrl) || !token)throw new Error('Configure Backstage backend/app URLs and a server-side token.');
  const entities=[];let cursor;
  for(let page=0;page<100;page++){
    const url=new URL(backendUrl.replace(/\/$/,'')+'/api/catalog/entities/by-query');url.searchParams.set('limit','500');if(cursor)url.searchParams.set('cursor',cursor);else{url.searchParams.append('filter','kind=component');url.searchParams.append('filter','kind=api');}
    const r=await fetchImpl(url,{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw new Error('Backstage catalog read failed ('+r.status+').');
    const data=await r.json();if(!Array.isArray(data.items))throw new Error('Invalid catalog response.');entities.push(...data.items);cursor=data.pageInfo?.nextCursor;
    if(!cursor)return catalogFromEntities(entities,appUrl);
  }
  throw new Error('Catalog exceeds the configured paging bound.');
}
