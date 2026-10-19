import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';
import {test,expect,paste,pastePage,closeTools} from '../helpers/test.mjs';
function fixture(row=false){return {page:{title:'Spatial edit',skin:'pastel',sections:[{heading:'Explore objects',diagram:{autoplay:false,nodes:{a:{title:'Anchor'},b:{title:'Second'}},rows:row?[['a','b']]:[[]],floats:row?[]:[{id:'a',x:180,y:100},{id:'b',x:500,y:320}],edges:[{from:'a',to:'b'}],panels:[{id:'p',type:'state',title:'Canvas status',states:['Ready'],initial:{state:'Ready'}},{id:'q',type:'state',title:'Floating status',states:['Ready'],initial:{state:'Ready'}}],layouts:[{id:'canvas',name:'Canvas',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:8,h:12},{panel:'p',x:8,y:0,w:4,h:4},{panel:'q',x:8,y:4,w:4,h:4}]},exploreLayout:{panelPlacement:'canvas',panelPlacements:[{panel:'q',placement:'floating'}],canvas:{panels:[{panel:'p',x:700,y:80,w:240,h:400}]}}}]}}]}};}
const navigation=page=>page.locator('#docview>.explore-navigation');
async function fit(page){await navigation(page).getByRole('button',{name:/^Fit(?: canvas| diagram)?$/,exact:true}).click();}
async function openRaw(page,server,raw,width=1280){await page.setViewportSize({width,height:width===1280?800:900});await page.goto(server.origin+'/standalone.html');await page.evaluate(()=>localStorage.clear());await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await closeTools(page);await page.evaluate(()=>document.fonts.ready);await fit(page);await expect(page.locator('[data-explore-panel=p]')).toBeVisible();}
async function open(page,server,row=false,skin='pastel',customEdge=false){const raw=fixture(row);raw.page.skin=skin;if(customEdge)Object.assign(raw.page.sections[0].diagram.edges[0],{fromPort:{side:'right',offset:.25},curvePoints:[{t:.5,dx:20,dy:-40}],label:'kept',labelDx:9});await openRaw(page,server,raw);}
async function openStandard(page,server){const raw=fixture(),d=raw.page.sections[0].diagram;d.layouts[0].presentation='standard';delete d.layouts[0].exploreLayout;d.panels=[];d.layouts[0].sectionLayout.default=[{x:0,y:0,w:12,h:12}];await page.setViewportSize({width:1280,height:800});await page.goto(server.origin+'/standalone.html');await page.evaluate(()=>localStorage.clear());await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await closeTools(page);await page.evaluate(()=>document.fonts.ready);await expect(page.locator('[data-dv-node=a]')).toBeVisible();}
const node=page=>page.locator('[data-dv-node=a]');
const panel=page=>page.locator('[data-explore-panel=p]');
const menu=page=>page.getByRole('menu',{name:'Object actions'});
async function source(page){return page.locator('#src').inputValue();}
async function history(page,before,after){await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);}
async function dragNode(page,id,dx,dy){const target=page.locator('[data-dv-node='+id+']'),box=await target.locator('.card').boundingBox(),scale=await target.evaluate(el=>{const m=el.ownerSVGElement.getScreenCTM();return {x:m.a,y:m.d};});const x=box.x+box.width/2,y=box.y+box.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx*scale.x,y+dy*scale.y,{steps:8});}
async function marquee(page,hold=false){
 const bounds=await page.locator('.explore-board').evaluate(el=>{const r=el.getBoundingClientRect();const boxes=Array.from(el.querySelectorAll('.boardcanvas [data-dv-node],.explore-canvas-objects [data-explore-panel]')).map(e=>e.getBoundingClientRect());let x=Math.max(r.left+5,Math.min(...boxes.map(b=>b.left))-16),y=Math.max(r.top+5,Math.min(...boxes.map(b=>b.top))-16);return {x,y,right:Math.min(r.right-5,Math.max(...boxes.map(b=>b.right))+16),bottom:Math.min(r.bottom-5,Math.max(...boxes.map(b=>b.bottom))+16)};});
 await page.keyboard.down('Alt');await page.mouse.move(bounds.x,bounds.y);await page.mouse.down();await page.mouse.move(bounds.right,bounds.bottom,{steps:8});if(!hold){await page.mouse.up();await page.keyboard.up('Alt');}
}
test('pointer-selected Standard free node receives canvas focus and nudges with Undo and Redo',async({page,server},info)=>{
 await openStandard(page,server);const anchor=node(page),before=await source(page),x=JSON.parse(before).page.sections[0].diagram.floats.find(item=>item.id==='a').x;
 await page.locator('#workspace-home').focus();await anchor.click();await expect(anchor).toBeFocused();await page.keyboard.press('ArrowRight');
 const after=await source(page),moved=JSON.parse(after).page.sections[0].diagram.floats.find(item=>item.id==='a');expect(moved.x).toBeCloseTo(x+10,1);await page.screenshot({path:'/tmp/flowview-nudge-standard-fixed.png'});await info.attach('Standard click then nudge',{body:await page.screenshot(),contentType:'image/png'});await history(page,before,after);
});
test('pointer-selected Explore node and canvas panel receive focus after Inspector editing and nudge',async({page,server},info)=>{
 await open(page,server);await node(page).click();await page.locator('#editor-tab-inspect').click();const field=page.locator('#guide input').first();await field.focus();
 const before=await source(page),nodeX=JSON.parse(before).page.sections[0].diagram.floats.find(item=>item.id==='a').x;await node(page).click();await expect(node(page)).toBeFocused();await page.keyboard.press('ArrowRight');
 const nodeMoved=await source(page);expect(JSON.parse(nodeMoved).page.sections[0].diagram.floats.find(item=>item.id==='a').x).toBeCloseTo(nodeX+10,1);await history(page,before,nodeMoved);
 await panel(page).click({position:{x:4,y:4}});await expect(panel(page)).toBeFocused();const panelBefore=await source(page),panelY=JSON.parse(panelBefore).page.sections[0].diagram.layouts[0].exploreLayout.canvas.panels[0].y;await page.keyboard.press('ArrowDown');
 const panelMoved=await source(page);expect(JSON.parse(panelMoved).page.sections[0].diagram.layouts[0].exploreLayout.canvas.panels[0].y).toBeCloseTo(panelY+10,1);await page.screenshot({path:'/tmp/flowview-nudge-explore-fixed.png'});await info.attach('Explore click then nudge',{body:await page.screenshot(),contentType:'image/png'});await history(page,panelBefore,panelMoved);
});
test('modifier pointer selection focuses its clicked node and leaves locked members fixed while nudging',async({page,server})=>{
 const raw=fixture();raw.page.sections[0].diagram.nodes.b.locked=true;await openRaw(page,server,raw);const before=await source(page),positions=Object.fromEntries(JSON.parse(before).page.sections[0].diagram.floats.map(item=>[item.id,item.x]));
 await node(page).click();const second=page.locator('[data-dv-node=b]');await second.click({modifiers:['Shift']});await expect(second).toBeFocused();await expect(page.locator('.dv-sel[data-dv-node]')).toHaveCount(2);await page.keyboard.press('ArrowRight');
 const after=await source(page),moved=Object.fromEntries(JSON.parse(after).page.sections[0].diagram.floats.map(item=>[item.id,item.x]));expect(moved.a).toBeCloseTo(positions.a+10,1);expect(moved.b).toBeCloseTo(positions.b,1);await history(page,before,after);
});
test('Alt marquee leaves a selected canvas object focused for immediate mixed-object nudging',async({page,server})=>{
 await open(page,server);const before=await source(page),diagram=JSON.parse(before).page.sections[0].diagram,positions=Object.fromEntries(diagram.floats.map(item=>[item.id,item.y])),panelY=diagram.layouts[0].exploreLayout.canvas.panels[0].y;await marquee(page);
 await expect(page.locator('.dv-sel')).toHaveCount(3);expect(await page.evaluate(()=>document.activeElement?.matches('[data-dv-object-menu].dv-sel'))).toBe(true);await page.keyboard.press('ArrowDown');
 const after=await source(page),moved=JSON.parse(after).page.sections[0].diagram;for(const item of moved.floats)expect(item.y).toBeCloseTo(positions[item.id]+10,1);expect(moved.layouts[0].exploreLayout.canvas.panels[0].y).toBeCloseTo(panelY+10,1);await history(page,before,after);
});
test('marquee selects intersecting nodes and canvas panels without source or pan; menu edits mixed objects atomically',async({page,server},info)=>{
 await open(page,server);const original=await source(page),scroll=await page.locator('.explore-board').evaluate(el=>[el.scrollLeft,el.scrollTop]);
 await marquee(page,true);await expect(page.locator('.dv-selection-marquee')).toBeVisible();await page.screenshot({path:'/tmp/explore-marquee-1280.png'});await info.attach('marquee',{body:await page.screenshot(),contentType:'image/png'});await page.mouse.up();await page.keyboard.up('Alt');
 await expect(page.locator('.dv-sel[data-dv-node]')).toHaveCount(2);await expect(panel(page)).toHaveClass(/dv-sel/);await expect(page.locator('[data-explore-panel=q]')).not.toHaveClass(/dv-sel/);expect(await source(page)).toBe(original);expect(await page.locator('.explore-board').evaluate(el=>[el.scrollLeft,el.scrollTop])).toEqual(scroll);await expect(page.locator('#undo-builder')).toBeDisabled();
 await node(page).click({button:'right'});await expect(menu(page)).toBeVisible();await page.screenshot({path:'/tmp/explore-object-menu-1280.png'});await info.attach('object menu',{body:await page.screenshot(),contentType:'image/png'});
 const mr=await menu(page).boundingBox();expect(mr.x).toBeGreaterThanOrEqual(0);expect(mr.x+mr.width).toBeLessThanOrEqual(1280);expect(mr.y+mr.height).toBeLessThanOrEqual(800);
 await menu(page).getByRole('menuitem',{name:'Inspect',exact:true}).click();await expect(page.locator('#guide')).toContainText('3 objects selected');
 await closeTools(page);await node(page).click({button:'right'});await menu(page).getByRole('menuitem',{name:'Align horizontally',exact:true}).click();const aligned=await source(page);expect(aligned).not.toBe(original);let d=JSON.parse(aligned).page.sections[0].diagram,p=d.layouts[0].exploreLayout.canvas.panels[0];expect(d.floats[0].y).toBeCloseTo(d.floats[1].y,1);expect(p.y+p.h/2).toBeCloseTo(d.floats[0].y,1);expect(p.h).toBeLessThan(400);await history(page,original,aligned);
 await closeTools(page);await fit(page);await marquee(page);await node(page).click({button:'right'});await menu(page).getByRole('menuitem',{name:'Duplicate',exact:true}).click();const duplicated=await source(page);d=JSON.parse(duplicated).page.sections[0].diagram;expect(Object.keys(d.nodes)).toHaveLength(4);expect(d.panels).toHaveLength(3);expect(d.layouts[0].exploreLayout.canvas.panels).toHaveLength(2);await history(page,aligned,duplicated);
 await closeTools(page);await fit(page);await marquee(page);await node(page).click({button:'right'});await menu(page).getByRole('menuitem',{name:'Delete',exact:true}).click();const deleted=await source(page);d=JSON.parse(deleted).page.sections[0].diagram;expect(Object.keys(d.nodes)).toHaveLength(0);expect(d.panels.map(p=>p.id)).toEqual(['q']);await history(page,duplicated,deleted);
});
test('Alt marquee keeps its selection for right-click Clear Custom Edges and one Undo',async({page,server})=>{
 await open(page,server,false,'pastel',true);const before=await source(page);await marquee(page);await expect(page.locator('.dv-sel')).toHaveCount(3);
 await node(page).click({button:'right'});const clear=menu(page).getByRole('menuitem',{name:'Clear Custom Edges',exact:true});await expect(clear).toBeEnabled();await clear.click();
 const after=await source(page),edge=JSON.parse(after).page.sections[0].diagram.edges[0];expect(after).not.toBe(before);expect(edge.fromPort).toBeUndefined();expect(edge.curvePoints).toBeUndefined();expect(edge.label).toBe('kept');expect(edge.labelDx).toBe(9);await history(page,before,after);
});
test('node object menus toggle single and selected position locks with one Undo',async({page,server})=>{
 await open(page,server);const original=await source(page);
 await node(page).click({button:'right'});await menu(page).getByRole('menuitem',{name:'Lock position',exact:true}).click();
 const singleLocked=await source(page);expect(JSON.parse(singleLocked).page.sections[0].diagram.nodes.a.locked).toBe(true);await history(page,original,singleLocked);
 await node(page).click({button:'right'});await menu(page).getByRole('menuitem',{name:'Unlock position',exact:true}).click();
 const singleUnlocked=await source(page),singleDiagram=JSON.parse(singleUnlocked).page.sections[0].diagram;expect(singleDiagram.nodes.a.locked).toBeUndefined();const at=f=>({x:f.x,y:f.y});expect(at(singleDiagram.floats.find(f=>f.id==='a'))).toEqual(at(JSON.parse(original).page.sections[0].diagram.floats.find(f=>f.id==='a')));await history(page,singleLocked,singleUnlocked);
 await node(page).click();await page.locator('[data-dv-node=b]').click({modifiers:['Shift']});await node(page).click({button:'right'});
 await expect(menu(page).getByRole('menuitem',{name:'Lock selected positions',exact:true})).toBeEnabled();await expect(menu(page).getByRole('menuitem',{name:/^Unlock selected positions/})).toHaveAttribute('aria-disabled','true');
 await menu(page).getByRole('menuitem',{name:'Lock selected positions',exact:true}).click();const selectedLocked=await source(page);expect(['a','b'].map(id=>JSON.parse(selectedLocked).page.sections[0].diagram.nodes[id].locked)).toEqual([true,true]);await history(page,singleUnlocked,selectedLocked);
 await node(page).click();await page.locator('[data-dv-node=b]').click({modifiers:['Shift']});await node(page).click({button:'right'});await expect(menu(page).getByRole('menuitem',{name:/^Lock selected positions/})).toHaveAttribute('aria-disabled','true');await menu(page).getByRole('menuitem',{name:'Unlock selected positions',exact:true}).click();
 const selectedUnlocked=await source(page);expect(['a','b'].map(id=>JSON.parse(selectedUnlocked).page.sections[0].diagram.nodes[id].locked)).toEqual([undefined,undefined]);await history(page,selectedLocked,selectedUnlocked);
});
/* #617 locking a row node moves nothing. Contract matrix:
 row | fixture | assertion (scoped) | rejects
 1 right-click Lock position | rowFixture: Standard, rows a,b,c,h / d,e,(f,i), only b grouped | b.locked true; rendered SVG center of EVERY [data-dv-node] equal before/after | lift-to-float where c/h slide left or rows lose the group band
 2 right-click Unlock position | locked b | b.locked removed; every rendered center unchanged | unlock re-flowing the row
 3 Undo/Redo | each edit | #src equals the exact prior/next text; centers unchanged after Redo | multi-step or lossy history
 4 Inspector Keep position fixed | Inspect b, check then uncheck | b.locked toggles; every rendered center unchanged both times | Inspector path still reflowing
 5 row lock | Shift-select a,b,c,h, Lock selected positions | all four locked; every center unchanged (row d,e,f,i included) | the row vanishing so the row below moves up
 6 multi-select lock (#520) | Shift-select b,e, Lock then Unlock selected positions | both toggled; every center unchanged | either row re-spacing
 7 JSON tab exclusion | lock b, then type source without a into the JSON tab and Render | #src keeps the typed text exactly; b re-spaces as typed | a lock guard that silently rewrites hand-typed source */
function rowFixture(){return {page:{title:'Lock reflow',skin:'pastel',sections:[{heading:'Rows',diagram:{autoplay:false,nodes:{a:{title:'Alpha'},b:{title:'Beta',group:'g'},c:{title:'Gamma'},h:{title:'Hotel'},d:{title:'Delta'},e:{title:'Echo'},f:{title:'Fox'},i:{title:'India'}},groups:{g:{title:'Beta group'}},rows:[['a','b','c','h'],['d','e',['f','i']]],edges:[{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'h'},{from:'b',to:'e'},{from:'d',to:'f'}]}}]}};}
const rowIds=['a','b','c','h','d','e','f','i'];
async function renderedCenters(page){return page.evaluate(ids=>Object.fromEntries(ids.map(id=>{const el=document.querySelector('[data-dv-node="'+id+'"]'),card=el.querySelector('.card'),inverse=el.ownerSVGElement.getScreenCTM().inverse(),r=card.getBoundingClientRect(),a=new DOMPoint(r.left,r.top).matrixTransform(inverse),b=new DOMPoint(r.right,r.bottom).matrixTransform(inverse);return [id,{x:(a.x+b.x)/2,y:(a.y+b.y)/2}];})),rowIds);}
async function expectUnmoved(page,before){const now=await renderedCenters(page);for(const id of rowIds){expect(now[id].x,id+' x').toBeCloseTo(before[id].x,1);expect(now[id].y,id+' y').toBeCloseTo(before[id].y,1);}}
const lockedIds=text=>rowIds.filter(id=>JSON.parse(text).page.sections[0].diagram.nodes[id].locked===true);
async function shiftSelect(page,ids){await page.locator('[data-dv-node='+ids[0]+']').click();for(const id of ids.slice(1))await page.locator('[data-dv-node='+id+']').click({modifiers:['Shift']});await expect(page.locator('.dv-sel[data-dv-node]')).toHaveCount(ids.length);}
test('locking a row node from the menu, Inspector or a selection moves no other node (#617)',async({page,server})=>{
 await page.setViewportSize({width:1280,height:800});await page.goto(server.origin+'/standalone.html');await page.evaluate(()=>localStorage.clear());await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(rowFixture()));await closeTools(page);await page.evaluate(()=>document.fonts.ready);await expect(page.locator('[data-dv-node=b]')).toBeVisible();
 const original=await source(page),before=await renderedCenters(page);expect(lockedIds(original)).toEqual([]);expect(before.c.x).toBeGreaterThan(before.b.x);expect(before.d.y).toBeGreaterThan(before.a.y);
 const b=page.locator('[data-dv-node=b]');
 await b.click({button:'right'});await menu(page).getByRole('menuitem',{name:'Lock position',exact:true}).click();
 const locked=await source(page);expect(lockedIds(locked)).toEqual(['b']);await expect(b.locator('.dv-position-lock-badge')).toHaveCount(1);await expectUnmoved(page,before);
 await history(page,original,locked);await expectUnmoved(page,before);
 await b.click({button:'right'});await menu(page).getByRole('menuitem',{name:'Unlock position',exact:true}).click();
 const unlocked=await source(page);expect(lockedIds(unlocked)).toEqual([]);await expectUnmoved(page,before);await history(page,locked,unlocked);await expectUnmoved(page,before);
 await page.locator('#undo-builder').click();await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
 await b.click({button:'right'});await menu(page).getByRole('menuitem',{name:'Inspect',exact:true}).click();
 const keep=page.locator('#guide .iform>.frow').filter({has:page.locator('.flab',{hasText:/^Keep position fixed$/})}).locator('input[type=checkbox]');
 await expect(keep).not.toBeChecked();await keep.check();await expect(page.locator('#src')).not.toHaveValue(original);
 const inspectLocked=await source(page);expect(lockedIds(inspectLocked)).toEqual(['b']);await expectUnmoved(page,before);
 await keep.uncheck();await expect(page.locator('#src')).not.toHaveValue(inspectLocked);expect(lockedIds(await source(page))).toEqual([]);await expectUnmoved(page,before);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(inspectLocked);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);await expectUnmoved(page,before);
 await closeTools(page);
 await shiftSelect(page,['a','b','c','h']);await page.locator('[data-dv-node=a]').click({button:'right'});await menu(page).getByRole('menuitem',{name:'Lock selected positions',exact:true}).click();
 const rowLocked=await source(page);expect(lockedIds(rowLocked)).toEqual(['a','b','c','h']);await expectUnmoved(page,before);await history(page,original,rowLocked);await expectUnmoved(page,before);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);
 await shiftSelect(page,['b','e']);await b.click({button:'right'});await menu(page).getByRole('menuitem',{name:'Lock selected positions',exact:true}).click();
 const pairLocked=await source(page);expect(lockedIds(pairLocked)).toEqual(['b','e']);await expectUnmoved(page,before);await history(page,original,pairLocked);
 await shiftSelect(page,['b','e']);await b.click({button:'right'});await menu(page).getByRole('menuitem',{name:'Unlock selected positions',exact:true}).click();
 const pairUnlocked=await source(page);expect(lockedIds(pairUnlocked)).toEqual([]);await expectUnmoved(page,before);await history(page,pairLocked,pairUnlocked);await expectUnmoved(page,before);
 await b.click({button:'right'});await menu(page).getByRole('menuitem',{name:'Lock position',exact:true}).click();expect(lockedIds(await source(page))).toEqual(['b']);
 const typedRaw=JSON.parse(await source(page)),typedDiagram=typedRaw.page.sections[0].diagram;typedDiagram.rows[0]=['b','c','h'];delete typedDiagram.nodes.a;typedDiagram.edges=typedDiagram.edges.filter(e=>e.from!=='a'&&e.to!=='a');const typed=JSON.stringify(typedRaw,null,2);
 await page.locator('#editor-tab-json').click();await page.locator('#src').fill(typed);await page.locator('#go').click();await closeTools(page);
 await expect(page.locator('#src')).toHaveValue(typed);await expect(page.locator('[data-dv-node=a]')).toHaveCount(0);const typedCenters=await page.evaluate(()=>{const el=document.querySelector('[data-dv-node="b"]'),r=el.querySelector('.card').getBoundingClientRect(),inv=el.ownerSVGElement.getScreenCTM().inverse(),a=new DOMPoint(r.left,r.top).matrixTransform(inv),z=new DOMPoint(r.right,r.bottom).matrixTransform(inv);return {x:(a.x+z.x)/2};});expect(Math.abs(typedCenters.x-before.b.x)).toBeGreaterThan(20);
});
for(const width of [1280,1440])test('locked drag feedback and mixed selection filtering at '+width,async({page,server},info)=>{
 const raw=fixture(),diagram=raw.page.sections[0].diagram;diagram.nodes.a.locked=true;await openRaw(page,server,raw,width);
 await node(page).click();await page.locator('[data-dv-node=b]').click({modifiers:['Shift']});await expect(page.locator('.dv-sel[data-dv-node]')).toHaveCount(2);
 if(width>1280)await page.locator('#editor-tab-inspect').click();else await closeTools(page);
 const before=await source(page),beforeDiagram=JSON.parse(before).page.sections[0].diagram;
 await dragNode(page,'a',70,45);await expect(node(page)).toHaveClass(/dv-position-lock-feedback/);await expect(node(page).locator('.dv-position-lock-badge')).toHaveAccessibleName('Position locked');await expect(page.locator('[data-dv-node=b]')).toHaveClass(/dv-dragsrc/);await expect(page.locator('.dv-ghost')).toHaveCount(1);await expect(page.locator('.dv-spatial-status')).toHaveCount(0);await expect(page.getByRole('status').filter({hasText:'stayed fixed'})).toHaveCount(1);await expect(page.locator('.dv-spatial-assistive-status')).toHaveAttribute('aria-live','polite');await expect(page.locator('.dv-spatial-assistive-status')).toHaveCSS('clip','rect(0px, 0px, 0px, 0px)');await expect(page.locator('.dv-spatial-assistive-status')).toHaveCSS('overflow','hidden');await expect(page.locator('#guide .ierr')).toBeHidden();
 await page.screenshot({path:'/tmp/position-lock-mixed-'+width+'.png'});await info.attach('mixed position lock '+width,{body:await page.screenshot(),contentType:'image/png'});await page.mouse.up();
 const moved=await source(page),movedDiagram=JSON.parse(moved).page.sections[0].diagram,movedA=movedDiagram.floats.find(f=>f.id==='a'),beforeA=beforeDiagram.floats.find(f=>f.id==='a');expect(moved).not.toBe(before);expect({x:movedA.x,y:movedA.y}).toEqual({x:beforeA.x,y:beforeA.y});expect(movedDiagram.floats.find(f=>f.id==='b').x).toBeGreaterThan(beforeDiagram.floats.find(f=>f.id==='b').x);expect(movedDiagram.floats.find(f=>f.id==='b').y).toBeGreaterThan(beforeDiagram.floats.find(f=>f.id==='b').y);await expect(page.locator('.dv-sel[data-dv-node]')).toHaveCount(2);await history(page,before,moved);
 await node(page).click();await page.locator('[data-dv-node=b]').click({modifiers:['Shift']});await node(page).click({button:'right'});await menu(page).getByRole('menuitem',{name:'Lock selected positions',exact:true}).click();const allLocked=await source(page);await expect(page.locator('.dv-position-lock-badge')).toHaveCount(2);
 await dragNode(page,'a',55,35);await expect(page.locator('.dv-position-lock-feedback')).toHaveCount(2);await expect(page.locator('.dv-ghost')).toHaveCount(0);await expect(page.locator('.dv-spatial-status')).toHaveCount(0);await expect(page.getByRole('status').filter({hasText:'2 selected positions'})).toHaveCount(1);await expect(page.locator('.dv-spatial-assistive-status')).toHaveAttribute('aria-live','polite');await expect(page.locator('.dv-spatial-assistive-status')).toHaveCSS('clip','rect(0px, 0px, 0px, 0px)');await expect(page.locator('.dv-spatial-assistive-status')).toHaveCSS('overflow','hidden');await expect(page.locator('#guide .ierr')).toBeHidden();await page.screenshot({path:'/tmp/position-lock-all-'+width+'.png'});await info.attach('all positions locked '+width,{body:await page.screenshot(),contentType:'image/png'});await page.mouse.up();
 await expect(page.locator('#src')).toHaveValue(allLocked);await expect(page.locator('.dv-position-lock-feedback,.dv-spatial-status,.dv-spatial-assistive-status')).toHaveCount(0);await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(moved);
});
test('context-menu alignment keeps the nonfirst clicked panel as the visual anchor with one Undo',async({page,server})=>{
 await open(page,server);const before=await source(page),authored=JSON.parse(before).page.sections[0].diagram.layouts[0].exploreLayout.canvas.panels[0];await marquee(page);
 await expect(page.locator('.dv-sel[data-dv-node]')).toHaveCount(2);await expect(panel(page)).toHaveClass(/dv-sel/);
 const anchorY=await panel(page).evaluate(el=>{const inverse=el.closest('.explore-board').querySelector('.boardcanvas>svg').getScreenCTM().inverse(),r=el.getBoundingClientRect(),a=new DOMPoint(r.left,r.top).matrixTransform(inverse),b=new DOMPoint(r.right,r.bottom).matrixTransform(inverse);return (a.y+b.y)/2;});
 await panel(page).click({button:'right'});await menu(page).getByRole('menuitem',{name:'Align horizontally',exact:true}).click();
 const after=await source(page),diagram=JSON.parse(after).page.sections[0].diagram;expect(after).not.toBe(before);expect(diagram.layouts[0].exploreLayout.canvas.panels[0]).toEqual(authored);
 const centers=await page.locator('.explore-board').evaluate(board=>{const inverse=board.querySelector('.boardcanvas>svg').getScreenCTM().inverse();return [...board.querySelectorAll('.boardcanvas [data-dv-node=a],.boardcanvas [data-dv-node=b],.explore-canvas-objects [data-explore-panel=p]')].map(el=>{const r=el.getBoundingClientRect(),a=new DOMPoint(r.left,r.top).matrixTransform(inverse),b=new DOMPoint(r.right,r.bottom).matrixTransform(inverse);return (a.y+b.y)/2;});});
 expect(centers).toHaveLength(3);for(const center of centers)expect(center).toBeCloseTo(anchorY,1);await expect(page.locator('.dv-sel')).toHaveCount(3);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await expect(page.locator('#undo-builder')).toBeDisabled();
 await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
});
test('keyboard menu alignment keeps the nonfirst targeted node as the vertical visual anchor with one Undo',async({page,server})=>{
 await open(page,server);const before=await source(page),second=page.locator('[data-dv-node=b]'),authored=JSON.parse(before).page.sections[0].diagram.floats.find(f=>f.id==='b');await marquee(page);
 await expect(page.locator('.dv-sel')).toHaveCount(3);
 const anchorX=await second.evaluate(el=>{const inverse=el.closest('.explore-board').querySelector('.boardcanvas>svg').getScreenCTM().inverse(),r=el.getBoundingClientRect(),a=new DOMPoint(r.left,r.top).matrixTransform(inverse),b=new DOMPoint(r.right,r.bottom).matrixTransform(inverse);return (a.x+b.x)/2;});
 await second.focus();await page.keyboard.press('Shift+F10');await expect(menu(page)).toBeVisible();await menu(page).getByRole('menuitem',{name:'Align vertically',exact:true}).click();
 const after=await source(page),diagram=JSON.parse(after).page.sections[0].diagram;expect(after).not.toBe(before);expect(diagram.floats.find(f=>f.id==='b')).toEqual(authored);
 const centers=await page.locator('.explore-board').evaluate(board=>{const inverse=board.querySelector('.boardcanvas>svg').getScreenCTM().inverse();return [...board.querySelectorAll('.boardcanvas [data-dv-node=a],.boardcanvas [data-dv-node=b],.explore-canvas-objects [data-explore-panel=p]')].map(el=>{const r=el.getBoundingClientRect(),a=new DOMPoint(r.left,r.top).matrixTransform(inverse),b=new DOMPoint(r.right,r.bottom).matrixTransform(inverse);return (a.x+b.x)/2;});});
 expect(centers).toHaveLength(3);for(const center of centers)expect(center).toBeCloseTo(anchorX,1);await expect(page.locator('.dv-sel')).toHaveCount(3);
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await expect(page.locator('#undo-builder')).toBeDisabled();
});
test('menu covers panel body border and header, modifiers preserve selection, Escape clears, row alignment explains refusal',async({page,server})=>{
 await open(page,server,true);const original=await source(page);
 await node(page).click();await panel(page).click({position:{x:4,y:4},modifiers:['Shift']});await expect(node(page)).toHaveClass(/dv-sel/);await expect(panel(page)).toHaveClass(/dv-sel/);
 await panel(page).click({button:'right',position:{x:4,y:4}});await expect(menu(page).getByRole('menuitem',{name:/Align horizontally/})).toHaveAttribute('aria-disabled','true');await expect(menu(page)).toContainText('Free placement');await page.keyboard.press('Escape');await expect(menu(page)).toHaveCount(0);expect(await source(page)).toBe(original);
 await panel(page).focus();await panel(page).locator('.explore-window-grip').click({button:'right'});await expect(menu(page)).toBeVisible();await page.keyboard.press('ArrowDown');await expect(menu(page).getByRole('menuitem',{name:'Delete',exact:true})).toBeFocused();await page.keyboard.press('Escape');
 await panel(page).focus();await page.keyboard.press('Escape');await expect(page.locator('.dv-sel')).toHaveCount(0);
 await node(page).click({modifiers:['Alt']});await expect(page.locator('.dv-connect-hint')).toBeVisible();await page.keyboard.press('Escape');
});
test('marquee follows zoom; source handwriting retires the menu and view actions clear selection',async({page,server})=>{
 await open(page,server);const original=await source(page);
 for(const delta of [0,150,-250]){
  if(delta)await page.locator('.explore-board').dispatchEvent('wheel',{clientX:430,clientY:400,deltaY:delta,ctrlKey:true,bubbles:true,cancelable:true});
  const r=await node(page).boundingBox();await page.keyboard.down('Alt');await page.mouse.move(r.x+r.width+10,r.y-10);await page.mouse.down();await page.mouse.move(r.x+r.width-4,r.y+6,{steps:5});await page.mouse.up();await page.keyboard.up('Alt');
  await expect(node(page)).toHaveClass(/dv-sel/);await expect(page.locator('.dv-sel')).toHaveCount(1);expect(await source(page)).toBe(original);await node(page).focus();await page.keyboard.press('Escape');await expect(page.locator('.dv-sel')).toHaveCount(0);
 }
 await fit(page);await marquee(page,true);await page.keyboard.press('Escape');await page.mouse.up();await page.keyboard.up('Alt');await expect(page.locator('.dv-selection-marquee')).toHaveCount(0);await expect(page.locator('.dv-sel')).toHaveCount(0);
 await node(page).click({button:'right'});await expect(menu(page)).toBeVisible();await page.locator('#src').evaluate(el=>{el.value+=' ';el.dispatchEvent(new Event('input',{bubbles:true}));});await expect(menu(page)).toHaveCount(0);await expect(node(page)).toHaveClass(/dv-sel/);await page.locator('#docview>.explore-navigation').getByRole('button',{name:'Canvas',exact:true}).click();await expect(page.locator('.dv-sel')).toHaveCount(0);expect(await source(page)).toBe(original+' ');
});

test('Explore editing chrome follows shared light and dark theme colors',async({page,server},info)=>{
 for(const skin of ['pastel','aurora']){
  await open(page,server,false,skin);await marquee(page);await node(page).click({button:'right'});
  const colors=await node(page).evaluate(el=>{const card=el.querySelector('.card'),probe=document.createElement('span');probe.style.color='var(--accent)';el.closest('.section-viewport').appendChild(probe);const expected=getComputedStyle(probe).color;probe.remove();return {stroke:getComputedStyle(card).stroke,expected};});expect(colors.stroke).toBe(colors.expected);
  const theme=await menu(page).evaluate(el=>{const probe=document.createElement('span');probe.style.background='var(--explore-bg)';el.appendChild(probe);const expected=getComputedStyle(probe).backgroundColor;probe.remove();return {actual:getComputedStyle(el).backgroundColor,expected};});expect(theme.actual).toBe(theme.expected);
  await page.screenshot({path:'/tmp/explore-object-menu-'+skin+'-1280.png'});await info.attach(skin+' context menu',{body:await page.screenshot(),contentType:'image/png'});await page.keyboard.press('Escape');
 }
});

test('Reader and Backstage keep native context menus and have no marquee editing UI',async({page,server})=>{
 for(const host of ['reader','backstage']){
  const raw=fixture();
  if(host==='reader'){
   const input=path.join(server.root,'spatial-reader.json'),output=path.join(server.root,'spatial-reader.html');await writeFile(input,JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);await page.goto(server.origin+'/spatial-reader.html');
  }else{
   await writeFile(path.join(server.root,'spatial-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));await writeFile(path.join(server.root,'spatial-native.html'),'<style>body{margin:0}#host{position:fixed;inset:0}</style><div id="host"></div><script type="module">import {mountNativeViewer} from "./spatial-native.js";window.mount=mountNativeViewer;</script>');await page.goto(server.origin+'/spatial-native.html');await page.waitForFunction(()=>!!window.mount);await page.evaluate(raw=>{window.viewer=mount(document.querySelector('#host'),raw);viewer.setCanvas(true);},raw);
  }
  await expect(panel(page)).toBeVisible();await expect(node(page)).not.toHaveAttribute('tabindex','0');await expect(node(page)).not.toHaveAttribute('data-dv-object-menu','');await page.evaluate(()=>document.addEventListener('contextmenu',e=>{window.contextPrevented=e.defaultPrevented;}));await node(page).click({button:'right'});expect(await page.evaluate(()=>window.contextPrevented)).toBe(false);await expect(menu(page)).toHaveCount(0);await expect(page.getByRole('button',{name:'Fit selection',exact:true})).toHaveCount(0);
  const r=await page.locator('.explore-board').boundingBox();await page.keyboard.down('Alt');await page.mouse.move(r.x+20,r.y+20);await page.mouse.down();await page.mouse.move(r.x+100,r.y+80,{steps:5});await expect(page.locator('.dv-selection-marquee')).toHaveCount(0);await page.mouse.up();await page.keyboard.up('Alt');await expect(page.locator('.dv-sel')).toHaveCount(0);
 }
});

test('Standard Reader and Backstage nodes keep native context menus and no workbench selection chrome',async({page,server})=>{
 for(const host of ['reader','backstage']){
  const raw=fixture();raw.page.sections[0].diagram.layouts[0].presentation='standard';
  if(host==='reader'){
   const input=path.join(server.root,'standard-spatial-reader.json'),output=path.join(server.root,'standard-spatial-reader.html');await writeFile(input,JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);await page.goto(server.origin+'/standard-spatial-reader.html');
  }else{
   await writeFile(path.join(server.root,'standard-spatial-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));await writeFile(path.join(server.root,'standard-spatial-native.html'),'<style>body{margin:0}#host{position:fixed;inset:0}</style><div id="host"></div><script type="module">import {mountNativeViewer} from "./standard-spatial-native.js";window.mount=mountNativeViewer;</script>');await page.goto(server.origin+'/standard-spatial-native.html');await page.waitForFunction(()=>!!window.mount);await page.evaluate(raw=>{window.viewer=mount(document.querySelector('#host'),raw);},raw);
  }
  const target=node(page);await expect(target).toBeVisible();await expect(target).not.toHaveAttribute('tabindex','0');await expect(target).not.toHaveAttribute('data-dv-object-menu','');
  await page.evaluate(()=>document.addEventListener('contextmenu',e=>{window.standardContextPrevented=e.defaultPrevented;},{once:true}));await target.click({button:'right'});expect(await page.evaluate(()=>window.standardContextPrevented)).toBe(false);await expect(menu(page)).toHaveCount(0);
  const r=await target.boundingBox();await page.keyboard.down('Alt');await page.mouse.move(r.x+r.width+10,r.y-10);await page.mouse.down();await page.mouse.move(r.x+r.width-4,r.y+6,{steps:5});await expect(page.locator('.dv-selection-marquee')).toHaveCount(0);await page.mouse.up();await page.keyboard.up('Alt');await expect(page.locator('.dv-sel')).toHaveCount(0);
 }
});

test('plain Explore nodes expose a keyboard entry point and return focus after menu dismissal',async({page,server})=>{
 await open(page,server);const original=await source(page),anchor=node(page);
 await expect(anchor).toHaveAttribute('tabindex','0');await expect(anchor).toHaveAttribute('role','group');await expect(anchor).toHaveAccessibleName('Anchor node');
 await page.locator('#diagram-add').focus();
 let reached=false;
 for(let i=0;i<60;i++){await page.keyboard.press('Tab');if(await anchor.evaluate(el=>el===document.activeElement)){reached=true;break;}}
 expect(reached).toBe(true);await expect(anchor).toBeFocused();
 expect(await anchor.locator('.card').evaluate(el=>getComputedStyle(el).strokeWidth)).toBe('4px');expect(await source(page)).toBe(original);await page.screenshot({path:'/tmp/explore-node-keyboard-focus-1280.png'});
 await page.keyboard.press('Shift+F10');await expect(menu(page)).toBeVisible();await expect(menu(page).getByRole('menuitem',{name:'Inspect',exact:true})).toBeFocused();await expect(anchor).toHaveClass(/dv-sel/);await page.screenshot({path:'/tmp/explore-node-keyboard-menu-1280.png'});
 await page.keyboard.press('ArrowDown');await expect(menu(page).getByRole('menuitem',{name:'Lock position',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(menu(page)).toHaveCount(0);await expect(anchor).toBeFocused();
 await page.keyboard.press('ContextMenu');await expect(menu(page)).toBeVisible();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await expect(menu(page).getByRole('menuitem',{name:'Duplicate',exact:true})).toBeFocused();await page.keyboard.press('Enter');
 await expect(menu(page)).toHaveCount(0);const duplicated=await source(page);expect(Object.keys(JSON.parse(duplicated).page.sections[0].diagram.nodes)).toHaveLength(3);await history(page,original,duplicated);
 await expect(node(page)).toHaveAttribute('tabindex','0');
});

test('Explore keyboard decorations and an open object menu retire across builder remount',async({page,server})=>{
 await page.goto(server.origin+'/lifetime/index.html');await pastePage(page,JSON.stringify(fixture()));await closeTools(page);
 const anchor=node(page);await expect(anchor).toHaveAttribute('tabindex','0');await anchor.focus();await page.keyboard.press('Shift+F10');await expect(menu(page)).toBeVisible();
 await page.evaluate(()=>__editorTest.builder.destroy());await expect(menu(page)).toHaveCount(0);await expect(anchor).not.toHaveAttribute('tabindex','0');await expect(anchor).not.toHaveAttribute('aria-haspopup','menu');await expect(anchor).not.toHaveAttribute('role','group');
 await page.evaluate(()=>__editorTest.remount());await expect(anchor).toHaveAttribute('tabindex','0');await anchor.focus();await page.keyboard.press('Shift+F10');await expect(menu(page)).toHaveCount(1);await page.keyboard.press('Escape');await expect(anchor).toBeFocused();
 const original=await source(page),transform=await anchor.getAttribute('transform');await page.keyboard.down('ArrowRight');await page.evaluate(()=>__editorTest.builder.destroy());await page.keyboard.up('ArrowRight');expect(await source(page)).toBe(original);await expect(anchor).toHaveAttribute('transform',transform);await expect(page.locator('#workspace-fit-selection')).toBeDisabled();
});

async function keyboardSelectAll(page){
 await node(page).focus();await page.keyboard.press('Enter');
 await page.locator('[data-dv-node=b]').focus();await page.keyboard.press('Shift+Enter');
 await panel(page).focus();await page.keyboard.press('Shift+Enter');
 await expect(page.locator('.dv-sel[data-dv-node]')).toHaveCount(2);await expect(panel(page)).toHaveClass(/dv-sel/);
}
async function graphBoxes(page){return page.locator('.explore-board').evaluate(board=>{const inverse=board.querySelector('.boardcanvas>svg').getScreenCTM().inverse();return [...board.querySelectorAll('.boardcanvas [data-dv-node],.explore-canvas-objects [data-explore-panel]')].map(el=>{const r=el.getBoundingClientRect(),a=new DOMPoint(r.left,r.top).matrixTransform(inverse),b=new DOMPoint(r.right,r.bottom).matrixTransform(inverse);return {x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y};});});}
test('keyboard selects and nudges mixed objects in graph units with one Undo per held sequence at different zooms',async({page,server})=>{
 await open(page,server);const original=await source(page);await keyboardSelectAll(page);expect(await source(page)).toBe(original);
 for(const zoom of [false,true]){
  if(zoom)await navigation(page).getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) out$/,exact:true}).click();
  await keyboardSelectAll(page);await node(page).focus();const before=await source(page),boxes=await graphBoxes(page);
  await page.keyboard.down('ArrowRight');await page.keyboard.down('ArrowRight');await page.keyboard.down('ArrowRight');expect(await source(page)).toBe(before);
  await page.keyboard.up('ArrowRight');await expect(node(page)).toBeFocused();const after=await source(page),moved=await graphBoxes(page);
  for(let i=0;i<boxes.length;i++){expect(moved[i].x-boxes[i].x).toBeCloseTo(30,1);expect(moved[i].y-boxes[i].y).toBeCloseTo(0,1);}
  expect(JSON.parse(after).page.sections[0].diagram.layouts[0].exploreLayout.canvas.panels[0].h).toBe(400);await page.keyboard.press('ControlOrMeta+z');await expect(page.locator('#src')).toHaveValue(before);await page.keyboard.press('ControlOrMeta+Shift+z');await expect(page.locator('#src')).toHaveValue(after);
 }
 await keyboardSelectAll(page);await panel(page).focus();const before=await source(page),boxes=await graphBoxes(page);await page.keyboard.press('Shift+ArrowDown');await expect(panel(page)).toBeFocused();const after=await source(page),moved=await graphBoxes(page);for(let i=0;i<boxes.length;i++)expect(moved[i].y-boxes[i].y).toBeCloseTo(50,1);await history(page,before,after);
 await node(page).focus();const unchanged=await source(page);await page.keyboard.down('ArrowLeft');await page.keyboard.press('Escape');await page.keyboard.up('ArrowLeft');expect(await source(page)).toBe(unchanged);await expect(node(page)).toHaveClass(/dv-sel/);
});
test('row nudges explain Free placement and widget text and resize keys remain isolated',async({page,server})=>{
 await open(page,server,true);const before=await source(page);await node(page).focus();await page.keyboard.press('Enter');await page.keyboard.press('ArrowRight');expect(await source(page)).toBe(before);await expect(page.locator('.dv-spatial-status')).toContainText('Free placement');
 await panel(page).focus();await page.keyboard.press('Enter');await page.keyboard.press('Shift+F10');await menu(page).getByRole('menuitem',{name:'Inspect',exact:true}).click();const title=page.locator('#guide input').first();await title.focus();await page.keyboard.press('ArrowRight');expect(await source(page)).toBe(before);
 await closeTools(page);await panel(page).locator('.explore-window-resize').focus();await page.keyboard.press('ArrowRight');const resized=await source(page);expect(resized).not.toBe(before);const old=JSON.parse(before).page.sections[0].diagram.layouts[0].exploreLayout.canvas.panels[0],now=JSON.parse(resized).page.sections[0].diagram.layouts[0].exploreLayout.canvas.panels[0];expect(now.x).toBe(old.x);expect(now.y).toBe(old.y);expect(now.w).toBeGreaterThan(old.w);await history(page,before,resized);
});
test('mixed distribution uses equal rendered gaps from menu and Inspector at two zooms with one Undo',async({page,server})=>{
 await open(page,server);await keyboardSelectAll(page);
 for(const direction of ['horizontal','vertical']){
  if(direction==='vertical'){
   // Move the second node and panel down to create room along the vertical axis.
   await page.locator('[data-dv-node=b]').focus();await page.keyboard.press('Enter');for(let i=0;i<5;i++)await page.keyboard.press('Shift+ArrowDown');
   await panel(page).focus();await page.keyboard.press('Enter');for(let i=0;i<16;i++)await page.keyboard.press('Shift+ArrowDown');await fit(page);
  }
  await keyboardSelectAll(page);if(direction==='vertical')await navigation(page).getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) out$/,exact:true}).click();
  const before=await source(page),boxes=await graphBoxes(page),axis=direction==='horizontal'?'x':'y',size=direction==='horizontal'?'w':'h',min=Math.min(...boxes.map(r=>r[axis])),max=Math.max(...boxes.map(r=>r[axis]+r[size]));
  await node(page).focus();await page.keyboard.press('Shift+F10');
  if(direction==='horizontal')await menu(page).getByRole('menuitem',{name:'Distribute horizontally',exact:true}).click();
  else{await menu(page).getByRole('menuitem',{name:'Inspect',exact:true}).click();await page.locator('#guide').getByRole('button',{name:'Distribute vertically',exact:true}).click();}
  const after=await source(page);expect(after).not.toBe(before);const moved=(await graphBoxes(page)).sort((a,b)=>a[axis]-b[axis]);
  // CSS layout quantizes rectangles before inverse zoom maps them to graph units.
  // Keep the visual error below one eighth of a CSS pixel at either zoom.
  const scale=await page.locator('.explore-board .boardcanvas>svg').evaluate(el=>el.getScreenCTM().a),tolerance=.125/scale;
  expect(Math.abs(moved[0][axis]-min)).toBeLessThanOrEqual(tolerance);expect(Math.abs(moved[2][axis]+moved[2][size]-max)).toBeLessThanOrEqual(tolerance);expect(Math.abs((moved[1][axis]-moved[0][axis]-moved[0][size])-(moved[2][axis]-moved[1][axis]-moved[1][size]))).toBeLessThanOrEqual(tolerance);expect(JSON.parse(after).page.sections[0].diagram.layouts[0].exploreLayout.canvas.panels[0].h).toBe(400);await history(page,before,after);await closeTools(page);
 }
});
for(const width of [1280,1440])test('Fit selection frames mixed bounds around Inspector and floating controls at '+width,async({page,server},info)=>{
 await open(page,server);await page.setViewportSize({width,height:width===1280?800:900});await expect(page.locator('#workspace-fit-selection')).toBeDisabled();await keyboardSelectAll(page);const before=await source(page);
 await node(page).focus();await page.keyboard.press('Shift+F10');await menu(page).getByRole('menuitem',{name:'Inspect',exact:true}).click();
 // Start with selected objects offscreen, then frame them through both entry points.
 await page.locator('.explore-board').evaluate(el=>{el.scrollLeft+=1400;el.scrollTop+=1000;});
 for(const entry of ['toolbar','inspector']){
  await (entry==='toolbar'?page.locator('#workspace-fit-selection'):page.locator('#guide').getByRole('button',{name:'Fit selection',exact:true})).click();
  const geometry=await page.evaluate(()=>{const b=document.querySelector('.explore-board').getBoundingClientRect(),selected=[...document.querySelectorAll('.dv-sel')].map(el=>el.getBoundingClientRect()),obstacles=[...document.querySelectorAll('.workspace-window:not([hidden]),.workspace-canvas-controls,.explore-stage > .explore-window:not([hidden]),.explore-player:not([hidden])')].map(el=>el.getBoundingClientRect());return {board:{x:b.left,y:b.top,right:b.right,bottom:b.bottom},selected:selected.map(r=>({x:r.left,y:r.top,right:r.right,bottom:r.bottom})),overlap:selected.some(a=>obstacles.some(o=>o.width&&o.height&&a.left<o.right&&a.right>o.left&&a.top<o.bottom&&a.bottom>o.top))};});
  expect(geometry.selected).toHaveLength(3);for(const r of geometry.selected){expect(r.x).toBeGreaterThanOrEqual(geometry.board.x);expect(r.y).toBeGreaterThanOrEqual(geometry.board.y);expect(r.right).toBeLessThanOrEqual(geometry.board.right);expect(r.bottom).toBeLessThanOrEqual(geometry.board.bottom);}expect(geometry.overlap).toBe(false);expect(await source(page)).toBe(before);await expect(page.locator('#undo-builder')).toBeDisabled();
  if(entry==='toolbar'){await page.screenshot({path:'/tmp/explore-fit-selection-'+width+'.png'});await info.attach('Fit selection '+width,{body:await page.screenshot(),contentType:'image/png'});}
  await fit(page);
 }
 await page.locator('#workspace-fit-selection').click();await page.screenshot({path:'/tmp/explore-spatial-polish-'+width+'.png'});
 await panel(page).focus();await page.keyboard.press('Enter');await page.locator('#workspace-fit-selection').click();await expect(page.locator('.dv-sel')).toHaveCount(1);const single=await panel(page).boundingBox(),inspector=await page.locator('#workspace-window-inspect').boundingBox();expect(single.x<inspector.x+inspector.width && single.x+single.width>inspector.x && single.y<inspector.y+inspector.height && single.y+single.height>inspector.y).toBe(false);expect(await source(page)).toBe(before);
});

test('Fit selection can frame distant free nodes without any canvas panels',async({page,server})=>{
 await page.setViewportSize({width:1280,height:800});await page.goto(server.origin+'/standalone.html');await page.evaluate(()=>localStorage.clear());await page.goto(server.origin+'/workbench.html');const raw=fixture(),d=raw.page.sections[0].diagram;delete d.panels;d.layouts[0].sectionLayout.default=[{x:0,y:0,w:12,h:12}];delete d.layouts[0].exploreLayout;d.floats[0].x=-20000;d.floats[1].x=20000;await paste(page,JSON.stringify(raw));await closeTools(page);await page.evaluate(()=>document.fonts.ready);const before=await source(page);
 await node(page).focus();await page.keyboard.press('Enter');await page.locator('[data-dv-node=b]').focus();await page.keyboard.press('Shift+Enter');await page.locator('#workspace-fit-selection').click();for(const id of ['a','b'])await expect.poll(async()=>{const board=await page.locator('.explore-board').boundingBox(),r=await page.locator('[data-dv-node='+id+']').boundingBox();return r.x>=board.x && r.x+r.width<=board.x+board.width && r.y>=board.y && r.y+r.height<=board.y+board.height;}).toBe(true);expect(await source(page)).toBe(before);await expect(page.locator('#undo-builder')).toBeDisabled();
 const manual=await page.locator('.explore-board').evaluate(board=>{document.querySelector('#workspace-fit-selection').click();board.dispatchEvent(new WheelEvent('wheel',{deltaY:1,bubbles:true,cancelable:true}));board.scrollLeft+=61;return board.scrollLeft;});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));expect(await page.locator('.explore-board').evaluate(board=>board.scrollLeft)).toBe(manual);
});
