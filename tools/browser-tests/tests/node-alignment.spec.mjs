import {test,expect,pastePage as paste} from '../helpers/test.mjs';
const fixture=()=>({page:{title:'Align and move',blocks:[{heading:'Services',diagram:{view:'ambient',autoplay:false,
  nodes:{a:{title:'First'},b:{title:'Second'},c:{title:'Stay'},row:{title:'Row'}},rows:[['row']],
  floats:[{id:'a',side:'below',x:260,y:210},{id:'b',side:'below',x:650,y:330},{id:'c',side:'below',x:950,y:230}],
  edges:[{from:'a',to:'b'},{from:'b',to:'c'}]}}]}});
const source=page=>page.locator('#src').inputValue();
const diagram=async page=>JSON.parse(await source(page)).page.blocks[0].diagram;
const node=(page,id)=>page.locator('#docview g.node[data-dv-node="'+id+'"]');
async function select(page){await node(page,'a').click();await node(page,'b').click({modifiers:['Shift']});await expect(page.locator('#guide')).toContainText('2 nodes selected');}
async function drag(page,id,dx,dy){
  await node(page,id).hover();
  const box=await node(page,id).locator('.card').boundingBox();
  const scale=await node(page,id).evaluate(n=>{const m=n.ownerSVGElement.getScreenCTM();return {x:m.a,y:m.d};});
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx*scale.x,y+dy*scale.y,{steps:8});
}
async function history(page,before,after){
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
  await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
}

test('align a horizontal row then Shift-drag and plain-drag the selection with one Undo each',async({page,server},info)=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture(),null,2));
  await select(page);const original=await source(page);
  await page.getByRole('button',{name:'Align horizontal',exact:true}).click();
  let d=await diagram(page);expect(d.floats.map(f=>f.y)).toEqual([210,210,230]);
  await expect(page.locator('#docview g.node.dv-sel')).toHaveCount(2);
  const aligned=await source(page);await history(page,original,aligned);await select(page);
  await page.keyboard.down('Shift');await drag(page,'a',65,90);
  await expect(page.locator('#docview .dv-ghost')).toHaveCount(2);
  await expect(page.locator('#docview .dv-free-edge-preview')).toHaveCount(2);
  await expect(page.locator('#src')).toHaveValue(aligned);
  await page.mouse.up();await page.keyboard.up('Shift');
  d=await diagram(page);for(const [i,x] of [[0,325],[1,715]]){expect(Math.abs(d.floats[i].x-x)).toBeLessThan(2);expect(Math.abs(d.floats[i].y-300)).toBeLessThan(2);}
  expect(d.floats[1].x-d.floats[0].x).toBeCloseTo(390,8);expect(d.floats[0].y).toBe(d.floats[1].y);
  expect(d.floats[2]).toEqual(fixture().page.blocks[0].diagram.floats[2]);
  await expect(page.locator('#docview g.node.dv-sel')).toHaveCount(2);
  await expect(page.locator('#docview .dv-ghost,.dv-free-edge-preview,.dv-free-edge-source')).toHaveCount(0);
  const moved=await source(page);await history(page,aligned,moved);await select(page);
  await drag(page,'b',-35,40);await page.mouse.up();
  d=await diagram(page);expect(Math.abs(d.floats[0].x-290)).toBeLessThan(2);expect(Math.abs(d.floats[1].x-680)).toBeLessThan(2);
  expect(Math.abs(d.floats[0].y-340)).toBeLessThan(2);expect(d.floats[0].y).toBe(d.floats[1].y);
  expect(d.floats[1].x-d.floats[0].x).toBeCloseTo(390,8);
  await expect(page.locator('#docview g.node.dv-sel')).toHaveCount(2);
  await info.attach('aligned-selection',{body:await page.screenshot(),contentType:'image/png'});
  await history(page,moved,await source(page));
});

test('vertical alignment follows the first selection; modifier-click still removes a member',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture()));
  await node(page,'b').click();await node(page,'a').click({modifiers:['Shift']});
  const before=await source(page);await page.getByRole('button',{name:'Align vertical',exact:true}).click();
  const d=await diagram(page);expect(d.floats.map(f=>f.x)).toEqual([650,650,950]);expect(d.floats.map(f=>f.y)).toEqual([210,330,230]);
  await node(page,'a').click({modifiers:['Shift']});await expect(page.locator('#docview g.node.dv-sel')).toHaveCount(1);
  await history(page,before,await source(page));
});

test('automatic group placement cancels on Escape, blur, pointer cancellation, source edits and disposal',async({page,server})=>{
  const raw=fixture();for(const f of raw.page.blocks[0].diagram.floats.slice(0,2)){delete f.x;delete f.y;}
  await page.goto(server.origin+'/lifetime/index.html');await paste(page,JSON.stringify(raw));
  for(const cancel of [()=>page.keyboard.press('Escape'),()=>page.evaluate(()=>window.dispatchEvent(new Event('blur'))),
    ()=>page.evaluate(()=>window.dispatchEvent(new Event('pointercancel')))]){
    await select(page);const before=await source(page);await drag(page,'a',30,50);await cancel();await page.mouse.up();
    await expect(page.locator('#src')).toHaveValue(before);await expect(page.locator('.dv-ghost,.dv-free-edge-preview,.dv-dragsrc')).toHaveCount(0);
  }
  await select(page);const before=await source(page);await drag(page,'a',40,60);
  const edited=before.replace('Align and move','Handwritten');
  await page.evaluate(text=>{const src=document.querySelector('#src');src.value=text;src.dispatchEvent(new Event('input',{bubbles:true}));},edited);
  await page.mouse.up();await expect(page.locator('#src')).toHaveValue(edited);await expect(page.locator('.dv-ghost,.dv-free-edge-preview')).toHaveCount(0);
  await page.evaluate(()=>__editorTest.builder.loadSpec(JSON.parse(document.querySelector('#src').value)));
  await select(page);const fresh=await source(page);await drag(page,'a',35,45);await page.evaluate(()=>__editorTest.builder.destroy());await page.mouse.up();
  await expect(page.locator('#src')).toHaveValue(fresh);await expect(page.locator('.dv-ghost,.dv-free-edge-preview,.dv-dragsrc')).toHaveCount(0);
});

test('row and mixed-section selections refuse group arrangement without a partial move',async({page,server})=>{
  const raw=fixture();raw.page.blocks.push({heading:'Another',diagram:{nodes:{other:{title:'Other'}},rows:[[]],floats:[{id:'other',side:'below',x:260,y:150}]}});
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));
  for(const id of ['row','other']){
    await node(page,'a').click();await node(page,id).click({modifiers:['Shift']});const before=await source(page);
    await page.getByRole('button',{name:'Align horizontal',exact:true}).click();await expect(page.locator('#src')).toHaveValue(before);
    await expect(page.locator('#guide')).toContainText(id==='row'?'Use Free placement':'single section');
    await drag(page,'a',30,45);await page.mouse.up();await expect(page.locator('#src')).toHaveValue(before);
  }
});

test('group alignment and dragging work in Explore and refuse stale source alignment',async({page,server})=>{
  const raw=fixture(),d=raw.page.blocks[0].diagram;
  d.layouts=[{id:'canvas',name:'Explore',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}}];d.defaultLayout='canvas';
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await select(page);
  await page.getByRole('button',{name:'Align horizontal',exact:true}).click();const aligned=await source(page);
  await drag(page,'b',50,50);await page.mouse.up();
  const moved=await diagram(page);expect(Math.abs(moved.floats[0].x-310)).toBeLessThan(2);
  expect(moved.floats[0].y).toBe(moved.floats[1].y);expect(moved.floats[1].x-moved.floats[0].x).toBeCloseTo(390,8);
  await history(page,aligned,await source(page));await select(page);
  const edited=(await source(page)).replace('Align and move','Handwritten source');
  await page.evaluate(text=>{const src=document.querySelector('#src');src.value=text;src.dispatchEvent(new Event('input',{bubbles:true}));},edited);
  await page.getByRole('button',{name:'Align vertical',exact:true}).click();await expect(page.locator('#src')).toHaveValue(edited);
  await expect(page.locator('#guide')).toContainText('Render it before aligning');
});
