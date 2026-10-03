import {test,expect} from '../helpers/test.mjs';
import {readFile} from 'node:fs/promises';

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
