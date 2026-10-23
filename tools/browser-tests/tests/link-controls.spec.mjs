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
async function standardPanelChoiceMetrics(panelBody){
 return panelBody.locator('.explore-panel-choices>label').first().evaluate(label=>{const base=label.getBoundingClientRect(),box=el=>{const r=el.getBoundingClientRect();return {x:r.x-base.x,y:r.y-base.y,width:r.width,height:r.height};},input=label.querySelector('input'),text=label.querySelector('span'),style=getComputedStyle(label),textStyle=getComputedStyle(text);return {label:{display:style.display,fontWeight:style.fontWeight,fontFamily:style.fontFamily,fontSize:style.fontSize,lineHeight:style.lineHeight,margin:style.margin,padding:style.padding,gridTemplateColumns:style.gridTemplateColumns,gap:style.gap,width:base.width,height:base.height},input:box(input),text:box(text),textFontWeight:textStyle.fontWeight,centerDelta:Math.abs(input.getBoundingClientRect().y+input.getBoundingClientRect().height/2-(text.getBoundingClientRect().y+text.getBoundingClientRect().height/2))};});
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

test('canon reader keeps one position-aware share action across tabs and diagram state',async({page,server},info)=>{
 await page.setViewportSize({width:1440,height:900});await captureClipboard(page);const published=spec();published.page.canon={version:1,id:'links',kind:'canonical',owner:'group:default/docs'};
 const artifactInput=path.join(server.root,'link-controls-artifact.json'),artifactOutput=path.join(server.root,'link-controls-artifact.html');await writeFile(artifactInput,JSON.stringify(published));execFileSync('python3',[path.join(repo,'tools/inject.py'),artifactInput,path.join(repo,'template/flowview.html'),artifactOutput]);
 await page.addInitScript(()=>{window.claude={use:()=>Promise.resolve(null)};});await page.goto(server.origin+'/link-controls-artifact.html');
 const artifactNav=page.locator('#docview>.explore-navigation'),artifactPanels=artifactNav.locator('.explore-panel-menu');await artifactPanels.locator('summary').click();const artifactPanelBody=artifactPanels.locator('.explore-panel-body');await expect(artifactPanelBody).toBeVisible();
 const artifactAlignment=await artifactPanelBody.locator('.explore-panel-choice').first().evaluate(row=>{const base=row.getBoundingClientRect(),box=el=>{const r=el.getBoundingClientRect();return {x:r.x-base.x,y:r.y-base.y,width:r.width,height:r.height};},text=row.querySelector('span');return {check:box(row.querySelector('input')),text:box(text),select:box(row.querySelector('select')),fontWeight:getComputedStyle(text).fontWeight};});expect(Math.abs(artifactAlignment.check.y+artifactAlignment.check.height/2-(artifactAlignment.text.y+artifactAlignment.text.height/2))).toBeLessThanOrEqual(2);expect(artifactAlignment.check.width).toBe(16);expect(artifactAlignment.select.height).toBeLessThanOrEqual(32);expect(artifactAlignment.fontWeight).toBe('400');
 await info.attach('artifact-explore-navbar-panels',{body:await page.screenshot(),contentType:'image/png'});
 await artifactPanels.locator('summary').click();await chooseNavigation(artifactNav,'View','Page');await artifactPanels.locator('summary').click();await expect(artifactPanelBody).toBeVisible();const artifactStandard=await standardPanelChoiceMetrics(artifactPanelBody);expect(artifactStandard.label.display).toBe('grid');expect(artifactStandard.label.fontWeight).toBe('400');expect(artifactStandard.label.margin).toBe('0px');expect(artifactStandard.input.width).toBe(16);expect(artifactStandard.textFontWeight).toBe('400');expect(artifactStandard.centerDelta).toBeLessThanOrEqual(2);await info.attach('artifact-standard-navbar-panels',{body:await page.screenshot(),contentType:'image/png'});await artifactPanels.locator('summary').click();await chooseNavigation(artifactNav,'View','Canvas');
 await page.context().route('**/diagrams.json',route=>route.fulfill({json:{version:1,diagrams:[{id:'links',title:'Link controls',spec:published}]}}));
 await page.goto(server.origin+'/workbench.html');await page.locator('#welcome-library').click();await page.getByRole('link',{name:'Link controls',exact:true}).click();
 const root=page.locator('#canon-reader'),nav=root.locator('.explore-navigation'),copy=controls(root),share=nav.getByRole('button',{name:'Copy link to current position',exact:true});
 const panels=nav.locator('.explore-panel-menu');await panels.locator('summary').click();const panelBody=panels.locator('.explore-panel-body');await expect(panelBody).toBeVisible();
 const panelVisual=await panelBody.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {left:r.left,right:r.right,bottom:r.bottom,bg:s.backgroundColor,radius:s.borderRadius};});expect(panelVisual.left).toBeGreaterThanOrEqual(12);expect(panelVisual.right).toBeLessThanOrEqual(1428);expect(panelVisual.bottom).toBeLessThanOrEqual(888);expect(panelVisual.radius).toBe('10px');expect(panelVisual.bg).not.toBe('rgba(0, 0, 0, 0)');
 const canonAlignment=await panelBody.locator('.explore-panel-choice').first().evaluate(row=>{const base=row.getBoundingClientRect(),box=el=>{const r=el.getBoundingClientRect();return {x:r.x-base.x,y:r.y-base.y,width:r.width,height:r.height};},text=row.querySelector('span');return {check:box(row.querySelector('input')),text:box(text),select:box(row.querySelector('select')),fontWeight:getComputedStyle(text).fontWeight};});expect(canonAlignment).toEqual(artifactAlignment);await expect(panelBody.getByRole('button',{name:'Saved visibility…',exact:true})).toHaveCount(0);
 await info.attach('canon-navbar-panels',{body:await page.screenshot(),contentType:'image/png'});await panels.locator('summary').click();
 await chooseNavigation(nav,'View','Page');await panels.locator('summary').click();await expect(panelBody).toBeVisible();const canonStandard=await standardPanelChoiceMetrics(panelBody);expect(canonStandard).toEqual(artifactStandard);await info.attach('canon-standard-navbar-panels',{body:await page.screenshot(),contentType:'image/png'});await panels.locator('summary').click();await chooseNavigation(nav,'View','Canvas');
 await expect(nav.locator('.reader-utility-options').getByRole('button',{name:/^Copy link/})).toHaveCount(1);await expect(copy.step).toBeVisible();
 await expect(copy.chapter).toBeVisible();await expect(share.locator('svg path')).toHaveCount(3);await expect(copy.chapter.locator('svg rect')).toHaveCount(1);
 await chooseNavigation(nav,'Tab','Reference');await share.click();let link=new URL(await copied(page));
 expect(link.search).toBe('?diagram=links');expect(link.hash).toContain('t=reference');expect(link.hash).not.toContain('d=delivery');
 await chooseNavigation(nav,'Tab','Story');await root.getByRole('button',{name:'Next step',exact:true}).click();await nav.getByRole('button',{name:'Page',exact:true}).click();await share.click();link=new URL(await copied(page));
 expect(link.search).toBe('?diagram=links');for(const field of ['d=delivery','v=page','s=done'])expect(link.hash).toContain(field);
 await copy.chapter.click();const embed=new URL(await copied(page));expect(embed.search).toBe('?diagram=links');for(const field of ['embed=delivery','d=delivery','v=page','s=done'])expect(embed.hash).toContain(field);
 const embedPage=await page.context().newPage();await embedPage.goto(embed.href);await expect(embedPage.locator('#canon-reader')).toBeVisible();await expect(embedPage.locator('#section-delivery')).toHaveClass(/dv-embed-target/);await expect(embedPage.locator('body')).toHaveClass(/dv-embed/);await expect(embedPage.locator('#canon-reader .explore-navigation')).toBeVisible();await embedPage.close();
 const restoredPage=await page.context().newPage();await captureClipboard(restoredPage);await restoredPage.goto(link.href);
 const restoredRoot=restoredPage.locator('#canon-reader'),restoredNav=restoredRoot.locator('.explore-navigation'),restoredCopy=controls(restoredRoot),restoredShare=restoredNav.getByRole('button',{name:'Copy link to current position',exact:true});
  await expect(restoredRoot.getByRole('tab',{name:'Story',exact:true,includeHidden:true})).toHaveAttribute('aria-selected','true');
  await expect(restoredNav.getByRole('button',{name:'Page',exact:true})).toHaveAttribute('aria-pressed','true');await expect(restoredRoot.locator('.stepline')).toContainText('Done');await expect(restoredCopy.contract).toBeVisible();
 await restoredShare.click();const restored=new URL(await copied(restoredPage));for(const field of ['d=delivery','v=page','s=done'])expect(restored.hash).toContain(field);
 await restoredCopy.contract.click();const contextual=new URL(await copied(restoredPage));expect(contextual.search).toBe('?diagram=links');for(const field of ['d=delivery','v=page','s=done','c=delivery'])expect(contextual.hash).toContain(field);await restoredPage.close();
});

/* #579 contract matrix — a #t= deep link lands like a tab click (fixture: docs/diagrams/backstage/backstage.spec.json, Deployment tab)
 row | fixture | assertion (scoped) | rejects
 1 heading below bar 1440x900 | fresh load url#t=deployment | first shown .doc-sec .sec-h top in the Deployment tabpanel >= #docview > .explore-navigation bottom | scrolling the collapsed in-page tab button to the top (heading under the 102px bar)
 2 heading below bar 1280x800 | same at 1280x800 | same as row 1 | an offset tuned for one viewport only
 3 lands where a tab click lands | fresh load url, Deployment panel hidden + scrollY 0, real click through the reader Tab menu | hash-arrival section top equals click-arrival section top (±1px) | not scrolling at all, or a different offset than the click path
 4 tab click unchanged | same click | click section top = bar bottom + 12 and heading >= bar bottom | a fix that shifts tab clicks too
 5 deep link still selects the tab | url#t=deployment | Deployment role=tab aria-selected=true, Deployment tabpanel visible, the parsed location.hash t field equals deployment | a fix that rewrites or drops the fragment */
for(const [width,height] of [[1440,900],[1280,800]])test(`#t= deep link lands the tab's first heading below the navigation bar like a tab click at ${width}x${height}`,async({page,server})=>{
 const output=path.join(server.root,'backstage-579.html');
 execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(repo,'docs/diagrams/backstage/backstage.spec.json'),path.join(repo,'template/flowview.html'),output]);
 const url=server.origin+'/backstage-579.html',root=page.locator('#docview'),nav=root.locator(':scope > .explore-navigation'),tab=root.getByRole('tab',{name:'Deployment',exact:true,includeHidden:true});
 const landing=()=>page.evaluate(()=>{const view=document.querySelector('#docview'),bar=view.querySelector(':scope > .explore-navigation').getBoundingClientRect(),button=[...view.querySelectorAll('.tabbtn')].find(b=>b.textContent==='Deployment'),tabPanel=view.querySelector('[aria-labelledby="'+button.id+'"]'),sec=[...tabPanel.querySelectorAll('.doc-sec')].find(s=>s.getClientRects().length>0),head=sec && sec.querySelector('.sec-h').getBoundingClientRect();return {barBottom:bar.bottom,section:sec && sec.id,sectionTop:sec && sec.getBoundingClientRect().top,headingTop:head && head.top,panelHidden:tabPanel.hidden,scrollY:window.scrollY};});
 await page.setViewportSize({width,height});
 await page.goto(url+'#t=deployment');await expect(nav).toBeVisible();await expect(tab).toHaveAttribute('aria-selected','true');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const linked=await landing();expect(linked.panelHidden).toBe(false);expect(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('t')).toBe('deployment');
 expect(linked.barBottom).toBeGreaterThan(48);expect(linked.headingTop).toBeGreaterThanOrEqual(linked.barBottom);
 await page.goto('about:blank');await page.goto(url);await expect(nav).toBeVisible();
 const before=await landing();expect(before.panelHidden).toBe(true);expect(before.scrollY).toBe(0);
 await chooseNavigation(nav,'Tab','Deployment');await expect(tab).toHaveAttribute('aria-selected','true');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const clicked=await landing();expect(clicked.section).toBe(linked.section);
 expect(Math.abs(clicked.sectionTop-(clicked.barBottom+12))).toBeLessThanOrEqual(1);expect(clicked.headingTop).toBeGreaterThanOrEqual(clicked.barBottom);
 expect(Math.abs(linked.sectionTop-clicked.sectionTop)).toBeLessThanOrEqual(1);
});
