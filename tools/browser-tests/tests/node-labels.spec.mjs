import {test,expect,chooseNavigation,pastePage} from '../helpers/test.mjs';
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';

const canon=JSON.parse(await readFile(new URL('../../../examples/canon/specs/doorbell.json',import.meta.url),'utf8'));
async function openCanon(page,server,spec=canon){
  await page.route('**/diagrams.json',route=>route.fulfill({json:{version:1,diagrams:[{id:'doorbell',title:'Canonical doorbell flow',spec}]}}));
  await page.goto(server.origin+'/workbench.html?diagram=doorbell');
  await expect(page.locator('#canon-reader-edit')).toBeEnabled();
  const chapter=page.getByRole('button',{name:'Data flow',exact:true});
  if(await chapter.count())await chapter.click();
  await page.evaluate(()=>document.fonts.ready);
}

async function expectContainedTitles(reader){
  const failures=await reader.locator('.node').evaluateAll(nodes=>{
    const overlap=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
    return nodes.flatMap(node=>{
      const card=node.querySelector('.card').getBoundingClientRect();
      const title=node.querySelector('.t1');
      const lines=Array.from(title.querySelectorAll('tspan'));if(!lines.length)lines.push(title);
      const controls=Array.from(node.querySelectorAll('.nlink :is(circle,.nhit),.nbackref :is(circle,.nhit),.detail-trigger rect,.t2'),el=>el.getBoundingClientRect());
      return lines.flatMap(line=>{
        const box=line.getBoundingClientRect();
        return box.left<card.left||box.right>card.right+1||box.top<card.top||box.bottom>card.bottom+1||controls.some(c=>overlap(box,c))?[{node:node.dataset.dvNode,text:line.textContent}]:[];
      });
    });
  });
  expect(failures,'title lines fit cards without covering controls or subtitles').toEqual([]);
}
async function expectWordSeparator(reader){
  const title=reader.locator('[data-dv-node="n4"] .t1');
  await expect(title).toHaveText('Clip metadata DB');
  const lines=await title.locator('tspan').allTextContents();
  if(!lines.length)return;
  expect(lines.join('')).toBe('Clip metadata DB');
  expect(lines[0]).not.toMatch(/\s$/);
  expect(lines[1]).toMatch(/^ /);
}

for(const width of [1440,1280])test(`Canon lane names remain distinct at ${width}px Auto and Readable sizes`,async({page,server},info)=>{
  await page.setViewportSize({width,height:1000});await openCanon(page,server);
  const reader=page.locator('#canon-reader');
  for(const mode of ['Auto','Readable']){
    await reader.getByRole('button',{name:mode,exact:true}).click();
    // Readable intentionally pans; show the two notification nodes together.
    if(mode==='Readable')await reader.locator('.board').evaluate(el=>{el.scrollLeft=el.scrollWidth;});
    await expect(reader.locator('[data-dv-node="phone"] .t1')).toHaveText('Notification service');
    await expect(reader.locator('[data-dv-node="queue"] .t1')).toHaveText('Notification queue');
    await expect(reader.locator('[data-dv-node="phone"]>title')).toHaveText('Notification service');
    await expect(reader.locator('[data-dv-node="phone"] .t1')).toHaveAttribute('aria-label','Notification service');
    await expectContainedTitles(reader);
    await reader.locator('.board').screenshot({path:info.outputPath('canon-'+mode.toLowerCase()+'.png')});
  }
});

for(const skin of ['pastel','aurora'])test(`dense ${skin} lane titles stay bounded, including long and Unicode names`,async({page,server},info)=>{
  const titles=['Notification service','Notification queue','Recording service','Doorbell camera','Clip metadata DB',
    'NotificationDeliveryCoordinatorWithAnExtremelyLongName','地域別通知キュー😀😀😀😀😀😀😀😀😀😀😀😀','Identity service','Media library','Device health'];
  const nodes=Object.fromEntries(titles.map((title,i)=>['n'+i,{title,sub:'service',link:'https://example.test/source'}]));
  const spec={page:{title:'Dense services',canon:{version:1,id:'doorbell',kind:'canonical',owner:'group:default/example'},skin,sections:[{heading:'Five services per row',diagram:{routing:'lanes',autoplay:false,
    nodes,rows:[['n0','n1','n2','n3','n4'],['n5','n6','n7','n8','n9']],
    edges:Array.from({length:5},(_,i)=>({from:'n'+i,to:'n'+(i+5)}))}}]}};
  await page.context().addCookies([{name:'dv_skin',value:skin,url:server.origin}]);
  await openCanon(page,server,spec);const reader=page.locator('#canon-reader');
  for(const width of [1440,1280]){
    await page.setViewportSize({width,height:1000});
    for(const mode of ['Auto','Readable']){
      await reader.getByRole('button',{name:mode,exact:true}).click();
      await expectContainedTitles(reader);
      for(const i of [0,1,2,3,4,7,8,9])await expect(reader.locator(`[data-dv-node="n${i}"] .t1`)).toHaveText(titles[i]);
      await expectWordSeparator(reader);
      for(const i of [5,6]){
        await expect(reader.locator(`[data-dv-node="n${i}"] .t1`)).toHaveAttribute('aria-label',titles[i]);
        await expect(reader.locator(`[data-dv-node="n${i}"] .t1`)).toContainText('…');
        await expect(reader.locator(`[data-dv-node="n${i}"] .t1`)).not.toContainText('�');
      }
      const cards=await reader.locator('.node>.card').evaluateAll(els=>els.map(el=>({x:Number(el.parentNode.transform.baseVal.getItem(0).matrix.e),w:Number(el.getAttribute('width')),h:Number(el.getAttribute('height'))})));
      expect(cards.every(card=>card.h===54)).toBe(true);
      expect(cards[1].x-cards[0].x-cards[0].w).toBeGreaterThanOrEqual(40);
      await reader.locator('.board').screenshot({path:info.outputPath(`dense-${width}-${mode.toLowerCase()}.png`)});
    }
  }
  // Hosts can change fonts without replacing the board.
  for(const next of ['terminal','blueprint','editorial','daylight']){
    await page.evaluate(skin=>window.dvSetSkin(skin),next);
    await page.evaluate(()=>document.fonts.ready);
    await expectContainedTitles(reader);
    await expectWordSeparator(reader);
  }
});

/* #549 — node labels in standalone pages, every routing, every Tab.
   row | fixture | assertion (scoped) | rejects
   1 truncated title: hover | long titles, default+lane routing | cut title ⇒ node's own <title> child == authored title (any <title> present must match) | ellipsis with no tooltip; tooltip only on lane boards
   2 truncated title: AT | same | cut title ⇒ that node's .t1 aria-label == authored title and shown text ends in … | silent clipping; label lost to screen readers
   3 subtitle inside card | long subs, link + detail trigger, small float card | .t2 rect within its own .card rect | subtitle drawn past the card edge (Backstage "hosted by Flowview service")
   4 truncated subtitle exposed | same | .t2 aria-label and .t2>title == authored sub | subtitle cut without full text
   5 link icon clear of title | link/backref/drill controls on every card | authored link ⇒ that node's .nlink exists; each title line rect ∩ that node's control rects = ∅ | ↗ over the title; titles fitted while the Tab was hidden; icons dropped to make room
   0 roster | every authored node | each authored id renders a shown card with .t1 (and .t2 when sub is authored) | a node's label or subtitle silently removed
   6 subtitle clear of controls | detail trigger on a subtitled card | .t2 rect ∩ detail/link rects = ∅ | subtitle under ⊞
   7 hidden Tab | lane board in a second Tab, hidden at load | rows 1-6 after a real Tab click | measuring at display:none (zero widths)
   8 fixture discriminates | per board | ≥1 wrapped title, ≥1 truncated title, ≥1 truncated subtitle | vacuous pass on short labels
   9 Backstage example | committed docs/diagrams/backstage/backstage.html, every Tab, 1440 and 1280 | rows 1-6, truncated titles < 3 (3 on its Overview board today) | stale generated page; regressions in the shipped example */
async function expectBoundedLabels(board,authored){
  return board.locator('.node').evaluateAll((nodes,authored)=>{
    const overlap=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
    const inside=(a,b)=>a.left>=b.left-1&&a.right<=b.right+1&&a.top>=b.top-1&&a.bottom<=b.bottom+1;
    const shown=el=>Array.from(el.childNodes).filter(n=>n.nodeName!=='title').map(n=>n.textContent).join('');
    const report={failures:[],wrapped:0,truncatedTitles:0,truncatedSubs:0};
    // Every authored card is checked: a missing card, label, subtitle or link fails.
    const seen=new Set(nodes.map(node=>node.dataset.dvNode));
    Object.keys(authored).forEach(id=>{if(!seen.has(id))report.failures.push(id+': not rendered');});
    nodes.forEach(node=>{
      const id=node.dataset.dvNode,want=authored[id];if(!want){report.failures.push(id+': not authored');return;}
      const fail=msg=>report.failures.push(id+': '+msg);
      const cardEl=node.querySelector(':scope>.card'),t1=node.querySelector(':scope>.t1');
      if(!cardEl||!t1){fail('card or title missing');return;}
      const card=cardEl.getBoundingClientRect();if(!card.width){fail('card not shown');return;}
      if(want.link&&!node.querySelector(':scope>.nlink :is(circle,.nhit)'))fail('link icon missing');
      // Full text is required once the title is cut; when present it must never be stale.
      const tip=node.querySelector(':scope>title'),label=t1.getAttribute('aria-label'),text=shown(t1),cut=text!==want.title;
      if(cut||tip)if(!tip||tip.textContent!==want.title)fail('hover title is '+JSON.stringify(tip&&tip.textContent));
      if(cut||label!==null)if(label!==want.title)fail('t1 aria-label is '+JSON.stringify(label));
      if(cut){if(!/…$/.test(text))fail('title cut without ellipsis: '+text);else report.truncatedTitles++;}
      const controls=Array.from(node.querySelectorAll('.nlink :is(circle,.nhit),.nbackref :is(circle,.nhit),.detail-trigger rect'),el=>el.getBoundingClientRect());
      const sub=node.querySelector(':scope>.t2'),subBox=sub&&shown(sub)?sub.getBoundingClientRect():null;
      if(want.sub&&!subBox)fail('subtitle missing');
      const lines=Array.from(t1.querySelectorAll('tspan'));if(lines.length>1)report.wrapped++;if(!lines.length)lines.push(t1);
      lines.forEach(line=>{const box=line.getBoundingClientRect();
        if(!inside(box,card))fail('title line outside card: '+line.textContent);
        if(controls.some(c=>overlap(box,c)))fail('title line under a control: '+line.textContent);
        if(subBox&&overlap(box,subBox))fail('title line over subtitle: '+line.textContent);});
      if(subBox){
        if(!inside(subBox,card))fail('subtitle outside card: '+shown(sub));
        if(controls.some(c=>overlap(subBox,c)))fail('subtitle under a control: '+shown(sub));
        if(shown(sub)!==want.sub){
          report.truncatedSubs++;
          if(!/…$/.test(shown(sub)))fail('subtitle cut without ellipsis: '+shown(sub));
          if(sub.getAttribute('aria-label')!==want.sub)fail('t2 aria-label is '+JSON.stringify(sub.getAttribute('aria-label')));
          const subTip=sub.querySelector(':scope>title');if(!subTip||subTip.textContent!==want.sub)fail('subtitle hover is '+JSON.stringify(subTip&&subTip.textContent));
        }
      }
    });
    return report;
  },authored);
}
const authoredOf=diagram=>Object.fromEntries(Object.entries(diagram.nodes).map(([id,n])=>[id,{title:n.title||id,sub:n.sub||'',link:!!n.link}]));

const overflowNodes={
  a:{title:'Notification delivery coordinator service',sub:'hosted by Flowview service with retries',link:'https://example.test/a'},
  b:{title:'GitHub Actions',sub:'source drift scanner',link:'https://example.test/b'},
  c:{title:'Catalog adapter',sub:'server-side credentials and policy',link:'https://example.test/c'},
  d:{title:'Recording service',sub:'immutable source comparison text'},
  e:{title:'NotificationDeliveryCoordinatorWithAnExtremelyLongName',sub:'x'}};
const freeDiagram={autoplay:false,nodes:{...overflowNodes,
    c:{...overflowNodes.c,detail:{section:'child',mode:'focus'}},
    f:{title:'Float observer with a long name',sub:'hosted by Flowview service',link:'https://example.test/f'}},
  rows:[['a','b','c'],['d','e']],floats:[{id:'f',side:'below'}],
  edges:[{from:'a',to:'b'},{from:'b',to:'c'},{from:'a',to:'d'},{from:'d',to:'e'},{from:'e',to:'f'}]};
const laneDiagram={autoplay:false,routing:'lanes',nodes:overflowNodes,rows:[['a','b','c','d','e']],
  edges:[{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'d'},{from:'d',to:'e'}]};
const overflowPage={page:{title:'Label overflow',blocks:[{tabs:[
  {label:'Default',sections:[{id:'free',heading:'Default routing',diagram:freeDiagram},
    {id:'child',heading:'Child',detailOnly:true,diagram:{nodes:{n:{title:'Worker'}},rows:[['n']]}}]},
  {label:'Lanes',sections:[{id:'lanes',heading:'Lane routing',diagram:laneDiagram}]}]}]}};

for(const width of [1440,1280])test(`standalone node labels stay inside cards and expose full text in every routing and Tab at ${width}px`,async({page,server},info)=>{
  await page.setViewportSize({width,height:900});
  const input=path.join(server.root,'label-overflow.json'),output=path.join(server.root,'label-overflow.html');
  await writeFile(input,JSON.stringify(overflowPage));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  await page.goto(server.origin+'/label-overflow.html');await page.evaluate(()=>document.fonts.ready);
  const root=page.locator('#docview'),nav=root.locator('.explore-navigation').first();
  const free=root.locator('#section-free .boardcanvas>svg'),lanes=root.locator('#section-lanes .boardcanvas>svg');
  await expect(free).toBeVisible();await expect(lanes).toBeHidden();
  await expect(free.locator('[data-dv-node="c"] .detail-trigger')).toBeVisible();
  for(const [board,diagram,name] of [[free,freeDiagram,'free'],[lanes,laneDiagram,'lanes']]){
    if(name==='lanes'){await chooseNavigation(nav,'Tab','Lanes');await expect(lanes).toBeVisible();}
    await expect(board.locator('.node')).toHaveCount(Object.keys(diagram.nodes).length);
    const report=await expectBoundedLabels(board,authoredOf(diagram));
    await board.screenshot({path:info.outputPath(`overflow-${name}-${width}.png`)});
    // Soft: one red board must not hide the other routing's result.
    expect.soft(report.failures,name+' labels fit their cards and expose full text').toEqual([]);
    expect.soft(report.wrapped,name+' fixture wraps a title').toBeGreaterThan(0);
    expect.soft(report.truncatedTitles,name+' fixture truncates a title').toBeGreaterThan(0);
    expect.soft(report.truncatedSubs,name+' fixture truncates a subtitle').toBeGreaterThan(0);
  }
});

for(const width of [1440,1280])test(`the shipped Backstage example keeps labels inside cards on every Tab at ${width}px`,async({page,server},info)=>{
  await page.setViewportSize({width,height:900});
  const spec=JSON.parse(await readFile(path.join(repo,'docs/diagrams/backstage/backstage.spec.json'),'utf8'));
  await copyFile(path.join(repo,'docs/diagrams/backstage/backstage.html'),path.join(server.root,`backstage-example-${width}.html`));
  await page.goto(server.origin+`/backstage-example-${width}.html`);await page.evaluate(()=>document.fonts.ready);
  const root=page.locator('#docview'),nav=root.locator('.explore-navigation').first();
  let truncated=0;
  for(const [index,tab] of spec.page.blocks[0].tabs.entries()){
    if(index)await chooseNavigation(nav,'Tab',tab.label);
    for(const section of tab.sections.filter(s=>s.diagram)){
      const board=root.locator('.doc-sec:visible .boardcanvas>svg').filter({has:page.locator(`[data-dv-node="${Object.keys(section.diagram.nodes)[0]}"]`)}).first();
      await expect(board).toBeVisible();
      const report=await expectBoundedLabels(board,authoredOf(section.diagram));
      await board.screenshot({path:info.outputPath(`backstage-${width}-${index}.png`)});
      expect(report.failures,tab.label+' labels fit their cards and expose full text').toEqual([]);
      truncated+=report.truncatedTitles;
    }
  }
  expect(truncated,'fewer truncated titles than the 3 on the shipped Overview board').toBeLessThan(3);
});

/* #549 follow-up (Chuck): corner controls move to the card's left, above the icon,
   so titles get the full width beside the icon column.
   row | fixture | assertion (scoped) | rejects
   10 short titles stay on one line | cumulus v2 "Command path" board at 1440: Nimbus API, Ops Console, Sentinel Auth (short float card), Edge Gateway, Ack Topic | that node's .t1 has no second tspan and shows exactly the authored title | ⋯/↗ still reserving the right edge, so "Nimbus API" wraps and "Sentinel Auth" is cut
   11 controls left of the title | same nodes, each with a link and a references control | every .nlink/.nbackref hit area (circle or .nhit) is left of that node's .t1 rect | controls kept at the top-right over/beside the title
   12 controls above the icon | same | every control rect's bottom ≤ that node's .icbg top, and no control intersects the .icbg or .t1 rect | controls overlapping the icon
   13 title inside the card | same | .t1 rect inside that node's .card rect | a widened title running past the card
   14 controls still work | Nimbus API | a real click on its ⋯ opens "Links for Nimbus API"; Escape returns focus to ⋯, Enter reopens it, Shift+Tab focuses its ↗ (href kept) and Tab returns to ⋯ | a moved control that no longer receives clicks or keyboard focus
   15 board-wide bounds | whole board | rows 0-6 helper over every card | the move breaking any other card */
test('cumulus Command path cards keep short titles on one line beside left-side controls at 1440px',async({page,server},info)=>{
  await page.setViewportSize({width:1440,height:900});
  const raw=JSON.parse(await readFile(path.join(repo,'examples/cumulus/cumulus-page.spec.v2.json'),'utf8'));
  const diagram=raw.page.blocks.flatMap(b=>b.tabs||[]).find(t=>t.label==='Command path').sections.find(s=>s.diagram&&s.diagram.nodes.nimbus).diagram;
  const input=path.join(server.root,'cumulus-labels.json'),output=path.join(server.root,'cumulus-labels.html');
  await writeFile(input,JSON.stringify(raw));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  await page.goto(server.origin+'/cumulus-labels.html');await page.evaluate(()=>document.fonts.ready);
  const board=page.locator('#docview .doc-sec:visible .boardcanvas>svg').filter({has:page.locator('[data-dv-node="nimbus"]')}).first();
  await expect(board).toBeVisible();await board.scrollIntoViewIfNeeded();
  const ids=['nimbus','console','sentinel','gateway','acktopic'];
  for(const id of ids){
    const node=board.locator(`[data-dv-node="${id}"]`);
    await expect(node.locator(':scope>.nlink :is(circle,.nhit)').first()).toBeAttached();
    const geometry=await node.evaluate(el=>{
      const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
      const t1=el.querySelector(':scope>.t1');
      return {lines:t1.querySelectorAll('tspan').length,text:Array.from(t1.childNodes).filter(n=>n.nodeName!=='title').map(n=>n.textContent).join(''),
        title:box(t1),card:box(el.querySelector(':scope>.card')),icon:box(el.querySelector(':scope>.icbg')),
        controls:Array.from(el.querySelectorAll(':scope>.nlink :is(circle,.nhit),:scope>.nbackref :is(circle,.nhit)'),box)};
    });
    const want=diagram.nodes[id].title,overlap=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
    expect.soft(geometry.lines,`${want} stays on one line`).toBeLessThanOrEqual(1);
    expect.soft(geometry.text,`${want} shows in full`).toBe(want);
    expect.soft(geometry.title.right,`${want} stays inside its card`).toBeLessThanOrEqual(geometry.card.right+1);
    expect.soft(geometry.title.left,`${want} starts inside its card`).toBeGreaterThanOrEqual(geometry.card.left-1);
    expect.soft(geometry.controls.length,`${want} has its link and references controls`).toBeGreaterThanOrEqual(2);
    for(const [i,c] of geometry.controls.entries()){
      expect.soft(c.right,`${want} control ${i} is left of the title`).toBeLessThanOrEqual(geometry.title.left+1);
      expect.soft(c.bottom,`${want} control ${i} is above the icon`).toBeLessThanOrEqual(geometry.icon.top+1);
      expect.soft(overlap(c,geometry.icon)||overlap(c,geometry.title),`${want} control ${i} clears icon and title`).toBe(false);
    }
  }
  const nimbus=board.locator('[data-dv-node="nimbus"]');
  await expect(nimbus.locator(':scope>a.nlink')).toHaveAttribute('href',diagram.nodes.nimbus.link);
  const refs=nimbus.locator(':scope>.nrefs-trigger'),source=nimbus.locator(':scope>a.nlink'),links=page.getByRole('dialog',{name:'Links for Nimbus API',exact:true});
  await expect(links).toBeHidden();
  await refs.click();await expect(links).toBeVisible();
  await page.keyboard.press('Escape');await expect(links).toBeHidden();await expect(refs).toBeFocused();
  // Keyboard: Enter reopens ⋯; Shift+Tab reaches ↗ and Tab returns to ⋯.
  await page.keyboard.press('Enter');await expect(links).toBeVisible();
  await page.keyboard.press('Escape');await expect(links).toBeHidden();
  await page.keyboard.press('Shift+Tab');await expect(source).toBeFocused();
  await page.keyboard.press('Tab');await expect(refs).toBeFocused();
  const report=await expectBoundedLabels(board,authoredOf(diagram));
  await board.screenshot({path:info.outputPath('cumulus-command-path.png')});
  expect.soft(report.failures,'every Command path card keeps labels bounded').toEqual([]);
});

/* #549 follow-up (Chuck): icons stay put and full size while the controls sit above them.
   row | fixture | assertion (scoped) | rejects
   16 same-row icons align | doorbell first board at 1440: Relay Broker and Herald Push (no controls) beside Pulse Events (link + references) in one row | each card's .icbg top and centre equal Pulse Events' (±0.5 px) | dropping only the icons of cards with controls
   17 icons keep their size | every card on the doorbell and cumulus Command path boards, including the short float Sentinel Auth | that card's .icbg is 26×26 board units (getBBox) and its glyph <use> width/height are 16 | shrinking icons to make room for the controls
   18 controls still above the icon | Sentinel Auth (short float) and Pulse Events | every control hit area's bottom ≤ that card's .icbg top, no overlap | aligning icons by letting the controls cover them */
test('card icons keep their size and share a row height with or without controls at 1440px',async({page,server},info)=>{
  await page.setViewportSize({width:1440,height:900});
  async function open(file,name,first){
    const input=path.join(server.root,name+'.json'),output=path.join(server.root,name+'.html');
    await writeFile(input,await readFile(path.join(repo,file),'utf8'));
    execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
    await page.goto(server.origin+'/'+name+'.html');await page.evaluate(()=>document.fonts.ready);
    const board=page.locator('#docview .doc-sec:visible .boardcanvas>svg').filter({has:page.locator(`[data-dv-node="${first}"]`)}).first();
    await expect(board).toBeVisible();await board.scrollIntoViewIfNeeded();return board;
  }
  const icon=node=>node.evaluate(el=>{
    const bg=el.querySelector(':scope>.icbg'),glyph=el.querySelector(':scope>use'),r=bg.getBoundingClientRect(),b=bg.getBBox(),g={width:Number(glyph.getAttribute('width')),height:Number(glyph.getAttribute('height'))};
    return {top:r.top,centre:r.top+r.height/2,bottom:r.bottom,left:r.left,right:r.right,w:b.width,h:b.height,gw:g.width,gh:g.height,
      controls:Array.from(el.querySelectorAll(':scope>.nlink :is(circle,.nhit),:scope>.nbackref :is(circle,.nhit)'),c=>{const q=c.getBoundingClientRect();return {left:q.left,right:q.right,top:q.top,bottom:q.bottom};})};
  });
  const overlap=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
  async function sizes(board,label){
    const ids=await board.evaluate(svg=>Array.from(svg.children).filter(n=>n.matches('.node')&&n.querySelector(':scope>.icbg')).map(n=>n.dataset.dvNode));
    expect(ids.length,label+' has icon cards').toBeGreaterThan(3);
    for(const id of ids){const i=await icon(board.locator(`:scope>[data-dv-node="${id}"]`));
      expect.soft([i.w,i.h],`${label} ${id} icon stays 26×26`).toEqual([26,26]);
      expect.soft([i.gw,i.gh],`${label} ${id} glyph stays 16×16`).toEqual([16,16]);}
  }
  const doorbell=await open('examples/doorbell/doorbell.spec.json','icons-doorbell','pulse');
  const pulse=await icon(doorbell.locator(':scope>[data-dv-node="pulse"]'));
  expect(pulse.controls.length,'Pulse Events has its controls').toBeGreaterThanOrEqual(2);
  for(const id of ['relay','herald']){
    const other=await icon(doorbell.locator(`:scope>[data-dv-node="${id}"]`));
    expect(other.controls.length,id+' has no controls').toBe(0);
    expect.soft(Math.abs(other.top-pulse.top),id+' icon top matches Pulse Events').toBeLessThanOrEqual(0.5);
    expect.soft(Math.abs(other.centre-pulse.centre),id+' icon centre matches Pulse Events').toBeLessThanOrEqual(0.5);
  }
  for(const c of pulse.controls){expect.soft(c.bottom,'Pulse Events control above its icon').toBeLessThanOrEqual(pulse.top+1);expect.soft(overlap(c,pulse),'Pulse Events control clears its icon').toBe(false);}
  await sizes(doorbell,'doorbell');
  await doorbell.screenshot({path:info.outputPath('doorbell-icons.png')});
  const cumulus=await open('examples/cumulus/cumulus-page.spec.v2.json','icons-cumulus','sentinel');
  const sentinel=await icon(cumulus.locator(':scope>[data-dv-node="sentinel"]'));
  expect(sentinel.controls.length,'Sentinel Auth has its controls').toBeGreaterThanOrEqual(2);
  for(const c of sentinel.controls){expect.soft(c.bottom,'Sentinel Auth control above its icon').toBeLessThanOrEqual(sentinel.top+1);expect.soft(overlap(c,sentinel),'Sentinel Auth control clears its icon').toBe(false);}
  await sizes(cumulus,'cumulus');
  await cumulus.screenshot({path:info.outputPath('cumulus-icons.png')});
});

/* #549 follow-up (Chuck): short (float) cards grow so the full-size icon has equal room above and below.
   row | fixture | assertion (scoped) | rejects
   19 subtitled float taller | cumulus Sentinel Auth (Command path) and Frozen (OTA rollout) floats | that card's .card height is 58 for two title lines plus subtitle | squeezing labels or icons into the title-only 50-high card
   20 regular cards unchanged | every non-float card on both boards | .card height stays 54 | growing every card
   21 equal icon gaps | Sentinel Auth and Frozen | icon top − control-row bottom equals card bottom − icon bottom (±1), both ≥ 2 | icon touching the control row or the card edge
   22 icon full size | same | .icbg 26×26 | shrinking the icon instead
   23 edges meet the real edge | every edge touching Sentinel Auth / Frozen | the path end at that card lies within 0.5 units of the card's top or bottom edge (ends sit exactly on the edge; a 44-high port would be 3 off) and inside its x span | ports still computed for the 44-high card
   24 no overlap | every card pair on both boards | card rects (board units) do not intersect | a taller float colliding with a row card */
test('short float cards grow so the full-size icon has equal space above and below at 1440px',async({page,server},info)=>{
  await page.setViewportSize({width:1440,height:900});
  const raw=JSON.parse(await readFile(path.join(repo,'examples/cumulus/cumulus-page.spec.v2.json'),'utf8'));
  const tabs=raw.page.blocks.flatMap(b=>b.tabs||[]);
  const input=path.join(server.root,'short-cards.json'),output=path.join(server.root,'short-cards.html');
  await writeFile(input,JSON.stringify(raw));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  await page.goto(server.origin+'/short-cards.html');await page.evaluate(()=>document.fonts.ready);
  const nav=page.locator('#docview .explore-navigation').first();
  for(const [label,floatId] of [['Command path','sentinel'],['OTA rollout','frozen']]){
    if(label!=='Command path')await chooseNavigation(nav,'Tab',label);
    const diagram=tabs.find(t=>t.label===label).sections.find(s=>s.diagram&&s.diagram.nodes[floatId]).diagram;
    const floats=new Set((diagram.floats||[]).map(f=>f.id));
    const board=page.locator('#docview .doc-sec:visible .boardcanvas>svg').filter({has:page.locator(`[data-dv-node="${floatId}"]`)}).first();
    await expect(board).toBeVisible();await board.scrollIntoViewIfNeeded();
    const edgeIds=diagram.edges.map((e,i)=>e.from===floatId||e.to===floatId?i:-1).filter(i=>i>=0);
    const g=await board.evaluate((svg,{floatId,edgeIds})=>{
      const inv=svg.getScreenCTM().inverse(),pt=(x,y)=>new DOMPoint(x,y).matrixTransform(inv);
      const rect=el=>{const r=el.getBoundingClientRect(),a=pt(r.left,r.top),b=pt(r.right,r.bottom);return {left:a.x,top:a.y,right:b.x,bottom:b.y};};
      const cards=Array.from(svg.children).filter(n=>n.matches('.node')&&n.querySelector(':scope>.card')).map(n=>{const c=n.querySelector(':scope>.card');return {id:n.dataset.dvNode,h:Number(c.getAttribute('height')),box:rect(c)};});
      const node=svg.querySelector(`:scope>[data-dv-node="${floatId}"]`),bg=node.querySelector(':scope>.icbg');
      const hits=Array.from(node.querySelectorAll(':scope>.nlink :is(circle,.nhit),:scope>.nbackref :is(circle,.nhit)'),h=>{const b=h.getBBox();return b.y+b.height;});
      const ends=edgeIds.map(i=>{const p=svg.querySelector(`path.edge[data-dv-edge="${i}"]`),m=p.getScreenCTM(),len=p.getTotalLength();
        return [p.getPointAtLength(0),p.getPointAtLength(len)].map(q=>{const s=new DOMPoint(q.x,q.y).matrixTransform(m);return pt(s.x,s.y);}).map(q=>({x:q.x,y:q.y}));});
      return {cards,hitBottom:Math.max(...hits),iconY:Number(bg.getAttribute('y')),iconW:bg.getBBox().width,iconH:bg.getBBox().height,ends};
    },{floatId,edgeIds});
    const short=g.cards.find(c=>c.id===floatId);
    expect.soft(short.h,`${label}: ${floatId} reserves 58 for title and subtitle`).toBe(58);
    for(const c of g.cards.filter(c=>!floats.has(c.id)))expect.soft(c.h,`${label}: ${c.id} keeps 54`).toBe(54);
    expect(g.hitBottom,`${label}: ${floatId} has its controls`).toBeGreaterThan(0);
    const top=g.iconY-g.hitBottom,bottom=short.h-(g.iconY+g.iconH);
    expect.soft(Math.abs(top-bottom),`${label}: ${floatId} icon gaps ${top} above / ${bottom} below are equal`).toBeLessThanOrEqual(1);
    expect.soft(Math.min(top,bottom),`${label}: ${floatId} icon clears row and edge`).toBeGreaterThanOrEqual(2);
    expect.soft([g.iconW,g.iconH],`${label}: ${floatId} icon stays 26×26`).toEqual([26,26]);
    expect(g.ends.length,`${label}: ${floatId} has edges`).toBeGreaterThan(0);
    for(const end of g.ends){
      const at=end.map(p=>({p,d:Math.min(Math.abs(p.y-short.box.top),Math.abs(p.y-short.box.bottom))})).sort((a,b)=>a.d-b.d)[0];
      expect.soft(at.d,`${label}: edge meets ${floatId}'s top or bottom edge`).toBeLessThanOrEqual(0.5);
      expect.soft(at.p.x>=short.box.left-1&&at.p.x<=short.box.right+1,`${label}: edge end inside ${floatId}'s x span`).toBe(true);
    }
    const hit=(a,b)=>a.left<b.right-0.5&&a.right>b.left+0.5&&a.top<b.bottom-0.5&&a.bottom>b.top+0.5;
    g.cards.forEach((a,i)=>g.cards.slice(i+1).forEach(b=>expect.soft(hit(a.box,b.box),`${label}: ${a.id} and ${b.id} do not overlap`).toBe(false)));
    const labels=await expectBoundedLabels(board,authoredOf(diagram));
    expect.soft(labels.failures,`${label}: title lines and subtitles remain separate and bounded`).toEqual([]);
    await board.screenshot({path:info.outputPath(`short-${floatId}.png`)});
  }
});

// Count the browser's actual SVG measurements at the production entrypoint;
// CI checks work avoided, not a machine-dependent elapsed-time threshold.
async function countTitleMeasurements(page){
  await page.addInitScript(()=>{
    window.titleMeasures=0;window.titleStyleNames=0;window.titleStyleValues=0;
    const computed=window.getComputedStyle;
    window.getComputedStyle=function(element,...args){
      const style=computed.call(this,element,...args);
      if(!element.matches('.t1,.t2'))return style;
      return new Proxy(style,{get(target,name){
        if(typeof name==='string' && /^\d+$/.test(name))window.titleStyleNames++;
        if(name==='getPropertyValue')return property=>{window.titleStyleValues++;return target.getPropertyValue(property);};
        const value=Reflect.get(target,name,target);return typeof value==='function'?value.bind(target):value;
      }});
    };
    const original=SVGTextContentElement.prototype.getComputedTextLength;
    SVGTextContentElement.prototype.getComputedTextLength=function(...args){
      if(this.matches('.t1,.t2'))window.titleMeasures++;
      return original.apply(this,args);
    };
  });
}
async function settledFonts(page){
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
}
async function labelSnapshot(board){
  return board.locator('.node').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.dvNode,
    title:n.querySelector('.t1')?.outerHTML,sub:n.querySelector('.t2')?.outerHTML,
    tip:n.querySelector(':scope>title')?.textContent})));
}

test('position edits reuse all 50 fitted titles across replaced boards and same-skin calls do no fitting work',async({page,server},info)=>{
  await countTitleMeasurements(page);
  const diagram={view:'ambient',autoplay:false,nodes:{},rows:[[]],floats:[],edges:[]};
  for(let i=0;i<50;i++){
    diagram.nodes['n'+i]={title:i%3?'Service '+i:'Notification delivery coordinator '+i,sub:'Platform component',link:'https://example.test/'+i};
    diagram.floats.push({id:'n'+i,side:'below',x:180+i%10*220,y:150+Math.floor(i/10)*180+i%2*50});
    if(i)diagram.edges.push({from:'n'+(i-1),to:'n'+i});
  }
  await page.goto(server.origin+'/workbench.html');
  await pastePage(page,JSON.stringify({page:{title:'Fitted title reuse',skin:'pastel',blocks:[{heading:'Graph',diagram}]}}));
  await settledFonts(page);
  const board=page.locator('#docview .boardcanvas>svg');
  const cold=await page.evaluate(()=>window.titleMeasures);expect(cold).toBeGreaterThan(100);
  const before=await labelSnapshot(board);
  for(const [id,shift]of [['n11',false],['n12',true]]){
    await page.evaluate(()=>{document.querySelectorAll('.workspace-window-close').forEach(button=>{if(button.getClientRects().length)button.click();});});
    await board.locator('[data-dv-node="'+id+'"]').click({modifiers:shift?['Shift']:[]});
  }
  await expect(board.locator('.node.dv-sel')).toHaveCount(2);
  await page.locator('#editor-tab-inspect').click();
  await settledFonts(page);
  expect(await page.evaluate(()=>window.titleStyleNames)).toBeGreaterThan(0);
  const counts=[],styleCounts=[];
  for(const name of ['Align horizontal','Align vertical']){
    await board.evaluate(svg=>{window.retiredTitleBoard=svg;window.titleMeasures=0;window.titleStyleNames=0;window.titleStyleValues=0;});
    const oldSource=await page.locator('#src').inputValue();
    await page.getByRole('button',{name,exact:true}).click();await settledFonts(page);
    expect(await page.locator('#src').inputValue()).not.toBe(oldSource);
    counts.push(await page.evaluate(()=>window.titleMeasures));
    styleCounts.push(await page.evaluate(()=>({names:window.titleStyleNames,values:window.titleStyleValues})));
    expect(await labelSnapshot(board)).toEqual(before);
    expect(await page.evaluate(()=>({connected:window.retiredTitleBoard.isConnected,fit:typeof window.retiredTitleBoard._fitLaneTitles}))).toEqual({connected:false,fit:'object'});
  }
  expect(counts,'no SVG text measurements for unchanged title typography/geometry').toEqual([0,0]);
  for(const counts of styleCounts){expect(counts.names,'no repeated CSS property enumeration').toBe(0);expect(counts.values,'computed values are still read for every label').toBeGreaterThanOrEqual(100);}
  const sameSkin=await page.evaluate(()=>{
    let events=0;const view=document.querySelector('#docview');
    const observe=new MutationObserver(()=>{});observe.observe(document.body,{attributes:true,subtree:true,attributeFilter:['class']});
    view.addEventListener('reader-skin-change',()=>events++,{once:true});window.titleMeasures=0;
    window.dvSetSkin('pastel');
    const classes=observe.takeRecords().filter(r=>r.target===document.body||r.target===view).length;observe.disconnect();
    return {classes,events,measures:window.titleMeasures};
  });
  expect(sameSkin).toEqual({classes:0,events:1,measures:0});
  await info.attach('measurement-counts',{body:JSON.stringify({cold,alignment:counts,styleCounts,sameSkin}),contentType:'application/json'});
});

test('font completion and inherited typography invalidate cached titles while hidden boards wait for reveal',async({page,server},info)=>{
  await countTitleMeasurements(page);
  const input=path.join(server.root,'title-font.json'),output=path.join(server.root,'title-font.html');
  await writeFile(input,JSON.stringify(overflowPage));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  await page.goto(server.origin+'/title-font.html');await settledFonts(page);
  const board=page.locator('#section-free .boardcanvas>svg'),hidden=page.locator('#section-lanes .boardcanvas>svg');
  await expect(hidden).toBeHidden();
  const original=await labelSnapshot(board);
  await board.evaluate(svg=>{svg.parentNode.style.display='none';svg._fitLaneTitles();});
  expect(await board.evaluate(svg=>svg._titlesPending)).toBe(true);
  await board.evaluate(svg=>{svg.parentNode.style.display='';svg._fitLaneTitles();});
  expect(await labelSnapshot(board)).toEqual(original);
  // Repeated refresh on the same live board is an exact output reuse.
  expect(await board.evaluate(svg=>{window.titleMeasures=0;svg._fitLaneTitles();svg._fitLaneTitles();return window.titleMeasures;})).toBe(0);
  const changed=await board.evaluate(svg=>{
    svg.style.letterSpacing='1px';window.titleMeasures=0;svg._fitLaneTitles();return window.titleMeasures;
  });
  expect(changed).toBeGreaterThan(0);
  expect((await expectBoundedLabels(board,authoredOf(freeDiagram))).failures).toEqual([]);
  await board.evaluate(svg=>{svg.style.letterSpacing='';svg._fitLaneTitles();});
  expect(await labelSnapshot(board)).toEqual(original);
  expect(await board.evaluate(svg=>{const text=svg.querySelector('.t1');text.style.whiteSpace=getComputedStyle(text).whiteSpace==='pre'?'normal':'pre';window.titleMeasures=0;svg._fitLaneTitles();return window.titleMeasures;})).toBeGreaterThan(0);
  await board.evaluate(svg=>{svg.querySelector('.t1').style.whiteSpace='';svg.querySelector('.t1').removeAttribute('style');svg._fitLaneTitles();});
  expect(await labelSnapshot(board)).toEqual(original);
  const font=await readFile(path.join(repo,'apps/confluence/node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2'));
  let release;const gate=new Promise(resolve=>release=resolve);
  await page.route('**/late-title.woff2',async route=>{await gate;await route.fulfill({body:font,contentType:'font/woff2'});});
  await page.evaluate(()=>{
    const style=document.createElement('style');
    style.textContent='@font-face{font-family:LateTitle;src:url(/late-title.woff2)} #docview .t1{font-family:LateTitle,sans-serif!important}';
    document.head.appendChild(style);
    document.querySelectorAll('.boardcanvas>svg').forEach(svg=>svg._fitLaneTitles());
  });
  await expect.poll(()=>page.evaluate(()=>document.fonts.status)).toBe('loading');
  const fallback=await labelSnapshot(board);
  await page.evaluate(()=>window.titleMeasures=0);release();await settledFonts(page);
  const loadedMeasures=await page.evaluate(()=>window.titleMeasures);
  expect(loadedMeasures).toBeGreaterThan(0);
  expect(await labelSnapshot(board)).not.toEqual(fallback);
  expect((await expectBoundedLabels(board,authoredOf(freeDiagram))).failures).toEqual([]);
  expect(await hidden.evaluate(svg=>svg._titlesPending)).toBe(true);
  await chooseNavigation(page.locator('#docview .explore-navigation').first(),'Tab','Lanes');await expect(hidden).toBeVisible();
  await expect.poll(()=>hidden.evaluate(svg=>svg._titlesPending)).toBe(false);
  expect((await expectBoundedLabels(hidden,authoredOf(laneDiagram))).failures).toEqual([]);
  await page.evaluate(()=>window.dvSetSkin('blueprint'));await settledFonts(page);
  expect((await expectBoundedLabels(hidden,authoredOf(laneDiagram))).failures).toEqual([]);
  expect(await hidden.evaluate(svg=>{window.titleMeasures=0;svg._fitLaneTitles();return window.titleMeasures;})).toBe(0);
  await info.attach('font-invalidation-measurements',{body:JSON.stringify({inheritedTypography:changed,loadedFont:loadedMeasures}),contentType:'application/json'});
});
