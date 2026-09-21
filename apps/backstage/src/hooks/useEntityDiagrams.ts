import { useCallback, useEffect, useRef, useState } from 'react';
import type { DiagramLoader, EntityDiagrams } from '../api/types';

interface LookupState {
  ref: string;
  data?: EntityDiagrams;
  error?: string;
  loading: boolean;
}

/** Keeps results scoped to the entity that authorized their request. */
export function useEntityDiagrams(
  entityRef: string,
  loadDiagrams: DiagramLoader,
  refreshMs: number
) {
  const [state, setState] = useState<LookupState>({
    ref: entityRef,
    loading: true,
  });
  const refresh = useRef<() => void>(() => {});

  useEffect(() => {
    let stopped = false;
    let controller: AbortController | undefined;
    async function update() {
      controller?.abort();
      controller = new AbortController();
      const current = controller;
      setState((previous) => ({
        ref: entityRef,
        data: previous.ref === entityRef ? previous.data : undefined,
        loading: true,
      }));
      try {
        const data = await loadDiagrams(entityRef, current.signal);
        if (!stopped && !current.signal.aborted)
          setState({ ref: entityRef, data, loading: false });
      } catch (error) {
        if (!stopped && !current.signal.aborted)
          setState((previous) => ({
            ...previous,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to refresh diagrams.',
          }));
      }
    }
    const visibleUpdate = () => {
      if (!document.hidden) void update();
    };
    refresh.current = () => {
      void update();
    };
    void update();
    const timer = window.setInterval(visibleUpdate, Math.max(1000, refreshMs));
    window.addEventListener('focus', visibleUpdate);
    document.addEventListener('visibilitychange', visibleUpdate);
    return () => {
      stopped = true;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener('focus', visibleUpdate);
      document.removeEventListener('visibilitychange', visibleUpdate);
    };
  }, [entityRef, loadDiagrams, refreshMs]);

  const onRefresh = useCallback(() => refresh.current(), []);
  const current: LookupState =
    state.ref === entityRef ? state : { ref: entityRef, loading: true };
  return { current, onRefresh };
}
