const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
function link(text,url){const a=el('a',text);a.href=url;a.target='_blank';a.rel='noopener';return a;}
export function entityRefFromPath(pathname){
  const parts=pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if(parts[0]==='catalog' && parts.length===4)return (parts[2]+':'+parts[1]+'/'+parts[3]).toLowerCase();
  if(parts[0]==='apis' && parts.length===2)return 'api:default/'+parts[1].toLowerCase();
  return null;
}
export function renderServiceDirectory(host,services){
  host.replaceChildren();
  for(const service of services){
    const card=el('a',null,'service-card');card.href=service.catalogUrl;
    card.append(el('strong',service.title),el('span',service.entityRef,'entity-ref'),el('span',service.diagramCount+' associated diagram'+(service.diagramCount===1?'':'s')));host.append(card);
  }
}
export function renderEntityDiagrams(host,result,service,onPreview){
  host.replaceChildren();host.hidden=false;
  host.append(el('p','SERVICE DIAGRAMS','eyebrow'),el('h2',service?.title || result.entityRef),el('p',result.entityRef,'entity-ref'));
  const meta=el('p',result.diagrams.length+' associated diagram'+(result.diagrams.length===1?'':'s')+' · updates automatically from approved specs');host.append(meta);
  if(!result.diagrams.length)host.append(el('p','No diagrams reference this entity yet. Bind a diagram node to this exact catalog entity in the builder; the approved diagram will appear here automatically.','empty-state'));
  const cards=el('div',null,'entity-diagrams');
  for(const diagram of result.diagrams){
    const card=el('article',null,'diagram-card');card.append(el('p',(diagram.kind==='canonical'?'CANONICAL':'HLD / DESIGN')+' · '+diagram.owner,'eyebrow'),el('h3',diagram.title));
    const actions=el('div',null,'actions'),preview=el('button','Preview here','quiet');preview.onclick=()=>onPreview(diagram.id);actions.append(preview,link('Open diagram',diagram.viewerUrl),link('Open in builder',diagram.editUrl));
    if(diagram.designDocument)actions.append(link(diagram.designDocument.label,diagram.designDocument.url));card.append(actions);
    for(const section of diagram.sections){
      const details=el('details');details.open=true;details.append(el('summary',section.title));
      details.append(el('p','Appears as '+section.nodes.map(n=>n.title).join(', ')));
      if(!section.paths.length)details.append(link('Open this flow',section.url));
      for(const path of section.paths){
        const row=el('div',null,'service-steps');row.append(el('strong',path.label));
        for(const step of path.steps){const a=link(step.position+'. '+step.title,step.url);a.className='step-link';row.append(a);}details.append(row);
      }
      card.append(details);
    }
    cards.append(card);
  }
  host.append(cards);
}
