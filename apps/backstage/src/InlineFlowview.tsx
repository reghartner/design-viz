import type { AssociatedDiagram, SpecLoader } from './api/types';
import { FlowviewCompatibility } from './generated/compatibility';
import type { NativeViewerOptions } from './generated/nativeViewer';
import { useInlineViewer } from './hooks/useInlineViewer';
import type { ViewerTarget } from './viewer/protocol';
import { useRef, useState } from 'react';
import { CanvasFrame } from './components/CanvasFrame';
import { EvidenceLink } from './components/EvidenceLink';
import { workspaceLink } from './viewer/workspaceLink';
export type { ViewerTarget } from './viewer/protocol';

export function InlineFlowview({
  diagram,
  loadSpec,
  target,
  resolveDiagramLink,
  entityRef,
}: {
  diagram: AssociatedDiagram;
  loadSpec: SpecLoader;
  target?: ViewerTarget;
  resolveDiagramLink?: NativeViewerOptions['resolveDiagramLink'];
  entityRef?: string;
}) {
  const [expandedRevision, setExpandedRevision] = useState<string>();
  const identity = diagram.id + '|' + diagram.revision;
  const expanded = expandedRevision === identity;
  const [position, setPosition] = useState<{identity: string; target: ViewerTarget | null}>();
  const toggle = useRef<HTMLButtonElement>(null);
  const close = () => { setExpandedRevision(undefined); requestAnimationFrame(() => toggle.current?.focus()); };
  const {
    state,
    renderError,
    rendered,
    host,
    retry,
  } = useInlineViewer(diagram, loadSpec, target, resolveDiagramLink, expanded,
    next => setPosition({identity, target: next}));
  const address = position?.identity === identity ? position.target : target;
  const compatibility =
    state.spec === undefined
      ? undefined
      : FlowviewCompatibility.check(state.spec);
  return (
    <div aria-label="Inline diagram viewer">
      <CanvasFrame expanded={expanded} onClose={close} title={diagram.title}>
      <div style={expanded ? {position:'absolute',top:12,left:12,right:12,zIndex:100,
        display:'flex',alignItems:'center',gap:12,flexWrap:'wrap',pointerEvents:'none'} :
        {display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap',marginBottom:16}}>
        {!expanded && <h3 style={{margin:0,fontSize:22}}>{diagram.title}</h3>}
        <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap',pointerEvents:'auto',
          background:'#fff',border:'1px solid #dce1f1',borderRadius:10,padding:8,boxShadow:expanded?'0 4px 18px #14244212':undefined}}>
          <button ref={toggle} disabled={!rendered} onClick={() => expanded ? close() : setExpandedRevision(identity)}>
            {expanded ? 'Back to entity' : 'Explore canvas'}
          </button>
          <EvidenceLink prominent url={workspaceLink(diagram.editUrl, diagram, address, entityRef, 'build')}>Build with Claude</EvidenceLink>
          <details style={{position:'relative'}}><summary style={{cursor:'pointer'}}>More</summary><div style={{position:'absolute',right:0,top:'100%',zIndex:120,minWidth:190,display:'grid',gap:12,padding:14,border:'1px solid #dce1f1',borderRadius:8,background:'#fff',boxShadow:'0 4px 18px #14244212'}}>
            <EvidenceLink url={workspaceLink(diagram.viewerUrl, diagram, address, entityRef, 'view')}>Open standalone viewer</EvidenceLink>
            <EvidenceLink url={workspaceLink(diagram.editUrl, diagram, address, entityRef, 'edit')}>Edit in workbench</EvidenceLink>
          </div></details>
        </div>
      </div>
      <div style={expanded ? {position:'absolute',left:12,bottom:12,zIndex:110,maxWidth:540,maxHeight:'35vh',overflow:'auto',background:'#fff',borderRadius:8} : undefined}>
      {state.loading && <p role="status">Loading diagram…</p>}
      {(state.error || renderError) && (
        <div role="alert">
          <p>{state.error || renderError}</p>
          <button onClick={retry}>Retry diagram</button>
        </div>
      )}
      {compatibility && compatibility.messages.length > 0 && (
        <aside
          role="alert"
          aria-label="Flowview compatibility"
          style={{
            padding: 16,
            marginBottom: 16,
            border: '1px solid #b7791f',
            borderRadius: 8,
            background: '#fff5d6',
            color: '#59400a',
          }}
        >
          <strong>
            {compatibility.status === 'unsupported'
              ? 'Flowview upgrade required'
              : 'This diagram may be incomplete'}
          </strong>
          {compatibility.messages.map((message) => (
            <p key={message}>{message}</p>
          ))}
          <p>
            Backstage has Flowview {compatibility.runtimeVersion}. Contact your
            Backstage administrator to upgrade Flowview.
          </p>
        </aside>
      )}
      </div>
      {state.spec !== undefined && compatibility?.status !== 'unsupported' && (
        <>
          {!rendered && !renderError && (
            <p role="status">Starting diagram viewer…</p>
          )}
          <div
            ref={host}
            role="region"
            aria-label={'Flowview: ' + diagram.title}
            title={'Flowview: ' + diagram.title}
            data-flowview-native=""
            style={{ display: 'block', width: '100%', minWidth: 0, borderRadius: 8 }}
          />
        </>
      )}
      </CanvasFrame>
    </div>
  );
}
