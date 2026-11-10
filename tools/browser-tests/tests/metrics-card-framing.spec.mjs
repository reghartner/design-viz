/* #1255 item 26: in desktop Preview metrics layout at the default Workbench framing, an
   automatically placed card below its edge fits inside the section's diagram box.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| F26 | Turning on Preview metrics layout at 1680×1100 (Auto view) grows the diagram frame so the whole card, and its bottom corner handles, are visible without scrolling. | one bound connection, card below, one row of nodes | the card box lies inside every clipping ancestor of the diagram SVG (within 1px), with no scrolling; the bottom-right handle is the element under its centre | cards clipped by the diagram box until the author scrolls |
*/
import {test,expect,paste,prepareEditorSurface} from '../helpers/test.mjs';
const binding={kind:'call',signals:{rate:{grafana:'up',unit:'req/h'},errors:{grafana:'errors',unit:'req/h'}},card:{side:'below',offset:0}};
const raw={page:{title:'Metrics framing',sections:[{id:'flow',heading:'Delivery',diagram:{view:'ambient',nodes:{a:{title:'Sender'},b:{title:'Receiver'},c:{title:'Unbound'}},rows:[['a','b','c']],
  edges:[{from:'a',to:'b',label:'Delivery',telemetry:binding},{from:'b',to:'c',label:'Unbound delivery'}],panels:[{id:'status',type:'live-status'}]}}]}};

test('F26 desktop Preview metrics layout grows the diagram box to fit an automatically placed card',async({page,server})=>{
  await page.setViewportSize({width:1680,height:1100});
  await page.goto(server.origin+'/lifetime/index.html');await paste(page,JSON.stringify(raw,null,2));await prepareEditorSurface(page);
  await page.getByRole('checkbox',{name:'Preview metrics layout',exact:true}).check();
  const card=page.locator('#docview .dv-metrics-card');await expect(card).toHaveCount(1);
  // Every clipping ancestor of the diagram SVG (any overflow other than visible) is intersected:
  // the innermost one can be taller than the section's diagram box that actually cuts the card off.
  const fit=()=>card.evaluate(el=>{
    const box=el.querySelector('.dv-metrics-card-box').getBoundingClientRect(),clips=[];
    let view={top:-Infinity,bottom:Infinity,left:-Infinity,right:Infinity};
    for(let a=el.ownerSVGElement.parentElement;a && a!==document.body;a=a.parentElement){
      const st=getComputedStyle(a);if(st.overflowX==='visible' && st.overflowY==='visible')continue;
      const r=a.getBoundingClientRect();clips.push({cls:String(a.className).slice(0,40),top:Math.round(r.top),bottom:Math.round(r.bottom),scrollTop:a.scrollTop});
      view={top:Math.max(view.top,r.top),bottom:Math.min(view.bottom,r.bottom),left:Math.max(view.left,r.left),right:Math.min(view.right,r.right)};
    }
    const se=el.querySelector('.dv-metrics-resize[data-corner="se"] .dv-metrics-resize-hit').getBoundingClientRect();
    const top=document.elementFromPoint(se.x+se.width/2,se.y+se.height/2);
    return {inside:box.top>=view.top-1 && box.bottom<=view.bottom+1 && box.left>=view.left-1 && box.right<=view.right+1,scrolled:clips.some(c=>c.scrollTop>0),
      handle:!!(top && top.closest && top.closest('.dv-metrics-resize[data-corner="se"]')),box:[Math.round(box.top),Math.round(box.bottom)],clips};
  });
  await expect.poll(async()=>{const f=await fit();return f.inside?'inside':JSON.stringify(f);},'the card lies inside the diagram box').toBe('inside');
  const f=await fit();expect(f.handle,'the bottom-right handle is reachable ('+JSON.stringify(f)+')').toBe(true);
});
