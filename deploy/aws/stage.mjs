// Explicit allowlist: never publish a repository directory or company catalog.
import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const repo=fileURLToPath(new URL('../../',import.meta.url));
const [configFile,out]=process.argv.slice(2);if(!configFile || !out)throw Error('Usage: node deploy/aws/stage.mjs path/to/cloud-config.json output-directory');
const c=JSON.parse(await readFile(configFile,'utf8'));
if(c.mock || !['api','domain','clientId','scope','redirectUri'].every(k=>typeof c[k]==='string' && c[k]))throw Error('Production configuration needs api, domain, clientId, scope, redirectUri; mock auth is forbidden.');
for(const key of ['api','domain','redirectUri'])if(new URL(c[key]).protocol!=='https:')throw Error(key+' must use HTTPS.');
if(c.scope!=='flowview/projects')throw Error('Use the configured API resource-server scope.');
const output=path.resolve(out);
try{if((await readdir(output)).length)throw Error('Staging output must be empty. Choose a new directory; existing files are never deleted.');}catch(error){if(error.code!=='ENOENT')throw error;}
execFileSync('python3',[path.join(repo,'tools/build.py'),'--no-config','--no-library','--no-catalog'],{stdio:'inherit'});
await mkdir(output,{recursive:true});await mkdir(path.join(output,'template'),{recursive:true});
const config={api:c.api,domain:c.domain,clientId:c.clientId,scope:c.scope,redirectUri:c.redirectUri,viewerTemplate:'/template/flowview.html'};
const html=(await readFile(path.join(repo,'workbench/flowspec.html'),'utf8')).replace('<meta charset="utf-8">','<script type="application/json" id="flowview-cloud-config">'+JSON.stringify(config).replace(/</g,'\\u003c')+'</script><meta charset="utf-8">');
await writeFile(path.join(output,'index.html'),html);await cp(path.join(repo,'workbench/status-colors.html'),path.join(output,'status-colors.html'));await cp(path.join(repo,'template/flowview.html'),path.join(output,'template/flowview.html'));
await writeFile(path.join(output,'catalog.json'),'[]');await writeFile(path.join(output,'starters.json'),'[]');
console.log('Public shell staged at '+output+'. Upload ONLY these generated shell files; project data belongs in the private snapshots bucket.');
