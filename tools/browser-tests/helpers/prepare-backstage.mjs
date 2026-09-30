import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import prepareEditor from './prepare-editor.mjs';
import {repo} from './prepare.mjs';
export default async function prepare(){
  execFileSync('python3',[path.join(repo,'tools/build.py')],{stdio:'inherit'});
  execFileSync(process.execPath,[path.join(repo,'apps/backstage/build-viewer.mjs')],{stdio:'inherit'});
  const cleanup=await prepareEditor(),output=process.env.FLOWVIEW_BROWSER_ROOT,app=path.join(repo,'apps/backstage');
  try {
    const {build}=await import(pathToFileURL(path.join(app,'node_modules/esbuild/lib/main.js')));
    await mkdir(path.join(output,'native'));
    await build({absWorkingDir:app,stdin:{resolveDir:app,loader:'tsx',contents:await readFile(path.join(repo,'tools/browser-tests/fixtures/native-host.tsx'),'utf8')},bundle:true,format:'iife',outfile:path.join(output,'native/app.js'),define:{'process.env.NODE_ENV':'"production"'}});
    await cp(path.join(repo,'tools/browser-tests/fixtures/native-host.html'),path.join(output,'native/index.html'));
    await prepareBackstageWorkspace(output);
  } catch(error){await cleanup();throw error;}
  return cleanup;
}

export async function prepareBackstageWorkspace(output){
  const {publishLibrary}=await import('../../canon/library.mjs');
  const {buildEntityDiagramIndex,diagramsForEntity}=await import('../../canon/entity-diagrams.mjs');
  const app=path.join(repo,'apps/backstage');
  const {build}=await import(pathToFileURL(path.join(app,'node_modules/esbuild/lib/main.js')));
    const spec=JSON.parse(await readFile(path.join(repo,'src/starters/named-layouts.json'),'utf8'));
    spec.page.canon={version:1,id:'backstage-story',kind:'design',owner:'group:default/team'};
    let first;
    const visit=value=>{if(!value || typeof value!=='object')return;if(value.diagram && !first)first=value.diagram;Object.values(value).forEach(visit);};visit(spec.page);
    Object.values(first.nodes)[0].binding={entityRef:'component:default/recording'};
    first.autoplay=false;
    const entityRef='component:default/recording';
    // Relative fixture destinations become absolute in the browser. The index
    // still supplies the actual production spec digest and section identities.
    const list=diagramsForEntity(buildEntityDiagramIndex([spec],{publicBaseUrl:'http://fixture.test'}),entityRef);
    const specFolder=path.join(output,'diagrams/backstage-story');await mkdir(specFolder,{recursive:true});
    await writeFile(path.join(specFolder,'backstage-story.spec.json'),JSON.stringify(spec));
    const registryFile=path.join(output,'registry.json');
    await writeFile(registryFile,JSON.stringify({version:1,diagrams:[{id:'backstage-story',path:'diagrams/backstage-story/backstage-story.spec.json'}]}));
    await publishLibrary({registryPath:registryFile,output:path.join(output,'diagrams.json')});
    await mkdir(path.join(output,'backstage'));
    await build({absWorkingDir:app,stdin:{resolveDir:app,loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';import {FlowviewEntityDiagrams} from './src/FlowviewEntityDiagrams';
const spec=${JSON.stringify(spec)},list=${JSON.stringify(list)};
list.diagrams.forEach(d=>{d.viewerUrl=location.origin+'/workbench.html?diagram='+d.id;d.editUrl=d.viewerUrl;});
const requests=[];const loadSpec=async d=>{requests.push(d);return spec;};
window.__backstage={spec,list,requests};
createRoot(document.getElementById('app')).render(<FlowviewEntityDiagrams entityRef=${JSON.stringify(entityRef)} loadDiagrams={async()=>list} loadSpec={loadSpec}/>);
`},bundle:true,format:'iife',outfile:path.join(output,'backstage/app.js'),define:{'process.env.NODE_ENV':'"production"'}});
    await writeFile(path.join(output,'backstage/index.html'),`<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><style>body{font:15px system-ui;margin:0;background:#f3f5fa}header{padding:20px;background:#182439;color:white}button,select{font:inherit}#app{padding:16px}a{color:#305da8}</style></head><body><header>Backstage · Recording service</header><div id="app"></div><script src="./app.js"></script></body></html>`);
}
