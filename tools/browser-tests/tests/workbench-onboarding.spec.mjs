import {test,expect,paste,expectCompanyBrand} from '../helpers/test.mjs';
import {editorSpec} from '../fixtures/editor-spec.mjs';
import {readFile} from 'node:fs/promises';

const practice=page=>page.frameLocator('.workbench-tour-host iframe');
const next=frame=>frame.getByRole('button',{name:'Next',exact:true}).click();
const heading=frame=>frame.locator('.dv-tour-ui h2');
async function start(page,server,chapter){
  await page.goto(server.origin+'/workbench.html');
  await page.getByRole('button',{name:'Take the tour →',exact:true}).click();
  if(chapter)await page.getByRole('button',{name:chapter,exact:true}).click();
  await expect(practice(page).locator('.dv-tour')).toBeVisible();
  return practice(page);
}
test('canonical homepage setup defaults to copy/paste with user-owned agent',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');
  await expect(page.locator('#welcome-example-view svg[aria-label="flow diagram"]')).toHaveCount(2);
  await page.locator('#welcome-agent').click();
  await expect(page.locator('#folder-agent-guide')).toBeVisible();
  await expect(page.locator('#folder-agent-setup-mode-external')).toHaveAttribute('aria-pressed','true');
  await expect(page.getByLabel('What is the focus of your visualization?')).toBeVisible();
  await expect(page.locator('#folder-agent-start-new')).toHaveAttribute('aria-pressed','true');
});

test('homepage fits the authored default view and supports Explore through expansion',async({page,server},info)=>{
  await page.goto(server.origin+'/workbench.html');
  const example=page.locator('#welcome-example-view'),stage=example.locator('#welcome-example-stage');
  const section=example.locator('#section-visitor'),grid=section.locator('.section-layout-grid');
  await expect(stage.locator(':scope > .doc-heading')).toHaveCount(1);
  await expect(stage.locator(':scope > .doc-heading')).toBeHidden();
  await expectCompanyBrand(stage.locator('.doc-company-brand'));
  await expect(section.getByRole('button',{name:'Story',exact:true})).toHaveAttribute('aria-pressed','true');
  const diagram=grid.locator('[data-layout-key="diagram"]'),app=grid.locator('[data-layout-key="panel:app"]');
  await expect(diagram).toHaveCSS('grid-row','1 / span 9');
  await expect(app).toHaveCSS('grid-row','10 / span 15');
  async function fits(){
    await expect.poll(async()=>{
      const outer=await example.boundingBox(),inner=await stage.boundingBox();
      return Math.abs(outer.height-inner.height)+Math.abs(outer.width-inner.width);
    }).toBeLessThan(2);
  }
  await fits();await page.screenshot({path:info.outputPath('landing-default-view.png')});
  const defaultHeight=(await example.boundingBox()).height;
  await section.getByRole('button',{name:'Explore',exact:true}).click();
  await expect(grid).toBeHidden();await expect(section.locator('.explore-board')).toBeVisible();
  await expect(section.locator('.explore-zoom')).toHaveText('52%');
  await fits();expect((await example.boundingBox()).height).not.toBe(defaultHeight);
  const zoom=await section.locator('.explore-zoom').innerText();
  await section.getByRole('button',{name:'Zoom in',exact:true}).click();
  await expect(section.locator('.explore-zoom')).not.toHaveText(zoom);
  await section.getByRole('button',{name:'Go to step 3 on Internet down',exact:true}).click();
  const caption=await section.locator('.stepline').innerText();
  await page.screenshot({path:info.outputPath('landing-explore-view.png')});
  await page.locator('#welcome-example-expand').click();
  const expanded=practice(page).locator('#section-visitor');
  await expect(expanded.getByRole('button',{name:'Explore',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(expanded.locator('.explore-board')).toBeVisible();
  await expect.poll(()=>expanded.locator('.stepline').innerText()).toBe(caption);
  await page.getByRole('button',{name:'Close tour',exact:true}).click();
  await section.getByRole('button',{name:'Story',exact:true}).click();
  await expect(grid).toBeVisible();await fits();
  await page.setViewportSize({width:390,height:844});await fits();
  await expect(app).toHaveCSS('grid-row','10 / span 15');
  await page.locator('.welcome-example').screenshot({path:info.outputPath('landing-narrow-view.png')});
});

test('homepage opens an authored Explore default without exposing the Standard grid',async({page,server})=>{
  const sample=JSON.parse(await readFile(new URL('../../../src/starters/onboarding.json',import.meta.url),'utf8'));
  sample.page.sections[0].diagram.defaultLayout='explore';
  await page.route(server.origin+'/workbench.html',async route=>{
    const response=await route.fetch(),html=await response.text();
    const body=html.replace(/var WORKBENCH_LANDING = [^\n]*;\n/,'var WORKBENCH_LANDING = '+JSON.stringify({spec:sample,title:'Example',label:'',footer:''}).replace(/</g,'\\u003c')+';\n');
    expect(body).not.toBe(html);
    await route.fulfill({response,body});
  });
  await page.goto(server.origin+'/workbench.html');
  const section=page.locator('#welcome-example-view #section-visitor');
  await expect(section.getByRole('button',{name:'Explore',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(section.locator('.explore-board')).toBeVisible();
  await expect(section.locator('.section-layout-grid')).toBeHidden();
  await expect(section.locator('.explore-player')).toBeVisible();
  await section.getByRole('button',{name:'Story',exact:true}).click();
  await expect(section.locator('.section-layout-grid')).toBeVisible();
  await expect(section.locator('.explore-board')).toHaveCount(0);
});

test('practice chapters conceal homepage chrome before their bootstrap runs',async({page,server})=>{
  await start(page,server,'3. Edit in workbench');
  const source=await page.locator('.workbench-tour-host iframe').getAttribute('srcdoc');
  // Hold the actual generated chapter in its pre-boot state, rather than
  // relying on a screenshot happening to catch a single loading frame.
  const beforeBoot=await page.evaluate(html=>{
    const doc=new DOMParser().parseFromString(html,'text/html');
    doc.querySelectorAll('script').forEach(script=>script.remove());
    return '<!doctype html>'+doc.documentElement.outerHTML;
  },source);
  await page.setContent(beforeBoot);
  await expect(page.locator('#workbench-welcome')).toHaveCount(1);
  await expect(page.locator('#workbench-welcome')).toBeHidden();
  await expect(page.locator('.workbench-header')).toBeHidden();
});

test('Build with my agent from the standalone brief preserves the current draft and Undo',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(editorSpec(),null,2));
  await page.locator('#docview .node').first().click();await page.locator('#object-duplicate').click();
  const edited=await page.locator('#src').inputValue();
  await page.locator('#workspace-home').click();await page.locator('#welcome-agent-prompt').click();
  await page.locator('#welcome-agent-live').click();
  await expect(page.locator('#folder-agent-guide')).toBeVisible();
  await expect(page.locator('#folder-agent-setup-mode-external')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#folder-agent-start-new')).toHaveAttribute('aria-pressed','false');
  await expect(page.locator('#src')).toHaveValue(edited);
  await page.keyboard.press('Escape');await expect(page.locator('#undo-builder')).toBeEnabled();
  await page.locator('#undo-builder').click();await expect(page.locator('#src')).not.toHaveValue(edited);
});

test('every viewer, agent and manual lesson resolves against a real visible control',async({page,server},info)=>{
  // This walks all three chapters; keep each action bounded while allowing the complete journey.
  test.setTimeout(180000);
  const missing=[];page.on('console',m=>{if(m.type()==='warning' && /tour step|tour.*fail/i.test(m.text()))missing.push(m.text());});
  await page.addInitScript(()=>{try{localStorage.removeItem('dv_tour_v1');document.cookie='dv_tour=;path=/;max-age=0';}catch{}});
  let frame=await start(page,server);
  await frame.getByRole('button',{name:/Show me both/}).click();
  for(let i=0;i<30;i++){
    const title=await heading(practice(page)).textContent();
    if(title==='Start with your own agent')break;
    await practice(page).locator('.dv-tour-next').click();
    await expect(heading(practice(page))).not.toHaveText(title);
  }
  await expect(heading(practice(page))).toHaveText('Start with your own agent');
  const chapters=[
    ['Start with your own agent','Choose the diagram folder','Review, then copy the instructions','Continue in your agent’s app','A proposed update arrives','Compare the current and proposed story','Commit when the story is right','You remain in control','Ask for the next change','Select exactly what you mean','Copy for agent, bottom left'],
    ['Start with Add to Diagram','Choose a panel visually','Build with services from your catalog','Select something to edit it','Arrange diagram nodes in rows','Multi-select and align','Bind a node to a real company service','Select a step, then inspect it','Edit what belongs to this step','Add to Step: click on the diagram','Change a panel on this same step','Tell the alternate outcome','Nest a diagram inside a node','Keep the complete story']
  ];
  for(let c=0;c<chapters.length;c++){
    for(let i=0;i<chapters[c].length;i++){
      frame=practice(page);await expect(heading(frame)).toHaveText(chapters[c][i]);
      if(c===1 && i===6){
        for(const label of ['Company service','Service API','API operation'])await expect(frame.getByText(label,{exact:true}).locator('..').locator('select')).toBeInViewport();
      }
      if(c===1 && i===10){
        await expect(frame.getByLabel('Panel visibility · app',{exact:true})).toBeInViewport();
        await expect(frame.getByLabel('App screen · Resident app',{exact:true})).toBeInViewport();
      }
      if(c===1 && i===12)await expect(frame.getByText('Detail target',{exact:true}).locator('..').locator('select')).toBeInViewport();
      if([0,2,6,9].includes(i) || c===0 && [3,8].includes(i))await page.screenshot({path:info.outputPath('chapter-'+c+'-step-'+i+'.png')});
      if(i===chapters[c].length-1)await frame.getByRole('button',{name:'Done',exact:true}).click();
      else await next(frame);
    }
  }
  expect(missing).toEqual([]);
});

test('practice commit and Undo keep the real draft and storage untouched',async({page,server})=>{
  test.setTimeout(90000);
  await page.goto(server.origin+'/workbench.html');
  const original=JSON.stringify(editorSpec(),null,2);await paste(page,original);
  await page.locator('#editor-tab-agent').click();
  await page.locator('.workspace-help>summary').click();await page.getByRole('button',{name:'Take the workbench tour',exact:true}).filter({visible:true}).click();
  const frame=practice(page);
  await expect(heading(frame)).toHaveText('Start with your own agent');
  const saved=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>!k.startsWith('dv_tour'))));
  const before=await frame.locator('#src').inputValue();
  for(let i=0;i<6;i++)await next(frame);
  await expect(heading(frame)).toHaveText('Commit when the story is right');
  await frame.locator('#agent-update-commit').click();
  await expect(frame.locator('#src')).not.toHaveValue(before);
  await expect(frame.locator('.dv-tour-ui')).toBeVisible();
  await next(frame);await frame.locator('#undo-builder').click();
  await expect(frame.locator('#src')).toHaveValue(before);
  await expect(page.locator('#src')).toHaveValue(original);
  expect(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>!k.startsWith('dv_tour'))))).toEqual(saved);
  const child=page.frames().find(f=>f.url()==='about:srcdoc');
  expect(await child.evaluate(()=>{try{parent.document.body;return false;}catch{return true;}})).toBe(true);
  expect(await child.evaluate(()=>{try{localStorage.setItem('probe','bad');return false;}catch{return true;}})).toBe(true);
  await page.getByRole('button',{name:'Close tour',exact:true}).click();
  await expect(page.locator('#src')).toHaveValue(original);
});

test('skipping viewer intro records only visited topics and next entry starts in agent chapter',async({page,server})=>{
  await page.addInitScript(()=>{try{localStorage.removeItem('dv_tour_v1');localStorage.removeItem('dv_tour_features_v1');document.cookie='dv_tour=;path=/;max-age=0';}catch{}});
  const frame=await start(page,server);
  await frame.getByRole('button',{name:/Show me both/}).click();
  await expect(heading(frame)).toHaveText('Choose a chapter');
  await frame.getByRole('button',{name:'Skip tour',exact:true}).click();
  await expect(heading(practice(page))).toHaveText('Start with your own agent');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('dv_tour_features_v1')).seen)).toEqual(['views']);
  await page.getByRole('button',{name:'Close tour',exact:true}).click();
  await page.getByRole('button',{name:'Take the tour →',exact:true}).click();
  await expect(heading(practice(page))).toHaveText('Start with your own agent');
  await page.getByRole('button',{name:'1. Explore a diagram',exact:true}).click();
  await expect(practice(page).getByRole('button',{name:/Show me both/})).toBeVisible();
});

test('Add to Step toggles the selected step and Escape keeps the edit while the tour continues',async({page,server})=>{
  test.setTimeout(90000);
  const frame=await start(page,server,'3. Edit in workbench');
  for(let i=0;i<9;i++)await next(frame);
  await expect(heading(frame)).toHaveText('Add to Step: click on the diagram');
  await expect(frame.locator('#addmode-exit')).toBeVisible();
  await frame.locator('#docview g.node[data-dv-node="camera"]').click();
  const selected=async()=>JSON.parse(await frame.locator('#src').inputValue()).page.sections[0].diagram.steps[1];
  await expect.poll(async()=>(await selected()).nodes).toContain('camera');
  const edited=await selected();
  await page.keyboard.press('Escape');
  await expect(frame.locator('#addmode-exit')).toBeHidden();
  await expect(heading(frame)).toHaveText('Add to Step: click on the diagram');
  expect(await selected()).toEqual(edited);
  await next(frame);await expect(heading(frame)).toHaveText('Change a panel on this same step');
  expect(await selected()).toEqual(edited);
  await expect(frame.getByLabel('Step ID',{exact:true})).toHaveValue('detect');
});

test('trying Add opens a usable picker and Escape closes it without skipping the chapter',async({page,server})=>{
  const frame=await start(page,server,'3. Edit in workbench');
  await frame.locator('#diagram-add').click();
  await expect(frame.locator('#diagram-add-menu')).toBeVisible();
  await frame.locator('#add-panel').click();
  await expect(frame.locator('#panel-picker')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(frame.locator('#panel-picker')).toBeHidden();
  await expect(heading(frame)).toHaveText('Start with Add to Diagram');
  await next(frame);await expect(heading(frame)).toHaveText('Choose a panel visually');
  await frame.locator('#panel-picker-close').click();
  await expect(frame.locator('.dv-tour-ui')).toBeVisible();
  await next(frame);await expect(heading(frame)).toHaveText('Build with services from your catalog');
  await page.keyboard.press('Escape');
  await expect(frame.locator('#catalog-picker')).toBeHidden();
  await expect(heading(frame)).toHaveText('Build with services from your catalog');
});

test('parent tour chrome blocks edit shortcuts and entering fullscreen works',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(editorSpec(),null,2));
  await page.locator('#docview .node').first().click();
  await page.locator('#object-duplicate').click();
  const before=await page.locator('#src').inputValue();
  await page.locator('.workspace-help>summary').click();await page.getByRole('button',{name:'Take the workbench tour',exact:true}).filter({visible:true}).click();
  await expect(heading(practice(page))).toHaveText('Start with your own agent');
  await page.locator('.workbench-tour-header>b').click();
  const pan=await page.locator('#workspace-pan').getAttribute('aria-pressed');
  for(const key of ['ControlOrMeta+z','ControlOrMeta+d','Delete','Backspace','Space'])await page.keyboard.press(key);
  expect(await page.locator('#src').inputValue()).toBe(before);
  expect(await page.locator('#workspace-pan').getAttribute('aria-pressed')).toBe(pan);
  await page.getByRole('button',{name:'Full screen',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  await page.getByRole('button',{name:'3. Edit in workbench',exact:true}).click();
  await expect(heading(practice(page))).toHaveText('Start with Add to Diagram');
  await page.locator('.workbench-tour-header>b').click();await page.keyboard.press('ControlOrMeta+z');
  expect(await page.locator('#src').inputValue()).toBe(before);
  await page.getByRole('button',{name:'Close tour',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
  expect(await page.locator('#src').inputValue()).toBe(before);
});

test('closing the first viewer card keeps the introduction available and expansion retains the selected outcome',async({page,server})=>{
  await page.addInitScript(()=>{try{localStorage.removeItem('dv_tour_v1');localStorage.removeItem('dv_tour_features_v1');document.cookie='dv_tour=;path=/;max-age=0';}catch{}});
  const frame=await start(page,server);await frame.getByRole('button',{name:/Show me both/}).click();
  await expect(heading(frame)).toHaveText('Choose a chapter');
  await page.getByRole('button',{name:'Close tour',exact:true}).click();
  expect(await page.evaluate(()=>localStorage.getItem('dv_tour_v1'))).toBeNull();
  await page.getByRole('button',{name:'Take the tour →',exact:true}).click();
  await expect(practice(page).getByRole('button',{name:/Show me both/})).toBeVisible();
  await page.getByRole('button',{name:'Close tour',exact:true}).click();
  await page.locator('#welcome-example-view').getByRole('button',{name:'Go to step 3 on Internet down',exact:true}).click();
  const caption=await page.locator('#welcome-example-view .stepline').first().innerText();
  await page.locator('#welcome-example-expand').click();
  await expect.poll(()=>practice(page).locator('#docview .stepline').first().innerText()).toBe(caption);
});

test('practice object copy stays local and step lessons follow the user’s selected step',async({page,context,server})=>{
  test.setTimeout(90000);
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:server.origin});
  const frame=await start(page,server,'3. Edit in workbench');
  await page.evaluate(()=>navigator.clipboard.writeText('real clipboard stays here'));
  for(let i=0;i<3;i++)await next(frame);
  await frame.locator('#object-copy').click();
  await expect(frame.locator('#object-clipboard-status')).toContainText('inside this practice project');
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe('real clipboard stays here');
  for(let i=3;i<7;i++)await next(frame);
  await frame.locator('#editor-steps [data-step-index="3"]').click();
  await next(frame);await expect(frame.getByLabel('Step ID',{exact:true})).toHaveValue('notify');
  await next(frame);await expect(frame.locator('#btarget')).toContainText('ADD TO STEP 4');
  await page.keyboard.press('Escape');await next(frame);
  await expect(heading(frame)).toHaveText('Change a panel on this same step');
  await expect(frame.getByLabel('Step ID',{exact:true})).toHaveValue('notify');
});

test('Next commits the practice proposal even after comparing Current state',async({page,server})=>{
  const frame=await start(page,server);
  for(let i=0;i<5;i++)await next(frame);
  await frame.locator('#agent-update-current').click();
  await expect(frame.locator('#agent-update-commit')).toBeDisabled();
  await next(frame);await expect(heading(frame)).toHaveText('Commit when the story is right');
  await next(frame);await expect(heading(frame)).toHaveText('You remain in control');
  await expect(frame.locator('#undo-builder')).toBeEnabled();
  expect(JSON.parse(await frame.locator('#src').inputValue()).page.sections[0].diagram.nodes.cloud.sub).toContain('Validate event');
  await expect(frame.locator('#agent-update-banner')).toBeHidden();
});

test('company config owns landing and reader while editing exercises remain fictional',async({page,server},info)=>{
  test.setTimeout(90000);
  await page.goto(server.origin+'/company.html');
  const card=page.locator('#welcome-example-view'),section=card.locator('#section-company-overview');
  await expect(page.locator('#welcome-example-title')).toHaveText('Company <architecture>');
  await expect(page.locator('#welcome-example-label')).toHaveText(' · Internal </script> example');
  await expect(page.locator('#welcome-example-footer')).toHaveText('Company story & details');
  await expect(card.locator('#welcome-example-stage')).toHaveClass(/sk-pastel/);
  await expect(card.locator('#welcome-example-stage > .doc-heading')).toHaveCount(1);
  await expect(card.locator('#welcome-example-stage > .doc-heading')).toBeHidden();
  await expectCompanyBrand(card.locator('.doc-company-brand'));
  await expect(page.locator('body')).not.toHaveClass(/sk-blueprint/);
  await expect(section).toBeVisible();
  await expect(card.locator('#section-company-processing')).toBeHidden();
  await expect(card.getByText('Company introduction before the featured diagram.')).toBeHidden();
  await expect(section.getByRole('button',{name:'Explore',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(section.locator('.section-layout-grid')).toBeHidden();
  const fits=async()=>{await expect.poll(async()=>{
    const outer=await card.boundingBox(),inner=await card.locator('#welcome-example-stage').boundingBox();
    return Math.abs(outer.height-inner.height)+Math.abs(outer.width-inner.width);
  }).toBeLessThan(2);};
  await fits();await page.screenshot({path:info.outputPath('company-desktop.png')});
  await page.setViewportSize({width:390,height:844});await fits();
  await page.locator('.welcome-example').screenshot({path:info.outputPath('company-narrow.png')});
  await page.setViewportSize({width:1800,height:1200});
  await section.getByRole('button',{name:'Go to step 3 on Internet down',exact:true}).click();
  const caption=await section.locator('.stepline').textContent();
  await page.locator('#welcome-example-expand').click();
  const expanded=practice(page).locator('#section-company-overview');
  await expect(page.locator('.workbench-tour-header>b')).toHaveText('Company <architecture> · Internal </script> example');
  await expect(practice(page).locator('#docview')).toHaveClass(/sk-blueprint/);
  await expect(page.locator('body')).not.toHaveClass(/sk-blueprint/);
  await expect(expanded.getByRole('button',{name:'Explore',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect.poll(()=>expanded.locator('.stepline').textContent()).toBe(caption);
  await expect(expanded.getByText('Company ingestion',{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('company-expanded.png')});
  await expanded.locator('[data-dv-detail="company-service"]').click();
  await expect(practice(page).locator('[data-dv-detail-preview]:visible')).toHaveCount(1);
  await practice(page).locator('[data-dv-detail-preview]:visible .detail-breadcrumb button').first().click();
  await expect(expanded).toBeVisible();
  await page.getByRole('button',{name:'1. Explore a diagram',exact:true}).click();
  await expect(practice(page).locator('#section-company-overview')).toBeVisible();
  await expect(practice(page).getByRole('button',{name:/Show me both/})).toBeVisible();
  await page.getByRole('button',{name:'3. Edit in workbench',exact:true}).click();
  await expect(heading(practice(page))).toHaveText('Start with Add to Diagram');
  const manual=JSON.parse(await practice(page).locator('#src').inputValue());
  expect(manual.page.sections[0].id).toBe('visitor');
  expect(manual.page.sections[0].diagram.nodes.cloud).toBeTruthy();
  await page.getByRole('button',{name:'2. Work with my agent',exact:true}).click();
  for(let i=0;i<7;i++)await next(practice(page));
  const agent=JSON.parse(await practice(page).locator('#src').inputValue());
  expect(agent.page.sections[0].id).toBe('visitor');
  expect(agent.page.sections[0].diagram.nodes.cloud.sub).toContain('Validate event');
});
