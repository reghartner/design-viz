import {test,expect,pastePage,closeTools} from '../helpers/test.mjs';

const fixture=presentation=>({page:{title:'Expand selection spacing',sections:[{heading:'Spacing',diagram:{autoplay:false,
  nodes:{a:{title:'Alpha'},b:{title:'Beta with a wider title'},c:{title:'Gamma'}},rows:[[]],
  floats:[{id:'a',x:180,y:120},{id:'b',x:460,y:300},{id:'c',x:780,y:520}],edges:[{from:'a',to:'b'},{from:'b',to:'c'}],
  panels:presentation==='explore'?[{id:'p',type:'state',title:'Canvas panel',states:['Ready'],initial:{state:'Ready'}}]:[],
  layouts:[{id:'view',name:'View',presentation,sectionLayout:{default:[{x:0,y:0,w:12,h:12}]},...(presentation==='explore'?{exploreLayout:{panelPlacement:'canvas',canvas:{panels:[{panel:'p',x:1040,y:160,w:220,h:180}]}}}:{})}]}}]}});
const node=(page,id)=>page.locator('[data-dv-node='+id+']');
const panel=page=>page.locator('[data-explore-panel=p]');
const menu=page=>page.getByRole('menu',{name:'Object actions'});
const source=page=>page.locator('#src').inputValue();
async function open(page,server,presentation){
  await page.setViewportSize({width:1440,height:900});await page.goto(server.origin+'/standalone.html');await page.evaluate(()=>localStorage.clear());
  await page.goto(server.origin+'/workbench.html');await pastePage(page,JSON.stringify(fixture(presentation)));await closeTools(page);await page.evaluate(()=>document.fonts.ready);
  if(presentation==='explore')await page.locator('#docview>.explore-navigation').getByRole('button',{name:/^Fit(?: canvas| diagram)?$/,exact:true}).click();
  await expect(node(page,'a')).toBeVisible();
}
async function selectNodes(page){await node(page,'a').click();await node(page,'b').click({modifiers:['Shift']});await node(page,'c').click({modifiers:['Shift']});await expect(page.locator('.dv-sel[data-dv-node]')).toHaveCount(3);}
async function selectMixed(page){await node(page,'a').click();await node(page,'b').click({modifiers:['Shift']});await panel(page).click({modifiers:['Shift'],position:{x:5,y:5}});await expect(page.locator('.dv-sel')).toHaveCount(3);}
async function geometry(page,ids){return page.evaluate(ids=>{
  const svg=document.querySelector('.boardcanvas>svg'),inverse=svg.getScreenCTM().inverse();
  return Object.fromEntries(ids.map(id=>{const owner=id==='p'?document.querySelector('[data-explore-panel=p]'):document.querySelector('[data-dv-node='+id+']'),el=id==='p'?owner:owner.querySelector('.card'),r=el.getBoundingClientRect(),a=new DOMPoint(r.left,r.top).matrixTransform(inverse),b=new DOMPoint(r.right,r.bottom).matrixTransform(inverse);return [id,{x:(a.x+b.x)/2,y:(a.y+b.y)/2,w:b.x-a.x,h:b.y-a.y}];}));
 },ids);}
function expectExpanded(before,after,ids,axis){
 const order=ids.toSorted((a,b)=>before[a][axis]-before[b][axis]);
 order.forEach((id,index)=>{expect(after[id][axis]-before[id][axis],id+' '+axis).toBeCloseTo(index*50,1);const other=axis==='x'?'y':'x';expect(after[id][other],id+' '+other).toBeCloseTo(before[id][other],1);expect(after[id].w,id+' width').toBeCloseTo(before[id].w,1);expect(after[id].h,id+' height').toBeCloseTo(before[id].h,1);});
}
async function history(page,before,after){await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);}

test('Standard expands selected columns from the object menu and rows from Inspector with one Undo each',async({page,server},testInfo)=>{
 await open(page,server,'standard');await selectNodes(page);const ids=['a','b','c'],original=await source(page),before=await geometry(page,ids);
 await node(page,'b').click({button:'right'});const column=menu(page).getByRole('menuitem',{name:'Increase column spacing',exact:true});await expect(column).not.toHaveAttribute('aria-disabled','true');await column.click();
 const columns=await source(page),afterColumns=await geometry(page,ids);expectExpanded(before,afterColumns,ids,'x');await expect(page.locator('.dv-sel[data-dv-node]')).toHaveCount(3);await history(page,original,columns);await selectNodes(page);
 await page.locator('#editor-tab-inspect').click();const beforeRows=await geometry(page,ids),row=page.locator('#guide').getByRole('button',{name:'Increase row spacing',exact:true});await expect(row).toBeEnabled();await row.click();
 const rows=await source(page),afterRows=await geometry(page,ids);expectExpanded(beforeRows,afterRows,ids,'y');await expect(page.locator('.dv-sel[data-dv-node]')).toHaveCount(3);await testInfo.attach('Standard expanded rows and columns',{body:await page.screenshot(),contentType:'image/png'});await history(page,columns,rows);
});

test('Explore expands mixed node and panel lanes after zoom and disables stale Inspector actions',async({page,server},testInfo)=>{
 await open(page,server,'explore');await selectMixed(page);const ids=['a','b','p'];
 await page.locator('#docview>.explore-navigation').getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) out$/,exact:true}).click();
 await page.locator('#editor-tab-inspect').click();const before=await geometry(page,ids),original=await source(page),column=page.locator('#guide').getByRole('button',{name:'Increase column spacing',exact:true});await expect(column).toBeEnabled();await column.click();
 const changed=await source(page),after=await geometry(page,ids);expectExpanded(before,after,ids,'x');const p=JSON.parse(changed).page.sections[0].diagram.layouts[0].exploreLayout.canvas.panels[0];expect(p.w).toBe(220);expect(p.h).toBe(180);await expect(page.locator('.dv-sel')).toHaveCount(3);await testInfo.attach('Explore expanded mixed columns',{body:await page.screenshot(),contentType:'image/png'});await history(page,original,changed);await selectMixed(page);
 await node(page,'a').click({button:'right'});const row=menu(page).getByRole('menuitem',{name:'Increase row spacing',exact:true});await expect(row).not.toHaveAttribute('aria-disabled','true');await page.keyboard.press('Escape');
 const handwritten=changed.replace('Expand selection spacing','Handwritten spacing');await page.evaluate(text=>{const src=document.querySelector('#src');src.value=text;src.dispatchEvent(new Event('input',{bubbles:true}));},handwritten);
 await expect(column).toBeDisabled();await expect(column).toHaveAttribute('title',/Render and select the objects again/);await expect(page.locator('#src')).toHaveValue(handwritten);
});
