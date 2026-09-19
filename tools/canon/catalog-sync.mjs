#!/usr/bin/env node
/* Export repository catalog data. GitHub handles the review/deployment;
   this tool never edits diagram specs, executes catalog content, or merges PRs. */
import {readFile, writeFile, mkdir, rename, rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {catalogFromEntities} from './backstage.mjs';
import C from './core.cjs';

const order = (a,b) => a < b ? -1 : a > b ? 1 : 0;
function sortedObject(value) {
  if (Array.isArray(value)) return value.map(sortedObject);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort(order).map(key => [key, sortedObject(value[key])]));
  return value;
}
export function canonicalCatalog(raw) {
  const catalog = C.catalog(raw);
  catalog.services.sort((a,b) => order(a.entityRef,b.entityRef));
  for (const service of catalog.services) {
    (service.apis || []).sort((a,b) => order(a.entityRef,b.entityRef));
    for (const api of service.apis || []) (api.operations || []).sort((a,b) => order(a.operationId,b.operationId));
  }
  return sortedObject(catalog);
}
const serialize = value => JSON.stringify(value,null,2)+'\n';
export function catalogChanges(before, after) {
  const old = new Map((before?.services || []).map(s => [s.entityRef,s]));
  const next = new Map(after.services.map(s => [s.entityRef,s]));
  return {
    added: [...next.keys()].filter(id => !old.has(id)).sort(order),
    changed: [...next.keys()].filter(id => old.has(id) && serialize(old.get(id)) !== serialize(next.get(id))).sort(order),
    removed: [...old.keys()].filter(id => !next.has(id)).sort(order)
  };
}
function reportMarkdown(changes, catalog, warnings) {
  const lines = ['Refresh the workbench’s bundled Backstage catalog. After review and merge, rebuild the editor image to publish these service and API choices.','',
    catalog.services.length+' services · '+changes.added.length+' added · '+changes.changed.length+' changed · '+changes.removed.length+' removed',''];
  for (const [kind,refs] of Object.entries(changes)) if (refs.length) {
    lines.push('**'+kind[0].toUpperCase()+kind.slice(1)+' services**','',...refs.map(ref => '- `'+ref.replace(/`/g,'')+'`'),'');
  }
  if (warnings.length) lines.push('**Adapter warnings explicitly accepted for this run**','',...warnings.map(w => '- '+w.replace(/[<>&`\r\n]/g,' ')),'');
  lines.push('Review removed services and changed API operations in the JSON diff. Existing diagram bindings are preserved; this PR changes authoring choices only.','',
    'This branch is maintained by catalog sync. Make catalog corrections in the source repositories and rerun the job. It does not merge or deploy itself.');
  return lines.join('\n')+'\n';
}
async function atomicWrite(filename, text) {
  await mkdir(path.dirname(filename),{recursive:true});
  const temporary = filename+'.'+process.pid+'.tmp';
  try { await writeFile(temporary,text,{flag:'wx'}); await rename(temporary,filename); }
  finally { await rm(temporary,{force:true}); }
}
export async function syncCatalog({output='workbench/catalog.json', report, entities, appUrl, allowEmpty=false, allowWarnings=false}) {
  let before = null;
  try { before = canonicalCatalog(JSON.parse(await readFile(output,'utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const result = catalogFromEntities(entities,appUrl);
  if (result.warnings.length && !allowWarnings) throw new Error('Catalog export is incomplete. Resolve these adapter warnings or explicitly use --allow-warnings:\n'+result.warnings.join('\n'));
  const catalog = canonicalCatalog(result.catalog);
  if (!catalog.services.length && !allowEmpty) throw new Error('Refusing an empty catalog. Check token visibility and catalog configuration, or explicitly use --allow-empty.');
  const changes = catalogChanges(before,catalog), changed = !before || serialize(before) !== serialize(catalog);
  // Nothing is written until the entire fetch, conversion and validation succeeds.
  if (report) await atomicWrite(report,reportMarkdown(changes,catalog,result.warnings));
  if (changed) await atomicWrite(output,serialize(catalog));
  return {changed,changes,services:catalog.services.length,warnings:result.warnings};
}
async function main(args) {
  const options = {appUrl:process.env.FLOWVIEW_BACKSTAGE_APP_URL};
  for (let i=0;i<args.length;i++) {
    const key = args[i];
    if (key === '--allow-empty') options.allowEmpty = true;
    else if (key === '--allow-warnings') options.allowWarnings = true;
    else if (['--output','--report','--entities','--sources','--local-root'].includes(key)) {
      if (!args[i+1] || args[i+1].startsWith('--')) throw new Error('Missing value for '+key);
      options[key.slice(2)] = args[++i];
    } else throw new Error('Unknown option '+key);
  }
  if (!!options.entities === !!options.sources) throw new Error('Choose --sources <manifest.json> or --entities <resolved-entities.json>.');
  if (options.entities) options.entities = JSON.parse(await readFile(options.entities,'utf8'));
  else {
    const {loadRepositoryCatalog,githubReader,localReader} = await import('../catalog-sync/repositories.mjs');
    const config=JSON.parse(await readFile(options.sources,'utf8'));
    const reader=options['local-root'] ? localReader(options['local-root']) : githubReader({token:process.env.FLOWVIEW_CATALOG_SOURCE_TOKEN,apiUrl:process.env.FLOWVIEW_CATALOG_GITHUB_API_URL});
    const loaded=await loadRepositoryCatalog(config,reader);
    options.entities=loaded.entities;options.appUrl=loaded.appUrl;
    console.log('Read '+loaded.files+' files from '+loaded.revisions.length+' repositories.');
  }
  const result = await syncCatalog(options);
  console.log(result.changed ? 'Catalog changed: '+result.services+' services.' : 'Catalog unchanged.');
  if (process.env.GITHUB_STEP_SUMMARY && options.report) {
    const {appendFile} = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_STEP_SUMMARY,await readFile(options.report,'utf8'));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode=1; });
}
