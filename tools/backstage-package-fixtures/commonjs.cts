import plugin = require('@flowview/backstage-plugin');
import backend = require('@flowview/backstage-plugin/backend');
const limit: number = plugin.SPEC_MAX_BYTES;
const result: plugin.EntityDiagrams = backend.diagramsForEntity(
  backend.buildEntityDiagramIndex([], { publicBaseUrl: 'https://company.test' }),
  'component:default/recording',
);
const entries: backend.CanonEntry[] = backend.parseCanonManifest({version: 1, diagrams: []});
const materialize: (raw: unknown, entry: backend.CanonEntry) => unknown = backend.materializeCanonSpec;
export { limit, result, entries, materialize };
