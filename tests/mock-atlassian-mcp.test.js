'use strict';
// Frozen RED contract matrix (M1–M11):
// M1  Module layout, dependency-free imports and deploy config.
// M2  JSON-RPC discovery/calls/errors, HTTP single/batch/notifications and routes.
// M3  Accessible resource identity agrees with the authored example.
// M4  Bounded JQL grammar, filters, limits, envelope and missing keys.
// M5  Single issue envelope and exact unknown-key error.
// M6  URL scenario/day selection, clamping, timed rotation and fallback.
// M7  Shared 10–14 day story, seven tickets, blocker/PR/missing progression.
// M8  Jira state/category conversion, stable IDs, Flagged and Development JSON.
// M9  Deployment/connector instructions and explicit parity caveats.
// M10 This file dynamically imports the pure handler and exercises the matrix.
// M11 Identity regexes mirror cloudflare-deploy.test.js; local output ignored.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const DIR = 'deploy/cloudflare/mock-atlassian-mcp';
const read = rel => {
  assert.ok(fs.existsSync(path.join(ROOT, rel)), rel + ' must exist');
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
};
const json = rel => JSON.parse(read(rel));
const load = () => import(pathToFileURL(path.join(ROOT, DIR, 'mcp.mjs')).href);
const worker = async () => {
  await load();
  return (await import(pathToFileURL(path.join(ROOT, DIR, 'worker.mjs')).href)).default;
};
const timeline = () => json('examples/live-status/live-status.timeline.json');
const KEYS = ['HW-123', 'HW-124', 'FW-45', 'FW-46', 'UX-89', 'BE-67', 'BE-68'];
const NOW = Date.parse('2026-10-20T09:00:00Z');
const CONTEXT = { scenario: 'story', day: 0, now: NOW };
const rpc = (method, params = {}, id = 1) => ({ jsonrpc: '2.0', id, method, params });
async function call(name, args = {}, context = CONTEXT) {
  const { handleMcp } = await load();
  return handleMcp(rpc('tools/call', { name, arguments: args }), context);
}
function result(response) {
  assert.equal(response.jsonrpc, '2.0');
  assert.equal(response.id, 1);
  assert.equal(response.error, undefined);
  assert.equal(response.result.content.length, 1);
  assert.equal(response.result.content[0].type, 'text');
  assert.deepEqual(JSON.parse(response.result.content[0].text), response.result.structuredContent);
  return response.result.structuredContent;
}
async function fetchMock(url, init = {}, env = {}) {
  return (await worker()).fetch(new Request('https://example.test' + url, init), env);
}
function post(body) {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

test('M1/M10: module exports, layout and placeholder config', async () => {
  const mod = await load();
  for (const name of ['handleMcp', 'jiraIssueFromStatus', 'parseJql']) assert.equal(typeof mod[name], 'function');
  assert.equal(typeof (await worker()).fetch, 'function');
  for (const file of ['worker.mjs', 'mcp.mjs', 'fixtures/all-todo.json', 'fixtures/all-done.json', 'README.md', 'wrangler.jsonc']) {
    assert.ok(fs.existsSync(path.join(ROOT, DIR, file)), file);
  }
  const config = json(DIR + '/wrangler.jsonc');
  assert.equal(config.name, 'mock-atlassian-mcp');
  assert.equal(config.main, 'worker.mjs');
  assert.ok(config.compatibility_date);
  assert.ok(!fs.existsSync(path.join(ROOT, DIR, 'node_modules')));
  for (const file of ['mcp.mjs', 'worker.mjs']) {
    const source = read(DIR + '/' + file);
    assert.doesNotMatch(source, /from\s+["'](?:node:|@|https?:)/);
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) assert.ok(match[1].startsWith('.'), match[1]);
  }
});

test('M2: initialize echo, tools/list schemas and read-only annotations', async () => {
  const { handleMcp } = await load();
  for (const protocolVersion of [undefined, '2025-03-26']) {
    assert.deepEqual(handleMcp(rpc('initialize', { protocolVersion }), CONTEXT), {
      jsonrpc: '2.0', id: 1, result: { protocolVersion: protocolVersion || '2025-06-18',
        capabilities: { tools: {} }, serverInfo: { name: 'mock-atlassian-mcp', version: '0.1.0' } }
    });
  }
  const tools = handleMcp(rpc('tools/list'), CONTEXT).result.tools;
  assert.deepEqual(tools.map(t => t.name).sort(), ['getAccessibleAtlassianResources', 'getJiraIssue', 'searchJiraIssuesUsingJql']);
  const inputs = { getAccessibleAtlassianResources: [], getJiraIssue: ['cloudId', 'issueIdOrKey', 'fields'],
    searchJiraIssuesUsingJql: ['cloudId', 'jql', 'fields', 'maxResults', 'nextPageToken'] };
  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, 'object');
    for (const name of inputs[tool.name]) assert.ok(tool.inputSchema.properties[name], name);
    assert.deepEqual(tool.annotations, { readOnlyHint: true, destructiveHint: false, title: tool.annotations.title });
    assert.ok(tool.annotations.title.length > 0);
  }
  assert.equal(handleMcp(rpc('not/a/method'), CONTEXT).error.code, -32601);
  assert.equal((await call('notATool')).error.code, -32602);
});

test('M2: Streamable HTTP JSON, batch, notifications, routes and protocol errors', async () => {
  let response = await fetchMock('/mcp', post(rpc('initialize')));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/json/);
  assert.equal((await response.json()).result.serverInfo.name, 'mock-atlassian-mcp');
  response = await fetchMock('/mcp', post([rpc('tools/list', {}, 'list'),
    { jsonrpc: '2.0', method: 'notifications/initialized' }, rpc('unknown', {}, 0)]));
  const batch = await response.json();
  assert.deepEqual(batch.map(r => r.id), ['list', 0]);
  assert.equal(batch[1].error.code, -32601);
  for (const body of [{ jsonrpc: '2.0', method: 'notifications/initialized' },
    [{ jsonrpc: '2.0', method: 'notifications/initialized' }]]) {
    response = await fetchMock('/mcp', post(body));
    assert.equal(response.status, 202);
    assert.equal(await response.text(), '');
  }
  assert.equal((await fetchMock('/mcp')).status, 405);
  response = await fetchMock('/');
  assert.match(response.headers.get('content-type'), /^text\/plain/);
  const description = await response.text();
  for (const scenario of ['story', 'all-todo', 'all-done']) assert.ok(description.includes(scenario));
  assert.equal(await (await fetchMock('/healthz')).text(), 'ok');
  assert.equal((await fetchMock('/missing')).status, 404);
  response = await fetchMock('/mcp', { method: 'POST', body: '{broken' });
  assert.equal((await response.json()).error.code, -32700);
  for (const body of [null, [], 42, { jsonrpc: '1.0', method: 'tools/list', id: 1 }]) {
    response = await fetchMock('/mcp', post(body));
    assert.equal((await response.json()).error.code, -32600);
  }
});

test('M2/M10: CORS preflight and JSON/error responses', async () => {
  const response = await fetchMock('/mcp', { method: 'OPTIONS' });
  assert.ok([200, 204].includes(response.status));
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  const headers = response.headers.get('access-control-allow-headers').toLowerCase().split(/,\s*/);
  for (const name of ['content-type', 'mcp-session-id', 'mcp-protocol-version']) assert.ok(headers.includes(name));
  assert.match(response.headers.get('access-control-allow-methods'), /POST/);
  for (const init of [post(rpc('tools/list')), { method: 'GET' }]) {
    assert.equal((await fetchMock('/mcp', init)).headers.get('access-control-allow-origin'), '*');
  }
});

test('M3: accessible resource agrees with the example site', async () => {
  assert.deepEqual(result(await call('getAccessibleAtlassianResources')), [{ id: 'mock-cloud-id-0001',
    url: json('examples/live-status/live-status.spec.json').page.tracking.jira.site,
    name: 'Acme (mock)', scopes: [], avatarUrl: '' }]);
});

test('M4: parseJql accepts supported clauses in any order and fails closed', async () => {
  const { parseJql } = await load();
  assert.deepEqual(parseJql('key in (HW-123,"FW-45", \'UX-89\')').keys, ['HW-123', 'FW-45', 'UX-89']);
  const clauses = ['KeY IN (hw-124,FW-46)', 'fLaGgEd = Impediment', 'statusCategory = "In Progress"', 'project = hw'];
  for (let offset = 0; offset < clauses.length; offset++) {
    const parsed = parseJql(clauses.slice(offset).concat(clauses.slice(0, offset)).join(' aNd '));
    assert.deepEqual(parsed.keys, ['HW-124', 'FW-46']);
    assert.equal(parsed.flagged, true);
    assert.equal(parsed.statusCategory, 'indeterminate');
    assert.equal(parsed.project, 'HW');
  }
  for (const [value, expected] of [['new', 'new'], ['"To Do"', 'new'], ['indeterminate', 'indeterminate'], ['done', 'done'], ['Done', 'done']]) {
    assert.equal(parseJql('statusCategory = ' + value).statusCategory, expected);
  }
  for (const jql of ['', 'text ~ hello', 'project = HW OR project = FW', 'key in (HW-123) ORDER BY updated',
    'key in (HW-123,)','key in ("HW-123\')', 'Flagged = no', 'statusCategory = nonsense', 'project = HW AND bogus = yes']) {
    assert.equal(parseJql(jql), null, jql);
    assert.deepEqual(result(await call('searchJiraIssuesUsingJql', { jql })).issues.nodes, [], jql);
  }
});

test('M4: search envelope, fields parity, filters, limits and missing keys', async () => {
  const jql = 'key in (HW-123, HW-124, FW-45, FW-46, UX-89, BE-67, BE-68, XX-999)';
  const found = result(await call('searchJiraIssuesUsingJql', { jql, fields: ['summary'], nextPageToken: 'ignored' }));
  assert.deepEqual(found.pageInfo, { hasNextPage: false, endCursor: null });
  assert.equal(found.issues.webUrl, 'https://acme.atlassian.net/issues/?jql=' + encodeURIComponent(jql));
  assert.deepEqual(found.issues.nodes.map(n => n.key).sort(), KEYS.slice().sort());
  for (const issue of found.issues.nodes) assert.ok(issue.fields.customFields);
  assert.equal(result(await call('searchJiraIssuesUsingJql', { jql, maxResults: 2 })).issues.nodes.length, 2);
  assert.equal(result(await call('searchJiraIssuesUsingJql', { jql, maxResults: 0 })).issues.nodes.length, 0);
  // Injected timeline proves default/upper limits despite the seven-ticket fixture.
  const issues = Object.fromEntries(Array.from({ length: 120 }, (_, i) => ['ZZ-' + i, { state: 'todo' }]));
  const context = { ...CONTEXT, timeline: { days: [{ issues }] } };
  for (const [args, count] of [[{}, 50], [{ maxResults: 101 }, 100], [{ maxResults: 3 }, 3]]) {
    assert.equal(result(await call('searchJiraIssuesUsingJql', { jql: 'project = ZZ', ...args }, context)).issues.nodes.length, count);
  }
  const days = timeline().days;
  const blockedDay = days.findIndex(d => d.issues['HW-124']?.state === 'blocked');
  const ctx = { ...CONTEXT, day: blockedDay };
  const filtered = result(await call('searchJiraIssuesUsingJql', {
    jql: 'statusCategory = indeterminate AND Flagged = Impediment AND project = HW AND key in (HW-124, FW-46)'
  }, ctx));
  assert.deepEqual(filtered.issues.nodes.map(n => n.key), ['HW-124']);
  assert.deepEqual(result(await call('searchJiraIssuesUsingJql', { jql: 'statusCategory = done' })).issues.nodes, []);
  const missingDay = days.findIndex(d => !d.issues['UX-89']);
  assert.ok(missingDay >= 0);
  assert.deepEqual(result(await call('searchJiraIssuesUsingJql', { jql: 'key in (UX-89)' }, { ...CONTEXT, day: missingDay })).issues.nodes, []);
});

test('M5: getJiraIssue found and exact not-found error', async () => {
  const issue = result(await call('getJiraIssue', { cloudId: 'mock-cloud-id-0001', issueIdOrKey: 'HW-123', fields: ['summary'] })).data;
  assert.equal(issue.appliedContentFormat, 'markdown');
  assert.equal(issue.key, 'HW-123');
  assert.match(issue.id, /^\d+$/);
  assert.equal(issue.fields.summary, timeline().days[0].issues['HW-123'].summary);
  assert.deepEqual((await call('getJiraIssue', { issueIdOrKey: 'HW-999' })).error, {
    code: -32602, message: 'Issue does not exist or you do not have permission to see it.'
  });
});

test('M6: URL scenarios, pinned/clamped days, timed rotation and constant fallback', async () => {
  const days = timeline().days;
  const search = rpc('tools/call', { name: 'searchJiraIssuesUsingJql', arguments: { jql: 'key in (' + KEYS.join(',') + ')' } });
  for (const [query, state] of [['scenario=all-todo', 'new'], ['scenario=all-done', 'done'], ['scenario=unknown', 'new'], ['day=-99', 'new'], ['day=999', 'done']]) {
    const response = await fetchMock('/mcp?' + query, post(search));
    const issues = result(await response.json()).issues.nodes;
    assert.equal(issues.length, 7);
    assert.ok(issues.every(i => i.fields.status.statusCategory.key === state), query);
  }
  const { handleMcp } = await load();
  const dep = '2026-10-20T09:00:00Z';
  const timed = { scenario: 'story', DEPLOYED_AT: dep, now: NOW + (days.length + 3) * 60000 };
  assert.deepEqual(handleMcp(search, timed), handleMcp(search, { ...CONTEXT, day: 3 }));
  assert.deepEqual(handleMcp(search, { ...timed, day: 1 }), handleMcp(search, { ...CONTEXT, day: 1 }));
  assert.deepEqual(handleMcp(search, { now: NOW }), handleMcp(search, { now: NOW, DEPLOYED_AT: 'bad-date' }));
  assert.deepEqual(await (await fetchMock('/mcp?day=3', post(search))).json(), handleMcp(search, { ...CONTEXT, day: 3 }));
});

test('M7: shared timeline and fixed fixtures tell the required story', () => {
  const story = timeline();
  assert.equal(story.version, 1);
  assert.equal(story.intervalSeconds, 6);
  assert.ok(story.days.length >= 10 && story.days.length <= 14);
  assert.match(story.days[0].label, /^Day 1 — kickoff$/);
  const first = story.days[0].issues;
  const last = story.days.at(-1).issues;
  assert.deepEqual(Object.keys(first).sort(), KEYS.slice().sort());
  assert.deepEqual(Object.keys(last).filter(k => KEYS.includes(k)).sort(), KEYS.slice().sort());
  assert.ok(Object.values(first).every(e => e.state === 'todo'));
  assert.ok(Object.values(last).every(e => e.state === 'done'));
  const start = key => story.days.findIndex(d => d.issues[key]?.state === 'active');
  assert.ok(start('HW-123') > 0 && start('FW-45') > start('HW-123'));
  const blocked = story.days.findIndex(d => d.issues['HW-124']?.state === 'blocked');
  assert.ok(blocked > start('FW-45'));
  assert.equal(story.days[blocked].issues['HW-124'].flagged, true);
  assert.equal(story.days[blocked].issues['HW-124'].statusName, 'Blocked');
  assert.ok(['todo', 'blocked'].includes(story.days[blocked].issues['FW-46'].state));
  assert.ok(start('UX-89') >= blocked && start('BE-67') >= blocked);
  assert.ok(story.days.slice(blocked + 1).some(d => d.issues['HW-124'].state === 'active' && !d.issues['HW-124'].flagged));
  assert.equal(story.days.filter(d => !d.issues['UX-89']).length, 1);
  for (const day of story.days) {
    assert.ok(day.label && day.note);
    for (const entry of Object.values(day.issues)) {
      assert.ok(['todo', 'active', 'done', 'blocked'].includes(entry.state));
      assert.equal(typeof entry.summary, 'string');
      assert.equal(typeof entry.assignee, 'string');
      assert.match(entry.assigneeId, /^712020:[0-9a-f-]{36}$/, '#764 fictional accountId');
      assert.equal(typeof entry.flagged, 'boolean');
      assert.equal(typeof entry.statusName, 'string');
      assert.match(entry.updated, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}\+0000$/);
      assert.ok(Number.isFinite(Date.parse(entry.updated)));
      assert.ok(Number.isInteger(entry.prs.count));
      assert.ok([null, 'OPEN', 'MERGED', 'DECLINED'].includes(entry.prs.state));
    }
  }
  const opened = story.days.findIndex(d => Object.values(d.issues).some(e => e.prs.state === 'OPEN'));
  const merged = story.days.findIndex(d => Object.values(d.issues).some(e => e.prs.state === 'MERGED'));
  assert.ok(opened > blocked && merged > opened);
  for (const [name, state] of [['all-todo', 'todo'], ['all-done', 'done']]) {
    const fixture = json(DIR + '/fixtures/' + name + '.json');
    assert.deepEqual(Object.keys(fixture.issues).filter(k => KEYS.includes(k)).sort(), KEYS.slice().sort());
    assert.ok(Object.values(fixture.issues).every(e => e.state === state));
  }
  const sources = read(DIR + '/mcp.mjs') + read(DIR + '/worker.mjs');
  assert.match(sources, /from\s+['"][^'"]*examples\/live-status\/live-status\.timeline\.json['"]/);
});

test('M8: Jira conversion, stable IDs, category names, flagged and Development string', async () => {
  const { jiraIssueFromStatus } = await load();
  const ids = new Set();
  for (const key of KEYS) {
    const id = jiraIssueFromStatus(key, { state: 'todo' }, NOW).id;
    assert.match(id, /^\d+$/);
    ids.add(id);
    assert.equal(jiraIssueFromStatus(key, { state: 'done' }, NOW + 1).id, id);
  }
  assert.equal(ids.size, KEYS.length);
  for (const [state, key, name, status] of [['todo', 'new', 'To Do', 'To Do'], ['active', 'indeterminate', 'In Progress', 'In Progress'],
    ['blocked', 'indeterminate', 'In Progress', 'Blocked'], ['done', 'done', 'Done', 'Done']]) {
    const fields = jiraIssueFromStatus('HW-123', { state, summary: 'Button', assignee: 'Alex', prs: { count: 0, state: null } }, NOW).fields;
    assert.deepEqual(fields.status, { name: status, statusCategory: { key, name } });
    assert.deepEqual(fields.assignee, { displayName: 'Alex' });
    assert.equal(fields.summary, 'Button');
    assert.equal(typeof fields.priority.name, 'string');
    assert.equal(typeof fields.issuetype.name, 'string');
    assert.match(fields.updated, /\.000\+0000$/);
    assert.equal(fields.customFields.Development, undefined);
    if (state === 'blocked') assert.deepEqual(fields.customFields.Flagged, [{ value: 'Impediment' }]);
    else assert.ok(!fields.customFields.Flagged || fields.customFields.Flagged.length === 0);
  }
  assert.equal(jiraIssueFromStatus('HW-123', { state: 'todo', assignee: null }, NOW).fields.assignee, null);
  assert.deepEqual(jiraIssueFromStatus('HW-123', { state: 'todo', assignee: 'Alex', assigneeId: '712020:abc' }, NOW).fields.assignee, { displayName: 'Alex', accountId: '712020:abc' }, '#764 accountId passthrough');
  const flagged = jiraIssueFromStatus('HW-123', { state: 'active', flagged: true, statusName: 'Review' }, NOW).fields;
  assert.equal(flagged.status.name, 'Review');
  assert.deepEqual(flagged.customFields.Flagged, [{ value: 'Impediment' }]);
  for (const state of ['OPEN', 'MERGED', 'DECLINED']) {
    const development = jiraIssueFromStatus('HW-123', { state: 'active', prs: { count: 2, state } }, NOW).fields.customFields.Development;
    assert.equal(typeof development, 'string');
    assert.match(development, new RegExp('^\\{pullrequest=\\{dataType=pullrequest, state=' + state + ', stateCount=2\\}, json='));
    const parsed = JSON.parse(development.slice(development.indexOf('json=') + 5, -1));
    assert.deepEqual(parsed.cachedValue.errors, []);
    assert.equal(parsed.cachedValue.isStale, false);
    const summary = parsed.cachedValue.summary.pullrequest;
    assert.deepEqual(summary.byInstanceType, { github: { count: 2, name: 'GitHub' } });
    assert.deepEqual(summary.overall, { count: 2, lastUpdated: '2026-10-20T09:00:00.000+0000', stateCount: 2,
      state, dataType: 'pullrequest', open: state === 'OPEN' });
  }
});

test('M9: README describes deployment, connector setup and unverified parity', () => {
  const readme = read(DIR + '/README.md');
  for (const text of ['npx -y wrangler@4 deploy -c deploy/cloudflare/mock-atlassian-mcp/wrangler.jsonc',
    'https://<worker>.<subdomain>.workers.dev/mcp', 'Settings → Connectors → Add custom connector', 'No sign-in', 'Atlassian MCP',
    '?scenario=story', '?scenario=all-todo', '?scenario=all-done', '&day=', 'compact-view', 'customFields', 'Development']) assert.ok(readme.includes(text), text);
  assert.match(readme, /public documentation and community reports/);
  assert.match(readme, /not a captured `tools\/list`/);
  assert.match(readme, /placeholder/);
  assert.match(read('docs/live-status.md'), /mock-atlassian-mcp\/README\.md/);
});

const IDENTITY = [
  /[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i,
  /[a-z0-9-]+\.cloudflareaccess\.com/i,
  /\b[0-9a-f]{32}\b/i,
  /FLOWVIEW_CF_WORKER[ \t]*:?[=-][ \t]*["']?[A-Za-z0-9-]/,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/,
  /"name"\s*:\s*"[a-z0-9-]+"/,
  /^\s*name\s*=\s*["'][a-z0-9-]+["']/m,
  /--name[=\s]+["']?[a-z0-9-]+/,
  /\baccount_id\b\s*[:=]/i,
];
test('M11: identity and recursive ignore rules protect the new deploy folder', () => {
  assert.ok(fs.existsSync(path.join(ROOT, DIR)), DIR + ' must exist');
  // Scan only files git would track: local state such as .cloudflare/cache or
  // .dev.vars is ignored by the rules checked below and must not fail this test.
  const files = fs.readdirSync(path.join(ROOT, DIR), { recursive: true })
    .filter(f => fs.statSync(path.join(ROOT, DIR, f)).isFile())
    .filter(f => spawnSync('git', ['-C', ROOT, 'check-ignore', '--no-index', '-q', DIR + '/' + f]).status === 1);
  for (const file of files) {
    // The contract explicitly permits only this one placeholder name.
    const source = read(DIR + '/' + file).replace(/"name"\s*:\s*"mock-atlassian-mcp"/g, '"name": "$PLACEHOLDER"');
    for (const pattern of IDENTITY) assert.doesNotMatch(source, pattern, file);
  }
  for (const file of ['worker.mjs', 'mcp.mjs', 'wrangler.jsonc', 'fixtures/all-todo.json', 'README.md']) {
    assert.equal(spawnSync('git', ['-C', ROOT, 'check-ignore', '--no-index', '-q', DIR + '/' + file]).status, 1, file);
  }
  for (const file of ['.wrangler/state', 'local.env', 'nested/local.env', 'nested/.wrangler/state', '.dev.vars', '.cloudflare/cache/account.json']) {
    assert.equal(spawnSync('git', ['-C', ROOT, 'check-ignore', '--no-index', '-q', DIR + '/' + file]).status, 0, file);
  }
});

test('E5 parent JQL returns current epic children and flagged subset with parent fields',async()=>{
 const {parseJql}=await load();assert.deepEqual(parseJql('parent = DOOR-100'),{parent:'DOOR-100'});assert.deepEqual(parseJql('parent = DOOR-100 AND Flagged = Impediment'),{parent:'DOOR-100',flagged:true});
 for(const jql of ['parent = bad','parent = DOOR-100 OR parent = NO-1','parent = DOOR-100 AND parent = NO-1'])assert.equal(parseJql(jql),null);
 for(const day of [0,3,7,11]){
  const issues=result(await call('searchJiraIssuesUsingJql',{jql:'parent = DOOR-100'},{...CONTEXT,day})).issues.nodes;
  assert.equal(issues.length,day>=7?8:7);for(const issue of issues)assert.deepEqual(issue.fields.parent,{key:'DOOR-100',fields:{summary:'Connected doorbell delivery',issuetype:{name:'Epic'}}});
 }
 const flagged=result(await call('searchJiraIssuesUsingJql',{jql:'parent = DOOR-100 AND Flagged = Impediment'},{...CONTEXT,day:3})).issues.nodes;assert.deepEqual(flagged.map(i=>i.key),['HW-124']);
 assert.deepEqual(result(await call('searchJiraIssuesUsingJql',{jql:'parent = OTHER-1'})).issues.nodes,[]);
});
test('E5 epic issue rolls up children and fixed scenarios include the extra child',async()=>{
 for(const [context,state] of [[{...CONTEXT,day:0},'To Do'],[{...CONTEXT,day:3},'In Progress'],[{...CONTEXT,day:11},'Done'],[{...CONTEXT,scenario:'all-todo'},'To Do'],[{...CONTEXT,scenario:'all-done'},'Done']]){
  const response=await call('getJiraIssue',{issueIdOrKey:'DOOR-100'},context);assert.equal(response.error,undefined,'epic exists');const issue=result(response).data;
  assert.equal(issue.key,'DOOR-100');assert.equal(issue.fields.issuetype.name,'Epic');assert.equal(issue.fields.status.name,state);
  if(context.scenario!=='story'){const children=result(await call('searchJiraIssuesUsingJql',{jql:'parent = DOOR-100'},context)).issues.nodes;assert.equal(children.length,8);assert.ok(children.some(i=>i.key==='UX-90' && i.fields.parent.key==='DOOR-100'));}
 }
});
test('E4 example epic has seven original stories and UX-90 appears only from Day 8',()=>{
 assert.equal(json('examples/live-status/live-status.spec.json').page.tracking.jira.epic,'DOOR-100');
 timeline().days.forEach((day,index)=>{for(const key of KEYS)if(day.issues[key])assert.equal(day.issues[key].epic,'DOOR-100');
  if(index<7)assert.equal(day.issues['UX-90'],undefined);else{const extra=day.issues['UX-90'];assert.ok(extra);assert.equal(extra.summary,'Alert sound setting');assert.equal(extra.lane,'APP');assert.equal(extra.epic,'DOOR-100');}
 });
});
