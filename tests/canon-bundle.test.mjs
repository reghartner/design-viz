import { spawnSync } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
// Upstream build test: uses the build dependency installed by the plugin CI job.
const require = createRequire(
  new URL('../apps/backstage/package.json', import.meta.url)
);
const { build } = require('esbuild');

const root = fileURLToPath(new URL('../', import.meta.url));

for (const format of ['cjs', 'esm'])
  test(
    'runs the ' + format + ' backend bundle without the source checkout',
    async () => {
      const deployed = await realpath(
        await mkdtemp(path.join(tmpdir(), 'flowview-backend-'))
      );
      try {
        const outfile = path.join(
          deployed,
          'backend.' + (format === 'cjs' ? 'cjs' : 'mjs')
        );
        await build({
          stdin: {
            resolveDir: root,
            contents: `
        import C from './tools/canon/core.cjs';
        import {buildEntityDiagramIndex,diagramsForEntity} from './tools/canon/entity-diagrams.mjs';
        import spec from './examples/canon/specs/doorbell.json';
        const d=spec.page.sections[0].diagram;
        d.paths=[{id:'happy',label:'Happy path',steps:d.steps.map(s=>s.id)},
          {id:'failed',label:'Dropped request',steps:['quiet','detect','failed-upload']}];
        d.steps.push({id:'failed-upload',text:'The recording request is dropped.',failures:{'hub->cloud':'dropped'}});
        const validation=C.validateSpec(spec);
        const result=diagramsForEntity(buildEntityDiagramIndex([spec],{publicBaseUrl:'https://flows.example.test'}),
          'component:default/recording-service');
        const broken=structuredClone(spec);
        broken.page.sections[0].diagram.edges[0].to='missing-node';
        console.log(JSON.stringify({validation,result,brokenErrors:C.validateSpec(broken).errors,
          codeUrl:C.codeUrl(C.references(spec)[0].reference)}));
      `,
          },
          outfile,
          bundle: true,
          platform: 'node',
          target: 'node24',
          format,
          minify: true,
        });
        // A deployed bundle gets only its own directory. Even an accidental absolute
        // path back to this checkout cannot make this production smoke test pass.
        const run = spawnSync(
          process.execPath,
          ['--permission', '--allow-fs-read=' + deployed, outfile],
          {
            cwd: deployed,
            encoding: 'utf8',
            timeout: 15000,
          }
        );
        assert.equal(run.status, 0, run.stderr || String(run.error || ''));
        const { validation, result, brokenErrors, codeUrl } = JSON.parse(
          run.stdout
        );
        assert.deepEqual(validation.errors, []);
        assert.ok(brokenErrors.length > 0);
        assert.ok(
          codeUrl.includes(
            '/blob/' + '1'.repeat(40) + '/src/porch-hub.js#L2-L6'
          )
        );
        assert.equal(result.diagrams.length, 1);
        assert.equal(result.diagrams[0].id, 'doorbell');
        assert.deepEqual(
          result.diagrams[0].sections[0].paths[0].steps.map((s) => s.id),
          ['upload', 'persist', 'enqueue']
        );
        const alternate = result.diagrams[0].sections[0].paths[1];
        assert.equal(alternate.id, 'failed');
        assert.equal(alternate.steps.length, 1);
        assert.equal(alternate.steps[0].id, 'failed-upload');
        const hash = new URLSearchParams(
          new URL(alternate.steps[0].url).hash.slice(1)
        );
        assert.equal(hash.get('p'), 'failed');
        assert.equal(hash.get('s'), 'failed-upload');
        assert.equal(hash.get('d'), 'doorbell-flow');
      } finally {
        await rm(deployed, { recursive: true, force: true });
      }
    }
  );
