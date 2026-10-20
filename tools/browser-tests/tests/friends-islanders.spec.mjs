import {test,expect,chooseNavigation,paste,inspectPageElement} from '../helpers/test.mjs';
import {CORE_EDITOR_SKINS,auditEditorStyle} from '../helpers/node-styles.mjs';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
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
function rinkFixture(){
  return {page:{title:'Reusable Islanders venue fixture',skin:'daylight',sections:[{
    id:'rink',heading:'UBS Arena theme fixture',diagram:{view:'step',nodes:{
      venue:{title:'Venue theme',sub:'Reusable rink panel fixture',icon:'monitor',tint:'data'}
    },rows:[['venue']],panels:[{
      id:'map',type:'seatmap',title:'UBS Arena fixture',venue:'ubs-arena',currency:'USD',
      initial:{mode:'sold',sold:{'101':12},highlight:'101'}
    }],steps:[
      {id:'opening',text:'Opening state.',panels:{map:{sold:{'101':24,'102':18},highlight:'102'}}},
      {id:'follow-up',text:'Follow-up state.',panels:{map:{sold:{'101':36,'102':30},highlight:'101'}}}
    ]}
  }]}};
}
function injectRinkFixture(server,testInfo,name,{served=false}={}){
  const root=fileURLToPath(new URL('../../..',import.meta.url));
  const spec=testInfo.outputPath(name+'.spec.json');
  const output=served?path.join(server.root,name+'.html'):testInfo.outputPath(name+'.html');
  writeFileSync(spec,JSON.stringify(rinkFixture(),null,2));
  execFileSync('python3',[path.join(root,'tools/inject.py'),spec,path.join(server.root,'template/flowview.html'),output]);
  return output;
}
function injectNspFixture(server,testInfo,name){
  const root=fileURLToPath(new URL('../../..',import.meta.url));
  const source=path.join(root,'packages/science/diagrams/biology/nsp15-insertion-evidence/nsp15-insertion-evidence.spec.json');
  const output=testInfo.outputPath(name+'.html');
  execFileSync('python3',[path.join(root,'tools/inject.py'),source,path.join(server.root,'template/flowview.html'),output]);
  return output;
}
test('shared Islanders theme survives library, reader, home, copied links and explicit live changes',async({page,server},testInfo)=>{
  await page.context().addCookies([{name:'dv_skin',value:'terminal',url:server.origin}]);
  await page.goto(server.origin+shell+'?theme=islanders');
  await expect(page.locator('body')).toHaveClass(/\bsk-islanders\b/);
  await expect(page.locator('.islanders-site-mark')).toBeVisible();
  expect(await page.locator('.islanders-site-mark').evaluate(img=>img.complete && img.naturalWidth===2000)).toBe(true);
  await page.locator('#welcome-library').click();
  await expect(page.locator('.canon-library-card')).toHaveCount(2);
  await expect(page.locator('.islanders-card-mark:visible')).toHaveCount(1);
  await expect(page.locator('.canon-library-card[data-id="copy-gate"]')).toHaveCount(0);
  await expect(page.locator('.canon-library-card[data-id="nsp15-insertion-evidence"]')).toHaveCount(1);
  await expect(page.locator('.canon-library-card[data-id="nsp15-insertion-evidence"] .islanders-card-mark')).toHaveCount(0);
  const cards=page.locator('.canon-library-open');
  const hrefs=await cards.evaluateAll(nodes=>nodes.map(n=>n.href));
  expect(hrefs.every(href=>new URL(href).searchParams.get('theme')==='islanders')).toBe(true);
  const previews=await page.locator('.canon-library-preview img').evaluateAll(nodes=>nodes.map(n=>n.src));
  expect(new Set(previews).size).toBe(2);
  await capture(page,testInfo,'islanders-library-desktop');
  await cards.filter({hasText:'Islanders marketing stories'}).click();
  await expect(page.locator('#canon-reader')).toHaveClass(/\bsk-islanders\b/);
  expect(new URL(page.url()).searchParams.get('theme')).toBe('islanders');
  await expect(page.locator('#canon-reader .pt-appscreens:visible')).toHaveCount(2);
  await page.evaluate(()=>{window.__copied='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copied=text;}}});});
  await page.locator('#canon-reader-copy').click();
  await expect.poll(()=>page.evaluate(()=>window.__copied)).toContain('theme=islanders');
  await capture(page,testInfo,'islanders-marketing-reader-desktop');
  await page.evaluate(()=>window.dvSetSkin('rose'));
  await expect(page.locator('.islanders-site-mark')).toBeHidden();
  await page.evaluate(()=>window.dvSetSkin('islanders'));
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

test('marketing direct links in either query order override cookies and expose the theme picker',async({page,server},testInfo)=>{
  await page.context().addCookies([{name:'dv_skin',value:'terminal',url:server.origin}]);
  for(const [index,query] of ['diagram=islanders-marketing&theme=islanders','theme=islanders&diagram=islanders-marketing'].entries()){
    await page.goto(server.origin+shell+'?'+query);
    await expect(page.locator('#canon-reader')).toHaveClass(/\bsk-islanders\b/);
    await expect(page.locator('#canon-reader .reader-tree-tab')).toHaveCount(3);
    await expect(page.locator('#canon-reader .pt-appscreens:visible')).toHaveCount(2);
    await expect(page.locator('.islanders-site-mark')).toBeVisible();
    await expect(page.locator('[data-reader-skin="islanders"]')).toHaveAttribute('aria-checked','true');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    if(index===0)await capture(page,testInfo,'islanders-marketing-direct-desktop');
  }
});

test('standalone reader honors shared theme over cookie, source and embed, then accepts live changes',async({page,server},testInfo)=>{
  await page.context().addCookies([{name:'dv_skin',value:'terminal',url:server.origin}]);
  injectRinkFixture(server,testInfo,'islanders-standalone-rink',{served:true});
  const url=server.origin+'/islanders-standalone-rink.html';
  await page.goto(url+'?theme=islanders#embed=rink&sk=daylight');
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
  await page.goto(url+'?theme=invalid');
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

function rgba(value){
  const text=String(value),channels=text.match(/[\d.]+/g)?.map(Number)??[];
  if(channels.length<3)throw Error('Expected an RGB color, received '+value);
  const scale=text.startsWith('color(srgb ')?255:1;
  return [...channels.slice(0,3).map(channel=>channel*scale),channels[3]??1];
}
function composite(foreground,background){
  const front=rgba(foreground),back=rgba(background),alpha=front[3]+back[3]*(1-front[3]);
  const channels=front.slice(0,3).map((channel,index)=>(channel*front[3]+back[index]*back[3]*(1-front[3]))/alpha);
  return 'rgb('+channels.join(', ')+')';
}
function luminance(value){
  return rgba(value).slice(0,3).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;})
    .reduce((sum,c,index)=>sum+c*[.2126,.7152,.0722][index],0);
}
function contrast(foreground,background){
  const a=luminance(foreground),b=luminance(background);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
async function nspVisualSnapshot(section){
  return section.evaluate(root=>{
    const style=selector=>{const element=root.querySelector(selector);if(!element)return null;const css=getComputedStyle(element);return {background:css.backgroundColor,backgroundImage:css.backgroundImage,color:css.color,fill:css.fill,fillOpacity:css.fillOpacity,opacity:css.opacity,stroke:css.stroke};};
    const scene=root.querySelector('.nspstory');
    const resolve=variable=>{
      if(!scene)return null;
      const probe=document.createElement('i');probe.style.color='var('+variable+')';scene.append(probe);
      const value=getComputedStyle(probe).color;probe.remove();return value;
    };
    return {
      section:style(':scope'),panel:style('.pwidget'),title:style('.ptitle'),cell:style('.swtable td'),frame:style('.nspstory-screen-frame'),heading:style('.nspstory-heading'),
      green:style('.nspstory-position-pill, .nspstory-wt, .nspstory-insert'),violet:style('.nspstory-gfp-boundary, .nspstory-inactive, .nspstory-source'),highlight:style('.nspstory-triplet-focus'),
      paper:resolve('--ns-paper'),ink:resolve('--ns-ink'),semanticGreen:resolve('--ns-green'),semanticViolet:resolve('--ns-violet')
    };
  });
}

test('Friends NSP15 opens all eight tabs with readable skin-responsive surfaces',async({page,server},testInfo)=>{
  test.setTimeout(150000);
  const reader=page.locator('#canon-reader');
  const spec=await (await page.request.get(server.origin+'/diagrams/friends/nsp15-insertion-evidence/nsp15-insertion-evidence.spec.json')).json();
  const results=[],representative={};
  for(const theme of ['aurora','daylight','islanders']){
    await page.goto(server.origin+shell+'?diagram=nsp15-insertion-evidence&theme='+theme);
    await expect(reader.locator('.doc-sec').first()).toBeVisible();
    await expect(reader).toHaveClass(new RegExp('\\bsk-'+theme+'\\b'));
    await expect(page.locator('.islanders-site-mark')).toBeHidden();
    await expect(reader.locator('.seatmap-islanders-logo')).toHaveCount(0);
    await expect(reader.locator('.reader-tree-tab')).toHaveCount(8);
    for(const [index,tab] of spec.page.blocks[0].tabs.entries()){
      await chooseNavigation(reader.locator('.explore-navigation'),'Tab',tab.label);
      const section=reader.locator('#section-'+tab.sections[0].id),toggle=section.locator(':scope > .sec-heading-row .prosetoggle');
      await expect(section).toBeVisible();
      if(await toggle.getAttribute('aria-expanded')==='true')await toggle.click();
      await expect(section.locator(':scope > .sec-teaser')).toBeVisible();
      const collapsed=await readableText(section.locator(':scope > .sec-heading-row .sec-h, :scope > .sec-teaser .teasertext, :scope > .sec-teaser .teasermore'));
      const visual=await nspVisualSnapshot(section);
      if(visual.paper){
        const paper=composite(visual.paper,visual.panel.background);
        expect(contrast(visual.ink,paper),JSON.stringify({theme,tab:tab.label,visual,paper})).toBeGreaterThanOrEqual(4.5);
        expect(visual.semanticGreen).not.toBe(visual.semanticViolet);
        expect(contrast(visual.semanticGreen,paper),JSON.stringify({theme,tab:tab.label,visual,paper})).toBeGreaterThanOrEqual(3);
        expect(contrast(visual.semanticViolet,paper),JSON.stringify({theme,tab:tab.label,visual,paper})).toBeGreaterThanOrEqual(3);
        if(visual.cell){
          const cell=composite(visual.cell.background,visual.panel.background);
          expect(contrast(visual.cell.color,cell),JSON.stringify({theme,tab:tab.label,visual,cell})).toBeGreaterThanOrEqual(4.5);
        }
        if(tab.label==='Reporter')expect(Number(visual.highlight.fillOpacity),'The position highlight must not cover the reporter letters').toBeLessThanOrEqual(.2);
      }
      if(index===0)representative[theme]=visual;
      if(index===0)await capture(page,testInfo,'friends-nsp15-'+theme+'-reporter-desktop');
      await toggle.click();
      await expect(section.locator(':scope > .sec-prose')).toBeVisible();
      await expect(section.locator(':scope > .sec-prose')).toHaveCSS('opacity','1');
      const expanded=await readableText(section.locator(':scope > .sec-prose .sec-text, :scope > .sec-prose .sec-bullets li, :scope > .sec-prose a'));
      // The authored source ledger has links on its own table surface; include
      // those actual rendered links without changing the approved prose/spec.
      const links=await section.locator('a:visible').count()?await readableText(section.locator('a:visible')):[];
      results.push({theme,tab:tab.label,collapsed,expanded,links,visual});
      if(index===1)await capture(page,testInfo,'friends-nsp15-'+theme+'-expanded-prose-desktop');
    }
  }
  expect(luminance(representative.aurora.panel.background)).toBeLessThan(.2);
  expect(luminance(representative.daylight.panel.background)).toBeGreaterThan(.8);
  expect(luminance(representative.islanders.panel.background)).toBeGreaterThan(.8);
  expect(representative.aurora.frame.backgroundImage).not.toBe(representative.daylight.frame.backgroundImage);
  expect(representative.daylight.frame.backgroundImage).not.toBe(representative.islanders.frame.backgroundImage);
  expect(representative.aurora.green.fill).not.toBe(representative.daylight.green.fill);
  expect(representative.daylight.green.fill).not.toBe(representative.islanders.green.fill);
  await testInfo.attach('nsp15-rendered-text-contrast',{body:JSON.stringify(results,null,2),contentType:'application/json'});
});

test('Friends NSP15 preserves narrative state through live dark, light and Islanders changes',async({page,server},testInfo)=>{
  test.setTimeout(60000);
  await page.goto(server.origin+shell+'?diagram=nsp15-insertion-evidence&theme=aurora');
  const reader=page.locator('#canon-reader'),navigation=reader.locator('.explore-navigation');
  await expect(reader.locator('.doc-sec').first()).toBeVisible({timeout:30000});
  await expect(navigation).toBeVisible({timeout:30000});
  await chooseNavigation(navigation,'Tab','Compare');
  const section=reader.locator('#section-class-signature'),step=section.locator('.schip[data-step-source="2"]');
  await step.click();await expect(step).toHaveAttribute('aria-current','true');
  const story=section.locator('.nspstory'),phase=await story.getAttribute('data-phase');
  const snapshots={};
  for(const [index,theme] of ['aurora','daylight','islanders','aurora'].entries()){
    await page.evaluate(value=>window.dvSetSkin(value),theme);
    await expect(reader).toHaveClass(new RegExp('\\bsk-'+theme+'\\b'));
    await expect(reader.locator('.reader-tree-tab').filter({hasText:'Compare'})).toHaveAttribute('aria-expanded','true');
    await expect(step).toHaveAttribute('aria-current','true');
    await expect(story).toHaveAttribute('data-phase',phase);
    snapshots[theme]=await nspVisualSnapshot(section);
    await capture(page,testInfo,'friends-nsp15-live-'+(index+1)+'-'+theme+'-evidence-desktop');
  }
  expect(luminance(snapshots.aurora.panel.background)).toBeLessThan(.2);
  expect(luminance(snapshots.daylight.panel.background)).toBeGreaterThan(.8);
  expect(luminance(snapshots.islanders.panel.background)).toBeGreaterThan(.8);
  expect(snapshots.aurora.green.fill).not.toBe(snapshots.daylight.green.fill);
  expect(snapshots.daylight.green.fill).not.toBe(snapshots.islanders.green.fill);
  expect(snapshots.daylight.green.fill).not.toBe(snapshots.daylight.violet.fill);
});

test('Friends NSP15 setup controls commit strings and Boolean motion without JSON quoting',async({page,server},testInfo)=>{
  test.setTimeout(90000); // Four edits, each checked through a full Undo/Redo render.
  await page.goto(server.origin+shell+'?diagram=nsp15-insertion-evidence');
  // NSP15 is the largest Friends document. Enter the editor only after its
  // fonts and queued reader layout have crossed a painted-frame boundary.
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  const edit=page.locator('#canon-reader-edit');
  await expect(edit).toBeEnabled();await edit.click();
  const panel=page.locator('#docview .pt-nspstory').first();
  await inspectPageElement(page,panel.locator('.ptitle'));
  const inspector=page.locator('#guide'),src=page.locator('#src');
  const source=async()=>JSON.parse(await src.inputValue());
  const firstPanel=raw=>raw.page.blocks[0].tabs[0].sections[0].diagram.panels[0];
  const original=await source();
  async function verifyUndoRedo(before){
    const after=await src.inputValue();
    await page.locator('#undo-builder').click();await expect(src).toHaveValue(before);
    await page.locator('#redo-builder').click();await expect(src).toHaveValue(after);
    // Undo/Redo rebuilds the board and clears its element selection.
    await inspectPageElement(page,panel.locator('.ptitle'));
  }
  for(const [label,key,value] of [['Lesson','scene','dilution'],['Ambient intensity','ambientIntensity','lively'],['Ambient tempo','ambientTempo','fast']]){
    const input=inspector.getByLabel(label,{exact:true});
    await expect(input).toHaveJSProperty('tagName','INPUT');
    const before=await src.inputValue();
    await input.fill(value);await input.press('Tab');
    await expect.poll(async()=>firstPanel(await source())[key]).toBe(value);
    await verifyUndoRedo(before);
  }
  const motion=inspector.getByLabel('Illustrative motion',{exact:true});
  await expect(motion).toHaveJSProperty('tagName','TEXTAREA');
  const before=await src.inputValue();
  await motion.fill('false');await motion.press('Tab');
  await expect.poll(async()=>firstPanel(await source()).ambient).toBe(false);
  await verifyUndoRedo(before);
  const updated=await source(),expected=structuredClone(original);
  Object.assign(firstPanel(expected),{scene:'dilution',ambientIntensity:'lively',ambientTempo:'fast',ambient:false});
  expect(updated).toEqual(expected);
  await expect(panel.locator('.nspstory')).toHaveAttribute('data-scene','dilution');
  await expect(panel.locator('.nspstory')).toHaveAttribute('data-ambient','off');
  await capture(page,testInfo,'friends-nsp15-editor-setup-desktop');
  await page.evaluate(()=>window.dvSetSkin('daylight'));
  await expect(page.locator('#docview')).toHaveClass(/\bsk-daylight\b/);
  const visual=await nspVisualSnapshot(page.locator('#docview .doc-sec').first());
  expect(luminance(visual.panel.background)).toBeGreaterThan(.8);
  expect(contrast(visual.ink,composite(visual.paper,visual.panel.background))).toBeGreaterThanOrEqual(4.5);
  await capture(page,testInfo,'friends-nsp15-editor-daylight-desktop');
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

test('offline reusable rink fixture retains its crest across steps and mode changes at desktop width',async({page,context,server},testInfo)=>{
  const output=injectRinkFixture(server,testInfo,'islanders-offline-rink');
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

test('offline NSP15 remains themed and usable with reduced motion and print media',async({page,context,server},testInfo)=>{
  const output=injectNspFixture(server,testInfo,'friends-offline-nsp15');
  await page.setViewportSize({width:1280,height:900});
  await context.setOffline(true);
  await page.goto(pathToFileURL(output).href+'?theme=daylight');
  const doc=page.locator('#docview'),section=doc.locator('#section-green-reporter'),story=section.locator('.nspstory');
  await expect(doc).toHaveClass(/\bsk-daylight\b/);
  await expect(story).toBeVisible();
  const visual=await nspVisualSnapshot(section);
  expect(luminance(visual.panel.background)).toBeGreaterThan(.8);
  expect(contrast(visual.ink,composite(visual.paper,visual.panel.background))).toBeGreaterThanOrEqual(4.5);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect.poll(()=>story.evaluate(element=>element.getAnimations({subtree:true}).filter(animation=>animation.playState!=='finished').length)).toBe(0);
  await expect(story.locator('.nspstory-controls')).toBeVisible();
  await capture(page,testInfo,'friends-offline-nsp15-daylight-desktop');
  await page.emulateMedia({media:'print',reducedMotion:'reduce'});
  await expect(story.locator('.nspstory-screen-frame')).toBeHidden();
  await expect(story.locator('.nspstory-print-frame')).toBeVisible();
  await expect(story.locator('.nspstory-controls')).toBeHidden();
  await capture(page,testInfo,'friends-offline-nsp15-print-desktop');
});
