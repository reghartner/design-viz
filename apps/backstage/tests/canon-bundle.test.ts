import {spawnSync} from 'node:child_process';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {expect,it} from 'vitest';

const root=fileURLToPath(new URL('../../../',import.meta.url));

it.each(['cjs','esm'] as const)('runs the %s backend bundle with no access to the source checkout',async format=>{
  const deployed=await realpath(await mkdtemp(path.join(tmpdir(),'flowview-backend-')));
  try{
    const outfile=path.join(deployed,'backend.'+(format==='cjs'?'cjs':'mjs'));
    await build({
      stdin:{resolveDir:root,contents:`
        import C from './tools/canon/core.cjs';
        import {buildEntityDiagramIndex,diagramsForEntity} from './tools/canon/entity-diagrams.mjs';
        import spec from './examples/canon/specs/doorbell.json';
        const d=spec.page.sections[0].diagram;
        d.paths=[{id:'happy',label:'Happy path',steps:d.steps.map(s=>s.id)},
          {id:'failed',label:'Dropped request',steps:['quiet','detect','failed-upload']}];
        d.steps.push({id:'failed-upload',text:'The recording request is dropped.',failures:{'hub->cloud':'dropped'}});
        const validation=C.validateSpec(spec);
        const result=diagramsForEntity(buildEntityDiagramIndex([spec],{publicBaseUrl:'https://flows.example.test'}),
          'component:default/recording-service');
        const broken=structuredClone(spec);
        broken.page.sections[0].diagram.edges[0].to='missing-node';
        console.log(JSON.stringify({validation,result,brokenErrors:C.validateSpec(broken).errors,
          codeUrl:C.codeUrl(C.references(spec)[0].reference)}));
      `},
      outfile,bundle:true,platform:'node',target:'node24',format,minify:true,
    });
    // A deployed bundle gets only its own directory. Even an accidental absolute
    // path back to this checkout cannot make this production smoke test pass.
    const run=spawnSync(process.execPath,['--permission','--allow-fs-read='+deployed,outfile],{
      cwd:deployed,encoding:'utf8',timeout:15000,
    });
    expect(run.status,run.stderr || String(run.error || '')).toBe(0);
    const {validation,result,brokenErrors,codeUrl}=JSON.parse(run.stdout);
    expect(validation.errors).toEqual([]);
    expect(brokenErrors.length).toBeGreaterThan(0);
    expect(codeUrl).toContain('/blob/'+'1'.repeat(40)+'/src/porch-hub.js#L2-L6');
    expect(result.diagrams).toHaveLength(1);
    expect(result.diagrams[0].id).toBe('doorbell');
    expect(result.diagrams[0].sections[0].paths[0].steps.map((s:{id:string})=>s.id))
      .toEqual(['upload','persist','enqueue']);
    const alternate=result.diagrams[0].sections[0].paths[1];
    expect(alternate.id).toBe('failed');
    expect(alternate.steps).toHaveLength(1);
    expect(alternate.steps[0].id).toBe('failed-upload');
    const hash=new URLSearchParams(new URL(alternate.steps[0].url).hash.slice(1));
    expect(hash.get('p')).toBe('failed');
    expect(hash.get('s')).toBe('failed-upload');
    expect(hash.get('d')).toBe('doorbell-press-to-resident-notification');
  }finally{
    await rm(deployed,{recursive:true,force:true});
  }
});
