import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
/* #1173 (Chuck 2026-11-09): "super collapsible so the actual trace renders NEXT TO the diagram". With a trace shown, the
   search section and the request card are one line each, so at 1440x900 the first span row starts above the bottom edge of
   the diagram frame beside the panel. Desktop only. */
const PROFILE=JSON.parse(await readFile(path.join(repo,'tests/fixtures/trace-connection-profile.json'),'utf8'));
const RECORDED=await readFile(path.join(repo,'tests/fixtures/provider-traces/honeycomb-trace.txt'),'utf8');
const ID='8413cd87a9f15b6bfe8e1acf5b3346d0';
const schema=()=>({name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string',enum:['full']}},required:['trace_id','from','environment_slug','team_slug','view_mode'],additionalProperties:false}});
function spec(){
 const d={nodes:{web:{title:'Checkout frontend'},checkout:{title:'Checkout service'},cart:{title:'Cart service'},payment:{title:'Payment service'},shipping:{title:'Shipping service'},email:{title:'Email service'}},
  rows:[['web','checkout','payment'],['cart','shipping','email']],
  edges:[{from:'web',to:'checkout',label:'PlaceOrder'},{from:'checkout',to:'cart',label:'GetCart'},{from:'checkout',to:'payment',label:'Charge'},{from:'checkout',to:'shipping',label:'ShipOrder'},{from:'checkout',to:'email',label:'Send confirmation'}],
  steps:[{id:'accept',text:'Accept checkout',nodes:['web'],traceMatch:{serviceName:'frontend',operation:'/cart/checkout',nodeId:'web'}},{id:'place',text:'Place the order',edge:'web->checkout',traceMatch:{serviceName:'checkout',operation:'msdemo.CheckoutService/PlaceOrder'}},{id:'cart',text:'Read the cart',edge:'checkout->cart',traceMatch:{serviceName:'cart',operation:'msdemo.CartService/GetCart'}},{id:'charge',text:'Charge the card',edge:'checkout->payment',traceMatch:{serviceName:'payment',operation:'grpc.msdemo.PaymentService/Charge'}}],
  view:'step',autoplay:false,panels:[{id:'status',type:'live-status',title:'Status'}],
  sectionLayout:{columns:24,default:[{x:0,y:0,w:15,h:16},{controls:'steps',attachTo:'diagram',x:0,y:16,w:15,h:5},{panel:'status',x:15,y:0,w:9,h:21}]}};
 return {page:{title:'Checkout request path',tracking:{telemetry:{grafana:{loki:'loki-$env'},environment:'prod',environments:{prod:{},stage:{}},traceConnections:{company:PROFILE},
  lookups:{order:{label:'Order ID',query:'{env="$env"} |= "order placed" | order_id="$value"'}}}},sections:[{id:'main',heading:'Checkout',diagram:d}]}};
}
async function open(page,server){
 await page.setViewportSize({width:1440,height:900});
 await page.exposeFunction('traceTools',()=>[{server:PROFILE.server,tools:[{name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false}}]},{server:'Grafana',tools:[{name:'query_loki_logs',annotations:{readOnlyHint:true}}]}]);
 await page.exposeFunction('traceDescribe',()=>schema());await page.exposeFunction('tracePermission',keys=>Object.fromEntries(keys.map(k=>[k,'granted'])));
 await page.exposeFunction('traceCall',(server,tool,args)=>tool==='query_loki_logs'?{content:[{type:'text',text:JSON.stringify({data:[]})}]}:{payload:RECORDED});
 await page.addInitScript(()=>{localStorage.setItem('dv_tour_v1','done');window.claude={use:async name=>name==='permissions'?{request:keys=>window.tracePermission(keys)}:{listTools:()=>window.traceTools(),describeTool:()=>window.traceDescribe(),callTool:(s,n,a)=>window.traceCall(s,n,a)}};window.flowviewBooted=ctl=>{window.ctl=ctl;};});
 const file=path.join(server.root,'trace-compact.json'),out=path.join(server.root,'trace-compact.html');await writeFile(file,JSON.stringify(spec()));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out],{stdio:'pipe'});
 await page.goto(server.origin+'/trace-compact.html');await page.waitForFunction(()=>!!window.ctl);
 const section=page.locator('#docview .doc-sec').first(),panel=section.locator('.pt-live-status');await expect(panel.locator('.dv-live-trace')).toBeVisible();
 return {section,panel};
}
test('#1173 at 1440x900 a loaded trace\'s span list starts beside the diagram, above the frame\'s bottom edge',async({page,server},info)=>{
 const {section,panel}=await open(page,server);
 await panel.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);await panel.getByRole('button',{name:'Load trace',exact:true}).click();
 const first=panel.locator('.dv-trace-span').first();await expect(first).toBeVisible();
 const frame=await section.locator('.section-layout-tile[data-layout-key="diagram"]').boundingBox(),row=await first.boundingBox(),body=await panel.locator('.dv-live-trace').boundingBox();
 await page.screenshot({path:info.outputPath('trace-compact-1440x900.png')});
 expect(row.y,'the first span row starts above the diagram frame\'s bottom edge ('+Math.round(frame.y+frame.height)+')').toBeLessThan(frame.y+frame.height);
 // Only the controls row, the two collapsed lines and the focus box come before the span list (about 200 px; the expanded
 // search report, request details and Clear rows took over 300).
 expect(row.y-body.y,'the span list follows the collapsed lines directly').toBeLessThan(260);
});
/* #1186 stage 2 (Chuck approved the mockup 2026-11-09): the span list fills the rest of the panel and scrolls inside it,
   and a focused span's detail opens directly under its row. */
test('#1186 at 1440x900 the span list fills the panel and scrolls itself; a focused span\'s detail opens under its row',async({page,server},info)=>{
 const {panel}=await open(page,server);
 await panel.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);await panel.getByRole('button',{name:'Load trace',exact:true}).click();
 const list=panel.locator('.dv-trace-waterfall');await expect(list.locator('.dv-trace-span').first()).toBeVisible();
 const geometry=async()=>{const card=await panel.boundingBox(),box=await list.boundingBox();const m=await list.evaluate(el=>({scroll:el.scrollHeight,client:el.clientHeight,overflow:getComputedStyle(el).overflowY}));return {card,box,...m};};
 const g=await geometry();
 expect(g.box.y+g.box.height,'the list ends inside the panel').toBeLessThanOrEqual(g.card.y+g.card.height+1);
 expect(g.card.y+g.card.height-(g.box.y+g.box.height),'the list fills the rest of the panel').toBeLessThan(48);
 expect(['auto','scroll'],'the list scrolls itself').toContain(g.overflow);expect(g.scroll,'55 spans overflow the list').toBeGreaterThan(g.client+40);
 // A span from the middle of the list: its detail opens directly under its row, inside the list.
 const row=list.locator('.dv-trace-span').nth(5);await row.scrollIntoViewIfNeeded();await row.click();
 const detail=list.locator('.dv-trace-span-detail');await expect(detail).toHaveCount(1);await expect(detail).toBeVisible();
 const r=await row.boundingBox(),d=await detail.boundingBox();
 expect(Math.abs(d.y-(r.y+r.height)),'the detail sits directly under its row').toBeLessThan(10);
 await page.screenshot({path:info.outputPath('trace-stage2-1440x900.png')});
});
