import {readFile,writeFile,cp,mkdir,rm,stat} from 'node:fs/promises';import path from 'node:path';import {randomBytes} from 'node:crypto';
const designer=path.resolve(process.argv[2]||'../__DESIGNER_NAME__');
if (!(await stat(path.join(designer,'apps/backstage'))).isDirectory()) throw new Error('The designer plugin directory is missing.');
// This copied plugin is generator-owned; an upgrade must remove retired files.
await rm('sandbox/backstage/plugins/flowview',{recursive:true,force:true});
await cp(path.join(designer,'apps/backstage'),'sandbox/backstage/plugins/flowview',{recursive:true,filter:p=>!p.split(path.sep).includes('node_modules')&&!p.split(path.sep).includes('dist')});
await mkdir('.local',{recursive:true});
let secrets;try{secrets=JSON.parse(await readFile('.local/secrets.json'));}catch{secrets={catalog:randomBytes(32).toString('hex'),read:randomBytes(32).toString('hex')};await writeFile('.local/secrets.json',JSON.stringify(secrets),{mode:0o600});}
await writeFile('sandbox/backstage/app-config.local.yaml',JSON.stringify({backend:{csp:{'script-src':["'self'"],'script-src-elem':["'self'"],'style-src':["'self'","'unsafe-inline'"],'font-src':["'self'",'data:'],'img-src':["'self'",'data:']}}},null,2)+'\n');
console.log('Copied the designer plugin and configured bundled-script and embedded-asset CSP. Local credentials are ignored by Git.');
