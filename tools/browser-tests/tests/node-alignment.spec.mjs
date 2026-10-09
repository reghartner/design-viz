import {test,expect,pastePage as paste,closeTools} from '../helpers/test.mjs';
import {writeFile} from 'node:fs/promises';
const fixture=()=>({page:{title:'Align and move',blocks:[{heading:'Services',diagram:{view:'ambient',autoplay:false,
  nodes:{a:{title:'First'},b:{title:'Second'},c:{title:'Stay'},row:{title:'Row'}},rows:[['row']],
  floats:[{id:'a',side:'below',x:260,y:210},{id:'b',side:'below',x:650,y:330},{id:'c',side:'below',x:950,y:230}],
  edges:[{from:'a',to:'b'},{from:'b',to:'c'}]}}]}});
const source=page=>page.locator('#src').inputValue();
const diagram=async page=>JSON.parse(await source(page)).page.blocks[0].diagram;
const node=(page,id)=>page.locator('#docview g.node[data-dv-node="'+id+'"]');
const menu=page=>page.getByRole('menu',{name:'Object actions'});
async function cardCenters(page,ids){
  return page.locator(ids.map(id=>'#docview g.node[data-dv-node="'+id+'"] .card').join(',')).evaluateAll(cards=>cards.map(card=>{
    const inverse=card.ownerSVGElement.getScreenCTM().inverse(),r=card.getBoundingClientRect();
    const a=new DOMPoint(r.left,r.top).matrixTransform(inverse),b=new DOMPoint(r.right,r.bottom).matrixTransform(inverse);
    return {x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  }));
}
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
    const align=page.getByRole('button',{name:'Align horizontal',exact:true}),reason=id==='row'?'Use Free placement':'single section';
    await expect(align).toBeDisabled();await expect(align).toHaveAttribute('title',new RegExp(reason));await expect(page.locator('#src')).toHaveValue(before);
    await expect(page.locator('#guide')).toContainText(reason);
    await drag(page,'a',30,45);await page.mouse.up();await expect(page.locator('#src')).toHaveValue(before);
  }
});

test('group alignment and dragging work in Explore and refuse stale source alignment',async({page,server})=>{
  const raw=fixture(),d=raw.page.blocks[0].diagram;raw.page.presentation='explore';
  d.layouts=[{id:'canvas',name:'Explore',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}}];d.defaultLayout='canvas';
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await select(page);
  await page.getByRole('button',{name:'Align horizontal',exact:true}).click();const aligned=await source(page);
  await drag(page,'b',50,50);await page.mouse.up();
  const moved=await diagram(page);expect(Math.abs(moved.floats[0].x-310)).toBeLessThan(2);
  expect(moved.floats[0].y).toBe(moved.floats[1].y);expect(moved.floats[1].x-moved.floats[0].x).toBeCloseTo(390,8);
  await history(page,aligned,await source(page));await select(page);
  const edited=(await source(page)).replace('Align and move','Handwritten source');
  await page.evaluate(text=>{const src=document.querySelector('#src');src.value=text;src.dispatchEvent(new Event('input',{bubbles:true}));},edited);
  const align=page.getByRole('button',{name:'Align vertical',exact:true});await expect(align).toBeDisabled();await expect(align).toHaveAttribute('title',/Render it before aligning/);await expect(page.locator('#src')).toHaveValue(edited);
  await expect(page.locator('#guide')).toContainText('Render it before aligning');
});

test('Standard object menu keeps a selected set, anchors the invoked node, and supports node actions',async({page,server},info)=>{
  await page.setViewportSize({width:1280,height:800});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture(),null,2));
  await node(page,'a').click();await node(page,'b').click({modifiers:['Shift']});const original=await source(page);
  const toolbarFit=page.locator('#workspace-fit-selection'),inspectorFit=page.locator('#guide').getByRole('button',{name:'Fit selection',exact:true});
  await expect(toolbarFit).toBeDisabled();await expect(toolbarFit).toHaveAttribute('title',/only in Explore/);await expect(inspectorFit).toBeDisabled();await expect(inspectorFit).toHaveAttribute('title',/only in Explore/);
  await expect(page.locator('#guide').getByRole('button',{name:/^Distribute (horizontally|vertically)/})).toHaveCount(0);
  await node(page,'b').click({button:'right'});await expect(menu(page)).toBeVisible();await expect(page.locator('#docview g.node.dv-sel')).toHaveCount(2);
  for(const name of ['Inspect','Delete','Duplicate','Align horizontally','Align vertically'])await expect(menu(page).getByRole('menuitem',{name,exact:true})).toBeVisible();
  await expect(menu(page).getByRole('menuitem',{name:/^Distribute (horizontally|vertically)/})).toHaveCount(2);
  const menuFit=menu(page).getByRole('menuitem',{name:/^Fit selection/});await expect(menuFit).toHaveAttribute('aria-disabled','true');await expect(menuFit).toContainText('only in Explore');
  await page.screenshot({path:'/tmp/standard-node-actions-1280.png'});await info.attach('Standard node actions 1280',{body:await page.screenshot(),contentType:'image/png'});
  await menu(page).getByRole('menuitem',{name:'Align horizontally',exact:true}).click();let changed=await source(page),d=await diagram(page);
  expect(d.floats.find(f=>f.id==='b')).toEqual(fixture().page.blocks[0].diagram.floats.find(f=>f.id==='b'));
  expect(d.floats.find(f=>f.id==='a').y).toBeCloseTo(d.floats.find(f=>f.id==='b').y,3);await history(page,original,changed);const aligned=changed;

  await closeTools(page);await node(page,'c').click({button:'right'});await expect(page.locator('#docview g.node.dv-sel')).toHaveCount(1);await expect(node(page,'c')).toHaveClass(/dv-sel/);
  await menu(page).getByRole('menuitem',{name:'Inspect',exact:true}).click();await expect(page.locator('#guide').getByLabel('title',{exact:true})).toHaveValue('Stay');
  await node(page,'c').focus();await page.keyboard.press('Shift+F10');await expect(menu(page).getByRole('menuitem',{name:'Inspect',exact:true})).toBeFocused();
  await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await expect(menu(page).getByRole('menuitem',{name:'Duplicate',exact:true})).toBeFocused();await page.keyboard.press('Enter');
  changed=await source(page);expect(Object.keys((await diagram(page)).nodes)).toHaveLength(5);await history(page,aligned,changed);const duplicated=changed;

  await closeTools(page);await node(page,'c').click({button:'right'});await menu(page).getByRole('menuitem',{name:'Delete',exact:true}).click();changed=await source(page);expect((await diagram(page)).nodes.c).toBeUndefined();await history(page,duplicated,changed);
  await closeTools(page);await node(page,'row').click();await node(page,'a').click({modifiers:['Shift']});await node(page,'row').click({button:'right'});const align=menu(page).getByRole('menuitem',{name:/^Align horizontally/});await expect(align).toHaveAttribute('aria-disabled','true');await expect(align).toContainText('Free placement');await page.keyboard.press('Escape');
});

for(const presentation of ['standard','explore'])for(const direction of ['horizontal','vertical']){
  test(presentation+' '+direction+' context-menu alignment uses card centers and repeated operations are exact no-ops',async({page,server},info)=>{
    const raw=fixture(),d=raw.page.blocks[0].diagram,badgeId=(presentation==='standard')===(direction==='horizontal')?'a':'b';
    d.nodes[badgeId].delta=true;d.nodes[badgeId].deltaDetails={summary:'Badge extends outside the card'};
    d.nodes.b.title='A deliberately long selected anchor title that must not own alignment geometry';
    if(presentation==='explore'){
      raw.page.presentation='explore';
      d.layouts=[{id:'canvas',name:'Explore',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}}];d.defaultLayout='canvas';
    }
    await page.setViewportSize({width:1280,height:800});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));
    if(presentation==='standard')await page.locator('#docview .board').getByRole('button',{name:'Readable',exact:true}).click();
    else {await closeTools(page);await page.locator('#workspace-fit').click();await page.locator('.explore-board').dispatchEvent('wheel',{clientX:520,clientY:400,deltaY:-180,ctrlKey:true,bubbles:true,cancelable:true});}
    await node(page,'a').click();await node(page,'b').click({modifiers:['Shift']});
    const before=await source(page),authored=JSON.parse(before).page.blocks[0].diagram.floats,beforeGeometry=await cardCenters(page,['a','b']);
    await node(page,'b').click({button:'right'});await menu(page).getByRole('menuitem',{name:'Align '+direction+'ly',exact:true}).click();
    const aligned=await source(page),after=JSON.parse(aligned).page.blocks[0].diagram.floats,centers=await cardCenters(page,['a','b']);
    expect(after.find(f=>f.id==='b')).toEqual(authored.find(f=>f.id==='b'));
    expect(after.find(f=>f.id==='a')[direction==='horizontal'?'x':'y']).toBe(authored.find(f=>f.id==='a')[direction==='horizontal'?'x':'y']);
    expect(centers[0][direction==='horizontal'?'y':'x']).toBeCloseTo(centers[1][direction==='horizontal'?'y':'x'],5);
    await expect(page.locator('#docview g.node.dv-sel')).toHaveCount(2);
    const repeated=[];
    for(let repeat=0;repeat<3;repeat++){
      const geometry=await cardCenters(page,['a','b']);await node(page,'b').click({button:'right'});await menu(page).getByRole('menuitem',{name:'Align '+direction+'ly',exact:true}).click();
      expect(await source(page)).toBe(aligned);const nextGeometry=await cardCenters(page,['a','b']);expect(nextGeometry).toEqual(geometry);repeated.push(nextGeometry);
    }
    await writeFile('/tmp/design-viz-alignment-'+presentation+'-'+direction+'-geometry.json',JSON.stringify({badgeId,before:beforeGeometry,after:centers,repeated},null,2));
    await closeTools(page);
    if(presentation==='explore')await page.locator('#workspace-fit-selection').click();
    else await page.locator('#docview .board').getByRole('button',{name:'Fit diagram',exact:true}).click();
    await page.screenshot({path:'/tmp/design-viz-alignment-'+presentation+'-'+direction+'-1280.png'});
    await info.attach(presentation+' '+direction+' alignment',{body:await page.screenshot(),contentType:'image/png'});
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await expect(page.locator('#undo-builder')).toBeDisabled();
  });
}

for(const presentation of ['standard','explore'])for(const direction of ['horizontal','vertical']){
  test(presentation+' '+direction+' alignment pins an automatic clicked anchor and remains stable',async({page,server},info)=>{
    const raw=fixture(),d=raw.page.blocks[0].diagram;
    d.nodes={a:{title:'Automatic mover'},b:{title:'Automatic anchor'},c:{title:'Unselected automatic'},row:{title:'Row reference'}};
    d.rows=[['row']];d.edges=direction==='vertical'?[{from:'row',to:'a'}]:[];
    d.floats=direction==='horizontal'?
      [{id:'a',side:'below',noSpread:true},{id:'b',side:'below',noSpread:true},{id:'c',side:'below',noSpread:true}]:
      [{id:'a',side:'below',dy:120},{id:'b',side:'below',noSpread:true},{id:'c',side:'below',noSpread:true}];
    if(presentation==='explore'){
      raw.page.presentation='explore';
      d.layouts=[{id:'canvas',name:'Explore',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}}];d.defaultLayout='canvas';
    }
    await page.setViewportSize({width:1280,height:800});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));await closeTools(page);
    if(presentation==='explore')await page.locator('#workspace-fit').click();
    else await page.locator('#docview .board').getByRole('button',{name:'Fit diagram',exact:true}).click();
    await select(page);const before=await source(page),beforeGeometry=await cardCenters(page,['a','b','c']),beforeDiagram=await diagram(page);
    expect(beforeGeometry[0][direction==='horizontal'?'y':'x']).not.toBeCloseTo(beforeGeometry[1][direction==='horizontal'?'y':'x'],3);
    await node(page,'b').click({button:'right'});await menu(page).getByRole('menuitem',{name:'Align '+direction+'ly',exact:true}).click();
    const aligned=await source(page),afterDiagram=await diagram(page),afterGeometry=await cardCenters(page,['a','b','c']);
    for(const id of ['a','b']){const f=afterDiagram.floats.find(item=>item.id===id);expect(f.x).toEqual(expect.any(Number));expect(f.y).toEqual(expect.any(Number));}
    expect(afterDiagram.floats.find(f=>f.id==='b')).toMatchObject({side:'below',noSpread:true});
    expect(afterDiagram.floats.find(f=>f.id==='b').x).toBeCloseTo(beforeGeometry[1].x,3);
    expect(afterDiagram.floats.find(f=>f.id==='b').y).toBeCloseTo(beforeGeometry[1].y,3);
    expect(afterGeometry[1].x).toBeCloseTo(beforeGeometry[1].x,3);expect(afterGeometry[1].y).toBeCloseTo(beforeGeometry[1].y,3);
    expect(afterGeometry[0][direction==='horizontal'?'x':'y']).toBeCloseTo(beforeGeometry[0][direction==='horizontal'?'x':'y'],3);
    expect(afterGeometry[0][direction==='horizontal'?'y':'x']).toBeCloseTo(afterGeometry[1][direction==='horizontal'?'y':'x'],3);
    expect(afterGeometry[2].x).toBeCloseTo(beforeGeometry[2].x,3);expect(afterGeometry[2].y).toBeCloseTo(beforeGeometry[2].y,3);
    for(const key of ['x','y'])expect(afterDiagram.floats.find(f=>f.id==='c')[key]).toEqual(expect.any(Number));
    expect(afterDiagram.nodes.row).toEqual(beforeDiagram.nodes.row);await expect(page.locator('#docview g.node.dv-sel')).toHaveCount(2);
    const repeated=[];
    for(let repeat=0;repeat<3;repeat++){
      const geometry=await cardCenters(page,['a','b','c']);await node(page,'b').click({button:'right'});await menu(page).getByRole('menuitem',{name:'Align '+direction+'ly',exact:true}).click();
      expect(await source(page)).toBe(aligned);const nextGeometry=await cardCenters(page,['a','b','c']);expect(nextGeometry).toEqual(geometry);repeated.push(nextGeometry);
    }
    await writeFile('/tmp/design-viz-auto-anchor-'+presentation+'-'+direction+'-geometry.json',JSON.stringify({before:beforeGeometry,after:afterGeometry,repeated},null,2));
    await closeTools(page);
    if(presentation==='explore')await page.locator('#workspace-fit-selection').click();
    else await page.locator('#docview .board').getByRole('button',{name:'Fit diagram',exact:true}).click();
    await page.screenshot({path:'/tmp/design-viz-auto-anchor-'+presentation+'-'+direction+'-1280.png'});
    await info.attach(presentation+' '+direction+' automatic anchor',{body:await page.screenshot(),contentType:'image/png'});
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await expect(page.locator('#undo-builder')).toBeDisabled();
  });
}

async function marqueeCorner(page,id){
  const r=await node(page,id).boundingBox();
  await page.keyboard.down('Alt');await page.mouse.move(r.x+r.width+10,r.y-10);await page.mouse.down();await page.mouse.move(r.x+r.width-4,r.y+6,{steps:5});await page.mouse.up();await page.keyboard.up('Alt');
}
test('Standard Alt marquee follows fitted, zoomed, and scrolled node geometry without panning or editing',async({page,server},info)=>{
  await page.setViewportSize({width:1280,height:800});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture()));const board=page.locator('#docview .board'),svg=board.locator('.boardcanvas>svg');const original=await source(page),fittedWidth=(await svg.boundingBox()).width;
  for(const state of ['fitted','zoomed','scrolled']){
    if(state==='zoomed'){await board.getByRole('button',{name:'Readable',exact:true}).click();await expect(board).toHaveClass(/board-size-readable/);expect((await svg.boundingBox()).width).toBeGreaterThan(fittedWidth);}
    if(state==='scrolled')await board.evaluate(el=>{el.scrollLeft=Math.min(el.scrollWidth-el.clientWidth,el.scrollLeft+120);});
    const scroll=await board.evaluate(el=>[el.scrollLeft,el.scrollTop]);await marqueeCorner(page,'b');
    await expect(node(page,'b')).toHaveClass(/dv-sel/);await expect(page.locator('#docview g.node.dv-sel')).toHaveCount(1);expect(await source(page)).toBe(original);
    expect(await board.evaluate(el=>[el.scrollLeft,el.scrollTop])).toEqual(scroll);await page.keyboard.press('Escape');await expect(page.locator('#docview g.node.dv-sel')).toHaveCount(0);
  }
  await info.attach('Standard marquee geometry',{body:await page.screenshot(),contentType:'image/png'});
});

test('Standard keyboard decorations and menu retire with the builder',async({page,server})=>{
  await page.goto(server.origin+'/lifetime/index.html');await paste(page,JSON.stringify(fixture()));const anchor=node(page,'a');
  await expect(anchor).toHaveAttribute('tabindex','0');await anchor.focus();await page.keyboard.press('ContextMenu');await expect(menu(page)).toBeVisible();await page.keyboard.press('Escape');await expect(anchor).toBeFocused();
  await page.evaluate(()=>__editorTest.builder.destroy());await expect(menu(page)).toHaveCount(0);await expect(anchor).not.toHaveAttribute('tabindex','0');await expect(anchor).not.toHaveAttribute('aria-haspopup','menu');await expect(anchor).not.toHaveAttribute('role','group');
  await page.evaluate(()=>__editorTest.remount());await expect(anchor).toHaveAttribute('tabindex','0');
});
