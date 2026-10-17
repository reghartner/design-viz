'use strict';
// The upstream Cloudflare deploy files must never carry account or Worker identity,
// and the local settings / generated files they produce must stay gitignored.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DIR = 'deploy/cloudflare';
const ALLOWED = ['deploy/cloudflare/README.md', 'deploy/cloudflare/deploy.sh', 'deploy/cloudflare/local.env.example'];

test('the generic Cloudflare deploy files are tracked', () => {
  // Forks may track more files here on purpose; upstream ships exactly these.
  const tracked = new Set(execFileSync('git', ['-C', ROOT, 'ls-files', '--', DIR], { encoding: 'utf8' })
    .split('\n').filter(Boolean));
  for (const rel of ALLOWED) assert.ok(tracked.has(rel), rel + ' is not tracked');
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

// Each pattern describes one way account or Worker identity could be written down.
const IDENTITY = [
  [/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i, 'a workers.dev address'],
  [/[a-z0-9-]+\.cloudflareaccess\.com/i, 'an Access team address'],
  [/\b[0-9a-f]{32}\b/i, 'a 32-hex identifier'],
  [/^[ \t]*(?:export[ \t]+)?FLOWVIEW_CF_WORKER[ \t]*=[ \t]*["']?[a-z0-9-]+["']?[ \t]*(?:#.*)?$/im, 'a Worker name assignment'],
  [/FLOWVIEW_CF_WORKER[ \t]*:[=-][ \t]*["']?[a-z0-9-]+/i, 'a Worker name default'],
  [/"name"\s*:\s*"[a-z0-9-]+"/, 'a hardcoded Worker name'],
  [/^\s*name\s*=\s*["'][a-z0-9-]+["']/m, 'a wrangler.toml Worker name'],
  [/--name[=\s]+["']?[a-z0-9-]+/, 'a Wrangler --name argument'],
  [/\baccount_id\b\s*[:=]/i, 'an account_id setting'],
];
function identityIn(text) {
  return IDENTITY.filter(([re]) => re.test(text)).map(([, what]) => what);
}

test('the identity check catches each planted form', () => {
  const planted = [
    'FLOWVIEW_CF_WORKER=my-worker', 'export FLOWVIEW_CF_WORKER=my-worker', 'FLOWVIEW_CF_WORKER="my-worker"',
    "FLOWVIEW_CF_WORKER='my-worker' # mine", ': "${FLOWVIEW_CF_WORKER:=my-worker}"', '${FLOWVIEW_CF_WORKER:-my-worker}',
    '{"name": "my-worker"}', 'name = "my-worker"', 'npx wrangler deploy --name my-worker', 'account_id = "x"',
    'https://my-worker.team.workers.dev/', 'https://team.cloudflareaccess.com/', '0123456789abcdef0123456789abcdef',
  ];
  for (const text of planted) assert.ok(identityIn(text).length, 'missed: ' + text);
  assert.deepStrictEqual(identityIn('FLOWVIEW_CF_WORKER=\nFLOWVIEW_CF_WORKER="$(sed -n x)"\n"name": "$FLOWVIEW_CF_WORKER"'), []);
});

test('tracked deploy files name no Worker, address or account', () => {
  for (const rel of ALLOWED) {
    const found = identityIn(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    assert.deepStrictEqual(found, [], rel + ' contains ' + found.join(', '));
  }
});
