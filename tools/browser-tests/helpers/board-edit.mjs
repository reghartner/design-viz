/* #828 shared fixtures for the shared-board Edit mode contracts
   (tests/board-edit.spec.mjs, tests/topology-tracking.spec.mjs).
   A board is built the way it is published: tools/inject.py --two-file writes
   index.html + flowspec.json; the spec text is pretty-printed so a surgical
   splice changes only the lines it must. window.claude is a mock that records
   every files publish; window.flowviewLiveStatus supplies a fixed Jira map. */
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {expect} from './test.mjs';
import {repo} from './prepare.mjs';

export const EDITOR={id:'u_editor',name:'Edit Or'};
export const MAP={
 'EX-100':{state:'active',kind:'epic',title:'Board epic'},
 'EX-1':{state:'todo',title:'New story',epic:'EX-100'},
 'AA-1':{state:'active',title:'Alpha story',epic:'EX-100'},
 'CC-1':{state:'active',title:'Gamma story',epic:'EX-100'},
 'LOC-1':{state:'active',title:'Overlay story',epic:'EX-100'},
 'LOC-2':{state:'active',title:'Overlay edge story',epic:'EX-100'},
 'CAN-1':{state:'done',title:'Provider story',epic:'EX-100'},
 'CAN-2':{state:'done',title:'Provider edge story',epic:'EX-100'}
};
export const TRACKING={jira:{site:'https://acme.atlassian.net',epic:'EX-100'}};
export const PANELS=[{id:'status',type:'live-status',title:'Epic status'},{id:'history',type:'edit-history',title:'Edit history'}];

// A, B, C on one row; A holds AA-1; C is available only when CC-1 is done, so
// the edge B → C lists CC-1 as an availability cause, never as its own ticket.
export function boardSpec(){
 return {page:{title:'Board edit',tracking:structuredClone(TRACKING),sections:[{id:'main',heading:'Main board',diagram:{
  nodes:{a:{title:'Alpha service',tickets:['AA-1']},b:{title:'Beta service'},c:{title:'Gamma store',existsWhen:'tickets-done',tickets:['CC-1']}},
  rows:[['a','b','c']],
  edges:[{from:'a',to:'b',label:'calls'},{from:'b',to:'c',label:'writes'}],
  panels:structuredClone(PANELS)}}]}};
}
export const authored=spec=>JSON.stringify(spec,null,2);

/* Built exactly as published (#826). `topology` embeds the frozen provider
   context the page resolves imported carriers from (the block boot reads). */
export async function buildBoard(server,name,spec,{topology}={}){
 const dir=path.join(server.root,'board-edit-'+name);await rm(dir,{recursive:true,force:true});await mkdir(dir,{recursive:true});
 const file=path.join(dir,'board.spec.json'),out=path.join(dir,'index.html'),text=authored(spec);
 await writeFile(file,text);
 execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),out,'--two-file','--timeline','none']);
 await rm(file);
 if(topology){
  const html=await readFile(out,'utf8'),block='<script type="application/json" id="flowview-topology">'+JSON.stringify(topology).replace(/</g,'\\u003c')+'</script>\n';
  const at=html.search(/^<script type="application\/json" id="flowspec">/m);expect(at,'inline flowspec block present').toBeGreaterThan(0);
  await writeFile(out,html.slice(0,at)+block+html.slice(at));
 }
 const specFile=path.join(dir,'flowspec.json');
 expect(await readFile(specFile,'utf8')).toBe(text+'\n');
 return {dir,specFile,url:server.origin+'/board-edit-'+name+'/index.html',text:text+'\n'};
}
// Another editor's save: the artifact now serves this text as flowspec.json.
export async function serveWinner(board,spec){const text=authored(spec)+'\n';await writeFile(board.specFile,text);return text;}

/* Mock claude.ai runtime. `reject` names a publish rejection code; with
   `rejectOnce` it applies only to the first publish of this tab session (the
   view the runtime reloads publishes normally). Every call is recorded. */
export async function mockRuntime(page,{canEdit=true,artifact=true,reject=null,rejectOnce=false,map=MAP}={}){
 await page.addInitScript(({canEdit,artifact,reject,rejectOnce,editor,map})=>{
  window.__publishes=[];
  window.flowviewLiveStatus={provider:async()=>JSON.parse(JSON.stringify(map))};
  const user=Object.freeze({
   canEdit:async()=>canEdit,isOwner:async()=>false,id:async()=>editor.id,name:async()=>editor.name,
   me:async()=>({id:editor.id,name:editor.name,email:null,isMe:true}),
   profiles:async ids=>Object.fromEntries((ids || []).map(id=>[id,{id,name:id===editor.id?editor.name:'',isMe:id===editor.id}]))
  });
  const namespace=Object.freeze({publish:async files=>{
   const entry={paths:Object.keys(files || {})};const file=files && files['flowspec.json'];
   if(file){entry.content=file.content;entry.contentType=file.contentType;}
   window.__publishes.push(entry);
   let rejecting=reject;
   if(rejecting && rejectOnce){try{if(sessionStorage.getItem('__boardEditRejected'))rejecting=null;else sessionStorage.setItem('__boardEditRejected','1');}catch(ex){}}
   if(rejecting)throw {code:rejecting,message:'mock '+rejecting};
   return {version:'v-next'};
  }});
  window.claude=Object.freeze({use:async name=>name==='artifact'?(artifact?namespace:null):name==='user'?user:null});
 },{canEdit,artifact,reject,rejectOnce,editor:EDITOR,map});
}
export const publishes=page=>page.evaluate(()=>window.__publishes);

export async function openBoard(page,board){
 await page.setViewportSize({width:1440,height:1600});
 await page.goto(board.url);
 const root=page.locator('#docview'),panel=root.locator('.pwidget.pt-live-status');
 await expect(panel.locator('table.dv-live-tickets')).toBeVisible();
 return {root,panel};
}
export const ticketRow=(panel,key)=>panel.locator('tr[data-live-ticket="'+key+'"]');
export const coverageTag=(panel,key)=>panel.locator('tr[data-live-coverage-for="'+key+'"] .dv-live-coverage-tag');
export const editButton=panel=>panel.getByRole('button',{name:'Edit',exact:true});
export const saveButton=panel=>panel.getByRole('button',{name:/^Save \d+ changes?$/});
export const discardButton=panel=>panel.getByRole('button',{name:'Discard',exact:true});
export const nodeCard=(scope,id)=>scope.locator('g.node[data-dv-node="'+id+'"] .card').first();
export const edgeLabel=(scope,index)=>scope.locator('text.lbl[data-dv-edge="'+index+'"]').first();

async function centre(locator){
 await expect(locator).toBeVisible();const box=await locator.boundingBox();
 return {x:box.x+box.width/2,y:box.y+box.height/2};
}
// A node card's empty right margin: the centre holds the title text.
export async function cardPoint(card){
 await expect(card).toBeVisible();const box=await card.boundingBox();return {x:box.x+box.width-8,y:box.y+box.height/2};
}
// A visible point on an edge stroke (path or its halo), away from labels and cards.
export async function strokePoint(page,scope,index){
 const path=scope.locator('path.edge[data-dv-edge="'+index+'"]').first();
 const point=await path.evaluate(el=>{
  const svg=el.ownerSVGElement,halo=svg.querySelector('path.halo[data-dv-edge="'+el.getAttribute('data-dv-edge')+'"]');
  const matrix=el.getScreenCTM(),length=el.getTotalLength();
  for(const fraction of [.3,.7,.2,.8,.4,.6,.5]){
   const p=el.getPointAtLength(length*fraction),screen=new DOMPoint(p.x,p.y).matrixTransform(matrix),hit=document.elementFromPoint(screen.x,screen.y);
   if(hit===el || (halo && hit===halo))return {x:screen.x,y:screen.y};
  }
  return null;
 });
 expect(point,'edge '+index+' stroke has a visible pointer target').not.toBeNull();
 return point;
}
/* Real pointer drag of a Tickets row onto a point (native drag and drop). Both
   ends must be on screen at once: the gesture never relies on autoscroll. */
export async function dragTicket(page,panel,key,to){
 const row=ticketRow(panel,key);await expect(row).toBeVisible();
 const from=await centre(row.locator('.dv-live-ticket-title'));
 const viewport=page.viewportSize();
 for(const p of [from,to])expect(p.y>0 && p.y<viewport.height && p.x>0 && p.x<viewport.width,'drag point on screen '+JSON.stringify(p)).toBe(true);
 await page.mouse.move(from.x,from.y);await page.mouse.down();
 await page.mouse.move(from.x+12,from.y+6,{steps:3});
 await page.mouse.move(to.x,to.y,{steps:12});
 await page.mouse.up();
}
/* The press-and-move half of dragTicket: the row is held over `to` until the
   returned release() drops it there. */
export async function holdTicketOver(page,panel,key,to){
 const row=ticketRow(panel,key);await expect(row).toBeVisible();
 const from=await centre(row.locator('.dv-live-ticket-title'));
 await page.mouse.move(from.x,from.y);await page.mouse.down();
 await page.mouse.move(from.x+12,from.y+6,{steps:3});
 await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.move(to.x+1,to.y,{steps:2});
 return ()=>page.mouse.up();
}
/* Reload as the runtime does after a conflict, recording any leave-page dialog. */
export async function reloadRecordingDialogs(page){
 const seen=[];const handler=dialog=>{seen.push(dialog.type());dialog.accept().catch(()=>{});};
 page.on('dialog',handler);
 await page.reload();
 page.off('dialog',handler);return seen;
}
export async function startEditing(panel){
 const edit=editButton(panel);await expect(edit).toBeVisible();await expect(edit).toBeEnabled();await edit.click();
}
export async function save(page,panel,count){
 const button=saveButton(panel);await expect(button).toHaveText('Save '+count+' change'+(count===1?'':'s'));await button.click();
 await expect.poll(()=>publishes(page).then(list=>list.length)).toBeGreaterThan(0);
 const list=await publishes(page);expect(list).toHaveLength(1);
 expect(list[0].paths).toEqual(['flowspec.json']);expect(list[0].contentType).toBe('application/json');
 return list[0].content;
}
export const diagramAt=(spec,section=0)=>spec.page.sections[section].diagram;
/* Every authored line survives except where a value was spliced: a line may
   only change by gaining a trailing comma (a member inserted after it). */
export function expectSurgical(before,after){
 const remaining=after.split('\n');
 const lost=[];
 before.split('\n').forEach(line=>{const at=remaining.indexOf(line);if(at>=0)remaining.splice(at,1);else lost.push(line);});
 lost.forEach(line=>expect(remaining.includes(line+','),'only gained a comma: '+line).toBe(true));
 // every added line belongs to a spliced member
 const added=remaining.filter(line=>!lost.some(old=>line===old+','));
 expect(added.length,'some lines were added').toBeGreaterThan(0);
 return added;
}
/* Parse both, drop the members this save may change, and compare the rest. */
export function withoutEdits(spec,strip){const copy=structuredClone(spec);strip(copy);return copy;}
