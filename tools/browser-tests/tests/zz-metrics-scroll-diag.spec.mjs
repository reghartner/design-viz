/* TEMPORARY #1228 diagnostic (round 2): Card width commit variants. Not for merge. */
import {test,expect,paste,prepareEditorSurface} from '../helpers/test.mjs';
const binding={kind:'call',signals:{rate:{grafana:'up',unit:'req/h'},errors:{grafana:'errors',unit:'req/h'}},card:{side:'below',offset:0}};
const raw={page:{title:'Metrics authoring',sections:[{id:'flow',heading:'Delivery',diagram:{nodes:{a:{title:'Sender'},b:{title:'Receiver'},c:{title:'Unbound'}},rows:[['a','b','c']],edges:[{from:'a',to:'b',label:'delivery',telemetry:binding},{from:'b',to:'c',label:'Unbound delivery'}],panels:[{id:'status',type:'live-status'}]}}]}};
function imports(){
 const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
 const provider=spec('provider',{nodes:{a:{title:'Provider A'},b:{title:'Provider B'}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'Provider delivery',telemetry:binding}],topologyExports:{core:{nodes:['a','b'],edges:['a->b']}}});
 const consumer=spec('consumer',{nodes:{x:{title:'Local X'},y:{title:'Local Y'}},rows:[['x','y']],edges:[{from:'x',to:'y',label:'Local'}],topologyImports:[{spec:'provider',export:'core',as:'direct',position:{x:50,y:250}}]});
 return {provider,consumer};
}
const metric=page=>page.evaluate(()=>{const g=document.getElementById('guide'),w=[...g.querySelectorAll('.frow')].find(r=>r.querySelector('.flab')?.textContent==='Card width');
  const a=document.activeElement;return {top:g.scrollTop,widthAt:w?Math.round(w.getBoundingClientRect().top-g.getBoundingClientRect().top):null,active:a && (a.getAttribute('aria-label') || a.id || a.tagName),sh:g.scrollHeight};});
for(const variant of ['inherited-card-enter','inherited-label-enter','local-click-title','local-click-canvas','local-position-enter','local-input-blur-tab']){
  test('diag2 '+variant,async({page,server})=>{
    await page.setViewportSize({width:1440,height:900});
    const inherited=variant.startsWith('inherited');
    const spec=JSON.parse(JSON.stringify(raw));if(variant==='local-position-enter')spec.page.sections[0].diagram.edges[0].telemetry.card.position={x:40,y:80};
    await page.goto(server.origin+'/lifetime/index.html');await paste(page,JSON.stringify(spec,null,2));await prepareEditorSurface(page);
    if(inherited){const {provider,consumer}=imports();await page.evaluate(({provider,consumer})=>{window.ctx={version:1,id:'consumer',specs:[provider,consumer]};window.__editorTest.builder.loadText(JSON.stringify(consumer),window.ctx);},{provider,consumer});}
    const guide=page.locator('#guide'),toggle=page.getByRole('checkbox',{name:'Preview metrics layout',exact:true});
    if(variant!=='inherited-label-enter' && variant!=='local-click-title' && variant!=='local-click-canvas')await toggle.check();
    if(variant==='inherited-card-enter')await page.locator('#docview .dv-metrics-card[data-metrics-card="direct::a->direct::b"]').click();
    else if(variant==='inherited-label-enter')await page.locator('#docview text.lbl').filter({hasText:'Provider delivery'}).first().click();
    else if(variant==='local-position-enter')await page.locator('#docview .dv-metrics-card').click();
    else await page.locator('#docview text.lbl[data-dv-edge="0"]').click();
    await page.locator('#editor-tab-inspect').click();
    const control=guide.getByLabel('Card width',{exact:true});await expect(control).toHaveCount(1);
    await control.evaluate(el=>{const g=document.getElementById('guide');g.scrollTop+=el.getBoundingClientRect().top-g.getBoundingClientRect().top-g.clientHeight/2;});
    const before=await metric(page);
    await control.click();await control.fill('300');
    if(variant==='local-click-title')await guide.getByLabel('Card title',{exact:true}).click();
    else if(variant==='local-click-canvas')await page.locator('#docview text.lbl[data-dv-edge="0"]').click();
    else if(variant==='local-input-blur-tab')await control.press('Tab');
    else await control.press('Enter');
    await page.waitForTimeout(800);
    const after=await metric(page),src=await page.locator('#src').inputValue();
    expect(JSON.stringify({variant,before,after,width300:src.includes('"width": 300')})).toBe('DIAG');
  });
}
