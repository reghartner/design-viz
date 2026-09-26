import {chromium} from '@playwright/test';
import {cp,readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export const repo=path.resolve(fileURLToPath(new URL('../../..',import.meta.url)));
const fixture=name=>fileURLToPath(new URL('../fixtures/'+name,import.meta.url));

export default async function prepare(){
  // Fail before building anything if the pinned browser is unavailable.
  let browser;
  try{browser=await chromium.launch();console.log('Required Chromium: '+browser.version());}
  catch(error){throw new Error('Required Chromium could not launch. Run npm run install:browser --prefix tools/browser-tests (CI: playwright install --with-deps chromium).',{cause:error});}
  finally{if(browser)await browser.close();}
  const output=await mkdtemp(path.join(tmpdir(),'flowview-browser-'));
  process.env.FLOWVIEW_BROWSER_ROOT=output;
  try {
    await cp(path.join(repo,'workbench/flowspec.html'),path.join(output,'workbench.html'));
    execFileSync('python3',[fixture('build-editor.py'),repo,path.join(output,'lifetime')],{stdio:'inherit'});
    for(const directory of [output,path.join(output,'lifetime')]){
      await cp(path.join(repo,'workbench/catalog.json'),path.join(directory,'catalog.json'));
      await writeFile(path.join(directory,'starters.json'),'[]');
    }
    const raw=JSON.parse(await readFile(path.join(repo,'examples/chime-radar/chime-radar.spec.json'),'utf8'));
    function pause(value){if(!value||typeof value!=='object')return;if(value.diagram)value.diagram.autoplay=false;Object.values(value).forEach(pause);}
    pause(raw);
    const spec=path.join(output,'spec.json');
    await writeFile(spec,JSON.stringify(raw));
    execFileSync('python3',[path.join(repo,'tools/inject.py'),spec,path.join(repo,'template/flowview.html'),path.join(output,'standalone.html')],{stdio:'inherit'});
    // Same page with a malformed page.tour: the tour must fail open
    // (tour.spec.mjs) — copy.choices is deliberately not an array.
    const bad=structuredClone(raw);
    bad.page.tour={version:1,steps:[
      {id:'welcome',kind:'chooser',copy:{heading:'Broken chooser',choices:'not-an-array'}},
      {id:'controls',target:{selector:'.step-transport',within:'section'}}
    ]};
    const badSpec=path.join(output,'tour-bad.spec.json');
    await writeFile(badSpec,JSON.stringify(bad));
    execFileSync('python3',[path.join(repo,'tools/inject.py'),badSpec,path.join(repo,'template/flowview.html'),path.join(output,'tour-bad.html')],{stdio:'inherit'});
    await rm(badSpec);
    // Ambient-first two-tab page: state-aware probing must keep the
    // transport step (ambient hides .step-transport until the step asks for
    // mode:"step") and a demo step whose named section lives in tab 2.
    const ambient={page:{title:'Ambient first',skin:'pastel',tour:{version:1,steps:[
      {id:'controls',target:{selector:'.step-transport',within:'section'},diagramState:{mode:'step'},
        copy:{heading:'Play the story',body:'Transport check.'}},
      {id:'paneldemo',target:{selector:'.panelcol',within:'section'},
        diagramState:{section:'second',mode:'step'},demo:{advance:2,intervalMs:500},
        copy:{heading:'The panels tell the story',body:'Demo check.'}},
      {id:'fin',kind:'done',copy:{heading:'Done',body:'End.'}}
    ]},sections:[{tabs:[
      {label:'One',sections:[{heading:'Ambient opener',diagram:{view:'ambient',
        nodes:{a:{},b:{}},rows:[['a','b']],edges:[{from:'a',to:'b'}],
        steps:[{edge:'a->b',text:'hop 1'},{edge:'a->b',text:'hop 2'},{edge:'a->b',text:'hop 3'}]}}]},
      {label:'Two',sections:[{id:'second',heading:'Second story',diagram:{view:'step',autoplay:false,
        nodes:{c:{},d:{}},rows:[['c','d']],edges:[{from:'c',to:'d'}],
        panels:[{id:'st',type:'state',title:'State',states:['Zero','One','Two','Three'],initial:{state:'Zero'}}],
        steps:[{edge:'c->d',text:'s1',panels:{st:{state:'One'}}},
               {edge:'c->d',text:'s2',panels:{st:{state:'Two'}}},
               {edge:'c->d',text:'s3',panels:{st:{state:'Three'}}}]}}]}
    ]}]}};
    // A page with real branching paths, for the branching-demo contracts.
    const pathsRaw=JSON.parse(await readFile(path.join(repo,'examples/shared-downstream/shared-blocks.spec.json'),'utf8'));
    pause(pathsRaw);
    const pathsSpec=path.join(output,'tour-paths.spec.json');
    await writeFile(pathsSpec,JSON.stringify(pathsRaw));
    execFileSync('python3',[path.join(repo,'tools/inject.py'),pathsSpec,path.join(repo,'template/flowview.html'),path.join(output,'tour-paths.html')],{stdio:'inherit'});
    // Same page with paths reordered so @alt = the early-exit path that
    // never rejoins: the rejoin step must SKIP, not show wrong copy.
    const reordered=structuredClone(pathsRaw);
    (function reorder(value){
      if(!value||typeof value!=='object')return;
      if(Array.isArray(value.paths)&&value.paths.length>2){
        // deterministic: put the shortest path second (shared-blocks: Device offline)
        let shortest=0;for(let i=1;i<value.paths.length;i++)if(value.paths[i].steps.length<value.paths[shortest].steps.length)shortest=i;
        if(shortest!==1){const tmp=value.paths[1];value.paths[1]=value.paths[shortest];value.paths[shortest]=tmp;}
      }
      Object.values(value).forEach(reorder);
    })(reordered);
    await writeFile(pathsSpec,JSON.stringify(reordered));
    execFileSync('python3',[path.join(repo,'tools/inject.py'),pathsSpec,path.join(repo,'template/flowview.html'),path.join(output,'tour-paths-reordered.html')],{stdio:'inherit'});
    await rm(pathsSpec);
    // Overlapping-cutout fixture: a secondary nested inside the primary, and
    // a target that is also a reveal region (even-odd must never re-dim).
    const nest=structuredClone(raw);
    nest.page.tour={version:1,steps:[
      {id:'nested',target:{selector:'.step-transport',within:'section'},diagramState:{mode:'step'},
        secondary:[{target:{selector:'.playback-button',within:'section'}}],
        copy:{heading:'Nested ring',body:'Transport with the play button ringed inside it.'}},
      {id:'reveal-self',target:{selector:'.board',within:'section'},diagramState:{mode:'step'},
        reveal:[{selector:'.board',within:'section'}],
        copy:{heading:'Target inside reveal',body:'Board is both target and reveal.'}},
      {id:'fin',kind:'done',copy:{heading:'Done',body:'End.'}}
    ]};
    const nestSpec=path.join(output,'tour-nest.spec.json');
    await writeFile(nestSpec,JSON.stringify(nest));
    execFileSync('python3',[path.join(repo,'tools/inject.py'),nestSpec,path.join(repo,'template/flowview.html'),path.join(output,'tour-nest.html')],{stdio:'inherit'});
    await rm(nestSpec);
    // Disjoint-paths fixture (reviewer repro): the first two paths share NO
    // step, so there is no split — the split step must skip.
    const disjoint=structuredClone(pathsRaw);
    (function setPaths(value){
      if(!value||typeof value!=='object')return;
      if(Array.isArray(value.paths)&&value.paths.length){
        value.paths=[
          {id:'normal',label:'First attempt',color:'#0284c7',steps:['press','record','store','index','notify','ready']},
          {id:'off',label:'Offline only',color:'#7c3aed',steps:['offline','notify-recovery']}];
        return;
      }
      Object.values(value).forEach(setPaths);
    })(disjoint);
    const disjointSpec=path.join(output,'tour-disjoint.spec.json');
    await writeFile(disjointSpec,JSON.stringify(disjoint));
    execFileSync('python3',[path.join(repo,'tools/inject.py'),disjointSpec,path.join(repo,'template/flowview.html'),path.join(output,'tour-disjoint.html')],{stdio:'inherit'});
    await rm(disjointSpec);
    // Drill-down fixture: the shipped domain-drilldown starter (overview
    // with ⊞ detail nodes, two-level nest), paused for determinism.
    const drillRaw=JSON.parse(await readFile(path.join(repo,'src/starters/domain-drilldown.json'),'utf8'));
    pause(drillRaw);
    const drillSpec=path.join(output,'tour-drill.spec.json');
    await writeFile(drillSpec,JSON.stringify(drillRaw));
    execFileSync('python3',[path.join(repo,'tools/inject.py'),drillSpec,path.join(repo,'template/flowview.html'),path.join(output,'tour-drill.html')],{stdio:'inherit'});
    await rm(drillSpec);
    const ambientSpec=path.join(output,'tour-ambient.spec.json');
    await writeFile(ambientSpec,JSON.stringify(ambient));
    execFileSync('python3',[path.join(repo,'tools/inject.py'),ambientSpec,path.join(repo,'template/flowview.html'),path.join(output,'tour-ambient.html')],{stdio:'inherit'});
    await rm(ambientSpec);
    await rm(spec); // Offline test receives only the newly injected HTML.
    execFileSync(process.execPath,[path.join(repo,'apps/confluence/build.mjs')],{stdio:'inherit'});
    await cp(path.join(repo,'apps/confluence/static/viewer'),path.join(output,'forge'),{recursive:true});
    const app=path.join(repo,'apps/backstage');
    const {build}=await import(pathToFileURL(path.join(app,'node_modules/esbuild/lib/main.js')));
    await mkdir(path.join(output,'native'));
    await build({absWorkingDir:app,stdin:{resolveDir:app,loader:'tsx',contents:await readFile(fixture('native-host.tsx'),'utf8')},bundle:true,format:'iife',outfile:path.join(output,'native/app.js'),define:{'process.env.NODE_ENV':'"production"'},minify:true});
    await cp(fixture('native-host.html'),path.join(output,'native/index.html'));
  } catch(error) {await rm(output,{recursive:true,force:true});throw error;}
  return ()=>rm(output,{recursive:true,force:true});
}
