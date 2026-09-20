/* Local fixture host only; renders the actual React plugin, not a screenshot.
   Serve through apps/backstage-mock/server.mjs. Never deploy that mock as auth. */
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const app=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(app,'../..'),out=path.join(root,'.local/backstage-preview');
await mkdir(out,{recursive:true});
await build({absWorkingDir:app,stdin:{contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {FlowviewEntityDiagrams} from './src/FlowviewEntityDiagrams';
import {createDiagramLoader,createSpecLoader} from './src/api';
const discovery={getBaseUrl:async()=>location.origin+'/api'},fetchApi={fetch:(...args)=>fetch(...args)};
createRoot(document.getElementById('app')).render(<FlowviewEntityDiagrams entityRef="component:default/recording-service" loadDiagrams={createDiagramLoader(discovery,fetchApi,'/canon')} loadSpec={createSpecLoader(discovery,fetchApi,'/canon')}/>);
`,resolveDir:app,loader:'tsx'},bundle:true,format:'iife',outfile:path.join(out,'app.js'),define:{'process.env.NODE_ENV':'"production"'},minify:true});
await writeFile(path.join(out,'csp.txt'),`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src data:; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self';`);
await writeFile(path.join(out,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><title>Backstage · Flowview local preview</title><style>body{margin:0;background:#f6f7f9;color:#202b38;font:15px/1.5 system-ui,sans-serif}header{background:#172235;color:white;padding:18px 30px}header strong{font-size:20px}header span{margin-left:30px;color:#c3ccd9}aside{padding:10px 30px;background:#fff3d1;font-size:13px}main{margin:24px;background:white;border:1px solid #dbe1e8;border-radius:12px;min-width:0}button,select{font:inherit}button{cursor:pointer;padding:6px 12px;border:1px solid #b5bdc9;border-radius:5px;background:#f4f6fb;color:inherit}a{color:#245bba}nav{padding:12px 24px;border-bottom:1px solid #dbe1e8;color:#58677b}nav strong{color:#245bba;margin-left:24px}</style></head><body><header><strong>Backstage</strong><span>Catalog / Recording service</span></header><aside>Local host preview · actual Flowview plugin with fictional catalog data. Company Backstage and authentication are not connected.</aside><main><nav>Overview <strong>Diagrams</strong></nav><div id="app"></div></main><script src="./app.js"></script></body></html>`);
console.log('Built local plugin preview. Run node apps/backstage-mock/server.mjs and open /backstage-preview/index.html.');
