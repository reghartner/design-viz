import {expect,paste,closeTools,arrangeChapter} from './test.mjs';
import contracts from '../../../tests/helpers/company-panel-contracts.cjs';
const {browserSpec,message}=contracts;
const settled=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
export async function drag(page,handle,dx,dy){
 await handle.scrollIntoViewIfNeeded();const box=await handle.boundingBox();expect(box).not.toBeNull();
 const x=box.x+box.width/2,y=box.y+box.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:12});await page.mouse.up();await settled(page);
}
export async function openPanel(page,url,entry,sample,placement='floating'){
 await page.setViewportSize({width:1440,height:1000});await page.goto(url);await paste(page,JSON.stringify(browserSpec(entry,sample,placement)));await closeTools(page);await page.evaluate(()=>document.fonts.ready);await settled(page);
}
// Measure renderer-owned descendants; pbody/window/title geometry alone cannot
// prove a renderer responds to allocation. Labels/icons need not scale.
export async function contentGeometry(body){
 return body.evaluate(el=>Array.from(el.children).filter(child=>child.getBoundingClientRect().width>0 && child.getBoundingClientRect().height>0).map(child=>{
  const r=child.getBoundingClientRect();return {width:r.width,height:r.height};
 }));
}
export function assertResponsive(entry,before,after){
 expect(before.length,message(entry,'visible-content','render useful initial/example content inside .pbody')).toBeGreaterThan(0);
 expect(after.length,message(entry,'visible-content','keep the panel content mounted while resizing')).toBeGreaterThan(0);
 expect(after.some((rect,i)=>before[i] && Math.abs(rect.width-before[i].width)>8),message(entry,'responsive-content','let a renderer-owned root follow available width (width:100%, min-width:0), or use a responsive scrolling wrapper; fixed labels/icons may retain their size')).toBe(true);
}
export async function assertReachable(entry,body){
 const failures=await body.evaluate(el=>{
  const errors=[];
  function excluded(node){
   for(let current=node;current;current=current.parentElement){
    const style=getComputedStyle(current);
    if(current.getAttribute('aria-hidden')==='true')return true;
    if(style.position==='absolute' && current.clientWidth<=1 && current.clientHeight<=1 && (style.clipPath!=='none' || style.clip!=='auto'))return true;
    if(current===el)break;
   }
   return false;
  }
  // scrollWidth includes offscreen decoration. Attribute clipping to painted
  // text/media instead, clipping each rect through intervening scrollports so
  // content reachable in an inner scroller is not blamed on its outer parent.
  function meaningfulOverflow(container,axis){
   const bounds=container.getBoundingClientRect(),scale=axis==='x'?bounds.width/container.offsetWidth:bounds.height/container.offsetHeight;
   const start=axis==='x'?'left':'top',end=axis==='x'?'right':'bottom',overflow=axis==='x'?'overflowX':'overflowY';
   const low=bounds[start]+(axis==='x'?container.clientLeft:container.clientTop)*scale;
   const high=low+(axis==='x'?container.clientWidth:container.clientHeight)*scale;
   function clipped(rect,owner){
    let from=rect[start],to=rect[end];
    for(let current=owner;current && current!==container;current=current.parentElement){
     const style=getComputedStyle(current);
     if(axis==='x' && style.textOverflow==='ellipsis')return false;
     if(['auto','scroll','hidden','clip'].includes(style[overflow])){
      const r=current.getBoundingClientRect();from=Math.max(from,r[start]);to=Math.min(to,r[end]);
     }
    }
    return to>from && (from<low-4 || to>high+4);
   }
   const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT);
   for(let text=walker.nextNode();text;text=walker.nextNode()){
    if(!text.textContent.trim() || excluded(text.parentElement))continue;
    const range=document.createRange();range.selectNodeContents(text);
    if(Array.from(range.getClientRects()).some(rect=>clipped(rect,text.parentElement)))return true;
   }
   return Array.from(container.querySelectorAll('svg,img,canvas,video')).some(media=>!excluded(media) && clipped(media.getBoundingClientRect(),media.parentElement));
  }
  for(const node of [el,...el.querySelectorAll('*')]){
   if(!(node instanceof HTMLElement) || !node.getClientRects().length || !node.clientWidth || !node.clientHeight)continue;
   // Check actual text/media containers, not decorative empty layers or SVG paths.
   if(!node.textContent.trim() && !node.querySelector('svg,img,canvas,video'))continue;
   const style=getComputedStyle(node);
   // Screen-reader-only captions and explicitly decorative layers intentionally
   // clip. Ellipsis is a deliberate one-line text policy, not a scroll region.
   if(excluded(node))continue;
   for(const [axis,client,scroll,offset,overflow] of [['x','clientWidth','scrollWidth','scrollLeft','overflowX'],['y','clientHeight','scrollHeight','scrollTop','overflowY']]){
    if(node[scroll]-node[client]<=4 || axis==='x' && style.textOverflow==='ellipsis')continue;
    const label=node.tagName.toLowerCase()+'.'+String(node.className).trim().replaceAll(' ','.');
    if(['hidden','clip'].includes(style[overflow]) && meaningfulOverflow(node,axis))errors.push(label+' clips '+axis+' content ('+node[scroll]+' > '+node[client]+')');
    if(['auto','scroll'].includes(style[overflow])){
     const saved=node[offset];node[offset]=node[scroll];
     if(node[offset]<node[scroll]-node[client]-2)errors.push(label+' cannot scroll to the '+axis+' end');
     node[offset]=saved;
    }
   }
  }
  return errors;
 });
 expect(failures,message(entry,'reachable-overflow','remove clipping on content regions; use min-width:0/min-height:0 in flex layouts and overflow:auto on the region that must scroll')).toEqual([]);
}
async function standardGeometry(tile,body){
 return {tile:(await tile.boundingBox()).height,card:(await tile.locator('.pwidget').boundingBox()).height,content:await contentGeometry(body)};
}
function assertStandardHeight(entry,before,after,direction){
 const tip='let Standard tiles and their cards follow the grid allocation; remove fixed height overrides. Intrinsic content may stay short or use reachable scrolling';
 for(const owner of ['tile','card'])expect((after[owner]-before[owner])*direction,message(entry,'standard-height-'+owner,tip)).toBeGreaterThan(8);
 expect(after.content.length,message(entry,'standard-height-content','keep visible renderer content through vertical resize')).toBeGreaterThan(0);
 // Intrinsic text/artwork can stay the same height. Stretching content should
 // follow the allocation, while overflow is checked separately for reachability.
 after.content.forEach((rect,i)=>{
  if(before.content[i])expect((rect.height-before.content[i].height)*direction,message(entry,'standard-height-content',tip)).toBeGreaterThanOrEqual(-4);
 });
}
export async function assertMovement(page,entry,win){
 const grip=win.locator('.explore-window-grip');
 for(const [axis,dx,dy,key] of [['x',55,0,'ArrowRight'],['y',0,55,'ArrowDown']]){
  const before=await win.boundingBox();await drag(page,grip,dx,dy);const after=await win.boundingBox();
  expect(after[axis]-before[axis],message(entry,'pointer-move-'+axis,'allow the shared grip to update both x and y; remove CSS position overrides and pointer handlers that swallow vertical movement')).toBeGreaterThan(15);
  const prior=await win.boundingBox();await grip.press(key);await settled(page);const nudged=await win.boundingBox();
  expect(nudged[axis]-prior[axis],message(entry,'keyboard-move-'+axis,'preserve the shared grip arrow-key handling')).toBeGreaterThan(1);
 }
}
async function fixedVisual(win,entry){
 const selector=entry.definition.layout?.sectionSizing?.contentSelector;
 const body=win.locator('.pbody');
 const candidates=selector?body.locator(selector):body.locator('svg,img,canvas,video');
 const target=await candidates.count()?candidates.first():body.locator(':scope > *').first();
 const box=await target.boundingBox();expect(box,message(entry,'fixed-aspect visual','provide visible artwork in the sample')).not.toBeNull();return box.width/box.height;
}
export async function runBrowserContract(page,url,entry,sample,placement='floating'){
 await openPanel(page,url,entry,sample,placement);
 const id=sample.panelId,standard=page.locator('[data-layout-key="panel:'+id+'"] .pbody');
 await expect(standard).toBeVisible();const wide=await contentGeometry(standard);await assertReachable(entry,standard);
 await page.setViewportSize({width:1100,height:900});await settled(page);const narrow=await contentGeometry(standard);assertResponsive(entry,wide,narrow);await assertReachable(entry,standard);
 await page.setViewportSize({width:1440,height:1000});await settled(page);
 await arrangeChapter(page);
 const hide=page.getByRole('button',{name:'Hide arrangement controls',exact:true});if(await hide.isVisible())await hide.click();
 const standardResize=page.locator('[data-layout-key="panel:'+id+'"] .section-tile-resize'),standardBefore=await contentGeometry(standard);
 for(let i=0;i<4;i++)await standardResize.press('ArrowLeft');
 await settled(page);assertResponsive(entry,standardBefore,await contentGeometry(standard));
 const tile=page.locator('[data-layout-key="panel:'+id+'"]'),tall=await standardGeometry(tile,standard);
 for(let i=0;i<4;i++)await standardResize.press('ArrowUp');await settled(page);
 const short=await standardGeometry(tile,standard);assertStandardHeight(entry,tall,short,-1);await assertReachable(entry,standard);
 for(let i=0;i<4;i++)await standardResize.press('ArrowDown');await settled(page);
 assertStandardHeight(entry,short,await standardGeometry(tile,standard),1);await assertReachable(entry,standard);
 for(let i=0;i<4;i++)await standardResize.press('ArrowRight');await settled(page);
 await page.getByRole('button',{name:'Explore',exact:true}).click();await settled(page);
 const win=page.locator('[data-explore-panel="'+id+'"]'),body=win.locator('.pbody'),resize=win.locator('.explore-window-resize');
 await expect(win).toBeVisible();
 // Canvas grips/resize controls become available after object selection.
 if(placement==='canvas')await win.click({position:{x:4,y:4}});
 await assertMovement(page,entry,win);
 const policy=placement==='canvas'?entry.definition.layout?.canvasSizing:null;
 const aspect=policy?.mode==='fixed-aspect'?await fixedVisual(win,entry):null;
 const initial=await contentGeometry(body),initialBox=await win.boundingBox();
 await drag(page,resize,100,0);const larger=await contentGeometry(body),largerBox=await win.boundingBox();
 expect(largerBox.width-initialBox.width,message(entry,'resize-width','preserve the shared resize handle and avoid fixed width overrides')).toBeGreaterThan(15);assertResponsive(entry,initial,larger);await assertReachable(entry,body);
 await drag(page,resize,0,60);const vertical=await win.boundingBox();
 expect(policy?.resizeAxis==='width'?vertical.width-largerBox.width:vertical.height-largerBox.height,message(entry,'resize-vertical-input','vertical resize must change height, or canonical width when canvasSizing.resizeAxis is width')).toBeGreaterThan(10);
 await drag(page,resize,-170,-130);assertResponsive(entry,larger,await contentGeometry(body));await assertReachable(entry,body);
 if(aspect!==null){const ratio=await fixedVisual(win,entry);expect(Math.abs(ratio-aspect)/aspect,message(entry,'fixed-aspect','preserve artwork proportions with an SVG viewBox, aspect-ratio or a fitted renderer')).toBeLessThan(.06);}
 if(policy){
  const size=await win.evaluate(el=>({height:parseFloat(el.style.getPropertyValue('--float-h')),intrinsic:Math.ceil(el.querySelector('.pwidget').scrollHeight)}));
  const expected=Math.max(72,Math.min(size.intrinsic,Math.max(72,policy.maxHeight??10000)));
  expect(Math.abs(size.height-expected),message(entry,'content-fit-height','let the card report intrinsic scrollHeight; clean up/reconnect ResizeObserver in mounted lifecycle if the renderer owns one')).toBeLessThanOrEqual(3);
 }
}
