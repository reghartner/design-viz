import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssociatedDiagram, SpecLoader, DiagramHandoffResolver } from '../api/types';
import { FlowviewCompatibility } from '../generated/compatibility';
import { mountNativeViewer, type NativeViewer, type NativeViewerOptions, type NativeViewerTarget } from '../generated/nativeViewer';
import type { ViewerTarget } from '../viewer/protocol';

/** Owns one revision request and one native mount, with paired cleanup. */
export function useInlineViewer(
  diagram: AssociatedDiagram,
  loadSpec: SpecLoader,
  target?: ViewerTarget,
  resolveDiagramLink?: NativeViewerOptions['resolveDiagramLink'],
  expanded = false,
  onNavigate?: (target: NativeViewerTarget | null) => void,
  handoffDiagrams?: AssociatedDiagram[],
  resolveHandoffDiagram?: DiagramHandoffResolver
) {
  const notify = useRef(onNavigate); notify.current = onNavigate;
  const approved = useRef(handoffDiagrams); approved.current = handoffDiagrams;
  const metadataResolver = useRef(resolveHandoffDiagram); metadataResolver.current = resolveHandoffDiagram;
  const canvas = useRef(expanded); canvas.current = expanded;
  const [following, setFollowing] = useState<{request: object; diagram: AssociatedDiagram; spec: unknown; target: NativeViewerTarget | null; depth: number}>();
  const back = useRef<() => void>();
  const [attempt, setAttempt] = useState(0);
  // The request identity also gates rendering: an old response cannot mount for
  // a new revision during the render before its loading effect runs.
  const request = useMemo(() => ({ id: diagram.id, revision: diagram.revision, loadSpec, attempt }),
    [diagram.id, diagram.revision, loadSpec, attempt]);
  const navigationTarget = useMemo(() => target ? { ...target } : undefined,
    [target?.section, target?.view, target?.path, target?.step, target?.drilldown, target?.request]);
  const [state, setState] = useState<{
    request?: typeof request; spec?: unknown; error?: string; loading: boolean;
  }>({ loading: true });
  const [renderError, setRenderError] = useState(''), [rendered, setRendered] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef<{
    request: typeof request; viewer: NativeViewer; navigated: boolean; target?: ViewerTarget; returnRoot: () => void;
  }>();
  const navigation = useRef<{
    request: typeof request; state: NativeViewerTarget; target?: ViewerTarget;
  }>();
  useEffect(() => {
    const abort = new AbortController();
    setState({ request, loading: true });
    setRenderError('');
    setRendered(false);
    loadSpec({ id: request.id, revision: request.revision }, abort.signal).then(
      spec => { if (!abort.signal.aborted) setState({ request, spec, loading: false }); },
      error => {
        if (!abort.signal.aborted) setState({ request, loading: false,
          error: error instanceof Error ? error.message : 'Unable to load diagram.' });
      }
    );
    return () => abort.abort();
  }, [request]);
  // Links resolve during rendering. A changed host router refreshes this mount
  // from the loaded spec without starting another source request.
  useEffect(() => {
    if (state.request !== request || state.spec === undefined || !host.current ||
      FlowviewCompatibility.check(state.spec).status === 'unsupported') return;
    let active = true, pending: AbortController | undefined;
    type Entry = {viewer: NativeViewer; element: HTMLDivElement; diagram: AssociatedDiagram; spec: unknown};
    const trail: Entry[] = [];
    const staged = new Set<Entry>();
    const current = () => trail[trail.length - 1];
    const destroy = (entry: Entry) => { staged.delete(entry); entry.viewer.destroy(); entry.element.remove(); };
    const conceal = (entry: Entry) => { entry.element.hidden = true; entry.element.inert = true; entry.element.style.setProperty('display','none','important'); };
    const reveal = (entry: Entry) => { entry.element.hidden = false; entry.element.inert = false; entry.element.style.removeProperty('display'); };
    const publish = () => {
      const entry = current();
      if (!active || !entry) return;
      if (mounted.current?.request === request) mounted.current.viewer = entry.viewer;
      const next = entry.viewer.snapshot();
      setFollowing({request, diagram: entry.diagram, spec: entry.spec, target: next, depth: trail.length - 1});
      notify.current?.(next);
    };
    const retireRequest = () => { pending?.abort(); pending = undefined; };
    const returnTo = (depth: number) => {
      retireRequest();
      while (trail.length > depth + 1) destroy(trail.pop()!);
      const entry = current(); if (!entry) return;
      reveal(entry); entry.viewer.pause(); entry.viewer.setCanvas(canvas.current); publish();
    };
    back.current = () => returnTo(Math.max(0, trail.length - 2));
    setRendered(false); setRenderError('');
    const create = (spec: unknown, info: AssociatedDiagram, continuation = false): Entry => {
      const element = document.createElement('div');
      if (continuation) { element.hidden = true; element.inert = true; element.style.setProperty('display','none','important'); }
      host.current!.appendChild(element);
      let entry: Entry;
      try {
        const viewer = mountNativeViewer(element, spec, {
          resolveDiagramLink, handoffHost: 'backstage', scrollIntoView: !continuation,
          onDiagramHandoff: async (reference, signal) => {
            retireRequest();
            const abort = new AbortController(); pending = abort;
            const cancel = () => abort.abort(); signal.addEventListener('abort', cancel, {once:true});
            if (signal.aborted) abort.abort();
            let candidate: Entry | undefined;
            const discard = () => { if (candidate) { destroy(candidate); candidate = undefined; } };
            abort.signal.addEventListener('abort', discard, {once:true});
            try {
              let known = approved.current?.find(item => item.id === reference.spec && (!reference.revision || item.revision === reference.revision)) || (info.id === reference.spec && (!reference.revision || info.revision === reference.revision) ? info : undefined);
              if (!known && metadataResolver.current) {
                known = await metadataResolver.current({...reference},abort.signal) || undefined;
                if (!active || abort.signal.aborted || pending !== abort) return;
                if (known && (known.id !== reference.spec || !known.revision || reference.revision && known.revision !== reference.revision)) throw new Error('The approved index did not resolve the requested diagram and revision.');
              }
              const revision = reference.revision || known?.revision;
              if (!reference.spec || !revision) throw new Error('This diagram is not in the approved list. A pinned revision is required to open it in Backstage.');
              const loaded = await loadSpec({id:reference.spec, revision}, abort.signal);
              if (!active || abort.signal.aborted || pending !== abort) return;
              const compatibility = FlowviewCompatibility.check(loaded);
              if (compatibility.status === 'unsupported') throw new Error(compatibility.messages.join(' '));
              const page = (loaded as {page?: {title?: unknown; canon?: {id?: string}; documentLinks?: {id?: string}}})?.page;
              const loadedId = page?.canon?.id || page?.documentLinks?.id;
              if (loadedId && loadedId !== reference.spec) throw new Error('The loader returned a different diagram.');
              const metadata: AssociatedDiagram = known?.revision === revision ? known : {
                id:reference.spec, revision, title:typeof page?.title === 'string' ? page.title : reference.spec,
                kind:'design',owner:'',viewerUrl:'',editUrl:'',sections:[],
              };
              candidate = create(loaded, metadata, true);
              const section = reference.section || candidate.viewer.snapshot()?.section;
              if (section) candidate.viewer.navigate({section,view:reference.view,path:reference.path,step:reference.step});
              else if (reference.view || reference.path || reference.step) throw new Error('This diagram has no navigable section for the handoff.');
              candidate.viewer.pause(); candidate.viewer.setCanvas(canvas.current);
              const previous = current(); await previous.viewer.deactivate();
              if (!active || abort.signal.aborted || pending !== abort) return;
              conceal(previous); reveal(candidate); staged.delete(candidate);
              trail.push(candidate); candidate = undefined;
              // Keep the association root plus at most nineteen continuations.
              if (trail.length > 20) destroy(trail.splice(1,1)[0]);
              publish();
            } finally {
              discard();
              abort.signal.removeEventListener('abort',discard);
              signal.removeEventListener('abort',cancel);
              if (pending === abort) pending = undefined;
            }
          },
          loadDetail: (reference, signal) => {
            if (!reference.revision) return Promise.reject(new Error('External detail diagrams require a pinned revision.'));
            return loadSpec({id:reference.spec,revision:reference.revision},signal);
          },
          onWarning: message => { if (active && current() === entry) setRenderError(message); },
          onChange: next => {
            const owned = mounted.current;
            if (active && entry && current() === entry && owned?.viewer === entry.viewer) {
              if (entry === trail[0]) navigation.current = next ? {request,state:next,target:owned.target} : undefined;
              publish();
            }
          },
        });
        entry = {viewer, element, diagram:info, spec};
        if (continuation) staged.add(entry);
        return entry;
      } catch (error) { element.remove(); throw error; }
    };
    try { trail.push(create(state.spec, diagram)); }
    catch (error) {
      active = false; setRenderError(error instanceof Error ? error.message : 'Unable to render diagram.'); return;
    }
    mounted.current = {request, viewer:current().viewer, navigated:false, returnRoot:() => returnTo(0)};
    publish(); setRendered(true);
    const pause = () => { if (active) current()?.viewer.pause(); };
    const visibility = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', visibility);
    const observer = typeof IntersectionObserver === 'undefined' ? null :
      new IntersectionObserver(entries => { if (entries.some(entry => !entry.isIntersecting)) pause(); });
    observer?.observe(host.current);
    return () => {
      active = false; retireRequest(); back.current = undefined;
      document.removeEventListener('visibilitychange',visibility); observer?.disconnect();
      if (mounted.current?.request === request) mounted.current = undefined;
      trail.forEach(destroy); staged.forEach(destroy);
    };
  }, [request, state, resolveDiagramLink]);
  useEffect(() => {
    const owned = mounted.current;
    if (!rendered || owned?.request !== request ||
      owned.navigated && owned.target === navigationTarget) return;
    // Association section hits always address the root, even while following
    // an out-of-association continuation.
    if (owned.navigated && owned.target !== navigationTarget) owned.returnRoot();
    const saved = navigation.current;
    // A router refresh replaces the renderer but keeps the reader's current
    // view/step. A new host target takes precedence over that saved position.
    const next = saved?.request === request && (!navigationTarget || saved.target === navigationTarget)
      ? saved.state : navigationTarget;
    owned.navigated = true;
    owned.target = navigationTarget;
    if (!next) return;
    try { owned.viewer.navigate(next); setRenderError(''); }
    catch (error) { setRenderError(error instanceof Error ? error.message : 'Unable to navigate diagram.'); }
  }, [navigationTarget, rendered, request, resolveDiagramLink]);
  useEffect(() => {
    if (rendered && mounted.current?.request === request) mounted.current.viewer.setCanvas(expanded);
  }, [expanded, rendered, request, resolveDiagramLink]);
  return {
    state: state.request === request ? state : { loading: true },
    renderError, rendered, host,
    activeDiagram: following?.request === request ? following.diagram : diagram,
    activeSpec: following?.request === request ? following.spec : state.spec,
    activeTarget: following?.request === request ? following.target : null,
    canGoBack: following?.request === request && following.depth > 0,
    goBack: () => back.current?.(),
    retry: () => setAttempt(value => value + 1),
  };
}
