import {test,expect} from '../helpers/test.mjs';
import {mountCues,mountImportedDetail,cueSpec,handoffSpec,CUE_JIRA,CUE_SAMPLES} from '../helpers/telemetry-cards.mjs';
const cards='.dv-metrics-card';
for(const mode of ['available','host-disabled','page-disabled'])test('handoff Jira targets survive Metrics repaint: '+mode,async({page,server})=>{
 const {root}=await mountCues(page,server),spec=handoffSpec();
 if(mode==='page-disabled')spec.page.tracking.telemetry={enabled:false};
 expect(Object.keys(spec.page.sections[0].diagram.nodes)).toEqual(expect.arrayContaining(['h','direct::h','nested::inner::h']));
 await page.evaluate(({spec,mode})=>{
  window.viewer.destroy();window.handoffQueries=0;
  window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:mode==='host-disabled'?false:{provider:async()=>{window.handoffQueries++;return {'a->b':{signals:{rate:{value:10},errors:{value:0}}}};}}});
 },{spec,mode});
 const section=root.locator('#section-main'),metrics=section.getByRole('button',{name:'Metrics',exact:true}),pop=root.locator('.dv-live-popover');
 const carriers=[['h','LOC-1'],['direct::h','IMP-1'],['nested::inner::h','IMP-1']];
 async function checkTargets(){
  for(const [id,ticket] of carriers){
   const node=section.locator('[data-dv-node="'+id+'"]'),cue=node.locator('.dv-jira-cue');
   await expect(cue).toHaveCount(1);await expect(cue).toHaveAttribute('data-jira-carrier',id);
   await expect(cue).toHaveAttribute('tabindex','0');await expect(cue).not.toHaveAttribute('aria-hidden','true');
   await expect(node.locator('.card')).not.toHaveAttribute('role','button');
   await cue.press('Enter');await expect(pop.getByRole('link',{name:ticket,exact:true})).toHaveAttribute('href','https://jira.test/browse/'+ticket);
   await page.keyboard.press('Escape');await expect(cue).toBeFocused();
  }
 }
 // A sample update exercises the new full repaint, even before Metrics is enabled.
 await page.evaluate(()=>window.viewer.controller.telemetry.apply({'a->b':{signals:{rate:{value:20}}}}));
 await checkTargets();await expect(section.locator(cards)).toHaveCount(0);expect(await page.evaluate(()=>window.handoffQueries)).toBe(0);
 if(mode==='available'){
  await metrics.click();await expect(section.locator(cards)).toContainText('10 req/h');await checkTargets();
  for(const [id] of carriers){
   const cue=section.locator('[data-dv-node="'+id+'"] .dv-jira-cue');await cue.focus();
   await page.evaluate(()=>window.viewer.controller.telemetry.apply({'a->b':{signals:{rate:{value:321},errors:{value:0}}}}));
   await expect(section.locator(cards)).toContainText('321 req/h');await expect(cue).toBeFocused();
  }
  await checkTargets();expect((await geometry(root)).overlaps).toEqual([]);
  await page.evaluate(()=>window.viewer.controller.telemetry.setAvailable(false));await expect(metrics).toBeHidden();await expect(section.locator(cards)).toHaveCount(0);await checkTargets();
  await page.evaluate(()=>window.viewer.controller.telemetry.setAvailable(true));await expect(metrics).toHaveAttribute('aria-pressed','false');await checkTargets();
 }else{
  await expect(metrics).toBeHidden();
  await page.evaluate(()=>{window.viewer.controller.telemetry.setAvailable(true);window.viewer.controller.liveStatus.apply({'LOC-1':{state:'done'},'IMP-1':{state:'done'}});});
  await expect(metrics).toBeHidden();await checkTargets();expect(await page.evaluate(()=>window.handoffQueries)).toBe(0);
 }
 // Each original handoff still navigates, including both production-resolved imports.
 for(const [id] of carriers){
  await section.locator('[data-dv-node="'+id+'"] .handoff-link').press('Enter');await expect(root.locator('#section-destination')).toBeVisible();await expect(pop).toBeHidden();
  await root.locator('.handoff-back').click();await expect(section).toBeVisible();
 }
 await checkTargets();await page.evaluate(()=>window.viewer.destroy());await expect(root).toBeEmpty();
});
async function geometry(root){const result=await root.evaluate(scope=>{
 scope=scope.shadowRoot || scope;
 const overlaps=[],outside=[],sizes=[],labels=[];
 const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
 const hit=(a,b)=>a.w>0&&a.h>0&&b.w>0&&b.h>0&&a.x+a.w>b.x+.5&&a.x<b.x+b.w-.5&&a.y+a.h>b.y+.5&&a.y<b.y+b.h-.5;
 for(const card of scope.querySelectorAll('.dv-metrics-card')){
  const box=rect(card.querySelector('.dv-metrics-card-box')),svg=card.closest('svg'),id=card.dataset.metricsCard;sizes.push(box);
  for(const control of svg.querySelectorAll('.node .card,.coin,.dv-jira-cue,.comm-break,.dv-metrics-card-box')){
   if(card.contains(control)||getComputedStyle(control).visibility==='hidden'||getComputedStyle(control).display==='none'||control.closest('.view-step-hidden,.dv-fragment-hidden,.comm-hidden,.dv-live-comm-suppressed'))continue;
   if(hit(box,rect(control)))overlaps.push({id,control:control.getAttribute('class'),box,other:rect(control)});
  }
  const frame=svg.viewBox.baseVal,b=card.getBBox(),m=card.transform.baseVal.consolidate().matrix;
  if(b.x+m.e<frame.x-.1||b.y+m.f<frame.y-.1||b.x+m.e+b.width>frame.x+frame.width+.1||b.y+m.f+b.height>frame.y+frame.height+.1)outside.push(id);
  for(const text of card.querySelectorAll('text')){const r=rect(text);if(r.x+r.w>box.x+box.w+.5)labels.push(text.textContent);}
 }
 for(const svg of scope.querySelectorAll('.board svg'))for(const el of svg.querySelectorAll('.coin,.dv-jira-cue,.comm-break')){
  if(getComputedStyle(el).visibility==='hidden'||getComputedStyle(el).display==='none'||el.closest('.view-step-hidden,.dv-fragment-hidden,.comm-hidden,.dv-live-comm-suppressed'))continue;
  const b=el.getBBox(),m=svg.getCTM().inverse().multiply(el.getCTM()),f=svg.viewBox.baseVal;
  if(!b.width&&!b.height)continue;
  const points=[[b.x,b.y],[b.x+b.width,b.y+b.height]].map(([x,y])=>({x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f}));
  if(points.some(p=>p.x<f.x-.1||p.x>f.x+f.width+.1||p.y<f.y-.1||p.y>f.y+f.height+.1))outside.push(el.getAttribute('class'));
 }
 return {overlaps,outside,sizes,labels};
});expect(result.sizes.length,'geometry measures every located card, including native shadow DOM').toBe(await root.locator(cards).count());return result;}
for(const live of [false,true])test('cards pack with coins, nodes and Jira cues; Live '+live,async({page,server})=>{
 const {root,metrics}=await mountCues(page,server);
 if(!live)await root.getByRole('button',{name:'Live',exact:true}).click();
 await metrics.click();await expect(root.locator(cards)).toHaveCount(3);
 const g=await geometry(root);expect(g.overlaps).toEqual([]);expect(g.outside).toEqual([]);expect(g.labels).toEqual([]);
 await expect(root.locator('.dv-metrics-label-hidden')).toHaveCount(3);
 if(!live)await root.locator('.board').first().screenshot({path:test.info().outputPath('edge-cards.png')});
 await expect(root.locator('[data-metrics-card="app->push"]')).toContainText('24h window');
 await expect(root.locator('[data-metrics-card="ingest->app"]')).not.toContainText('not bound');
 await expect(root.locator('[data-metrics-card="shared::api->shared::store"]')).toBeVisible();
 await metrics.click();await expect(root.locator(cards)).toHaveCount(0);await expect(root.locator('.dv-metrics-label-hidden')).toHaveCount(0);
 await expect(root.locator('text.lbl[data-dv-edge="0"]')).toBeVisible();
});
test('card click and keyboard open existing carrier popover and keep ticket link',async({page,server})=>{
 const {root,metrics}=await mountCues(page,server);await metrics.click();const card=root.locator('[data-metrics-card="ingest->app"]');
 await card.click();await expect(root.getByRole('dialog')).toBeVisible();await expect(root.getByRole('dialog').getByRole('link',{name:/LOC-3/})).toHaveAttribute('href',/LOC-3/);
 await page.keyboard.press('Escape');await card.focus();await page.keyboard.press('Enter');await expect(root.getByRole('dialog')).toBeVisible();
 await page.keyboard.press('Escape');await card.focus();await page.keyboard.press('Space');await expect(root.getByRole('dialog')).toBeVisible();
});
test('authored left and offset, absent samples, no inferred binding, safe label',async({page,server})=>{
 const {root}=await mountCues(page,server);const spec=cueSpec(),edge=spec.page.sections[0].diagram.edges[0];edge.telemetry.card={side:'left',offset:180};edge.label='<script>unsafe</script>';
 await page.evaluate(({spec})=>{window.viewer.destroy();window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{provider:async()=>({})}});}, {spec});
 await root.getByRole('button',{name:'Metrics',exact:true}).click();await expect(root.locator(cards)).toHaveCount(3);
 const card=root.locator('[data-metrics-card="ingest->app"]');await expect(card).toHaveAttribute('data-side','left');await expect(card).toContainText('<script>unsafe</script>');await expect(card).toContainText('unobserved');expect(await card.locator('script').count()).toBe(0);
 const placement=await card.evaluate(el=>{const p=el.closest('svg').querySelector('path.edge[data-dv-edge="0"]'),mid=p.getPointAtLength(p.getTotalLength()/2),b=el.getBBox(),m=el.transform.baseVal.consolidate().matrix;return {right:m.e+b.width,mid:mid.x,dy:m.f+b.height/2-mid.y};});
 expect(placement.right).toBeLessThan(placement.mid);expect([0,24,-24,48,-48,96,-96]).toContain(placement.dy-180);expect((await geometry(root)).overlaps).toEqual([]);
});
test('production loaded detail cards clean their retained DOM on destroy',async({page,server})=>{
 const {scope}=await mountImportedDetail(page,server);await expect(scope.locator(cards)).toHaveCount(2);expect((await geometry(scope)).overlaps).toEqual([]);
 const handle=await scope.elementHandle();await page.evaluate(()=>window.viewer.destroy());expect(await handle.evaluate(el=>el.querySelectorAll('.dv-metrics-card,.dv-metrics-label-hidden,.dv-metrics-leader').length)).toBe(0);
});
for(const pageEnabled of [true,false])for(const hostEnabled of [true,false])test('native page '+pageEnabled+' host '+hostEnabled+' precedence',async({page,server})=>{
 const {root}=await mountCues(page,server);const spec=cueSpec();spec.page.tracking.telemetry={enabled:pageEnabled};
 await page.evaluate(({spec,hostEnabled})=>{window.viewer.destroy();window.calls=0;window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:hostEnabled?{provider:async()=>{window.calls++;return {};}}:false});}, {spec,hostEnabled});
 const metrics=root.getByRole('button',{name:'Metrics',exact:true});if(pageEnabled&&hostEnabled){await expect(metrics).toBeVisible();await expect(metrics).toHaveAttribute('aria-pressed','false');}else{await expect(metrics).toBeHidden();await page.evaluate(()=>{window.viewer.controller.telemetry.setEnabled(true);window.viewer.controller.telemetry.apply({'ingest->app':{signals:{rate:{value:200}}}});});}
 expect(await page.evaluate(()=>window.calls)).toBe(0);await expect(root.locator(cards)).toHaveCount(0);
});
test('live breaks, path and view changes repack cards and controls',async({page,server})=>{
 const {root}=await mountCues(page,server);const spec=cueSpec(),d=spec.page.sections[0].diagram;d.paths=[{id:'all',label:'All',steps:['notify','retry']},{id:'few',label:'Fewer',steps:['notify']}];d.graphFrame={x:0,y:0,w:800,h:400};
 await page.evaluate(({spec,jira,samples})=>{window.viewer.destroy();window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{provider:async()=>samples}});window.viewer.controller.liveStatus.apply({...jira,'LOC-3':{state:'blocked'},'IMP-2':{state:'blocked'}});},{spec,jira:CUE_JIRA,samples:CUE_SAMPLES});
 await root.getByRole('button',{name:'Metrics',exact:true}).click();await expect(root.locator('.dv-live-comm-failure')).toHaveCount(2);await expect(root.locator(cards)).toHaveCount(3);
 expect((await geometry(root)).overlaps).toEqual([]);expect((await geometry(root)).outside).toEqual([]);
 await root.locator('.path-chip[data-dv-path="few"]').click();await expect.poll(async()=>(await geometry(root)).overlaps).toEqual([]);
 await root.getByRole('button',{name:'Step',exact:true}).click();await expect.poll(async()=>(await geometry(root)).overlaps).toEqual([]);
 await root.getByRole('button',{name:'Ambient',exact:true}).click();await expect.poll(async()=>(await geometry(root)).overlaps).toEqual([]);
 await root.getByRole('button',{name:'Live',exact:true}).click();await expect(root.locator('.dv-live-comm-failure')).toHaveCount(0);expect((await geometry(root)).overlaps).toEqual([]);
});
test('root disable includes real loaded detail bindings',async({page,server})=>{
 const {root,scope,metrics}=await mountImportedDetail(page,server,false);await expect(metrics).toBeHidden();
 await page.evaluate(()=>window.viewer.controller.telemetry.setEnabled(true));expect(await page.evaluate(()=>window.detailTelemetryCalls)).toEqual([]);
 await expect(scope.locator(cards)).toHaveCount(0);await expect(root.locator('[data-metrics-state]')).toHaveCount(0);
 expect(await page.evaluate(()=>window.viewer.controller.telemetry.bindings().map(b=>b.id))).toContain('shared::api->shared::store');
});
test('capability removal clears cards and cues without touching sibling native mount',async({page,server})=>{
 const {root,metrics}=await mountCues(page,server);await metrics.click();await expect(root.locator(cards)).toHaveCount(3);
 await page.evaluate(({spec,samples})=>{const host=document.createElement('div');host.id='sibling';document.body.appendChild(host);window.sibling=window.mount(host,spec,{telemetry:{provider:async()=>samples}});window.sibling.controller.telemetry.setEnabled(true);},{spec:cueSpec(),samples:CUE_SAMPLES});
 await expect(page.locator('#sibling '+cards)).toHaveCount(3);await page.evaluate(()=>window.viewer.controller.telemetry.setAvailable(false));
 await expect(root.locator(cards)).toHaveCount(0);await expect(metrics).toBeHidden();await expect(root.locator('[data-metrics-state],.dv-metrics-label-hidden')).toHaveCount(0);await expect(page.locator('#sibling '+cards)).toHaveCount(3);
 await page.evaluate(()=>window.viewer.destroy());await expect(page.locator('#sibling '+cards)).toHaveCount(3);
});

test('nested imported bound edge has the same card and root disable',async({page,server})=>{
 const {nestedSpec}=await import('../helpers/telemetry-cards.mjs'),{root}=await mountCues(page,server),spec=nestedSpec();
 await page.evaluate(spec=>{window.viewer.destroy();window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{provider:async()=>({'outer::inner::a->outer::inner::b':{signals:{rate:{value:88},errors:{value:1}}}})}});},spec);
 await root.getByRole('button',{name:'Metrics',exact:true}).click();const card=root.locator('[data-metrics-card="outer::inner::a->outer::inner::b"]');await expect(card).toHaveCount(1);await expect(card).toContainText('88 req/h');expect((await geometry(root)).overlaps).toEqual([]);
 spec.page.tracking={telemetry:{enabled:false}};
 await page.evaluate(spec=>{window.viewer.destroy();window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{provider:async()=>{throw Error('disabled provider invoked');}}});window.viewer.controller.telemetry.setEnabled(true);},spec);
 await expect(root.getByRole('button',{name:'Metrics',exact:true})).toBeHidden();await expect(root.locator(cards)).toHaveCount(0);
});

async function standalone(page,server,{mode='valid',disabled=null}={}){
 const {writeFile}=await import('node:fs/promises'),{execFileSync}=await import('node:child_process'),{default:path}=await import('node:path'),{repo}=await import('../helpers/prepare.mjs');
 const spec={page:{title:'Automatic telemetry',tracking:{telemetry:{enabled:disabled!=='page',grafana:{prometheus:'prom-main'}}},sections:[{diagram:{nodes:{a:{title:'Sender'},b:{title:'Receiver'}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'Deliver',telemetry:{kind:'call',signals:{rate:{grafana:'rate(delivery[5m])',unit:'req/s'}}}}],panels:[{id:'status',type:'live-status'}]}}]}};
 await page.addInitScript(({mode,disabled})=>{
  window.metadata=0;window.queries=[];window.namespaces=[];window.flowviewBooted=ctl=>window.ctl=ctl;
  if(disabled==='host')window.flowviewTelemetry=false;
  const mcp={listTools:async()=>{window.metadata++;if(mode==='throw')throw Error('unavailable');return [{server:'Grafana',tools:(mode==='missing'?['get_annotations']:['query_prometheus','query_loki_logs','search_tempo_traces','get_annotations','generate_deeplink']).map(name=>({name}))}];},callTool:async(server,tool)=>{window.queries.push(tool);if(mode==='approval'&&!window.allowed)throw {code:'approval_required'};return tool==='query_prometheus'?{payload:{data:[{values:[[1793746800,'22'],[1793750400,'25']]}]}}:{payload:[]};}};
  window.claude={use:async name=>{window.namespaces.push(name);if(name!=='mcp')return null;if(mode==='delayed')return new Promise(r=>window.release=()=>r(mcp));return mcp;}};
 },{mode,disabled});
 const file=path.join(server.root,'cards-auto.json'),out=path.join(server.root,'cards-auto.html');await writeFile(file,JSON.stringify(spec));execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out]);await page.goto(server.origin+'/cards-auto.html');await page.waitForFunction(()=>!!window.ctl);return page.locator('#docview');
}
for(const mode of ['valid','missing','throw'])test('standalone '+mode+' capability metadata gates Metrics without data calls',async({page,server})=>{
 const root=await standalone(page,server,{mode});await expect.poll(()=>page.evaluate(()=>window.metadata)).toBe(1);const button=root.getByRole('button',{name:'Metrics',exact:true});
 if(mode==='valid'){await expect(button).toBeVisible();await expect(button).toHaveAttribute('aria-pressed','false');}else await expect(button).toBeHidden();
 if(mode==='missing'){await expect(root.locator('.dv-live-metrics-connection')).toBeVisible();await expect(root.locator('.dv-live-metrics-connection')).toContainText('query_prometheus');}
 expect(await page.evaluate(()=>window.queries)).toEqual([]);await expect(root.locator(cards)).toHaveCount(0);
 if(mode==='valid'){await button.click();await expect(root.locator(cards)).toHaveCount(1);await expect(root.locator(cards)).toContainText('25 req/s');}
});
for(const disabled of ['host','page'])test('standalone explicit '+disabled+' disable prevents automatic discovery',async({page,server})=>{
 const root=await standalone(page,server,{disabled});await expect(root.getByRole('button',{name:'Metrics',exact:true})).toBeHidden();expect(await page.evaluate(()=>window.namespaces.filter(n=>n==='mcp'))).toEqual([]);expect(await page.evaluate(()=>window.metadata)).toBe(0);expect(await page.evaluate(()=>window.queries)).toEqual([]);
});
test('standalone pending metadata after controller destroy stays retired',async({page,server})=>{
 const root=await standalone(page,server,{mode:'delayed'});await expect(root.getByRole('button',{name:'Metrics',exact:true})).toBeHidden();await page.evaluate(()=>{window.ctl.destroy();window.release();});
 // Yield two browser tasks for both promise continuations to settle.
 await page.evaluate(()=>new Promise(r=>setTimeout(r,0)));expect(await page.evaluate(()=>window.metadata)).toBe(0);expect(await page.evaluate(()=>window.ctl.telemetry.snapshot().available)).toBe(false);
});
test('standalone qualified tools retain a user initiated consent path',async({page,server})=>{
 const root=await standalone(page,server,{mode:'approval'});await root.getByRole('button',{name:'Metrics',exact:true}).click();await expect(root.getByRole('button',{name:'Allow Grafana',exact:true})).toBeVisible();expect(await page.evaluate(()=>window.queries)).toEqual(['get_annotations']);
 await page.evaluate(()=>window.allowed=true);await root.getByRole('button',{name:'Allow Grafana',exact:true}).click();await expect(root.locator(cards)).toContainText('25 req/s');
});
test('vertical route defaults right and leader starts at the measured midpoint',async({page,server})=>{
 const {root}=await mountCues(page,server),spec=cueSpec(),d=spec.page.sections[0].diagram;
 d.rows=[[]];d.floats=[{id:'ingest',x:100,y:50},{id:'app',x:100,y:500},{id:'push',x:500,y:500},{id:'shared::api',x:700,y:50},{id:'shared::store',x:700,y:500}];
 await page.evaluate(({spec,samples})=>{window.viewer.destroy();window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{provider:async()=>samples}});},{spec,samples:CUE_SAMPLES});
 await root.getByRole('button',{name:'Metrics',exact:true}).click();const card=root.locator('[data-metrics-card="ingest->app"]');await expect(card).toHaveAttribute('data-side','right');
 const leader=await card.evaluate(card=>{const path=card.closest('svg').querySelector('path.edge[data-dv-edge="0"]'),mid=path.getPointAtLength(path.getTotalLength()/2),line=card.previousElementSibling;return {start:line.getAttribute('d').split('L')[0],expected:'M'+mid.x+' '+mid.y};});expect(leader.start).toBe(leader.expected);const g=await geometry(root);expect(g.overlaps).toEqual([]);expect(g.outside).toEqual([]);
});
test('dense coin reservation keeps cards clear with Live off and no break',async({page,server})=>{
 const {root}=await mountCues(page,server),binding=cueSpec().page.sections[0].diagram.edges[0].telemetry;
 const spec={page:{title:'Dense coins',sections:[{diagram:{view:'ambient',nodes:{a:{title:'Source'},b:{title:'Sink'}},rows:[[]],floats:[{id:'a',x:100,y:100},{id:'b',x:420,y:100}],edges:[{from:'a',to:'b',telemetry:binding}],steps:Array.from({length:12},(_,i)=>({id:'s'+i,edge:'a->b',text:'Delivery '+i})),panels:[{id:'status',type:'live-status'}]}}]}};
 await page.evaluate(({spec})=>{window.viewer.destroy();window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{provider:async()=>({'a->b':{signals:{rate:{value:99},errors:{value:0}}}})}});window.viewer.controller.liveStatus.setEnabled(false);},{spec});
 await root.getByRole('button',{name:'Metrics',exact:true}).click();await expect(root.locator(cards)).toHaveCount(1);await expect(root.locator('.coin')).toHaveCount(12);await expect(root.locator('.dv-live-comm-failure')).toHaveCount(0);
 const g=await geometry(root);expect(g.overlaps,'card reservations must repack a dense coin grid').toEqual([]);expect(g.outside).toEqual([]);
 // Repacked coins and the new Metrics card must fit the visible board, not
 // merely its expanded SVG viewBox; the sticky legend must not cover a coin.
 await expect.poll(()=>root.locator('.board').evaluate(board=>{const b=board.getBoundingClientRect(),top=board.querySelector('.lg').getBoundingClientRect().bottom;return [...board.querySelectorAll('.coin,.dv-metrics-card')].every(el=>{const r=el.getBoundingClientRect();return r.left>=b.left && r.right<=b.right && r.top>=top && r.bottom<=b.bottom;});})).toBe(true);
 await root.locator('.coin[data-dv-step="1"]').click();await expect(root.locator('.schip[aria-current="true"]')).toHaveAttribute('data-step-source','1');
});
for(const disabled of ['host','page'])test('demo fallback respects '+disabled+' disable while Jira Live remains independent',async({page,server})=>{
 const {readFile,writeFile}=await import('node:fs/promises'),{execFileSync}=await import('node:child_process'),{default:path}=await import('node:path'),{repo}=await import('../helpers/prepare.mjs');
 const raw=JSON.parse(await readFile(path.join(repo,'examples/live-status/live-status.spec.json'),'utf8'));
 if(disabled==='page'){raw.page.tracking.telemetry={...raw.page.tracking.telemetry,enabled:false};}else await page.addInitScript(()=>window.flowviewTelemetry=false);
 const file=path.join(server.root,'cards-demo.json'),out=path.join(server.root,'cards-demo.html');await writeFile(file,JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out,'--timeline',path.join(repo,'examples/live-status/live-status.timeline.json')]);await page.goto(server.origin+'/cards-demo.html#live=demo');
 const root=page.locator('#docview');await expect(root.getByRole('button',{name:'Metrics',exact:true})).toBeHidden();await expect(root.getByRole('button',{name:'Live',exact:true})).toBeVisible();await root.getByRole('button',{name:'Next day',exact:true}).click();await expect(root.locator(cards+',.dv-metrics-node,.dv-metrics-stream')).toHaveCount(0);
});
test('sample repaint preserves card focus and off restores authored label visibility',async({page,server})=>{
 const {root,metrics}=await mountCues(page,server),label=root.locator('text.lbl[data-dv-edge="0"]');await label.evaluate(el=>el.style.visibility='hidden');await metrics.click();
 const card=root.locator('[data-metrics-card="ingest->app"]');await card.focus();await page.evaluate(()=>window.viewer.controller.telemetry.apply({'ingest->app':{signals:{rate:{value:321,series:[[1,20],[2,321]]},errors:{value:0}}}}));await expect(card).toContainText('321 req/h');await expect(card).toBeFocused();
 await metrics.click();await expect(root.locator(cards)).toHaveCount(0);await expect(label).toHaveCSS('visibility','hidden');expect(await label.getAttribute('style')).toContain('visibility: hidden');
});
test('crossing route coin reserves a bound card even when Live is off',async({page,server})=>{
 const {root}=await mountCues(page,server),binding=cueSpec().page.sections[0].diagram.edges[0].telemetry;
 const spec={page:{title:'Crossing coin',sections:[{diagram:{view:'ambient',nodes:{a:{title:'A'},b:{title:'B'},c:{title:'C'},d:{title:'D'}},rows:[[]],floats:[{id:'a',x:100,y:100},{id:'b',x:600,y:100},{id:'c',x:350,y:-150},{id:'d',x:350,y:450}],edges:[{from:'a',to:'b',telemetry:binding},{from:'c',to:'d'}],steps:[{id:'cross',edge:'c->d',text:'Cross the bound route'}],panels:[{id:'status',type:'live-status'}]}}]}};
 await page.evaluate(spec=>{window.viewer.destroy();window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{provider:async()=>({'a->b':{signals:{rate:{value:10},errors:{value:0}}}})}});window.viewer.controller.liveStatus.setEnabled(false);},spec);
 await root.getByRole('button',{name:'Metrics',exact:true}).click();await expect(root.locator(cards)).toHaveCount(1);await expect(root.locator('.coin')).toHaveCount(1);await expect(root.locator('.comm-break')).toHaveCount(0);
 const layout=await root.evaluate(el=>{const svg=(el.shadowRoot || el).querySelector('.board svg');return [...svg.querySelectorAll('.dv-metrics-card-box,.coin,path.edge')].map(e=>{const b=e.getBBox(),m=svg.getCTM().inverse().multiply(e.getCTM());return {type:e.getAttribute('class'),x:b.x+m.e,y:b.y+m.f,w:b.width,h:b.height,mid:e.matches('path')?{x:e.getPointAtLength(e.getTotalLength()/2).x,y:e.getPointAtLength(e.getTotalLength()/2).y}:null};});});
 await test.info().attach('crossing-layout',{body:JSON.stringify(layout),contentType:'application/json'});
 await root.locator('.board').first().screenshot({path:test.info().outputPath('crossing.png')});
 const g=await geometry(root);expect(g.overlaps,'a crossing coin must move out of the card reservation').toEqual([]);expect(g.outside).toEqual([]);
});

test('manual card positions reserve frame and cue space and survive live text remeasurement',async({page,server})=>{
 const {root}=await mountCues(page,server),spec=cueSpec();spec.page.sections[0].diagram.edges[0].telemetry.card={position:{x:840,y:420}};
 await page.evaluate(({spec,samples})=>{window.viewer.destroy();window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{provider:async()=>samples}});},{spec,samples:CUE_SAMPLES});
 await root.getByRole('button',{name:'Metrics',exact:true}).click();const card=root.locator('[data-metrics-card="ingest->app"]');await expect(card).toBeVisible();
 const position=()=>card.evaluate(el=>{const m=el.transform.baseVal.consolidate().matrix;return {x:Math.round((m.e-Number(el.dataset.metricsAnchorX))*100)/100,y:Math.round((m.f-Number(el.dataset.metricsAnchorY))*100)/100};});
 expect(await position()).toEqual({x:840,y:420});expect((await geometry(root)).outside).toEqual([]);expect((await geometry(root)).overlaps).toEqual([]);
 await page.evaluate(()=>window.viewer.controller.telemetry.apply({'ingest->app':{signals:{rate:{value:9876543210},errors:{value:0}}}}));
 expect(await position()).toEqual({x:840,y:420});expect((await geometry(root)).outside).toEqual([]);expect((await geometry(root)).overlaps).toEqual([]);
});
test('#1112 authored card title and width replace the label and default width; placement packs the wider cards, including an imported edge',async({page,server})=>{
 const {root,metrics}=await mountCues(page,server),card=id=>root.locator('[data-metrics-card="'+id+'"]');
 await metrics.click();await expect(root.locator(cards)).toHaveCount(3);
 await expect(card('app->push').locator('.dv-metrics-card-title')).toHaveText('push');
 for(const id of ['ingest->app','app->push','shared::api->shared::store'])await expect(card(id).locator('.dv-metrics-card-box')).toHaveAttribute('width','240');
 const spec=cueSpec(d=>{
  d.edges[0].telemetry.card={title:'Camera stats consumer · RabbitMQ',width:480};
  d.edges[1].telemetry.card={width:480};
  d.topologyImports[0].edgeTracking['api->store'].telemetry.card={title:'Postgres writes',width:140};
 });
 await page.evaluate(({spec,jira,samples})=>{
  window.viewer.destroy();window.viewer=window.mount(document.querySelector('#host'),spec,{telemetry:{provider:()=>Promise.resolve(JSON.parse(JSON.stringify(samples)))}});
  window.viewer.controller.liveStatus.apply(jira);
 },{spec,jira:CUE_JIRA,samples:CUE_SAMPLES});
 await root.getByRole('button',{name:'Metrics',exact:true}).click();await expect(root.locator(cards)).toHaveCount(3);
 await expect(card('ingest->app').locator('.dv-metrics-card-title')).toHaveText('Camera stats consumer · RabbitMQ');
 await expect(card('app->push').locator('.dv-metrics-card-title')).toHaveText('push');
 await expect(card('shared::api->shared::store').locator('.dv-metrics-card-title')).toHaveText('Postgres writes');
 for(const [id,width] of [['ingest->app','480'],['app->push','480'],['shared::api->shared::store','140']])await expect(card(id).locator('.dv-metrics-card-box')).toHaveAttribute('width',width);
 // The two adjacent 480-wide cards, nodes, coins and cues stay clear; text stays inside each card, including the 140-wide one.
 const g=await geometry(root);expect(g.overlaps).toEqual([]);expect(g.outside).toEqual([]);expect(g.labels).toEqual([]);
});
