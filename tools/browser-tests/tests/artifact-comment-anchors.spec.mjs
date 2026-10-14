import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,chooseNavigation} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

/* Published claude.ai artifacts declare comments {composer_only, customAnchors}.
   Comment subjects carry data-derived ids, so the shell's own-id anchors
   (`#<id>`) survive View reordering. With customAnchors the page owns pin
   placement: hidden Tab/View/step threads stay unplaced, "Go to" (reveal)
   switches Tab, View and step, and comment-mode clicks compose with a Tab-first
   label. The shell is a recording stub whose domAnchor follows the observed
   claude.ai grammar. */
const diagram=(node,title,steps)=>({view:'step',autoplay:false,nodes:{[node]:{title}},rows:[[node]],steps:steps.map((text,i)=>({id:node+'-'+i,text,nodes:[node]}))});
const raw={page:{title:'Comment anchors',blocks:[{tabs:[
 {label:'Overview',defaultView:'sequence',views:[
   {id:'sequence',name:'Sequence',presentation:'standard',sections:['ring']},
   {id:'answer',name:'Answer',presentation:'standard',sections:['reply']},
   {id:'both',name:'Reply first',presentation:'standard',sections:['reply','ring']}],sections:[
  {id:'ring',heading:'Ring the doorbell',text:['A visitor presses the button.'],diagram:diagram('door','Door',['PIR sensor trips','Chime plays'])},
  {id:'reply',heading:'Answer the door',diagram:diagram('phone','Phone',['Owner answers'])}]},
 {label:'Storage',sections:[{id:'clip',heading:'Store the clip',diagram:diagram('vault','Vault',['Clip saved to storage'])}]}]}]}};

function stubClaude(){
 const log=window.__comments={callbacks:null,placed:[],compose:[]};
 // Observed claude.ai grammar: an element's OWN id, else a positional
 // nth-of-type path rooted at #docview that ignores ancestor ids.
 function cssPath(el){
  if(el.id)return '#'+el.id;
  const parts=[];let n=el;
  for(;n && n.id!=='docview' && n!==document.documentElement;n=n.parentElement){
   const same=Array.prototype.filter.call(n.parentElement.children,c=>c.tagName===n.tagName);
   parts.unshift(n.tagName.toLowerCase()+':nth-of-type('+(same.indexOf(n)+1)+')');
  }
  return (n && n.id==='docview'?'#docview':'html')+' > '+parts.join(' > ');
 }
 window.__cssPath=cssPath;
 const controller={
  placed(map){log.placed.push(JSON.parse(JSON.stringify(map)));},
  compose(anchor,at,opts){log.compose.push({anchor,at,opts});return Promise.resolve({opened:true});},
  domAnchor(el,ev){if(!el.isConnected)throw new TypeError('not in document');const r=el.getBoundingClientRect();return [cssPath(el),{x:(ev?ev.clientX:r.left+r.width/2)+scrollX,y:(ev?ev.clientY:r.top+r.height/2)+scrollY}];},
  open(){return Promise.resolve();},exitMode(){},release(){},areas:false};
 const comments=Object.freeze({customAnchors(callbacks){log.callbacks=callbacks;return Promise.resolve(controller);}});
 window.claude=Object.freeze({use:name=>Promise.resolve(name==='comments'?comments:null)});
}
async function open(page,server){
 const input=path.join(server.root,'artifact-comments.json'),output=path.join(server.root,'artifact-comments.html');
 await writeFile(input,JSON.stringify(raw));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
 await page.goto(server.origin+'/artifact-comments.html');
 return page.locator('#docview');
}
const lastPlaced=page=>page.evaluate(()=>window.__comments.placed.at(-1));
const placedKeys=async page=>Object.keys(await lastPlaced(page)).sort();
const composed=(page,i)=>page.evaluate(i=>window.__comments.compose[i],i);
const composeCount=page=>page.evaluate(()=>window.__comments.compose.length);

test('data-derived comment ids follow Tabs, Views and steps; reveal reaches hidden subjects',async({page,server})=>{
 await page.addInitScript(stubClaude);
 const root=await open(page,server),nav=root.locator('.explore-navigation').first(),viewStrip=nav.locator('.reader-view-strip');
 const ringLine=root.locator('#section-ring .stepline:not(.dv-caption-old)'),door=root.locator('#section-ring .node[data-dv-node=door]'),vault=root.locator('#section-clip .node[data-dv-node=vault]');
 const tab=name=>nav.getByRole('tab',{name,exact:true,includeHidden:true});
 // Registration reports immediately (an empty map tells the shell the page listens).
 await expect.poll(()=>page.evaluate(()=>window.__comments.placed.length)).toBeGreaterThan(0);
 await page.evaluate(()=>window.__comments.callbacks.mode(true));
 // (i) Subject ids come from data and survive a View that reorders sections.
 await expect(door).toHaveAttribute('id','c-ring-node-door');
 await expect(ringLine).toHaveAttribute('id','c-ring-step-door-0');
 await expect(root.locator('#section-ring .sec-heading-row')).toHaveAttribute('id','c-ring-heading');
 await expect(root.locator('#section-ring .sec-text[data-dv-para="0"]')).toHaveAttribute('id','c-ring-para-1');
 await expect(vault).toHaveAttribute('id','c-clip-node-vault');
 const positional=()=>page.evaluate(()=>__cssPath(document.querySelector('#section-ring .sec-h')));
 const before=await positional();
 await door.click();
 await expect.poll(()=>composeCount(page)).toBe(1);
 expect((await composed(page,0)).anchor).toBe('#c-ring-node-door');
 await viewStrip.getByRole('tab',{name:'Reply first',exact:true}).click();
 await expect(root.locator('#section-reply')).toBeVisible();await expect(door).toBeVisible();
 expect(await page.evaluate(()=>document.querySelector('#section-reply').compareDocumentPosition(document.querySelector('#section-ring'))&Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
 expect(await positional()).not.toBe(before);
 await expect(door).toHaveAttribute('id','c-ring-node-door');
 await door.click();
 await expect.poll(()=>composeCount(page)).toBe(2);
 const nodeComment=await composed(page,1);
 expect(nodeComment.anchor).toBe('#c-ring-node-door');
 // (v) The label still starts with the Tab.
 expect(nodeComment.opts.label).toMatch(/^Tab: Overview › View: Reply first › Ring the doorbell › Door/);
 expect(new TextEncoder().encode(nodeComment.opts.label).length).toBeLessThanOrEqual(128);
 await viewStrip.getByRole('tab',{name:'Sequence',exact:true}).click();
 await expect(root.locator('#section-reply')).toBeHidden();
 // (ii)/(iii) Threads: a node on the hidden Tab, step 2's caption, a legacy positional path.
 const legacy=await page.evaluate(()=>__cssPath(document.querySelector('#section-ring .sec-h')));
 expect(legacy).toMatch(/^#docview > /);
 await page.evaluate(([legacy])=>window.__comments.callbacks.threads([
  {id:'h-vault',anchor:'#c-clip-node-vault',resolved:false,active:false},
  {id:'h-step2',anchor:'#c-ring-step-door-1',resolved:false,active:false},
  {id:'h-legacy',anchor:legacy,resolved:false,active:false},
  {id:'h-bad',anchor:'div[[',resolved:false,active:false}]),[legacy]);
 expect(await placedKeys(page)).toEqual(['h-legacy']);
 // (iii) reveal shows the hidden-Tab node and places it.
 await page.evaluate(()=>window.__comments.callbacks.reveal('h-vault'));
 await expect(tab('Storage')).toHaveAttribute('aria-selected','true');
 await expect(vault).toBeVisible();await expect(vault).toBeInViewport();
 await expect.poll(()=>placedKeys(page)).toEqual(['h-vault']);
 expect(page.url()).toContain('t=storage');
 // (ii) From another Tab, reveal moves to the step's Tab AND step; it pins only while shown.
 await page.evaluate(()=>window.__comments.callbacks.reveal('h-step2'));
 await expect(tab('Overview')).toHaveAttribute('aria-selected','true');
 await expect(ringLine).toContainText('Chime plays');
 await expect(ringLine).toHaveAttribute('id','c-ring-step-door-1');
 await expect.poll(()=>placedKeys(page)).toEqual(['h-legacy','h-step2']);
 expect(page.url()).toMatch(/s=door-1/);
 await page.evaluate(()=>window.__comments.callbacks.mode(false));
 await root.locator('#section-ring .schip').first().click();
 await expect(ringLine).toContainText('PIR sensor trips');
 await page.evaluate(()=>window.__comments.callbacks.mode(true));
 await page.evaluate(()=>window.__comments.callbacks.threads([{id:'h-step2',anchor:'#c-ring-step-door-1',resolved:false,active:false}]));
 await expect(ringLine).toHaveAttribute('id','c-ring-step-door-0');
 expect(await placedKeys(page)).toEqual([]);
 // Comment-mode clicks: the caption composes with its step id; navigation passes through.
 await ringLine.click();
 await expect.poll(()=>composeCount(page)).toBe(3);
 const stepComment=await composed(page,2);
 expect(stepComment.anchor).toBe('#c-ring-step-door-0');
 expect(stepComment.opts.label).toMatch(/^Tab: Overview › View: Sequence › Ring the doorbell › STEP 1\/2 PIR sensor trips/);
 await chooseNavigation(nav,'Tab','Storage');
 await expect(tab('Storage')).toHaveAttribute('aria-selected','true');
 await root.locator('#section-clip .stepline:not(.dv-caption-old)').click();
 await expect.poll(()=>composeCount(page)).toBe(4);
 expect((await composed(page,3)).opts.label).toMatch(/^Tab: Storage › Store the clip › STEP 1\/1 Clip saved to storage/);
 await chooseNavigation(nav,'Tab','Overview');
 await expect(ringLine).toBeVisible();
 expect(await composeCount(page)).toBe(4);
 // A step chip click composes instead of stepping while comment mode is on.
 await root.locator('#section-ring .schip').nth(1).click();
 await expect.poll(()=>composeCount(page)).toBe(5);
 await expect(ringLine).toContainText('PIR sensor trips');
 // Leaving comment mode restores ordinary clicks.
 await page.evaluate(()=>window.__comments.callbacks.mode(false));
 await expect(page.locator('html')).not.toHaveClass(/dv-commenting/);
 await root.locator('#section-ring .schip').nth(1).click();
 await expect(ringLine).toContainText('Chime plays');
 expect(await composeCount(page)).toBe(5);
});

// (iv) Without the capability the caption keeps no id (the shell would show a
// missing-id anchor on every step); static subject ids are present regardless.
test('without window.claude the caption has no id and clicks behave as before',async({page,server})=>{
 const root=await open(page,server),line=root.locator('#section-ring .stepline:not(.dv-caption-old)');
 await expect(line).toBeVisible();
 expect(await page.evaluate(()=>typeof window.claude)).toBe('undefined');
 await expect(line).toHaveAttribute('data-comment-target','');
 await expect(line).not.toHaveAttribute('id',/./);
 await expect(root.locator('#section-ring [data-comment-target]')).toHaveCount(1);
 await expect(root.locator('#section-ring .node[data-dv-node=door]')).toHaveAttribute('id','c-ring-node-door');
 await root.locator('#section-ring .schip').nth(1).click();
 await expect(line).toContainText('Chime plays');
 await expect(line).not.toHaveAttribute('id',/./);
 await expect(page.locator('html')).not.toHaveClass(/dv-commenting/);
 await expect(page.locator('.dv-comment-ring')).toHaveCount(0);
});

test('a refused customAnchors registration leaves the page inert',async({page,server})=>{
 await page.addInitScript(()=>{window.__asked=[];window.claude={use:name=>{window.__asked.push(name);return Promise.resolve({customAnchors:()=>Promise.reject({code:'not_granted',message:'not declared'})});}};});
 const root=await open(page,server),line=root.locator('#section-ring .stepline:not(.dv-caption-old)');
 await expect.poll(()=>page.evaluate(()=>window.__asked)).toEqual(['comments']);
 await root.locator('#section-ring .schip').nth(1).click();
 await expect(line).toContainText('Chime plays');
 await expect(line).not.toHaveAttribute('id',/./);
 await expect(page.locator('html')).not.toHaveClass(/dv-commenting/);
});

// The caption transition copy is a clone of the line; it must not duplicate the step id.
test.describe('caption transition',()=>{
 test.use({reducedMotion:'no-preference'});
 test('the caption ghost never carries the step comment id',async({page,server})=>{
  await page.addInitScript(stubClaude);
  const root=await open(page,server),line=root.locator('#section-ring .stepline:not(.dv-caption-old)');
  await expect.poll(()=>page.evaluate(()=>window.__comments.placed.length)).toBeGreaterThan(0);
  await expect(line).toHaveAttribute('id','c-ring-step-door-0');
  await page.evaluate(()=>{window.__ghostIds=[];new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(n=>{if(n.classList && n.classList.contains('dv-caption-old'))window.__ghostIds.push(n.id);}))).observe(document.body,{childList:true,subtree:true});});
  await root.locator('#section-ring .schip').nth(1).click();
  await expect(line).toContainText('Chime plays');
  await page.evaluate(()=>window.__comments.callbacks.threads([{id:'h',anchor:'#c-ring-step-door-1',resolved:false,active:false}]));
  await expect(line).toHaveAttribute('id','c-ring-step-door-1');
  const ghosts=await page.evaluate(()=>window.__ghostIds);
  expect(ghosts.length).toBeGreaterThan(0);
  expect(ghosts.every(id=>id==='')).toBe(true);
 });
});
