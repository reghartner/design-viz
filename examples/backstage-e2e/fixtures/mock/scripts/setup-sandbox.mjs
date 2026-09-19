import {readFile,writeFile,cp,mkdir} from 'node:fs/promises';import path from 'node:path';import {randomBytes} from 'node:crypto';
const designer=path.resolve(process.argv[2]||'../__DESIGNER_NAME__');
await cp(path.join(designer,'apps/backstage'),'sandbox/backstage/plugins/flowview',{recursive:true,filter:p=>!p.split(path.sep).includes('node_modules')&&!p.split(path.sep).includes('dist')});
await mkdir('.local',{recursive:true});
let secrets;try{secrets=JSON.parse(await readFile('.local/secrets.json'));}catch{secrets={catalog:randomBytes(32).toString('hex'),read:randomBytes(32).toString('hex')};await writeFile('.local/secrets.json',JSON.stringify(secrets),{mode:0o600});}
const document=await readFile(path.join(designer,'apps/backstage/src/generated/viewerDocument.ts'),'utf8');
const hash=JSON.parse(document.match(/export const viewerScriptCsp = (.*);/)[1]);
await writeFile('sandbox/backstage/app-config.local.yaml',JSON.stringify({backend:{csp:{'script-src':["'self'",hash],'script-src-elem':["'self'",hash],'style-src':["'self'","'unsafe-inline'"],'font-src':["'self'",'data:'],'img-src':["'self'",'data:'],'frame-src':["'self'"]}}},null,2)+'\n');
console.log('Copied the designer plugin and configured its exact CSP hash. Local credentials are ignored by Git.');
