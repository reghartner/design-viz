#!/usr/bin/env node
/* Git Compare local server (issue #849): the page (index.html, app.js, app.css), the side-by-side viewer it
   mounts (viewer.js and viewer.css, assembled from src/ by tools/source-loader.cjs, the build's own loader) and
   its JSON API. Usage:
     node --max-semi-space-size=1 tools/compare/serve.mjs --repo <path to a local clone> [--port <n>]
   The flag keeps V8's young generation at 1 MB. Without it V8 grows it by tens of MB under steady requests
   (measured: 103 MB after 5 comparisons, 158 MB after 50, then level), so the server's memory would not stay
   flat; with it, 98 MB after 5 and 104 MB after 50. The server works without the flag.
   Binds 127.0.0.1 only and serves a fixed allow-list: the page and a small read-only JSON API.
   GET  /api/status                          clone path, last fetch, gh sign-in (never the token)
   GET  /api/documents?rev=                  *.spec.json files at a revision
   GET  /api/revisions?doc=&tab=&q=&page=    picker rows (100 per page); tab = document|all|branches|tags|prs
   GET  /api/between?from=&to=&doc=          commits after From up to To that change the document
   GET  /api/compare?from=&to=&doc=          both sides: {raw, context} or null
   GET  /api/changed?from=&to=               changed documents: [{path, status, imported?}]
   POST /api/fetch                           git fetch (remote-tracking refs only)
   Requests must carry this server's Host; a request with an Origin must come from this server. */
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {GitRevisions} from './git-revisions.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
/* Scripts only from this server. Styles allow inline style attributes: the viewer's panels set them. */
const PAGE_CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const API_CSP = "default-src 'none'; frame-ancestors 'none'";
/* The static allow-list: request path -> [file under tools/compare, content type]. */
const STATIC = {'/':['index.html', 'text/html; charset=utf-8'], '/app.js':['app.js', 'text/javascript; charset=utf-8'], '/app.css':['app.css', 'text/css; charset=utf-8']};
const VIEWER = {'/viewer.js':['js', 'text/javascript; charset=utf-8'], '/viewer.css':['css', 'text/css; charset=utf-8']};
const GET_ROUTES = new Set(['/', '/app.js', '/app.css', '/viewer.js', '/viewer.css', '/api/status', '/api/documents', '/api/revisions', '/api/between', '/api/compare', '/api/changed']);

/* The standalone viewer's sources without its boot script (which would render the demo page), its core
   styles and fonts, and its icon sprite (inserted into index.html). Assembled once per process. */
let viewerAssets = null;
function viewer(){
  if (viewerAssets) return viewerAssets;
  const root = path.resolve(here, '../..');
  const load = (...args) => execFileSync(process.execPath, [path.join(root, 'tools/source-loader.cjs'), ...args], {encoding:'utf8', maxBuffer:1 << 28});
  const entry = JSON.parse(readFileSync(path.join(root, 'src/source-bundles.json'), 'utf8')).entrypoints.standalone;
  const assets = JSON.parse(load('--entry-assets', 'standalone'));
  viewerAssets = {
    js:"(function(){\n'use strict';\n" + load('--sources', ...entry.sources) + "\n})();\n",
    css:load('--font-css', entry.fonts) + '\n' + assets.styles.filter(s => s.key === 'core').map(s => s.source).join('\n'),
    icons:assets.icons,
  };
  return viewerAssets;
}

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
      if (route === '/') return send(res, 200, readFileSync(path.join(here, 'index.html'), 'utf8').replace('<!--ICONS-->', () => viewer().icons), STATIC['/'][1], PAGE_CSP);
      if (STATIC[route]){ const [file, type] = STATIC[route]; return send(res, 200, readFileSync(path.join(here, file)), type, PAGE_CSP); }
      if (VIEWER[route]){ const [key, type] = VIEWER[route]; return send(res, 200, viewer()[key], type, PAGE_CSP); }
      if (route === '/api/status') return json(res, 200, await reader.status());
      if (route === '/api/documents') return json(res, 200, await reader.documents(await reader.resolve(q('rev') || 'HEAD')));
      if (route === '/api/revisions') return json(res, 200, await reader.revisions({doc:q('doc'), tab:q('tab') || 'document', q:q('q') || '', page:q('page') || 1}));
      if (route === '/api/between') return json(res, 200, await reader.between({from:q('from'), to:q('to'), doc:q('doc')}));
      if (route === '/api/compare'){
        const doc = q('doc'), from = await reader.resolve(q('from')), to = await reader.resolve(q('to'));
        const [before, after] = await Promise.all([reader.side(from, doc), reader.side(to, doc)]);
        return json(res, 200, {from, to, doc, before, after});
      }
      if (route === '/api/changed') return json(res, 200, await reader.changedDocumentList(q('from'), q('to')));
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
  if (!repo){ console.error('Usage: node --max-semi-space-size=1 tools/compare/serve.mjs --repo <path to a local clone> [--port <n>]'); process.exit(2); }
  const server = await createCompareServer({directory:repo, port:Number(opt('--port') || 0)});
  console.log('Git Compare: http://127.0.0.1:' + server.address().port + '/');
}
