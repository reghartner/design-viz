import {test,expect,pastePage,inspectPageElement,openInspectorGroup} from '../helpers/test.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../../..',import.meta.url));
const fixture=path.join(repo,'src/starters/messaging-cost.json');
const sixFixture=path.join(repo,'src/starters/cost-six-operations.json');

test('portable cost comparison follows alternate paths, resets volume, and fits narrow/print layouts',async({page,server},testInfo)=>{
  execFileSync('python3',[path.join(repo,'tools/inject.py'),fixture,path.join(repo,'template/flowview.html'),path.join(server.root,'cost.html')]);
  await page.goto(server.origin+'/cost.html');
  const panel=page.locator('.cost-panel'),next=page.getByRole('button',{name:'Next step',exact:true});
  await expect(panel.locator('.cost-total')).toHaveText(['USD 3.20','USD 13.40']);
  await expect(panel.locator('.cost-delta')).toContainText('USD 10.20 more');
  await expect(panel.locator('.cost-nodes')).toHaveText(['3 linked engineering nodes','4 linked engineering nodes']);
  await expect(panel.locator('.cost-details')).not.toHaveAttribute('open');
  const bars=await panel.locator('.cost-stack').evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().height));
  expect(bars[1]).toBeGreaterThan(220);
  expect(bars[0]/bars[1]).toBeCloseTo(3.2/13.4,2);
  await expect(panel.locator('.cost-fixed')).toHaveCount(1);
  await next.click();await expect(panel.locator('.cost-route-0')).toHaveClass(/cost-active/);
  await next.click();await next.click();
  await expect(panel.locator('.cost-total')).toHaveText(['USD 32.00','USD 26.00']);
  await expect(panel.locator('.cost-delta')).toContainText('USD 6.00 less');
  await page.locator('.path-chip[data-dv-path="queue"]').click();
  await expect(panel.locator('.cost-basis')).toContainText('1,000,000 messages');
  await expect(panel.locator('.cost-active')).toHaveCount(0);
  await next.click();await expect(panel.locator('.cost-route-1')).toHaveClass(/cost-active/);
  for(let i=0;i<4;i++)await next.click();
  await expect(panel.locator('.cost-total')).toHaveText(['USD 320.00','USD 152.00']);
  await expect(panel.locator('.cost-delta')).toContainText('USD 168.00 less');
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:testInfo.outputPath('cost-desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'Compact comparison',exact:true}).click();
  await expect(panel.getByRole('region',{name:'Alternative: Queue + relay. Following',exact:true})).toBeVisible();
  await expect(panel.getByRole('region',{name:'Baseline: Managed event bus',exact:true})).toBeVisible();
  await expect(panel.locator('.cost-plot').first()).toHaveCSS('height','22px');
  await expect.poll(()=>panel.locator('.cost-routes').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(1);
  await expect(panel.locator('.cost-total')).toHaveText(['USD 320.00','USD 152.00']);
  const consumer=await page.locator('[data-dv-node="consumer"] .card').boundingBox();
  const transport=await page.locator('.step-transport').boundingBox();
  expect(consumer.y+consumer.height).toBeLessThanOrEqual(transport.y);
  await page.screenshot({path:testInfo.outputPath('cost-compact-view.png'),fullPage:true});
  await page.getByRole('button',{name:'Architecture & cost',exact:true}).click();
  // Compare at the reference canvas width before shrinking the whole layout.
  const section=page.locator('.doc-sec').first(),tile=page.locator('.pt-cost');
  await section.evaluate(el=>{el.style.width='1000px';el.style.boxSizing='content-box';});
  await expect.poll(()=>section.locator('.section-layout-grid').evaluate(el=>el.getBoundingClientRect().width)).toBeCloseTo(1000,0);
  const reference=await tile.boundingBox();
  await section.evaluate(el=>{el.style.width='';el.style.boxSizing='';});
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>section.locator('.section-layout-grid').evaluate(el=>Number(getComputedStyle(el).zoom))).toBeLessThan(.4);
  // Scaling retains the authored side-by-side routes and vertical bars.
  await expect.poll(()=>panel.locator('.cost-routes').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2);
  expect(await panel.locator('.cost-plot').first().evaluate(el=>parseFloat(getComputedStyle(el).height))).toBeCloseTo(230,0);
  const narrow=await tile.boundingBox(),scale=await section.locator('.section-layout-grid').evaluate(el=>Number(getComputedStyle(el).zoom));
  expect(narrow.width).toBeCloseTo(reference.width*scale,0);
  expect(narrow.height).toBeCloseTo(reference.height*scale,0);
  const narrowBars=await panel.locator('.cost-stack').evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().height));
  expect(narrowBars[1]/narrowBars[0]).toBeCloseTo(152/320,2);
  expect(narrow.x+narrow.width).toBeLessThanOrEqual(390);
  expect(await panel.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  await page.locator('.pt-cost').screenshot({path:testInfo.outputPath('cost-narrow.png')});
  // The scaled panel keeps its conclusion and disclosure reachable by scrolling.
  await panel.locator('.cost-delta').scrollIntoViewIfNeeded();
  await expect(panel.locator('.cost-delta')).toBeInViewport();
  await page.locator('.pt-cost').screenshot({path:testInfo.outputPath('cost-narrow-conclusion.png')});
  await panel.locator('.cost-details summary').click();
  await expect(panel.locator('.cost-details')).toHaveAttribute('open','');
  await panel.locator('.cost-assumptions').scrollIntoViewIfNeeded();
  await expect(panel.locator('.cost-assumptions')).toBeInViewport();
  await expect(panel.locator('.cost-assumptions')).toContainText('Illustrative USD rates');
  await panel.locator('.cost-details summary').click();
  await page.setViewportSize({width:1400,height:1000});await page.emulateMedia({media:'print'});
  await expect(panel.locator('.cost-total')).toHaveText(['USD 320.00','USD 152.00']);
  await expect(page.locator('.pt-cost')).toHaveCSS('background-color','rgb(255, 255, 255)');
  expect(await panel.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:testInfo.outputPath('cost-print.png'),fullPage:true});
});

test('cost editor changes starting volume and rates with exact Undo/Redo',async({page,server})=>{
  const raw=JSON.parse(await readFile(fixture,'utf8'));
  raw.page.sections[0].diagram.panels[0].routes[0].label='Managed bus with regional routing and replay retention';
  // Omit the opening workload override to make starting-state edits visible.
  delete raw.page.sections[0].diagram.steps[0].panels.costs.messages;
  const original=JSON.stringify(raw,null,2);
  await page.goto(server.origin+'/workbench.html');await pastePage(page,original);
  const root=page.locator('#docview'),guide=page.locator('#guide'),source=page.locator('#src');
  await inspectPageElement(page,root.locator('.pt-cost .ptitle'));
  const initial=guide.locator('.initialedit');await openInspectorGroup(initial);
  const messages=initial.getByLabel('messages',{exact:true});
  await messages.fill('10000000');await messages.press('Tab');
  await expect(root.locator('.cost-total')).toHaveText(['USD 32.00','USD 26.00']);
  const changed=await source.inputValue();expect(changed).not.toBe(original);
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(original);
  await expect(root.locator('.cost-total')).toHaveText(['USD 3.20','USD 13.40']);
  await page.locator('#redo-builder').click();await expect(source).toHaveValue(changed);
  await inspectPageElement(page,root.locator('.pt-cost .ptitle'));
  const rate=guide.getByLabel('Cost per 1M units',{exact:true}).nth(1);
  await rate.fill('3.8');await rate.press('Tab');
  await expect(root.locator('.cost-total')).toHaveText(['USD 42.00','USD 26.00']);
  expect(JSON.parse(await source.inputValue()).page.sections[0].diagram.panels[0].items[1].node).toBe('bus');
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(changed);
  await inspectPageElement(page,root.locator('.pt-cost .ptitle'));
  const density=guide.getByLabel('Display density',{exact:true});
  await density.selectOption('compact');
  await expect(root.locator('.cost-panel')).toHaveClass(/cost-compact/);
  await expect(root.locator('.cost-plot').first()).toHaveCSS('height','22px');
  const compact=await source.inputValue();
  expect(JSON.parse(compact).page.sections[0].diagram.panels[0].density).toBe('compact');
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(changed);
  await page.locator('#redo-builder').click();await expect(source).toHaveValue(compact);
  await inspectPageElement(page,root.locator('.pt-cost .ptitle'));
  await density.selectOption('expanded');
  await page.setViewportSize({width:390,height:844});
  // CSS zoom can round the computed layout height by a fraction of a pixel.
  expect(await root.locator('.cost-plot').first().evaluate(el=>parseFloat(getComputedStyle(el).height))).toBeCloseTo(230,0);
  const baselines=await root.locator('.cost-plot').evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().bottom));
  expect(Math.abs(baselines[0]-baselines[1])).toBeLessThanOrEqual(1);
});

test('single operation keeps component amounts visible in auto, compact, expanded, narrow and print views',async({page,server},testInfo)=>{
  const input=path.join(repo,'src/starters/operation-cost.json');
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),path.join(server.root,'operation-cost.html')]);
  await page.goto(server.origin+'/operation-cost.html');
  await page.evaluate(()=>document.fonts.ready);
  const panel=page.locator('.cost-panel');
  await expect(panel.locator('.cost-total')).toHaveText('USD 0.10');
  await expect(panel.locator('.cost-components b')).toHaveText(['USD 0.06','USD 0.01','USD 0.03']);
  await expect(panel.locator('.cost-component-share')).toHaveText(['60.0%','10.0%','30.0%']);
  await expect(panel.locator('.cost-delta,.cost-flow,.cost-nodes')).toHaveCount(0);
  await expect(panel.locator('.cost-details')).not.toHaveAttribute('open');
  await expect(panel.getByRole('region',{name:'Operation: Process one document',exact:true})).toBeVisible();
  for(const density of ['auto','compact','expanded']){
    await panel.evaluate((el,d)=>{el.classList.remove('cost-auto','cost-compact','cost-expanded');el.classList.add('cost-'+d);},density);
    for(const width of [1800,390]){
      await page.setViewportSize({width,height:1000});
      await expect(panel.locator('.cost-components')).toBeVisible();
      for(const label of ['Compute','Storage','External API'])await expect(panel.locator('.cost-component-label').filter({hasText:new RegExp('^'+label+'$')})).toBeVisible();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      expect(await panel.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
      const route=await panel.locator('.cost-route').boundingBox(),components=await panel.locator('.cost-components').boundingBox();
      expect(components.x).toBeGreaterThanOrEqual(route.x);
      expect(components.x+components.width).toBeLessThanOrEqual(route.x+route.width+1);
      expect(components.y+components.height).toBeLessThanOrEqual(route.y+route.height+1);
      await page.locator('.pt-cost').screenshot({path:testInfo.outputPath('operation-'+density+'-'+width+'.png')});
    }
  }
  await page.setViewportSize({width:1800,height:1200});await page.emulateMedia({media:'print'});
  await expect(panel.locator('.cost-total')).toHaveText('USD 0.10');
  expect(await panel.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:testInfo.outputPath('operation-print.png'),fullPage:true});
});

test('six operations render as one readable row at wide widths and wrap without clipping when narrow',async({page,server},testInfo)=>{
  execFileSync('python3',[path.join(repo,'tools/inject.py'),sixFixture,path.join(repo,'template/flowview.html'),path.join(server.root,'cost-six.html')]);
  await page.goto(server.origin+'/cost-six.html');
  await page.evaluate(()=>document.fonts.ready);
  const panel=page.locator('.cost-panel'),routes=panel.locator('.cost-route');
  const labels=['Image preprocessing','Document text extraction','Embedding generation','Model inference','Database writes','Audit and notification'];
  await expect(routes).toHaveCount(6);
  await expect(panel.locator('.cost-route h4')).toHaveText(labels);
  await expect(panel.locator('.cost-total')).toHaveText(['USD 0.04','USD 0.06','USD 0.03','USD 0.14','USD 0.05','USD 0.03']);
  await expect(panel.locator('.cost-component-label')).toHaveCount(18);
  await expect(panel.locator('.cost-components b')).toHaveCount(18);
  await expect(panel.locator('.cost-component-share')).toHaveCount(18);

  const geometry=async()=>routes.evaluateAll(cards=>cards.map(card=>{
    const outer=card.getBoundingClientRect();
    const content=[...card.querySelectorAll('h4,.cost-total,.cost-component-label,.cost-components b,.cost-component-share')].map(el=>{
      const box=el.getBoundingClientRect();return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,text:el.textContent.trim()};
    });
    return {left:outer.left,right:outer.right,top:outer.top,bottom:outer.bottom,content};
  }));
  const expectUnclipped=cards=>{
    for(const card of cards)for(const item of card.content){
      expect(item.text.length).toBeGreaterThan(0);
      expect(item.left).toBeGreaterThanOrEqual(card.left-1);
      expect(item.right).toBeLessThanOrEqual(card.right+1);
      expect(item.top).toBeGreaterThanOrEqual(card.top-1);
      expect(item.bottom).toBeLessThanOrEqual(card.bottom+1);
    }
  };
  const expectOneRow=cards=>{
    expect(cards).toHaveLength(6);expectUnclipped(cards);
    for(let i=0;i<cards.length;i++){
      expect(Math.abs(cards[i].top-cards[0].top)).toBeLessThanOrEqual(1);
      if(i)expect(cards[i].left).toBeGreaterThanOrEqual(cards[i-1].right-1);
    }
  };

  for(const density of ['auto','compact','expanded']){
    await panel.evaluate((el,d)=>{el.classList.remove('cost-auto','cost-compact','cost-expanded');el.classList.add('cost-'+d);},density);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    expectOneRow(await geometry());
    expect(await panel.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
    await panel.screenshot({path:testInfo.outputPath('six-'+density+'-wide.png')});
  }

  await panel.evaluate(el=>{el.classList.remove('cost-expanded');el.classList.add('cost-auto');el.style.width='1100px';});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expectOneRow(await geometry());
  expect(await panel.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  await panel.screenshot({path:testInfo.outputPath('six-auto-1100.png')});

  await panel.evaluate(el=>el.style.width='700px');
  await expect.poll(()=>panel.locator('.cost-routes').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2);
  let narrow=await geometry();expectUnclipped(narrow);
  expect(Math.abs(narrow[0].top-narrow[1].top)).toBeLessThanOrEqual(1);
  expect(narrow[2].top).toBeGreaterThan(narrow[0].bottom-1);
  expect(await panel.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);

  await panel.evaluate(el=>el.style.width='500px');
  await expect(panel.locator('.cost-plot').first()).toHaveCSS('height','22px');
  await expect.poll(()=>panel.locator('.cost-routes').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2);
  narrow=await geometry();expectUnclipped(narrow);
  expect(await panel.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  await panel.screenshot({path:testInfo.outputPath('six-auto-500.png')});

  await panel.evaluate(el=>{el.style.width='';el.classList.remove('cost-auto');el.classList.add('cost-expanded');});
  await page.emulateMedia({media:'print'});
  expectOneRow(await geometry());
  await expect(panel.locator('.cost-total')).toHaveCount(6);
  await page.locator('.pt-cost').screenshot({path:testInfo.outputPath('six-print.png')});

  const large=JSON.parse(await readFile(sixFixture,'utf8'));
  large.page.sections[0].diagram.panels[0].items[0].fixed=12345.648;
  const largeFile=path.join(server.root,'cost-six-large.json');
  await writeFile(largeFile,JSON.stringify(large));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),largeFile,path.join(repo,'template/flowview.html'),path.join(server.root,'cost-six-large.html')]);
  await page.emulateMedia({media:'screen'});await page.goto(server.origin+'/cost-six-large.html');
  const largePanel=page.locator('.cost-panel');
  await largePanel.evaluate(el=>el.style.width='770px');
  await expect(largePanel.locator('.cost-total').first()).toHaveText('USD 12,345.67');
  await expect.poll(()=>largePanel.locator('.cost-routes').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(6);
  const largeCard=largePanel.locator('.cost-route').first();
  const [cardBox,totalBox]=await Promise.all([largeCard.boundingBox(),largeCard.locator('.cost-total').boundingBox()]);
  expect(totalBox.x).toBeGreaterThanOrEqual(cardBox.x-1);expect(totalBox.x+totalBox.width).toBeLessThanOrEqual(cardBox.x+cardBox.width+1);
  expect(await largePanel.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
});

test('operation editor roundtrips fixed component edits and three-entry following state',async({page,server},testInfo)=>{
  const raw=JSON.parse(await readFile(path.join(repo,'src/starters/operation-cost.json'),'utf8'));
  const original=JSON.stringify(raw,null,2);
  await page.goto(server.origin+'/workbench.html');await pastePage(page,original);
  const root=page.locator('#docview'),guide=page.locator('#guide'),source=page.locator('#src');
  await inspectPageElement(page,root.locator('.pt-cost .ptitle'));
  const fixed=guide.getByLabel('Fixed cost per period',{exact:true}).first();
  await fixed.fill('0.16');await fixed.press('Tab');
  await expect(root.locator('.cost-total')).toHaveText('USD 0.20');
  await expect(root.locator('.cost-component-share')).toHaveText(['80.0%','5.0%','15.0%']);
  const changed=await source.inputValue();
  await page.locator('#undo-builder').click();await expect(source).toHaveValue(original);
  await expect(root.locator('.cost-total')).toHaveText('USD 0.10');
  await page.locator('#redo-builder').click();await expect(source).toHaveValue(changed);
  const p=raw.page.sections[0].diagram.panels[0];
  p.routes.push({id:'second',label:'Second operation'},{id:'third',label:'Third operation'});
  p.items.push({route:'second',label:'Compute',perMillion:0,fixed:.2},{route:'third',label:'Compute',perMillion:0,fixed:.3});
  p.initial.activeRoute='third';
  const file=path.join(server.root,'three.json');await writeFile(file,JSON.stringify(raw));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),path.join(server.root,'three.html')]);
  await page.goto(server.origin+'/three.html');
  const panel=page.locator('.cost-panel');
  await expect(panel.locator('.cost-total')).toHaveText(['USD 0.10','USD 0.20','USD 0.30']);
  await expect(panel.getByRole('region',{name:'Operation: Third operation. Following',exact:true})).toBeVisible();
  await expect(panel.locator('.cost-delta')).toHaveCount(0);
  const bars=await panel.locator('.cost-stack').evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().height));
  expect(bars[0]/bars[2]).toBeCloseTo(1/3,2);expect(bars[1]/bars[2]).toBeCloseTo(2/3,2);
  await page.locator('.pt-cost').screenshot({path:testInfo.outputPath('three-entries.png')});
  await panel.locator('.cost-route-2 .cost-components').scrollIntoViewIfNeeded();
  await expect(panel.locator('.cost-route-2 .cost-components')).toBeInViewport();
  await page.locator('.pt-cost').screenshot({path:testInfo.outputPath('three-entries-scrolled.png')});
  await panel.evaluate(el=>{el.classList.remove('cost-auto');el.classList.add('cost-compact');});
  await expect(panel.locator('.cost-plot').first()).toHaveCSS('height','22px');
  await expect(panel.locator('.cost-component-label')).toHaveText(['Compute','Storage','External API','Compute','Compute']);
  for(const media of ['screen','print']){
    await page.setViewportSize({width:390,height:844});await page.emulateMedia({media});
    expect(await panel.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
    await expect(panel.getByRole('region',{name:'Operation: Third operation. Following',exact:true})).toBeVisible();
  }
});
