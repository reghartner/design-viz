import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssociatedDiagram, SpecLoader } from '../api/types';
import { FlowviewCompatibility } from '../generated/compatibility';
import { mountNativeViewer, type NativeViewer } from '../generated/nativeViewer';
import type { ViewerTarget } from '../viewer/protocol';

/** Owns one revision request and one native mount, with paired cleanup. */
export function useInlineViewer(
  diagram: AssociatedDiagram,
  loadSpec: SpecLoader,
  target?: ViewerTarget
) {
  const [attempt, setAttempt] = useState(0);
  // The request identity also gates rendering: an old response cannot mount for
  // a new revision during the render before its loading effect runs.
  const request = useMemo(() => ({ id: diagram.id, revision: diagram.revision, loadSpec, attempt }),
    [diagram.id, diagram.revision, loadSpec, attempt]);
  const [state, setState] = useState<{
    request?: typeof request; spec?: unknown; error?: string; loading: boolean;
  }>({ loading: true });
  const [renderError, setRenderError] = useState(''), [rendered, setRendered] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const mounted = useRef<{ request: typeof request; viewer: NativeViewer }>();
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
  useEffect(() => {
    if (state.request !== request || state.spec === undefined || !host.current ||
      FlowviewCompatibility.check(state.spec).status === 'unsupported') return;
    let active = true;
    let viewer: NativeViewer;
    try {
      viewer = mountNativeViewer(host.current, state.spec, {
        onWarning: message => { if (active) setRenderError(message); },
      });
    } catch (error) {
      active = false;
      setRenderError(error instanceof Error ? error.message : 'Unable to render diagram.');
      return;
    }
    mounted.current = { request, viewer };
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
  }, [request, state]);
  useEffect(() => {
    const owned = mounted.current;
    if (!target || !rendered || owned?.request !== request) return;
    try { owned.viewer.navigate(target); setRenderError(''); }
    catch (error) { setRenderError(error instanceof Error ? error.message : 'Unable to navigate diagram.'); }
  }, [target, rendered, request]);
  return {
    state: state.request === request ? state : { loading: true },
    renderError, rendered, host,
    retry: () => setAttempt(value => value + 1),
  };
}
