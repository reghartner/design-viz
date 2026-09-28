import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssociatedDiagram, SpecLoader } from '../api/types';
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
  onNavigate?: (target: NativeViewerTarget | null) => void
) {
  const notify = useRef(onNavigate); notify.current = onNavigate;
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
    request: typeof request; viewer: NativeViewer; navigated: boolean; target?: ViewerTarget;
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
    let active = true;
    let viewer: NativeViewer;
    setRendered(false);
    setRenderError('');
    try {
      viewer = mountNativeViewer(host.current, state.spec, {
        resolveDiagramLink,
        loadDetail: (reference, signal) => {
          if (!reference.revision) return Promise.reject(new Error('External detail diagrams require a pinned revision.'));
          return loadSpec({ id: reference.spec, revision: reference.revision }, signal);
        },
        onWarning: message => { if (active) setRenderError(message); },
        onChange: next => {
          const owned = mounted.current;
          if (active && owned?.viewer === viewer) {
            navigation.current = next ? { request, state: next, target: owned.target } : undefined;
            notify.current?.(next);
          }
        },
      });
    } catch (error) {
      active = false;
      setRenderError(error instanceof Error ? error.message : 'Unable to render diagram.');
      return;
    }
    mounted.current = { request, viewer, navigated: false };
    notify.current?.(viewer.snapshot());
    setRendered(true);
    const pause = () => { if (active) viewer.pause(); };
    const visibility = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', visibility);
    const observer = typeof IntersectionObserver === 'undefined' ? null :
      new IntersectionObserver(entries => { if (entries.some(entry => !entry.isIntersecting)) pause(); });
    observer?.observe(host.current);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', visibility);
      observer?.disconnect();
      if (mounted.current?.viewer === viewer) mounted.current = undefined;
      viewer.destroy();
    };
  }, [request, state, resolveDiagramLink]);
  useEffect(() => {
    const owned = mounted.current;
    if (!rendered || owned?.request !== request ||
      owned.navigated && owned.target === navigationTarget) return;
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
    retry: () => setAttempt(value => value + 1),
  };
}
