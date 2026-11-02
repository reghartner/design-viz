#!/usr/bin/env node
/* Git Compare local server (issue #849). Usage:
     node tools/compare/serve.mjs --repo <path to a local clone> [--port <n>]
   Binds 127.0.0.1 only and serves a fixed allow-list: the page and a small read-only JSON API.
   GET  /api/status                          clone path, last fetch, gh sign-in (never the token)
   GET  /api/documents?rev=                  *.spec.json files at a revision
   GET  /api/revisions?doc=&tab=&q=&page=    picker rows (100 per page); tab = document|all|branches|tags|prs
   GET  /api/between?from=&to=&doc=          commits after From up to To that change the document
   GET  /api/compare?from=&to=&doc=          both sides: {raw, context} or null
   POST /api/fetch                           git fetch (remote-tracking refs only)
   Requests must carry this server's Host; a request with an Origin must come from this server. */
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {GitRevisions} from './git-revisions.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const API_CSP = "default-src 'none'; frame-ancestors 'none'";
/* The static allow-list: request path -> [file under tools/compare, content type]. */
const STATIC = {'/':['index.html', 'text/html; charset=utf-8']};
const GET_ROUTES = new Set(['/', '/api/status', '/api/documents', '/api/revisions', '/api/between', '/api/compare']);

function send(res, status, body, type, csp){
  res.writeHead(status, {'Content-Type':type, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer', 'Content-Security-Policy':csp || API_CSP});
  res.end(body);
}
const json = (res, status, value) => send(res, status, JSON.stringify(value), 'application/json; charset=utf-8');

export async function createCompareServer({directory, gh, port = 0} = {}){
  const reader = new GitRevisions({directory, gh});
  let bound = 0;
  const server = http.createServer(async (req, res) => {
    try{
      const hosts = ['127.0.0.1:' + bound, 'localhost:' + bound], origins = hosts.map(h => 'http://' + h);
      if (!hosts.includes(String(req.headers.host || ''))) return json(res, 403, {error:'Forbidden host.'});
      if (req.headers.origin !== undefined && !origins.includes(String(req.headers.origin))) return json(res, 403, {error:'Forbidden origin.'});
      const raw = String(req.url || '/');
      /* Traversal in any spelling is not a route. */
      if (/\.\.|%2e|%2f|%5c|\\/i.test(raw.split('?')[0])) return json(res, 404, {error:'Not found.'});
      const url = new URL(raw, 'http://127.0.0.1'), route = url.pathname, q = name => url.searchParams.get(name);
      if (route === '/api/fetch'){
        if (req.method !== 'POST') return json(res, 403, {error:'Fetch is POST only.'});
        return json(res, 200, await reader.fetch());
      }
      if (!GET_ROUTES.has(route)) return json(res, 404, {error:'Not found.'});
      if (req.method !== 'GET') return json(res, 403, {error:'Read-only route.'});
      if (STATIC[route]){ const [file, type] = STATIC[route]; return send(res, 200, readFileSync(path.join(here, file)), type, PAGE_CSP); }
      if (route === '/api/status') return json(res, 200, await reader.status());
      if (route === '/api/documents') return json(res, 200, await reader.documents(await reader.resolve(q('rev') || 'HEAD')));
      if (route === '/api/revisions') return json(res, 200, await reader.revisions({doc:q('doc'), tab:q('tab') || 'document', q:q('q') || '', page:q('page') || 1}));
      if (route === '/api/between') return json(res, 200, await reader.between({from:q('from'), to:q('to'), doc:q('doc')}));
      if (route === '/api/compare'){
        const doc = q('doc'), from = await reader.resolve(q('from')), to = await reader.resolve(q('to'));
        const [before, after] = await Promise.all([reader.side(from, doc), reader.side(to, doc)]);
        return json(res, 200, {from, to, doc, before, after});
      }
      return json(res, 404, {error:'Not found.'});
    }catch(ex){
      if (ex && ex.code === 'BAD_INPUT') return json(res, 400, {error:ex.message});
      return json(res, 500, {error:'The request could not be completed.'});
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  bound = server.address().port;
  return server;
}

/* Command line. */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const repo = opt('--repo');
  if (!repo){ console.error('Usage: node tools/compare/serve.mjs --repo <path to a local clone> [--port <n>]'); process.exit(2); }
  const server = await createCompareServer({directory:repo, port:Number(opt('--port') || 0)});
  console.log('Git Compare: http://127.0.0.1:' + server.address().port + '/');
}
