import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssociatedDiagram, SpecLoader } from '../api';
import type { ViewerTarget } from '../viewer/protocol';

/** Owns one spec request and one private frame channel, with paired cleanup. */
export function useInlineViewer(
  diagram: AssociatedDiagram,
  loadSpec: SpecLoader,
  target?: ViewerTarget
) {
  const [attempt, setAttempt] = useState(0),
    [state, setState] = useState<{
      spec?: unknown;
      error?: string;
      loading: boolean;
    }>({ loading: true });
  const [height, setHeight] = useState(640),
    [renderError, setRenderError] = useState(''),
    [rendered, setRendered] = useState(false);
  const iframe = useRef<HTMLIFrameElement>(null),
    channel = useRef<MessageChannel>(),
    timer = useRef<ReturnType<typeof setTimeout>>();
  const targetRef = useRef(target);
  targetRef.current = target;
  const disconnect = useCallback(() => {
    clearTimeout(timer.current);
    channel.current?.port1.close();
    channel.current?.port2.close();
    channel.current = undefined;
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    disconnect();
    setState({ loading: true });
    setRenderError('');
    setRendered(false);
    setHeight(640);
    loadSpec({ id: diagram.id, revision: diagram.revision }, abort.signal).then(
      (spec) => {
        if (!abort.signal.aborted) setState({ spec, loading: false });
      },
      (error) => {
        if (!abort.signal.aborted)
          setState({
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to load diagram.',
          });
      }
    );
    return () => {
      abort.abort();
      disconnect();
    };
  }, [diagram.id, diagram.revision, loadSpec, attempt, disconnect]);
  const connect = useCallback(() => {
    disconnect();
    if (!iframe.current?.contentWindow || !state.spec) return;
    const next = new MessageChannel();
    channel.current = next;
    timer.current = setTimeout(
      () =>
        setRenderError(
          'The embedded viewer did not start. Check the Backstage frame/script content-security policy, then retry.'
        ),
      10000
    );
    next.port1.onmessage = (event) => {
      if (channel.current !== next) return;
      const message = event.data;
      if (message?.type === 'size' && Number.isFinite(message.height))
        setHeight(Math.max(480, Math.min(24000, Math.ceil(message.height))));
      if (message?.type === 'rendered') {
        clearTimeout(timer.current);
        setRendered(true);
        setRenderError('');
      }
      if (message?.type === 'error' || message?.type === 'navigation-error') {
        clearTimeout(timer.current);
        setRenderError(
          typeof message.message === 'string'
            ? message.message
            : 'Unable to render diagram.'
        );
      }
      if (message?.type === 'navigated') setRenderError('');
    };
    // The sandbox has an opaque origin. Send only to this owned WindowProxy;
    // all subsequent communication uses its private transferred MessagePort.
    iframe.current.contentWindow.postMessage(
      { type: 'flowview:init', spec: state.spec, target: targetRef.current },
      '*',
      [next.port2]
    );
  }, [state.spec, disconnect]);
  useEffect(() => {
    if (target && rendered)
      channel.current?.port1.postMessage({ type: 'navigate', target });
  }, [target, rendered]);
  useEffect(() => {
    const pause = () => channel.current?.port1.postMessage({ type: 'pause' });
    const visibility = () => {
      if (document.hidden) pause();
    };
    document.addEventListener('visibilitychange', visibility);
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            if (entries.some((entry) => !entry.isIntersecting)) pause();
          });
    if (iframe.current) observer?.observe(iframe.current);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      observer?.disconnect();
    };
  }, [state.spec]);
  return {
    state,
    height,
    renderError,
    rendered,
    iframe,
    connect,
    retry: () => setAttempt((value) => value + 1),
    attempt,
  };
}
