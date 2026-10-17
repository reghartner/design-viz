import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseDocuments} from '../repositories.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const workflow=parseDocuments(await readFile(path.join(root,'.github/workflows/ci.yml'),'utf8'),'ci workflow')[0];
const localConfig=(await import(path.join(root,'tools/browser-tests/playwright.config.mjs'))).default;
const ciConfig=(await import(path.join(root,'tools/browser-tests/playwright.ci.config.mjs'))).default;
const browserPackage=JSON.parse(await readFile(path.join(root,'tools/browser-tests/package.json'),'utf8'));
const jobs=workflow.jobs,shards=jobs['browser-contract-shards'],aggregate=jobs['browser-contracts'];
const stepByName=(job,name)=>job.steps.find(step=>step.name===name);
const stepByUse=(job,use)=>job.steps.find(step=>step.uses===use);
const artifactPaths=step=>step.with.path.trim().split('\n');

test('browser CI uses isolated, test-balanced, internally serialized shards',()=>{
  assert.equal(shards['runs-on'],'ubuntu-24.04');
  assert.equal(shards.strategy['fail-fast'],false);
  assert.deepEqual(shards.strategy.matrix.shard,[1,2,3,4,5,6,7,8,9,10,11,12]);
  assert.equal(shards.name,'Browser contracts (shard ${{ matrix.shard }}/12)');
  assert.equal(stepByUse(shards,'actions/setup-node@v7').with['node-version'],24);
  assert.equal(stepByName(shards,'Install the lockfile-pinned Playwright Chromium and Linux dependencies').run,
    'npm exec --prefix tools/browser-tests -- playwright install --with-deps chromium');
  assert.equal(stepByName(shards,'Required browser contracts (serialized shard, no retries or missing-browser skips)').run,
    'npm test --prefix tools/browser-tests -- --config=playwright.ci.config.mjs --shard=${{ matrix.shard }}/12');
  assert.equal(ciConfig.fullyParallel,true);
  assert.equal(ciConfig.workers,1);
  assert.equal(ciConfig.retries,0);
  assert.deepEqual(ciConfig.reporter,[['line'],['blob',{outputDir:'blob-report'}]]);
  assert.equal(ciConfig.use.screenshot,'only-on-failure');
  assert.equal(ciConfig.use.trace,'retain-on-failure');
});

test('each browser shard always publishes uniquely named reports and diagnostics',()=>{
  const upload=stepByUse(shards,'actions/upload-artifact@v7');
  assert.equal(upload.if,'always()');
  assert.equal(upload.with.name,'browser-contract-results-${{ matrix.shard }}-of-12');
  assert.deepEqual(artifactPaths(upload),[
    'tools/browser-tests/blob-report/',
    'tools/browser-tests/test-results/',
  ]);
  assert.equal(upload.with['if-no-files-found'],'ignore');
  assert.equal(upload.with['retention-days'],14);
});

test('aggregate browser check merges useful reports and propagates every shard result',()=>{
  assert.equal(aggregate.name,'browser-contracts');
  assert.equal(aggregate['runs-on'],'ubuntu-24.04');
  assert.equal(aggregate.if,'always()');
  assert.equal(aggregate.needs,'browser-contract-shards');
  assert.equal(stepByUse(aggregate,'actions/setup-node@v7').with['node-version'],24);

  const download=stepByUse(aggregate,'actions/download-artifact@v8');
  assert.equal(download.name,'Download every shard report and diagnostic');
  assert.equal(download.with.pattern,'browser-contract-results-*-of-12');
  assert.equal(download.with.path,'tools/browser-tests/shard-results');

  const collect=stepByName(aggregate,'Collect blob reports for merging');
  assert.equal(collect['working-directory'],'tools/browser-tests');
  assert.match(collect.run,/find shard-results -type f -path '\*\/blob-report\/\*\.zip'/);
  assert.match(collect.run,/test -n "\$\(find all-blob-reports -maxdepth 1 -name '\*\.zip'/);

  const merge=stepByName(aggregate,'Merge Playwright reports');
  assert.equal(merge['working-directory'],'tools/browser-tests');
  assert.deepEqual(merge.env,{
    PLAYWRIGHT_HTML_OUTPUT_DIR:'merged-html-report',
    PLAYWRIGHT_JSON_OUTPUT_FILE:'merged-report.json',
  });
  assert.equal(merge.run,'npx playwright merge-reports --reporter=html,json ./all-blob-reports');

  const upload=stepByName(aggregate,'Upload merged report and all shard diagnostics');
  assert.equal(upload.uses,'actions/upload-artifact@v7');
  assert.equal(upload.if,'always()');
  assert.equal(upload.with.name,'browser-contract-results');
  assert.deepEqual(artifactPaths(upload),[
    'tools/browser-tests/merged-html-report/',
    'tools/browser-tests/merged-report.json',
    'tools/browser-tests/shard-results/',
  ]);
  assert.equal(upload.with['if-no-files-found'],'ignore');
  assert.equal(upload.with['retention-days'],14);

  const gate=stepByName(aggregate,'Require every browser shard to pass');
  assert.equal(gate.if,'always()');
  assert.deepEqual(gate.env,{SHARD_RESULT:'${{ needs.browser-contract-shards.result }}'});
  assert.equal(gate.run,'test "$SHARD_RESULT" = success');
});

test('ordinary local browser command remains single-worker and unsharded',()=>{
  assert.equal(browserPackage.devDependencies['@playwright/test'],'1.64.1');
  assert.equal(browserPackage.scripts.test,'playwright test');
  assert.equal(localConfig.fullyParallel,false);
  assert.equal(localConfig.workers,1);
  assert.equal(localConfig.retries,0);
  assert.deepEqual(localConfig.reporter,[
    ['list'],
    ['html',{open:'never'}],
    ['json',{outputFile:'report.json'}],
  ]);
});
