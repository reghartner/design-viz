'use strict';
// Mock GitHub MCP (#756): the sibling of mock-atlassian-mcp that serves the
// timeline's pull requests through the two real connector tool names.
// H1 layout, dependency-free imports, placeholder config, ignore rules.
// H2 JSON-RPC discovery lists exactly the two read-only tools.
// H3 search grammar: key terms, repo/org scopes, ignored qualifiers, paging, items in the captured shape.
// H4 pull_request_read: get, get_check_runs, get_reviews, legacy get_status, unknown method/PR errors.
// H5 day selection and non-story scenarios; H6 worker routes; H7 README.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const DIR = 'deploy/cloudflare/mock-github-mcp';
const read = rel => { assert.ok(fs.existsSync(path.join(ROOT, rel)), rel + ' must exist'); return fs.readFileSync(path.join(ROOT, rel), 'utf8'); };
const json = rel => JSON.parse(read(rel));
const load = () => import(pathToFileURL(path.join(ROOT, DIR, 'mcp.mjs')).href);
const worker = async () => { await load(); return (await import(pathToFileURL(path.join(ROOT, DIR, 'worker.mjs')).href)).default; };
const NOW = Date.parse('2026-10-20T09:00:00Z');
const DAY8 = { scenario: 'story', day: 7, now: NOW };
const rpc = (method, params = {}, id = 1) => ({ jsonrpc: '2.0', id, method, params });
async function call(name, args = {}, context = DAY8) { const { handleMcp } = await load(); return handleMcp(rpc('tools/call', { name, arguments: args }), context); }
function result(response) {
  assert.equal(response.jsonrpc, '2.0'); assert.equal(response.id, 1); assert.equal(response.error, undefined);
  assert.equal(response.result.content.length, 1); assert.equal(response.result.content[0].type, 'text');
  assert.deepEqual(JSON.parse(response.result.content[0].text), response.result.structuredContent);
  return response.result.structuredContent;
}
const search = async (query, extra = {}, context) => result(await call('search_pull_requests', { query, ...extra }, context));
const readPR = async (method, number, repo = 'firmware', context) => call('pull_request_read', { method, owner: 'acme', repo, pullNumber: number }, context);

test('H1: module exports, layout, placeholder config and tracked sources', async () => {
  const mod = await load();
  for (const name of ['handleMcp', 'pullRequestsFor', 'parseSearch', 'searchItem', 'trimmedPullRequest', 'checkRuns', 'reviews']) assert.equal(typeof mod[name], 'function');
  assert.equal(typeof (await worker()).fetch, 'function');
  for (const file of ['worker.mjs', 'mcp.mjs', 'README.md', 'wrangler.jsonc']) assert.ok(fs.existsSync(path.join(ROOT, DIR, file)), file);
  const config = json(DIR + '/wrangler.jsonc');
  assert.equal(config.name, 'mock-github-mcp'); assert.equal(config.main, 'worker.mjs'); assert.ok(config.compatibility_date);
  for (const file of ['mcp.mjs', 'worker.mjs']) {
    const source = read(DIR + '/' + file);
    assert.doesNotMatch(source, /from\s+["'](?:node:|@|https?:)/);
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) assert.ok(match[1].startsWith('.'), match[1]);
  }
  for (const file of ['mcp.mjs', 'worker.mjs', 'README.md', 'wrangler.jsonc']) {
    const check = spawnSync('git', ['check-ignore', '-q', DIR + '/' + file], { cwd: ROOT });
    assert.equal(check.status, 1, DIR + '/' + file + ' must not be ignored');
  }
  assert.equal(spawnSync('git', ['check-ignore', '-q', DIR + '/local.env'], { cwd: ROOT }).status, 0, 'local settings stay ignored');
});

test('H2: tools/list exposes exactly the two read-only tools the adapter calls', async () => {
  const { handleMcp } = await load();
  const init = handleMcp(rpc('initialize', { protocolVersion: '2025-03-26' }), DAY8);
  assert.deepEqual(init.result, { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'mock-github-mcp', version: '0.1.0' } });
  const tools = handleMcp(rpc('tools/list'), DAY8).result.tools;
  assert.deepEqual(tools.map(tool => tool.name), ['search_pull_requests', 'pull_request_read']);
  for (const tool of tools) { assert.equal(tool.annotations.readOnlyHint, true); assert.equal(tool.inputSchema.type, 'object'); }
  assert.deepEqual(tools[1].inputSchema.required, ['method', 'owner', 'repo', 'pullNumber']);
  assert.ok(tools[1].inputSchema.properties.method.enum.includes('get_check_runs'));
  assert.equal(handleMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, DAY8), null);
  assert.equal(handleMcp(rpc('resources/list'), DAY8).error.code, -32601);
  assert.equal(handleMcp(rpc('tools/call', { name: 'nope', arguments: {} }), DAY8).error.code, -32602);
});

test('H3: search matches ticket keys within repo or org scope, ignores qualifiers and pages', async () => {
  const { parseSearch } = await load();
  assert.deepEqual(parseSearch('"FW-45" in:title,body repo:acme/firmware is:pr'), { terms: ['fw-45'], repos: ['acme/firmware'], org: null });
  assert.deepEqual(parseSearch('"BE-67" in:title,body org:acme'), { terms: ['be-67'], repos: [], org: 'acme' });
  assert.equal(parseSearch(''), null);
  const found = await search('"FW-45" in:title,body repo:acme/firmware', { fields: ['number', 'title'], perPage: 20 });
  assert.equal(found.total_count, 1); assert.equal(found.incomplete_results, false); assert.equal(found.search_type, 'lexical');
  const item = found.items[0];
  assert.equal(item.number, 88); assert.equal(item.state, 'open'); assert.equal(item.draft, false);
  assert.equal(item.html_url, 'https://github.com/acme/firmware/pull/88'); assert.equal(item.repository_url, 'https://api.github.com/repos/acme/firmware');
  assert.equal(item.user.login, 'sam'); assert.equal(item.pull_request.html_url, item.html_url); assert.equal(item.pull_request.merged_at, undefined);
  for (const field of ['title', 'labels', 'created_at', 'updated_at', 'closed_at']) assert.ok(Object.hasOwn(item, field), field);
  assert.equal((await search('"FW-45" in:title,body repo:acme/backend')).total_count, 0, 'repo scope excludes other repositories');
  assert.equal((await search('"UX-89" in:title,body org:acme')).items[0].draft, true, 'draft PRs report draft');
  assert.equal((await search('"UX-89" in:title,body org:other')).total_count, 0);
  assert.equal((await search('"HW-123"', { owner: 'acme', repo: 'hardware' })).items[0].number, 12, 'owner/repo arguments scope too');
  const merged = (await search('"HW-123" repo:acme/hardware', {}, { scenario: 'story', day: 8, now: NOW })).items[0];
  assert.equal(merged.state, 'closed'); assert.equal(merged.pull_request.merged_at, '2026-10-28T09:00:00Z'); assert.equal(merged.closed_at, '2026-10-28T09:00:00Z');
  const all = await search('in:title,body org:acme', { perPage: 2, page: 2 });
  assert.equal(all.total_count, 6); assert.equal(all.items.length, 2);
  assert.equal((await search('is:pr')).total_count, 6, 'qualifier-only queries list the day');
});

test('H4: pull_request_read serves get, check runs, reviews, the empty legacy status and errors', async () => {
  const pr = result(await readPR('get', 88));
  assert.equal(pr.number, 88); assert.equal(pr.state, 'open'); assert.equal(pr.merged, false); assert.equal(pr.draft, false);
  assert.equal(pr.html_url, 'https://github.com/acme/firmware/pull/88'); assert.equal(pr.head.repo.full_name, 'acme/firmware'); assert.equal(pr.user.login, 'sam');
  for (const field of ['mergeable_state', 'labels', 'base', 'additions', 'deletions', 'changed_files', 'commits', 'created_at', 'updated_at']) assert.ok(Object.hasOwn(pr, field), field);
  assert.equal(pr.merged_at, undefined); assert.equal(pr.closed_at, undefined);
  const done = result(await readPR('get', 88, 'firmware', { scenario: 'story', day: 9, now: NOW }));
  assert.equal(done.merged, true); assert.equal(done.state, 'closed'); assert.equal(done.merged_at, '2026-10-29T09:00:00Z'); assert.equal(done.merged_by.login, 'sam');
  const failing = result(await readPR('get_check_runs', 13, 'hardware'));
  assert.equal(failing.total_count, 2); assert.ok(failing.check_runs.some(run => run.status === 'completed' && run.conclusion === 'failure'));
  for (const run of failing.check_runs) for (const field of ['name', 'status', 'conclusion', 'html_url']) assert.ok(Object.hasOwn(run, field), field);
  const pending = result(await readPR('get_check_runs', 91, 'backend'));
  assert.ok(pending.check_runs.some(run => run.status === 'in_progress')); assert.ok(!pending.check_runs.some(run => run.conclusion === 'failure'));
  assert.ok(result(await readPR('get_check_runs', 88)).check_runs.every(run => run.conclusion === 'success'));
  assert.deepEqual(result(await readPR('get_check_runs', 41, 'app')), { total_count: 0, check_runs: [] });
  const approved = result(await readPR('get_reviews', 12, 'hardware'));
  assert.equal(approved.length, 1); assert.equal(approved[0].state, 'APPROVED'); assert.equal(approved[0].user.login, 'kim');
  assert.deepEqual(result(await readPR('get_reviews', 88)), []);
  assert.equal(result(await readPR('get_reviews', 91, 'backend', { scenario: 'story', day: 8, now: NOW }))[0].state, 'COMMENTED');
  const status = result(await readPR('get_status', 88));
  assert.equal(status.state, 'pending'); assert.equal(status.total_count, 0); assert.deepEqual(status.statuses, []);
  assert.equal((await readPR('get_files', 88)).error.code, -32602);
  assert.equal((await readPR('bogus', 88)).error.code, -32602);
  assert.equal((await readPR('get', 999)).error.message, 'Not Found');
  assert.equal((await readPR('get', 88, 'firmware', { scenario: 'story', day: 0, now: NOW })).error.message, 'Not Found', 'no PR before it opens');
});

test('H5: day selection follows the shared clock and non-story scenarios have no pull requests', async () => {
  const { pullRequestsFor } = await load();
  assert.equal(pullRequestsFor({ scenario: 'story', day: 0, now: NOW }).length, 0);
  assert.equal(pullRequestsFor({ scenario: 'story', day: 7, now: NOW }).length, 6);
  assert.equal(pullRequestsFor({ scenario: 'story', day: 11, now: NOW }).length, 8);
  assert.equal(pullRequestsFor({ scenario: 'story', day: 99, now: NOW }).length, 8, 'clamps to the last day');
  assert.equal(pullRequestsFor({ scenario: 'story', now: NOW + 7 * 60000 }).length, 6, 'one day per minute from the epoch');
  assert.equal(pullRequestsFor({ scenario: 'story', DEPLOYED_AT: new Date(NOW).toISOString(), now: NOW + 9 * 60000 }).length, 6);
  for (const scenario of ['all-todo', 'all-done', 'unknown']) assert.deepEqual(pullRequestsFor({ scenario, day: 11, now: NOW }), []);
  const timeline = { days: [{ issues: { 'AA-1': { state: 'active', prs: { count: 1, state: 'OPEN', links: [{ url: 'https://github.com/x/y/pull/5', state: 'open', checks: 'passing' }] } } } }] };
  const custom = pullRequestsFor({ scenario: 'story', day: 0, now: NOW, timeline });
  assert.equal(custom.length, 1); assert.equal(custom[0].owner, 'x'); assert.equal(custom[0].repo, 'y'); assert.equal(custom[0].number, 5); assert.equal(custom[0].key, 'AA-1');
});

test('H6: worker routes, batches, notifications and scenario selection', async () => {
  const fetchMock = async (url, init = {}, env = {}) => (await worker()).fetch(new Request('https://example.test' + url, init), env);
  const post = body => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await fetchMock('/healthz')).status, 200);
  assert.match(await (await fetchMock('/')).text(), /Mock GitHub MCP/);
  assert.equal((await fetchMock('/mcp')).status, 405);
  assert.equal((await fetchMock('/other', post(rpc('initialize')))).status, 404);
  assert.equal((await fetchMock('/mcp', { method: 'OPTIONS' })).status, 204);
  const init = await fetchMock('/mcp', post(rpc('initialize')));
  assert.equal(init.headers.get('access-control-allow-origin'), '*');
  assert.equal((await init.json()).result.serverInfo.name, 'mock-github-mcp');
  assert.equal((await fetchMock('/mcp', post({ jsonrpc: '2.0', method: 'notifications/initialized' }))).status, 202);
  assert.equal((await fetchMock('/mcp', { method: 'POST', body: '{' })).status, 400);
  const batch = await (await fetchMock('/mcp?scenario=story&day=7', post([rpc('tools/list'), rpc('tools/call', { name: 'search_pull_requests', arguments: { query: '"FW-45" repo:acme/firmware' } }, 2)]))).json();
  assert.equal(batch.length, 2); assert.equal(batch[1].result.structuredContent.items[0].number, 88);
  const none = await (await fetchMock('/mcp?scenario=all-done', post(rpc('tools/call', { name: 'search_pull_requests', arguments: { query: 'is:pr' } })))).json();
  assert.equal(none.result.structuredContent.total_count, 0);
});

test('H7: README documents deployment, connector setup, tools and fidelity', () => {
  const readme = read(DIR + '/README.md');
  for (const text of ['npx -y wrangler@4 deploy -c deploy/cloudflare/mock-github-mcp/wrangler.jsonc', 'https://<worker>.<subdomain>.workers.dev/mcp',
    'Settings → Connectors → Add custom connector', 'No sign-in', 'search_pull_requests', 'pull_request_read', 'get_check_runs', 'get_reviews', 'get_status',
    '?scenario=story&day=7', 'https://api.githubcopilot.com/mcp/', 'placeholder', 'rate limit']) assert.ok(readme.includes(text), text);
  assert.match(read('docs/live-status.md'), /mock-github-mcp\/README\.md/);
  assert.match(read('deploy/cloudflare/README.md'), /mock-github-mcp/);
});
