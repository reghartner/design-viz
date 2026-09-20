/* Artifact-only verification: this file can run beside a copied Custom UI build.
   It has no source-loader, package or upstream checkout dependency. */
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function verifyResource(directory){
  const root=path.resolve(directory),files=new Set();
  async function local(reference,from){
    if(!reference.startsWith('./'))throw Error('Custom UI assets must use local relative URLs: '+reference);
    const file=path.resolve(path.dirname(from),decodeURIComponent(reference.split(/[?#]/)[0]));
    if(!file.startsWith(root+path.sep))throw Error('Custom UI asset escapes its resource: '+reference);
    if(!(await stat(file)).isFile())throw Error('Custom UI asset is not a file: '+reference);
    files.add(path.relative(root,file));return file;
  }
  const indexFile=path.join(root,'index.html'),index=await readFile(indexFile,'utf8');
  if(/<script(?![^>]*\bsrc=)[^>]*>/i.test(index))throw Error('Inline script in Custom UI resource');
  for(const match of index.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)){
    const file=await local(match[1],indexFile);
    if(file.endsWith('.css')){
      const css=await readFile(file,'utf8');
      if(/@import\b/i.test(css))throw Error('Custom UI styles must be bundled');
      for(const url of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)){
        if(url[1].startsWith('#') || url[1].startsWith('data:'))continue;
        await local(url[1],file);
      }
    }
  }
  const js=await readFile(path.join(root,'app.js'),'utf8');
  if(js.includes('flowview-confluence-local-preview') || js.includes('function initWorkbenchBuilder'))
    throw Error('Production resource contains the simulated bridge or workbench');
  return [...files].sort();
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv[2])throw Error('Usage: node resource-contract.mjs RESOURCE_DIRECTORY');
  const files=await verifyResource(process.argv[2]);console.log('Verified copied Custom UI resource: '+files.length+' local assets.');
}
