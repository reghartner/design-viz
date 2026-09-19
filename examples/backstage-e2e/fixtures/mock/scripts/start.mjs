import {readFile} from 'node:fs/promises';import {spawn} from 'node:child_process';import path from 'node:path';
const secrets=JSON.parse(await readFile('.local/secrets.json'));
const designer=path.resolve(process.argv[2]||'../__DESIGNER_NAME__');
const children=[];let stopping=false;
function start(command,args,cwd,env){const p=spawn(command,args,{cwd,env:{...process.env,NODE_ENV:'development',BROWSER:'none',...env},stdio:'inherit',detached:true});children.push(p);p.on('exit',code=>{if(!stopping){console.error(command+' exited: '+code);stop(code||1);}});return p;}
function stop(code=0){if(stopping)return;stopping=true;for(const p of children){try{process.kill(-p.pid,'SIGTERM');}catch{p.kill('SIGTERM');}}setTimeout(()=>process.exit(code),1500).unref();}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop());
start(process.execPath,['mock/server.mjs'],process.cwd(),{MOCK_CATALOG_TOKEN:secrets.catalog});
start(process.execPath,['server/server.mjs'],designer,{FLOWVIEW_READ_TOKEN:secrets.read});
start(process.execPath,['packages/backend/src/index.ts','--config','app-config.yaml','--config','app-config.local.yaml'],path.resolve('sandbox/backstage'),{REHEARSAL_CATALOG_TOKEN:secrets.catalog,REHEARSAL_READ_TOKEN:secrets.read,NODE_OPTIONS:'--max-old-space-size=6144'});

start(process.execPath,['.yarn/releases/yarn-4.13.0.cjs','workspace','app','start'],path.resolve('sandbox/backstage'),{NODE_OPTIONS:'--max-old-space-size=6144'});
