import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,closeTools} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

function fixture(placement){
 const items=[{x:0,y:0,w:8,h:12},{controls:'steps',x:0,y:12,w:8,h:6},
  {panel:'status',x:8,y:0,w:4,h:6},{panel:'detail',x:8,y:6,w:4,h:6},{panel:'excluded',x:8,y:12,w:4,h:6,hidden:true}];
 return {page:{title:'Explore path panel ownership',sections:[{id:'paths',heading:'Delivery',diagram:{view:'step',autoplay:false,
  nodes:{sender:{title:'Sender'},receiver:{title:'Receiver'}},rows:[['sender','receiver']],edges:[{from:'sender',to:'receiver',kind:'int'}],
  panels:['status','detail','excluded'].map(id=>({id,type:'state',title:id,states:['Ready','Delivered','Failed'],initial:{state:'Ready'}})),
  steps:[{id:'start',text:'Ready to send',nodes:['sender']},
   {id:'delivered',text:'Delivery succeeded',edge:'sender->receiver',panels:{status:{state:'Delivered'}},panelVisibility:{detail:false}},
   {id:'failed',text:'Delivery failed',nodes:['receiver'],panels:{status:{state:'Failed'}},panelVisibility:{status:false,detail:true}},
   {id:'recover',text:'Recovered on alternate path',nodes:['receiver'],panelVisibility:{status:true,detail:true}}],
  paths:[{id:'happy',label:'Happy path',steps:['start','delivered']},{id:'alternate',label:'Alternate path',steps:['start','failed','recover']}],
  defaultLayout:'explore',layouts:[{id:'home',name:'Home',presentation:'standard',sectionLayout:{default:items}},
   {id:'explore',name:'Explore',presentation:'explore',sectionLayout:{default:items},exploreLayout:{panelPlacement:placement==='mixed'?'canvas':placement,
    ...(placement==='mixed'?{panelPlacements:[{panel:'detail',placement:'floating'}],controlsPlacement:'canvas'}:{}),
    canvas:{controls:{x:0,y:320,w:1100,h:220},panels:[{panel:'status',x:0,y:140,w:250,h:140},{panel:'detail',x:290,y:140,w:250,h:140}]}}}]
 } }]}};
}
const section=page=>page.locator('#section-paths');
const panel=(page,id)=>section(page).locator('[data-explore-panel="'+id+'"]');
async function evidence(page,info,name){
 await page.screenshot({path:info.outputPath(name+'.png')});
 await info.attach(name,{path:info.outputPath(name+'.png'),contentType:'image/png'});
 const dom=JSON.stringify(await section(page).evaluate(el=>({
  cards:[...el.querySelectorAll('.pwidget')].map(card=>({index:card.dataset.dvPanel,connected:card.isConnected,classes:card.className,visible:!!card.getClientRects().length})),
  windows:[...el.querySelectorAll('[data-explore-panel]')].map(win=>({id:win.dataset.explorePanel,hidden:win.hidden,visible:!!win.getClientRects().length,parent:win.parentElement.className})),
  layers:el.querySelectorAll('.explore-canvas-objects').length,graph:el.querySelectorAll('.boardcanvas>svg').length,
  selected:[...el.querySelectorAll('.schip[aria-current="true"]')].map(chip=>({path:chip.dataset.stepPath,source:chip.dataset.stepSource}))
 })),null,2);
 await writeFile(info.outputPath(name+'-dom.json'),dom);
 await info.attach(name+'-dom',{path:info.outputPath(name+'-dom.json'),contentType:'application/json'});
}
for(const host of ['standalone','workbench','native'])for(const placement of ['canvas','floating','mixed'])test(host+' Explore '+placement+' panels survive alternate chips, path changes and Home',async({page,server},info)=>{
 const raw=fixture(placement);
 if(host==='standalone'){
  const input=path.join(server.root,'path-panels-'+placement+'.json'),output=path.join(server.root,'path-panels-'+placement+'.html');
  await writeFile(input,JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  await page.goto(server.origin+'/'+path.basename(output));
 }else if(host==='native'){
  await writeFile(path.join(server.root,'path-panels-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'path-panels-native.html'),'<div id=host></div><script type=module>import {mountNativeViewer} from "./path-panels-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/path-panels-native.html');await page.waitForFunction(()=>!!window.mount);
  await page.evaluate(raw=>{window.viewer=mount(document.querySelector('#host'),raw,{skin:'pastel'});},raw);
 }else{await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw,null,2));await closeTools(page);}
 const sec=section(page),chip=source=>sec.locator('.schip[data-step-source="'+source+'"]');
 await expect(panel(page,'status')).toBeVisible();await expect(panel(page,'detail')).toBeVisible();await expect(panel(page,'excluded')).toBeHidden();
 // Retain actual identities to distinguish hidden panels from discarded DOM.
 await sec.evaluate(el=>{el._panelCards=[...el.querySelectorAll('.pwidget')];el._objectLayer=el.querySelector('.explore-canvas-objects');});
 await evidence(page,info,host+'-'+placement+'-before');
 await chip(2).click();await expect(sec.locator('.step-text')).toHaveText('Delivery failed');
 await evidence(page,info,host+'-'+placement+'-alternate');
 expect(await sec.evaluate(el=>el._panelCards.every(card=>card.isConnected))).toBe(true);
 expect(await sec.evaluate(el=>el._objectLayer.isConnected)).toBe(true);
 await expect(panel(page,'status')).toBeHidden();await expect(panel(page,'detail')).toBeVisible();await expect(panel(page,'excluded')).toBeHidden();
 await chip(3).click();await expect(panel(page,'status')).toBeVisible();await expect(panel(page,'status')).toContainText('Failed');
 await chip(1).click();await expect(sec.locator('.step-text')).toHaveText('Delivery succeeded');
 await expect(panel(page,'status')).toBeVisible();await expect(panel(page,'status')).toContainText('Delivered');await expect(panel(page,'detail')).toBeHidden();
 await sec.locator('[data-dv-path="alternate"]').click();await expect(panel(page,'status')).toBeVisible();await expect(panel(page,'detail')).toBeVisible();await expect(panel(page,'status')).toContainText('Ready');
 await sec.getByRole('button',{name:'Next step',exact:true}).click();await expect(panel(page,'status')).toBeHidden();
 await sec.getByRole('button',{name:'Next step',exact:true}).click();await expect(panel(page,'status')).toBeVisible();
 await expect(sec.locator('.boardcanvas>svg')).toBeVisible();await expect(sec.locator('.boardcanvas>svg')).toHaveCount(1);
 await expect(sec.locator('.schip[aria-current="true"]')).toHaveAttribute('data-step-source','3');
 if(host==='standalone'){
  await page.evaluate(()=>{location.hash='d=paths&v=explore&p=happy&m=step&s=delivered';});
  await expect(sec.locator('.step-text')).toHaveText('Delivery succeeded');await expect(panel(page,'status')).toContainText('Delivered');await expect(panel(page,'detail')).toBeHidden();
  await page.evaluate(()=>{location.hash='d=paths&v=explore&p=alternate&m=step&s=recover';});
  await expect(sec.locator('.step-text')).toHaveText('Recovered on alternate path');await expect(panel(page,'detail')).toBeVisible();
 }
 await sec.getByRole('button',{name:'Home',exact:true}).click();await expect(sec.locator('.pwidget[data-dv-panel="0"]')).toBeVisible();await expect(sec.locator('.pwidget[data-dv-panel="1"]')).toBeVisible();
 await sec.getByRole('button',{name:'Explore',exact:true}).click();await expect(panel(page,'status')).toBeVisible();await expect(panel(page,'detail')).toBeVisible();await expect(panel(page,'excluded')).toBeHidden();
 await evidence(page,info,host+'-'+placement+'-restored');
 if(host==='native'){await page.evaluate(()=>viewer.destroy());await expect(page.locator('#host')).toBeEmpty();}
});
