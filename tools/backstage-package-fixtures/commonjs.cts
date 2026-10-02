import plugin = require('@flowview/backstage-plugin');
import backend = require('@flowview/backstage-plugin/backend');
const limit: number = plugin.SPEC_MAX_BYTES;
const result: plugin.EntityDiagrams = backend.diagramsForEntity(
  backend.buildEntityDiagramIndex([], { publicBaseUrl: 'https://company.test' }),
  'component:default/recording',
);
const entries: backend.CanonEntry[] = backend.parseCanonManifest({version: 1, diagrams: []});
const materialize: (raw: unknown, entry: backend.CanonEntry) => unknown = backend.materializeCanonSpec;
const materializeBatch: (specs: readonly unknown[]) => unknown[] = backend.materializeCanonSpecs;
const workspace=backend.prepareCanonSnapshot([]).loadWorkspace('missing');
const target: plugin.NativeViewerTarget = {section:'recording',view:'operations'};
const options: plugin.NativeViewerOptions = {onChange: current => { const view: string | undefined = current?.view; void view; }};
export { limit, result, entries, materialize, materializeBatch, target, options };
