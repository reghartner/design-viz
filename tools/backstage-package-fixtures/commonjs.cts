import plugin = require('@flowview/backstage-plugin');
import backend = require('@flowview/backstage-plugin/backend');
const limit: number = plugin.SPEC_MAX_BYTES;
const result: plugin.EntityDiagrams = backend.diagramsForEntity(
  backend.buildEntityDiagramIndex([], { publicBaseUrl: 'https://company.test' }),
  'component:default/recording',
);
export { limit, result };
