// Pure JSON-RPC handler: no network, filesystem, clock or Cloudflare APIs.
// Wrangler bundles these JSON imports; examples/ is the story's single source.
import story from '../../../examples/live-status/live-status.timeline.json' with { type: 'json' };
import allTodo from './fixtures/all-todo.json' with { type: 'json' };
import allDone from './fixtures/all-done.json' with { type: 'json' };

const SITE = 'https://acme.atlassian.net';
const EPOCH = Date.parse('2026-10-20T09:00:00Z');
const CATEGORIES = {
  todo: { key: 'new', name: 'To Do' },
  active: { key: 'indeterminate', name: 'In Progress' },
  blocked: { key: 'indeterminate', name: 'In Progress' },
  done: { key: 'done', name: 'Done' }
};
const TOOL_INPUTS = {
  getAccessibleAtlassianResources: { title: 'Accessible Atlassian resources', properties: {}, required: [] },
  searchJiraIssuesUsingJql: {
    title: 'Search Jira issues using JQL', required: ['cloudId', 'jql'],
    properties: { cloudId: { type: 'string' }, jql: { type: 'string' },
      fields: { type: 'array', items: { type: 'string' } }, maxResults: { type: 'integer', minimum: 0 },
      nextPageToken: { type: 'string' } }
  },
  getJiraIssue: {
    title: 'Get Jira issue', required: ['cloudId', 'issueIdOrKey'],
    properties: { cloudId: { type: 'string' }, issueIdOrKey: { type: 'string' },
      fields: { type: 'array', items: { type: 'string' } } }
  }
};

function unquote(value) {
  const text = value.trim();
  if (text[0] === '"' || text[0] === "'") {
    if (text.at(-1) !== text[0]) return null;
    const inner = text.slice(1, -1);
    return /["']/.test(inner) ? null : inner;
  }
  return /["']/.test(text) ? null : text;
}

// Deliberately small grammar. Null means unsupported; callers return no issues.
export function parseJql(jql) {
  if (typeof jql !== 'string' || !jql.trim()) return null;
  const parsed = {};
  for (const clause of jql.trim().split(/\s+AND\s+/i)) {
    let match;
    if ((match = /^key\s+in\s*\(([^()]*)\)$/i.exec(clause.trim()))) {
      if (parsed.keys) return null;
      const keys = match[1].split(',').map(unquote);
      if (!keys.length || keys.some(key => !key || !/^[A-Z][A-Z0-9_]*-\d+$/i.test(key))) return null;
      parsed.keys = keys.map(key => key.toUpperCase());
    } else if ((match = /^parent\s*=\s*(.+)$/i.exec(clause.trim()))) {
      const key = unquote(match[1]);
      if (parsed.parent || !key || !/^[A-Z][A-Z0-9_]+-\d+$/i.test(key)) return null;
      parsed.parent = key.toUpperCase();
    } else if ((match = /^Flagged\s*=\s*(.+)$/i.exec(clause.trim()))) {
      if (parsed.flagged || unquote(match[1])?.toLowerCase() !== 'impediment') return null;
      parsed.flagged = true;
    } else if ((match = /^statusCategory\s*=\s*(.+)$/i.exec(clause.trim()))) {
      const categories = { new: 'new', 'to do': 'new', indeterminate: 'indeterminate', 'in progress': 'indeterminate', done: 'done' };
      const value = unquote(match[1])?.toLowerCase();
      if (parsed.statusCategory || !Object.hasOwn(categories, value)) return null;
      parsed.statusCategory = categories[value];
    } else if ((match = /^project\s*=\s*(.+)$/i.exec(clause.trim()))) {
      const value = unquote(match[1]);
      if (parsed.project || !value || !/^[A-Z][A-Z0-9_]*$/i.test(value)) return null;
      parsed.project = value.toUpperCase();
    } else {
      return null;
    }
  }
  return parsed;
}

// Issue links (#765). Fixture entries carry `links: [{type, key}]` using the description shown on this
// issue's side; Jira hides links to issues the viewer cannot see, so an absent target day is hidden too.
const LINK_TYPES = {
  'is blocked by': { type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' }, side: 'inwardIssue' },
  'blocks': { type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' }, side: 'outwardIssue' },
  'depends on': { type: { name: 'Dependency', inward: 'is depended on by', outward: 'depends on' }, side: 'outwardIssue' },
  'is depended on by': { type: { name: 'Dependency', inward: 'is depended on by', outward: 'depends on' }, side: 'inwardIssue' }
};
function issueLinks(entry, issues) {
  return (Array.isArray(entry.links) ? entry.links : []).flatMap((link, index) => {
    const known = LINK_TYPES[String(link?.type ?? '').toLowerCase()];
    const target = issues && Object.hasOwn(issues, link?.key) ? issues[link.key] : null;
    if (!known || !target) return [];
    const category = CATEGORIES[target.state] || CATEGORIES.todo;
    return [{ id: String(900000 + index), type: { ...known.type }, [known.side]: { key: link.key, fields: {
      summary: target.summary || link.key,
      status: { name: target.statusName || (target.state === 'blocked' ? 'Blocked' : category.name), statusCategory: { ...category } },
      issuetype: { name: target.issueType || 'Task' } } } }];
  });
}

function epicState(epic, issues) {
  const children = Object.values(issues || {}).filter(entry => entry.epic === epic);
  return children.length && children.every(entry => entry.state === 'done') ? 'done'
    : children.some(entry => ['active', 'blocked', 'done'].includes(entry.state)) ? 'active' : 'todo';
}

export function jiraIssueFromStatus(key, entry, now = EPOCH, issues = null) {
  const category = CATEGORIES[entry.state] || CATEGORIES.todo;
  const updated = entry.updated || new Date(now).toISOString().replace(/Z$/, '+0000');
  // Base-128 encoding is injective for ASCII ticket keys and stays a numeric
  // string even for keys too long for a JavaScript Number's integer precision.
  let numericId = 0n;
  for (const character of key) numericId = numericId * 128n + BigInt(character.charCodeAt(0));
  const customFields = {};
  if (entry.state === 'blocked' || entry.flagged) customFields.Flagged = [{ value: 'Impediment' }];
  if (entry.prs?.count > 0) {
    const count = entry.prs.count;
    const state = entry.prs.state || 'OPEN';
    const cachedValue = {
      errors: [],
      summary: { pullrequest: {
        overall: { count, lastUpdated: updated, stateCount: count, state, dataType: 'pullrequest', open: state === 'OPEN' },
        byInstanceType: { github: { count, name: 'GitHub' } }
      } },
      isStale: false
    };
    customFields.Development = '{pullrequest={dataType=pullrequest, state=' + state + ', stateCount=' + count +
      '}, json=' + JSON.stringify({ cachedValue }) + '}';
  }
  return {
    id: numericId.toString(), key,
    fields: {
      summary: entry.summary || key,
      status: { name: entry.statusName || (entry.state === 'blocked' ? 'Blocked' : category.name), statusCategory: { ...category } },
      assignee: entry.assignee ? { displayName: entry.assignee, ...(entry.assigneeId ? { accountId: entry.assigneeId } : {}) } : null,
      priority: { name: entry.priority || 'Medium' }, issuetype: { name: entry.issueType || 'Task' },
      ...(entry.epic ? { parent: { key: entry.epic, fields: { summary: 'Connected doorbell delivery', issuetype: { name: 'Epic' },
        ...(issues ? { status: { name: CATEGORIES[epicState(entry.epic, issues)].name, statusCategory: { ...CATEGORIES[epicState(entry.epic, issues)] } } } : {}) } } } : {}),
      issuelinks: issueLinks(entry, issues),
      updated, customFields
    }
  };
}

function issuesFor(env) {
  const scenario = env.scenario ?? 'story';
  if (scenario === 'all-done') return allDone.issues;
  if (scenario !== 'story') return allTodo.issues;
  const days = (env.timeline || story).days;
  let index;
  if (env.day !== undefined && env.day !== null && Number.isFinite(Number(env.day))) {
    index = Math.max(0, Math.min(days.length - 1, Math.floor(Number(env.day))));
  } else {
    const deployed = Date.parse(env.DEPLOYED_AT);
    const elapsed = Math.floor(((env.now ?? EPOCH) - (Number.isFinite(deployed) ? deployed : EPOCH)) / 60000);
    // Positive modulo keeps future deployment epochs safe too.
    index = ((elapsed % days.length) + days.length) % days.length;
  }
  return days[index].issues;
}

function error(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function toolResult(name, args, env, id) {
  if (name === 'getAccessibleAtlassianResources') {
    return [{ id: 'mock-cloud-id-0001', url: SITE, name: 'Acme (mock)', scopes: [], avatarUrl: '' }];
  }
  const issues = issuesFor(env);
  if (name === 'getJiraIssue') {
    const key = args.issueIdOrKey;
    if (key === 'DOOR-100') {
      return { data: { appliedContentFormat: 'markdown', ...jiraIssueFromStatus(key,
        { state: epicState(key, issues), summary: 'Connected doorbell delivery', issueType: 'Epic' }, env.now) } };
    }
    if (typeof key !== 'string' || !Object.hasOwn(issues, key)) {
      return error(id, -32602, 'Issue does not exist or you do not have permission to see it.');
    }
    return { data: { appliedContentFormat: 'markdown', ...jiraIssueFromStatus(key, issues[key], env.now, issues) } };
  }
  if (name === 'searchJiraIssuesUsingJql') {
    const parsed = parseJql(args.jql);
    const limit = typeof args.maxResults === 'number' && Number.isFinite(args.maxResults)
      ? Math.max(0, Math.min(100, Math.floor(args.maxResults))) : 50;
    const matches = parsed ? Object.entries(issues).filter(([key, entry]) => {
      return (!parsed.keys || parsed.keys.includes(key)) &&
        (!parsed.project || key.split('-')[0] === parsed.project) &&
        (!parsed.parent || entry.epic === parsed.parent) &&
        (!parsed.flagged || entry.flagged || entry.state === 'blocked') &&
        (!parsed.statusCategory || CATEGORIES[entry.state]?.key === parsed.statusCategory);
    }) : [];
    const offset = /^\d+$/.test(args.nextPageToken || '') ? Number(args.nextPageToken) : 0;
    const nodes = matches.slice(offset, offset + limit).map(([key, entry]) => jiraIssueFromStatus(key, entry, env.now, issues));
    const hasNextPage = limit > 0 && offset + nodes.length < matches.length;
    return { issues: { nodes, webUrl: SITE + '/issues/?jql=' + encodeURIComponent(typeof args.jql === 'string' ? args.jql : '') },
      pageInfo: { hasNextPage, endCursor: hasNextPage ? String(offset + nodes.length) : null } };
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
      serverInfo: { name: 'mock-atlassian-mcp', version: '0.1.0' } };
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
