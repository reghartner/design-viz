import {test,expect,pastePage,inspectPageElement} from '../helpers/test.mjs';

/* #1000: seven panel types edit structured values with controls instead of
   raw JSON boxes. Each case uses the control with real input, checks the
   saved shape, the rendered result and one-step Undo. */
const page1=(panel,steps)=>JSON.stringify({page:{sections:[{heading:'Structured',diagram:{view:'step',autoplay:false,nodes:{api:{title:'API'}},rows:[['api']],panels:[panel],...(steps?{steps}:{})}}]}},null,2);
const diagram=async page=>JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram;
async function typeInto(page,input,text){await input.click();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type(text);await page.keyboard.press('Tab');}
async function selectPanel(page){await inspectPageElement(page,page.locator('#docview .ptitle').first());}
async function selectStep(page,index=0){
  await page.locator('#editor-tab-steps').click();await page.locator('#steps-list [data-step-index="'+index+'"]').click();await page.locator('#editor-tab-inspect').click();
  const patch=page.locator('#guide .patchedit[data-panel-state="step"]').first();
  if(await patch.getAttribute('open')===null)await patch.locator(':scope > summary').click();
  return patch;
}
async function undoTo(page,original){await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(original);}
const noRawBox=async(scope,label)=>expect(scope.locator('.frow').filter({has:scope.page().locator(':scope > .flab',{hasText:new RegExp('^'+label+'$')})}).locator(':scope > textarea')).toHaveCount(0);

test('security setup scene is a dropdown of camera scenes',async({page,server})=>{
  const original=page1({id:'sec',type:'security',title:'Monitoring',scene:'person-through-door',initial:{video:'reviewing'}});
  await page.goto(server.origin+'/workbench.html');await pastePage(page,original);await selectPanel(page);
  const scene=page.locator('#guide').getByRole('combobox',{name:'Default camera scene',exact:true});
  await expect(scene).toHaveValue('person-through-door');
  await scene.focus();await scene.selectOption('kitchen-fire');
  await expect.poll(async()=>(await diagram(page)).panels[0].scene).toBe('kitchen-fire');
  await expect.poll(()=>page.locator('#docview .pt-security').evaluate(el=>el.innerHTML.includes('Kitchen fire'))).toBe(true);
  await undoTo(page,original);
});

test('funnel step counts use one number per declared stage',async({page,server})=>{
  const original=page1({id:'f',type:'funnel',title:'Stages',stages:[{id:'intake',label:'Received'},{id:'review',label:'Reviewed'}],initial:{counts:{intake:1000}}},
    [{id:'s1',text:'Review',panels:{f:{counts:{intake:1000}}}}]);
  await page.goto(server.origin+'/workbench.html');await pastePage(page,original);
  const patch=await selectStep(page);
  await expect(patch.locator('textarea')).toHaveCount(1); // only the Advanced JSON fallback remains
  await typeInto(page,patch.getByRole('textbox',{name:'Reviewed value',exact:true}),'800');
  await expect.poll(async()=>(await diagram(page)).steps[0].panels.f.counts).toEqual({intake:1000,review:800});
  await expect(page.locator('#docview .funnel-count')).toHaveText(['1,000','800']);
  await undoTo(page,original);
});

test('replicas reference and snapshots use fields, numbers stay numbers',async({page,server})=>{
  const original=page1({id:'r',type:'replicas',title:'Replicas',unit:'records',replicas:[{id:'primary',label:'Primary'}]},
    [{id:'s1',text:'Sync',panels:{r:{reference:{series:'log-a',position:100},replicas:{primary:{series:'log-a',position:98,status:'online'}}}}}]);
  await page.goto(server.origin+'/workbench.html');await pastePage(page,original);
  let patch=await selectStep(page);
  await typeInto(page,patch.getByRole('textbox',{name:'Primary Position',exact:true}),'99');
  await expect.poll(async()=>(await diagram(page)).steps[0].panels.r.replicas.primary).toEqual({series:'log-a',position:99,status:'online'});
  await expect(page.locator('#docview .rep-value').first()).toContainText('99');
  await undoTo(page,original);
  patch=await selectStep(page);
  await typeInto(page,patch.getByRole('textbox',{name:'Position',exact:true}),'101');
  await expect.poll(async()=>(await diagram(page)).steps[0].panels.r.reference).toEqual({series:'log-a',position:101});
  await expect(page.locator('#docview .rep-reference')).toContainText('101');
  await undoTo(page,original);
});

test('grid colour scale and step highlight use fixed fields',async({page,server})=>{
  const original=page1({id:'g',type:'grid',title:'Matrix',rows:[{id:'r1',label:'Row one'}],cols:[{id:'c1',label:'Col one'}],scale:{min:0,max:10},initial:{cells:{'r1.c1':4}}},
    [{id:'s1',text:'Look',panels:{g:{}}}]);
  await page.goto(server.origin+'/workbench.html');await pastePage(page,original);await selectPanel(page);
  await noRawBox(page.locator('#guide'),'Colour scale');
  await page.locator('#guide').getByRole('combobox',{name:'Scale kind',exact:true}).selectOption('diverging');
  await expect.poll(async()=>(await diagram(page)).panels[0].scale).toEqual({min:0,max:10,kind:'diverging'});
  await expect(page.locator('#docview .grid-table')).toHaveClass(/grid-diverging/);
  await undoTo(page,original);
  const patch=await selectStep(page);
  await patch.getByRole('combobox',{name:'Row',exact:true}).selectOption('r1');
  await expect.poll(async()=>(await diagram(page)).steps[0].panels.g).toEqual({highlight:{row:'r1'}});
  await expect(page.locator('#docview .grid-hl-row').first()).toBeVisible();
  await undoTo(page,original);
});

test('radar sensor and step subject use fixed fields',async({page,server})=>{
  const original=page1({id:'rd',type:'radar',title:'Radar',sensor:{x:160,y:150},initial:{subject:{x:100,y:90}}},
    [{id:'s1',text:'Near',panels:{rd:{subject:{x:120,y:80}}}}]);
  await page.goto(server.origin+'/workbench.html');await pastePage(page,original);await selectPanel(page);
  await typeInto(page,page.locator('#guide').getByRole('textbox',{name:'Sensor X',exact:true}),'140');
  await expect.poll(async()=>(await diagram(page)).panels[0].sensor).toEqual({x:140,y:150});
  await expect(page.locator('#docview .rdsensor')).toHaveAttribute('cx','140');
  await undoTo(page,original);
  const patch=await selectStep(page);
  await typeInto(page,patch.getByRole('textbox',{name:'X',exact:true}),'130');
  await expect.poll(async()=>(await diagram(page)).steps[0].panels.rd.subject).toEqual({x:130,y:80});
  await undoTo(page,original);
});

test('zone frame step subject uses fixed fields',async({page,server})=>{
  const original=page1({id:'z',type:'zoneframe',title:'Zones',zones:[{id:'porch',label:'Porch',points:[[20,20],[150,20],[150,160],[20,160]]}],initial:{subject:{x:50,y:60}}},
    [{id:'s1',text:'Move',panels:{z:{subject:{x:60,y:70}}}}]);
  await page.goto(server.origin+'/workbench.html');await pastePage(page,original);
  const patch=await selectStep(page);
  await typeInto(page,patch.getByRole('textbox',{name:'Y',exact:true}),'75');
  await expect.poll(async()=>(await diagram(page)).steps[0].panels.z.subject).toEqual({x:60,y:75});
  await expect(page.locator('#docview .zsubject')).toHaveAttribute('cy','75');
  await undoTo(page,original);
});

test('trace spans use a row editor with plain column labels',async({page,server})=>{
  const spans=[{id:'request',service:'api',name:'handle request',startMs:0,ms:100},{id:'parse',parentId:'request',service:'api',name:'parse input',startMs:5,ms:20}];
  const original=page1({id:'t',type:'trace',title:'Trace',spans,initial:{selected:'request'}});
  await page.goto(server.origin+'/workbench.html');await pastePage(page,original);await selectPanel(page);
  await noRawBox(page.locator('#guide'),'Spans');
  const names=page.locator('#guide').getByRole('textbox',{name:'Name',exact:true});
  await expect(names).toHaveCount(2);
  await typeInto(page,names.nth(1),'validate input');
  await expect.poll(async()=>(await diagram(page)).panels[0].spans).toEqual([spans[0],{...spans[1],name:'validate input'}]);
  await expect(page.locator('#docview .tr-opname').filter({hasText:'validate input'})).toHaveCount(1);
  await undoTo(page,original);
});
