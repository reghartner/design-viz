import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,prepareEditorSurface} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

function story(shared,presentation='standard',placement='floating',width=160){
  return {page:{title:'Path labels',skin:'pastel',sections:[{heading:'Routes',diagram:{
    view:'step',autoplay:false,nodes:{a:{title:'Source'},b:{title:'Destination'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],
    steps:Array.from({length:6},(_,i)=>({id:'s'+i,edge:'a->b',text:'The current step caption remains readable.'})),
    paths:[{id:'short',label:'Normal',steps:['s0','s1',...(shared?['s5']:[])]},
      {id:'long',label:'Retry delivery after the overnight connection becomes available again',steps:['s2','s3',...(shared?['s5']:[])]},
      {id:'word',label:'ExtraordinarilyLongUnbrokenPathLabelThatStillNeedsToWrapForReading',steps:['s4',...(shared?['s5']:[])]}],
    layouts:[{id:'chapter',name:'Chapter',presentation,pathLabelWidth:width,sectionLayout:{columns:24,default:[{x:0,y:0,w:24,h:12}]},exploreLayout:{controlsPlacement:placement}}]
  }}]}};
}
async function standalone(page,server,name,spec){
  await writeFile(path.join(server.root,name+'.json'),JSON.stringify(spec));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(server.root,name+'.json'),path.join(repo,'template/flowview.html'),path.join(server.root,name+'.html')]);
  await page.goto(server.origin+'/'+name+'.html');
}
async function checkLabels(page,shared,width){
  const controls=page.locator('.termbar.has-paths').first();
  await expect(controls.locator(shared?'.path-timeline':'.path-matrix')).toBeVisible();
  await expect.poll(()=>controls.evaluate(bar=>{
    const buttons=[...bar.querySelectorAll('.path-chip')],timeline=bar.querySelector('.path-timeline');
    return buttons.every((button,i)=>{
      const r=button.getBoundingClientRect(),next=buttons[i+1]?.getBoundingClientRect();
      if(next && r.bottom>next.top-2)return false;
      if(timeline){const entry=timeline.querySelector('[data-path-entry="'+button.dataset.dvPath+'"]');
        const y=Number(entry.getAttribute('d').split(' ')[2]);
        if(Math.abs(parseFloat(button.style.top)+button.offsetHeight/2-y)>.6)return false;}
      return true;
    });
  })).toBe(true);
  const metrics=await controls.evaluate(bar=>[...bar.querySelectorAll('.path-chip')].map(button=>{
    const text=button.querySelector('span'),style=getComputedStyle(text);
    return {label:button.textContent,title:button.title,height:text.offsetHeight,line:parseFloat(style.lineHeight),width:button.offsetWidth};
  }));
  expect(metrics[0].height).toBeLessThan(metrics[0].line+1);
  for(const metric of metrics.slice(1)){
    expect(metric.height).toBeGreaterThan(metric.line+1);expect(metric.height).toBeLessThanOrEqual(metric.line*2+1);
    expect(metric.title).toBe(metric.label);expect(metric.width).toBeLessThanOrEqual(width-10);
  }
  await controls.locator('[data-dv-path="long"]').focus();await page.keyboard.press('Enter');
  await expect(controls.locator('[data-dv-path="long"]')).toHaveAttribute('aria-pressed','true');
}
for(const shared of [false,true])for(const mode of ['standard','floating','canvas']){
  test(`${shared?'timeline':'matrix'} wraps path names in ${mode} across desktop sizes`,async({page,server})=>{
    const spec=story(shared,mode==='standard'?'standard':'explore',mode,160);
    await standalone(page,server,'width-'+shared+'-'+mode,spec);
    for(const width of [1280,1440,1920]){
      await page.setViewportSize({width,height:1080});await checkLabels(page,shared,160);
    }
  });
}

test('Inspect changes width in Standard and Explore with Undo, Redo and export',async({page,server})=>{
  for(const presentation of ['standard','explore']){
    const spec=story(true,presentation,'floating',160);
    await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec));await prepareEditorSurface(page);
    const section=page.locator('#docview .doc-sec').first();
    if(presentation==='explore')await section.locator('.stepline').click();
    else await section.locator('.schips').click({position:{x:2,y:2}});
    if(!await page.locator('#workspace-window-inspect').isVisible())await page.locator('#editor-tab-inspect').click();
    const control=page.getByRole('textbox',{name:'Path label width',exact:true});await expect(control).toHaveValue('160');
    const before=await page.locator('#src').inputValue();await control.fill('360');await control.press('Enter');
    await expect.poll(async()=>JSON.parse(await page.locator('#src').inputValue()).page.sections[0].diagram.layouts[0].pathLabelWidth).toBe(360);
    const after=await page.locator('#src').inputValue();
    await expect.poll(()=>section.locator('.path-chip').first().evaluate(button=>button.offsetWidth)).toBe(350);
    await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);
    await page.locator('#redo-builder').click();await expect(page.locator('#src')).toHaveValue(after);
    await standalone(page,server,'edited-width-'+presentation,JSON.parse(after));
    await expect.poll(()=>page.locator('.path-chip').first().evaluate(button=>button.offsetWidth)).toBe(350);
  }
});

test('unconfigured short timeline labels retain the original row spacing',async({page,server})=>{
  const spec=story(true);const d=spec.page.sections[0].diagram;delete d.layouts[0].pathLabelWidth;
  d.paths.forEach((p,i)=>p.label='Route '+i);
  await standalone(page,server,'short-width',spec);
  await expect.poll(()=>page.locator('.path-chip').evaluateAll(buttons=>buttons.map(b=>b.offsetHeight))).toEqual([28,28,28]);
  expect(await page.locator('.path-chip').evaluateAll(buttons=>buttons.map(b=>parseFloat(b.style.top)))).toEqual([8,40,72]);
});

test('timeline recomputes rows and connectors when container wrapping changes',async({page,server})=>{
  const spec=story(true);const d=spec.page.sections[0].diagram;delete d.layouts[0].pathLabelWidth;
  d.paths.forEach((p,i)=>p.label=i===1?'Connection unavailable':'Route '+i);
  await standalone(page,server,'responsive-label-height',spec);
  const chips=page.locator('.schips'),timeline=page.locator('.path-timeline');
  await expect.poll(()=>timeline.evaluate(el=>el.offsetHeight)).toBe(108);
  await chips.evaluate(el=>Object.assign(el.style,{width:'220px',maxWidth:'220px',flex:'0 0 220px'}));
  await expect.poll(()=>timeline.locator('[data-dv-path=long]').evaluate(el=>el.offsetHeight)).toBeGreaterThan(28);
  await expect.poll(()=>timeline.evaluate(el=>{
    const choice=el.querySelector('[data-dv-path=long]'),y=Number(el.querySelector('[data-path-entry=long]').getAttribute('d').split(' ')[2]);
    return Math.abs(parseFloat(choice.style.top)+choice.offsetHeight/2-y)<.6 && el.offsetHeight>108;
  })).toBe(true);
  await chips.evaluate(el=>{el.style.width='';el.style.maxWidth='';el.style.flex='';});
  await expect.poll(()=>timeline.evaluate(el=>el.offsetHeight)).toBe(108);
});
