import {test,expect,paste} from '../helpers/test.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {repo} from '../helpers/prepare.mjs';

const source=await readFile(path.join(repo,'src/starters/domain-drilldown.json'),'utf8');
async function childCanvas(root,page){
  const child=root.locator('[data-dv-detail-preview]:visible');
  await expect(child).toHaveCount(1);await expect(child.locator('.explore-board')).toBeVisible();
  const board=await child.locator('.explore-board').boundingBox(),head=await child.locator('.detail-head').boundingBox();
  expect(board.width).toBe(page.viewportSize().width);expect(board.height).toBe(page.viewportSize().height);
  expect(head.width).toBeGreaterThan(120);expect(head.height).toBeLessThan(180);
  return child;
}

test('editor canvas follows nested details, returns to its camera and edits the real child section',async({page,server})=>{
  await page.goto(server.origin+'/workbench.html');await paste(page,source);
  await page.getByRole('button',{name:'Hide tools',exact:true}).click();
  const root=page.locator('#docview'),parent=root.locator('#section-doorbell-domains');
  const camera=()=>parent.locator('.board').evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}));
  const before=await camera();
  await parent.locator('[data-dv-detail="connectivity"]').click();
  await expect(parent).toBeHidden();let child=await childCanvas(root,page);
  await child.locator('[data-dv-detail="handoff"]').click();child=await childCanvas(root,page);
  await child.locator('.detail-breadcrumb button').first().click();
  await expect(parent).toBeVisible();expect(await camera()).toEqual(before);
  await parent.locator('[data-dv-detail="connectivity"]').click();child=await childCanvas(root,page);
  await child.getByRole('button',{name:'Edit detail section',exact:true}).click();
  await expect(root.locator('#section-connectivity')).toHaveClass(/workspace-active-section/);
  await expect(root.locator('[data-dv-detail-preview]')).toHaveCount(0);
  await expect(page.locator('#src')).toHaveValue(source);
});

test('native canvas owns details while keeping root navigation, sibling isolation and curated return',async({page,server})=>{
  await writeFile(path.join(server.root,'canvas-detail-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'canvas-detail-native.html'),'<style>body{margin:0}#a{position:fixed;inset:0}</style><div id="a"></div><div id="b"></div><script type="module">import {mountNativeViewer} from "./canvas-detail-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/canvas-detail-native.html');await page.waitForFunction(()=>!!window.mount);
  await page.evaluate(raw=>{window.viewer=mount(document.querySelector('#a'),raw);window.other=mount(document.querySelector('#b'),raw);viewer.setCanvas(true);},JSON.parse(source));
  const root=page.locator('#a'),parent=root.locator('#section-doorbell-domains');
  await parent.locator('[data-dv-detail="connectivity"]').click();let child=await childCanvas(root,page);
  const snapshot=await page.evaluate(()=>viewer.snapshot());expect(snapshot.section).toBe('doorbell-domains');expect(snapshot.drilldown.frames).toHaveLength(1);
  await expect(page.locator('#b [data-dv-detail-preview]')).toHaveCount(0);
  await page.evaluate(()=>viewer.setCanvas(false));await expect(child.locator('.explore-stage')).toBeHidden();
  await page.evaluate(()=>viewer.setCanvas(true));child=await childCanvas(root,page);
  await child.getByRole('combobox',{name:'Explore story',exact:true}).selectOption('doorbell-domains');
  await expect(root.locator('[data-dv-detail-preview]')).toHaveCount(0);await expect(parent.locator('.explore-board')).toBeVisible();
  await page.evaluate(()=>{viewer.destroy();other.destroy();});await expect(root).toBeEmpty();
});

test('standalone Explore keeps detail navigation full-window through reload and Back',async({page,server})=>{
  const raw=JSON.parse(source),d=raw.page.sections[0].diagram;
  d.layouts=[{id:'canvas',name:'Canvas',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:15},{controls:'steps',x:0,y:15,w:12,h:7}]}}];d.defaultLayout='canvas';
  const input=path.join(server.root,'canvas-details.json'),output=path.join(server.root,'canvas-details.html');await writeFile(input,JSON.stringify(raw));
  execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
  await page.goto(server.origin+'/canvas-details.html#d=doorbell-domains&v=canvas');
  const root=page.locator('#docview');await root.locator('#section-doorbell-domains [data-dv-detail="connectivity"]').click();
  await childCanvas(root,page);await page.reload();const child=await childCanvas(root,page);
  await child.locator('.detail-breadcrumb button').first().click();await expect(root.locator('#section-doorbell-domains .explore-board')).toBeVisible();
});


test('canvas keeps unavailable, loading and failed detail messages above the diagram',async({page,server})=>{
  const raw=JSON.parse(source);raw.page.sections[0].diagram.nodes.connectivity.detail={spec:'external',revision:'r1',section:'child'};
  async function visibleNotice(root,text){
    const notice=root.locator('.detail-notice');await expect(notice).toContainText(text);await expect(notice).toBeVisible();
    expect(await notice.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(el.getRootNode().elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
  }
  await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(raw));
  await page.getByRole('button',{name:'Hide tools',exact:true}).click();
  await page.locator('#section-doorbell-domains [data-dv-detail="connectivity"]').click();
  await visibleNotice(page.locator('#docview'),'host');
  await writeFile(path.join(server.root,'notice-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
  await writeFile(path.join(server.root,'notice-native.html'),'<style>body{margin:0}#host{position:fixed;inset:0}</style><div id="host"></div><script type="module">import {mountNativeViewer} from "./notice-native.js";window.mount=mountNativeViewer;</script>');
  await page.goto(server.origin+'/notice-native.html');await page.waitForFunction(()=>!!window.mount);
  await page.evaluate(raw=>{window.viewer=mount(document.querySelector('#host'),raw,{loadDetail:()=>new Promise((resolve,reject)=>window.failDetail=reject)});viewer.setCanvas(true);},raw);
  await page.locator('#host [data-dv-detail="connectivity"]').click();await visibleNotice(page.locator('#host'),'Loading');
  await page.evaluate(()=>failDetail(new Error('Detail unavailable for this revision')));await visibleNotice(page.locator('#host'),'Detail unavailable');
  await page.evaluate(()=>viewer.destroy());
});
