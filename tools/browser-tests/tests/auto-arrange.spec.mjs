import {canvasTools} from '../helpers/test.mjs';
import {openAutoArrange} from '../helpers/test.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,pastePage as paste,paste as pasteDiagram,prepareEditorSurface} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const grouped=JSON.parse(await readFile(path.join(repo,'tests/fixtures/auto-arrange-grouped.json'),'utf8'));
const named=JSON.parse(await readFile(path.join(repo,'src/starters/named-layouts.json'),'utf8'));
const simple={page:{title:'Arrange and refine',blocks:[{heading:'Active diagram',diagram:{nodes:{a:{title:'Source'},b:{title:'Service'},c:{title:'Store'}},rows:[['a','b','c']],edges:[{from:'a',to:'b',label:'Request'},{from:'b',to:'c'}],steps:[{edge:'a->b',text:'Keep this story'}],autoplay:false}}]}};
const source=p=>p.locator('#src').inputValue();
const diagram=async p=>JSON.parse(await source(p)).page.blocks[0].diagram;
const edge=p=>p.locator('#docview path.edge[data-dv-edge="0"]').first();
async function open(p,server,raw=simple){await p.goto(server.origin+'/workbench.html');if(await p.locator('#workspace-home').isVisible())await p.locator('#workspace-home').click();await paste(p,JSON.stringify(raw,null,2));await expect(p.locator('#docview g.node').first()).toBeVisible();}
async function arrange(p){await openAutoArrange(p);await p.locator('[data-arrange-confirm]').click();await expect(p.locator('#auto-arrange-dialog')).not.toBeVisible({timeout:25000});}
async function edgePoint(p,f=.45){return edge(p).evaluate((e,f)=>{const p=e.getPointAtLength(e.getTotalLength()*f),m=e.getScreenCTM();return {x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f,s:m.a};},f);}

for(const framed of [false,true])test('Explore manual Auto arrange preserves panels, views and exact Undo: '+(framed?'saved graphFrame':'legacy frame'),async({page,server})=>{
 const raw=structuredClone(named),original=raw.page.sections[0].diagram;
 raw.page.presentation='explore';original.defaultLayout='service-flow';original.autoplay=false;
 if(framed)original.graphFrame={x:0,y:0,w:400,h:220};
 raw.page.sections.push({heading:'Untouched other diagram',diagram:structuredClone(simple.page.blocks[0].diagram)});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(server.origin+'/workbench.html');await pasteDiagram(page,JSON.stringify(raw,null,2));await prepareEditorSurface(page);
 const section=page.locator('#docview .doc-sec').first(),stage=section.locator('.explore-stage');
 await expect(stage).toBeVisible();await expect(section).toHaveAttribute('data-view-id','service-flow');
 for(const id of ['outcome','clip'])await expect(section.locator('[data-explore-panel="'+id+'"]')).toBeVisible();
 await expect(section.locator('[data-explore-panel="home"]')).toBeHidden();
 const before=await source(page);
 // Use the real chapter button, confirmation dialog and production worker.
 await arrange(page);const arranged=await source(page),result=JSON.parse(arranged),changed=result.page.sections[0].diagram;
 expect(arranged).not.toBe(before);expect(changed.rows).toEqual([[]]);expect(changed.floats).toHaveLength(Object.keys(original.nodes).length);
 expect(changed.floats.every(f=>Number.isFinite(f.x)&&Number.isFinite(f.y))).toBe(true);
 const semantics=d=>{const copy=structuredClone(d);for(const key of ['rows','floats','routing'])delete copy[key];for(const e of copy.edges)for(const key of ['bend','curvePoints','curveControls','fromPort','toPort','fromDx','fromDy','toDx','toDy','labelDx','labelDy','labelAt'])delete e[key];return copy;};
 expect(semantics(changed)).toEqual(semantics(original));expect(changed.layouts).toEqual(original.layouts);expect(changed.panels).toEqual(original.panels);
 expect(changed.graphFrame).toEqual(original.graphFrame);expect(result.page.sections[1]).toEqual(raw.page.sections[1]);
 await expect(stage).toBeVisible();await expect(section).toHaveAttribute('data-view-id','service-flow');
 for(const id of ['outcome','clip'])await expect(section.locator('[data-explore-panel="'+id+'"]')).toBeVisible();
 await expect(section.locator('[data-explore-panel="home"]')).toBeHidden();
 const geometry=await section.locator('.explore-board svg').evaluate(svg=>{
  const vb=svg.viewBox.baseVal,cards=[...svg.querySelectorAll('g.node .card')].map(card=>{const b=card.getBBox(),m=svg.getScreenCTM().inverse().multiply(card.getScreenCTM());return {x:m.a*b.x+m.c*b.y+m.e,y:m.b*b.x+m.d*b.y+m.f,w:b.width*m.a,h:b.height*m.d};});
  return {count:cards.length,contained:cards.every(b=>b.x>=vb.x-.1&&b.y>=vb.y-.1&&b.x+b.w<=vb.x+vb.width+.1&&b.y+b.h<=vb.y+vb.height+.1),overlap:cards.some((a,i)=>cards.slice(i+1).some(b=>a.x<b.x+b.w&&b.x<a.x+a.w&&a.y<b.y+b.h&&b.y<a.y+a.h))};
 });expect(geometry).toEqual({count:Object.keys(original.nodes).length,contained:true,overlap:false});
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await expect(stage).toBeVisible();
 await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(arranged);await expect(stage).toBeVisible();expect(errors).toEqual([]);
});

test('one button confirms, arranges offline, permits control and node drags, and has exact Undo/Redo and export',async({page,server,context})=>{
 await open(page,server);const before=await source(page);
 await openAutoArrange(page);await expect(page.locator('#auto-arrange-dialog')).toContainText('one Undo');
 await page.locator('[data-arrange-cancel]').click();await expect(page.locator('#src')).toHaveValue(before);
 await arrange(page);const arranged=await source(page);expect(arranged).not.toBe(before);
 for(const e of (await diagram(page)).edges){
  for(const field of ['curveControls','curvePoints','fromPort','toPort','labelDx','labelDy'])expect(e[field]).toBeUndefined();
 }
 const naturalRoute=await edge(page).getAttribute('d');
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
 await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(arranged);
 // An automatic edge exposes one unshaped handle; dragging authors a through-point.
 const q=await edgePoint(page,.15);await page.mouse.click(q.x,q.y);
 const handle=page.locator('[data-curve-point="-1"]');await expect(handle).toHaveCount(1);
 const box=await handle.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+15,box.y+box.height/2+75,{steps:10});await page.mouse.up();
 await expect.poll(async()=> (await diagram(page)).edges[0].curvePoints?.length).toBe(1);
 const edited=await source(page);expect(edited).not.toBe(arranged);expect((await diagram(page)).edges[0].curveControls).toBeUndefined();
 await expect(edge(page)).not.toHaveAttribute('d',naturalRoute);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(arranged);
 await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(edited);
 // Drag another part of the authored curve to add one point, then Reset both forms.
 const insert=await edgePoint(page,.8);
 await page.mouse.move(insert.x,insert.y);await page.mouse.down();await page.mouse.move(insert.x+15,insert.y-30,{steps:10});await page.mouse.up();
 await expect.poll(async()=> (await diagram(page)).edges[0].curvePoints?.length).toBe(2);
 const twoPoints=await source(page);
 await page.locator('#guide').getByRole('button',{name:'Reset curve',exact:true}).click();
 expect((await diagram(page)).edges[0].curvePoints).toBeUndefined();expect((await diagram(page)).edges[0].curveControls).toBeUndefined();
 await expect(edge(page)).toHaveAttribute('d',naturalRoute);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(twoPoints);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(edited);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(arranged);
 // Move Source below Service: the natural attachment changes from right to top.
 const node=page.locator('#docview g.node[data-dv-node="a"]'),card=node.locator('.card');await node.hover();
 const b=await card.boundingBox(),placed=(await diagram(page)).floats,old=placed.find(f=>f.id==='a'),destination=placed.find(f=>f.id==='b');
 const scale=await card.evaluate(el=>{const m=el.getScreenCTM();return {x:m.a,y:m.d};});
 const initialStart=await edge(page).evaluate(el=>{const p=el.getPointAtLength(0);return {x:p.x,y:p.y};});
 expect(initialStart.x).toBeCloseTo(old.x+75,3);expect(initialStart.y).toBeCloseTo(old.y,3);
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
 await page.mouse.move(b.x+b.width/2+(destination.x-old.x)*scale.x,b.y+b.height/2+(destination.y+170-old.y)*scale.y,{steps:12});await page.mouse.up();
 const moved=await source(page),movedDiagram=await diagram(page),position=movedDiagram.floats.find(f=>f.id==='a');
 expect(position.y).toBeGreaterThan(destination.y+100);
 for(const field of ['curveControls','curvePoints','fromPort','toPort'])expect(movedDiagram.edges[0][field]).toBeUndefined();
 const movedStart=await edge(page).evaluate(el=>{const p=el.getPointAtLength(0);return {x:p.x,y:p.y};});
 expect(movedStart.x).toBeCloseTo(position.x,3);expect(movedStart.y).toBeCloseTo(position.y-22,3);
 await expect(edge(page)).not.toHaveAttribute('d',naturalRoute);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(arranged);
 const route=await edge(page).getAttribute('d');
 await page.reload();await expect(page.locator('#src')).toHaveValue(arranged);await expect(edge(page)).toHaveAttribute('d',route);
 const spec=path.join(server.root,'arranged.json'),out=path.join(server.root,'arranged.html');await writeFile(spec,arranged);
 execFileSync('python3',[path.join(repo,'tools/inject.py'),spec,path.join(repo,'template/flowview.html'),out]);
 const exported=await context.newPage();await exported.goto(server.origin+'/arranged.html');await expect(exported.locator('path.edge').first()).toHaveAttribute('d',route);
 await expect(exported.locator('text.lbl').first()).toBeVisible();expect(moved).not.toBe(arranged);
});

test('calculation status is prominent before a held worker completes and clears on success or cancel',async({page,server})=>{
 await open(page,server);const before=await source(page);
 // Hold actual worker dispatch until the test releases it. Completion cannot
 // race the assertions that the dialog has rendered its calculation state.
 await page.evaluate(()=>{const Real=window.Worker;window.Worker=class extends Real{postMessage(data){window.__releaseArrange=()=>super.postMessage(data);}};});
 await openAutoArrange(page);await page.locator('[data-arrange-confirm]').click();
 const activity=page.locator('[data-arrange-activity]');
 await expect(activity).toBeVisible();await expect(activity).toHaveText('Calculating optimal node placement');
 await expect(activity).toHaveAttribute('role','status');await expect(activity).toHaveAttribute('aria-live','polite');
 await expect(activity.locator('.auto-arrange-spinner')).toBeVisible();
 expect((await activity.boundingBox()).height).toBeGreaterThanOrEqual(112);
 await expect(page.locator('[data-arrange-confirm]')).toBeDisabled();await expect(page.locator('[data-arrange-cancel]')).toBeEnabled();
 await expect(page.locator('#src')).toHaveValue(before);
 await page.setViewportSize({width:390,height:844});await expect(activity).toBeVisible();
 const modalBox=await page.locator('#auto-arrange-dialog').boundingBox();
 expect(modalBox.x).toBeGreaterThanOrEqual(0);expect(modalBox.x+modalBox.width).toBeLessThanOrEqual(390);
 await expect(page.locator('[data-arrange-cancel]')).toBeInViewport();
 await mkdir(path.join(repo,'.local'),{recursive:true});await page.screenshot({path:path.join(repo,'.local/auto-arrange-calculating-phone.png')});
 await page.setViewportSize({width:1800,height:1200});
 await page.evaluate(()=>window.__releaseArrange());
 await expect(page.locator('#auto-arrange-dialog')).not.toBeVisible();await expect(activity).toBeHidden();
 await expect(page.locator('#src')).not.toHaveValue(before);
 const arranged=await source(page);
 await openAutoArrange(page);await page.locator('[data-arrange-confirm]').click();await expect(activity).toBeVisible();
 await page.locator('[data-arrange-cancel]').click();await expect(activity).toBeHidden();await expect(page.locator('#auto-arrange-dialog')).not.toBeVisible();
 await expect(page.locator('#src')).toHaveValue(arranged);await expect(page.locator('#auto-arrange')).toBeEnabled();
});

test('research fixture renders natural and retained routes and retry label with no node collisions',async({page,server})=>{
 await page.goto(server.origin+'/workbench.html');await pasteDiagram(page,JSON.stringify(grouped,null,2));await arrange(page);
 const paths=await page.locator('#docview path.edge').evaluateAll(edges=>edges.map(e=>e.getAttribute('d')));expect(paths).toHaveLength(36);
 const hits=await page.locator('#docview svg').first().evaluate(svg=>{
  const cards=[...svg.querySelectorAll('g.node')].map(n=>{const r=n.querySelector('.card'),m=n.transform.baseVal.consolidate().matrix;return {id:n.dataset.dvNode,x:m.e,y:m.f,w:+r.getAttribute('width'),h:+r.getAttribute('height')};});
  const raw=JSON.parse(document.querySelector('#src').value).page.blocks[0].diagram;let hits=0;
  svg.querySelectorAll('path.edge').forEach((p,i)=>{const e=raw.edges[i],len=p.getTotalLength();for(const card of cards){if([e.from,e.to].includes(card.id))continue;for(let j=0;j<=500;j++){const q=p.getPointAtLength(len*j/500);if(q.x>card.x && q.x<card.x+card.w && q.y>card.y && q.y<card.y+card.h){hits++;break;}}}});return hits;
 });expect(hits).toBe(0);
 await expect(page.locator('#docview text.lbl').filter({hasText:'retry'})).toBeVisible();
 await page.setViewportSize({width:1800,height:2000});
 await canvasTools(page);await page.locator('#workspace-panels').click();await page.locator('#docview').getByRole('button',{name:'Fit diagram',exact:true}).click();
 await mkdir(path.join(repo,'.local'),{recursive:true});await page.screenshot({path:path.join(repo,'.local/auto-arrange-grouped-fit.png'),fullPage:true});
 await writeFile(path.join(repo,'.local/auto-arrange-grouped.spec.json'),await source(page));
});

test('stale source and worker failure never publish geometry',async({page,server})=>{
 await open(page,server);const before=await source(page);
 await openAutoArrange(page);await page.locator('#src').evaluate(el=>{el.value+='\n';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await expect(page.locator('[data-arrange-confirm]')).toBeDisabled();await page.locator('[data-arrange-cancel]').click();await expect(page.locator('#src')).toHaveValue(before+'\n');
 await open(page,server);const current=await source(page);
 // Hold a real worker response to exercise the stale async publish guard.
 await page.evaluate(()=>{const Real=window.Worker;window.__RealWorker=Real;window.Worker=class extends Real{postMessage(data){setTimeout(()=>super.postMessage(data),600);}};});
 await openAutoArrange(page);await page.locator('[data-arrange-confirm]').click();
 await page.locator('#src').evaluate(el=>{el.value+='\n';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await expect(page.locator('[data-arrange-activity]')).toBeHidden();await expect(page.locator('[data-arrange-status]')).toContainText(/changed|cancelled/);await page.locator('[data-arrange-cancel]').click();await expect(page.locator('#src')).toHaveValue(current+'\n');
 await page.evaluate(()=>{window.Worker=window.__RealWorker;});
 await open(page,server);
 await page.evaluate(()=>{window.Worker=class{constructor(){throw Error('Unavailable');}};});
 const stable=await source(page);await openAutoArrange(page);await page.locator('[data-arrange-confirm]').click();
 await expect(page.locator('[data-arrange-activity]')).toBeHidden();await expect(page.locator('[data-arrange-status]')).toContainText('unavailable');await page.locator('[data-arrange-cancel]').click();await expect(page.locator('#src')).toHaveValue(stable);
});

test('active-section switch and project replacement retire pending arrangements',async({page,server})=>{
 await page.goto(server.origin+'/lifetime/index.html');
 const two=structuredClone(simple);two.page.blocks.push(structuredClone(two.page.blocks[0]));two.page.blocks[1].heading='Other diagram';
 await paste(page,JSON.stringify(two,null,2));const original=await source(page);
 await page.evaluate(()=>{const Real=window.Worker;window.__RealWorker=Real;window.Worker=class extends Real{postMessage(data){setTimeout(()=>super.postMessage(data),700);}};});
 await openAutoArrange(page);await page.locator('[data-arrange-confirm]').click();
 await page.locator('#docview').evaluate(el=>el.dispatchEvent(new CustomEvent('workbench-view-section',{detail:1})));
 await expect(page.locator('[data-arrange-activity]')).toBeHidden();await expect(page.locator('[data-arrange-status]')).toContainText(/changed|cancelled/);await page.locator('[data-arrange-cancel]').click();await expect(page.locator('#src')).toHaveValue(original);
 await openAutoArrange(page);await page.locator('[data-arrange-confirm]').click();
 await page.evaluate(raw=>__editorTest.builder.loadSpec(raw),simple);
 await expect(page.locator('#auto-arrange-dialog')).not.toBeVisible();await expect(page.locator('[data-arrange-activity]')).toBeHidden();const replaced=await source(page);
 await expect(page.locator('#undo-builder')).toBeDisabled();await expect(page.locator('#auto-arrange')).toBeEnabled();
 // Teardown also cancels a running worker and disposes its temporary dialog.
 await openAutoArrange(page);await page.locator('[data-arrange-confirm]').click();
 await page.evaluate(()=>__editorTest.builder.destroy());await expect(page.locator('#auto-arrange-dialog')).toHaveCount(0);await expect(page.locator('#src')).toHaveValue(replaced);
 await page.evaluate(()=>__editorTest.remount());await expect(page.locator('#auto-arrange-dialog')).toHaveCount(1);
});
