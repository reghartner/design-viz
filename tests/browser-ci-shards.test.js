const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');

const workflow=fs.readFileSync('.github/workflows/ci.yml','utf8');
const localConfig=fs.readFileSync('tools/browser-tests/playwright.config.mjs','utf8');
const ciConfig=fs.readFileSync('tools/browser-tests/playwright.ci.config.mjs','utf8');
const browserPackage=JSON.parse(fs.readFileSync('tools/browser-tests/package.json','utf8'));

test('browser CI uses isolated, test-balanced, internally serialized shards',()=>{
  const shards=workflow.match(/shard: \[([^\]]+)\]/)?.[1].split(',').map(value=>Number(value.trim()));
  assert.deepEqual(shards,[1,2,3,4,5,6,7,8,9,10,11,12]);
  assert.match(workflow,/browser-contract-shards:[\s\S]*?fail-fast: false/);
  assert.match(workflow,/--config=playwright\.ci\.config\.mjs --shard=\$\{\{ matrix\.shard \}\}\/12/);
  assert.match(ciConfig,/fullyParallel:true/);
  assert.match(ciConfig,/workers:1/);
  assert.match(ciConfig,/\['blob',\{outputDir:'blob-report'\}\]/);
});

test('browser CI installs the lockfile-pinned browser on Node 24',()=>{
  const version=browserPackage.devDependencies['@playwright/test'];
  assert.equal(version,'1.63.0');
  const shardJob=workflow.slice(workflow.indexOf('  browser-contract-shards:'),workflow.indexOf('  browser-contracts:'));
  assert.match(shardJob,/node-version: 24/);
  assert.match(shardJob,/playwright install --with-deps chromium/);
});

test('aggregate browser check always retains diagnostics and propagates shard failure',()=>{
  assert.match(workflow,/name: browser-contract-results-\$\{\{ matrix\.shard \}\}-of-12/);
  const aggregate=workflow.slice(workflow.indexOf('  browser-contracts:'),workflow.indexOf('  backstage-rehearsal:'));
  assert.match(aggregate,/if: always\(\)/);
  assert.match(aggregate,/needs: browser-contract-shards/);
  assert.match(aggregate,/playwright merge-reports --reporter=html,json/);
  assert.match(aggregate,/name: browser-contract-results\s/);
  assert.match(aggregate,/SHARD_RESULT: \$\{\{ needs\.browser-contract-shards\.result \}\}/);
  assert.match(aggregate,/test "\$SHARD_RESULT" = success/);
});

test('ordinary local browser command remains single-worker and unsharded',()=>{
  assert.match(browserPackage.scripts.test,/^playwright test$/);
  assert.match(localConfig,/fullyParallel:false/);
  assert.match(localConfig,/workers:1/);
});
