import {test,expect,activeCompanyBrand} from '../helpers/test.mjs';
import {writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';

function story(skin='pastel'){
  const section=(id,heading)=>({id,heading,text:'Keep the full section title and its live playback state.',diagram:{view:'step',autoplay:false,nodes:{a:{title:'Source'},b:{title:'Destination'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],steps:[{id:'first',text:'First',edge:'a->b'},{id:'second',text:'Second',edge:'a->b'}]}});
  return {page:{title:'Contents acceptance',skin,sections:[{tabs:[{label:'Product journey',defaultView:'full',views:[{id:'full',name:'Full story',presentation:'standard',sections:['build','review','backstage']},{id:'explore',name:'Explore story',presentation:'explore',sections:['build','review','backstage']},{id:'subset',name:'Review + Backstage',presentation:'explore',sections:['backstage','review']}],sections:[section('build','Turn a doorbell story into a reviewable draft'),section('review','Decide what becomes the accepted diagram'),section('backstage','Find the right workspace in Backstage')]},{label:'Reference',sections:[section('reference','Reference material')]}]}]}};
}
async function open(page,server,skin='pastel'){
  return openRaw(page,server,story(skin));
}
async function openRaw(page,server,raw,name='contents'){
  const input=path.join(server.root,name+'.json'),output=path.join(server.root,name+'.html');await writeFile(input,JSON.stringify(raw));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);await page.goto(server.origin+'/'+name+'.html');return page.locator('#docview');
}
async function choose(root,id){await root.locator('.reader-tree-view[data-tab-view="'+id+'"]').click();}

test('Contents preserves Standard stacks, ordered Explore members and state through theme changes',async({page,server})=>{
  const root=await open(page,server);await expect(root.locator('.reader-page-label')).toHaveText('Page 1 of 3');
  await expect(root.locator('.doc-sec:visible')).toHaveCount(3);
  await root.getByRole('button',{name:'Next Page',exact:true}).click();await expect(root.locator('.reader-page-label')).toHaveText('Page 2 of 3');await expect(root.locator('.doc-sec:visible')).toHaveCount(3);
  await choose(root,'subset');await expect(root.locator('.reader-page-label')).toHaveText('Page 2 of 2');
  await root.getByRole('button',{name:'Previous Page',exact:true}).click();await expect(root.locator('.explore-active-section')).toHaveAttribute('id','section-backstage');
  await root.getByRole('button',{name:'Next Page',exact:true}).click();await expect(root.locator('.explore-active-section')).toHaveAttribute('id','section-review');
  await root.locator('.reader-toolbar').getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) in$/,exact:true}).click();const zoom=await root.locator('.reader-zoom-menu>summary').innerText();
  const board=await root.locator('#section-review .board').elementHandle();
  await root.locator('.reader-theme-menu>summary').click();await expect(root.getByRole('menuitemradio')).toHaveText(['Aurora','Pastel','Blueprint','Terminal','Rose','Lavender','Opus Lilac']);
  await root.getByRole('menuitemradio',{name:'Opus Lilac',exact:true}).click();await expect(root).toHaveClass(/sk-lilac/);await expect(root.locator('.reader-page-label')).toHaveText('Page 2 of 2');await expect(root.locator('.reader-zoom-menu>summary')).toHaveText(zoom);expect(await board.evaluate(el=>el.isConnected)).toBe(true);
  await expect(root.locator('.reader-theme-menu>summary')).toBeFocused();
  await choose(root,'full');await root.locator('.reader-toolbar').getByRole('button',{name:/^(?:Canvas zoom|Diagram zoom|Zoom) in$/,exact:true}).click();await expect(root.locator('#section-review')).toHaveCSS('zoom','1.25');
  await choose(root,'explore');await expect(root.locator('#section-review')).toHaveCSS('zoom','1');await choose(root,'full');await expect(root.locator('#section-review')).toHaveCSS('zoom','1.25');
  await root.locator('#section-backstage').evaluate(el=>el.scrollIntoView({block:'start'}));await expect(root.locator('.reader-page-label')).toHaveText('Page 3 of 3');await expect(root.locator('.doc-sec:visible')).toHaveCount(3);
});

test('Standard Contents exposes ordered section headlines and routes mouse and keyboard without collapsing the stack',async({page,server})=>{
  const raw=story(),tab=raw.page.sections[0].tabs[0];tab.defaultView='standard-subset';tab.views.push({id:'standard-subset',name:'Backstage + Review',presentation:'standard',sections:['backstage','review']});
  const root=await openRaw(page,server,raw,'standard-headlines'),headlines=root.locator('.reader-tree-sections[data-reader-view="standard-subset"]');
  await expect(headlines.getByRole('button')).toHaveText(['Find the right workspace in Backstage','Decide what becomes the accepted diagram']);
  await expect(root.locator('.reader-tree-sections[data-reader-view="explore"] .reader-tree-section')).toHaveCount(3);
  await expect(root.locator('.doc-sec:visible')).toHaveCount(2);
  const review=headlines.getByRole('button',{name:'Decide what becomes the accepted diagram',exact:true});await review.click();
  await expect(root.locator('.reader-page-label')).toHaveText('Page 2 of 2');await expect(review).toHaveAttribute('aria-current','page');await expect(root.locator('.doc-sec:visible')).toHaveCount(2);
  const backstage=headlines.getByRole('button',{name:'Find the right workspace in Backstage',exact:true});await backstage.focus();await page.keyboard.press('Enter');
  await expect(backstage).toBeFocused();await expect(backstage).toHaveAttribute('aria-current','page');await expect(root.locator('.reader-page-label')).toHaveText('Page 1 of 2');await expect(root.locator('.doc-sec:visible')).toHaveCount(2);
  const target=await root.locator('#section-backstage').boundingBox(),navigation=await root.locator('.reader-navigation').boundingBox();expect(target.y).toBeGreaterThanOrEqual(navigation.y+navigation.height);expect(target.y).toBeLessThanOrEqual(navigation.y+navigation.height+16);
  await root.locator('.reader-tree-tab').getByText('Reference',{exact:true}).click();const prose=root.locator('.reader-tree-sections[data-reader-view="standard"] .reader-tree-section');await expect(prose).toHaveText(['Reference material']);await prose.click();await expect(prose).toHaveAttribute('aria-current','page');await expect(root.locator('#section-reference')).toBeVisible();await expect(root.locator('.reader-page-label')).toHaveText('Page 1 of 1');
});

test('desktop Contents expands every View by default and preserves independent disclosure choices',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});const root=await open(page,server),sections=id=>root.locator('.reader-tree-sections[data-reader-view="'+id+'"] .reader-tree-section'),disclosure=id=>root.locator('.reader-tree-view[data-tab-view="'+id+'"]').locator('..').locator('.reader-view-disclosure');
  await expect(sections('full')).toHaveCount(3);await expect(sections('explore')).toHaveCount(3);
  await expect(disclosure('full')).toHaveAttribute('aria-expanded','true');await expect(disclosure('full')).toHaveAccessibleName('Collapse Full story');
  await expect(disclosure('explore')).toHaveAttribute('aria-expanded','true');await expect(disclosure('explore')).toHaveAccessibleName('Collapse Explore story');
  await expect(root.locator('.reader-tree-view[data-tab-view="full"]')).not.toHaveAttribute('data-explore-view','true');await expect(root.locator('.reader-tree-view[data-tab-view="explore"]')).toHaveAttribute('data-explore-view','true');
  await disclosure('full').focus();await page.keyboard.press('Enter');await expect(disclosure('full')).toBeFocused();await expect(disclosure('full')).toHaveAttribute('aria-expanded','false');await expect(disclosure('full')).toHaveAccessibleName('Expand Full story');await expect(sections('full')).toHaveCount(0);await expect(sections('explore')).toHaveCount(3);
  await disclosure('explore').click();await expect(disclosure('explore')).toHaveAttribute('aria-expanded','false');await expect(sections('explore')).toHaveCount(0);
  await choose(root,'explore');await expect(disclosure('full')).toHaveAttribute('aria-expanded','false');await expect(disclosure('explore')).toHaveAttribute('aria-expanded','false');
  await page.evaluate(()=>location.hash='d=review&v=explore');await expect(root.locator('.reader-page-label')).toHaveText('Page 2 of 3');await expect(disclosure('full')).toHaveAttribute('aria-expanded','false');await expect(disclosure('explore')).toHaveAttribute('aria-expanded','false');
  await disclosure('full').click();await disclosure('explore').click();await expect(sections('full')).toHaveCount(3);await expect(sections('explore')).toHaveCount(3);
});

for(const width of [1440,390,320,286])test('Contents geometry, overlay and bounded theme menu at '+width,async({page,server})=>{
  await page.setViewportSize({width,height:844});const root=await open(page,server,'rose');const nav=root.locator('.reader-navigation');
  if(width<=670)await root.locator('.reader-top>button').click();
  await expect(root.locator('.reader-contents')).toBeVisible();
  const geometry=await nav.evaluate(el=>{const nav=el.getBoundingClientRect(),pager=el.querySelector('.reader-page-index').getBoundingClientRect(),side=el.querySelector('.reader-contents').getBoundingClientRect(),footer=el.querySelector('.reader-theme-footer').getBoundingClientRect();return {center:(pager.left+pager.right)/2-nav.width/2,sideBottom:side.bottom,footerBottom:footer.bottom,width:document.documentElement.scrollWidth};});
  expect(Math.abs(geometry.center)).toBeLessThan(1);expect(geometry.width).toBe(width);expect(geometry.footerBottom).toBe(geometry.sideBottom);
  await root.locator('.reader-theme-menu>summary').click();const menu=await root.locator('.reader-theme-options').boundingBox();expect(menu.y).toBeGreaterThan(100);expect(menu.x).toBeGreaterThanOrEqual(0);expect(menu.x+menu.width).toBeLessThanOrEqual(width);
  await page.keyboard.press('Escape');await expect(root.locator('.reader-theme-menu>summary')).toBeFocused();await expect(root.locator('.reader-contents')).toBeVisible();
  if(width<=670){await expect(root.locator('.reader-scrim')).toBeVisible();await page.keyboard.press('Escape');await expect(root.locator('.reader-contents')).toBeHidden();await expect(root.locator('.reader-top>button')).toBeFocused();await root.locator('.reader-top>button').click();await choose(root,'explore');}
  else{await choose(root,'explore');const canvas=await root.locator('.viewer-diagram-canvas').boundingBox();expect(canvas.x).toBe(284);}
  await root.locator('.reader-zoom-menu>summary').click();await expect(root.locator('.reader-zoom-options').getByRole('button',{name:'Readable',exact:true})).toBeVisible();
  const zoomBox=await root.locator('.reader-zoom-options').boundingBox();expect(zoomBox.x).toBeGreaterThanOrEqual(0);expect(zoomBox.x+zoomBox.width).toBeLessThanOrEqual(width);expect(zoomBox.y+zoomBox.height).toBeLessThanOrEqual(844);
});

test('legacy skins remain labeled and host skin updates preserve document content',async({page,server})=>{
  const root=await open(page,server,'editorial');await expect(root.locator('.reader-theme-menu>summary')).toHaveAttribute('data-current-skin','editorial');
  const section=await root.locator('#section-build').elementHandle();await page.evaluate(()=>dvSetSkin('daylight'));await expect(root.locator('.reader-theme-menu>summary')).toHaveAttribute('data-current-skin','daylight');expect(await section.evaluate(el=>el.isConnected)).toBe(true);
  expect(await page.evaluate(()=>JSON.parse(document.querySelector('#flowspec').textContent).page.skin)).toBe('editorial');
});

test('native Contents themes and destruction are isolated between sibling hosts',async({page,server})=>{
  await writeFile(path.join(server.root,'contents-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'contents-native.html'),'<style>body{margin:0;display:flex}.host{width:50vw;height:800px;overflow:auto;position:relative}</style><div id="one" class="host"></div><div id="two" class="host"></div><script type="module">import {mountNativeViewer} from "./contents-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/contents-native.html');await page.waitForFunction(()=>!!window.mount);await page.evaluate(raw=>{window.one=mount(document.querySelector('#one'),raw);window.two=mount(document.querySelector('#two'),raw);},story());
  const one=page.locator('#one'),two=page.locator('#two'),standard=one.locator('.reader-tree-sections[data-reader-view="full"]');await expect(standard.getByRole('button')).toHaveCount(3);await standard.getByRole('button',{name:'Find the right workspace in Backstage',exact:true}).click();await expect(standard.getByRole('button',{name:'Find the right workspace in Backstage',exact:true})).toHaveAttribute('aria-current','page');await expect(one.locator('.doc-sec:visible')).toHaveCount(3);
  const nativeHeading=await one.locator('#section-backstage .sec-h').boundingBox(),nativeNav=await one.locator('.reader-navigation').boundingBox(),nativeHost=await one.boundingBox();expect(await one.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);expect(nativeHeading.y).toBeGreaterThanOrEqual(nativeHost.y+nativeNav.height);expect(nativeHeading.y).toBeLessThanOrEqual(nativeHost.y+nativeHost.height*.6);expect(nativeHeading.y+nativeHeading.height).toBeLessThanOrEqual(nativeHost.y+nativeHost.height);
  await choose(one,'explore');await one.locator('.reader-theme-menu>summary').click();await one.getByRole('menuitemradio',{name:'Rose',exact:true}).click();await expect(one.locator('.docview')).toHaveClass(/sk-rose/);await expect(two.locator('.docview')).not.toHaveClass(/sk-rose/);
  const canvas=await one.locator('.viewer-diagram-canvas').boundingBox();expect(canvas.x+canvas.width).toBeLessThanOrEqual(900);
  const nativeRoot=await one.locator('flowview-root').boundingBox(),sidebar=await one.locator('.reader-contents').boundingBox();expect(sidebar.y+sidebar.height).toBe(nativeRoot.y+nativeRoot.height);
  await page.evaluate(()=>window.one.destroy());await two.getByRole('button',{name:'Next Page',exact:true}).click();await expect(two.locator('.reader-page-label')).toHaveText('Page 2 of 3');await expect(one.locator('.reader-navigation')).toHaveCount(0);
});


test('desktop Contents closes on transition to phone and releases its focus trap',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});const root=await open(page,server),toggle=root.locator('.reader-top>button');
  await expect(root.locator('.reader-contents')).toBeVisible();await root.locator('.reader-tree-view[aria-current="page"]').focus();
  await page.setViewportSize({width:390,height:844});
  await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(toggle).toBeFocused();await expect(root.locator('.reader-scrim')).toBeHidden();
  await root.getByRole('button',{name:'Next Page',exact:true}).click();await expect(root.locator('.reader-page-label')).toHaveText('Page 2 of 3');
  await toggle.click();await expect(root.locator('.reader-contents')).toBeVisible();
  // A height-only resize must preserve a deliberately opened phone overlay.
  await page.setViewportSize({width:390,height:700});await expect(toggle).toHaveAttribute('aria-expanded','true');
  await page.keyboard.press('Escape');await expect(toggle).toBeFocused();await expect(toggle).toHaveAttribute('aria-expanded','false');
});

for(const width of [1440,390])test('top Views route with Contents closed and retain keyboard focus at '+width,async({page,server})=>{
  await page.setViewportSize({width,height:900});const root=await open(page,server),strip=root.getByRole('tablist',{name:'Views in selected Tab'}),toggle=root.locator('.reader-top>button');
  if(await root.locator('.reader-contents').isVisible())await toggle.click();
  await expect(strip.getByRole('tab')).toHaveText(['Full story','Explore story','Review + Backstage']);
  const full=strip.getByRole('tab',{name:'Full story',exact:true}),subset=strip.getByRole('tab',{name:'Review + Backstage',exact:true});
  await full.focus();await page.keyboard.press('ArrowRight');const explore=strip.getByRole('tab',{name:'Explore story',exact:true});await expect(explore).toBeFocused();
  await page.evaluate(()=>location.hash='d=review&v=full');await expect(root.locator('.reader-page-label')).toHaveText('Page 2 of 3');await expect(explore).toBeFocused();await expect(explore).toHaveAttribute('tabindex','0');await expect(full).toHaveAttribute('tabindex','-1');await expect(full).toHaveAttribute('aria-selected','true');await expect(strip.locator('[tabindex="0"]')).toHaveCount(1);
  await page.evaluate(()=>location.hash='d=build&v=full');await expect(root.locator('.reader-page-label')).toHaveText('Page 1 of 3');
  await full.focus();await page.keyboard.press('End');await expect(subset).toBeFocused();await expect(full).toHaveAttribute('aria-selected','true');await page.keyboard.press('Enter');
  await expect(subset).toBeFocused();await expect(subset).toHaveAttribute('aria-selected','true');await expect(root.locator('.reader-contents')).toBeHidden();
  await expect(root.locator('.explore-active-section')).toHaveAttribute('id','section-backstage');await expect(root.locator('.reader-page-label')).toHaveText('Page 1 of 2');expect(new URL(page.url()).hash).toContain('v=subset');
  await root.getByRole('button',{name:'Next Page',exact:true}).click();await expect(root.locator('.explore-active-section')).toHaveAttribute('id','section-review');
  const step=root.locator('#section-review .stepid'),before=await step.innerText();await page.evaluate(()=>document.body.classList.add('presenting'));
  await subset.focus();await page.keyboard.press('ArrowLeft');await expect(strip.getByRole('tab',{name:'Explore story',exact:true})).toBeFocused();await expect(subset).toHaveAttribute('aria-selected','true');await expect(step).toHaveText(before);
  await page.keyboard.press('Space');await expect(strip.getByRole('tab',{name:'Explore story',exact:true})).toHaveAttribute('aria-selected','true');await expect(step).toHaveText(before);await expect(root.locator('#section-review .termbar')).toContainText('Paused');await page.evaluate(()=>document.body.classList.remove('presenting'));
  await toggle.click();await expect(root.locator('.reader-tree-view[data-tab-view=explore]')).toHaveAttribute('aria-current','page');await choose(root,'full');await expect(full).toHaveAttribute('aria-selected','true');
  await page.evaluate(()=>location.hash='d=review&v=explore');await expect(strip.getByRole('tab',{name:'Explore story',exact:true})).toHaveAttribute('aria-selected','true');await expect(root.locator('#section-build')).toBeHidden();await expect(root.locator('#section-review')).toBeVisible();
  if(!await root.locator('.reader-contents').isVisible())await toggle.click();await root.locator('.reader-tree-tab').filter({hasText:'Reference'}).click();await root.locator('.reader-tree-tab').filter({hasText:'Reference'}).locator('..').locator('.reader-tree-view').first().click();
  await expect(root.locator('.reader-tab-label')).toHaveText('Reference');await expect(strip.getByRole('tab')).toHaveCount(1);await expect(strip.getByRole('tab',{selected:true})).toHaveText('Standard');await expect(root.locator('#section-reference')).toBeVisible();
});

for(const width of [1440,1120,768,390,320,286])test('all top Views wrap without overflow or presentation height changes at '+width,async({page,server},info)=>{
  await page.setViewportSize({width,height:1000});const raw=story('lavender'),tab=raw.page.sections[0].tabs[0];
  tab.views.push(...Array.from({length:4},(_,i)=>({id:'long-'+i,name:i===0?'Complete product journey and implementation review with supporting source context'.slice(0,80):'Additional review choice '+(i+1),presentation:i%2?'explore':'standard',sections:['build','review']})));
  const input=path.join(server.root,'top-long.json'),output=path.join(server.root,'top-long.html');await writeFile(input,JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);await page.goto(server.origin+'/top-long.html');await page.evaluate(()=>document.fonts.ready);
  const nav=page.locator('.reader-navigation'),strip=nav.locator('.reader-view-strip');await expect(strip.getByRole('tab')).toHaveCount(7);
  const box=await nav.boundingBox();
  for(const choice of await strip.getByRole('tab').all()){
    await expect(choice).toBeVisible();const r=await choice.boundingBox();expect(r.x).toBeGreaterThanOrEqual(0);expect(r.x+r.width).toBeLessThanOrEqual(width);expect(r.height).toBeGreaterThanOrEqual(30);expect(r.y+r.height).toBeLessThanOrEqual(box.y+box.height-45);
    await choice.click();await expect(choice).toHaveAttribute('aria-selected','true');expect(await nav.boundingBox()).toEqual(box);
  }
  // Selection is synchronous, but the shared viewport and header ResizeObservers
  // finish their layout on subsequent frames. Assert the exact settled document
  // width, including content outside the header, rather than racing that work.
  try{await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);}
  catch(error){
    const diagnostic=await page.evaluate(async()=>{
      const frames=[];
      for(let i=0;i<3;i++){
        if(i)await new Promise(requestAnimationFrame);
        const limit=document.documentElement.clientWidth;
        frames.push({root:document.documentElement.scrollWidth,body:document.body.scrollWidth,limit,
          overflow:[...document.querySelectorAll('*')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.right>limit;}).map(el=>{
            const r=el.getBoundingClientRect(),s=getComputedStyle(el),ancestors=[];
            for(let parent=el.parentElement;parent;parent=parent.parentElement)ancestors.push({tag:parent.tagName,id:parent.id,class:parent.getAttribute('class'),overflow:getComputedStyle(parent).overflow});
            return{tag:el.tagName,id:el.id,class:el.getAttribute('class'),x:r.x,right:r.right,width:r.width,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,position:s.position,overflow:s.overflow,minWidth:s.minWidth,ancestors};
          })});
      }
      return frames;
    });
    await info.attach('document-overflow-geometry',{body:JSON.stringify(diagnostic,null,2),contentType:'application/json'});throw error;
  }
  const center=await nav.locator('.reader-page-index').evaluate(el=>{const r=el.getBoundingClientRect();return(r.left+r.right)/2;});expect(Math.abs(center-width/2)).toBeLessThan(1);
  await strip.getByRole('tab',{name:'Explore story',exact:true}).click();const canvas=await page.locator('.viewer-diagram-canvas').boundingBox();expect(canvas.y).toBe(box.y+box.height);
  if(width>670){const side=await nav.locator('.reader-contents').boundingBox();expect(side.y).toBe(box.y+box.height);}
  await info.attach('wrapped-top-'+width,{body:await page.screenshot(),contentType:'image/png'});
});

/* #554 exported reader chrome. Chuck's ruling: remove the build line, keep the theme picker.
   row | fixture | assertion (scoped) | rejects
   1 no build line on load | exported contents.html (pastel), Full + Explore views | #docview has no [data-dv-skin-label] and no direct-child <p> reading "generated from spec" | CSS-only hiding; dropping only the data attribute
   2 no build line after theme change | real clicks Theme -> each skin | same scoped check after every skin | applySkinClasses re-inserting or rewriting the line
   3 theme picker kept | .reader-theme-footer in exported page | footer visible; choosing a theme via real clicks flips #docview's sk-* class and the summary | hiding the picker per the issue's original recommendation
   4 header company name >= 4.5:1 | global placeholder brand, every SELECTABLE skin | .doc-heading .doc-company-brand .fv-brand-name color vs composited ancestor background-color | white brand fg (#FFFFFF) inherited onto light skins; fixing only one skin
   5 monogram text >= 4.5:1 | same | .fv-brand-monogram color vs its own background | a fix that recolors the mark text onto its accent fill
   The brand must render (company-brand-header.test.js and shared-icons.spec.mjs require it), so "not rendered" is not taken here. */
test('exported reader omits the build line, keeps the theme picker and renders a legible company placeholder',async({page,server})=>{
  const root=await open(page,server,'pastel'),themes=['aurora','pastel','blueprint','terminal','rose','lavender','lilac'];
  const footer=root.locator('.reader-theme-footer'),summary=footer.locator('.reader-theme-menu>summary');
  const brand=root.locator(':scope > .doc-heading .doc-company-brand'),name=brand.locator('.fv-brand-name'),mark=brand.locator('.fv-brand-monogram');
  async function noBuildLine(){
    await expect(root.locator('[data-dv-skin-label]')).toHaveCount(0);
    await expect(root.locator(':scope > p').filter({hasText:/generated from spec/i})).toHaveCount(0);
  }
  const contrast=locator=>locator.evaluate((el,own)=>{
    const rgba=v=>{const m=v.match(/[\d.]+/g).map(Number);return{r:m[0],g:m[1],b:m[2],a:m.length>3?m[3]:1};};
    const over=(top,base)=>({r:top.r*top.a+base.r*(1-top.a),g:top.g*top.a+base.g*(1-top.a),b:top.b*top.a+base.b*(1-top.a),a:1});
    const layers=[];for(let node=own?el:el.parentElement;node;node=node.parentElement){const c=rgba(getComputedStyle(node).backgroundColor);if(c.a>0)layers.push(c);if(c.a>=1)break;}
    let bg={r:255,g:255,b:255,a:1};for(const layer of layers.reverse())bg=over(layer,bg);
    const fg=over(rgba(getComputedStyle(el).color),bg);
    const lum=c=>{const ch=[c.r,c.g,c.b].map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return 0.2126*ch[0]+0.7152*ch[1]+0.0722*ch[2];};
    const a=lum(fg),b=lum(bg);return(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
  },locator===mark);
  await expect(root).toHaveClass(/sk-pastel/);await expect(summary).toHaveAttribute('data-current-skin','pastel');
  const strip=root.getByRole('tablist',{name:'Views in selected Tab'});
  for(const view of ['Full story','Explore story']){await strip.getByRole('tab',{name:view,exact:true}).click();await noBuildLine();}
  await expect(footer).toBeVisible();await expect(summary).toHaveAttribute('aria-label','Choose theme');
  await expect(name).toHaveText(activeCompanyBrand.app);await expect(name).toBeVisible();await expect(mark).toBeVisible();
  for(const skin of themes){
    await summary.click();await footer.locator('[data-reader-skin="'+skin+'"]').click();
    await expect(root).toHaveClass(new RegExp('(^|\\s)sk-'+skin+'(\\s|$)'));await expect(summary).toHaveAttribute('data-current-skin',skin);
    await noBuildLine();
    expect(await contrast(name),'company name contrast in '+skin).toBeGreaterThanOrEqual(4.5);
    expect(await contrast(mark),'monogram contrast in '+skin).toBeGreaterThanOrEqual(4.5);
  }
});

test('embedded top Views only offer memberships containing the embedded Section',async({page,server})=>{
  const root=await open(page,server);await page.goto(server.origin+'/contents.html#embed=build&v=explore');
  const strip=root.getByRole('tablist',{name:'Views in selected Tab'});await expect(strip.getByRole('tab')).toHaveText(['Full story','Explore story']);
  await expect(root.locator('.reader-tree-sections[data-reader-view="full"] .reader-tree-section')).toHaveText(['Turn a doorbell story into a reviewable draft']);
  for(const name of ['Full story','Explore story']){await strip.getByRole('tab',{name,exact:true}).click();await expect(root.locator('.doc-sec .board:visible')).toHaveCount(1);await expect(root.locator('#section-build .board')).toBeVisible();await expect(root.locator('.reader-page-label')).toHaveText('Page 1 of 1');}
});

test('native top Views retain focus and align wrapped headers with their bounded canvas',async({page,server})=>{
  await writeFile(path.join(server.root,'top-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'top-native.html'),'<style>body{margin:0;padding:40px}.host{width:570px;height:760px;overflow:auto;position:relative}</style><div id="one" class="host"></div><script type="module">import {mountNativeViewer} from "./top-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/top-native.html');await page.waitForFunction(()=>!!window.mount);await page.evaluate(raw=>window.viewer=mount(document.querySelector('#one'),raw),story('lilac'));
  const host=page.locator('#one'),nav=host.locator('.reader-navigation'),strip=nav.getByRole('tablist',{name:'Views in selected Tab'});
  for(const width of [570,286,1120]){
    await host.evaluate((el,width)=>el.style.width=width+'px',width);await expect.poll(()=>nav.evaluate(el=>el.getBoundingClientRect().width)).toBe(width);
    const explore=strip.getByRole('tab',{name:'Explore story',exact:true});await explore.click();await expect(explore).toBeFocused();await expect(explore).toHaveAttribute('aria-selected','true');
    const header=await nav.boundingBox(),canvas=await host.locator('.viewer-diagram-canvas').boundingBox(),bounds=await host.locator('flowview-root').boundingBox();expect(header.y).toBe(bounds.y);expect(canvas.y).toBe(header.y+header.height);expect(canvas.x).toBeGreaterThanOrEqual(bounds.x);expect(canvas.x+canvas.width).toBeLessThanOrEqual(bounds.x+bounds.width);expect(canvas.y+canvas.height).toBe(bounds.y+bounds.height);
    await strip.getByRole('tab',{name:'Full story',exact:true}).click();expect(await nav.boundingBox()).toEqual(header);
  }
  await page.evaluate(()=>viewer.destroy());await expect(nav).toHaveCount(0);
});

/* #552 — Contents "you are here" on scroll; header title room at 1440.
   row | fixture | assertion (scoped) | rejects
   S1 precondition | Full story stack, 1440x900, top of page | Full story Contents rows aria-current = [page,false,false] | a test that starts already on the target row
   S2 scroll marks entry | real mouse.wheel down to Review | Full story rows = [false,page,false] (only the Review row) | highlight stuck on the last clicked/loaded row
   S3 scroll to end | real mouse.wheel to page end | rows = [false,false,page] | tracking only the first transition / never reaching the last section
   S4 scroll back | real mouse.wheel up to top | rows = [page,false,false] | one-way tracking
   S5 click still works | real click on the Review row | that row aria-current=page, #section-review top within 24px under the header (its scroll-margin) | scroll tracking that swallows or overrides Contents clicks
   S6 click does not pin | real mouse.wheel up after the click | rows = [page,false,false] | a click that freezes the highlight ("keeps whatever was last clicked")
   S7 deep link kept | opened from #t=<tab>&d=build deep link; location.hash before/after each scroll | full hash (t= and d=) unchanged by scrolling; click rewrites d=review and keeps t= | scroll tracking that rewrites #d=/#t= deep links
   T1 title fits | 31-char Tab label, 1440x900 | .reader-tab-label text = full label and its scrollWidth <= clientWidth | a 120px header column that ellipsizes "Chime Doorbell — …"
   T2 hover tooltip | same | .reader-tab-label title = full label | a clipped label without a full-title tooltip
   T3 long title bounded | 90-char Tab label, 1440x900 | title = full label; label right edge <= Views strip left; no page-wide horizontal overflow | an unbounded label pushing the Views strip off the header */
function labelled(label){const raw=story();raw.page.sections[0].tabs[0].label=label;return raw;}
test('scrolling marks the visible section in Contents without pinning clicks or rewriting the deep link',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});const root=await openRaw(page,server,labelled('Chime Doorbell — motion to clip'),'contents-scroll');await page.goto(server.origin+'/contents-scroll.html#t=chime-doorbell-motion-to-clip&d=build&v=full');await page.reload();
  const rows=root.locator('.reader-tree-sections[data-reader-view="full"] .reader-tree-section'),current=()=>rows.evaluateAll(els=>els.map(el=>el.getAttribute('aria-current')));
  const wheel=async dy=>{await page.mouse.move(720,600);await page.mouse.wheel(0,dy);};
  await expect(rows).toHaveText(['Turn a doorbell story into a reviewable draft','Decide what becomes the accepted diagram','Find the right workspace in Backstage']);
  await expect.poll(current).toEqual(['page','false','false']);const hash=await page.evaluate(()=>location.hash);expect(hash).toContain('t=chime-doorbell-motion-to-clip');expect(hash).toContain('d=build');
  const reviewTop=await root.locator('#section-review').evaluate(el=>el.getBoundingClientRect().top),navBottom=await root.locator('.reader-navigation').evaluate(el=>el.getBoundingClientRect().bottom);
  await wheel(Math.round(reviewTop-navBottom-8));await expect.poll(current).toEqual(['false','page','false']);expect(await page.evaluate(()=>location.hash)).toBe(hash);
  await wheel(4000);await expect.poll(current).toEqual(['false','false','page']);expect(await page.evaluate(()=>location.hash)).toBe(hash);
  await wheel(-4000);await expect.poll(current).toEqual(['page','false','false']);expect(await page.evaluate(()=>location.hash)).toBe(hash);
  await rows.nth(1).click();await expect.poll(current).toEqual(['false','page','false']);await expect.poll(()=>page.evaluate(()=>location.hash)).toContain('d=review');expect(await page.evaluate(()=>location.hash)).toContain('t=chime-doorbell-motion-to-clip');
  const target=await root.locator('#section-review').boundingBox(),header=await root.locator('.reader-navigation').boundingBox();expect(target.y).toBeGreaterThanOrEqual(header.y+header.height);expect(target.y).toBeLessThanOrEqual(header.y+header.height+24);
  const clicked=await page.evaluate(()=>location.hash);await wheel(-4000);await expect.poll(current).toEqual(['page','false','false']);expect(await page.evaluate(()=>location.hash)).toBe(clicked);
});
test('header Tab title keeps about 30 characters unclipped at 1440 and names the full title on hover',async({page,server})=>{
  await page.setViewportSize({width:1440,height:900});
  for(const label of ['Chime Doorbell — motion to clip','Chime Doorbell — motion to clip, thermal throttle, shutdown and recovery for the resident']){
    const root=await openRaw(page,server,labelled(label),'contents-title-'+label.length),title=root.locator('.reader-top .reader-tab-label');
    await expect(title).toHaveText(label);await title.hover();await expect(title).toHaveAttribute('title',label);
    const box=await title.evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth,right:el.getBoundingClientRect().right,strip:el.closest('.reader-top').querySelector('.reader-view-strip').getBoundingClientRect().left}));
    if(label.length<=31)expect(box.scroll).toBeLessThanOrEqual(box.client);
    expect(box.right).toBeLessThanOrEqual(box.strip);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(1440);
  }
});
