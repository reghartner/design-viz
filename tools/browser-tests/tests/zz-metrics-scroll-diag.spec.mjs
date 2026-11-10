/* TEMPORARY #1228 diagnostic: records which code moves the Inspector scroll after a metrics edit. Not for merge. */
import {test,expect,paste,prepareEditorSurface} from '../helpers/test.mjs';
const binding={kind:'call',signals:{rate:{grafana:'up',unit:'req/h'},errors:{grafana:'errors',unit:'req/h'}},card:{side:'below',offset:0}};
const raw={page:{title:'Metrics authoring',sections:[{id:'flow',heading:'Delivery',diagram:{nodes:{a:{title:'Sender'},b:{title:'Receiver'},c:{title:'Unbound'}},rows:[['a','b','c']],edges:[{from:'a',to:'b',label:'delivery',telemetry:binding},{from:'b',to:'c',label:'Unbound delivery'}],panels:[{id:'status',type:'live-status'}]}}]}};
async function instrument(page){
  await page.evaluate(()=>{
    const log=window.__scrollLog=[];const guide=document.getElementById('guide');
    const d=Object.getOwnPropertyDescriptor(Element.prototype,'scrollTop');
    Object.defineProperty(Element.prototype,'scrollTop',{configurable:true,get:d.get,set(v){if(this.id==='guide' || (this.contains && this.contains(guide)))log.push({set:v,el:this.id || this.className,before:d.get.call(this),stack:new Error().stack.split('\n').slice(2,7).map(s=>s.trim()).join(' | ')});d.set.call(this,v);}});
    const st=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(o){log.push({scrollIntoView:this.id || this.className || this.tagName,stack:new Error().stack.split('\n').slice(2,6).map(s=>s.trim()).join(' | ')});return st.call(this,o);};
    const fc=HTMLElement.prototype.focus;HTMLElement.prototype.focus=function(o){if(!(o && o.preventScroll))log.push({focusNoPrevent:this.id || this.getAttribute('aria-label') || this.tagName,stack:new Error().stack.split('\n').slice(2,6).map(s=>s.trim()).join(' | ')});return fc.call(this,o);};
    document.addEventListener('scroll',ev=>{const t=ev.target;if(t===document || !t.contains)return;if(t===guide || t.contains(guide))log.push({scroll:t.id || t.className,top:t.scrollTop,active:document.activeElement && (document.activeElement.getAttribute('aria-label') || document.activeElement.id || document.activeElement.tagName)});},true);
    const ih=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');
    Object.defineProperty(Element.prototype,'innerHTML',{configurable:true,get:ih.get,set(v){if(this===guide)log.push({clear:true,top:guide.scrollTop,stack:new Error().stack.split('\n').slice(2,6).map(s=>s.trim()).join(' | ')});ih.set.call(this,v);}});
  });
}
async function state(page){return page.evaluate(()=>{const g=document.getElementById('guide');const chain=[];for(let el=g;el;el=el.parentElement){if(el.scrollHeight>el.clientHeight+1)chain.push({el:el.id || el.className,top:el.scrollTop,sh:el.scrollHeight,ch:el.clientHeight,ov:getComputedStyle(el).overflowY});}return {chain,active:document.activeElement && (document.activeElement.getAttribute('aria-label') || document.activeElement.id)};});}
for(const variant of ['label-enter','label-tab','card-preview-enter','unit-enter']){
  test('diag '+variant,async({page,server})=>{
    await page.setViewportSize({width:1440,height:900});
    await page.goto(server.origin+(variant.startsWith('card')?'/lifetime/index.html':'/workbench.html'));await paste(page,JSON.stringify(raw,null,2));await prepareEditorSurface(page);
    const guide=page.locator('#guide');
    if(variant.startsWith('card')){await page.getByRole('checkbox',{name:'Preview metrics layout',exact:true}).check();await page.locator('#docview .dv-metrics-card').click();}
    else await page.locator('#docview text.lbl[data-dv-edge="0"]').click();
    await page.locator('#editor-tab-inspect').click();
    const label=variant==='unit-enter'?'errors unit':'Card width';
    const control=guide.getByLabel(label,{exact:true});await expect(control).toHaveCount(1);
    await instrument(page);
    await control.evaluate(el=>el.scrollIntoView({block:'center'}));
    const before=await state(page);
    await control.click();await control.fill(variant==='unit-enter'?'msgs':'300');
    await control.press(variant==='label-tab'?'Tab':'Enter');
    await page.waitForTimeout(800);
    const after=await state(page),log=await page.evaluate(()=>window.__scrollLog);
    const src=JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.edges[0].telemetry;
    expect(JSON.stringify({variant,before,after,src,log},null,1)).toBe('DIAG');
  });
}
