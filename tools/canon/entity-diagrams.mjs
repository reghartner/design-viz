/* Derived index: explicit catalog bindings are the association source of truth.
   Callers must supply only specs the current viewer is authorized to read. */
import C from './core.cjs';
import {digest} from './drift.mjs';

export function normalizeEntityRef(value){
  if(!C.entityRef(value))throw new Error('Use a full entity reference: kind:namespace/name.');
  return value.toLowerCase();
}
export function buildEntityDiagramIndex(specs,{publicBaseUrl=''}={}){
  if(publicBaseUrl && (!C.http(publicBaseUrl) || new URL(publicBaseUrl).search || new URL(publicBaseUrl).hash))throw new Error('Configure an HTTP(S) public base URL without credentials, query or fragment.');
  const base=(C.http(publicBaseUrl) || '').replace(/\/$/,''),routing=C.viewerRouting(),entities=new Map(),ids=new Set();
  for(const spec of specs){
    const errors=C.validateSpec(spec).errors;if(errors.length)throw new Error(errors.join('\n'));
    const page=C.pageOf(spec),canon=page.canon;
    if(!canon || ids.has(canon.id))throw new Error('Indexed diagrams require unique page.canon IDs.');ids.add(canon.id);
    const revision=digest(spec),specUrl=base+'/api/canon/specs/'+encodeURIComponent(canon.id);
    const viewerUrl=base+'/template/flowview.html?spec='+encodeURIComponent(specUrl)+'&v='+revision+'&layout=backstage';
    const editUrl=base+'/workbench/flowspec.html?canon='+encodeURIComponent(canon.id)+'&layout=backstage';
    // Includes prose-only sections and every tab, exactly as the viewer counts
    // and names them. Duplicate/numeric headings use its canonical references.
    const sections=[];
    for(const block of routing.blocksOf(page)){
      if(block.type==='section')sections.push(block.sec);
      else for(const tab of block.tabs)sections.push(...tab.sections);
    }
    const references=routing.sectionReferences(sections.map(s=>s.heading));
    sections.forEach((section,sectionIndex)=>{
      const d=section.diagram;if(!d)return;
      const matches=new Map(),nodes=d.nodes || {};
      for(const [id,node] of Object.entries(nodes)){
        if(!node.binding)continue;
        const bindings=[{ref:node.binding.entityRef,relationship:'service'},{ref:node.binding.api?.entityRef,relationship:'api'}];
        for(const binding of bindings){
          if(!binding.ref)continue;const ref=normalizeEntityRef(binding.ref);
          if(!matches.has(ref))matches.set(ref,[]);
          matches.get(ref).push({id,title:node.title || id,relationship:binding.relationship});
        }
      }
      const reference=references[sectionIndex],url=viewerUrl+routing.buildHash({d:reference});
      for(const [entityRef,matchedNodes] of matches){
        if(!entities.has(entityRef))entities.set(entityRef,new Map());
        const diagrams=entities.get(entityRef);
        if(!diagrams.has(canon.id)){
          diagrams.set(canon.id,{id:canon.id,title:page.title || canon.id,kind:canon.kind,owner:canon.owner,revision,viewerUrl,editUrl,sections:[],
            ...(C.http(page.generatedFrom?.url)?{designDocument:{url:C.http(page.generatedFrom.url),label:page.generatedFrom.label || 'Design document'}}:{})});
        }
        const nodeIds=new Set(matchedNodes.map(n=>n.id));
        const paths=[];
        for(const path of d.view==='ambient-only'?[]:routing.diagramPathList(d)){
          const ids=path.indices.map(index=>d.steps[index]?.id),steps=[];
          path.indices.forEach((sourceIndex,position)=>{
            const step=d.steps[sourceIndex],involved=new Set(step.nodes || []);
            for(const key of [...routing.stepKeys(step),...Object.keys(routing.stepFailures(step))]){
              const edge=(d.edges || []).find(e=>e.from+'->'+e.to===key);
              if(edge){involved.add(edge.from);involved.add(edge.to);}
            }
            for(const nodeId of Object.keys(step.tone || {}))involved.add(nodeId);
            if(step.traceMatch?.nodeId)involved.add(step.traceMatch.nodeId);
            for(const condition of step.conditions || [])if(condition.nodeId)involved.add(condition.nodeId);
            if(![...nodeIds].some(id=>involved.has(id)))return;
            const stepRef=routing.stepReference(ids,position);
            steps.push({id:step.id || stepRef,position:position+1,title:step.title || step.text || 'Step '+(position+1),
              url:viewerUrl+routing.buildHash({d:reference,m:'step',p:path.id,s:stepRef})});
          });
          if(steps.length)paths.push({id:path.id,label:path.label,steps});
        }
        diagrams.get(canon.id).sections.push({reference,title:section.heading || 'Diagram '+(sectionIndex+1),url,nodes:matchedNodes,paths});
      }
    });
  }
  const byEntity=Object.fromEntries([...entities].sort(([a],[b])=>a.localeCompare(b)).map(([ref,diagrams])=>[ref,[...diagrams.values()].sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id))]));
  return {version:1,revision:digest(byEntity),entities:byEntity};
}
export function diagramsForEntity(index,entityRef){
  const ref=normalizeEntityRef(entityRef),diagrams=index.entities[ref] || [];
  return {version:1,entityRef:ref,revision:digest(diagrams),diagrams};
}
