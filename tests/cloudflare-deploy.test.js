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
    .concat(['wrangler.jsonc', 'wrangler.toml', '.wrangler/state', '.dev.vars',
      '.cloudflare/cache/cloudflare-account.json', 'docs/.cloudflare/cache/cloudflare-account.json', 'tools/.wrangler/state']);
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
  // Structural rule: wherever FLOWVIEW_CF_WORKER is given a value (=, :=, :-, -),
  // the value must not begin like a Worker name (letter, digit or hyphen, optionally
  // quoted). Empty values, comments, $ references and sed delimiters pass.
  [/FLOWVIEW_CF_WORKER[ \t]*:?[=-][ \t]*["']?[A-Za-z0-9-]/, 'a Worker name value'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/, 'an email address'],
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
    'export FLOWVIEW_CF_WORKER="my-worker";', 'FLOWVIEW_CF_WORKER=my-worker sh deploy/cloudflare/deploy.sh',
    'env FLOWVIEW_CF_WORKER=my-worker npx wrangler', '${FLOWVIEW_CF_WORKER-my-worker}', 'FLOWVIEW_CF_WORKER = my-worker',
    'contact someone@example.com',
  ];
  for (const text of planted) assert.ok(identityIn(text).length, 'missed: ' + text);
  const allowed = [
    'FLOWVIEW_CF_WORKER=', 'FLOWVIEW_CF_WORKER=  # set me', 'FLOWVIEW_CF_WORKER=""', 'FLOWVIEW_CF_WORKER="$(sed -n x)"',
    'if [ -z "${FLOWVIEW_CF_WORKER:-}" ]', 'case "${FLOWVIEW_CF_WORKER:-}" in', '"name": "$FLOWVIEW_CF_WORKER"',
    "sed -n 's/^FLOWVIEW_CF_WORKER=//p'",
  ];
  for (const text of allowed) assert.deepStrictEqual(identityIn(text), [], 'flagged: ' + text);
});

// Every tracked line that gives FLOWVIEW_CF_WORKER a value must be one of these.
// A new or computed assignment fails here until someone reviews and lists it.
const ASSIGNMENT = /FLOWVIEW_CF_WORKER[ \t]*:?[=-]/;
const ALLOWED_ASSIGNMENTS = new Set([
  'FLOWVIEW_CF_WORKER=',
  'if [ -z "${FLOWVIEW_CF_WORKER:-}" ] && [ -f "$HERE/local.env" ]; then',
  'FLOWVIEW_CF_WORKER="$(sed -n \'s/^FLOWVIEW_CF_WORKER=//p\' "$HERE/local.env" | tail -n 1)"',
  'case "${FLOWVIEW_CF_WORKER:-}" in',
]);

test('FLOWVIEW_CF_WORKER is only assigned by reviewed lines', () => {
  for (const rel of ALLOWED) {
    fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').forEach((line, i) => {
      if (ASSIGNMENT.test(line)) assert.ok(ALLOWED_ASSIGNMENTS.has(line.trim()), rel + ':' + (i + 1) + ' assigns FLOWVIEW_CF_WORKER: ' + line.trim());
    });
  }
});

test('deploy.sh rejects invalid Worker names before building', () => {
  // python3 and npx are stubbed so a name that wrongly passes validation exits 99
  // instead of building or contacting Cloudflare.
  const stubs = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'cf-deploy-stubs-'));
  for (const tool of ['python3', 'npx']) {
    fs.writeFileSync(path.join(stubs, tool), '#!/bin/sh\nexit 99\n', { mode: 0o755 });
  }
  const bad = ['Upper', 'ALLCAPS', 'has_underscore', 'has.dot', '-lead', 'trail-', 'a'.repeat(64)];
  if (!fs.existsSync(path.join(ROOT, DIR, 'local.env'))) bad.push('');
  for (const name of bad) {
    const r = spawnSync('sh', [path.join(ROOT, DIR, 'deploy.sh')], {
      env: { ...process.env, FLOWVIEW_CF_WORKER: name, PATH: stubs + path.delimiter + process.env.PATH, LANG: 'en_US.UTF-8' },
      encoding: 'utf8',
    });
    assert.strictEqual(r.status, 1, JSON.stringify(name) + ' was accepted (status ' + r.status + ')');
    assert.match(r.stderr, /Set FLOWVIEW_CF_WORKER/, JSON.stringify(name));
  }
  fs.rmSync(stubs, { recursive: true, force: true });
});

test('tracked deploy files name no Worker, address or account', () => {
  for (const rel of ALLOWED) {
    const found = identityIn(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    assert.deepStrictEqual(found, [], rel + ' contains ' + found.join(', '));
  }
});
