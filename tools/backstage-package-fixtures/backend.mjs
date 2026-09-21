import assert from 'node:assert/strict';
import { buildEntityDiagramIndex, diagramsForEntity } from '@flowview/backstage-plugin/backend';

async function main() {
  const response = await fetch(process.argv[2]);
  assert.equal(response.status, 200);
  const spec = await response.json();
  const before = JSON.stringify(spec);
  let calls = 0;
  const index = buildEntityDiagramIndex([spec], {
    diagramUrls({ id, revision, spec: indexed }) {
      calls += 1;
      assert.equal(id, 'consumer-recording');
      assert.equal(typeof revision, 'string');
      assert.equal(indexed, spec);
      return {
        viewerUrl: 'https://diagrams.company.test/recording.html?version=' + revision,
        editUrl: 'https://github.company.test/flows/edit/main/recording.json',
      };
    },
  });
  assert.equal(calls, 1);
  const result = diagramsForEntity(index, 'Component:Default/Recording');
  assert.equal(result.entityRef, 'component:default/recording');
  assert.equal(result.diagrams.length, 1);
  const diagram = result.diagrams[0];
  assert.equal(diagram.id, 'consumer-recording');
  assert.equal(diagram.editUrl, 'https://github.company.test/flows/edit/main/recording.json');
  assert.match(diagram.viewerUrl, /^https:\/\/diagrams\.company\.test\/recording\.html\?version=\w+$/);
  const section = diagram.sections[0];
  assert.equal(section.reference, 'recording');
  assert.equal(new URL(section.url).search, new URL(diagram.viewerUrl).search);
  assert.equal(new URLSearchParams(new URL(section.url).hash.slice(1)).get('d'), 'recording');
  const failed = section.paths.find(path => path.id === 'failed');
  assert.deepEqual(failed.steps.map(step => step.id), ['failure']);
  const stepUrl = new URL(failed.steps[0].url);
  assert.equal(stepUrl.origin + stepUrl.pathname, 'https://diagrams.company.test/recording.html');
  assert.equal(stepUrl.search, new URL(diagram.viewerUrl).search);
  const hash = new URLSearchParams(stepUrl.hash.slice(1));
  assert.equal(hash.get('d'), 'recording');
  assert.equal(hash.get('p'), 'failed');
  assert.equal(hash.get('s'), 'failure');
  assert.equal(diagramsForEntity(index, 'component:default/unrelated').diagrams.length, 0);
  assert.equal(JSON.stringify(spec), before);
  assert.throws(() => buildEntityDiagramIndex([{ page: {} }]), /.+/);
  console.log('Packed backend fetched, indexed, and linked a spec with company URLs.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
