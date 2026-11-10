/* #1255 item 26: in desktop Preview metrics layout at the default Workbench framing, an
   automatically placed card below its edge fits inside the section's diagram box.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| F26 | Turning on Preview metrics layout at 1680×1100 (Auto view) grows the diagram frame so the whole card, and its bottom corner handles, are visible without scrolling. | one bound connection, card below, one row of nodes | the card box lies inside the nearest clipping ancestor of the diagram SVG (within 1px); that ancestor's scrollTop is 0; the bottom-right handle is the element under its centre | cards clipped by the diagram box until the author scrolls |
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
  const fit=()=>card.evaluate(el=>{
    const box=el.querySelector('.dv-metrics-card-box').getBoundingClientRect();let clip=el.ownerSVGElement;
    for(clip=clip.parentElement;clip && getComputedStyle(clip).overflowY==='visible' && getComputedStyle(clip).overflowX==='visible';clip=clip.parentElement);
    const r=clip.getBoundingClientRect(),se=el.querySelector('.dv-metrics-resize[data-corner="se"] .dv-metrics-resize-hit').getBoundingClientRect();
    const top=document.elementFromPoint(se.x+se.width/2,Math.min(se.y+se.height/2,r.bottom-1));
    return {inside:box.top>=r.top-1 && box.bottom<=r.bottom+1 && box.left>=r.left-1 && box.right<=r.right+1,scrollTop:clip.scrollTop,
      handle:!!(top && top.closest && top.closest('.dv-metrics-resize[data-corner="se"]')),box:[Math.round(box.top),Math.round(box.bottom)],clip:[Math.round(r.top),Math.round(r.bottom),clip.className]};
  });
  await expect.poll(async()=>{const f=await fit();return f.inside?'inside':JSON.stringify(f);},'the card lies inside the diagram box').toBe('inside');
  const f=await fit();expect(f.scrollTop,'no scrolling was needed').toBe(0);expect(f.handle,'the bottom-right handle is reachable').toBe(true);
});
