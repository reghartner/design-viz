import {test,expect,paste} from '../helpers/test.mjs';
import {writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';

function story(multiple=false){
  const section=(id,detailOnly=false)=>({id,heading:id+' story',detailOnly,diagram:{
    view:'step',autoplay:false,nodes:{service:{title:id}},rows:[['service']],steps:[{id:'ready',text:'Ready',nodes:['service']}]
  }});
  const root=section('root'),child=section('child',true),grandchild=section('grandchild',true),other=section('other');
  root.diagram.nodes.service.detail={section:'child'};child.diagram.nodes.service.detail={section:'grandchild'};
  for(const s of [root,other]){s.diagram.layouts=[{id:'canvas',name:'Explore',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:12},{controls:'steps',x:0,y:12,w:12,h:4}]}}];s.diagram.defaultLayout='canvas';}
  return {page:{title:'Domain navigation',sections:[root,child,grandchild,...(multiple?[other]:[])]}};
}
async function open(page,server,raw,native=false){
  if(native){
    await writeFile(path.join(server.root,'domain-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
    await writeFile(path.join(server.root,'domain-native.html'),'<style>body{margin:0}#host{position:fixed;inset:0}</style><div id="host"></div><script type="module">import {mountNativeViewer} from "./domain-native.js";window.mount=mountNativeViewer;</script>');
    await page.goto(server.origin+'/domain-native.html');await page.waitForFunction(()=>!!window.mount);
    await page.evaluate(raw=>{window.viewer=mount(document.querySelector('#host'),raw);viewer.setCanvas(true);},raw);
    return page.locator('#host');
  }
  const input=path.join(server.root,'domain.json'),output=path.join(server.root,'domain.html');await writeFile(input,JSON.stringify(raw));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  await page.goto(server.origin+'/domain.html#d=root&v=canvas');return page.locator('#docview');
}

for(const native of [false,true])test(`${native?'native':'standalone'} story navigation excludes detail-only domains`,async({page,server})=>{
  const root=await open(page,server,story(true),native),menu=root.getByRole('combobox',{name:'Explore story',exact:true});
  await expect(menu.locator('option')).toHaveText(['root story','other story']);
  await root.locator('#section-root [data-dv-detail]').click();
  const child=root.locator('[data-dv-detail-preview]:visible');await expect(child.locator('.explore-board')).toBeVisible();
  await expect(menu.locator('option:checked')).toHaveText('root story');
  await menu.selectOption({label:'other story'});
  await expect(root.locator('[data-dv-detail-preview]')).toHaveCount(0);
  await expect(root.locator('#section-other .explore-board')).toBeVisible();
  await menu.selectOption({label:'root story'});await expect(root.locator('#section-root .explore-board')).toBeVisible();
});

for(const host of ['standalone','native','workbench'])test(`${host} nested Explore drill-down has no page flash with motion enabled`,async({page,server})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  let root;
  if(host==='workbench'){await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(story()));await page.getByRole('button',{name:'Hide tools',exact:true}).click();root=page.locator('#docview');}
  else root=await open(page,server,story(),host==='native');
  await expect(root.getByRole('combobox',{name:'Explore story',exact:true})).toBeHidden();
  for(let depth=0;depth<2;depth++){
    const parent=depth?root.locator('[data-dv-detail-preview]:visible'):root.locator('#section-root');
    // Sample every painted frame from the gesture, including the entry animation.
    await parent.evaluate(el=>{
      window.domainFrames=[];let remaining=24;const host=el.getRootNode();
      host.addEventListener('click',()=>requestAnimationFrame(function sample(){
        const child=Array.from(host.querySelectorAll('[data-dv-detail-preview]')).find(s=>!s.hidden);
        if(child){const board=child.querySelector('.explore-board'),r=board.getBoundingClientRect(),style=getComputedStyle(child);window.domainFrames.push({x:r.x,y:r.y,w:r.width,h:r.height,opacity:style.opacity,transform:style.transform});}
        if(--remaining)requestAnimationFrame(sample);
      }),{once:true,capture:true});
    });
    await parent.locator('[data-dv-detail]').click();
    await expect.poll(()=>page.evaluate(()=>window.domainFrames.length)).toBeGreaterThanOrEqual(20);
    const frames=await page.evaluate(()=>window.domainFrames);
    for(const frame of frames){expect(frame.opacity).toBe('1');expect(frame.transform).toBe('none');expect(frame.x).toBe(0);expect(frame.y).toBe(0);expect(frame.w).toBe(page.viewportSize().width);expect(frame.h).toBe(page.viewportSize().height);}
  }
  await root.locator('[data-dv-detail-preview]:visible .detail-breadcrumb button').first().click();
  await expect(root.locator('#section-root .explore-board')).toBeVisible();
  if(host==='standalone'){await root.locator('#section-root [data-dv-detail]').click();await page.reload();await expect(root.locator('[data-dv-detail-preview]:visible .explore-board')).toBeVisible();}
});
