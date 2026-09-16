#!/usr/bin/env node
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {scan,decide,SnapshotSources,GitHubSources,reportMarkdown,effectiveSpecs} from './drift.mjs';
import {registry,json,stateFile,atomicJSON} from './registry.mjs';
const args=process.argv.slice(2),command=args.shift();
function flag(name,fallback){const i=args.indexOf('--'+name);return i<0?fallback:args[i+1];}
if(!['scan','decide'].includes(command)){
  console.log('Usage: node tools/canon/cli.mjs scan|decide --registry registry.json --state state.json [--sources snapshots.json | --github] [--out report.md]\nDecision: --review ID --disposition no-impact|regression|update --reason TEXT [--ticket URL] [--write-specs]');process.exit(command?1:0);
}
try{
  const r=await registry(flag('registry','examples/canon/registry.json')),statePath=flag('state','.local/canon-state.json'),state=await stateFile(statePath);
  let next;
  if(command==='scan'){
    const source=args.includes('--github')?new GitHubSources({token:process.env.FLOWVIEW_GITHUB_TOKEN,host:process.env.FLOWVIEW_GITHUB_HOST,apiBase:process.env.FLOWVIEW_GITHUB_API}):new SnapshotSources(await json(flag('sources','examples/canon/repositories.json')));
    const result=await scan(r.specs,source,state);next=result.state;
    const out=flag('out','.local/canon-report.md');await mkdir(path.dirname(path.resolve(out)),{recursive:true});await writeFile(out,reportMarkdown(result.findings));
    console.log(JSON.stringify({reviews:result.findings.map(f=>({id:f.id,status:f.status,impacts:f.impacts.length})),report:out},null,2));
  }else{
    next=decide(r.specs,state,flag('review'),{disposition:flag('disposition'),reason:flag('reason'),ticket:flag('ticket'),actor:flag('actor','CLI reviewer')});
    if(args.includes('--write-specs')){
      const specs=effectiveSpecs(r.specs,next);
      for(const entry of r.entries)await atomicJSON(entry.filename,specs.find(s=>s.page.canon.id===entry.id));
      next.specs={}; // Materialized files, including later human edits, are authoritative.
    }
    console.log('Decision recorded.');
  }
  await atomicJSON(statePath,next);
}catch(e){console.error(e.message);process.exitCode=1;}
