import {test,expect,paste,closeTools,arrangeChapter,prepareEditorSurface} from '../helpers/test.mjs';

function fixture(){
 const checks=Array.from({length:12},(_,i)=>({id:'gate-'+i,label:'Gate '+(i+1)+' with a deliberately wrapping desktop label'}));
 const results=Object.fromEntries(checks.map((check,i)=>[check.id,{status:i%3?'pass':'warn',detail:'Evidence for this gate remains visible after the panel is resized.'}]));
 const columns=[{id:'event',label:'Event',width:260},{id:'owner',label:'Owner',width:180},{id:'status',label:'Status',width:150}];
 const rows=Array.from({length:12},(_,i)=>({id:'row-'+i,cells:{event:'Deployment event '+(i+1),owner:'Release engineering',status:i%2?'Ready':'Waiting'},status:i%3?'neutral':'changed'}));
 const panels=[
  {id:'checks',type:'checks',title:'Triage gates',checks,initial:{results,note:'The decision note stays reachable when the tile is short.'}},
  {id:'table',type:'table',title:'Triage evidence',columns,initial:{rows,note:'The evidence note stays reachable at narrow desktop widths.'}}
 ];
 const layout=[{x:0,y:0,w:12,h:8},{panel:'checks',x:12,y:0,w:12,h:8},{panel:'table',x:0,y:8,w:12,h:8},{controls:'steps',x:12,y:8,w:12,h:4}];
 return {page:{title:'Resizable panel content',sections:[{id:'sizing',heading:'Sizing',diagram:{view:'step',autoplay:false,defaultLayout:'standard',nodes:{service:{title:'Service'}},rows:[['service']],panels,steps:[{id:'ready',text:'Inspect the evidence.'}],layouts:[
  {id:'standard',name:'Standard',presentation:'standard',sectionLayout:{columns:24,default:layout}},
  {id:'explore',name:'Explore',presentation:'explore',sectionLayout:{columns:24,default:layout},exploreLayout:{panels:[{panel:'checks',x:.58,y:.62,w:.36,h:.25,stacked:false},{panel:'table',x:.52,y:.05,w:.42,h:.2,stacked:false}]}}
 ]}}]}};
}
const overflow=locator=>locator.evaluate(el=>({clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,overflow:getComputedStyle(el).overflow,maxHeight:getComputedStyle(el).maxHeight}));
async function drag(page,handle,dx,dy){const r=await handle.boundingBox();expect(r).not.toBeNull();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+dx,r.y+r.height/2+dy,{steps:12});await page.mouse.up();}

function auditFixture(){
 const checks=Array.from({length:12},(_,i)=>({id:'gate-'+i,label:'Gate '+(i+1)+' with wrapping evidence'})),results=Object.fromEntries(checks.map(check=>[check.id,{status:'pass',detail:'Recorded evidence remains available.'}]));
 const columns=[{id:'event',label:'Event',width:220},{id:'owner',label:'Owner',width:180}],rows=Array.from({length:12},(_,i)=>({id:'row-'+i,cells:{event:'Event '+i,owner:'Release engineering'}}));
 const spans=Array.from({length:24},(_,i)=>({id:'span-'+i,label:'Timed operation '+i,ms:10+i,startMs:i*12}));
 const replicas=Array.from({length:8},(_,i)=>({id:'replica-'+i,label:'Replica '+i})),replicaState=Object.fromEntries(replicas.map((replica,i)=>[replica.id,{series:'audit/log',position:100-i,role:i?'follower':'primary',status:'online',observedAt:'audit'}]));
 const contractColumns=[{id:'type',label:'Type',width:140},{id:'notes',label:'Notes',width:300}],fields=Array.from({length:18},(_,i)=>({id:'field-'+i,label:'field_'+i,cells:{type:'string',notes:'Documented contract field '+i}}));
 const traceSpans=[{id:'request',service:'api',name:'request',startMs:0,ms:200},...Array.from({length:12},(_,i)=>({id:'op-'+i,parentId:'request',service:'api',name:'operation '+i,startMs:i*9,ms:7}))];
 const log=Array.from({length:30},(_,i)=>({tag:i%2?'INFO':'GATE',text:'Recorded log evidence line '+(i+1)})),bases=[
  {type:'log',title:'Log',initial:{log}},
  {type:'checks',title:'Checks',checks,initial:{results}},
  {type:'table',title:'Table',columns,initial:{rows}},
  {type:'waterfall',title:'Waterfall',spans},
  {type:'replicas',title:'Replicas',unit:'records',replicas,initial:{reference:{series:'audit/log',position:100},replicas:replicaState}},
  {type:'data-contract',title:'Data contract',columns:contractColumns,fields,initial:{highlights:{}}},
  {type:'trace',title:'Trace',spans:traceSpans,initial:{selected:'request'}}
 ],panels=[],layout=[];let y=0;
 bases.forEach(base=>{for(const size of ['small','large'])panels.push({...structuredClone(base),id:base.type+'-'+size,title:base.title+' '+size});layout.push({panel:base.type+'-small',x:0,y,w:12,h:8},{panel:base.type+'-large',x:12,y,w:12,h:40});y+=40;});
 layout.push({controls:'steps',x:0,y,w:24,h:4});
 return {page:{title:'Panel sizing audit',sections:[{id:'audit',heading:'Audit',diagram:{view:'step',autoplay:false,defaultLayout:'standard',nodes:{service:{title:'Service'}},rows:[['service']],panels,steps:[{id:'ready',text:'Audit panel sizing.'}],layouts:[{id:'standard',name:'Standard',presentation:'standard',sectionLayout:{columns:24,default:layout}}]}}]}};
}

test('all capped panel regions use available large-tile height and retain small-tile scrolling',async({page,server})=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(auditFixture()));await closeTools(page);
 const contracts=[['log','.plog',170],['checks','.swchecks',300],['table','.swtablewrap',300],['waterfall','.wf-timed',350],['replicas','.rep-list',480],['data-contract','.dcontract-scroll',480],['trace','.tr-operations',300]];
 for(const [type,selector,cap] of contracts){
  const small=await overflow(page.locator('[data-layout-key="panel:'+type+'-small"] '+selector)),large=await overflow(page.locator('[data-layout-key="panel:'+type+'-large"] '+selector));
  expect(small.scrollHeight-small.clientHeight,type+' small overflow').toBeGreaterThan(5);expect(large.clientHeight,type+' large height').toBeGreaterThan(cap+20);expect(large.maxHeight,type+' cap removed').toBe('none');expect(large.scrollHeight-large.clientHeight,type+' unnecessary large scrollbar').toBeLessThanOrEqual(1);
 }
});

test('Blueprint Log overrides its compact cap inside a large sized tile',async({page,server})=>{
 const raw=auditFixture();raw.page.skin='blueprint';await page.setViewportSize({width:1440,height:1000});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));await closeTools(page);
 const small=await overflow(page.locator('[data-layout-key="panel:log-small"] .plog')),large=await overflow(page.locator('[data-layout-key="panel:log-large"] .plog'));
 expect(small.scrollHeight-small.clientHeight).toBeGreaterThan(5);expect(large.clientHeight).toBeGreaterThan(168);expect(large.scrollHeight-large.clientHeight).toBeLessThanOrEqual(1);
});

test('Standard panel content follows authoring resize and short tiles retain reachable notes',async({page,server},info)=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture()));await prepareEditorSurface(page);await arrangeChapter(page);
 const section=page.locator('#docview .doc-sec').first(),grid=section.locator('.section-layout-grid');
 await section.evaluate(el=>{el.style.width='1000px';el.style.boxSizing='content-box';});await expect.poll(()=>grid.evaluate(el=>el.getBoundingClientRect().width)).toBeCloseTo(1000,0);
 const tile=grid.locator('[data-layout-key="panel:checks"]'),region=tile.locator('.swchecks'),card=tile.locator('.pwidget'),handle=tile.locator('.section-tile-resize');
 const small=await overflow(region);expect(small.scrollHeight-small.clientHeight).toBeGreaterThan(20);await info.attach('standard-small',{body:await page.screenshot(),contentType:'image/png'});
 await page.getByRole('button',{name:'Hide arrangement controls',exact:true}).click();for(let i=0;i<13;i++)await handle.press('ArrowDown');
 const grown=await overflow(region),grownCard=await overflow(card);expect(grown.clientHeight).toBeGreaterThan(300);expect(grown.maxHeight).toBe('none');expect(grown.scrollHeight-grown.clientHeight).toBeLessThanOrEqual(1);expect(grownCard.scrollHeight-grownCard.clientHeight).toBeLessThanOrEqual(1);
 await info.attach('standard-grown',{body:await page.screenshot(),contentType:'image/png'});
 for(let i=0;i<14;i++)await handle.press('ArrowUp');const shrunk=await overflow(region);expect(shrunk.scrollHeight-shrunk.clientHeight).toBeGreaterThan(20);
 await region.evaluate(el=>{el.scrollTop=el.scrollHeight;});await expect(region.locator('li').last()).toBeInViewport();await tile.locator('.pbody').evaluate(el=>{el.scrollTop=el.scrollHeight;});await expect(tile.locator('.swnote')).toBeInViewport();
 await page.emulateMedia({media:'print'});await expect(card).toHaveCSS('overflow','visible');expect((await overflow(region)).maxHeight).toBe('none');
});

test('Explore content follows a pointer-resized window in both dimensions',async({page,server},info)=>{
 await page.setViewportSize({width:1440,height:1000});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(fixture()));await closeTools(page);await page.getByRole('button',{name:'Explore',exact:true}).click();
 const win=page.locator('[data-explore-panel="table"]'),region=win.locator('.swtablewrap'),handle=win.locator('.explore-window-resize');await expect(win).toBeVisible();
 const before=await overflow(region);await info.attach('explore-small',{body:await page.screenshot(),contentType:'image/png'});
 await drag(page,handle,140,340);await expect(win).not.toHaveClass(/explore-window-automatic/);const grown=await overflow(region),body=await overflow(win.locator('.explore-window-body'));
 expect(grown.clientHeight).toBeGreaterThan(300);expect(grown.maxHeight).toBe('none');expect(grown.scrollHeight-grown.clientHeight).toBeLessThanOrEqual(1);expect(body.scrollHeight-body.clientHeight).toBeLessThanOrEqual(1);
 await info.attach('explore-grown',{body:await page.screenshot(),contentType:'image/png'});
 await drag(page,handle,-260,-420);const narrow=await overflow(region);expect(narrow.scrollWidth-narrow.clientWidth).toBeGreaterThan(100);expect(narrow.scrollHeight-narrow.clientHeight).toBeGreaterThan(20);
 await region.evaluate(el=>{el.scrollLeft=el.scrollWidth;el.scrollTop=el.scrollHeight;});await expect(region.locator('tbody tr').last()).toBeInViewport();await win.locator('.pbody').evaluate(el=>{el.scrollTop=el.scrollHeight;});await expect(win.locator('.swnote')).toBeInViewport();
});
