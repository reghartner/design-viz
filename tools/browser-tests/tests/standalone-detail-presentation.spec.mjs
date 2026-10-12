import {test,expect} from '../helpers/test.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';

function story(rootType,childType){
  function section(id,target,presentation){
    const diagram={view:'step',autoplay:false,nodes:{service:{title:id+' service'}},rows:[['service']],steps:[{id:'ready',nodes:['service'],text:id+' is ready.'}]};
    if(target)diagram.nodes.service.detail={section:target};
    const profile={default:[{x:0,y:0,w:12,h:12},{controls:'steps',x:0,y:12,w:12,h:4}]};
    if(presentation==='legacy')diagram.sectionLayout=profile;
    else if(presentation){diagram.layouts=[{id:'flow',name:id+' view',presentation,sectionLayout:profile}];diagram.defaultLayout='flow';}
    return {id,heading:id+' story',detailOnly:id!=='root',diagram};
  }
  return {page:{title:'Detail presentation inheritance',sections:[section('root','child',rootType),section('child','grandchild',childType),section('grandchild')]}};
}
async function surface(page,section,explore){
  await expect(section).toBeVisible();
  await expect(section.locator('.explore-stage'))[explore?'toBeVisible':'toBeHidden']();
  if(explore){
    await expect(page.locator('body')).toHaveClass(/viewer-exploring/);
    const shell=await section.locator('.viewer-diagram-canvas').boundingBox(),nav=await page.locator('#docview > .explore-navigation').boundingBox();
    const stage=await section.locator('.explore-stage').boundingBox(),board=await section.locator('.explore-board').boundingBox(),viewport=page.viewportSize();
    expect(nav.y).toBe(0);expect(nav.x).toBe(0);expect(nav.width).toBe(viewport.width);
    expect(shell).toEqual({x:0,y:nav.height,width:viewport.width,height:viewport.height-nav.height});expect(stage.y).toBeGreaterThanOrEqual(nav.y+nav.height);
    expect(board).toEqual(stage);
  }else{
    await expect(page.locator('body')).not.toHaveClass(/viewer-exploring/);
    await expect(section.locator('.section-viewport')).not.toHaveClass(/viewer-diagram-canvas|workbench-diagram-canvas/);
    await expect(section.locator('.board')).toBeVisible();
  }
}

for(const [rootType,childType,childExplore] of [
  ['explore','standard',false],['standard','explore',true],['explore',undefined,true],['explore','legacy',true]
])test(`standalone ${rootType} root respects ${childType || 'implicit'} child, nested inheritance and Back`,async({page,server},info)=>{
  const raw=story(rootType,childType),source=JSON.stringify(raw),input=path.join(server.root,'detail-types.json');
  const output=path.join(server.root,'detail-types.html');await writeFile(input,source);
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  await page.goto(server.origin+'/detail-types.html#d=root&v=flow');
  const root=page.locator('#section-root'),child=()=>page.locator('[data-dv-detail-preview]:visible');
  await surface(page,root,rootType==='explore');
  await root.locator('[data-dv-detail="service"]').click();await expect(root).toBeHidden();
  await expect(child()).toHaveCount(1);await surface(page,child(),childExplore);
  await page.screenshot({path:info.outputPath('child-presentation.png'),fullPage:true});
  await child().locator('[data-dv-detail="service"]').click();await surface(page,child(),childExplore);
  await expect(child().locator('.sec-h')).toHaveText('grandchild story');
  await page.reload();await surface(page,child(),childExplore);
  await expect(child().locator('.sec-h')).toHaveText('grandchild story');
  await child().getByRole('button',{name:'child story',exact:true}).click();await surface(page,child(),childExplore);
  await child().getByRole('navigation',{name:'Diagram drill-down'}).getByRole('button',{name:/Overview/}).click();
  await expect(page.locator('[data-dv-detail-preview]')).toHaveCount(0);await surface(page,root,rootType==='explore');
  await expect(root.locator('[data-dv-detail="service"]')).toBeFocused();
  expect(await readFile(input,'utf8')).toBe(source);
});
