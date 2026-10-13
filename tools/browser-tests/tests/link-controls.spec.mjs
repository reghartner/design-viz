import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,paste,closeTools,chooseNavigation} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

function spec(){
 return {page:{title:'Link controls',skin:'pastel',blocks:[{tabs:[{label:'Story',sections:[{
  id:'delivery',heading:'Delivery',text:'Reader notes.',contract:{title:'Message',fields:[{k:'id',v:'42'}]},diagram:{
   view:'step',autoplay:false,nodes:{a:{title:'Client'},b:{title:'Service'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],
   steps:[{id:'send',edge:'a->b',text:'Send'},{id:'done',nodes:['b'],text:'Done'}],
   layouts:[
    {id:'canvas',name:'Canvas',presentation:'explore',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}},
    {id:'page',name:'Page',presentation:'standard',sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}}
   ],defaultLayout:'canvas'
  }
 }]},{label:'Reference',sections:[{id:'reference',heading:'Reference',text:'Reference notes.'}]}]}]}};
}

async function captureClipboard(page){
 await page.addInitScript(()=>{window.__copied=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied.push(text);}}});});
}
async function copied(page){return page.evaluate(()=>window.__copied.at(-1));}
async function build(server,name){
 const input=path.join(server.root,name+'.json'),output=path.join(server.root,name+'.html');
 await writeFile(input,JSON.stringify(spec()));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
 return server.origin+'/'+name+'.html';
}
function controls(root){
 return {
  tab:root.getByRole('button',{name:'Copy link to tab Story',exact:true}),
  chapter:root.getByRole('button',{name:/^Copy (?:embed link for|link to section) Delivery/}),
  step:root.getByRole('button',{name:'Copy link to this diagram step',exact:true}),
  contract:root.getByRole('button',{name:'Copy link to this contract card',exact:true})
 };
}

test('standalone unified navigation keeps tab, chapter, step and contract links reachable and stateful',async({page,server})=>{
 await captureClipboard(page);const url=await build(server,'link-controls');
 await page.goto(url+'#t=story&d=delivery&v=canvas&m=step&s=done&x=delivery');
 const root=page.locator('#docview'),nav=root.locator('.explore-navigation'),copy=controls(root);
 await expect(nav).toBeVisible();
 for(const button of [copy.tab,copy.chapter,copy.step])await expect(button).toBeVisible();
 await copy.step.focus();await page.keyboard.press('Enter');let link=new URL(await copied(page));
 expect(link.hash).toContain('t=story');expect(link.hash).toContain('d=delivery');expect(link.hash).toContain('v=canvas');expect(link.hash).toContain('s=done');expect(link.hash).toContain('x=delivery');
 await copy.chapter.click();const embed=await copied(page);link=new URL(embed);expect(link.hash).toBe('#embed=delivery&v=canvas');
 await copy.tab.click();link=new URL(await copied(page));expect(link.hash).toContain('t=story');expect(link.hash).toContain('x=delivery');
 await page.setViewportSize({width:390,height:800});await nav.locator('.reader-utilities>summary').click();
 for(const button of [copy.tab,copy.chapter,copy.step])await expect(button).toBeVisible();
 await chooseNavigation(nav,'View','Page');await expect(copy.contract).toBeVisible();
 await copy.contract.click();link=new URL(await copied(page));
 expect(link.hash).toContain('t=story');expect(link.hash).toContain('d=delivery');expect(link.hash).toContain('v=page');expect(link.hash).toContain('c=delivery');expect(link.hash).toContain('x=delivery');
 await page.emulateMedia({media:'print'});for(const button of [copy.tab,copy.chapter,copy.contract])await expect(button).toBeHidden();
 await page.emulateMedia({media:'screen'});await page.goto(embed);await expect(copy.chapter).toBeHidden();
});

test('workbench unified navigation does not hide link controls at mobile width',async({page,server})=>{
 await captureClipboard(page);await page.setViewportSize({width:390,height:800});
 await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec(),null,2));await closeTools(page);
 const root=page.locator('#docview'),nav=root.locator('.explore-navigation'),copy=controls(root);
 await nav.locator('.reader-utilities>summary').click();
 for(const button of [copy.chapter,copy.step])await expect(button).toBeVisible();await expect(copy.tab).toHaveCount(0);
 const clear=await copy.step.evaluate(button=>{const a=button.getBoundingClientRect(),tools=document.querySelector('.workspace-canvas-controls').getBoundingClientRect(),hit=document.elementFromPoint(a.left+a.width/2,a.top+a.height/2);return {overlap:Math.min(a.right,tools.right)-Math.max(a.left,tools.left)>1&&Math.min(a.bottom,tools.bottom)-Math.max(a.top,tools.top)>1,hit:button.contains(hit)};});
 expect(clear).toEqual({overlap:false,hit:true});
 await copy.step.click();const link=new URL(await copied(page));expect(link.href.split('#')[0]).toBe(page.url().split('#')[0]);expect(link.hash).toContain('d=delivery');expect(link.hash).toContain('s=send');
 await chooseNavigation(nav,'View','Page');await expect(copy.contract).toBeVisible();
 await page.setViewportSize({width:900,height:800});await page.locator('#workspace-more>summary').click();await page.locator('#workspace-appearance>summary').click();await page.locator('#open-page-preview').click();
 const preview=page.locator('#page-preview-view'),previewCopy=controls(preview);for(const button of [previewCopy.tab,previewCopy.chapter,previewCopy.step,previewCopy.contract])await expect(button).toBeVisible();
 await previewCopy.step.click();const previewLink=new URL(await copied(page));expect(previewLink.href.split('#')[0]).toBe(page.url().split('#')[0]);expect(previewLink.hash).toContain('s=send');await page.locator('#close-page-preview').click();
});

test('canon reader keeps one position-aware share action across tabs and diagram state',async({page,server})=>{
 await captureClipboard(page);const published=spec();published.page.canon={version:1,id:'links',kind:'canonical',owner:'group:default/docs'};
 await page.context().route('**/diagrams.json',route=>route.fulfill({json:{version:1,diagrams:[{id:'links',title:'Link controls',spec:published}]}}));
 await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-library').click();await page.getByRole('link',{name:/CANONICAL.*Link controls/}).click();
 const root=page.locator('#canon-reader'),nav=root.locator('.explore-navigation'),copy=controls(root),share=nav.getByRole('button',{name:'Copy link to current position',exact:true});
 await expect(nav.locator('.reader-utility-options').getByRole('button',{name:/^Copy link/})).toHaveCount(1);await expect(copy.step).toBeVisible();
 await chooseNavigation(nav,'Tab','Reference');await share.click();let link=new URL(await copied(page));
 expect(link.search).toBe('?diagram=links');expect(link.hash).toContain('t=reference');expect(link.hash).not.toContain('d=delivery');
 await chooseNavigation(nav,'Tab','Story');await root.getByRole('button',{name:'Next step',exact:true}).click();await nav.getByRole('button',{name:'Page',exact:true}).click();await share.click();link=new URL(await copied(page));
 expect(link.search).toBe('?diagram=links');for(const field of ['d=delivery','v=page','s=done'])expect(link.hash).toContain(field);
 const restoredPage=await page.context().newPage();await captureClipboard(restoredPage);await restoredPage.goto(link.href);
 const restoredRoot=restoredPage.locator('#canon-reader'),restoredNav=restoredRoot.locator('.explore-navigation'),restoredCopy=controls(restoredRoot),restoredShare=restoredNav.getByRole('button',{name:'Copy link to current position',exact:true});
  await expect(restoredRoot.getByRole('tab',{name:'Story',exact:true,includeHidden:true})).toHaveAttribute('aria-selected','true');
  await expect(restoredNav.getByRole('button',{name:'Page',exact:true})).toHaveAttribute('aria-pressed','true');await expect(restoredRoot.locator('.stepline')).toContainText('Done');await expect(restoredCopy.contract).toBeVisible();
 await restoredShare.click();const restored=new URL(await copied(restoredPage));for(const field of ['d=delivery','v=page','s=done'])expect(restored.hash).toContain(field);
 await restoredCopy.contract.click();const contextual=new URL(await copied(restoredPage));expect(contextual.search).toBe('?diagram=links');for(const field of ['d=delivery','v=page','s=done','c=delivery'])expect(contextual.hash).toContain(field);await restoredPage.close();
});
