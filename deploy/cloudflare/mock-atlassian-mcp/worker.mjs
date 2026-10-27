import { handleMcp } from './mcp.mjs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, mcp-session-id, mcp-protocol-version'
};
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', ...headers } });
}
// With MCP_PATH_TOKEN set the endpoint moves to /<token>/mcp and /mcp is 404,
// so the connector URL carries the secret. Unset or blank keeps /mcp (#749).
function mcpPath(env) {
  const token = typeof env.MCP_PATH_TOKEN === 'string' ? env.MCP_PATH_TOKEN.trim() : '';
  return token ? '/' + token + '/mcp' : '/mcp';
}
function text(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', ...headers } });
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method === 'GET' && url.pathname === '/') {
      return text('Mock Atlassian MCP. POST /mcp; scenarios: story (default), all-todo, all-done. Use ?scenario=story&day=0 to pin a day.');
    }
    if (request.method === 'GET' && url.pathname === '/healthz') return text('ok');
    if (url.pathname !== mcpPath(env)) return text('Not found', 404);
    if (request.method !== 'POST') return text('Use POST /mcp; no SSE stream.', 405, { Allow: 'POST, OPTIONS' });
    // Optional Workers Rate Limiting binding (wrangler.jsonc "ratelimits"), keyed per client IP (#749).
    if (env.RL && typeof env.RL.limit === 'function') {
      const { success } = await env.RL.limit({ key: request.headers.get('cf-connecting-ip') || 'unknown' });
      if (!success) {
        return json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Rate limit exceeded; retry later' } },
          429, { 'Retry-After': '60' });
      }
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
    }
    const context = { DEPLOYED_AT: env.DEPLOYED_AT, now: Date.now(),
      scenario: url.searchParams.get('scenario') ?? 'story', day: url.searchParams.get('day') };
    if (Array.isArray(body) && body.length === 0) {
      return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }, 400);
    }
    const result = Array.isArray(body)
      ? body.map(item => handleMcp(item, context)).filter(item => item !== null)
      : handleMcp(body, context);
    if (result === null || (Array.isArray(result) && result.length === 0)) {
      return new Response(null, { status: 202, headers: CORS });
    }
    return json(result);
  }
};
