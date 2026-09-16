import React, {useCallback, useEffect, useRef, useState} from 'react';
import type {DiagramLoader, EntityDiagrams} from './api';

function EvidenceLink({url,children}: {url: string; children: React.ReactNode}){
  let safe: string | undefined;
  try{const parsed=new URL(url);if(['https:','http:'].includes(parsed.protocol) && !parsed.username && !parsed.password)safe=parsed.href;}catch{/* Invalid evidence is readable text, not an active link. */}
  return safe?<a href={safe} target="_blank" rel="noopener noreferrer">{children}</a>:<span>{children}</span>;
}
export function FlowviewEntityDiagrams({entityRef,loadDiagrams,refreshMs=60000}: {entityRef: string; loadDiagrams: DiagramLoader; refreshMs?: number}){
  const [state,setState]=useState<{ref: string; data?: EntityDiagrams; error?: string; loading: boolean}>({ref:entityRef,loading:true});
  const refresh=useRef<()=>void>(()=>{});
  useEffect(()=>{
    let stopped=false,controller: AbortController | undefined;
    async function update(){
      controller?.abort();controller=new AbortController();const current=controller;
      setState(previous=>({ref:entityRef,data:previous.ref===entityRef?previous.data:undefined,loading:true}));
      try{
        const data=await loadDiagrams(entityRef,current.signal);
        if(!stopped && !current.signal.aborted)setState({ref:entityRef,data,loading:false});
      }catch(e){if(!stopped && !current.signal.aborted)setState(previous=>({...previous,loading:false,error:e instanceof Error?e.message:'Unable to refresh diagrams.'}));}
    }
    const visibleUpdate=()=>{if(!document.hidden)void update();};
    refresh.current=()=>{void update();};void update();
    const timer=window.setInterval(visibleUpdate,Math.max(1000,refreshMs));
    window.addEventListener('focus',visibleUpdate);document.addEventListener('visibilitychange',visibleUpdate);
    return ()=>{stopped=true;controller?.abort();clearInterval(timer);window.removeEventListener('focus',visibleUpdate);document.removeEventListener('visibilitychange',visibleUpdate);};
  },[entityRef,loadDiagrams,refreshMs]);
  const onRefresh=useCallback(()=>refresh.current(),[]);
  const current=state.ref===entityRef?state:{ref:entityRef,loading:true},data=current.data;
  return <section aria-label="Associated diagrams" style={{padding:24}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
      <h2>Associated diagrams{data?' ('+data.diagrams.length+')':''}</h2>
      <button onClick={onRefresh} disabled={current.loading}>Refresh diagrams</button>
    </div>
    <p>Automatically linked from approved diagram bindings. Canonical flows and HLD designs appear together.</p>
    <p><code>{entityRef}</code></p>
    {current.loading && <p role="status">Refreshing diagrams…</p>}
    {current.error && <p role="alert">{current.error} {data?'Showing the last successful results; they may be out of date.':'No results are available yet.'}</p>}
    {data?.diagrams.length===0 && <p>No diagrams reference this entity yet. Bind a node to this catalog entity in the Flowview builder and approve the spec in the central repository. It will appear automatically.</p>}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,320px),1fr))',gap:20}}>
      {data?.diagrams.map(diagram=><article key={diagram.id} style={{border:'1px solid #8296a966',borderRadius:12,padding:20,minWidth:0}}>
        <p><strong>{diagram.kind==='canonical'?'CANONICAL':'HLD / DESIGN'}</strong> · {diagram.owner}</p>
        <h3>{diagram.title}</h3>
        <p style={{display:'flex',flexWrap:'wrap',gap:16}}><EvidenceLink url={diagram.viewerUrl}>Open diagram</EvidenceLink><EvidenceLink url={diagram.editUrl}>Open in builder</EvidenceLink>{diagram.designDocument && <EvidenceLink url={diagram.designDocument.url}>{diagram.designDocument.label}</EvidenceLink>}</p>
        {diagram.sections.map(section=><details key={section.reference} open>
          <summary>{section.title}</summary>
          <p>Appears as {section.nodes.map(n=>n.title).join(', ')}</p>
          {!section.paths.length && <EvidenceLink url={section.url}>Open this flow</EvidenceLink>}
          {section.paths.map(path=><div key={path.id}>
            <p><strong>{path.label}</strong></p>
            <ul>{path.steps.map(step=><li key={step.id+'-'+step.position}><EvidenceLink url={step.url}>{step.position}. {step.title}</EvidenceLink></li>)}</ul>
          </div>)}
        </details>)}
      </article>)}
    </div>
  </section>;
}
