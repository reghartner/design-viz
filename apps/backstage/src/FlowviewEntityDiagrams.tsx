import { useState } from 'react';
import type { DiagramLoader, SpecLoader } from './api/types';
import type { NativeViewerOptions } from './generated/nativeViewer';
import { InlineFlowview, type ViewerTarget } from './InlineFlowview';
import { EvidenceLink } from './components/EvidenceLink';
import { useEntityDiagrams } from './hooks/useEntityDiagrams';

export function FlowviewEntityDiagrams({
  entityRef,
  loadDiagrams,
  loadSpec,
  resolveDiagramLink,
  refreshMs = 60000,
}: {
  entityRef: string;
  loadDiagrams: DiagramLoader;
  loadSpec: SpecLoader;
  resolveDiagramLink?: NativeViewerOptions['resolveDiagramLink'];
  refreshMs?: number;
}) {
  const [selection, setSelection] = useState<{
    ref: string;
    id: string;
    revision?: string;
    target?: ViewerTarget;
  }>();
  const { current, onRefresh } = useEntityDiagrams(
    entityRef,
    loadDiagrams,
    refreshMs
  );
  const data = current.data;
  const selected =
    data?.diagrams.find(
      (diagram) => selection?.ref === entityRef && diagram.id === selection.id
    ) || data?.diagrams[0];
  const target =
    selected &&
    selection?.ref === entityRef &&
    selection.id === selected.id &&
    selection.revision === selected.revision
      ? selection.target
      : undefined;
  function navigate(next: ViewerTarget) {
    if (selected)
      setSelection({
        ref: entityRef,
        id: selected.id,
        revision: selected.revision,
        target: { ...next, request: (target?.request || 0) + 1 },
      });
  }
  return (
    <section aria-label="Associated diagrams" style={{ padding: 24 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <h2>
          Associated diagrams{data ? ' (' + data.diagrams.length + ')' : ''}
        </h2>
        <button onClick={onRefresh} disabled={current.loading}>
          Refresh diagrams
        </button>
      </div>
      <p>
        Automatically linked from approved diagram bindings. Canonical flows and
        HLD designs appear together.
      </p>
      <p>
        <code>{entityRef}</code>
      </p>
      {current.loading && <p role="status">Refreshing diagrams…</p>}
      {current.error && (
        <p role="alert">
          {current.error}{' '}
          {data
            ? 'Showing the last successful results; they may be out of date.'
            : 'No results are available yet.'}
        </p>
      )}
      {data?.diagrams.length === 0 && (
        <p>
          No diagrams reference this entity yet. Bind a node to this catalog
          entity in the Flowview builder and approve the spec in the central
          repository. It will appear automatically.
        </p>
      )}
      {selected && (
        <>
          <label style={{ display: 'block', marginBottom: 16 }}>
            Diagram{' '}
            <select
              aria-label="Diagram"
              value={selected.id}
              onChange={(event) =>
                setSelection({ ref: entityRef, id: event.target.value })
              }
              style={{ maxWidth: '100%', padding: 8, font: 'inherit' }}
            >
              {data?.diagrams.map((diagram) => (
                <option key={diagram.id} value={diagram.id}>
                  {diagram.title}
                </option>
              ))}
            </select>
          </label>
          <article style={{ minWidth: 0 }}>
            <p>
              <strong>
                {selected.kind === 'canonical' ? 'CANONICAL' : 'HLD / DESIGN'}
              </strong>{' '}
              · {selected.owner}
            </p>
            <p style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <EvidenceLink url={selected.viewerUrl}>
                Open standalone viewer
              </EvidenceLink>
              <EvidenceLink url={selected.editUrl}>
                Edit in workbench
              </EvidenceLink>
              {selected.designDocument && (
                <EvidenceLink url={selected.designDocument.url}>
                  {selected.designDocument.label}
                </EvidenceLink>
              )}
            </p>
            <details style={{ marginBottom: 16 }}>
              <summary>
                Where this service appears · jump within the diagram
              </summary>
              {selected.sections.map((section) => (
                <section key={section.reference}>
                  <h3>
                    <button
                      onClick={() => navigate({ section: section.reference })}
                    >
                      {section.title}
                    </button>
                  </h3>
                  <p>
                    Appears as{' '}
                    {section.nodes.map((node) => node.title).join(', ')}
                  </p>
                  {section.paths.map((path) => (
                    <div key={path.id}>
                      <p>
                        <strong>{path.label}</strong>
                      </p>
                      <ul>
                        {path.steps.map((step) => (
                          <li key={step.id + '-' + step.position}>
                            <button
                              onClick={() =>
                                navigate({
                                  section: section.reference,
                                  path: path.id,
                                  step: step.id,
                                })
                              }
                            >
                              {step.position}. {step.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              ))}
            </details>
            <InlineFlowview
              key={entityRef + '|' + selected.id + '|' + selected.revision}
              diagram={selected}
              loadSpec={loadSpec}
              resolveDiagramLink={resolveDiagramLink}
              target={target}
            />
          </article>
        </>
      )}
    </section>
  );
}
