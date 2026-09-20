import {readFile,writeFile,cp,mkdir,rm,stat,realpath} from 'node:fs/promises';import path from 'node:path';import {randomBytes} from 'node:crypto';
const designer=path.resolve(process.argv[2]||'../__DESIGNER_NAME__');
const sourcePlugin=await realpath(path.join(designer,'apps/backstage'));
if (!(await stat(sourcePlugin)).isDirectory()) throw new Error('The designer plugin directory is missing.');
await mkdir('sandbox/backstage/plugins',{recursive:true});
const target=path.join(await realpath('sandbox/backstage/plugins'),'flowview');
let existingTarget=target;
try{existingTarget=await realpath(target);}catch(error){if(error.code!=='ENOENT')throw error;}
if(sourcePlugin===existingTarget || sourcePlugin.startsWith(existingTarget+path.sep) || existingTarget.startsWith(sourcePlugin+path.sep))
  throw new Error('Copy the designer plugin from a separate source directory.');
// This copied plugin is generator-owned; an upgrade must remove retired files.
await rm(target,{recursive:true,force:true});
await cp(sourcePlugin,target,{recursive:true,filter:p=>!p.split(path.sep).includes('node_modules')&&!p.split(path.sep).includes('dist')});
await mkdir('.local',{recursive:true});
let secrets;try{secrets=JSON.parse(await readFile('.local/secrets.json'));}catch{secrets={catalog:randomBytes(32).toString('hex'),read:randomBytes(32).toString('hex')};await writeFile('.local/secrets.json',JSON.stringify(secrets),{mode:0o600});}
await writeFile('sandbox/backstage/app-config.local.yaml',JSON.stringify({backend:{csp:{'script-src':["'self'"],'script-src-elem':["'self'"],'style-src':["'self'","'unsafe-inline'"],'font-src':["'self'",'data:'],'img-src':["'self'",'data:']}}},null,2)+'\n');
console.log('Copied the designer plugin and configured bundled-script and embedded-asset CSP. Local credentials are ignored by Git.');
