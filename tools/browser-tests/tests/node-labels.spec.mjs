import {test,expect,chooseNavigation} from '../helpers/test.mjs';
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
      const controls=Array.from(node.querySelectorAll('.nlink circle,.nbackref circle,.detail-trigger rect,.t2'),el=>el.getBoundingClientRect());
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
      if(want.link&&!node.querySelector(':scope>.nlink circle'))fail('link icon missing');
      // Full text is required once the title is cut; when present it must never be stale.
      const tip=node.querySelector(':scope>title'),label=t1.getAttribute('aria-label'),text=shown(t1),cut=text!==want.title;
      if(cut||tip)if(!tip||tip.textContent!==want.title)fail('hover title is '+JSON.stringify(tip&&tip.textContent));
      if(cut||label!==null)if(label!==want.title)fail('t1 aria-label is '+JSON.stringify(label));
      if(cut){if(!/…$/.test(text))fail('title cut without ellipsis: '+text);else report.truncatedTitles++;}
      const controls=Array.from(node.querySelectorAll('.nlink circle,.nbackref circle,.detail-trigger rect'),el=>el.getBoundingClientRect());
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
