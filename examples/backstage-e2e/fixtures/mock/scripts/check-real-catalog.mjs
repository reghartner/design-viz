import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const designer = path.resolve(process.argv[2] || '../__DESIGNER_NAME__');
const {catalog: token} = JSON.parse(await readFile('.local/secrets.json', 'utf8'));
const {loadBackstageCatalog} = await import(pathToFileURL(path.join(designer, 'tools/catalog-sync/backstage.mjs')));
const {catalogFromEntities} = await import(pathToFileURL(path.join(designer, 'tools/canon/backstage.mjs')));
const approved = JSON.parse(await readFile(path.join(designer, 'workbench/catalog.json'), 'utf8'));

// Entity query order is not part of the Backstage catalog contract.
function servicesByIdentity(services) {
  const result = structuredClone(services);
  result.sort((a, b) => a.entityRef.localeCompare(b.entityRef));
  for (const service of result) {
    service.apis.sort((a, b) => a.entityRef.localeCompare(b.entityRef));
    for (const api of service.apis) {
      api.operations.sort((a, b) => a.operationId.localeCompare(b.operationId));
    }
  }
  return result;
}

for (const [name, backendUrl] of [
  ['Catalog fixture', 'http://127.0.0.1:7010'],
  ['Real Backstage', 'http://127.0.0.1:7007'],
]) {
  const {entities} = await loadBackstageCatalog({backendUrl, token, appUrl: 'http://localhost:3000'});
  const {catalog, warnings} = catalogFromEntities(entities, 'http://localhost:3000');
  assert.deepEqual(warnings, [], `${name}: resolve catalog warnings before seeding`);
  assert.equal(catalog.services.length, 3, `${name}: expected the three fictional services`);
  assert.deepEqual(servicesByIdentity(catalog.services), servicesByIdentity(approved.services), `${name}: approved catalog differs; inspect a catalog sync PR`);
  const apis = catalog.services.flatMap(service => service.apis);
  console.log(`${name}: ${catalog.services.length} services, ${apis.length} APIs, ${apis.flatMap(api => api.operations).length} operations match the approved workbench catalog.`);
}
