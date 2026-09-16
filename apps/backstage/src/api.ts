import type { DiscoveryApi, FetchApi } from '@backstage/frontend-plugin-api';

export interface DiagramStep { id: string; position: number; title: string; url: string }
export interface DiagramSection {
  reference: string; title: string; url: string;
  nodes: Array<{id: string; title: string; relationship: string}>;
  paths: Array<{id: string; label: string; steps: DiagramStep[]}>;
}
export interface AssociatedDiagram {
  id: string; title: string; kind: 'canonical' | 'design'; owner: string; revision: string;
  viewerUrl: string; editUrl: string; sections: DiagramSection[];
  designDocument?: {url: string; label: string};
}
export interface EntityDiagrams { version: 1; entityRef: string; revision: string; diagrams: AssociatedDiagram[] }
export type DiagramLoader = (entityRef: string, signal: AbortSignal) => Promise<EntityDiagrams>;

export function createDiagramLoader(discovery: DiscoveryApi, fetchApi: FetchApi, proxyPath='/flowview'): DiagramLoader {
  if(!/^\/[a-z0-9/_-]+$/i.test(proxyPath))throw new Error('Configure flowview.proxyPath as a Backstage proxy route.');
  return async(entityRef,signal)=>{
    // Discover on every refresh: do not capture a stale backend URL or put an
    // upstream service token in frontend configuration.
    const base=await discovery.getBaseUrl('proxy');
    const response=await fetchApi.fetch(base+proxyPath.replace(/\/$/,'')+'/entity-diagrams?entityRef='+encodeURIComponent(entityRef),{signal});
    if(!response.ok)throw new Error('Diagram lookup failed ('+response.status+').');
    const data=await response.json();
    if(data?.version!==1 || data.entityRef!==entityRef || typeof data.revision!=='string' || !Array.isArray(data.diagrams))throw new Error('Invalid entity diagram response.');
    for(const diagram of data.diagrams){
      if(!diagram || typeof diagram.id!=='string' || typeof diagram.title!=='string' || !['canonical','design'].includes(diagram.kind) || typeof diagram.owner!=='string' || typeof diagram.viewerUrl!=='string' || typeof diagram.editUrl!=='string' || !Array.isArray(diagram.sections))throw new Error('Invalid diagram entry.');
      for(const section of diagram.sections){
        if(!section || typeof section.reference!=='string' || typeof section.title!=='string' || typeof section.url!=='string' || !Array.isArray(section.nodes) || !Array.isArray(section.paths))throw new Error('Invalid diagram section.');
        if(section.nodes.some((node: {id?: unknown; title?: unknown} | null)=>!node || typeof node.id!=='string' || typeof node.title!=='string'))throw new Error('Invalid diagram node.');
        for(const path of section.paths){
          if(!path || typeof path.id!=='string' || typeof path.label!=='string' || !Array.isArray(path.steps) || path.steps.some((step: Partial<DiagramStep> | null)=>!step || typeof step.id!=='string' || typeof step.title!=='string' || typeof step.url!=='string' || !Number.isInteger(step.position)))throw new Error('Invalid diagram path.');
        }
      }
      if(diagram.designDocument && (typeof diagram.designDocument.url!=='string' || typeof diagram.designDocument.label!=='string'))throw new Error('Invalid design document.');
    }
    return data;
  };
}
