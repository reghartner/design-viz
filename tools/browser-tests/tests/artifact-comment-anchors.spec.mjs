import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,chooseNavigation} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

/* Published claude.ai artifacts declare comments {composer_only, customAnchors}.
   The page then owns pin placement: threads on a hidden Tab/View stay unplaced,
   "Go to" (reveal) switches Tab/View, a step-caption comment is saved against
   the shown step's numbered button and replays that step, and step controls
   keep working in comment mode. The shell is a recording stub whose domAnchor
   matches claude.ai (contract 0.2.78): purely positional, ids ignored. */
const diagram=(node,title,steps)=>({view:'step',autoplay:false,nodes:{[node]:{title}},rows:[[node]],steps:steps.map((text,i)=>({id:node+'-'+i,text,nodes:[node]}))});
const raw={page:{title:'Comment anchors',blocks:[{tabs:[
 {label:'Overview',defaultView:'sequence',views:[{id:'sequence',name:'Sequence',presentation:'standard',sections:['ring']},{id:'answer',name:'Answer',presentation:'standard',sections:['reply']}],sections:[
  {id:'ring',heading:'Ring the doorbell',text:['A visitor presses the button.'],bullets:['Motion first','Then the press','Chime last'],
   diagram:diagram('door','Door',['PIR sensor trips','Chime plays','Camera wakes','Clip records','Owner notified'])},
  {id:'reply',heading:'Answer the door',diagram:diagram('phone','Phone',['Owner answers'])}]},
 {label:'Storage',sections:[{id:'clip',heading:'Store the clip',diagram:diagram('vault','Vault',['Clip saved to storage'])}]}]}]}};

function stubClaude(){
 const log=window.__comments={callbacks:null,placed:[],compose:[]};
 function cssPath(el){
  const parts=[];let n=el;
  for(;n && n.id!=='docview' && n!==document.documentElement;n=n.parentElement){
   const same=Array.prototype.filter.call(n.parentElement.children,c=>c.tagName===n.tagName);
   parts.unshift(n.tagName.toLowerCase()+':nth-of-type('+(same.indexOf(n)+1)+')');
  }
  return (n && n.id==='docview'?'#docview':'html')+' > '+parts.join(' > ');
 }
 window.__cssPath=cssPath;
 window.__center=el=>{const r=el.getBoundingClientRect();return {x:r.left+r.width/2+scrollX,y:r.top+r.height/2+scrollY};};
 const controller={
  placed(map){log.placed.push(JSON.parse(JSON.stringify(map)));},
  compose(anchor,at,opts){log.compose.push({anchor,at:at instanceof Element?'element':at,opts});return Promise.resolve({opened:true});},
  domAnchor(el,ev){if(!el.isConnected)throw new TypeError('not in document');return [cssPath(el),ev?{x:ev.clientX+scrollX,y:ev.clientY+scrollY}:window.__center(el)];},
  open(){return Promise.resolve();},exitMode(){},release(){},areas:false};
 const comments=Object.freeze({customAnchors(callbacks){log.callbacks=callbacks;return Promise.resolve(controller);}});
 window.claude=Object.freeze({use:name=>Promise.resolve(name==='comments'?comments:null)});
}
async function open(page,server,spec=raw){
 const input=path.join(server.root,'artifact-comments.json'),output=path.join(server.root,'artifact-comments.html');
 await writeFile(input,JSON.stringify(spec));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
 await page.goto(server.origin+'/artifact-comments.html');
 return page.locator('#docview');
}
const lastPlaced=page=>page.evaluate(()=>window.__comments.placed.at(-1));
const placedKeys=async page=>Object.keys(await lastPlaced(page)).sort();
const composed=(page,i)=>page.evaluate(i=>window.__comments.compose[i],i);
const composeCount=page=>page.evaluate(()=>window.__comments.compose.length);

test('step captions anchor to the shown step button; Tabs, Views and step controls stay navigable',async({page,server})=>{
 await page.addInitScript(stubClaude);
 const root=await open(page,server),nav=root.locator('.explore-navigation').first(),viewStrip=nav.locator('.reader-view-strip');
 const ring=root.locator('#section-ring'),ringLine=ring.locator('.stepline:not(.dv-caption-old)'),chip=n=>ring.locator('.schip').nth(n-1);
 const tab=name=>nav.getByRole('tab',{name,exact:true,includeHidden:true});
 await expect.poll(()=>page.evaluate(()=>window.__comments.placed.length)).toBeGreaterThan(0);
 await page.evaluate(()=>window.__comments.callbacks.mode(true));
 // (d) Step buttons, next and the mode toggle act normally in comment mode.
 await chip(2).click();
 await expect(ringLine).toContainText(/STEP 2\/5\s*Chime plays/);
 await ring.getByRole('button',{name:'Next step'}).click();
 await expect(ringLine).toContainText(/STEP 3\/5\s*Camera wakes/);
 await ring.locator('.mtoggle .mbtn',{hasText:'AMBIENT'}).click();
 await expect(ring.locator('.termbar')).toBeHidden();
 await ring.locator('.mtoggle .mbtn',{hasText:'STEP'}).click();
 await expect(ringLine).toBeVisible();
 await chip(2).click();
 await expect(ringLine).toContainText('Chime plays');
 expect(await composeCount(page)).toBe(0);
 // (a) A caption click composes against the active step button, at the click point.
 const box=await ringLine.boundingBox();
 await page.mouse.click(box.x+10,box.y+box.height/2);
 await expect.poll(()=>composeCount(page)).toBe(1);
 const stepComment=await composed(page,0);
 const chip2=await page.evaluate(()=>__cssPath(document.querySelector('#section-ring .schip[aria-current="true"]')));
 expect(chip2).toMatch(/button:nth-of-type\(2\)$/);
 expect(stepComment.anchor).toBe(chip2);
 const scroll=await page.evaluate(()=>({x:scrollX,y:scrollY}));
 expect(Math.abs(stepComment.at.x-(box.x+10+scroll.x))).toBeLessThanOrEqual(1);
 expect(Math.abs(stepComment.at.y-(box.y+box.height/2+scroll.y))).toBeLessThanOrEqual(1);
 expect(stepComment.opts.label).toMatch(/^Tab: Overview › View: Sequence › Ring the doorbell › STEP 2\/5 Chime plays/);
 // An ordinary subject composes at its own positional path; the label keeps its text.
 await ring.locator('li[data-dv-bullet="2"]').click();
 await expect.poll(()=>composeCount(page)).toBe(2);
 const bullet=await composed(page,1);
 expect(bullet.anchor).toMatch(/ul:nth-of-type\(1\) > li:nth-of-type\(3\)$/);
 expect(bullet.opts.label).toMatch(/^Tab: Overview › View: Sequence › Ring the doorbell › Chime last/);
 // (b)/(e) Threads: the step button, the bullet, a node on the hidden Tab.
 const vaultPath=await page.evaluate(()=>__cssPath(document.querySelector('#section-clip .node[data-dv-node=vault]')));
 await page.evaluate(([a,b,c])=>window.__comments.callbacks.threads([
  {id:'h-step',anchor:a,resolved:false,active:false},{id:'h-bullet',anchor:b,resolved:false,active:false},
  {id:'h-vault',anchor:c,resolved:false,active:false},{id:'h-bad',anchor:'div[[',resolved:false,active:false}]),[chip2,bullet.anchor,vaultPath]);
 let placed=await lastPlaced(page);
 expect(Object.keys(placed).sort()).toEqual(['h-bullet','h-step']);
 // Pins sit at the shell's own anchor point for the subject (its center here).
 const centers=await page.evaluate(()=>({chip:__center(document.querySelector('#section-ring .schip[aria-current="true"]')),bullet:__center(document.querySelector('#section-ring li[data-dv-bullet="2"]'))}));
 for(const [key,c] of [['h-step',centers.chip],['h-bullet',centers.bullet]]){
  expect(Math.abs(placed[key].x-c.x)).toBeLessThanOrEqual(1);expect(Math.abs(placed[key].y-c.y)).toBeLessThanOrEqual(1);
 }
 // AMBIENT hides the step buttons, so the step thread is unplaced.
 await ring.locator('.mtoggle .mbtn',{hasText:'AMBIENT'}).click();
 await expect.poll(()=>placedKeys(page)).toEqual(['h-bullet']);
 // Hidden-Tab thread: reveal switches Tab and places it.
 await page.evaluate(()=>window.__comments.callbacks.reveal('h-vault'));
 await expect(tab('Storage')).toHaveAttribute('aria-selected','true');
 await expect(root.locator('#section-clip .node[data-dv-node=vault]')).toBeInViewport();
 await expect.poll(()=>placedKeys(page)).toEqual(['h-vault']);
 // (c) From another Tab, reveal returns to the step button's Tab and replays its step.
 await page.evaluate(()=>window.__comments.callbacks.reveal('h-step'));
 await expect(tab('Overview')).toHaveAttribute('aria-selected','true');
 await expect(ringLine).toContainText(/STEP 2\/5\s*Chime plays/);
 await expect(ringLine).toBeInViewport();
 await expect.poll(()=>placedKeys(page)).toEqual(['h-bullet','h-step']);
 expect(page.url()).toMatch(/s=door-1/);
 // (c) From step 4 on the same Tab.
 await chip(4).click();
 await expect(ringLine).toContainText(/STEP 4\/5\s*Clip records/);
 await page.evaluate(()=>window.__comments.callbacks.reveal('h-step'));
 await expect(ringLine).toContainText(/STEP 2\/5\s*Chime plays/);
 await expect(chip(2)).toHaveAttribute('aria-current','true');
 // Navigation controls pass through; other clicks still compose.
 await chooseNavigation(nav,'Tab','Storage');
 await expect(tab('Storage')).toHaveAttribute('aria-selected','true');
 await chooseNavigation(nav,'Tab','Overview');
 await viewStrip.getByRole('tab',{name:'Answer',exact:true}).click();
 await expect(root.locator('#section-reply')).toBeVisible();await expect(ring).toBeHidden();
 await expect.poll(()=>placedKeys(page)).toEqual([]);
 await viewStrip.getByRole('tab',{name:'Sequence',exact:true}).click();
 await expect(ringLine).toBeVisible();
 expect(await composeCount(page)).toBe(2);
 await page.evaluate(()=>window.__comments.callbacks.mode(false));
 await expect(page.locator('html')).not.toHaveClass(/dv-commenting/);
 await ringLine.click();
 expect(await composeCount(page)).toBe(2);
});

// (g) One section shown by two Views, in a different position in each: a
// comment made in one View is saved with a path naming that View, so it pins
// only there and "Go to" switches back to it.
test('a section shared by two Views keeps separate comments per View',async({page,server})=>{
 await page.addInitScript(stubClaude);
 const shared=JSON.parse(JSON.stringify(raw)),overview=shared.page.blocks[0].tabs[0];
 overview.views=[{id:'sequence',name:'Sequence',presentation:'standard',sections:['ring']},{id:'both',name:'Both',presentation:'standard',sections:['reply','ring']}];
 const root=await open(page,server,shared),viewStrip=root.locator('.explore-navigation').first().locator('.reader-view-strip');
 const bullet=root.locator('#section-ring li[data-dv-bullet="2"]'),viewTab=name=>viewStrip.getByRole('tab',{name,exact:true});
 await expect.poll(()=>page.evaluate(()=>window.__comments.placed.length)).toBeGreaterThan(0);
 // No section stays at its old position, so a path saved before wrappers existed resolves to nothing.
 await expect(root.locator('.tabpanel').first().locator(':scope > section')).toHaveCount(0);
 await page.evaluate(()=>window.__comments.callbacks.mode(true));
 await bullet.click();
 await expect.poll(()=>composeCount(page)).toBe(1);
 await viewTab('Both').click();
 await expect(root.locator('#section-reply')).toBeVisible();
 await bullet.click();
 await expect.poll(()=>composeCount(page)).toBe(2);
 const [inSequence,inBoth]=[(await composed(page,0)).anchor,(await composed(page,1)).anchor];
 expect(inSequence).not.toBe(inBoth);
 expect((await composed(page,0)).opts.label).toMatch(/^Tab: Overview › View: Sequence › /);
 expect((await composed(page,1)).opts.label).toMatch(/^Tab: Overview › View: Both › /);
 await page.evaluate(([a,b])=>window.__comments.callbacks.threads([{id:'v-sequence',anchor:a,resolved:false,active:false},{id:'v-both',anchor:b,resolved:false,active:false}]),[inSequence,inBoth]);
 await expect.poll(()=>placedKeys(page)).toEqual(['v-both']);
 // From another Tab, "Go to" selects the Tab and then the comment's View.
 await chooseNavigation(root.locator('.explore-navigation').first(),'Tab','Storage');
 await expect(root.locator('#section-clip')).toBeVisible();
 await page.evaluate(()=>window.__comments.callbacks.reveal('v-sequence'));
 await expect(root.locator('.explore-navigation').first().getByRole('tab',{name:'Overview',exact:true,includeHidden:true})).toHaveAttribute('aria-selected','true');
 await expect(viewTab('Sequence')).toHaveAttribute('aria-selected','true');
 await expect(root.locator('#section-reply')).toBeHidden();
 await expect(bullet).toBeInViewport();
 await expect.poll(()=>placedKeys(page)).toEqual(['v-sequence']);
 // "Go to" on the other comment switches back to its View.
 await page.evaluate(()=>window.__comments.callbacks.reveal('v-both'));
 await expect(viewTab('Both')).toHaveAttribute('aria-selected','true');
 await expect(root.locator('#section-reply')).toBeVisible();
 await expect.poll(()=>placedKeys(page)).toEqual(['v-both']);
});

// (f) Without the capability the page is unchanged (step-comment-anchor.spec.mjs covers the caption).
test('without window.claude the viewer keeps shell anchoring and ordinary clicks',async({page,server})=>{
 const root=await open(page,server),line=root.locator('#section-ring .stepline:not(.dv-caption-old)');
 await expect(line).toBeVisible();
 expect(await page.evaluate(()=>typeof window.claude)).toBe('undefined');
 await expect(root.locator('#section-ring [data-comment-target]')).toHaveCount(1);
 await expect(line).not.toHaveAttribute('id',/./);
 await expect(root.locator('#section-ring .node[data-dv-node=door]')).toHaveAttribute('id',/^fs\d+-n-door$/);
 await root.locator('#section-ring .schip').nth(1).click();
 await expect(line).toContainText('Chime plays');
 await expect(page.locator('html')).not.toHaveClass(/dv-commenting/);
 await expect(page.locator('.dv-comment-ring')).toHaveCount(0);
});

test('a refused customAnchors registration leaves the page inert',async({page,server})=>{
 await page.addInitScript(()=>{window.__asked=[];window.claude={use:name=>{window.__asked.push(name);return Promise.resolve({customAnchors:()=>Promise.reject({code:'not_granted',message:'not declared'})});}};});
 const root=await open(page,server),line=root.locator('#section-ring .stepline:not(.dv-caption-old)');
 await expect.poll(()=>page.evaluate(()=>window.__asked)).toEqual(['comments']);
 await root.locator('#section-ring .schip').nth(1).click();
 await expect(line).toContainText('Chime plays');
 await expect(page.locator('html')).not.toHaveClass(/dv-commenting/);
});
