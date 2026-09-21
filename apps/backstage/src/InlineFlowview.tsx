import type { AssociatedDiagram, SpecLoader } from './api/types';
import { FlowviewCompatibility } from './generated/compatibility';
import { useInlineViewer } from './hooks/useInlineViewer';
import type { ViewerTarget } from './viewer/protocol';
export type { ViewerTarget } from './viewer/protocol';

export function InlineFlowview({
  diagram,
  loadSpec,
  target,
}: {
  diagram: AssociatedDiagram;
  loadSpec: SpecLoader;
  target?: ViewerTarget;
}) {
  const {
    state,
    renderError,
    rendered,
    host,
    retry,
  } = useInlineViewer(diagram, loadSpec, target);
  const compatibility =
    state.spec === undefined
      ? undefined
      : FlowviewCompatibility.check(state.spec);
  return (
    <div aria-label="Inline diagram viewer">
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
    </div>
  );
}
