/* CI seeding from the processed catalog. Definition strings are data, never URLs to fetch. */
import {fetchBackstageEntities} from '../canon/backstage.mjs';
import {parseDocuments} from './repositories.mjs';

export async function loadBackstageCatalog(options) {
  const entities=await fetchBackstageEntities(options),ids=new Set();
  for(const entity of entities) {
    if(!entity || !['component','api'].includes(entity.kind?.toLowerCase()) || !entity.metadata?.name)throw new Error('Expected a processed Component or API entity.');
    const id=(entity.kind+':'+(entity.metadata.namespace||'default')+'/'+entity.metadata.name).toLowerCase();
    if(ids.has(id))throw new Error('Duplicate catalog entity: '+id);
    ids.add(id);
    if(entity.kind.toLowerCase()==='api' && entity.spec?.type==='openapi') {
      if(typeof entity.spec.definition==='string') {
        const parsed=parseDocuments(entity.spec.definition,id+' definition');
        if(parsed.length!==1)throw new Error('Expected one OpenAPI definition: '+id);
        entity.spec.definition=parsed[0];
      }
      for(const item of Object.values(entity.spec.definition?.paths || {})) {
        if(item?.$ref || Object.values(item||{}).some(op=>op && typeof op==='object' && op.$ref))throw new Error('Resolve OpenAPI path/operation references in Backstage before exporting '+id);
      }
    }
  }
  return {entities,appUrl:options.appUrl};
}
