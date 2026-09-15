/* Uses Atlassian's manifest validator locally. This is not authenticated forge
   lint or a deployment check; the company integration agent runs those. */
import { validate } from '@forge/manifest';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const app=path.dirname(fileURLToPath(import.meta.url));
const result=await validate(false,path.join(app,'manifest.yml'));
if (!result.success){ console.error(JSON.stringify(result.errors,null,2)); process.exit(1); }
const manifest=result.manifestObject.typedContent;
for(const resource of manifest.resources || []){
  const directory=path.resolve(app,resource.path), index=await readFile(path.join(directory,'index.html'),'utf8');
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(index)) throw Error('Inline script in Custom UI resource');
  for(const match of index.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)){
    if(!match[1].startsWith('./')) throw Error('Custom UI assets must use local relative URLs: '+match[1]);
    await stat(path.resolve(directory,match[1]));
  }
  const js=await readFile(path.join(directory,'app.js'),'utf8');
  if(js.includes('flowview-confluence-local-preview') || js.includes('function initWorkbenchBuilder'))
    throw Error('Production resource contains the simulated bridge or workbench');
}
console.log('Atlassian manifest schema and production resources passed (offline).');
if(manifest.app.id.endsWith('/00000000-0000-0000-0000-000000000000'))
  console.log('App ID is intentionally unregistered. The company agent must register and verify it in Confluence.');
