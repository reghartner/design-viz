import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect,chooseNavigation} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

/* Published claude.ai artifacts declare comments {composer_only, customAnchors}.
   The page then owns pin placement: threads on a hidden Tab/View stay unplaced,
   "Go to" (reveal) switches to their Tab, and comment-mode clicks compose with
   a label that starts with the Tab. The shell is a recording stub. */
const diagram=(node,title,steps)=>({view:'step',autoplay:false,nodes:{[node]:{title}},rows:[[node]],steps:steps.map((text,i)=>({id:node+'-'+i,text,nodes:[node]}))});
const raw={page:{title:'Comment anchors',blocks:[{tabs:[
 {label:'Overview',defaultView:'sequence',views:[{id:'sequence',name:'Sequence',presentation:'standard',sections:['ring']},{id:'answer',name:'Answer',presentation:'standard',sections:['reply']}],sections:[
  {id:'ring',heading:'Ring the doorbell',text:['A visitor presses the button.'],diagram:diagram('door','Door',['PIR sensor trips','Chime plays'])},
  {id:'reply',heading:'Answer the door',diagram:diagram('phone','Phone',['Owner answers'])}]},
 {label:'Storage',sections:[{id:'clip',heading:'Store the clip',diagram:diagram('vault','Vault',['Clip saved to storage'])}]}]}]}};

function stubClaude(){
 const log=window.__comments={callbacks:null,placed:[],compose:[]};
 // Assumed shell grammar: nth-child steps up to the nearest id. View switches
 // reorder sections, so a purely positional path could not follow them.
 function cssPath(el){const parts=[];for(let n=el;n && n!==document.documentElement;n=n.parentElement){if(n.id){parts.unshift('#'+CSS.escape(n.id));return parts.join(' > ');}parts.unshift(n.tagName.toLowerCase()+':nth-child('+(Array.prototype.indexOf.call(n.parentElement.children,n)+1)+')');}return ['html'].concat(parts).join(' > ');}
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

test('page-owned comment anchors follow Tabs, reveal hidden threads and label new comments',async({page,server})=>{
 await page.addInitScript(stubClaude);
 const root=await open(page,server),nav=root.locator('.explore-navigation').first();
 const ringLine=root.locator('#section-ring .stepline:not(.dv-caption-old)'),clipLine=root.locator('#section-clip .stepline:not(.dv-caption-old)');
 const storageTab=nav.getByRole('tab',{name:'Storage',exact:true,includeHidden:true});
 // Registration reports immediately (an empty map tells the shell the page listens).
 await expect.poll(()=>page.evaluate(()=>window.__comments.placed.length)).toBeGreaterThan(0);
 await expect(ringLine).toBeVisible();await expect(clipLine).toBeHidden();
 const anchors=await page.evaluate(()=>({ring:__cssPath(document.querySelector('#section-ring .stepline')),clip:__cssPath(document.querySelector('#section-clip .stepline'))}));
 await page.evaluate(a=>{const cb=window.__comments.callbacks;cb.mode(true);cb.threads([{id:'h-ring',anchor:a.ring,resolved:false,active:false},{id:'h-clip',anchor:a.clip,resolved:false,active:false},{id:'h-bad',anchor:'div[[',resolved:false,active:false}]);},anchors);
 // 1. A thread on the hidden Tab is left unplaced; the visible one is placed.
 let placed=await lastPlaced(page);
 expect(Object.keys(placed)).toEqual(['h-ring']);
 const ringBox=await ringLine.boundingBox(),scroll=await page.evaluate(()=>({x:scrollX,y:scrollY}));
 expect(Math.abs(placed['h-ring'].x-(ringBox.x+ringBox.width/2+scroll.x))).toBeLessThanOrEqual(1);
 expect(Math.abs(placed['h-ring'].y-(ringBox.y+ringBox.height/2+scroll.y))).toBeLessThanOrEqual(1);
 // 2. Go to: reveal selects the thread's Tab, shows it and re-reports.
 await page.evaluate(()=>window.__comments.callbacks.reveal('h-clip'));
 await expect(storageTab).toHaveAttribute('aria-selected','true');
 await expect(clipLine).toBeVisible();await expect(clipLine).toBeInViewport();
 await expect.poll(async()=>Object.keys(await lastPlaced(page)).sort()).toEqual(['h-clip']);
 expect(page.url()).toContain('t=storage');
 // 3. Comment-mode clicks compose with a Tab-first label; navigation passes through.
 await clipLine.click();
 await expect.poll(()=>page.evaluate(()=>window.__comments.compose.length)).toBe(1);
 let composed=await page.evaluate(()=>window.__comments.compose[0]);
 expect(composed.anchor).toBe(anchors.clip);
 expect(composed.opts.label).toMatch(/^Tab: Storage › Store the clip › STEP 1\/1 Clip saved to storage/);
 expect(new TextEncoder().encode(composed.opts.label).length).toBeLessThanOrEqual(128);
 expect(composed.opts.detail).toContain('Clip saved to storage');
 await chooseNavigation(nav,'Tab','Overview');
 await expect(nav.getByRole('tab',{name:'Overview',exact:true,includeHidden:true})).toHaveAttribute('aria-selected','true');
 await expect(ringLine).toBeVisible();
 // The reader View strip is real navigation too.
 const viewStrip=nav.locator('.reader-view-strip');
 await viewStrip.getByRole('tab',{name:'Answer',exact:true}).click();
 await expect(root.locator('#section-reply')).toBeVisible();await expect(root.locator('#section-ring')).toBeHidden();
 await expect.poll(async()=>Object.keys(await lastPlaced(page))).toEqual([]);
 await viewStrip.getByRole('tab',{name:'Sequence',exact:true}).click();
 await expect(ringLine).toBeVisible();
 await expect.poll(async()=>Object.keys(await lastPlaced(page))).toEqual(['h-ring']);
 expect(await page.evaluate(()=>window.__comments.compose.length)).toBe(1);
 await ringLine.click();
 await expect.poll(()=>page.evaluate(()=>window.__comments.compose.length)).toBe(2);
 composed=await page.evaluate(()=>window.__comments.compose[1]);
 expect(composed.opts.label).toMatch(/^Tab: Overview › View: Sequence › Ring the doorbell › STEP 1\/2 PIR sensor trips/);
 // A step chip click composes instead of stepping while comment mode is on.
 await root.locator('#section-ring .schip').nth(1).click();
 await expect.poll(()=>page.evaluate(()=>window.__comments.compose.length)).toBe(3);
 await expect(ringLine).toContainText('PIR sensor trips');
 // A thread on another View of the same Tab: unplaced until reveal selects that View.
 const replyLine=root.locator('#section-reply .stepline:not(.dv-caption-old)');
 await page.evaluate(()=>window.__comments.callbacks.threads([{id:'h-reply',anchor:__cssPath(document.querySelector('#section-reply .stepline')),resolved:false,active:false}]));
 expect(await lastPlaced(page)).toEqual({});
 await page.evaluate(()=>window.__comments.callbacks.reveal('h-reply'));
 await expect(viewStrip.getByRole('tab',{name:'Answer',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(replyLine).toBeVisible();
 await expect.poll(async()=>Object.keys(await lastPlaced(page))).toEqual(['h-reply']);
 expect(page.url()).toContain('v=answer');
 await viewStrip.getByRole('tab',{name:'Sequence',exact:true}).click();
 // Leaving comment mode restores ordinary clicks and drops the thread list.
 await page.evaluate(()=>window.__comments.callbacks.mode(false));
 await expect(page.locator('html')).not.toHaveClass(/dv-commenting/);
 await root.locator('#section-ring .schip').nth(1).click();
 await expect(ringLine).toContainText('Chime plays');
 expect(await page.evaluate(()=>window.__comments.compose.length)).toBe(3);
});

test('without window.claude the viewer keeps shell anchoring and ordinary clicks',async({page,server})=>{
 const root=await open(page,server);
 await expect(root.locator('#section-ring .stepline:not(.dv-caption-old)')).toBeVisible();
 expect(await page.evaluate(()=>typeof window.claude)).toBe('undefined');
 await root.locator('#section-ring .schip').nth(1).click();
 await expect(root.locator('#section-ring .stepline:not(.dv-caption-old)')).toContainText('Chime plays');
 await expect(page.locator('html')).not.toHaveClass(/dv-commenting/);
 await expect(page.locator('.dv-comment-ring')).toHaveCount(0);
});

test('a refused customAnchors registration leaves the page inert',async({page,server})=>{
 await page.addInitScript(()=>{window.__asked=[];window.claude={use:name=>{window.__asked.push(name);return Promise.resolve({customAnchors:()=>Promise.reject({code:'not_granted',message:'not declared'})});}};});
 const root=await open(page,server);
 await expect.poll(()=>page.evaluate(()=>window.__asked)).toEqual(['comments']);
 await root.locator('#section-ring .schip').nth(1).click();
 await expect(root.locator('#section-ring .stepline:not(.dv-caption-old)')).toContainText('Chime plays');
 await expect(page.locator('html')).not.toHaveClass(/dv-commenting/);
});
