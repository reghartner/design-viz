import {test,expect} from '../helpers/test.mjs';
import {writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';

function story(skin='pastel'){
  const section=(id,heading)=>({id,heading,text:'Keep the full section title and its live playback state.',diagram:{view:'step',autoplay:false,nodes:{a:{title:'Source'},b:{title:'Destination'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],steps:[{id:'first',text:'First',edge:'a->b'},{id:'second',text:'Second',edge:'a->b'}]}});
  return {page:{title:'Contents acceptance',skin,sections:[{tabs:[{label:'Product journey',defaultView:'full',views:[{id:'full',name:'Full story',presentation:'standard',sections:['build','review','backstage']},{id:'explore',name:'Explore story',presentation:'explore',sections:['build','review','backstage']},{id:'subset',name:'Review + Backstage',presentation:'explore',sections:['backstage','review']}],sections:[section('build','Turn a doorbell story into a reviewable draft'),section('review','Decide what becomes the accepted diagram'),section('backstage','Find the right workspace in Backstage')]},{label:'Reference',sections:[section('reference','Reference material')]}]}]}};
}
async function open(page,server,skin='pastel'){
  const input=path.join(server.root,'contents.json'),output=path.join(server.root,'contents.html');await writeFile(input,JSON.stringify(story(skin)));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);await page.goto(server.origin+'/contents.html');return page.locator('#docview');
}
async function choose(root,id){await root.locator('.reader-tree-view[data-tab-view="'+id+'"]').click();}

test('Contents preserves Standard stacks, ordered Explore members and state through theme changes',async({page,server})=>{
  const root=await open(page,server);await expect(root.locator('.reader-page-label')).toHaveText('Page 1 of 3');
  await expect(root.locator('.doc-sec:visible')).toHaveCount(3);
  await root.getByRole('button',{name:'Next Page',exact:true}).click();await expect(root.locator('.reader-page-label')).toHaveText('Page 2 of 3');await expect(root.locator('.doc-sec:visible')).toHaveCount(3);
  await choose(root,'subset');await expect(root.locator('.reader-page-label')).toHaveText('Page 2 of 2');
  await root.getByRole('button',{name:'Previous Page',exact:true}).click();await expect(root.locator('.explore-active-section')).toHaveAttribute('id','section-backstage');
  await root.getByRole('button',{name:'Next Page',exact:true}).click();await expect(root.locator('.explore-active-section')).toHaveAttribute('id','section-review');
  await root.locator('.reader-toolbar').getByRole('button',{name:'Zoom in',exact:true}).click();const zoom=await root.locator('.reader-zoom-menu>summary').innerText();
  const board=await root.locator('#section-review .board').elementHandle();
  await root.locator('.reader-theme-menu>summary').click();await expect(root.getByRole('menuitemradio')).toHaveText(['Aurora','Pastel','Blueprint','Terminal','Rose','Lavender','Opus Lilac']);
  await root.getByRole('menuitemradio',{name:'Opus Lilac',exact:true}).click();await expect(root).toHaveClass(/sk-lilac/);await expect(root.locator('.reader-page-label')).toHaveText('Page 2 of 2');await expect(root.locator('.reader-zoom-menu>summary')).toHaveText(zoom);expect(await board.evaluate(el=>el.isConnected)).toBe(true);
  await expect(root.locator('.reader-theme-menu>summary')).toBeFocused();
  await choose(root,'full');await root.locator('.reader-toolbar').getByRole('button',{name:'Zoom in',exact:true}).click();await expect(root.locator('#section-review')).toHaveCSS('zoom','1.25');
  await choose(root,'explore');await expect(root.locator('#section-review')).toHaveCSS('zoom','1');await choose(root,'full');await expect(root.locator('#section-review')).toHaveCSS('zoom','1.25');
  await root.locator('#section-backstage').evaluate(el=>el.scrollIntoView({block:'start'}));await expect(root.locator('.reader-page-label')).toHaveText('Page 3 of 3');await expect(root.locator('.doc-sec:visible')).toHaveCount(3);
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
  const one=page.locator('#one'),two=page.locator('#two');await choose(one,'explore');await one.locator('.reader-theme-menu>summary').click();await one.getByRole('menuitemradio',{name:'Rose',exact:true}).click();await expect(one.locator('.docview')).toHaveClass(/sk-rose/);await expect(two.locator('.docview')).not.toHaveClass(/sk-rose/);
  const canvas=await one.locator('.viewer-diagram-canvas').boundingBox();expect(canvas.x+canvas.width).toBeLessThanOrEqual(900);
  const nativeRoot=await one.locator('flowview-root').boundingBox(),sidebar=await one.locator('.reader-contents').boundingBox();expect(sidebar.y+sidebar.height).toBe(nativeRoot.y+nativeRoot.height);
  await page.evaluate(()=>window.one.destroy());await two.getByRole('button',{name:'Next Page',exact:true}).click();await expect(two.locator('.reader-page-label')).toHaveText('Page 2 of 3');await expect(one.locator('.reader-navigation')).toHaveCount(0);
});
