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
async function open(page,server,payload=RECORDED){
 await page.setViewportSize({width:1440,height:900});
 await page.exposeFunction('traceTools',()=>[{server:PROFILE.server,tools:[{name:'get_trace',annotations:{readOnlyHint:true,destructiveHint:false}}]},{server:'Grafana',tools:[{name:'query_loki_logs',annotations:{readOnlyHint:true}}]}]);
 await page.exposeFunction('traceDescribe',()=>schema());await page.exposeFunction('tracePermission',keys=>Object.fromEntries(keys.map(k=>[k,'granted'])));
 await page.exposeFunction('traceCall',(server,tool,args)=>tool==='query_loki_logs'?{content:[{type:'text',text:JSON.stringify({data:[]})}]}:{payload});
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
 // #1186 c1: the request line wraps rather than clipping; its flags come first, so a partial trace says so on screen.
 const summary=panel.locator('details.dv-trace-request > summary');await expect(summary).toContainText('partial');
 expect(await summary.evaluate(el=>({fits:el.scrollWidth<=el.clientWidth+1,overflow:getComputedStyle(el).textOverflow})),'the summary is not clipped').toEqual({fits:true,overflow:'clip'});
 const icons=await panel.locator('.dv-trace-request-icons').boundingBox(),line=await summary.boundingBox();
 expect(Math.abs(icons.y-line.y),'the icons sit at the top of the request line').toBeLessThan(8);expect(icons.x+icons.width,'at its right end').toBeGreaterThan(line.x+line.width-4);
 const g=await geometry();
 expect(g.box.y+g.box.height,'the list ends inside the panel').toBeLessThanOrEqual(g.card.y+g.card.height+1);
 // #1230: the trace sits above the search, which stays open; the list fills what the search leaves.
 const search=await panel.locator('.dv-trace-direct').boundingBox();expect(g.box.y+g.box.height,'the list ends above the search').toBeLessThanOrEqual(search.y+1);
 expect(search.y+search.height,'the search ends inside the panel').toBeLessThanOrEqual(g.card.y+g.card.height+1);expect(g.card.y+g.card.height-(search.y+search.height),'the list and the search below it fill the panel').toBeLessThan(48);
 expect(['auto','scroll'],'the list scrolls itself').toContain(g.overflow);expect(g.scroll,'55 spans overflow the list').toBeGreaterThan(g.client+40);
 // A span from the middle of the list: its detail opens directly under its row, inside the list.
 const row=list.locator('.dv-trace-span').nth(5);await row.scrollIntoViewIfNeeded();await row.click();
 const detail=list.locator('.dv-trace-span-detail');await expect(detail).toHaveCount(1);await expect(detail).toBeVisible();
 const r=await row.boundingBox(),d=await detail.boundingBox();
 expect(Math.abs(d.y-(r.y+r.height)),'the detail sits directly under its row').toBeLessThan(10);
 await page.screenshot({path:info.outputPath('trace-stage2-1440x900.png')});
});
test('#1186 a span focused from the diagram far down the list is scrolled into the list\'s view (no scroll anchoring)',async({page,server})=>{
 const {panel}=await open(page,server);
 await panel.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);await panel.getByRole('button',{name:'Load trace',exact:true}).click();
 const list=panel.locator('.dv-trace-waterfall');await expect(list.locator('.dv-trace-span').first()).toBeVisible();
 await list.evaluate(el=>{el.style.overflowAnchor='none';});
 // A span near the top first, so its detail is open above the next one when that one is focused.
 await list.locator('.dv-trace-span').nth(1).click();await expect(list.locator('.dv-trace-span-detail')).toHaveCount(1);
 const far=await page.evaluate(()=>{const t=window.ctl.liveStatus.snapshot().trace.selected,span=t.exemplar.spans[41];window.ctl.liveStatus.selectTraceSpan({context:t.context,spanId:span.id});return span.id;});
 const row=list.locator('.dv-trace-span[data-span-id="'+far+'"]');await expect(row).toHaveAttribute('aria-pressed','true');
 await expect.poll(async()=>{const l=await list.boundingBox(),r=await row.boundingBox();return r.y>=l.y-1 && r.y+r.height<=l.y+l.height+1;},{message:'the focused row is inside the list\'s box'}).toBe(true);
});
// #1188 + #1186: a failed span no step maps adds an error note to the request line, after the flags and before the date.
const CURRENCY='011114cbd1fd62de',FAILED=RECORDED.replace(new RegExp('^(\\| '+CURRENCY+' \\|(?:[^|]*\\|){4}) UNSET \\| false \\|','m'),'$1 ERROR | true |');
test('#1186 at 1440x900 a failed trace\'s error note shows on the wrapped request line',async({page,server},info)=>{
 expect(FAILED,'the fixture row is marked failed').not.toBe(RECORDED);
 const {panel}=await open(page,server,FAILED);
 await panel.getByRole('textbox',{name:'Trace ID or link',exact:true}).fill(ID);await panel.getByRole('button',{name:'Load trace',exact:true}).click();
 const summary=panel.locator('details.dv-trace-request > summary');
 await expect(summary).toContainText(/^8413cd87a9f1 · partial · error in frontend msdemo\.CurrencyService\/GetSupportedCurrencies \(not on this diagram\) · /);
 await expect(summary).toBeInViewport();
 expect(await summary.evaluate(el=>el.scrollWidth<=el.clientWidth+1 && el.scrollHeight<=el.clientHeight+1),'the wrapped line is not clipped').toBe(true);
 const icons=await panel.locator('.dv-trace-request-icons').boundingBox(),text=await summary.evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);return Array.from(r.getClientRects()).map(b=>({x:b.x,y:b.y,right:b.right,bottom:b.bottom}));});
 expect(text.every(b=>b.right<=icons.x+1 || b.bottom<=icons.y+1 || b.y>=icons.y+icons.height-1),'no text runs under the icons').toBe(true);
 await page.screenshot({path:info.outputPath('trace-error-note-1440x900.png')});
});
