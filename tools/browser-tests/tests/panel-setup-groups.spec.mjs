import {test,expect,pastePage,inspectPageElement} from '../helpers/test.mjs';

/* #999: long panel setup forms are grouped, rarely used fields sit in a
   collapsed Advanced section, and every grouped or advanced field still
   commits through its control with one Undo step. */
const panels=[
  {id:'radar',type:'radar',title:'Range radar',sensor:{x:160,y:150},facing:0,spread:90,range:200,threshold:100,rings:3,scale:{pxPerUnit:1},
    zones:[{id:'approach',label:'Approach',points:[[150,73],[224,73],[246,120],[162,138]]}],initial:{subject:{x:195,y:90}}},
  {id:'cost',type:'cost',title:'Cost',density:'auto',currency:'USD',unit:'messages',period:'per month',assumptions:'List prices',
    routes:[{id:'base',label:'Baseline'}],items:[{route:'base',label:'Queue',perMillion:0.4}],initial:{messages:1000000}},
  {id:'thermo',type:'thermo',title:'Temperature',unit:'°C',min:0,max:100,warn:70,crit:90,lowWarn:10,lowCrit:5,initial:{value:20}},
  {id:'app',type:'deviceapp',title:'Device app',appName:'Homestead',device:'Front door camera',subtitle:'Device health',
    sources:[{id:'cloud',label:'Cloud'}],fields:[{id:'model',label:'Camera model',source:'cloud'}],initial:{model:{value:'Doorbell'}}}
];
const spec={page:{sections:[{heading:'Setup groups',diagram:{nodes:{api:{title:'API'}},rows:[['api']],panels}}]}};

const rowsField=(block,caption,value)=>({kind:'rows',block,caption,value});
const CASES={
  radar:{groups:['Sensor','Alert','Starting state'],advanced:['Rings','Scale','Zones'],fields:[
    ['Sensor X','sensor','150',{x:150,y:150}],['Facing','facing','45',45],['Spread','spread','60',60],['Range','range','180',180],
    ['Threshold','threshold','90',90],['Rings','rings','4',4,true],['Pixels per unit','scale','2',{pxPerUnit:2},true],['Zones','zones','[]',[],true]]},
  cost:{groups:['Units','Notes','Cost model'],advanced:['Display density'],fields:[
    ['Currency','currency','EUR','EUR'],['Workload unit','unit','requests','requests'],['Cost period','period','per day','per day'],
    ['Basis & exclusions','assumptions','Example rates','Example rates'],
    [rowsField('Operations / routes','Name','Primary'),'routes',null,v=>v[0].label==='Primary'],
    [rowsField('Components & cost lines','Component','Broker'),'items',null,v=>v[0].label==='Broker'],
    [{kind:'select',label:'Display density',option:'compact'},'density',null,'compact',true]]},
  thermo:{groups:['Scale','Thresholds'],advanced:[],fields:[
    ['Unit','unit','°F','°F'],['Minimum','min','-10',-10],['Maximum','max','120',120],['High warning','warn','75',75],
    ['High critical','crit','95',95],['Low warning','lowWarn','12',12],['Low critical','lowCrit','2',2]]},
  app:{groups:['App','Data sources','Cards'],advanced:[],fields:[
    ['App Name','appName','Porch','Porch'],['Device','device','Side door','Side door'],['Subtitle','subtitle','Status','Status'],
    [{kind:'select',label:'Show data sources',option:'Show'},'showSources',null,true],
    [rowsField('Sources','Name','Hub'),'sources',null,v=>v[0].label==='Hub'],
    [rowsField('Fields','Name','Model'),'fields',null,v=>v[0].label==='Model']]}
};

for(const [index,decl] of panels.entries()){
  const c=CASES[decl.id];
  test(decl.type+' setup form shows groups in order, a collapsed Advanced section, and commits every field',async({page,server})=>{
    const original=JSON.stringify(spec,null,2);
    await page.goto(server.origin+'/workbench.html');await pastePage(page,original);
    const guide=page.locator('#guide'),source=page.locator('#src'),root=page.locator('#docview');
    const panel=async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.panels[index];
    const select=async()=>{await inspectPageElement(page,root.locator('[data-dv-panel="'+index+'"] .ptitle').first());await expect(guide.locator('.inspector-title')).toBeVisible();};
    await select();

    await expect(guide.locator('h4.panel-setup-group')).toHaveText(c.groups);
    const advanced=guide.locator('details.panel-setup-advanced');
    if(c.advanced.length){
      await expect(advanced).toHaveCount(1);
      await expect(advanced).not.toHaveAttribute('open','');
      for(const label of c.advanced)await expect(advanced.locator('.flab',{hasText:label}).first()).toBeHidden();
      await advanced.locator(':scope > summary').click();
      await expect(advanced).toHaveAttribute('open','');
      for(const label of c.advanced)await expect(advanced.locator('.flab',{hasText:label}).first()).toBeVisible();
      // The Advanced section sits before Starting state, which stays last.
      expect(await guide.evaluate(el=>{const fold=el.querySelector('details.panel-setup-advanced');
        const start=el.querySelector('details.initialedit') || [...el.querySelectorAll('h4.panel-setup-group')].find(h=>h.textContent==='Starting state');
        return !!start && !!(fold.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING);})).toBe(true);
    }else await expect(advanced).toHaveCount(0);
    // Starting state is named once: a disclosure summary or, for a raw JSON row, one heading.
    if(await guide.locator('details.initialedit').count()){
      await expect(guide.locator('details.initialedit > summary')).toHaveText('Starting state');
      await expect(guide.locator('h4.panel-setup-group',{hasText:/^Starting state$/})).toHaveCount(0);
    }

    for(const [control,key,typed,expected,isAdvanced] of c.fields){
      await select();
      const fold=guide.locator('details.panel-setup-advanced');
      if(isAdvanced && await fold.getAttribute('open')===null)await fold.locator(':scope > summary').click();
      const before=await source.inputValue();
      if(typeof control==='string'){
        const input=guide.getByLabel(control,{exact:true});
        await input.click();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type(typed);await page.keyboard.press('Tab');
      }else if(control.kind==='select'){
        await guide.getByLabel(control.label,{exact:true}).selectOption(control.option);
      }else{
        const block=guide.locator('.frow').filter({has:page.locator(':scope > .flab',{hasText:new RegExp('^'+control.block.replace(/[/&]/g,'\\$&')+'$')})});
        const input=block.locator('.rowline').first().getByRole('textbox',{name:control.caption,exact:true});
        await input.click();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type(control.value);await page.keyboard.press('Tab');
      }
      if(typeof expected==='function')await expect.poll(async()=>expected((await panel())[key]),key+' commits').toBe(true);
      else await expect.poll(async()=>(await panel())[key],key+' commits').toEqual(expected);
      if(isAdvanced)await expect(fold,'Advanced stays open after a commit').toHaveAttribute('open','');
      await page.locator('#undo-builder').click();await expect(source).toHaveValue(before);
    }
    await expect(source).toHaveValue(original);
  });
}

test('timeline Shared cadence is disabled with a reason while lanes exist, and editable without lanes',async({page,server})=>{
  const timeline=(lanes)=>({id:'beat',type:'timeline',title:'Heartbeat',span:'6h',cadence:{every:'30m',label:'heartbeat'},...(lanes?{lanes:[{id:'a',label:'Lane A',every:'15m'}]}:{}),initial:{now:'0m'}});
  const make=(lanes)=>JSON.stringify({page:{sections:[{heading:'Timeline',diagram:{nodes:{api:{title:'API'}},rows:[['api']],panels:[timeline(lanes)]}}]}},null,2);
  const guide=page.locator('#guide'),source=page.locator('#src'),root=page.locator('#docview');
  const cadence=()=>guide.locator('.frow').filter({has:page.locator(':scope > .flab',{hasText:/^Shared cadence$/})});

  await page.goto(server.origin+'/workbench.html');await pastePage(page,make(true));
  await inspectPageElement(page,root.locator('.pt-timeline .ptitle'));
  await expect(cadence().getByLabel('Every',{exact:true})).toBeDisabled();
  await expect(cadence().getByLabel('Name',{exact:true})).toBeDisabled();
  const reason=guide.locator('.panel-setup-field').filter({has:cadence()}).locator('.panel-setup-reason');
  await expect(reason).toBeVisible();await expect(reason).toContainText('Lanes set their own cadence');
  await expect(cadence().getByLabel('Every',{exact:true})).toHaveAttribute('aria-describedby',await reason.getAttribute('id'));

  await page.goto(server.origin+'/workbench.html');const original=make(false);await pastePage(page,original);
  await inspectPageElement(page,root.locator('.pt-timeline .ptitle'));
  const every=cadence().getByLabel('Every',{exact:true});
  await expect(every).toBeEnabled();await expect(guide.locator('.panel-setup-reason')).toHaveCount(0);
  await every.click();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('20m');await page.keyboard.press('Tab');
  await expect.poll(async()=>JSON.parse(await source.inputValue()).page.sections[0].diagram.panels[0].cadence).toEqual({every:'20m',label:'heartbeat'});
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(original);
});
