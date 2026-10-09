import {test,expect} from '@playwright/test';
import {auditVisibility,watchBrowserEvidence,observeEvidence} from '../visibility-audit.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fixtureModule from '../../../tests/fixtures/visibility-evidence.cjs';
const {fixture,expectation}=fixtureModule;

test('explicit browser evidence fails home/hidden card/hidden panel and passes restored app, including branch switches',async()=>{
 const raw=fixture(),before=JSON.stringify(raw);
 const rows=['wait','open','hide-card','hide-panel','restore','shared'].map(step=>expectation({step}));
 rows.push(expectation({step:'shared',path:'offline'}),expectation({step:'shared'}));
 rows.push(expectation({step:'hide-panel',field:undefined})); // docked controls stay visible
 rows.push(expectation({view:'summary',step:'shared'}),expectation({view:'summary',step:'open'}));
 const report=await auditVisibility(raw,{version:1,expectations:rows});
 expect(report.issues).toEqual([]);expect(report.ok).toBe(false);
 expect(report.results.map(r=>r.status)).toEqual(['fail','pass','fail','fail','pass','pass','fail','pass','fail','fail','not-checked']);
 expect(report.results[8].measurement.visibility).toBe('hidden');
 expect(JSON.stringify(raw)).toBe(before);
 const good=await auditVisibility(raw,{version:1,expectations:[expectation({step:'wait',visible:false}),expectation(),expectation({step:'restore'})]});
 expect(good.ok,JSON.stringify(good,null,2)).toBe(true);
});

test('browser evidence does not rescue a logically eligible card clipped out of its phone viewport',async()=>{
 const raw=fixture(),d=raw.page.sections[0].diagram;
 d.panels[0].fields=Array.from({length:6},(_,i)=>({id:'card'+i,label:'Card '+i}));
 d.panels[0].initial={phoneScreen:'app',...Object.fromEntries(d.panels[0].fields.map(field=>[field.id,{value:'Cached',detail:'This cached report has a long explanation that wraps over multiple lines. '.repeat(6)}]))};
 d.layouts[0].sectionLayout.default[0].h=6;
 const report=await auditVisibility(raw,{version:1,expectations:[expectation({field:'card5'})]});
 expect(report.logical.ok).toBe(true);expect(report.ok).toBe(false);expect(report.issues).toEqual([]);
 expect(['partial','offscreen']).toContain(report.results[0].measurement.visibility);
});

test('browser audit blocks outbound traffic and records console and page failures',async({page})=>{
 const issues=[];await watchBrowserEvidence(page,'http://127.0.0.1:1',issues);
 await page.evaluate(()=>{console.error('evidence console failure');setTimeout(()=>{throw Error('evidence page failure');});return fetch('https://example.invalid/never-send').catch(()=>{});});
 await expect.poll(()=>issues.some(x=>x.includes('evidence page failure'))).toBe(true);
 expect(issues.some(x=>x.startsWith('blocked request:'))).toBe(true);
 expect(issues.some(x=>x.includes('evidence console failure'))).toBe(true);
 expect(issues.some(x=>x.startsWith('requestfailed:'))).toBe(true);
});

test('DOM observer rejects partial clipping and occlusion rather than accepting their bounding boxes',async({page})=>{
 await page.setContent('<div id="host"></div>');
 await page.evaluate(()=>{const root=document.querySelector('#host').attachShadow({mode:'open'});root.innerHTML='<div data-dv-section="0"><div class="pwidget" data-dv-panel="0"><div class="pbody" style="width:200px;height:200px;background:red"></div></div></div>';window.viewer={root};});
 const target={sectionNumber:1,panelIndex:0,address:null};
 expect((await page.evaluate(observeEvidence,target)).visibility).toBe('visible');
 await page.evaluate(()=>{const overlay=document.createElement('div');overlay.style='position:fixed;inset:0;background:white;z-index:99999';viewer.root.append(overlay);});
 expect((await page.evaluate(observeEvidence,target)).visibility).toBe('occluded');
 await page.evaluate(()=>{viewer.root.lastChild.remove();const wrapper=viewer.root.querySelector('.pwidget');wrapper.style='overflow:hidden;width:100px;height:200px';});
 const clipped=await page.evaluate(observeEvidence,target);expect(clipped.visibility).toBe('partial');expect(clipped.visibleAreaFraction).toBeCloseTo(.5);
});

test('missing browser is a tool failure, never an eligibility-only success',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'visibility-no-browser-'));
 try{
  const spec=path.join(directory,'spec.json'),expectations=path.join(directory,'expect.json');
  await writeFile(spec,JSON.stringify(fixture()));await writeFile(expectations,JSON.stringify({version:1,expectations:[expectation()]}));
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../visibility-audit.mjs',import.meta.url)),spec,expectations],{encoding:'utf8',env:{...process.env,PLAYWRIGHT_BROWSERS_PATH:directory}});
  expect(result.status).toBe(2);expect(result.stderr).toContain('Chromium unavailable');expect(result.stdout).toBe('');
 }finally{await rm(directory,{recursive:true,force:true});}
});
