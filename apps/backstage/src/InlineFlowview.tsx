import type { AssociatedDiagram, SpecLoader } from './api/types';
import { FlowviewCompatibility } from './generated/compatibility';
import type { NativeViewerOptions } from './generated/nativeViewer';
import { useInlineViewer } from './hooks/useInlineViewer';
import type { ViewerTarget } from './viewer/protocol';
import { useLayoutEffect, useRef, useState } from 'react';
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
  const canvasActions = useRef<HTMLDivElement>(null);
  const close = () => { setExpandedRevision(undefined); requestAnimationFrame(() => toggle.current?.focus()); };
  const {
    state,
    renderError,
    rendered,
    host,
    retry,
  } = useInlineViewer(diagram, loadSpec, target, resolveDiagramLink, expanded,
    next => setPosition({identity, target: next}));
  useLayoutEffect(() => {
    const actions = canvasActions.current, canvas = host.current;
    if (!expanded || !rendered || !actions || !canvas) return;
    const measure = () => {
      const bounds = actions.getBoundingClientRect();
      canvas.style.setProperty('--flowview-host-actions-inline-offset', `${Math.ceil(bounds.width)}px`);
      canvas.style.setProperty('--flowview-host-actions-block-offset', `${Math.ceil(bounds.height)}px`);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(actions);
    return () => {
      observer?.disconnect();
      canvas.style.removeProperty('--flowview-host-actions-inline-offset');
      canvas.style.removeProperty('--flowview-host-actions-block-offset');
    };
  }, [expanded, rendered, host]);
  const address = position?.identity === identity ? position.target : target;
  const compatibility =
    state.spec === undefined
      ? undefined
      : FlowviewCompatibility.check(state.spec);
  return (
    <div aria-label="Inline diagram viewer">
      <style>{`
        .flowview-inline-actions :is(button,a,summary){box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:34px;margin:0;padding:6px 10px;border:1px solid #dce1f1;border-radius:7px;background:#fff;color:#27364b;font:500 12px/20px system-ui,sans-serif;text-decoration:none;white-space:nowrap;cursor:pointer;}
        .flowview-inline-actions :is(button,a,summary):hover{background:#f1f4fc;border-color:#bac7e4;}
        .flowview-inline-actions :is(button,a,summary):focus-visible{outline:2px solid #4956c9;outline-offset:2px;}
        .flowview-inline-actions button:disabled{opacity:.5;cursor:default;}
        .flowview-inline-actions summary{list-style:none;gap:7px;}
        .flowview-inline-actions summary::-webkit-details-marker{display:none;}
        .flowview-inline-actions summary::after{content:'▾';font-size:10px;}
        .flowview-inline-actions details[open]>summary{color:#4956c9;border-color:#4956c9;background:#eef0fb;}
        .flowview-inline-actions .flowview-inline-more{position:absolute;right:8px;top:calc(100% + 6px);z-index:120;width:220px;max-width:calc(100vw - 24px);box-sizing:border-box;display:grid;gap:4px;padding:6px;border:1px solid #dce1f1;border-radius:9px;background:#fff;box-shadow:0 6px 20px #14244220;}
        .flowview-inline-more a{justify-content:flex-start;border-color:transparent;white-space:normal;}
      `}</style>
      <CanvasFrame expanded={expanded} onClose={close} title={diagram.title}>
      <div style={expanded ? {position:'absolute',top:0,left:0,right:0,zIndex:100,
        display:'flex',alignItems:'center',gap:12,flexWrap:'wrap',pointerEvents:'none'} :
        {display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap',marginBottom:16}}>
        {!expanded && <h3 style={{margin:0,fontSize:22}}>{diagram.title}</h3>}
        <div className="flowview-inline-actions" ref={canvasActions} role="toolbar" aria-label="Diagram actions" style={{position:'relative',display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',pointerEvents:'auto',maxWidth:'100%',boxSizing:'border-box',
          background:'#fff',border:'1px solid #dce1f1',borderRadius:expanded?0:10,padding:expanded?'6px 12px':8}}>
          <button ref={toggle} disabled={!rendered} onClick={() => expanded ? close() : setExpandedRevision(identity)}>
            {expanded ? 'Back to entity' : 'Expand canvas'}
          </button>
          <EvidenceLink url={workspaceLink(diagram.editUrl, diagram, address, entityRef, 'edit')}>Edit in Workbench</EvidenceLink>
          <details><summary>More</summary><div className="flowview-inline-more">
            <EvidenceLink url={workspaceLink(diagram.viewerUrl, diagram, address, entityRef, 'view')}>Open standalone viewer</EvidenceLink>
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
