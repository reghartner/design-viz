import {test,expect,chooseNavigation,paste} from '../helpers/test.mjs';
import {CORE_EDITOR_SKINS,auditEditorStyle} from '../helpers/node-styles.mjs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

test.beforeEach(({audit})=>{
  test.skip(process.env.FLOWVIEW_FRIENDS_PREPARED!=='1','Run with -c friends-islanders.config.mjs against the prepared Friends bundle.');
  // Friends intentionally omits the optional Backstage catalog (--no-catalog).
  audit.allowStatus(404,url=>new URL(url).pathname==='/workbench/catalog.json');
});
const shell='/workbench/flowspec.html';
test('Friends node style presets preserve contrast, state and SVG export',async({page,server},testInfo)=>{
  await page.setViewportSize({width:1800,height:1200});
  await auditEditorStyle({page,server},'islanders',{
    fixture:()=>({page:{title:'Friends node styles',sections:[{id:'overview',heading:'Overview',diagram:{}}]}}),
    start:async(page,server,raw)=>{await page.goto(server.origin+shell);await paste(page,JSON.stringify(raw,null,2));},
    expectedSkins:[...CORE_EDITOR_SKINS,'islanders'],
    defaultCard:{fill:'rgb(255, 255, 255)',stroke:'rgb(139, 168, 202)',t1:'rgb(7, 30, 66)',t2:'rgb(83, 106, 128)'},
  });
  await capture(page,testInfo,'islanders-node-styles-desktop');
});
async function capture(page,testInfo,name){
  await page.evaluate(()=>document.fonts.ready);
  const path=testInfo.outputPath(name+'.png');await page.screenshot({path,fullPage:true});
  await testInfo.attach(name,{path,contentType:'image/png'});
}
test('shared Islanders theme survives library, reader, home, copied links and explicit live changes',async({page,server},testInfo)=>{
  await page.context().addCookies([{name:'dv_skin',value:'terminal',url:server.origin}]);
  await page.goto(server.origin+shell+'?theme=islanders');
  await expect(page.locator('body')).toHaveClass(/\bsk-islanders\b/);
  await expect(page.locator('.islanders-site-mark')).toBeVisible();
  expect(await page.locator('.islanders-site-mark').evaluate(img=>img.complete && img.naturalWidth===2000)).toBe(true);
  await page.locator('#welcome-library').click();
  await expect(page.locator('.canon-library-card')).toHaveCount(6);
  await expect(page.locator('.islanders-card-mark:visible')).toHaveCount(4);
  await expect(page.locator('.canon-library-card[data-id="copy-gate"]')).toHaveCount(0);
  await expect(page.locator('.canon-library-card[data-id="nsp15-insertion-evidence"]')).toHaveCount(1);
  await expect(page.locator('.canon-library-card[data-id="nsp15-insertion-evidence"] .islanders-card-mark')).toHaveCount(0);
  const cards=page.locator('.canon-library-open');
  const hrefs=await cards.evaluateAll(nodes=>nodes.map(n=>n.href));
  expect(hrefs.every(href=>new URL(href).searchParams.get('theme')==='islanders')).toBe(true);
  const previews=await page.locator('.canon-library-preview img').evaluateAll(nodes=>nodes.map(n=>n.src));
  expect(new Set(previews).size).toBe(6);
  await capture(page,testInfo,'islanders-library-desktop');
  await cards.filter({hasText:'1 · Create demand'}).click();
  await expect(page.locator('#canon-reader')).toHaveClass(/\bsk-islanders\b/);
  expect(new URL(page.url()).searchParams.get('theme')).toBe('islanders');
  await expect(page.locator('.seatmap:visible').first()).toBeVisible();
  await expect(page.locator('.seatmap-islanders-logo:visible').first()).toBeVisible();
  await expect(page.locator('.seatmap-islanders-ice-label:visible')).toHaveCount(0);
  await page.evaluate(()=>{window.__copied='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text;}}});});
  await page.locator('#canon-reader-copy').click();
  await expect.poll(()=>page.evaluate(()=>window.__copied)).toContain('theme=islanders');
  await capture(page,testInfo,'islanders-create-demand-desktop');
  await page.evaluate(()=>window.dvSetSkin('rose'));
  await expect(page.locator('.seatmap-islanders-logo:visible')).toHaveCount(0);
  await expect(page.locator('.seatmap-islanders-ice-label:visible').first()).toBeVisible();
  await expect(page.locator('.islanders-site-mark')).toBeHidden();
  await page.evaluate(()=>window.dvSetSkin('islanders'));
  await expect(page.locator('.seatmap-islanders-logo:visible').first()).toBeVisible();
  await expect(page.locator('.islanders-site-mark')).toBeVisible();
  await page.evaluate(()=>window.dvSetSkin('rose'));
  await page.locator('#canon-reader-copy').click();
  await expect.poll(()=>page.evaluate(()=>window.__copied)).toContain('theme=rose');
  await page.goBack();await expect(page.locator('#welcome-library-screen')).toBeVisible();
  await expect(cards.first()).toHaveAttribute('href',/theme=rose/);
  await page.goBack();await expect(page.locator('#welcome-library')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('theme')).toBe('rose');
  await expect(page.locator('#workbench-home')).toHaveAttribute('href',/\?theme=rose$/);
  await page.reload();await expect(page.locator('body')).toHaveClass(/\bsk-rose\b/);
  expect((await page.context().cookies()).find(c=>c.name==='dv_skin').value).toBe('terminal');
});

test('direct links in either query order override cookies, render all four arcs, and expose the theme picker',async({page,server},testInfo)=>{
  test.setTimeout(90000); // Four complete stories plus full-page and panel captures.
  await page.context().addCookies([{name:'dv_skin',value:'terminal',url:server.origin}]);
  const arcs=[['season-of-seats',4],['sell-the-inventory',4],['serve-game-night',4],['build-next-season',2]];
  for(const [index,[id,count]] of arcs.entries()){
    const query=index%2?'theme=islanders&diagram='+id:'diagram='+id+'&theme=islanders';
    await page.goto(server.origin+shell+'?'+query);
    await expect(page.locator('#canon-reader')).toHaveClass(/\bsk-islanders\b/);
    await expect(page.locator('#canon-reader .doc-sec')).toHaveCount(count);
    await expect(page.locator('.islanders-site-mark')).toBeVisible();
    const rinkCount=await page.locator('#canon-reader .seatmap-svg').count();
    await expect(page.locator('#canon-reader .seatmap-islanders-logo')).toHaveCount(rinkCount);
    for(const crest of await page.locator('#canon-reader .seatmap-islanders-logo').all()){
      await expect(crest).toHaveAttribute('href',/^data:image\/png;base64,/);
      expect(await crest.evaluate(el=>getComputedStyle(el).display)).toBe('inline');
    }
    await expect(page.locator('[data-reader-skin="islanders"]')).toHaveAttribute('aria-checked','true');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await capture(page,testInfo,'islanders-'+id+'-desktop');
    for(const type of ['seatmap','grid','funnel','tiles']){
      const panel=page.locator('#canon-reader .pt-'+type).first();
      if(!await panel.count())continue;
      if(type==='funnel' && id!=='build-next-season'){
        // Directly address a populated narrative state; scrolling an offscreen
        // section's sticky transport is not needed to capture its panel.
        const target=id==='sell-the-inventory'?'heritage-night-link&m=step&s=tie':'score-first&m=step&s=chain-fires';
        await page.goto(server.origin+shell+'?diagram='+id+'&theme=islanders#d='+target);
        await expect(panel.locator('.funnel-bar').first()).toBeVisible();
      }
      await panel.scrollIntoViewIfNeeded();
      const path=testInfo.outputPath(id+'-'+type+'.png');await panel.screenshot({path});
      await testInfo.attach(id+'-'+type,{path,contentType:'image/png'});
    }
  }
});

test('standalone reader honors shared theme over cookie, source and embed, then accepts live changes',async({page,server})=>{
  await page.context().addCookies([{name:'dv_skin',value:'terminal',url:server.origin}]);
  const spec='../diagrams/friends/season-of-seats/season-of-seats.spec.json';
  await page.goto(server.origin+'/template/flowview.html?spec='+spec+'&theme=islanders#embed=schaefer-effect&sk=daylight');
  await expect(page.locator('#docview')).toHaveClass(/\bsk-islanders\b/);
  await expect(page.locator('.seatmap-islanders-logo:visible').first()).toBeVisible();
  // Embedded raster bytes survive serializing a standalone rink SVG. The
  // Workbench's separate graph-only SVG download intentionally excludes panels.
  const svg=await page.locator('.seatmap-svg').first().evaluate(el=>new XMLSerializer().serializeToString(el));
  expect(svg).toMatch(/href="data:image\/png;base64,/);
  expect(svg).not.toMatch(/href="https?:/);
  await page.evaluate(()=>window.dvSetSkin('blueprint'));
  await expect(page.locator('#docview')).toHaveClass(/\bsk-blueprint\b/);
  await expect(page.locator('.seatmap-islanders-logo:visible')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('theme')).toBe('blueprint');
  await page.reload();await expect(page.locator('#docview')).toHaveClass(/\bsk-blueprint\b/);
  await page.goto(server.origin+'/template/flowview.html?theme=invalid&spec='+spec);
  await expect(page.locator('#docview')).toHaveClass(/\bsk-terminal\b/);
});

async function readableText(locator){
  const colors=await locator.evaluateAll(nodes=>nodes.filter(el=>el.getClientRects().length).map(el=>{
    const rgba=value=>{const channels=value.match(/[\d.]+/g).map(Number);return [...channels.slice(0,3),channels[3]??1];};
    const over=(front,back)=>front.slice(0,3).map((channel,i)=>channel*front[3]+back[i]*(1-front[3]));
    const layers=[];
    for(let node=el;node;node=node.parentElement){
      const css=getComputedStyle(node),color=rgba(css.backgroundColor);
      if(css.backgroundImage!=='none')throw Error('Contrast audit needs a solid background: '+node.className);
      if(Number(css.opacity)!==1)throw Error('Contrast audit must wait for opaque text: '+node.className);
      layers.push(color);if(color[3]===1)break;
    }
    let background=[255,255,255];for(const layer of layers.reverse())background=over(layer,background);
    const color=getComputedStyle(el).color,foreground=over(rgba(color),background);
    const luminance=rgb=>rgb.map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;})
      .reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
    const a=luminance(foreground),b=luminance(background);
    return {text:el.textContent.trim().slice(0,100),className:el.className,color,background,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
  }));
  expect(colors.length).toBeGreaterThan(0);
  for(const entry of colors)expect(entry.ratio,JSON.stringify(entry)).toBeGreaterThanOrEqual(4.5);
  return colors;
}

test('Friends NSP15 opens all eight tabs with readable dark-section text in both themes',async({page,server},testInfo)=>{
  test.setTimeout(90000);
  const reader=page.locator('#canon-reader');
  const spec=await (await page.request.get(server.origin+'/diagrams/friends/nsp15-insertion-evidence/nsp15-insertion-evidence.spec.json')).json();
  const results=[];
  for(const theme of ['default','islanders']){
    await page.goto(server.origin+shell+'?diagram=nsp15-insertion-evidence'+(theme==='default'?'':'&theme=islanders'));
    await expect(reader.locator('.doc-sec').first()).toBeVisible();
    await expect(reader).toHaveClass(new RegExp('\\bsk-'+(theme==='default'?spec.page.skin:theme)+'\\b'));
    await expect(page.locator('.islanders-site-mark')).toBeHidden();
    await expect(reader.locator('.seatmap-islanders-logo')).toHaveCount(0);
    await expect(reader.locator('.reader-tree-tab')).toHaveCount(8);
    for(const [index,tab] of spec.page.blocks[0].tabs.entries()){
      await chooseNavigation(reader.locator('.explore-navigation'),'Tab',tab.label);
      const section=reader.locator('#section-'+tab.sections[0].id),toggle=section.locator(':scope > .sec-heading-row .prosetoggle');
      await expect(section).toBeVisible();
      await expect(section).toHaveCSS('background-color','rgb(11, 25, 35)');
      if(await toggle.getAttribute('aria-expanded')==='true')await toggle.click();
      await expect(section.locator(':scope > .sec-teaser')).toBeVisible();
      const collapsed=await readableText(section.locator(':scope > .sec-heading-row .sec-h, :scope > .sec-teaser .teasertext, :scope > .sec-teaser .teasermore'));
      await capture(page,testInfo,'friends-nsp15-'+theme+'-tab-'+(index+1)+'-desktop');
      await toggle.click();
      await expect(section.locator(':scope > .sec-prose')).toBeVisible();
      await expect(section.locator(':scope > .sec-prose')).toHaveCSS('opacity','1');
      const expanded=await readableText(section.locator(':scope > .sec-prose .sec-text, :scope > .sec-prose .sec-bullets li, :scope > .sec-prose a'));
      // The authored source ledger has links on its own table surface; include
      // those actual rendered links without changing the approved prose/spec.
      const links=await section.locator('a:visible').count()?await readableText(section.locator('a:visible')):[];
      results.push({theme,tab:tab.label,collapsed,expanded,links});
      if(index===1)await capture(page,testInfo,'friends-nsp15-'+theme+'-expanded-prose-desktop');
    }
  }
  await testInfo.attach('nsp15-rendered-text-contrast',{body:JSON.stringify(results,null,2),contentType:'application/json'});
});

test('marketing tabs retain their panels and the desktop editor retains the selected theme',async({page,server},testInfo)=>{
  await page.goto(server.origin+shell+'?diagram=islanders-marketing&theme=islanders');
  const reader=page.locator('#canon-reader');
  await expect(reader).toHaveClass(/\bsk-islanders\b/);
  await expect(reader.locator('.reader-tree-tab')).toHaveCount(3);
  for(const [index,label] of ['Member campaign','Group night','Fan event RSVP'].entries()){
    await chooseNavigation(reader.locator('.explore-navigation'),'Tab',label);
    await expect(reader.locator('.doc-sec:visible .pt-appscreens')).toHaveCount(2);
    await expect(reader.locator('.doc-sec:visible .pt-appscreens img').first()).toBeVisible();
    await capture(page,testInfo,'islanders-marketing-tab-'+(index+1)+'-desktop');
  }
  await page.locator('#canon-reader-edit').click();
  await expect(page.locator('#docview')).toHaveClass(/\bsk-islanders\b/);
  await expect(page.locator('#sk-islanders')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.islanders-site-mark')).toBeHidden();
  await capture(page,testInfo,'islanders-marketing-editor-desktop');
});

test('offline sports HTML retains its crest across steps and mode changes at desktop width',async({page,context,server},testInfo)=>{
  const root=fileURLToPath(new URL('../../..',import.meta.url));
  const output=testInfo.outputPath('islanders-offline.html');
  execFileSync('python3',[path.join(root,'tools/inject.py'),path.join(root,'packages/sports/diagrams/season-of-seats/season-of-seats.spec.json'),path.join(server.root,'template/flowview.html'),output]);
  await page.setViewportSize({width:1280,height:900});
  await context.setOffline(true);
  await page.goto(pathToFileURL(output).href+'?theme=islanders');
  const section=page.locator('.doc-sec').first(),crest=section.locator('.seatmap-islanders-logo');
  await expect(crest).toBeVisible();
  await expect(section.locator('.seatmap-islanders-ice-label')).toBeHidden();
  await section.evaluate(el=>el.classList.add('thumbnail-ready'));
  await expect(crest).toBeHidden();
  await expect(section.locator('.seatmap-islanders-ice-label')).toBeVisible();
  await section.evaluate(el=>el.classList.remove('thumbnail-ready'));
  await expect(crest).toBeVisible();
  const original=await crest.getAttribute('href');
  // Exercise the ordinary authored step controls, which patch map state.
  await section.locator('.schip[data-step-source="1"]').first().click();
  await expect(section.locator('.schip[data-step-source="1"]').first()).toHaveAttribute('aria-current','true');
  await expect(crest).toBeVisible();await expect(crest).toHaveAttribute('href',original);
  await section.getByRole('button',{name:'Ambient',exact:true}).click();
  await expect(crest).toBeVisible();await expect(crest).toHaveAttribute('href',original);
  await section.getByRole('button',{name:'Step',exact:true}).click();
  await expect(crest).toBeVisible();await expect(crest).toHaveAttribute('href',original);
  await page.evaluate(()=>window.dvSetSkin('blueprint'));
  await expect(crest).toBeHidden();
  await expect(section.locator('.seatmap-islanders-ice-label')).toBeVisible();
  await page.evaluate(()=>window.dvSetSkin('islanders'));
  await expect(crest).toBeVisible();
  await section.locator('.pt-seatmap').screenshot({path:testInfo.outputPath('islanders-offline-seatmap-1280.png')});
});
