import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {test,expect,pastePage as paste} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
const diagram={nodes:{a:{title:'API',group:'app'},b:{title:'Worker',group:'jobs'},c:{title:'Cache',group:'app'},d:{title:'Database',group:'jobs'},e:{title:'Audit'}},groups:{app:{label:'Application'},jobs:{label:'Background'}},rows:[['a','b'],['d','c'],['e']],routing:'lanes',edges:[{from:'a',to:'c',label:'Read',bend:65,fromPort:{side:'left'},labelDx:50,curvePoints:[{t:.5,dx:30,dy:45}]},{from:'b',to:'d',label:'Write'},{from:'c',to:'e'},{from:'d',to:'e'}],steps:[{edge:'a->c',text:'Read the data'}],autoplay:false};
const example={page:{title:'Arrange a starting diagram',blocks:[{heading:'Processing',diagram},{heading:'Unchanged',diagram:{nodes:{x:{title:'Other'}},rows:[['x']]}}]}};
const source=page=>page.locator('#src').inputValue();
const current=async page=>JSON.parse(await source(page)).page.blocks[0].diagram;
async function selectSection(page,heading='Processing'){await page.locator('#editor-tab-outline').click();await page.locator('#outline-search').fill(heading);await page.locator('#outline-results button').first().click();await page.locator('#editor-tab-inspect').click();}
async function openDialog(page,heading){await selectSection(page,heading);await page.locator('#guide').getByRole('button',{name:'Auto arrange nodes',exact:true}).click();await expect(page.getByRole('dialog',{name:'Auto arrange nodes?'})).toBeVisible();}
async function open(page,server,lifetime=false){await page.goto(server.origin+(lifetime?'/lifetime/index.html':'/workbench.html'));await paste(page,JSON.stringify(example,null,2));await expect(page.locator('#docview g.node').first()).toBeVisible();}
async function curvePoint(edge){return edge.evaluate(el=>{const p=el.getPointAtLength(el.getTotalLength()*.25),m=el.getScreenCTM(),q=new DOMPoint(p.x,p.y).matrixTransform(m);return {x:q.x,y:q.y};});}
test('warn, Cancel, one exact Undo/Redo, then drag a node and shape an arrow offline',async({page,server,context})=>{
 await open(page,server);await context.setOffline(true);const before=await source(page);await openDialog(page);
 const dialog=page.getByRole('dialog');await expect(dialog).toContainText('across every view');await expect(dialog).toContainText('Undo restores');await expect(dialog.getByRole('button',{name:'Cancel'})).toBeFocused();
 await page.screenshot({path:path.join(repo,'.local/auto-arrange-warning.png')});
 await dialog.getByRole('button',{name:'Cancel'}).click();await expect(page.locator('#src')).toHaveValue(before);await expect(page.getByRole('button',{name:'Auto arrange nodes',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Auto arrange nodes',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Auto arrange',exact:true}).click();
 await expect.poll(async()=>(await current(page)).routing).toBe('curves');const after=await source(page),d=await current(page);expect(d.floats).toHaveLength(5);expect(d.edges[0]).toEqual({from:'a',to:'c',label:'Read'});expect(d.nodes).toEqual(diagram.nodes);expect(d.steps).toEqual(diagram.steps);expect(JSON.parse(after).page.blocks[1]).toEqual(example.page.blocks[1]);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await expect(page.locator('#undo-builder')).toBeDisabled();await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
 await page.screenshot({path:path.join(repo,'.local/auto-arrange-result.png')});
 const card=page.locator('#docview [data-dv-node="a"] .card').first(),box=await card.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+35,box.y+box.height/2+20,{steps:10});await page.mouse.up();
 await expect.poll(async()=>(await current(page)).floats.find(f=>f.id==='a').x).not.toBe(d.floats.find(f=>f.id==='a').x);
 const edge=page.locator('#docview path.edge[data-dv-edge="0"]').first(),p=await curvePoint(edge);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+50,p.y,{steps:10});await page.mouse.up();
 await expect.poll(async()=>(await current(page)).edges[0].curvePoints?.length).toBe(1);await expect(edge).toHaveAttribute('d',/ C /);
});
test('Escape, stale source and editor destruction never apply a held confirmation',async({page,server})=>{
 await open(page,server,true);const before=await source(page);await openDialog(page);await page.keyboard.press('Escape');await expect(page.locator('#src')).toHaveValue(before);
 await openDialog(page);await page.locator('#src').evaluate(el=>{el.value+='\n';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.getByRole('dialog').getByRole('button',{name:'Auto arrange',exact:true}).click();await expect(page.locator('#src')).toHaveValue(before+'\n');await expect(page.getByRole('dialog')).toHaveCount(0);
 // Render new source, then hold a dialog through complete editor retirement.
 await page.locator('#editor-tab-json').click();await page.locator('#go').click();await openDialog(page);await page.evaluate(()=>__editorTest.builder.destroy());await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('#src')).toHaveValue(before+'\n');
});
test('complex feedback groups arrange with all connections intact and exact Undo/Redo',async({page,server})=>{
 const fixture=JSON.parse(await readFile(path.join(repo,'tests/fixtures/auto-arrange-commerce.json'),'utf8'));
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture,null,2));
 const before=await source(page);await openDialog(page,fixture.page.blocks[0].heading);
 await page.getByRole('dialog').getByRole('button',{name:'Auto arrange',exact:true}).click();
 await expect.poll(async()=>(await current(page)).routing).toBe('curves');
 const after=await source(page),d=await current(page),original=fixture.page.blocks[0].diagram;
 expect(d.floats).toHaveLength(20);expect(d.nodes).toEqual(original.nodes);expect(d.edges).toEqual(original.edges);expect(d.groups).toEqual(original.groups);
 const paths=await page.locator('#docview path.edge').evaluateAll(elements=>elements.map(el=>el.getAttribute('d')));
 expect(paths).toHaveLength(36);for(const route of paths){expect(route).toMatch(/ C /);expect(route).not.toMatch(/NaN|Infinity/);}
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await expect(page.locator('#undo-builder')).toBeDisabled();
 await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
});
