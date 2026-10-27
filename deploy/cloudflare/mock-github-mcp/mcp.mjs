// Pure JSON-RPC handler: no network, filesystem, clock or Cloudflare APIs.
// Wrangler bundles the JSON import; examples/ is the story's single source. The
// pull requests served here are the timeline's `prs.links`, so the Jira mock and
// this GitHub mock tell the same story day by day.
import story from '../../../examples/live-status/live-status.timeline.json' with { type: 'json' };

const EPOCH = Date.parse('2026-10-20T09:00:00Z');
const API = 'https://api.github.com';
const METHODS = ['get', 'get_diff', 'get_status', 'get_files', 'get_commits', 'get_review_comments', 'get_reviews', 'get_comments', 'get_check_runs'];
const TOOL_INPUTS = {
  search_pull_requests: {
    title: 'Search pull requests', required: ['query'],
    properties: { query: { type: 'string' }, owner: { type: 'string' }, repo: { type: 'string' },
      fields: { type: 'array', items: { type: 'string' } }, sort: { type: 'string' }, order: { type: 'string' },
      page: { type: 'integer', minimum: 1 }, perPage: { type: 'integer', minimum: 1, maximum: 100 } }
  },
  pull_request_read: {
    title: 'Read a pull request', required: ['method', 'owner', 'repo', 'pullNumber'],
    properties: { method: { type: 'string', enum: METHODS }, owner: { type: 'string' }, repo: { type: 'string' },
      pullNumber: { type: 'integer', minimum: 1 } }
  }
};

function dayIndex(env, days) {
  if (env.day !== undefined && env.day !== null && Number.isFinite(Number(env.day))) {
    return Math.max(0, Math.min(days.length - 1, Math.floor(Number(env.day))));
  }
  const deployed = Date.parse(env.DEPLOYED_AT);
  const elapsed = Math.floor(((env.now ?? EPOCH) - (Number.isFinite(deployed) ? deployed : EPOCH)) / 60000);
  // Positive modulo keeps future deployment epochs safe too.
  return ((elapsed % days.length) + days.length) % days.length;
}

// Every pull request of the selected story day, tagged with the ticket it belongs to.
export function pullRequestsFor(env = {}) {
  if ((env.scenario ?? 'story') !== 'story') return [];
  const days = (env.timeline || story).days;
  const issues = days[dayIndex(env, days)].issues;
  const out = [];
  for (const [key, issue] of Object.entries(issues)) {
    for (const link of issue.prs?.links || []) {
      const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)$/.exec(link.url);
      if (match) out.push({ key, owner: match[1], repo: match[2], number: Number(match[3]), link, issue });
    }
  }
  return out;
}

// Deliberately small grammar: quoted or bare terms, repo:/org:/is:/in: qualifiers.
export function parseSearch(query) {
  if (typeof query !== 'string' || !query.trim()) return null;
  const parsed = { terms: [], repos: [], org: null };
  for (const token of query.match(/"[^"]*"|\S+/g) || []) {
    let match;
    if ((match = /^repo:([^/\s]+\/[^/\s]+)$/i.exec(token))) parsed.repos.push(match[1].toLowerCase());
    else if ((match = /^org:(\S+)$/i.exec(token))) parsed.org = match[1].toLowerCase();
    else if (/^(?:is|in|state|type):/i.test(token)) continue;
    else parsed.terms.push(token.replace(/^"|"$/g, '').toLowerCase());
  }
  return parsed;
}

function updated(entry) {
  return entry.link.mergedAt || entry.issue.updated?.replace(/\.000\+0000$/, 'Z') || new Date(EPOCH).toISOString();
}
function user(entry) {
  const login = (entry.link.author || 'octocat').toLowerCase();
  return { login, avatar_url: 'https://avatars.githubusercontent.com/u/0?v=4', html_url: 'https://github.com/' + login };
}
export function searchItem(entry) {
  const merged = entry.link.state === 'merged';
  return {
    number: entry.number, title: entry.link.title || entry.key, state: entry.link.state === 'open' || entry.link.state === 'draft' ? 'open' : 'closed',
    html_url: entry.link.url, repository_url: API + '/repos/' + entry.owner + '/' + entry.repo, user: user(entry), labels: [],
    draft: entry.link.state === 'draft', created_at: new Date(EPOCH).toISOString(), updated_at: updated(entry),
    closed_at: merged || entry.link.state === 'closed' ? updated(entry) : null,
    pull_request: { html_url: entry.link.url, ...(merged ? { merged_at: entry.link.mergedAt || updated(entry) } : {}) }
  };
}
export function trimmedPullRequest(entry) {
  const item = searchItem(entry), merged = entry.link.state === 'merged';
  return {
    number: item.number, title: item.title, state: item.state, draft: item.draft, merged, mergeable_state: merged ? 'unknown' : 'clean',
    html_url: item.html_url, user: item.user, labels: [], head: { ref: entry.link.branch || entry.key.toLowerCase() + '-' + entry.number, sha: '0'.repeat(40), repo: { full_name: entry.owner + '/' + entry.repo } },
    base: { ref: 'main' }, additions: 42, deletions: 7, changed_files: 3, commits: 2, created_at: item.created_at, updated_at: item.updated_at,
    ...(item.closed_at ? { closed_at: item.closed_at } : {}), ...(merged ? { merged_at: item.pull_request.merged_at, merged_by: item.user } : {})
  };
}
export function checkRuns(entry) {
  const checks = entry.link.checks || 'none';
  if (checks === 'none') return { total_count: 0, check_runs: [] };
  const run = (name, status, conclusion) => ({ name, status, conclusion, html_url: entry.link.url + '/checks' });
  const runs = checks === 'failing' ? [run('build', 'completed', 'success'), run('tests', 'completed', 'failure')]
    : checks === 'pending' ? [run('build', 'completed', 'success'), run('tests', 'in_progress', null)]
    : [run('build', 'completed', 'success'), run('tests', 'completed', 'success')];
  return { total_count: runs.length, check_runs: runs };
}
export function reviews(entry) {
  const state = { approved: 'APPROVED', 'changes-requested': 'CHANGES_REQUESTED', commented: 'COMMENTED' }[entry.link.review || 'none'];
  if (!state) return [];
  return [{ id: entry.number * 10, state, user: { login: 'kim' }, submitted_at: updated(entry), html_url: entry.link.url + '#pullrequestreview-' + entry.number }];
}

function error(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function toolResult(name, args, env, id) {
  const all = pullRequestsFor(env);
  if (name === 'search_pull_requests') {
    const parsed = parseSearch(args.query);
    const perPage = typeof args.perPage === 'number' && Number.isFinite(args.perPage) ? Math.max(1, Math.min(100, Math.floor(args.perPage))) : 30;
    const page = typeof args.page === 'number' && Number.isFinite(args.page) ? Math.max(1, Math.floor(args.page)) : 1;
    const repos = parsed ? parsed.repos.slice() : [];
    if (typeof args.owner === 'string' && typeof args.repo === 'string') repos.push((args.owner + '/' + args.repo).toLowerCase());
    const matches = parsed ? all.filter(entry => {
      const full = (entry.owner + '/' + entry.repo).toLowerCase(), text = (entry.key + ' ' + (entry.link.title || '')).toLowerCase();
      return (!repos.length || repos.includes(full)) && (!parsed.org || parsed.org === entry.owner.toLowerCase()) &&
        parsed.terms.every(term => text.includes(term));
    }) : [];
    return { total_count: matches.length, incomplete_results: false, search_type: 'lexical',
      items: matches.slice((page - 1) * perPage, page * perPage).map(searchItem) };
  }
  if (name === 'pull_request_read') {
    if (!METHODS.includes(args.method)) return error(id, -32602, 'Unknown method: ' + String(args.method));
    const entry = all.find(entry => entry.owner.toLowerCase() === String(args.owner).toLowerCase() &&
      entry.repo.toLowerCase() === String(args.repo).toLowerCase() && entry.number === args.pullNumber);
    if (!entry) return error(id, -32602, 'Not Found');
    if (args.method === 'get') return trimmedPullRequest(entry);
    if (args.method === 'get_check_runs') return checkRuns(entry);
    if (args.method === 'get_reviews') return reviews(entry);
    // The legacy commit-status API: Actions-only repositories report nothing here (docs/live-status.md).
    if (args.method === 'get_status') return { state: 'pending', total_count: 0, statuses: [], sha: '0'.repeat(40) };
    return error(id, -32602, 'Method not supported by this mock: ' + args.method);
  }
  return error(id, -32602, 'Unknown tool: ' + String(name));
}

// env.now is epoch milliseconds; the HTTP adapter supplies the clock. Optional
// env.scenario/day select URL state; env.timeline allows deterministic fixtures.
// No response (null) is returned for valid JSON-RPC notifications.
export function handleMcp(request, env = {}) {
  if (!request || typeof request !== 'object' || Array.isArray(request) || request.jsonrpc !== '2.0' ||
      typeof request.method !== 'string' ||
      (Object.hasOwn(request, 'id') && request.id !== null && typeof request.id !== 'string' && typeof request.id !== 'number')) {
    return error(null, -32600, 'Invalid Request');
  }
  const { id, method } = request;
  if (!Object.hasOwn(request, 'id')) return null;
  const params = request.params ?? {};
  if (typeof params !== 'object' || Array.isArray(params)) return error(id, -32602, 'Invalid params');
  let result;
  if (method === 'initialize') {
    result = { protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: {} },
      serverInfo: { name: 'mock-github-mcp', version: '0.1.0' } };
  } else if (method === 'tools/list') {
    result = { tools: Object.entries(TOOL_INPUTS).map(([name, input]) => ({
      name, description: input.title + ' (mock data)',
      inputSchema: { type: 'object', properties: input.properties, required: input.required },
      annotations: { readOnlyHint: true, destructiveHint: false, title: input.title }
    })) };
  } else if (method === 'tools/call') {
    const args = params.arguments ?? {};
    if (typeof args !== 'object' || Array.isArray(args)) return error(id, -32602, 'Invalid tool arguments');
    const value = toolResult(params.name, args, env, id);
    if (value.error) return value;
    result = { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
  } else {
    return error(id, -32601, 'Method not found: ' + method);
  }
  return { jsonrpc: '2.0', id, result };
}
