import { handleMcp } from './mcp.mjs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, mcp-session-id, mcp-protocol-version'
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
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
    if (url.pathname !== '/mcp') return text('Not found', 404);
    if (request.method !== 'POST') return text('Use POST /mcp; no SSE stream.', 405, { Allow: 'POST, OPTIONS' });
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
