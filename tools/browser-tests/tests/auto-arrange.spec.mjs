import {canvasTools} from '../helpers/test.mjs';
import {openAutoArrange} from '../helpers/test.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,pastePage as paste,paste as pasteDiagram} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const grouped=JSON.parse(await readFile(path.join(repo,'tests/fixtures/auto-arrange-grouped.json'),'utf8'));
const simple={page:{title:'Arrange and refine',blocks:[{heading:'Active diagram',diagram:{nodes:{a:{title:'Source'},b:{title:'Service'},c:{title:'Store'}},rows:[['a','b','c']],edges:[{from:'a',to:'b',label:'Request'},{from:'b',to:'c'}],steps:[{edge:'a->b',text:'Keep this story'}],autoplay:false}}]}};
const source=p=>p.locator('#src').inputValue();
const diagram=async p=>JSON.parse(await source(p)).page.blocks[0].diagram;
const edge=p=>p.locator('#docview path.edge[data-dv-edge="0"]').first();
async function open(p,server,raw=simple){await p.goto(server.origin+'/workbench.html');if(await p.locator('#workspace-home').isVisible())await p.locator('#workspace-home').click();await paste(p,JSON.stringify(raw,null,2));await expect(p.locator('#docview g.node').first()).toBeVisible();}
async function arrange(p){await openAutoArrange(p);await p.locator('[data-arrange-confirm]').click();await expect(p.locator('#auto-arrange-dialog')).not.toBeVisible({timeout:25000});}
async function edgePoint(p,f=.45){return edge(p).evaluate((e,f)=>{const p=e.getPointAtLength(e.getTotalLength()*f),m=e.getScreenCTM();return {x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f,s:m.a};},f);}

test('one button confirms, arranges offline, permits control and node drags, and has exact Undo/Redo and export',async({page,server,context})=>{
 await open(page,server);const before=await source(page);
 await openAutoArrange(page);await expect(page.locator('#auto-arrange-dialog')).toContainText('one Undo');
 await page.locator('[data-arrange-cancel]').click();await expect(page.locator('#src')).toHaveValue(before);
 await arrange(page);const arranged=await source(page);expect(arranged).not.toBe(before);
 expect((await diagram(page)).edges.every(e=>e.curveControls)).toBe(true);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
 await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(arranged);
 // Existing curve handles move native controls through the ordinary editor.
 const q=await edgePoint(page);await page.mouse.click(q.x,q.y);
 const handle=page.locator('[data-curve-point="0"]'),box=await handle.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+35,box.y+box.height/2+25,{steps:10});await page.mouse.up();
 const edited=await source(page);expect(edited).not.toBe(arranged);expect((await diagram(page)).edges[0].curveControls).toBeTruthy();
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(arranged);
 // Inserting on a native segment adds one cubic join, and Reset clears it.
 const initialCount=(await diagram(page)).edges[1].curveControls.length,insert=await page.locator('#docview path.edge[data-dv-edge="1"]').evaluate(e=>{const p=e.getPointAtLength(e.getTotalLength()*.5),m=e.getScreenCTM();return {x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f};});
 await page.mouse.move(insert.x,insert.y);await page.mouse.down();await page.mouse.move(insert.x+15,insert.y-30,{steps:10});await page.mouse.up();
 expect((await diagram(page)).edges[1].curveControls.length).toBe(initialCount+3);
 await page.locator('#guide').getByRole('button',{name:'Reset curve',exact:true}).click();expect((await diagram(page)).edges[1].curveControls).toBeUndefined();
 await page.locator('#undo-builder').click();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(arranged);
 // Move a freely placed card; authored control geometry stays and attachments move.
 const card=page.locator('#docview g.node[data-dv-node="a"] .card'),b=await card.boundingBox(),old=(await diagram(page)).floats.find(f=>f.id==='a');
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+50,b.y+b.height/2+30,{steps:10});await page.mouse.up();
 const moved=await source(page);expect((await diagram(page)).floats.find(f=>f.id==='a').x).not.toBe(old.x);
 expect((await diagram(page)).edges[0].curveControls).toEqual(JSON.parse(arranged).page.blocks[0].diagram.edges[0].curveControls);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(arranged);
 const route=await edge(page).getAttribute('d');
 await page.reload();await expect(page.locator('#src')).toHaveValue(arranged);await expect(edge(page)).toHaveAttribute('d',route);
 const spec=path.join(server.root,'arranged.json'),out=path.join(server.root,'arranged.html');await writeFile(spec,arranged);
 execFileSync('python3',[path.join(repo,'tools/inject.py'),spec,path.join(repo,'template/flowview.html'),out]);
 const exported=await context.newPage();await exported.goto(server.origin+'/arranged.html');await expect(exported.locator('path.edge').first()).toHaveAttribute('d',route);
 await expect(exported.locator('text.lbl').first()).toBeVisible();expect(moved).not.toBe(arranged);
});

test('research fixture renders final native splines and retry label with no node collisions',async({page,server})=>{
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
 await expect(page.locator('[data-arrange-status]')).toContainText(/changed|cancelled/);await page.locator('[data-arrange-cancel]').click();await expect(page.locator('#src')).toHaveValue(current+'\n');
 await page.evaluate(()=>{window.Worker=window.__RealWorker;});
 await open(page,server);
 await page.evaluate(()=>{window.Worker=class{constructor(){throw Error('Unavailable');}};});
 const stable=await source(page);await openAutoArrange(page);await page.locator('[data-arrange-confirm]').click();
 await expect(page.locator('[data-arrange-status]')).toContainText('unavailable');await page.locator('[data-arrange-cancel]').click();await expect(page.locator('#src')).toHaveValue(stable);
});

test('active-section switch and project replacement retire pending arrangements',async({page,server})=>{
 await page.goto(server.origin+'/lifetime/index.html');
 const two=structuredClone(simple);two.page.blocks.push(structuredClone(two.page.blocks[0]));two.page.blocks[1].heading='Other diagram';
 await paste(page,JSON.stringify(two,null,2));const original=await source(page);
 await page.evaluate(()=>{const Real=window.Worker;window.__RealWorker=Real;window.Worker=class extends Real{postMessage(data){setTimeout(()=>super.postMessage(data),700);}};});
 await openAutoArrange(page);await page.locator('[data-arrange-confirm]').click();
 await page.locator('#docview').evaluate(el=>el.dispatchEvent(new CustomEvent('workbench-view-section',{detail:1})));
 await expect(page.locator('[data-arrange-status]')).toContainText(/changed|cancelled/);await page.locator('[data-arrange-cancel]').click();await expect(page.locator('#src')).toHaveValue(original);
 await openAutoArrange(page);await page.locator('[data-arrange-confirm]').click();
 await page.evaluate(raw=>__editorTest.builder.loadSpec(raw),simple);
 await expect(page.locator('#auto-arrange-dialog')).not.toBeVisible();const replaced=await source(page);
 await expect(page.locator('#undo-builder')).toBeDisabled();await expect(page.locator('#auto-arrange')).toBeEnabled();
 // Teardown also cancels a running worker and disposes its temporary dialog.
 await openAutoArrange(page);await page.locator('[data-arrange-confirm]').click();
 await page.evaluate(()=>__editorTest.builder.destroy());await expect(page.locator('#auto-arrange-dialog')).toHaveCount(0);await expect(page.locator('#src')).toHaveValue(replaced);
 await page.evaluate(()=>__editorTest.remount());await expect(page.locator('#auto-arrange-dialog')).toHaveCount(1);
});
