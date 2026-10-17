'use strict';
// The Cloudflare deploy folder must never carry account or Worker identity:
// only three generic files may be tracked there, and they name no Worker.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DIR = 'deploy/cloudflare';
const ALLOWED = ['deploy/cloudflare/README.md', 'deploy/cloudflare/deploy.sh', 'deploy/cloudflare/local.env.example'];

test('only the generic Cloudflare deploy files are tracked', () => {
  const tracked = execFileSync('git', ['-C', ROOT, 'ls-files', '--', DIR], { encoding: 'utf8' })
    .split('\n').filter(Boolean).sort();
  assert.deepStrictEqual(tracked, [...ALLOWED].sort());
});

test('local settings, generated config and upload output are gitignored', () => {
  const paths = ['local.env', '.generated/wrangler.jsonc', 'site/workbench/flowspec.html', '.wrangler/state', 'wrangler.jsonc']
    .map(rel => path.posix.join(DIR, rel))
    .concat(['wrangler.jsonc', 'wrangler.toml', '.wrangler/state', '.dev.vars']);
  for (const file of paths) {
    const r = spawnSync('git', ['-C', ROOT, 'check-ignore', '--no-index', '-q', file]);
    assert.strictEqual(r.status, 0, file + ' is not gitignored');
  }
  for (const file of ALLOWED) {
    const r = spawnSync('git', ['-C', ROOT, 'check-ignore', '--no-index', '-q', file]);
    assert.strictEqual(r.status, 1, file + ' should be trackable');
  }
});

test('tracked deploy files name no Worker, address or account', () => {
  for (const rel of ALLOWED) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.doesNotMatch(text, /[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i, rel + ' contains a workers.dev address');
    assert.doesNotMatch(text, /[a-z0-9-]+\.cloudflareaccess\.com/i, rel + ' contains an Access team address');
    assert.doesNotMatch(text, /\b[0-9a-f]{32}\b/i, rel + ' contains a 32-hex identifier');
    assert.doesNotMatch(text, /^\s*FLOWVIEW_CF_WORKER=[a-z0-9-]+\s*$/m, rel + ' sets a Worker name');
    assert.doesNotMatch(text, /"name"\s*:\s*"[a-z0-9-]+"/, rel + ' hardcodes a Worker name');
  }
});
