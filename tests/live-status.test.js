/* Contract matrix (browser and VM coverage together):
| row | rule |
|---|---|
| V1 | New file src/viewer/live-status.js, added to the `engine.js` list in src/source-bundles.json (so standalone, workbench, native/Backstage and forge entrypoints all get it; check tests/source-loader.test.js). ES5 browser code like its neighbours. |
| V2 | `renderPage` attaches `ctl.liveStatus` with: `refs()` → `{tickets:[distinct keys], prs:[distinct urls]}` over every diagram of the page (all sections, all paths, detail flows) using `trackingRefs`; `apply(map)`; `clear()`; `enabled()`; `setEnabled(bool)`; `onChange(fn)` (fires after apply/clear/setEnabled with `{states, counts, updatedAt}`); `state(ref)`. `map` is `{ "<ticket key>": {state, title?, url?, assignee?, assigneeId?, prs?: {count, state}, detail?, updatedAt?} }`, `state` ∈ `todo|active|done|blocked|missing`. Unknown state strings are ignored (treated as absent). |
| V3 | Rollup for one carrier with several tickets (docs/live-status.md): any blocked → blocked; else any missing → missing; else any active → active; else all done → done; else all todo → todo; else (mix of done and todo) → active. A carrier whose tickets are all absent from the map gets NO class. Implement as a pure function `liveStatusRollup(states[])` (exported as a global like other engine helpers) so it is unit-testable. |
| V4 | `apply(map)` sets exactly one `dv-live-<state>` class (removing the others) on: every node `g.node[data-dv-node]` with tickets; every edge `path.edge[data-dv-edge]` with tickets, plus its halo path and its `text.lbl` label (same `data-dv-edge` index); every step coin `g.coin[data-dv-step]` and step chip `button.schip[data-step-source]` whose step involves (via `edges`/keys, `nodes`, failures) at least one carrier that has a state — rollup of those carriers' states; in path-timeline chips too. Text boxes (`g.node.node-text`) never get a class. |
| V5 | CSS in src/style.core.css, for EVERY skin selector family that paints `.card`/edges today (aurora, daylight, editorial, terminal, pastel, blueprint, rose, lavender, lilac — check the skin list in the file): `.dv-live-todo` grey, `.dv-live-active` azure, `.dv-live-done` green, `.dv-live-blocked` and `.dv-live-missing` red. Node: card stroke + a soft halo (drop-shadow) in the state color and the status badge; edge: stroke color (main + halo) with the state color; coin: circle fill + ink via the same `--step-color`/`--step-ink` custom properties the `.step-colored` rules use (so precedence and `!important` match); chip: background via the same variables. Define the five colors once as CSS custom properties on `:root` (`--dv-live-todo`, …) and reuse. active/blocked/missing pulse: reuse the existing `runtime-pulse` keyframes (stroke-width) on the badge circle and a slow (≈2.4 s) opacity pulse on the card halo; `@media (prefers-reduced-motion: reduce)` disables both (follow the existing reduced-motion blocks). Live classes win over `tone-*` card fill/stroke while present. Step-mode dimming (`.stepmode .node:not(.lit)` etc.) still applies but with an opacity floor of .55 for live-classed elements, like `.stepmode .coin.step-colored:not(.lit)`. Print: no pulse, keep colors. |
| V6 | No canvas badge (#762, Chuck 2026-10-27): state is carried by card stroke and halo, edge stroke, dashed todo/waiting strokes, step coins and the break glyph. The ticket popover (manual popover in the `.nbackpop` style: one row per ticket with key link to `tracking.jira.site + '/browse/' + key` when site exists, else `url`, else plain text; state pill, title, assignee, "PRs: n open/merged"; then authored `prs` URLs) opens from the carrier itself: a click on a ticketed node card (not its links/detail/handoff controls) or on an edge line, label or live break glyph (one keyboard trigger: the label, or path/visible live break when unlabelled). In the reader the card/label is a named `role="button"` with `tabindex="0"`, opened by Enter/Space; Escape/outside click closes and returns focus to it. Under `authoring` (Workbench) carriers stay inert so selection keeps its clicks. |
| V7 | Node "⋯" menu: `nodeReferenceLinks` (`src/engine.js:257`) gains a "Tickets" group listing ticket keys (browse links when site is set) and authored PR links for that node, so the menu shows them even without a provider. |
| V8 | Live control: in the reader controls (where the theme menu / Contents controls live, `src/viewer/contents.js`), a `button.dv-live-toggle` with text "Live" + counts chip per state (hidden when zero), `aria-pressed` reflecting `enabled()`, a `time.dv-live-updated` ("updated <relative>" from the newest `updatedAt`; omitted when none), and a `span.dv-live-note` text slot set by `ctl.liveStatus.note(text, kind)` (`kind` ∈ `info|warn|error`) plus `ctl.liveStatus.action(label, fn)` to show one button (used by #738 for "Allow"). The control is hidden until the page has at least one ticket ref (`refs().tickets.length > 0`). |
| V9 | Re-apply after every rebuild: listen on the section element for `dv:pathrender` and `dv:pathchange`, on the view for `diagram-tab-change`, `tab-view-change`, `diagram-view-change`, `navigation-mounted`, `detail-navigation`, and use one MutationObserver (childList, subtree) scoped to step-control containers for chip rebuilds; coalesce with requestAnimationFrame. The classes survive a path switch (new SVG) and a detail flow open. `ctl.destroy()` disconnects everything. |
| V10 | Host hook: `renderPage(..., {liveStatus: {provider: function(refs, signal) → Promise<map>, refreshMs}})`. When present: call the provider after first paint, then every `max(refreshMs, 30000)` ms while `document.visibilityState === 'visible'` (pause when hidden, one catch-up call on return); an AbortController signal is passed and aborted on destroy; rejections set `note(message,'error')` and keep the last map. `mountNativeSpec` (src/native/mount.js) forwards `liveStatus` and src/native/mount.d.ts declares `liveStatus?: {provider: (refs: {tickets: string[]; prs: string[]}, signal: AbortSignal) => Promise<Record<string, LiveStatusEntry>>; refreshMs?: number}` with a `LiveStatusEntry` type. src/boot.flowview.js passes `window.flowviewLiveStatus` (if set before boot) as that option. |
| V11 | Without live evidence, tracked Step captions still show authored ticket references; no carrier paint is applied. Pages without ticket refs keep no Live control markup or derived ticket row. |
*/
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {entrypoint}=require('../tools/source-loader.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));
class Element {
 constructor(tag='div',attrs={}){this.tagName=tag;this.attrs={...attrs};this.children=[];this.events={};this.props={};this.hidden=false;this.isConnected=true;
  this.style={setProperty:(k,v)=>this.props[k]=v,removeProperty:k=>delete this.props[k],getPropertyValue:k=>this.props[k]||''};
  this.classList={contains:x=>(this.attrs.class||'').split(' ').includes(x),add:(...xs)=>this.attrs.class=[...new Set((this.attrs.class||'').split(' ').filter(Boolean).concat(xs))].join(' '),remove:(...xs)=>this.attrs.class=(this.attrs.class||'').split(' ').filter(x=>!xs.includes(x)).join(' '),toggle:(x,on)=>{on??=!this.classList.contains(x);this.classList[on?'add':'remove'](x);return on;}};
 }
 get className(){return this.attrs.class||'';}set className(v){this.attrs.class=v;}
 setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
 appendChild(el){if(el.parentNode)el.parentNode.children=el.parentNode.children.filter(c=>c!==el);el.parentNode=el.parentElement=this;el.ownerDocument=this.ownerDocument;this.children.push(el);return el;}
 insertBefore(el,before){if(el===before)return el;if(el.parentNode)el.parentNode.children=el.parentNode.children.filter(c=>c!==el);el.parentNode=el.parentElement=this;const i=this.children.indexOf(before);this.children.splice(i<0?this.children.length:i,0,el);return el;}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.isConnected=false;}
 replaceChildren(...els){this.children=[];els.forEach(el=>this.appendChild(el));}
 cloneNode(){return new Element(this.tagName,this.attrs);}
 matches(selector){return selector.split(',').some(s=>{s=s.trim();if(s.includes(' '))s=s.split(' ').pop();let excluded=false;s=s.replace(/:not\(([^)]+)\)/g,(_,q)=>{excluded=this.matches(q);return '';});if(excluded)return false;
  const tag=s.match(/^[a-z][a-z0-9]*/);if(tag&&tag[0]!==this.tagName)return false;
  for(const [,c] of s.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(c))return false;
  for(const [,k,v] of s.matchAll(/\[([\w-]+)(?:="([^"\]]*)")?\]/g))if(this.getAttribute(k)===null || v!==undefined&&this.getAttribute(k)!==v)return false;return true;});}
 querySelectorAll(s){return this.children.flatMap(c=>[...(c.matches(s)?[c]:[]),...c.querySelectorAll(s)]);}querySelector(s){return this.querySelectorAll(s)[0]||null;}
 closest(s){return this.matches(s)?this:this.parentElement?.closest(s)||null;}contains(el){return this===el||this.children.some(c=>c.contains(el));}
 addEventListener(t,f){(this.events[t]??=new Set()).add(f);}removeEventListener(t,f){this.events[t]?.delete(f);}dispatchEvent(ev){ev.target??=this;for(const f of this.events[ev.type]||[])f(ev);}
 getBoundingClientRect(){return {left:0,top:0,right:100,bottom:50,width:100,height:50};}getBBox(){return {x:50,y:30,width:60,height:12};}
 getTotalLength(){return 100;}getPointAtLength(){return {x:50,y:30};}focus(){}get firstChild(){return this.children[0]||null;}
 /* A failing assert.equal/deepEqual on two elements must print one line, not inspect two circular trees:
    on 2026-10-27 that diff grew several node processes past 100 GB each and took the machine down. */
 [Symbol.for('nodejs.util.inspect.custom')](){const a=this.attrs;return '<'+this.tagName+(a.class?' class="'+a.class+'"':'')+(a['data-live-ticket']?' data-live-ticket="'+a['data-live-ticket']+'"':'')+(a['data-live-coverage-for']?' data-live-coverage-for="'+a['data-live-coverage-for']+'"':'')+(a['data-dv-node']?' data-dv-node="'+a['data-dv-node']+'"':'')+' children='+this.children.length+'>';}
 toJSON(){return this[Symbol.for('nodejs.util.inspect.custom')]();}
}
function harness(raw,options={},renderOptions={}){
 const frames=new Map(),timers=new Map(),observers=[];let serial=0;
 const doc=new Element('document');doc.hidden=false;doc.visibilityState='visible';doc.createElement=tag=>new Element(tag);doc.createElementNS=(_,tag)=>new Element(tag);doc.body=new Element('body');doc.getElementById=id=>doc.querySelector('[id="'+id+'"]');doc.documentElement=new Element('html');
 const schedule=(collection,fn,ms)=>{const id=++serial;collection.set(id,{fn,ms});return id;};
 const win=new Element('window');Object.assign(win,{document:doc,innerWidth:1440,innerHeight:900,setTimeout:(f,ms)=>schedule(timers,f,ms),clearTimeout:id=>timers.delete(id),setInterval:(f,ms)=>schedule(timers,f,ms),clearInterval:id=>timers.delete(id)});
 const C={URL,console,AbortController,TextEncoder,document:doc,window:win,requestAnimationFrame:f=>schedule(frames,f),cancelAnimationFrame:id=>frames.delete(id),setTimeout:win.setTimeout,clearTimeout:win.clearTimeout,setInterval:win.setInterval,clearInterval:win.clearInterval,
  MutationObserver:class{constructor(f){this.callback=f;this.targets=[];observers.push(this);}observe(t,opts){this.targets.push({t,opts});}disconnect(){this.targets=[];}}};
 vm.runInNewContext(entrypoint('native').source,C);
 const page=C.normalize(raw||{nodes:{a:{}},rows:[['a']]}),view=new Element();view.ownerDocument=doc;
 const records=C.sectionRecords(page),sections=records.map(r=>{const sectionEl=view.appendChild(new Element('section',{'class':'doc-sec'})),d=r.section.diagram||{},svg=sectionEl.appendChild(new Element('svg'));
  for(const [id,n] of Object.entries(d.nodes||{})){const node=svg.appendChild(new Element('g',{'class':'node'+(n.type==='text'?' node-text':''),'data-dv-node':id}));if(n.type!=='text')node.appendChild(new Element('rect',{'class':'card',width:'120',height:'55'}));}
  (d.edges||[]).forEach((e,i)=>{for(const [tag,cls] of [['path','edge'],['path','halo'],['text','lbl']])svg.appendChild(new Element(tag,{'class':cls,'data-dv-edge':String(i),x:'50',y:'30'}));});
  const chips=sectionEl.appendChild(new Element('div',{'class':'schips'}));(d.steps||[]).forEach((st,i)=>{svg.appendChild(new Element('g',{'class':'coin','data-dv-step':String(i)}));chips.appendChild(new Element('button',{'class':'schip','data-step-source':String(i)}));});
  return {sectionEl,reference:r.reference,number:r.number};});
 const ctl={view,page,sections};assert.equal(typeof C.createLiveStatus,'function','V2: live status controller is available');
 ctl.liveStatus=C.createLiveStatus(ctl,page,options,renderOptions);return {C,ctl,view,doc,win,frames,timers,observers,flush(){const work=[...frames.values()];frames.clear();work.forEach(x=>x.fn());}};
}
const fixture=()=>({page:{tracking:{jira:{site:'https://jira.test'}},sections:[{id:'main',diagram:{nodes:{a:{tickets:['AA-1']},b:{tickets:['BB-1','BB-2']},c:{tickets:['CC-1','CC-2']},text:{type:'text',text:'Note',tickets:['AA-1']},absent:{tickets:['ZZ-1']}},rows:[['a','b','c']],edges:[{from:'a',to:'b',tickets:['EE-1']}],steps:[{id:'hop',edge:'a->b'},{id:'node',nodes:['b']},{id:'fail',failures:{'a->b':'dropped'}}]}}]}});
const fixed={'AA-1':{state:'active',updatedAt:'2026-10-26T10:00:00Z'},'BB-1':{state:'done'},'BB-2':{state:'todo',dependsOn:[{key:'EE-1',source:'jira',linkType:'is blocked by'}]},'CC-2':{state:'missing'},'EE-1':{state:'blocked'}};

test('V1 shared entrypoints include the live overlay',()=>{
 for(const name of ['standalone','workbench','native','forge'])assert.match(entrypoint(name).body,/function liveStatusRollup\(/,name);
});
test('V3 rollup covers every precedence branch and ignores absent and unknown states',()=>{
 const C={URL};vm.runInNewContext(entrypoint('native').source,C);assert.equal(typeof C.liveStatusRollup,'function');
 for(const [states,want] of [[[],null],[[null,undefined],null],[['bogus'],null],[['todo'],'todo'],[['done','done'],'done'],[['todo','todo'],'todo'],[['done','todo'],'active'],[['active','done'],'active'],[['missing','active'],'missing'],[['blocked','missing','active','done','todo'],'blocked'],[[null,'done'],'done']])assert.equal(C.liveStatusRollup(states),want,JSON.stringify(states));
});
test('V2 refs uses the shared parser across sections, tabs, paths and detail-only flows',()=>{
 const raw=JSON.parse(fs.readFileSync('examples/live-status/live-status.spec.json')),h=harness(raw);
 const {tickets,prs}=plain(h.ctl.liveStatus.refs()),refs={tickets,prs};refs.tickets.sort();assert.deepEqual(refs,{tickets:['BE-67','BE-68','FW-45','FW-46','HW-123','HW-124','UX-89'],prs:['https://github.com/acme/firmware/pull/88','https://github.com/acme/backend/pull/91']});h.ctl.liveStatus.destroy();
 const data=fixture(),d=data.page.sections[0].diagram;d.nodes.a.tickets.push('invalid','AA-1');d.steps.push({id:'other',nodes:['c']});d.paths=[{id:'main',steps:['hop']},{id:'other',steps:['other']}];data.page.blocks=[{tabs:[{label:'One',sections:data.page.sections},{label:'Two',sections:[{id:'detail',detailOnly:true,diagram:{nodes:{child:{tickets:['DD-1'],prs:['https://example.test/pr']}}}}]}]}];delete data.page.sections;
 const next=harness(data);assert.ok(next.ctl.liveStatus.refs().tickets.includes('DD-1'));assert.ok(next.ctl.liveStatus.refs().tickets.includes('CC-2'));assert.ok(!next.ctl.liveStatus.refs().tickets.includes('invalid'));assert.equal(next.ctl.liveStatus.refs().tickets.filter(k=>k==='AA-1').length,1);
});
test('V2 original overlay fixture preserves ticket traversal order and node/edge PR refs',()=>{
 // Keep the pre-story order assertion independently of the six-node example.
 const h=harness({nodes:{hardware:{tickets:['HW-123']},firmware:{tickets:['FW-45'],prs:['https://github.com/acme/firmware/pull/88']},backend:{tickets:['BE-67']},ux:{tickets:['UX-89']}},rows:[['hardware','firmware','backend','ux']],edges:[{from:'hardware',to:'firmware',tickets:['HW-124','FW-46']},{from:'firmware',to:'backend',tickets:['BE-68'],prs:['https://github.com/acme/backend/pull/91']},{from:'backend',to:'ux'}]});
 const {tickets,prs}=plain(h.ctl.liveStatus.refs());assert.deepEqual({tickets,prs},{tickets:['HW-123','FW-45','BE-67','UX-89','HW-124','FW-46','BE-68'],prs:['https://github.com/acme/firmware/pull/88','https://github.com/acme/backend/pull/91']});h.ctl.liveStatus.destroy();
});
test('V2 V4 apply paints nodes, edge paths/halos/labels and step carriers; disable and clear restore',()=>{
 const {ctl,view}=harness(fixture()),api=ctl.liveStatus,events=[];api.onChange(v=>events.push(plain(v)));api.apply(fixed);
 for(const [selector,state] of [['g.node[data-dv-node="a"]','active'],['g.node[data-dv-node="b"]','active'],['g.node[data-dv-node="c"]','missing'],['path.edge','blocked'],['path.halo','blocked'],['text.lbl','blocked'],['g.coin[data-dv-step="0"]','blocked'],['button.schip[data-step-source="1"]','active'],['button.schip[data-step-source="2"]','blocked']])assert.ok(view.querySelector(selector).classList.contains('dv-live-'+state),selector);
 for(const id of ['text','absent'])assert.doesNotMatch(view.querySelector('[data-dv-node="'+id+'"]').className,/dv-live-/);
 assert.deepEqual(events[0].counts,{todo:1,active:1,testing:0,done:1,blocked:1,missing:1});assert.equal(events[0].updatedAt,'2026-10-26T10:00:00Z');assert.equal(events[0].states['AA-1'].state,'active');assert.equal(api.state('AA-1').state,'active');
 api.setEnabled(false);assert.equal(api.enabled(),false);assert.equal(view.querySelectorAll('.dv-live-active,.dv-live-blocked,.dv-live-missing').length,0);api.setEnabled(true);assert.ok(view.querySelector('path.edge').classList.contains('dv-live-blocked'));
 api.apply({'AA-1':{state:'nonsense'},'BB-1':{state:'done'}});assert.equal(api.state('AA-1'),null);assert.doesNotMatch(view.querySelector('[data-dv-node="a"]').className,/dv-live-/);assert.ok(!view.querySelector('[data-dv-node="b"]').classList.contains('dv-live-done'),'partial evidence cannot claim completion');
 api.clear();assert.equal(view.querySelectorAll('.dv-live-done,.dv-live-badge').length,0);assert.deepEqual(events.at(-1).counts,{todo:0,active:0,testing:0,done:0,blocked:0,missing:0});assert.equal(events.length,5);
});
test('V7 authored ticket menu exists without a provider and preserves plain keys without a site',()=>{
 const {C}=harness();const diagram={nodes:{a:{tickets:['AA-1'],prs:['https://example.test/pr']}}};
 const links=plain(C.nodeReferenceLinks(diagram,'a',{tracking:{jira:{site:'https://jira.test/'}}}));assert.ok(links.some(x=>x.group==='Tickets'&&x.label==='AA-1'&&x.url==='https://jira.test/browse/AA-1'));assert.ok(links.some(x=>x.url==='https://example.test/pr'));
 assert.ok(C.nodeReferenceLinks(diagram,'a',{}).some(x=>x.label==='AA-1'&&!x.url));
});
test('V9 rebuild events and one scoped observer coalesce, then retire on destroy',()=>{
 const h=harness(fixture()),api=h.ctl.liveStatus;api.apply(fixed);const el=h.view.querySelector('path.edge');el.classList.remove('dv-live-blocked');
 h.ctl.sections[0].sectionEl.dispatchEvent({type:'dv:pathrender'});h.ctl.sections[0].sectionEl.dispatchEvent({type:'dv:pathchange'});h.view.dispatchEvent({type:'diagram-tab-change'});assert.equal(h.frames.size,1);h.flush();assert.ok(el.classList.contains('dv-live-blocked'));
 assert.equal(h.observers.length,1);assert.ok(h.observers[0].targets.length);for(const {t,opts} of h.observers[0].targets){assert.ok(t.classList.contains('schips')||t.classList.contains('termbar'));assert.equal(opts.childList,true);assert.equal(opts.subtree,true);assert.ok(!opts.attributes);}
 api.destroy();assert.equal(h.frames.size,0);assert.equal(h.observers[0].targets.length,0);assert.equal(h.timers.size,0);h.view.dispatchEvent({type:'detail-navigation'});assert.equal(h.frames.size,0);
});
test('V10 provider starts after paint, clamps cadence, pauses, catches up, retains errors and aborts',async()=>{
 let calls=0,signal,fail=false;const h=harness(fixture(),{provider:(refs,s)=>{calls++;signal=s;assert.ok(refs.tickets.includes('AA-1'));return fail?Promise.reject(Error('Unavailable')):Promise.resolve(fixed);},refreshMs:1});
 mountStatus(h);const note=h.view.querySelector('.dv-live-note');assert.equal(note.hidden,true);
 assert.equal(calls,0);h.flush();h.flush();await new Promise(setImmediate);assert.equal(calls,1);assert.equal(h.ctl.liveStatus.state('AA-1').state,'active');assert.equal([...h.timers.values()][0].ms,30000);
 h.doc.hidden=true;h.doc.visibilityState='hidden';h.doc.dispatchEvent({type:'visibilitychange'});assert.equal(h.timers.size,0);
 h.doc.hidden=false;h.doc.visibilityState='visible';h.doc.dispatchEvent({type:'visibilitychange'});await new Promise(setImmediate);assert.equal(calls,2);
 fail=true;const tick=[...h.timers.values()][0];h.timers.clear();tick.fn();await new Promise(setImmediate);assert.equal(h.ctl.liveStatus.state('AA-1').state,'active');
 assert.equal(note.textContent,'Unavailable');assert.equal(note.getAttribute('data-kind'),'error');assert.equal(note.hidden,false);assert.equal(h.view.querySelector('.dv-live-head').hidden,false);
 fail=false;const retry=[...h.timers.values()][0];h.timers.clear();retry.fn();await new Promise(setImmediate);assert.equal(note.textContent,'');assert.equal(note.hidden,true);assert.equal(note.getAttribute('data-kind'),'info');
 h.ctl.liveStatus.destroy();assert.equal(signal.aborted,true);assert.equal(h.timers.size,0);
});
test('V9 painting disconnects observation, ignores re-entrant events and absorbs queued rebuilds',()=>{
 const h=harness(fixture()),api=h.ctl.liveStatus;api.apply(fixed);
 const observer=h.observers[0],section=h.ctl.sections[0].sectionEl,paintClass=h.C.liveStatusClass;
 let writes=0;
 h.C.liveStatusClass=function(el,state){
  writes++;assert.equal(observer.targets.length,0,'own DOM writes are not observed');
  section.dispatchEvent({type:'dv:pathrender'});assert.equal(h.frames.size,0,'paint cannot schedule itself');
  paintClass(el,state);
 };
 observer.callback();observer.callback();section.dispatchEvent({type:'dv:pathchange'});
 assert.equal(h.frames.size,1,'external changes share one frame');
 api.apply(fixed);assert.ok(writes>0);assert.equal(h.frames.size,0,'direct apply absorbs the queued paint');
 assert.ok(observer.targets.length,'external chip rebuilds remain observed');
 const edge=h.view.querySelector('path.edge');edge.classList.remove('dv-live-blocked');
 observer.callback();observer.callback();assert.equal(h.frames.size,1);h.flush();
 assert.ok(edge.classList.contains('dv-live-blocked'));assert.equal(h.frames.size,0,'paint settles without another frame');
 h.C.liveStatusClass=paintClass;api.destroy();observer.callback();assert.equal(h.frames.size,0);assert.equal(observer.targets.length,0);
});
test('V10 late provider resolution after destroy cannot publish state',async()=>{
 let resolve;const h=harness(fixture(),{provider:()=>new Promise(r=>resolve=r)});h.flush();h.flush();await new Promise(setImmediate);h.ctl.liveStatus.destroy();resolve(fixed);await new Promise(setImmediate);assert.equal(h.ctl.liveStatus.state('AA-1'),null);
});
test('V11 absent provider and apply leave carrier DOM untouched',()=>{
 const h=harness(fixture());assert.equal(h.view.querySelectorAll('.dv-live-badge,.dv-live-active').length,0);assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);h.ctl.liveStatus.destroy();
});

test('live status initializes, applies changes and disposes without a window global',()=>{
 const h=harness(fixture());h.ctl.liveStatus.destroy();delete h.C.window;
 const api=h.C.createLiveStatus(h.ctl,h.ctl.page);
 api.apply({'AA-1':{state:'todo'}});
 api.apply({'AA-1':{state:'active'}});
 const node=h.view.querySelector('[data-dv-node="a"]');
 assert.ok(node.classList.contains('dv-live-active'));
 assert.ok(node.classList.contains('dv-live-changed'));
 api.destroy();api.destroy();
 assert.equal(h.view.querySelectorAll('.dv-live-badge,.dv-live-changed,.dv-live-active').length,0);
});

test('V8 notes and host actions update, replace and clear the reader controls',()=>{
 const h=harness(fixture()),api=h.ctl.liveStatus,mount=mountStatus(h),root=h.view.querySelector('.dv-live-head'),note=root.querySelector('.dv-live-note'),action=root.querySelector('.dv-live-action');
 assert.equal(root.hidden,true);assert.equal(note.hidden,true);assert.equal(action.hidden,true);assert.equal(root.querySelector('time'),null);
 for(const kind of ['info','warn','error']){api.note('Provider '+kind,kind);assert.equal(root.hidden,false);assert.equal(note.hidden,false);assert.equal(note.textContent,'Provider '+kind);assert.equal(note.getAttribute('data-kind'),kind);}
 api.note('Fallback','unknown');assert.equal(note.getAttribute('data-kind'),'info');api.note('','info');assert.equal(note.hidden,true);assert.equal(root.hidden,true);
 let first=0,second=0;api.action('Allow',()=>first++);assert.equal(root.hidden,false);assert.equal(action.hidden,false);assert.equal(action.textContent,'Allow');action.dispatchEvent({type:'click'});assert.equal(first,1);
 api.action('Retry',()=>second++);assert.equal(root.querySelectorAll('.dv-live-action').length,1);assert.equal(action.textContent,'Retry');action.dispatchEvent({type:'click'});assert.equal(second,1);assert.equal(first,1);
 api.action('',()=>first++);assert.equal(action.hidden,true);assert.equal(root.hidden,true);action.dispatchEvent({type:'click'});assert.equal(first,1);
 mount.destroy();api.note('Detached','warn');api.action('Allow',()=>first++);assert.equal(h.view.querySelectorAll('.dv-live-head').length,0);api.destroy();
});

test('V8 V9 V11 external detail refs create a deferred control and retired mounts stay absent',async()=>{
 let resolve;const loadDetail=()=>new Promise(r=>resolve=r),renderOptions={loadDetail},h=harness(undefined,{},renderOptions),api=h.ctl.liveStatus;
 const removed=h.view.appendChild(new Element('nav')),host=h.view.appendChild(new Element('nav'));
 const retiredMount=mountStatus(h,removed),mount=mountStatus(h,host);
 assert.equal(h.view.querySelectorAll('.dv-live-toggle').filter(el=>!el.hidden).length,0);assert.ok(retiredMount && mount,'empty refs still register disposable panel mounts');retiredMount.destroy();
 api.apply({'DD-1':{state:'done',updatedAt:'2026-10-26T12:00:00Z'}});api.note('Detail loaded','info');assert.equal(h.view.querySelectorAll('.dv-live-toggle').filter(el=>!el.hidden).length,0);
 const pending=renderOptions.loadDetail({spec:'approved-detail'},new AbortController().signal);resolve({nodes:{child:{tickets:['DD-1']}},rows:[['child']]});await pending;h.flush();
 assert.deepEqual(plain(api.refs().tickets),['DD-1']);assert.equal(removed.children.length,0);assert.equal(host.querySelectorAll('.dv-live-toggle').length,1);
 const root=host.querySelector('.dv-live-head'),toggle=host.querySelector('.dv-live-toggle');assert.equal(root.hidden,false);assert.equal(root.querySelector('[data-live-count="done"]').textContent,'done 1');assert.equal(root.querySelector('.dv-live-note').textContent,'Detail loaded');assert.equal(root.querySelector('time'),null,'V8 no ticket-change time in the header (#769)');assert.equal(h.ctl.liveStatus.snapshot().updatedAt,'2026-10-26T12:00:00Z');
 toggle.dispatchEvent({type:'click'});assert.equal(api.enabled(),false);assert.equal(toggle.getAttribute('aria-pressed'),'false');
 h.view.dispatchEvent({type:'detail-navigation'});h.flush();assert.equal(host.querySelectorAll('.dv-live-toggle').length,1);
 mount.destroy();api.apply({});h.view.dispatchEvent({type:'navigation-mounted'});h.flush();assert.equal(host.children.length,0);
 const replacement=mountStatus(h,host);assert.equal(host.querySelectorAll('.dv-live-toggle').length,1);api.destroy();replacement.destroy();assert.equal(host.children.length,0);assert.equal(renderOptions.loadDetail,loadDetail);
});

test('V9 a late detail load cannot create controls after overlay destruction',async()=>{
 let resolve;const renderOptions={loadDetail:()=>new Promise(r=>resolve=r)},h=harness(undefined,{},renderOptions),api=h.ctl.liveStatus;
 mountStatus(h);const pending=renderOptions.loadDetail({spec:'late-detail'},new AbortController().signal);api.destroy();resolve({nodes:{child:{tickets:['DD-1']}}});await pending;h.flush();
 assert.deepEqual(plain(api.refs().tickets),[]);assert.equal(h.view.querySelectorAll('.dv-live-toggle').filter(el=>!el.hidden).length,0);assert.equal(h.frames.size,0);
});

/* Story contract matrix (paired with browser cases below):
 S1: built 6-node/5-edge/7-step story, tickets and index (browser + test_index).
 S2: standalone-only demo source, embedded timeline, early hash and fallback.
 S3: conversion, default cadence, controls, reduced motion, completion and cleanup.
 S4: dependency waiting (see D1–D12), own paint and clearing.
 S5: blocked breaks in ambient/step, todo packets, done/active restoration (browser).
 S6: waiting tag/badge/popover, skin and print paint (browser).
 S7: named documentation sections. S8: demo excluded from workbench; scoped diff gate.
 Carrier keys in the pure helper are node IDs and directed from->to edge keys.
*/
function storyContext(){const C={URL};vm.runInNewContext(entrypoint('standalone').body,C);return C;}
function forkJoin(){return {nodes:{up:{tickets:['UP-1']},a:{tickets:['AA-1']},b:{tickets:['BB-1']},c:{tickets:['CC-1']},join:{tickets:['JJ-1']},end:{}},edges:[{from:'up',to:'a'},{from:'a',to:'b'},{from:'a',to:'c'},{from:'b',to:'join',tickets:['EE-1']},{from:'c',to:'join'},{from:'join',to:'end'}]};}
/* Dependencies contract (#765, Chuck 2026-10-27). Edge direction is data flow and infers nothing about
   delivery: the topology propagation is gone. A dependency is ticket -> ticket from two merged sources,
   Jira issue links (inward types, default "is blocked by" and "depends on") and authored
   page.tracking.dependencies pairs. X waits on Y while Y is not done unless X is already active or done.
   Tone from the DIRECT upstream: unfinished -> grey (slate, hand icon); blocked or missing -> red (rose, alarm icon).
 D1 parsers + validator warnings; D2 apply() sanitizes dependsOn; D3 merge by provenance;
 D4 ticket waiting; D5 carrier waiting (no edge propagation); D6 chains; D7 canvas paint and popover;
 D8 panel (epic box, Depends on column, outside-epic rows, chains, Suggest link hint);
 D9 Jira adapter issuelinks; D10 demo links; D11 docs/skill/contract/types; D12 shared icons. */
const depFixture=()=>({page:{tracking:{jira:{site:'https://jira.test',epic:'EP-1'},dependencies:[{ticket:'UX-1',on:'BE-1',reason:'needs push payload'}]},sections:[{id:'main',diagram:{
 nodes:{hw:{title:'Button',tickets:['HW-1']},fw:{title:'Controller',tickets:['FW-1']},be:{title:'Backend',tickets:['BE-1']},app:{title:'App',tickets:['UX-1']}},rows:[['hw','fw','be','app']],
 edges:[{from:'hw',to:'fw',label:'press',tickets:['HW-2']},{from:'fw',to:'be',label:'event'},{from:'be',to:'app',label:'push',tickets:['BE-1','UX-1']}],
 steps:[{id:'press',edge:'hw->fw'},{id:'event',edge:'fw->be'},{id:'push',edge:'be->app'}]}}]}});
const depMap=()=>({'HW-1':{state:'active',epic:'EP-1'},'HW-2':{state:'blocked',epic:'EP-1'},
 'FW-1':{state:'todo',epic:'EP-1',dependsOn:[{key:'HW-2',source:'jira',linkType:'is blocked by'},{key:'OUT-9',source:'jira',linkType:'depends on'}]},
 'BE-1':{state:'todo',epic:'EP-1',dependsOn:[{key:'GONE-1',source:'jira',linkType:'is blocked by'}]},'UX-1':{state:'todo',epic:'EP-1'},
 'OUT-9':{state:'active',title:'Vendor driver',epic:'OTHER-1'}});
test('D1 authored dependency pairs and link types parse, deduplicate and warn per malformed entry without errors',()=>{
 const {C}=harness();assert.equal(typeof C.trackingDependencies,'function');assert.equal(typeof C.trackingDependencyLinks,'function');
 const raw=depFixture();raw.page.tracking.dependencies.push({ticket:'UX-1',on:'BE-1'},{ticket:'bad',on:'BE-1'},{ticket:'FW-1'},null,{ticket:'FW-1',on:'FW-1'},{ticket:'FW-1',on:'HW-2',reason:7},{ticket:'FW-1',on:'HW-2'});
 const before=JSON.stringify(raw),invalid=[];
 assert.deepEqual(plain(C.trackingDependencies(raw.page,i=>invalid.push(i))),[{ticket:'UX-1',on:'BE-1',reason:'needs push payload'},{ticket:'FW-1',on:'HW-2'}]);
 assert.deepEqual(invalid,[2,3,4,5,6]);assert.equal(JSON.stringify(raw),before);
 const result=C.validate(C.normalize(raw));assert.deepEqual(plain(result.errors),[]);
 assert.equal(result.warnings.filter(w=>/^tracking\.dependencies\[\d+\]/.test(w)).length,5);assert.ok(result.warnings.some(w=>/tracking\.dependencies\[5\].*itself/.test(w)));
 raw.page.tracking.dependencies={};assert.deepEqual(plain(C.trackingDependencies(raw.page)),[]);assert.ok(C.validate(C.normalize(raw)).warnings.some(w=>/^tracking\.dependencies: must be an array/.test(w)));
 assert.deepEqual(plain(C.trackingDependencies({})),[]);
 assert.deepEqual(plain(C.trackingDependencyLinks({})),['is blocked by','depends on']);
 const links=depFixture();links.page.tracking.jira.dependencyLinks=['Is Blocked By',' depends on ','',4];
 assert.deepEqual(plain(C.trackingDependencyLinks(links.page)),['is blocked by','depends on']);
 const linkResult=C.validate(C.normalize(links));assert.deepEqual(plain(linkResult.errors),[]);assert.equal(linkResult.warnings.filter(w=>/^tracking\.jira\.dependencyLinks\[\d+\]/.test(w)).length,2);
 links.page.tracking.jira.dependencyLinks='is blocked by';assert.ok(C.validate(C.normalize(links)).warnings.some(w=>/^tracking\.jira\.dependencyLinks: must be an array/.test(w)));
 assert.deepEqual(plain(C.validate(C.normalize(depFixture()))),{errors:[],warnings:['page.tracking: no live-status panel declared — add {"type": "live-status"} to a section\'s panels so viewers see the rollup']});
});
test('D2 apply keeps well-formed dependsOn entries and drops malformed ones',()=>{
 const h=harness(depFixture()),api=h.ctl.liveStatus;
 api.apply({'FW-1':{state:'todo',dependsOn:[{key:'HW-2',source:'jira',linkType:'is blocked by'},{key:'OUT-9',source:'authored',reason:'driver first'},{key:'bad',source:'jira'},{key:'HW-1',source:'guess'},null,{key:'HW-1',source:'jira',linkType:5,reason:['x']}]},'BE-1':{state:'todo',dependsOn:'HW-2'}});
 assert.deepEqual(plain(api.state('FW-1').dependsOn),[{key:'HW-2',source:'jira',linkType:'is blocked by'},{key:'OUT-9',source:'authored',reason:'driver first'},{key:'HW-1',source:'jira'}]);
 assert.equal(api.state('BE-1').dependsOn,undefined);assert.equal(plain(api.snapshot()).states['FW-1'].dependsOn.length,3);api.destroy();
});
test('D3 dependencies merge Jira links and authored pairs by provenance',()=>{
 const h=harness(depFixture()),C=h.C;assert.equal(typeof C.liveStatusDependencies,'function');
 const map=depMap();map['UX-1'].dependsOn=[{key:'BE-1',source:'jira',linkType:'is blocked by'}];
 const merged=plain(C.liveStatusDependencies([h.ctl.page],map));
 assert.deepEqual(merged['FW-1'],[{key:'HW-2',sources:['jira'],linkType:'is blocked by'},{key:'OUT-9',sources:['jira'],linkType:'depends on'}]);
 assert.deepEqual(merged['UX-1'],[{key:'BE-1',sources:['jira','authored'],linkType:'is blocked by',reason:'needs push payload'}]);
 assert.deepEqual(merged['BE-1'],[{key:'GONE-1',sources:['jira'],linkType:'is blocked by'}]);assert.equal(merged['HW-1'],undefined);
 assert.deepEqual(plain(C.liveStatusDependencies([h.ctl.page],{})['UX-1']),[{key:'BE-1',sources:['authored'],reason:'needs push payload'}]);
 assert.deepEqual(plain(C.liveStatusDependencies([],{})),{});h.ctl.liveStatus.destroy();
});
test('D4 a ticket waits while its direct upstream is unfinished; tone is red for blocked or missing upstreams',()=>{
 const h=harness(depFixture()),C=h.C;assert.equal(typeof C.liveStatusTicketWaiting,'function');
 const map=depMap(),waiting=plain(C.liveStatusTicketWaiting(C.liveStatusDependencies([h.ctl.page],map),map));
 assert.deepEqual(waiting,{'FW-1':{tone:'red',on:[{key:'HW-2',state:'blocked',tone:'red'},{key:'OUT-9',state:'active',tone:'grey'}]},
  'BE-1':{tone:'red',on:[{key:'GONE-1',state:'missing',tone:'red'}]},'UX-1':{tone:'grey',on:[{key:'BE-1',state:'todo',tone:'grey'}]}});
 // X already active or done lists the link but does not wait; a blocked or missing X still waits; a done upstream holds nothing.
 for(const state of ['active','done']){const m=depMap();m['FW-1'].state=state;assert.equal(C.liveStatusTicketWaiting(C.liveStatusDependencies([h.ctl.page],m),m)['FW-1'],undefined,state);}
 for(const state of ['blocked','missing']){const m=depMap();m['FW-1'].state=state;const w=plain(C.liveStatusTicketWaiting(C.liveStatusDependencies([h.ctl.page],m),m));assert.equal(w['FW-1'].tone,'red',state);assert.deepEqual(plain(C.liveStatusDependencyChains(w)).filter(c=>c.includes('FW-1')),[['HW-2','FW-1'],['OUT-9','FW-1']],state+' chain present');}
 const done=depMap();done['HW-2'].state='done';done['OUT-9'].state='done';assert.equal(C.liveStatusTicketWaiting(C.liveStatusDependencies([h.ctl.page],done),done)['FW-1'],undefined);
 const absent=depMap();delete absent['FW-1'].state;absent['FW-1'].state='todo';delete absent['OUT-9'];assert.equal(C.liveStatusTicketWaiting(C.liveStatusDependencies([h.ctl.page],absent),absent)['FW-1'].tone,'red');
 // A ticket without a map entry can still wait on its authored upstream.
 const noEntry=depMap();delete noEntry['UX-1'];assert.deepEqual(plain(C.liveStatusTicketWaiting(C.liveStatusDependencies([h.ctl.page],noEntry),noEntry))['UX-1'],{tone:'grey',on:[{key:'BE-1',state:'todo',tone:'grey'}]});
 h.ctl.liveStatus.destroy();
});
test('D5 a carrier waits when any of its tickets waits; edge direction propagates nothing',()=>{
 const h=harness(depFixture()),C=h.C,d=h.ctl.page.sections[0].diagram;assert.equal(typeof C.liveStatusCarrierWaiting,'function');assert.equal(C.liveStatusWaiting,undefined,'edge-direction propagation is gone');
 const map=depMap(),waiting=plain(C.liveStatusCarrierWaiting(d,map,C.liveStatusTicketWaiting(C.liveStatusDependencies([h.ctl.page],map),map)));
 assert.deepEqual(waiting,{fw:{tone:'red',keys:['HW-2','OUT-9']},be:{tone:'red',keys:['GONE-1']},app:{tone:'grey',keys:['BE-1']},'be->app':{tone:'red',keys:['BE-1','GONE-1']}});
 // The blocked press edge feeds fw -> be -> app by data flow; without a dependency none of them waits.
 const plain2=depMap();delete plain2['FW-1'].dependsOn;delete plain2['BE-1'].dependsOn;const page={sections:[{diagram:d}]};
 assert.deepEqual(plain(C.liveStatusCarrierWaiting(d,plain2,C.liveStatusTicketWaiting(C.liveStatusDependencies([page],plain2),plain2))),{});
 assert.deepEqual(plain(C.liveStatusCarrierWaiting(d,{},{})),{});h.ctl.liveStatus.destroy();
});
test('D6 chains run from a root upstream through each waiting hop and stay bounded on cycles',()=>{
 const h=harness(depFixture()),C=h.C;assert.equal(typeof C.liveStatusDependencyChains,'function');
 const map=depMap(),waiting=C.liveStatusTicketWaiting(C.liveStatusDependencies([h.ctl.page],map),map);
 assert.deepEqual(plain(C.liveStatusDependencyChains(waiting)),[['GONE-1','BE-1','UX-1'],['HW-2','FW-1'],['OUT-9','FW-1']]);
 const loop={'AA-1':{tone:'grey',on:[{key:'BB-1',state:'todo',tone:'grey'}]},'BB-1':{tone:'grey',on:[{key:'AA-1',state:'todo',tone:'grey'}]}};
 const chains=plain(C.liveStatusDependencyChains(loop));assert.ok(chains.length>=1 && chains.every(chain=>chain.length<=3));assert.deepEqual(plain(C.liveStatusDependencyChains({})),[]);h.ctl.liveStatus.destroy();
});
test('D7 canvas paint: waiting tone on class, attribute and preset; popover names the upstream and its chain',()=>{
 const h=harness(depFixture()),api=h.ctl.liveStatus;api.apply(depMap());const node=id=>h.view.querySelector('[data-dv-node="'+id+'"]');
 assert.ok(node('fw').classList.contains('dv-live-waiting'));assert.equal(node('fw').getAttribute('data-dv-live-waiting-on'),'HW-2,OUT-9');assert.equal(node('fw').getAttribute('data-dv-live-waiting-tone'),'red');
 assert.ok(node('fw').classList.contains('ns-rose') && node('fw').classList.contains('dv-live-todo'),'red waiting wears rose over its own todo state');
 assert.ok(node('app').classList.contains('dv-live-waiting'));assert.equal(node('app').getAttribute('data-dv-live-waiting-tone'),'grey');assert.ok(node('app').classList.contains('ns-slate'));
 assert.ok(!node('hw').classList.contains('dv-live-waiting'));assert.equal(node('hw').getAttribute('data-dv-live-waiting-tone'),null);
 const edge=h.view.querySelector('path.edge[data-dv-edge="2"]');assert.ok(edge.classList.contains('dv-live-waiting'));assert.equal(edge.getAttribute('data-dv-live-waiting-tone'),'red');assert.equal(edge.getAttribute('data-dv-live-waiting-on'),'BE-1,GONE-1');
 assert.ok(!h.view.querySelector('path.edge[data-dv-edge="1"]').classList.contains('dv-live-waiting'),'the untracked event edge after the blocked press edge is not waiting');
 assert.deepEqual(h.view.querySelectorAll('.dv-live-waiting-tag,.dv-live-badge,.dv-live-waiting-icon').map(el=>el.className),[],'no canvas badges or icons');
 const card=node('fw').querySelector('.card');assert.match(card.getAttribute('aria-label'),/waiting on HW-2, OUT-9/);
 h.view.dispatchEvent({type:'click',target:card,button:0,preventDefault(){},stopPropagation(){}});const pop=h.view.querySelector('.dv-live-popover');
 const details=pop.querySelectorAll('.dv-live-waiting-detail').map(el=>el.textContent);assert.deepEqual(details,['Waiting on HW-2 · blocked','Waiting on OUT-9 · active']);
 assert.deepEqual(pop.querySelectorAll('.dv-live-waiting-detail').map(el=>el.getAttribute('data-tone')),['red','grey']);
 assert.deepEqual(pop.querySelectorAll('.dv-live-waiting-chain').map(el=>el.textContent),['HW-2 holds FW-1','OUT-9 holds FW-1']);
 // A chain this carrier only holds up belongs to the downstream popover: the push edge carries BE-1 (active, a root
 // holding HW-1 and UX-1) and UX-1 (waiting on BE-1); its popover lists "BE-1 holds UX-1" and not "BE-1 holds HW-1".
 const holding=depMap();holding['BE-1']={state:'active',epic:'EP-1'};holding['HW-1']={state:'todo',epic:'EP-1',dependsOn:[{key:'BE-1',source:'jira',linkType:'is blocked by'}]};api.apply(holding);
 h.view.dispatchEvent({type:'click',target:h.view.querySelector('text.lbl[data-dv-edge="2"]'),button:0,preventDefault(){},stopPropagation(){}});
 assert.deepEqual(h.view.querySelector('.dv-live-popover').querySelectorAll('.dv-live-waiting-chain').map(el=>el.textContent),['BE-1 holds UX-1'],'only the chain the edge waits in');
 h.view.dispatchEvent({type:'click',target:node('hw').querySelector('.card'),button:0,preventDefault(){},stopPropagation:function(){}});
 assert.deepEqual(h.view.querySelector('.dv-live-popover').querySelectorAll('.dv-live-waiting-chain').map(el=>el.textContent),['BE-1 holds HW-1']);api.apply(depMap());
 api.setEnabled(false);assert.equal(node('fw').getAttribute('data-dv-live-waiting-tone'),null);assert.equal(h.view.querySelectorAll('.dv-live-waiting').length,0);api.setEnabled(true);assert.ok(node('fw').classList.contains('dv-live-waiting'));
 const cleared=depMap();cleared['HW-2'].state='done';cleared['OUT-9'].state='done';api.apply(cleared);assert.ok(!node('fw').classList.contains('dv-live-waiting'));assert.ok(node('fw').classList.contains('ns-slate'),'own todo paint returns');
 api.clear();assert.equal(h.view.querySelectorAll('.dv-live-waiting').length,0);api.destroy();
});
test('D7 a blocked or missing dependent records waiting but the canvas keeps its own stronger paint',()=>{
 for(const state of ['blocked','missing']){
  const h=harness(depFixture()),api=h.ctl.liveStatus,map=depMap();map['FW-1'].state=state;map['FW-1'].dependsOn=[{key:'OUT-9',source:'jira',linkType:'depends on'}];api.apply(map);
  const fw=h.view.querySelector('[data-dv-node="fw"]');assert.ok(fw.classList.contains('dv-live-'+state),state);assert.ok(fw.classList.contains('ns-rose'));
  assert.ok(!fw.classList.contains('dv-live-waiting'),state+': no dashed waiting stroke over the own paint');assert.equal(fw.getAttribute('data-dv-live-waiting-tone'),null);
  const value=plain(api.snapshot());assert.deepEqual(value.waiting['FW-1'],{tone:'grey',on:[{key:'OUT-9',state:'active',tone:'grey'}]},state+': waiting recorded');assert.ok(value.chains.some(c=>c.join('>')==='OUT-9>FW-1'));
  const card=fw.querySelector('.card');assert.match(card.getAttribute('aria-label'),/waiting on OUT-9/);h.view.dispatchEvent({type:'click',target:card,button:0,preventDefault(){},stopPropagation(){}});
  assert.deepEqual(h.view.querySelector('.dv-live-popover').querySelectorAll('.dv-live-waiting-detail').map(el=>el.textContent),['Waiting on OUT-9 · active']);
  mountStatus(h);api.apply(map);assert.equal(h.view.querySelector('tr[data-live-ticket="FW-1"]').querySelector('.dv-live-dep').getAttribute('data-tone'),'grey');assert.ok(h.view.querySelectorAll('.dv-live-chain').some(el=>el.querySelectorAll('.dv-live-dep-key').map(k=>k.textContent).join('>')==='OUT-9>FW-1'));
  api.destroy();
 }
});
test('D7 readiness, blockers and captions count waiting from dependencies, not edges',()=>{
 const h=harness(depFixture()),api=h.ctl.liveStatus,C=h.C;api.apply(depMap());const value=plain(api.snapshot());
 assert.equal(value.readiness.waiting,4,'fw, be, app and the push edge wait');assert.equal(value.readiness.blockers,1);
 assert.equal(value.blockers.length,1);assert.equal(value.blockers[0].key,'HW-2');assert.equal(value.blockers[0].downstream,'1 downstream carriers · 2 steps');
 const d=h.ctl.page.sections[0].diagram;assert.equal(C.liveStatusCaption(d,d.steps[2],depMap(),value.waiting),'TODO · 2 tickets · waiting on BE-1, GONE-1');
 assert.equal(C.liveStatusCaption(d,d.steps[0],depMap()),'BLOCKED · HW-2');api.destroy();
});
test('D8 panel: epic box, Depends on buttons, outside-epic rows, chains and the Suggest link hint',()=>{
 const h=harness(depFixture()),api=h.ctl.liveStatus;mountStatus(h);api.apply(Object.assign(depMap(),{'EP-1':{state:'active',title:'Connected doorbell',epic:''}}));
 const body=h.view.querySelector('.dv-live-panel-body');assert.ok(body);
 assert.deepEqual(body.querySelectorAll('h3').map(el=>el.textContent),['Tickets','Blockers and dependency chains','Activity']);
 // A permitted host map adds Proof in place, without enabling Metrics or changing Jira sections.
 h.ctl.page.sections[0].diagram.nodes.hw.telemetry={kind:'service',signals:{rate:{grafana:'explicit',unit:'req/h'}},proof:{rate:{min:1}}};
 h.ctl.telemetry.apply({hw:{signals:{rate:{value:5}}}});
 assert.deepEqual(body.querySelectorAll('h3').map(el=>el.textContent),['Proof','Tickets','Proof table','Blockers and dependency chains','Activity']);
 assert.deepEqual(body.children.filter(el=>el.classList.contains('dv-live-epic') || el.classList.contains('dv-live-proof') || el.tagName==='h3').map(el=>el.classList.contains('dv-live-epic')?'Epic':el.classList.contains('dv-live-proof')?'Proof':el.textContent),['Epic','Proof','Tickets','Proof table','Blockers and dependency chains','Activity']);
 h.ctl.telemetry.clear();
 assert.deepEqual(body.querySelectorAll('h3').map(el=>el.textContent),['Tickets','Blockers and dependency chains','Activity']);
 assert.ok(h.view.querySelector('.dv-live-verdict')===null,'the old verdict line is gone');
 const epic=body.querySelector('.dv-live-epic');assert.ok(epic,'epic header box');assert.ok(body.children[0]===epic,'the epic box is first in the body');
 assert.equal(epic.querySelector('a.dv-live-epic-key').getAttribute('href'),'https://jira.test/browse/EP-1');assert.equal(epic.querySelector('.dv-live-epic-key').textContent,'EP-1');
 assert.equal(epic.querySelector('.dv-live-epic-title').textContent,'Connected doorbell');assert.equal(epic.querySelector('.dv-live-epic-state').textContent,'active');
 assert.equal(epic.querySelector('.dv-live-epic-progress').textContent,'0 of 7 stories done · 5 of 7 on diagram');assert.equal(epic.querySelector('.dv-live-epic-counts').textContent,'1 blocked · 3 waiting · 2 outside epic');
 assert.ok(epic.querySelector('.dv-live-completion'),'carrier completion ring lives in the box');assert.equal(h.view.querySelector('.dv-live-head').querySelectorAll('.dv-live-epic').length,0,'never in the header or title bar');
 const table=body.querySelector('table.dv-live-tickets');assert.deepEqual(table.querySelectorAll('th').map(el=>textOf(el).trim()),['Key','Title','State','Owner','Depends on','PRs']);
 const rows=table.querySelectorAll('tr[data-live-ticket]'),row=key=>rows.find(el=>el.getAttribute('data-live-ticket')===key),coverage=key=>table.querySelector('tr[data-live-coverage-for="'+key+'"]');
 assert.deepEqual(rows.map(el=>el.getAttribute('data-live-ticket')),['HW-2','GONE-1','HW-1','OUT-9','BE-1','FW-1','UX-1']);
 assert.equal(coverage('FW-1'),null,'tickets without an informational tag have no companion row');
 const deps=row('FW-1').querySelectorAll('.dv-live-dep');assert.equal(deps.length,2);
 assert.equal(deps[0].tagName,'button');assert.equal(deps[0].getAttribute('data-live-dep-for'),'HW-2');assert.equal(deps[0].getAttribute('data-tone'),'red');assert.ok(deps[0].classList.contains('dv-live-dep-red'));
 assert.equal(deps[0].querySelector('.dv-live-dep-key').textContent,'HW-2');assert.equal(deps[0].querySelector('.dv-live-state-pill').textContent,'blocked');assert.equal(deps[0].querySelector('.dv-live-dep-icon').getAttribute('data-icon'),'alarm');assert.match(deps[0].querySelector('.dv-live-dep-icon').innerHTML,/<svg[^>]*data-icon="alarm"/);
 assert.equal(deps[1].getAttribute('data-tone'),'grey');assert.ok(!deps[1].classList.contains('dv-live-dep-red'));assert.equal(deps[1].querySelector('.dv-live-dep-icon').getAttribute('data-icon'),'hand');
 assert.doesNotMatch(textOf(row('FW-1')),/Jira ·|is blocked by/,'no source line in the cell');
 const authored=row('UX-1').querySelector('.dv-live-dep');assert.equal(authored.getAttribute('title'),'needs push payload');assert.equal(authored.getAttribute('data-tone'),'grey');assert.equal(authored.querySelector('.dv-live-state-pill').textContent,'todo');
 assert.equal(row('BE-1').querySelector('.dv-live-dep').querySelector('.dv-live-state-pill').textContent,'missing');assert.equal(row('BE-1').querySelector('.dv-live-dep').getAttribute('data-tone'),'red');
 assert.equal(row('HW-1').querySelectorAll('.dv-live-dep').length,0);
 // A done upstream shows the green check (Chuck, PR #784 review), never the hand or alarm.
 const done=depMap();done['HW-2'].state='done';api.apply(done);const doneDep=row('FW-1').querySelectorAll('.dv-live-dep')[0];assert.equal(doneDep.getAttribute('data-tone'),'done');assert.ok(doneDep.classList.contains('dv-live-dep-done'));assert.ok(!doneDep.classList.contains('dv-live-dep-red'));
 assert.equal(doneDep.querySelector('.dv-live-dep-icon').hidden,false);assert.equal(doneDep.querySelector('.dv-live-dep-icon').getAttribute('data-icon'),'check');assert.doesNotMatch(doneDep.querySelector('.dv-live-dep-icon').innerHTML,/data-icon="(hand|alarm)"/);assert.equal(doneDep.querySelector('.dv-live-state-pill').textContent,'done');assert.match(doneDep.getAttribute('aria-label'),/upstream done/);
 assert.match(h.C.PanelRegistry.get('live-status').styles,/\.dv-live-dep\.dv-live-dep-done \.dv-live-dep-icon\{color:var\(--dv-live-done\)/,'check takes the done preset colour');api.apply(Object.assign(depMap(),{'EP-1':{state:'active',title:'Connected doorbell'}}));
 assert.equal(coverage('OUT-9').querySelector('.dv-live-coverage-tag').textContent,'DEPENDENCY ONLY');assert.equal(row('OUT-9').querySelector('.dv-live-ticket-epic').textContent,'epic OTHER-1');
 assert.equal(coverage('GONE-1').querySelector('.dv-live-coverage-tag').textContent,'DEPENDENCY ONLY');assert.ok(row('GONE-1').querySelector('.dv-live-ticket-epic')===null);assert.equal(row('GONE-1').querySelector('.dv-live-state-pill').textContent,'No status');
 assert.ok(row('FW-1').querySelector('.dv-live-ticket-epic')===null);assert.equal(table.querySelectorAll('th').map(el=>el.textContent).indexOf('Epic'),-1,'no Epic column');
 assert.equal(table.querySelectorAll('.dv-live-chip').length,0,'diagram links are absent from the panel');
 const suggest=body.querySelector('.dv-live-suggest');assert.equal(suggest.textContent,'1 authored dependency (UX-1 → BE-1) has no Jira link. Suggest link in Jira');assert.equal(suggest.querySelectorAll('button,a').length,0,'a hint only; the page never writes to Jira');
 const chains=body.querySelectorAll('.dv-live-chain');assert.deepEqual(chains.map(el=>el.querySelectorAll('.dv-live-dep .dv-live-dep-key').map(k=>k.textContent)),[['GONE-1','BE-1','UX-1'],['HW-2','FW-1'],['OUT-9','FW-1']]);
 assert.deepEqual(chains[0].querySelectorAll('.dv-live-chain-holds').map(el=>el.textContent),['holds','holds']);
 assert.equal(body.querySelectorAll('.dv-live-blocker').length,1);assert.equal(body.querySelector('.dv-live-blocker').querySelector('a').textContent,'HW-2');
 // Linked in Jira as well: no hint. Clicking a Depends on button focuses the upstream row.
 const linked=depMap();linked['UX-1'].dependsOn=[{key:'BE-1',source:'jira',linkType:'is blocked by'}];api.apply(linked);assert.ok(body.querySelector('.dv-live-suggest')===null);
 let focused=null;row('HW-2').querySelector('a').focus=()=>focused='HW-2';row('FW-1').querySelector('.dv-live-dep').dispatchEvent({type:'click'});assert.equal(focused,'HW-2');
 api.destroy();
});
test('D8 without epics the summary box keeps the carrier ring and counts and the demo sample mentions the epic',()=>{
 const raw=depFixture();delete raw.page.tracking.jira.epic;const h=harness(raw),api=h.ctl.liveStatus;mountStatus(h);api.apply(depMap());
 const epic=h.view.querySelector('.dv-live-epic');assert.ok(epic);assert.ok(epic.querySelector('.dv-live-epic-key')===null);assert.ok(epic.querySelector('.dv-live-completion'));assert.equal(epic.querySelector('.dv-live-epic-counts').textContent,'1 blocked · 3 waiting');
 assert.equal(h.view.querySelector('.dv-live-epic-progress').textContent,'0 of 7 stories done · 5 of 7 on diagram');api.destroy();
 const d=h.C.PanelRegistry.get('live-status'),sample=h.C.panelPickerExample?h.C.panelPickerExample('live-status'):null;
 if(sample){const html=d.render({},sample.panel,sample.state,'pastel',sample.states,0,false).html;assert.match(html,/dv-live-epic/);assert.match(html,/Depends on/);assert.doesNotMatch(html,/dv-live-verdict/);}
});
test('D9 the Jira adapter requests issue links, reads inward and outward dependency types and seeds linked issues',async()=>{
 const C=providerContext();assert.equal(typeof C.liveStatusJiraDependencies,'function');
 const issue=jira('FW-1');issue.fields.issuelinks=[
  {type:{name:'Blocks',inward:'is blocked by',outward:'blocks'},inwardIssue:{key:'HW-2',fields:{summary:'Signal',status:{name:'Blocked',statusCategory:{key:'indeterminate'}}}}},
  {type:{name:'Dependency',inward:'is depended on by',outward:'depends on'},outwardIssue:{key:'OUT-9',fields:{summary:'Vendor driver',status:{name:'In Progress',statusCategory:{key:'indeterminate'}}}}},
  {type:{name:'Blocks',inward:'is blocked by',outward:'blocks'},outwardIssue:{key:'DOWN-1',fields:{summary:'Downstream',status:{statusCategory:{key:'new'}}}}},
  {type:{name:'Relates',inward:'relates to',outward:'relates to'},inwardIssue:{key:'REL-1',fields:{}}},{type:{name:'Blocks',inward:'is blocked by'}},null];
 assert.deepEqual(plain(C.liveStatusJiraDependencies(issue,['is blocked by','depends on'])).map(d=>[d.key,d.linkType]),[['HW-2','is blocked by'],['OUT-9','depends on']]);
 assert.deepEqual(plain(C.liveStatusJiraDependencies(issue,['relates to'])).map(d=>d.key),['REL-1']);assert.deepEqual(plain(C.liveStatusJiraDependencies({},['is blocked by'])),[]);
 const map=plain(C.liveStatusJiraMap(['FW-1'],[[issue]],new Set(),'https://jira.test',1793000000000,['is blocked by','depends on']));
 assert.deepEqual(map['FW-1'].dependsOn,[{key:'HW-2',source:'jira',linkType:'is blocked by'},{key:'OUT-9',source:'jira',linkType:'depends on'}]);
 assert.deepEqual(map['HW-2'],{state:'blocked',title:'Signal',url:'https://jira.test/browse/HW-2'});assert.deepEqual(map['OUT-9'],{state:'active',title:'Vendor driver',url:'https://jira.test/browse/OUT-9'});
 assert.equal(map['DOWN-1'],undefined);assert.equal(map['REL-1'],undefined);
 const child=jira('AA-1');child.fields.parent={key:'EP-1',fields:{summary:'Doorbell epic',status:{name:'In Progress',statusCategory:{key:'indeterminate'}},issuetype:{name:'Epic'}}};
 const seeded=plain(C.liveStatusJiraMap(['AA-1'],[[child]],new Set(),'https://jira.test',null));assert.deepEqual(seeded['EP-1'],{state:'active',kind:'epic',title:'Doorbell epic',url:'https://jira.test/browse/EP-1'},'the epic rides the child parent payload');
 const bare=jira('AA-1');bare.fields.parent={key:'EP-1',fields:{summary:'No status here'}};assert.equal(plain(C.liveStatusJiraMap(['AA-1'],[[bare]],new Set(),'',null))['EP-1'],undefined,'no status, no entry');
 const requested=plain(C.liveStatusJiraMap(['FW-1','HW-2'],[[issue,jira('HW-2','done')]],new Set(),'https://jira.test',null,['is blocked by']));assert.equal(requested['HW-2'].state,'done','a requested issue is never replaced by its link payload');
 assert.deepEqual(plain(C.liveStatusJiraMap(['FW-1'],[[issue]],new Set(),'',null))['FW-1'].dependsOn.map(d=>d.key),['HW-2','OUT-9'],'default link types');
 const h=providerHarness(depFixture());await h.start();for(const w of h.watches)assert.ok(w.input.fields.includes('issuelinks'),w.input.jql);
 h.data(0,[issue]);h.data(1,[]);hierarchyBranch(h,'EP-1',[]);assert.deepEqual(plain(h.ctl.liveStatus.state('FW-1').dependsOn).map(d=>d.key),['HW-2','OUT-9']);assert.equal(h.ctl.liveStatus.state('OUT-9').title,'Vendor driver');
 const custom=providerHarness((()=>{const raw=depFixture();raw.page.tracking.jira.dependencyLinks=['relates to'];return raw;})());await custom.start();custom.data(0,[issue]);custom.data(1,[]);hierarchyBranch(custom,'EP-1',[]);
 assert.deepEqual(plain(custom.ctl.liveStatus.state('FW-1').dependsOn).map(d=>d.key),['REL-1']);h.ctl.liveStatus.destroy();custom.ctl.liveStatus.destroy();
});
test('D10 the demo map converts timeline links into Jira-sourced dependencies',()=>{
 const C=storyContext();const map=plain(C.liveStatusDemoMap({issues:{'FW-46':{state:'todo',links:[{type:'is blocked by',key:'HW-124'},{type:'depends on',key:'FW-45'},{key:'bad'},null]},'HW-124':{state:'blocked'}}},['FW-46','HW-124']));
 assert.deepEqual(map['FW-46'].dependsOn,[{key:'HW-124',source:'jira',linkType:'is blocked by'},{key:'FW-45',source:'jira',linkType:'depends on'}]);assert.equal(map['HW-124'].dependsOn,undefined);
 const withEpic=plain(C.liveStatusDemoMap({issues:{'AA-1':{state:'active',epic:'EP-1'},'BB-1':{state:'todo',epic:'EP-1'}}},['AA-1'],{'EP-1':{summary:'Doorbell epic'}}));assert.deepEqual(withEpic['EP-1'],{state:'active',title:'Doorbell epic'});
 assert.deepEqual(plain(C.liveStatusDemoMap({issues:{'AA-1':{state:'done',epic:'EP-1'}}},[],{'EP-1':{}}))['EP-1'],{state:'done'});
 const timeline=JSON.parse(fs.readFileSync('examples/live-status/live-status.timeline.json','utf8')),spec=JSON.parse(fs.readFileSync('examples/live-status/live-status.spec.json','utf8'));
 assert.ok(timeline.days.every(day=>day.issues['FW-46'] && day.issues['FW-46'].links.some(l=>l.key==='HW-124' && l.type==='is blocked by')),'the demo keeps FW-46 blocked by HW-124');assert.equal(timeline.epics['DOOR-100'].summary,'Connected doorbell delivery');
 assert.deepEqual(spec.page.tracking.dependencies,[{ticket:'UX-89',on:'BE-68',reason:'needs the push payload contract'}]);
 assert.deepEqual(spec.page.sections[0].diagram.nodes.mcu.tickets,['FW-45','FW-46']);assert.deepEqual(spec.page.sections[0].diagram.edges[0].tickets,['HW-124']);
 // Day 4: HW-124 blocked holds FW-46 (red on the controller); Day 7: unblocked but unfinished (grey); Day 8: FW-46 active, clear.
 const h=harness(spec),api=h.ctl.liveStatus,mcu=h.view.querySelector('[data-dv-node="mcu"]');
 for(const [day,tone] of [[3,'red'],[6,'grey'],[7,null]]){api.apply(C.liveStatusDemoMap(timeline.days[day],api.refs().tickets));assert.equal(mcu.getAttribute('data-dv-live-waiting-tone'),tone,'day '+(day+1));}
 api.destroy();
});
test('D11 docs, skill, contract and native types describe dependencies and no longer describe edge-order propagation',()=>{
 const docs=fs.readFileSync('docs/live-status.md','utf8');assert.ok(docs.includes('## Dependencies'));assert.doesNotMatch(docs,/## Blocker propagation/);assert.match(docs,/tracking\.dependencies/);assert.match(docs,/dependencyLinks/);assert.match(docs,/Suggest link in Jira/);assert.doesNotMatch(docs,/along directed edges/);
 const skill=fs.readFileSync('.claude/skills/live-status-board/SKILL.md','utf8');assert.match(skill,/## .*Dependencies/);assert.doesNotMatch(skill,/delivery order/);assert.match(skill,/Never from arrows/);assert.match(skill,/tracking\.dependencies/);
 assert.match(fs.readFileSync('contract/authoring-contract.md','utf8'),/tracking\.dependencies/);assert.match(fs.readFileSync('contract/authoring-contract.md','utf8'),/dependencyLinks/);
 const types=fs.readFileSync('src/native/mount.d.ts','utf8');assert.match(types,/dependsOn\?: Array<\{key: string; source: 'jira' \| 'authored'; linkType\?: string; reason\?: string\}>/);
});
test('D12 the shared icon library offers the raised hand, alarm and check glyphs the panel uses',()=>{
 const C={};vm.runInNewContext(fs.readFileSync('src/icons/library.js','utf8'),C);
 assert.ok(C.FlowIcons.has('hand'));assert.ok(C.FlowIcons.has('alarm'));assert.ok(C.FlowIcons.has('check'));assert.equal(C.FlowIcons.registry.hand.legacy,false);assert.equal(C.FlowIcons.registry.check.tone,'green');assert.match(C.FlowIcons.render('hand',{monochrome:true}),/stroke="currentColor"/);assert.match(C.FlowIcons.render('check',{monochrome:true}),/stroke="currentColor"/);
});
test('S4 waiting preserves own state, supplies popover keys and clears on toggle/apply',()=>{
 const h=harness(fixture()),api=h.ctl.liveStatus;api.apply(fixed);const b=h.view.querySelector('[data-dv-node="b"]');
 assert.ok(b.classList.contains('dv-live-waiting'));assert.ok(b.classList.contains('dv-live-active'));assert.equal(b.getAttribute('data-dv-live-waiting-on'),'EE-1');
 const card=b.querySelector('.card');assert.match(card.getAttribute('aria-label'),/waiting on EE-1/);h.view.dispatchEvent({type:'click',target:card,button:0,preventDefault(){},stopPropagation(){}});
 assert.ok(h.view.querySelector('.dv-live-popover').querySelectorAll('div').some(el=>(el.textContent||'').includes('EE-1')));
 api.setEnabled(false);assert.equal(b.getAttribute('data-dv-live-waiting-on'),null);api.setEnabled(true);assert.ok(b.classList.contains('dv-live-waiting'));
 api.apply({'BB-1':{state:'done'},'BB-2':{state:'done'},'EE-1':{state:'blocked'}});assert.ok(!b.classList.contains('dv-live-waiting'));api.clear();assert.equal(h.view.querySelectorAll('.dv-live-waiting').length,0);
});
test('L1 waiting carriers carry no canvas text tag; the aria-label and popover keep the keys',()=>{
 const h=harness(fixture()),api=h.ctl.liveStatus;api.apply(fixed);const b=h.view.querySelector('[data-dv-node="b"]'),badge=b.querySelector('.card');
 assert.ok(b.classList.contains('dv-live-waiting'));assert.match(badge.getAttribute('aria-label'),/waiting on EE-1/);
 assert.equal(h.view.querySelectorAll('.dv-live-waiting-tag').length,0);
});
test('R1 R2 R3 apply paints no badges; ticketed cards and edge labels are popover buttons only outside authoring',()=>{
 const h=harness(fixture()),api=h.ctl.liveStatus;api.apply(fixed);
 assert.equal(h.view.querySelectorAll('.dv-live-badge').length,0);
 const card=h.view.querySelector('[data-dv-node="b"]').querySelector('.card');
 assert.equal(card.getAttribute('role'),'button');assert.equal(card.getAttribute('tabindex'),'0');assert.equal(card.getAttribute('aria-haspopup'),'dialog');assert.match(card.getAttribute('aria-label'),/^Live tickets for .*waiting on EE-1/);
 const label=h.view.querySelector('text.lbl[data-dv-edge="0"]');assert.equal(label.getAttribute('role'),'button');assert.equal(label.getAttribute('tabindex'),'0');
 api.setEnabled(false);assert.equal(card.getAttribute('tabindex'),'0');assert.equal(card.getAttribute('role'),'button');assert.doesNotMatch(card.getAttribute('aria-label'),/waiting on/);api.setEnabled(true);assert.equal(card.getAttribute('tabindex'),'0');
 const w=harness(fixture(),{},{authoring:true});w.ctl.liveStatus.apply(fixed);const wcard=w.view.querySelector('[data-dv-node="b"]').querySelector('.card');
 assert.ok(w.view.querySelector('[data-dv-node="b"]').classList.contains('dv-live-active'));assert.equal(wcard.getAttribute('tabindex'),null);assert.equal(wcard.getAttribute('role'),null);
 assert.equal(w.view.querySelectorAll('.dv-live-badge').length,0);
});
test('R1 edge lines halos and live break glyphs open their own tickets through one keyboard trigger and clean up',()=>{
 const data=fixture();data.page.sections[0].diagram.edges[0].label='handoff';
 const h=harness(data),api=h.ctl.liveStatus;
 const click=target=>h.view.dispatchEvent({type:'click',target,button:0,preventDefault(){},stopPropagation(){}});
 const line=h.view.querySelector('path.edge'),halo=h.view.querySelector('path.halo'),label=h.view.querySelector('text.lbl');
 api.apply(fixed);
 for(const target of [line,halo,h.view.querySelector('.dv-live-comm-failure .comm-segment'),h.view.querySelector('.dv-live-comm-failure circle')]){
  click(target);const pop=h.view.querySelector('.dv-live-popover');assert.equal(pop.hidden,false);assert.equal(pop.getAttribute('aria-label'),'Live tickets for handoff');
  assert.deepEqual(pop.querySelectorAll('a').map(el=>el.getAttribute('href')),['https://jira.test/browse/EE-1']);
  assert.equal(label.getAttribute('aria-expanded'),'true');h.doc.dispatchEvent({type:'keydown',key:'Escape',preventDefault(){},stopPropagation(){}});
 }
 assert.equal(line.getAttribute('tabindex'),null);assert.equal(halo.getAttribute('tabindex'),null);assert.equal(label.getAttribute('tabindex'),'0');
 api.setEnabled(false);assert.ok(h.view.querySelectorAll('.dv-live-pointer').length>0);click(line);assert.equal(h.view.querySelector('.dv-live-popover').hidden,false);h.doc.dispatchEvent({type:'keydown',key:'Escape',preventDefault(){},stopPropagation(){}});
 api.setEnabled(true);click(line);assert.equal(h.view.querySelector('.dv-live-popover').hidden,false);h.doc.dispatchEvent({type:'keydown',key:'Escape',preventDefault(){},stopPropagation(){}});
 api.clear();assert.equal(h.view.querySelectorAll('.dv-live-comm-failure').length,0);click(line);assert.equal(h.view.querySelector('.dv-live-popover').hidden,false);assert.equal(h.view.querySelector('.dv-live-ticket-state').textContent,'No status');h.doc.dispatchEvent({type:'keydown',key:'Escape',preventDefault(){},stopPropagation(){}});
 api.apply({'EE-1':{state:'done'}});h.ctl.sections[0].sectionEl.dispatchEvent({type:'dv:pathrender'});h.flush();click(line);assert.equal(h.view.querySelector('.dv-live-popover').hidden,false);
 api.destroy();assert.equal(h.view.querySelectorAll('.dv-live-pointer,.dv-live-target').length,0);
 const u=harness(data);u.view.querySelector('text.lbl').remove();u.ctl.liveStatus.apply({'EE-1':{state:'done'}});
 const path=u.view.querySelector('path.edge');assert.equal(path.getAttribute('tabindex'),'0');assert.equal(u.view.querySelector('path.halo').getAttribute('tabindex'),null);
 u.view.dispatchEvent({type:'click',target:path,button:0,preventDefault(){},stopPropagation(){}});assert.equal(u.view.querySelector('.dv-live-popover').hidden,false);u.doc.dispatchEvent({type:'keydown',key:'Escape',preventDefault(){},stopPropagation(){}});
 u.ctl.liveStatus.apply(fixed);const breakTarget=u.view.querySelector('.dv-live-comm-failure');assert.equal(path.getAttribute('tabindex'),null);assert.equal(breakTarget.getAttribute('tabindex'),'0');assert.equal(breakTarget.getAttribute('role'),'button');
 u.view.dispatchEvent({type:'keydown',target:breakTarget,key:'Enter',preventDefault(){},stopPropagation(){}});assert.equal(u.view.querySelector('.dv-live-popover').hidden,false);
 u.ctl.liveStatus.clear();assert.equal(u.view.querySelectorAll('.dv-live-comm-failure').length,0);assert.equal(path.getAttribute('tabindex'),'0');
 const w=harness(data,{},{authoring:true});w.ctl.liveStatus.apply(fixed);assert.equal(w.view.querySelectorAll('.dv-live-pointer').length,0);
 w.view.dispatchEvent({type:'click',target:w.view.querySelector('path.edge'),button:0,preventDefault(){assert.fail('authoring click prevented');},stopPropagation(){assert.fail('authoring click stopped');}});assert.equal(w.view.querySelector('.dv-live-popover'),null);
});
test('P1 P3 live nodes wear Node Styles presets and restore authored styles when cleared',()=>{
 const data=fixture();data.page.sections[0].diagram.nodes.a.style='teal';const h=harness(data),api=h.ctl.liveStatus;
 const a=h.view.querySelector('[data-dv-node="a"]');a.classList.add('node-styled','ns-teal');
 api.apply(fixed);const b=h.view.querySelector('[data-dv-node="b"]'),c=h.view.querySelector('[data-dv-node="c"]');
 assert.ok(a.classList.contains('ns-azure') && !a.classList.contains('ns-teal'));assert.ok(c.classList.contains('ns-rose') && c.classList.contains('node-styled'));
 assert.ok(b.classList.contains('dv-live-waiting') && b.classList.contains('ns-rose'),'red waiting on a blocked upstream wears rose');
 api.setEnabled(false);assert.ok(a.classList.contains('ns-teal') && a.classList.contains('node-styled') && !a.classList.contains('ns-azure'));assert.ok(!c.classList.contains('node-styled') && !c.classList.contains('ns-rose'));
 api.setEnabled(true);api.destroy();assert.ok(a.classList.contains('ns-teal') && !a.classList.contains('ns-azure'));assert.ok(!c.classList.contains('ns-rose'));
});
test('P4 shared status backing and text contrast are separated from provider state',()=>{
 const h=harness(),C=h.C;
 assert.deepEqual(plain(C.LIVE_STATUS_STATES),['todo','active','testing','done','blocked','missing']);
 for(const [value,map,want] of [[{}, {}, 'unchanged'],[{missingWork:true},{},'missing'],[{tickets:['AA-1']},{},null],[{tickets:['AA-1'],missingWork:true},{'AA-1':{state:'done'}},'missing'],[{tickets:['AA-1'],missingWork:true},{'AA-1':{state:'blocked'}},'blocked']])assert.equal(C.liveStatusPresentation(value,map,true),want);
 for(const [states,want] of [[['unchanged','done'],'done'],[['unchanged','todo'],'todo'],[['unchanged','unknown'],null],[['unchanged','unchanged'],'unchanged']])assert.equal(C.liveStatusPresentationRollup(states),want);
 h.ctl.liveStatus.destroy();
});
test('S2 S3 demo conversion maps metadata, PR case and missing requested keys',()=>{
 const C=storyContext();assert.equal(typeof C.liveStatusDemoMap,'function');
 const day={issues:{'AA-1':{state:'blocked',summary:'Signal',assignee:'Alex',updated:'2026-10-26',statusName:'Blocked',flagged:true,prs:{count:2,state:'OPEN'}},'BB-1':{state:'done',prs:{count:0,state:null}}}};
 const map=plain(C.liveStatusDemoMap(day,['AA-1','BB-1','CC-1']));assert.deepEqual(map['AA-1'],{state:'blocked',title:'Signal',assignee:'Alex',updatedAt:'2026-10-26',detail:'Blocked · flagged',prs:{count:2,state:'open'}});assert.deepEqual(map['CC-1'],{state:'missing'});assert.equal(map['BB-1'].prs,undefined);assert.equal(map['EX-1'],undefined);
});
test('S2 synthesized fallback uses only page tickets across four days',()=>{
 const C=storyContext();assert.equal(typeof C.liveStatusDemoTimeline,'function');const t=plain(C.liveStatusDemoTimeline(['AA-1','BB-1']));assert.equal(t.intervalSeconds,6);assert.equal(t.days.length,4);
 for(const day of t.days){assert.ok(day.label);assert.deepEqual(Object.keys(day.issues).sort(),['AA-1','BB-1']);}
 for(const [i,state] of [[0,'todo'],[1,'active'],[3,'done']])assert.ok(Object.values(t.days[i].issues).every(v=>v.state===state));assert.equal(Object.values(t.days[2].issues).filter(v=>v.state==='blocked').length,1);
});
test('S2 demo module is standalone-only and S7 documents story behavior',()=>{
 assert.ok(/function createLiveStatusDemo\(/.test(entrypoint('standalone').source),'standalone has demo provider');assert.doesNotMatch(entrypoint('workbench').source,/function createLiveStatusDemo\(/);
 const docs=fs.readFileSync('docs/live-status.md','utf8');for(const heading of ['Demo mode','Dependencies','Blocked edges'])assert.ok(docs.includes('## '+heading),heading);
});

/* Provider contract matrix (VM + the three browser cases):
 P1 standalone only, defensive async use, no refs/host provider => inert.
 P2 Jira categories, Flagged, all envelopes, Development, missing, URL, chunks.
 P3 preferred listed Atlassian server or add-connector note without calls.
 P4 resource host selection, five-minute cache, empty-site note.
 P5 two watches per ten keys, partial chunks, cache time and issue time distinct.
 P6 permission actions, clearing errors, bounded retries and user_changed.
 P7 destroy abandons calls and unsubscribes; disabled overlay keeps watches.
 P8 publication declaration in docs and publishing skill.
 P9 no claude => unchanged; no transport outside mcp. */
function providerContext(C={URL}){
 if(!C.liveStatusHistoryCall)vm.runInNewContext(fs.readFileSync('src/viewer/history.js','utf8'),C);
 const record=entrypoint('standalone').records.find(r=>r.file==='viewer/live-status-claude.js');
 if(record)vm.runInNewContext(record.source,C);
 return C;
}
const jira=(key,category='indeterminate',name='In Progress')=>({key,fields:{summary:'Work '+key,status:{name,statusCategory:{key:category}},assignee:{displayName:'Alex'},updated:'2026-10-20T09:00:00Z'}});
const settle=()=>new Promise(setImmediate);
function providerHarness(raw=fixture(),renderOptions={},autoParentMetadata=true){
 const h=harness(raw,{},renderOptions);providerContext(h.C);assert.equal(typeof h.C.wireLiveStatusClaude,'function');
 mountStatus(h);
 const watches=[],calls=[],servers=[{server:'Atlassian MCP',authStatus:'unknown',tools:[{name:'getAccessibleAtlassianResources'},{name:'searchJiraIssuesUsingJql'}]}];
 const mcp={listTools:()=>Promise.resolve(servers),callTool:(...args)=>{calls.push(plain(args));return Promise.resolve({payload:[{id:'cloud',url:'https://jira.test'}]});},
  watchTool:(server,tool,input,handler,opts)=>{const watch={server,tool,input:plain(input),handler,opts:plain(opts),stopped:0};watches.push(watch);
   // Existing epic fixtures answer the new parent metadata lookup synchronously.
   const roots=h.ctl.liveStatus.refs().epics || [],match=/^key in \(([^)]+)\)$/.exec(input.jql || '');
   if(autoParentMetadata && match && match[1].split(', ').every(key=>roots.includes(key)))handler({type:'data',result:{payload:{issues:match[1].split(', ').map(key=>Object.assign(jira(key),{fields:{...jira(key).fields,issuetype:{name:'Epic',hierarchyLevel:1}}}))}}});
   return ()=>watch.stopped++;}};
 h.win.claude={use:name=>Promise.resolve(name==='mcp'?mcp:null)};
 return Object.assign(h,{mcp,watches,calls,servers,start(){return h.C.wireLiveStatusClaude(h.ctl,h.ctl.page,h.win);},data(i,issues,at=1793000000000){watches[i].handler({type:'data',result:{payload:{issues:{nodes:issues}},cache:{storedAt:at}}});}});
}
test('P2 Jira status categories, unknown, blocked names and flagged sets',()=>{
 const C=providerContext();assert.equal(typeof C.liveStatusJiraState,'function');
 for(const [category,state] of [['new','todo'],['indeterminate','active'],['done','done'],['unknown','todo']])assert.equal(C.liveStatusJiraState(jira('AA-1',category),new Set()),state);
 assert.equal(C.liveStatusJiraState(jira('AA-1','done','BLOCKED by supplier'),new Set()),'blocked');
 assert.equal(C.liveStatusJiraState(jira('AA-1','done'),new Set(['AA-1'])),'blocked');assert.equal(C.liveStatusJiraState({},new Set()),'todo');
});
test('P2 Jira issue envelopes include nodes, array, single and empty',()=>{
 const C=providerContext();assert.equal(typeof C.liveStatusJiraIssues,'function');const issue=jira('AA-1');
 for(const payload of [{issues:{nodes:[issue]}},{issues:[issue]},{data:issue},[issue]])assert.deepEqual(plain(C.liveStatusJiraIssues(payload)),[issue]);
 for(const payload of [null,{},'bad',{data:[]},{issues:{}}])assert.deepEqual(plain(C.liveStatusJiraIssues(payload)),[]);
});
test('P2 Development parses display-name and customfield strings, tolerates garbled data',()=>{
 const C=providerContext();assert.equal(typeof C.liveStatusDevelopmentSummary,'function');
 const value='{pullrequest={state=OPEN}, json='+JSON.stringify({cachedValue:{summary:{pullrequest:{overall:{count:2,state:'OPEN'}}}}})+'}';
 for(const fields of [{customFields:{Development:value}},{customfield_10001:value},{customFields:{customfield_10001:value}}])assert.deepEqual(plain(C.liveStatusDevelopmentSummary(fields)),{count:2,state:'open'});
 assert.equal(C.liveStatusDevelopmentSummary({customFields:{Development:'json={bad}'}}),null);assert.equal(C.liveStatusDevelopmentSummary({}),null);assert.equal(C.liveStatusDevelopmentSummary(null),null);
});
test('P2 Jira map merges chunks, marks only requested missing keys and preserves issue timestamps',()=>{
 const C=providerContext();assert.equal(typeof C.liveStatusJiraMap,'function');
 const result=plain(C.liveStatusJiraMap(['AA-1','BB-1','CC-1'],[[jira('AA-1')],[jira('BB-1','done'),jira('EX-1')]],new Set(['BB-1']),'https://jira.test/',1793000000000));
 assert.deepEqual(Object.keys(result).sort(),['AA-1','BB-1','CC-1']);assert.equal(result['AA-1'].url,'https://jira.test/browse/AA-1');assert.equal(result['AA-1'].updatedAt,'2026-10-20T09:00:00Z');assert.equal(result['AA-1'].assignee,'Alex');assert.equal(result['BB-1'].state,'blocked');assert.equal(result['CC-1'].state,'missing');
});
/* Day reconstruction contract matrix (#929, PR 2 of 3). Source: issue behavior items 5-7 and Chuck's rulings of 2026-11-03.
| row | fixture | assertion (scoped) | rejects |
|---|---|---|---|
| R1 | open ticket, then all Done | first day is the oldest creation; last day is today while any ticket is open, else the day the last ticket reached Done | a range that always ends today |
| R2 | changes on two days | a day with no change keeps the previous day's status | filling gaps with today's status |
| R3 | change late on one local day and early the next | counted at the end of its own local day | UTC day boundaries |
| R4 | ticket created later | no status entry before its creation day | todo before creation |
| R5 | Flagged on and off; status name holding "block"; flagged today with no change | blocked follows today's rule on each day | ignoring Flagged history |
| R6 | ticket missing today, epic and initiative containers | last day equals the live map; container state rolls up per day; missing ticket has no past status | a last day that disagrees with the live board |
| R7 | REST, list and connection envelopes; item with no toString | parsed in order with status ids, other fields ignored, Object.prototype.toString never read as a value | reading a function as a status name |
| R8 | `issues.nodes`, `issues`, `data` and a plain top-level issue | the same issue from each | one reply shape only |
| R10 | a status renamed since the change | category comes from the status id | matching old names only |
| R9 | a range over a new year | labels carry the year | ambiguous dates |
*/
const historyAt=(y,m,d,h=12,min=0)=>new Date(y,m-1,d,h,min).getTime(),HISTORY_CATEGORIES={'to do':'new','in progress':'indeterminate','blocked':'indeterminate','done':'done'};
const historyChange=(at,from,to)=>({at,field:'status',from,to}),historyFlag=(at,from,to)=>({at,field:'flag',from,to});
const historyTicket=(key,created,status,changes=[],flagged=false)=>({key,created,status,flagged,changes});
function historyDays(C,tickets,today,now=historyAt(2026,10,24)){assert.equal(typeof C.liveStatusHistoryDays,'function','#929 day reconstruction exists');const value=C.liveStatusHistoryDays({tickets,today,categories:HISTORY_CATEGORIES,now,locale:'en-US'});return plain(value);}
const historyStates=(result,key)=>result.days.map(day=>day.states[key]?day.states[key].state:null);
test('R1 R2 R4 the range runs from the oldest creation to today, or to the last Done, and days carry forward',()=>{
 const C=providerContext(),open=historyDays(C,[historyTicket('AA-1',historyAt(2026,10,20),'In Progress',[historyChange(historyAt(2026,10,21),'To Do','In Progress')]),historyTicket('BB-1',historyAt(2026,10,22),'To Do')],{'AA-1':{state:'active'},'BB-1':{state:'todo'}});
 assert.deepEqual(open.days.map(day=>day.short),['Oct 20','Oct 21','Oct 22','Oct 23','Oct 24']);assert.equal(open.index,4);
 assert.deepEqual(historyStates(open,'AA-1'),['todo','active','active','active','active']);assert.deepEqual(historyStates(open,'BB-1'),[null,null,'todo','todo','todo']);
 const done=historyDays(C,[historyTicket('AA-1',historyAt(2026,10,20),'Done',[historyChange(historyAt(2026,10,21),'To Do','Done')]),historyTicket('BB-1',historyAt(2026,10,20),'Done',[historyChange(historyAt(2026,10,22),'To Do','In Progress'),historyChange(historyAt(2026,10,23),'In Progress','Done')])],{'AA-1':{state:'done'},'BB-1':{state:'done'}},historyAt(2026,11,3));
 assert.deepEqual(done.days.map(day=>day.short),['Oct 20','Oct 21','Oct 22','Oct 23'],'all Done: the range ends on the last Done day');assert.deepEqual(historyStates(done,'BB-1'),['todo','todo','active','done']);assert.equal(done.days.at(-1).label,'Oct 23');
});
test('R3 a change belongs to the end of its own local day',()=>{
 const C=providerContext(),result=historyDays(C,[historyTicket('AA-1',historyAt(2026,10,20,0,1),'Done',[historyChange(historyAt(2026,10,20,23,59),'To Do','In Progress'),historyChange(historyAt(2026,10,22,0,1),'In Progress','Done')])],{'AA-1':{state:'active'}},historyAt(2026,10,23));
 assert.deepEqual(historyStates(result,'AA-1').slice(0,3),['active','active','done']);
});
test('R5 blocked follows the status name and Flagged on each day',()=>{
 const C=providerContext(),result=historyDays(C,[
  historyTicket('AA-1',historyAt(2026,10,20),'In Progress',[historyChange(historyAt(2026,10,20),'To Do','In Progress'),historyFlag(historyAt(2026,10,21),'','Impediment'),historyFlag(historyAt(2026,10,23),'Impediment','')]),
  historyTicket('BB-1',historyAt(2026,10,20),'Done',[historyChange(historyAt(2026,10,21),'To Do','Blocked by supplier'),historyChange(historyAt(2026,10,22),'Blocked by supplier','Done')]),
  historyTicket('CC-1',historyAt(2026,10,20),'In Progress',[],true)],{'AA-1':{state:'active'},'BB-1':{state:'done'},'CC-1':{state:'blocked'}});
 assert.deepEqual(historyStates(result,'AA-1'),['active','blocked','blocked','active','active']);assert.deepEqual(historyStates(result,'BB-1'),['todo','blocked','done','done','done']);assert.deepEqual(historyStates(result,'CC-1'),['blocked','blocked','blocked','blocked','blocked']);
});
test('R6 the last day equals the live map, containers roll up and a missing ticket has no past status',()=>{
 const C=providerContext(),today={'IN-1':{state:'active',kind:'initiative'},'EP-1':{state:'active',kind:'epic',initiatives:['IN-1']},'AA-1':{state:'done',epic:'EP-1',initiatives:['IN-1']},'BB-1':{state:'active',epic:'EP-1',initiatives:['IN-1']},'GONE-1':{state:'missing',epic:'EP-1'}};
 const result=historyDays(C,[historyTicket('AA-1',historyAt(2026,10,20),'Done',[historyChange(historyAt(2026,10,23),'To Do','Done')]),historyTicket('BB-1',historyAt(2026,10,20),'In Progress',[historyChange(historyAt(2026,10,22),'To Do','In Progress')])],today);
 assert.deepEqual(historyStates(result,'EP-1'),['todo','todo','active','active','active']);assert.deepEqual(historyStates(result,'IN-1'),['todo','todo','active','active','active']);
 assert.deepEqual(historyStates(result,'GONE-1'),[null,null,null,null,'missing'],'item 7: no history, and today stays as today');
 assert.deepEqual(result.days.at(-1).states,{'IN-1':{state:'active'},'EP-1':{state:'active'},'AA-1':{state:'done'},'BB-1':{state:'active'},'GONE-1':{state:'missing'}});
 const empty=C.liveStatusHistoryDays({tickets:[],today:{},categories:{},now:historyAt(2026,10,24)});assert.equal(empty.days.length,0);
});
test('R7 changelog envelopes parse to ordered status and Flagged changes',()=>{
 const C=providerContext();assert.equal(typeof C.liveStatusHistoryChanges,'function');
 const entry={created:'2026-10-21T09:00:00.000+0000',items:[{field:'status',from:'10000',fromString:'To Do',to:'10001',toString:'In Progress'},{field:'assignee',fromString:'A',toString:'B'},{field:'Flagged',fromString:null,toString:'Impediment'},{field:'status'}]};
 for(const payload of [{values:[entry]},{histories:[entry]},{changelogs:[entry]},{nodes:[entry]},{data:{values:[entry]}},[entry]])assert.deepEqual(plain(C.liveStatusHistoryChanges(payload)),[{at:Date.parse('2026-10-21T09:00:00.000+0000'),field:'status',from:'To Do',to:'In Progress',fromId:'10000',toId:'10001'},{at:Date.parse('2026-10-21T09:00:00.000+0000'),field:'flag',from:'',to:'Impediment'}]);
 for(const payload of [null,{},'bad',{values:[{created:'not a time',items:[{field:'status',fromString:'a',toString:'b'}]}]},{values:[null]}])assert.deepEqual(plain(C.liveStatusHistoryChanges(payload)),[]);
});
test('R8 an issue reads from the connector shape and from a plain REST issue',()=>{
 const C=providerContext();assert.equal(typeof C.liveStatusHistoryIssue,'function','#1009 reads one issue from a getJiraIssue reply');const issue={key:'AA-1',fields:{created:'2026-10-20T12:00:00.000Z'},changelog:{histories:[]}};
 for(const payload of [{issues:{nodes:[issue]}},{issues:[issue]},{data:issue},issue])assert.deepEqual(plain(C.liveStatusHistoryIssue(payload)),issue);
 for(const payload of [null,{},'bad',{issues:{nodes:[]}}])assert.equal(C.liveStatusHistoryIssue(payload),null);
});
test('R10 a status id is read before its name, so a renamed status keeps its category',()=>{
 const C=providerContext(),day=date=>historyAt(2026,10,date),ids={'2':'indeterminate','3':'done'};assert.equal(typeof C.liveStatusHistoryDays,'function');
 const result=plain(C.liveStatusHistoryDays({tickets:[{key:'AA-1',created:day(20),status:'Shipped',statusId:'3',flagged:false,changes:[{at:day(21),field:'status',from:'Old name',to:'Shipped',fromId:'2',toId:'3'}]},{key:'BB-1',created:day(20),status:'Started',statusId:'2',flagged:false,changes:[]}],today:{'AA-1':{state:'done'},'BB-1':{state:'active'}},categories:{},statusIds:ids,now:day(23),locale:'en-US'}));
 assert.deepEqual(historyStates(result,'AA-1').slice(0,2),['active','done'],'Old name is unknown, but its id is not');assert.equal(historyStates(result,'BB-1')[0],'active','no change: the current status id');
});
test('R9 a range over a new year labels days with the year',()=>{
 const C=providerContext(),result=historyDays(C,[historyTicket('AA-1',historyAt(2026,12,31),'To Do')],{'AA-1':{state:'todo'}},historyAt(2027,1,1));assert.deepEqual(result.days.map(day=>day.short),['Dec 31, 2026','Jan 1, 2027']);
});
test('P2 chunks of 25 keys preserve order in three batches of at most ten',()=>{
 const C=providerContext();assert.equal(typeof C.liveStatusJiraChunks,'function');const keys=Array.from({length:25},(_,i)=>'AA-'+i);
 const chunks=plain(C.liveStatusJiraChunks(keys));assert.deepEqual(chunks.map(c=>c.length),[10,10,5]);assert.deepEqual(chunks.flat(),keys);assert.deepEqual(plain(C.liveStatusJiraChunks([])),[]);
});
test('P1 P9 provider is standalone only and inert without runtime, refs, namespace or with host provider',async()=>{
 assert.match(entrypoint('standalone').body,/function wireLiveStatusClaude\(/);
 for(const name of ['native','workbench','forge'])assert.doesNotMatch(entrypoint(name).body,/function wireLiveStatusClaude\(/);
 assert.match(fs.readFileSync('src/boot.flowview.js','utf8'),/wireArtifactComments\([^;\n]*\bview, window\);\s*\}?\s*(?:if[^\n]+)?wireLiveStatusClaude\(ctl, page, window\)/);
 const h=providerHarness(),wire=h.C.wireLiveStatusClaude;delete h.win.claude;assert.equal(wire(h.ctl,h.ctl.page,h.win),null);
 Object.defineProperty(h.win,'claude',{configurable:true,get(){throw Error('unavailable');}});assert.equal(wire(h.ctl,h.ctl.page,h.win),null);
 Object.defineProperty(h.win,'claude',{configurable:true,value:{use:()=>Promise.resolve(null)},writable:true});assert.equal(await h.start(),null);assert.equal(h.calls.length,0);assert.equal(h.view.querySelector('.dv-live-head').hidden,true);
 h.win.claude={use(){throw Error('should not be called');}};h.win.flowviewLiveStatus={};assert.equal(h.start(),null);delete h.win.flowviewLiveStatus;
 assert.equal(wire({},h.ctl.page,h.win),null);const empty=providerHarness({nodes:{a:{}}});empty.win.claude=h.win.claude;assert.equal(empty.start(),null);
});
test('P3 P4 connector preference, site host, resource cache and unavailable notes',async()=>{
 const h=providerHarness();h.servers.unshift({server:'Atlassian',tools:['getAccessibleAtlassianResources','searchJiraIssuesUsingJql']});
 h.mcp.callTool=(...args)=>{h.calls.push(plain(args));return Promise.resolve({payload:[{id:'wrong',url:'https://other.test'},{id:'right',url:'https://jira.test/path'}]});};
 await h.start();assert.equal(h.calls.length,1);assert.deepEqual(h.calls[0],['Atlassian MCP','getAccessibleAtlassianResources',{}, {cache:{staleTime:300000}}]);assert.equal(h.watches[0].input.cloudId,'right');
 const missing=providerHarness();missing.servers.length=0;await missing.start();assert.equal(missing.calls.length,0);assert.match(missing.view.querySelector('.dv-live-note').textContent,/Add the Atlassian connector/);
 const custom=providerHarness();custom.servers.length=0;custom.servers.push({server:'Mock-atlassian',tools:['getAccessibleAtlassianResources','searchJiraIssuesUsingJql']});
 await custom.start();assert.equal(custom.calls.length,1);assert.equal(custom.calls[0][0],'Mock-atlassian');assert.equal(custom.watches[0].server,'Mock-atlassian');
 const mixed=providerHarness();mixed.servers.length=0;mixed.servers.push({server:'Mock-atlassian',tools:['getAccessibleAtlassianResources','searchJiraIssuesUsingJql']},{name:'Atlassian',tools:[{name:'getAccessibleAtlassianResources'},{name:'searchJiraIssuesUsingJql'}]});
 await mixed.start();assert.equal(mixed.calls[0][0],'Atlassian');
 const partial=providerHarness();partial.servers.length=0;partial.servers.push({server:'Mock-atlassian',tools:['searchJiraIssuesUsingJql']},{server:'Other',tools:['getAccessibleAtlassianResources']},{server:'',tools:['getAccessibleAtlassianResources','searchJiraIssuesUsingJql']},{server:'NoTools'});
 await partial.start();assert.equal(partial.calls.length,0);assert.match(partial.view.querySelector('.dv-live-note').textContent,/Add the Atlassian connector/);
 const none=providerHarness();none.mcp.callTool=()=>Promise.resolve({payload:[]});await none.start();assert.equal(none.watches.length,0);assert.equal(none.view.querySelector('.dv-live-note').textContent,'No Atlassian site is available to this account.');
});
test('P5 P7 watches omit unanswered chunks, preserve cache age, pause applies and dispose',async()=>{
 const keys=Array.from({length:25},(_,i)=>'AA-'+i),h=providerHarness({nodes:{a:{tickets:keys}},rows:[['a']]});await h.start();assert.equal(h.watches.length,6);
 for(let i=0;i<6;i++){const w=h.watches[i];assert.equal(w.tool,'searchJiraIssuesUsingJql');assert.equal(w.input.maxResults,10);assert.deepEqual(w.input.fields,['summary','status','assignee','updated','issuelinks','parent','issuetype']);assert.deepEqual(w.opts,{refetchInterval:300000});assert.equal(w.input.jql,'key in ('+keys.slice(Math.floor(i/2)*10,Math.floor(i/2)*10+10).join(', ')+')'+(i%2?' AND Flagged = Impediment':''));}
 h.data(0,[jira('AA-0')]);assert.equal(h.ctl.liveStatus.state('AA-0').state,'active');assert.equal(h.ctl.liveStatus.state('AA-1').state,'missing');assert.equal(h.ctl.liveStatus.state('AA-10'),null);
 assert.equal(h.ctl.liveStatus.state('AA-0').updatedAt,'2026-10-20T09:00:00Z');assert.equal(h.ctl.liveStatus.snapshot().updatedAt,new Date(1793000000000).toISOString());assert.equal(h.view.querySelector('time'),null);
 h.data(1,[jira('AA-0')]);assert.equal(h.ctl.liveStatus.state('AA-0').state,'blocked');
 h.ctl.liveStatus.setEnabled(false);h.data(0,[jira('AA-0','done')]);h.data(1,[]);assert.equal(h.ctl.liveStatus.state('AA-0').state,'blocked');assert.ok(h.watches.every(w=>!w.stopped));
 h.ctl.liveStatus.setEnabled(true);assert.equal(h.ctl.liveStatus.state('AA-0').state,'done');h.ctl.liveStatus.destroy();assert.ok(h.watches.every(w=>w.stopped===1));h.data(0,[]);assert.equal(h.ctl.liveStatus.state('AA-0').state,'done');
});
test('P6 errors clear or retain evidence, approval calls once, retries are bounded',async()=>{
 for(const [code,message,kind] of [['needs_reauth','Reconnect Atlassian','error'],['server_not_connected','Add the Atlassian','info'],['selection_required','Add the Atlassian','info'],['not_in_manifest','This page is not allowed','warn'],['blocked_by_policy','This page is not allowed','warn']]){
  const h=providerHarness();await h.start();h.data(0,[jira('AA-1')]);h.watches[0].handler({type:'error',error:{code}});assert.equal(h.ctl.liveStatus.state('AA-1'),null);assert.ok(h.view.querySelector('.dv-live-note').textContent.startsWith(message));assert.equal(h.view.querySelector('.dv-live-note').getAttribute('data-kind'),kind);h.ctl.liveStatus.destroy();
 }
 for(const code of ['approval_required','consent_required']){
  const h=providerHarness();await h.start();let searches=0;h.mcp.callTool=()=>{searches++;return Promise.resolve({payload:{issues:[jira('AA-1')]}});};
  h.watches[0].handler({type:'error',error:{code}});const action=h.view.querySelector('.dv-live-action');assert.equal(action.textContent,'Allow Jira');action.dispatchEvent({type:'click'});action.dispatchEvent({type:'click'});await settle();assert.equal(searches,1);assert.equal(h.ctl.liveStatus.state('AA-1').state,'active');h.ctl.liveStatus.destroy();
 }
 for(const code of ['server_unavailable','upstream_error','rate_limited']){
  const h=providerHarness();await h.start();h.data(0,[jira('AA-1')]);let retries=0;h.mcp.callTool=()=>{retries++;return Promise.reject({code,retryable:true,retryAfterMs:1234});};
  h.watches[0].handler({type:'error',error:{code,retryable:true,retryAfterMs:1234}});assert.equal(h.ctl.liveStatus.state('AA-1').state,'active');assert.equal(h.timers.size,1);const timer=[...h.timers.values()][0];assert.equal(timer.ms,1234);h.timers.clear();timer.fn();await settle();assert.equal(retries,1);assert.equal(h.timers.size,0);h.ctl.liveStatus.destroy();
 }
 const h=providerHarness();await h.start();h.data(0,[jira('AA-1')]);h.watches[0].handler({type:'error',error:{code:'tool_error',message:'JQL unavailable'}});assert.equal(h.view.querySelector('.dv-live-note').textContent,'JQL unavailable');assert.equal(h.ctl.liveStatus.state('AA-1').state,'active');h.watches[0].handler({type:'error',error:{code:'unknown'}});assert.equal(h.timers.size,0);
 h.watches[0].handler({type:'error',error:{code:'user_changed'}});assert.ok(h.watches.every(w=>w.stopped===1));h.data(0,[jira('AA-1','done')]);assert.notEqual(h.ctl.liveStatus.state('AA-1')?.state,'done');
});
test('P7 destruction before namespace or resource resolution abandons late work',async()=>{
 for(const stage of ['namespace','resources']){
  const h=providerHarness();let resolve;
  if(stage==='namespace')h.win.claude.use=()=>new Promise(r=>resolve=r);else h.mcp.callTool=()=>new Promise(r=>resolve=r);
  const pending=h.start();await settle();h.ctl.liveStatus.destroy();resolve(stage==='namespace'?h.mcp:{payload:[{id:'cloud',url:'https://jira.test'}]});await pending;assert.equal(h.watches.length,0);assert.equal(h.view.querySelectorAll('.dv-live-toggle').filter(el=>!el.hidden).length,0);
 }
});
test('P8 publishing docs and skill declare the connector by its display name and comments',()=>{
 for(const file of ['docs/live-status.md','.claude/skills/hld-to-page/references/integrations.md']){
  const text=fs.readFileSync(file,'utf8');assert.match(text,/server: "Atlassian"/);assert.match(text,/"getAccessibleAtlassianResources", "searchJiraIssuesUsingJql", "getJiraIssue"\]/);assert.match(text,/comments: \{"composer_only": true, "customAnchors": true\}/);
  assert.match(text,/exact display name/);assert.doesNotMatch(text,/name it exactly \*\*Atlassian MCP\*\*/);
 }
 assert.match(fs.readFileSync('deploy/cloudflare/mock-atlassian-mcp/README.md','utf8'),/directory connector/);
 assert.match(fs.readFileSync('docs/tab-views.md','utf8'),/live-status.md#publishing-as-a-claudeai-artifact/);
 assert.match(fs.readFileSync('.claude/skills/live-status-board/SKILL.md','utf8'),/"searchJiraIssuesUsingJql", "getJiraIssue"\]/);
 const statusDocs=fs.readFileSync('docs/live-status.md','utf8');assert.ok(statusDocs.includes('\n## Over time\n'),'#929 docs section');const overTime=statusDocs.split('\n## Over time\n')[1].split('\n## ')[0];for(const claim of ['one batch','7 days','republish','one call per ticket','one per unknown status'])assert.ok(overTime.includes(claim),claim);assert.ok(!statusDocs.includes('listJiraIssueChangelogs'),'#1009 the page no longer uses that tool');
});

test('P6 P7 resource-call failures follow the same policy; toggles and late searches stay bounded',async()=>{
 const resources=providerHarness();resources.mcp.callTool=()=>Promise.reject({code:'needs_reauth'});await resources.start();assert.equal(resources.view.querySelector('.dv-live-note').textContent,'Reconnect Atlassian in claude.ai Settings → Connectors');assert.equal(resources.watches.length,0);
 const empty=providerHarness();let attempts=0;empty.mcp.callTool=()=>++attempts===1?Promise.reject({code:'rate_limited',retryAfterMs:10}):Promise.resolve({payload:[]});await empty.start();const retry=[...empty.timers.values()][0];empty.timers.clear();retry.fn();await settle();assert.equal(attempts,2);assert.equal(empty.view.querySelector('.dv-live-note').textContent,'No Atlassian site is available to this account.');assert.equal(empty.timers.size,0);
 const h=providerHarness();await h.start();h.data(0,[jira('AA-1')]);h.ctl.liveStatus.setEnabled(false);h.data(0,[jira('AA-1','done')]);assert.equal(h.ctl.liveStatus.state('AA-1').state,'active');assert.ok(h.watches.every(w=>w.stopped===0));h.ctl.liveStatus.setEnabled(true);assert.equal(h.ctl.liveStatus.state('AA-1').state,'done');
 let resolve;h.mcp.callTool=()=>new Promise(r=>resolve=r);h.watches[0].handler({type:'error',error:{code:'approval_required'}});h.view.querySelector('.dv-live-action').dispatchEvent({type:'click'});await settle();h.ctl.liveStatus.destroy();resolve({payload:{issues:[jira('AA-1')]}});await settle();assert.ok(h.watches.every(w=>w.stopped===1));assert.equal(h.ctl.liveStatus.state('AA-1').state,'done');assert.equal(h.timers.size,0);
});

test('P5 cache timestamps take precedence, validate, and reset without changing issue evidence',()=>{
 const h=harness(fixture()),api=h.ctl.liveStatus,events=[];
 mountStatus(h);api.onChange(value=>events.push(plain(value)));
 const issueTime='2026-10-26T12:00:00Z',entry={state:'active',updatedAt:issueTime};
 const applyCache=storedAt=>{const map={'AA-1':entry};Object.defineProperty(map,'storedAt',{value:storedAt});api.apply(map);};
 // Even an older cache timestamp, or epoch zero, describes lookup freshness.
 for(const stamp of [1793000000000,0]){
  applyCache(stamp);assert.equal(h.ctl.liveStatus.snapshot().updatedAt,new Date(stamp).toISOString());
  assert.equal(events.at(-1).updatedAt,new Date(stamp).toISOString());assert.deepEqual(events.at(-1).states,{'AA-1':entry});
  assert.equal(api.state('AA-1').updatedAt,issueTime);
 }
 for(const invalid of [undefined,null,'1793000000000',NaN,Infinity,1e20]){
  applyCache(1793000000000);applyCache(invalid);
  assert.equal(api.snapshot().updatedAt,issueTime);assert.equal(events.at(-1).updatedAt,issueTime);
 }
 applyCache(1793000000000);api.apply({'AA-1':entry});assert.equal(events.at(-1).updatedAt,issueTime);
 applyCache(1793000000000);api.clear();assert.equal(h.view.querySelector('time'),null);assert.equal(events.at(-1).updatedAt,null);
 api.apply({'AA-1':{state:'done'}});assert.equal(h.view.querySelector('time'),null);api.destroy();
});

/* Story panel contract matrix (desktop reader; authoring remains desktop-only):
 B1 per-step ticket references/team context: VM + browser; B2 caption: VM + browser;
 B3 shipped playback pause/focus: browser; B4 First blocker: browser;
 B5 diff/activity/cap/timestamps/pulse: VM + browser; B6 stale boundary/paint: VM;
 B7 primary-path readiness/ring/blockers/Escape: VM + browser;
 B8 built demo through final day: browser; B9 reduced motion/print/no refs: both;
 B10 Story mode and staleDays docs + validator: VM.
*/
const story=()=>JSON.parse(fs.readFileSync('examples/live-status/live-status.spec.json'));
test('B1 lanes deduplicate involved node and edge tickets and roll up worst state',()=>{
 const h=harness(story()),C=h.C,map=Object.fromEntries(h.ctl.liveStatus.refs().tickets.map(k=>[k,{state:'done'}]));
 assert.equal(typeof C.liveStatusLanes,'function','B1 lane helper');map['HW-124'].state='blocked';
 const lanes=plain(C.liveStatusLanes(h.ctl.page,map));
 assert.deepEqual(lanes.HW,{total:4,done:3,state:'blocked',keys:['HW-124','HW-123','FW-45','FW-46']});
 assert.deepEqual(lanes.APP,{total:1,done:1,state:'done',keys:['UX-89']});
 assert.equal(lanes.BE.total,3);assert.deepEqual(plain(C.liveStatusLanes({},map)),{});
});
function stepTicketControls(h,rec=h.ctl.sections[0]){
 let index=0,mode='step';rec.stepper={sourceIndex:()=>index,mode:()=>mode,path:()=> 'default'};
 const bar=rec.sectionEl.appendChild(new Element('div',{class:'termbar'}));
 const host=bar.appendChild(new Element('div',{class:'step-text'}));host.textContent='Authored prose';
 const pill=bar.appendChild(new Element('span',{class:'lanepill'}));
 function change(nextIndex=index,nextMode=mode,type='dv:stepchange'){index=nextIndex;mode=nextMode;rec.sectionEl.dispatchEvent({type});h.flush();}
 change();return {host,pill,change};
}
test('B1 step tickets use directly selected nodes and edges, excluding implicit failed-hop endpoints, deduplicated before evidence arrives',()=>{
 const raw={page:{tracking:{jira:{site:'https://jira.test/'}},lanes:{TEAM:{label:'One team'}},sections:[{diagram:{
  nodes:{a:{tickets:['AA-1','SH-1']},b:{tickets:['BB-1','SH-1']},c:{tickets:['CC-1']},text:{type:'text',text:'Note',tickets:['TT-1']}},
  panels:[{id:'status',type:'live-status'}],edges:[{from:'a',to:'b',tickets:['EE-1','SH-1']}],steps:[{id:'first',lane:'TEAM',nodes:['text'],failures:{'a->b':'dropped'},text:'Original first prose'},{id:'second',lane:'TEAM',nodes:['c'],text:'Original second prose'},{id:'none',text:'No tickets'}]
 }}]}};
 const before=JSON.stringify(raw),h=harness(raw),normalized=JSON.stringify(h.ctl.page),api=h.ctl.liveStatus,{host,pill,change}=stepTicketControls(h);
 const keys=()=>host.querySelectorAll('.dv-live-step-tickets .nbacklink').map(el=>el.textContent);
 assert.deepEqual(keys(),['EE-1','SH-1']);assert.equal(host.querySelectorAll('.dv-live-caption').length,0);
 assert.ok(pill.classList.contains('dv-live-board-lane'));assert.equal(pill.getAttribute('tabindex'),null);
 assert.deepEqual(host.querySelectorAll('.dv-live-step-state').map(el=>el.textContent),['No status','No status']);
 change(1,'step','dv:pathchange');assert.deepEqual(keys(),['CC-1']);change(0);assert.deepEqual(keys(),['EE-1','SH-1']);
 const row=host.querySelector('.dv-live-step-tickets'),first=row.querySelector('.nbacklink');
 assert.equal(first.getAttribute('href'),'https://jira.test/browse/EE-1');assert.equal(first.getAttribute('target'),'_blank');assert.equal(first.getAttribute('rel'),'noopener noreferrer');
 api.apply({'EE-1':{state:'blocked',url:'https://runtime.test/ignored'},'CC-1':{state:'done'},'EP-99':{state:'todo',epic:'EP-1',lane:'TEAM'}});
 assert.deepEqual(keys(),['EE-1','SH-1']);assert.ok(row===host.querySelector('.dv-live-step-tickets'),'unchanged references preserve the row and keyboard focus');
 assert.equal(host.querySelector('.dv-live-caption').textContent,'BLOCKED · EE-1');assert.equal(host.textContent,'Authored prose');
 assert.deepEqual(host.querySelectorAll('.dv-live-step-state').map(el=>el.textContent),['Blocked','No status']);
 api.apply({'EE-1':{state:'missing'},'SH-1':{state:'active'},'AA-1':{state:'done'},'BB-1':{state:'todo'}});
 assert.deepEqual(host.querySelectorAll('.dv-live-step-state').map(el=>el.textContent),['Missing','In progress']);
 assert.ok(first===row.querySelector('.nbacklink'),'state-only updates retain the ticket anchor');
 change(1,'step','dv:pathrender');assert.deepEqual(keys(),['CC-1']);assert.equal(host.querySelectorAll('.dv-live-step-tickets').length,1);
 change(2);assert.equal(host.querySelectorAll('.dv-live-step-tickets,.dv-live-caption').length,0);
 change(0);api.setEnabled(false);assert.equal(host.querySelectorAll('.dv-live-step-tickets,.dv-live-caption').length,0);assert.ok(pill.classList.contains('dv-live-board-lane'));
 api.setEnabled(true);assert.equal(keys().length,2);change(0,'ambient');assert.equal(keys().length,0);
 change(0,'step');api.destroy();assert.equal(keys().length,0);assert.ok(!pill.classList.contains('dv-live-board-lane'));assert.equal(host.textContent,'Authored prose');assert.equal(JSON.stringify(raw),before);assert.equal(JSON.stringify(h.ctl.page),normalized);
});
test('B1 step state and captions use direct carriers while broad aggregates retain endpoints',()=>{
 const {C}=harness(),d={nodes:{a:{tickets:['AA-1','SH-1']},b:{tickets:['BB-1','SH-1']},text:{type:'text',text:'Note',tickets:['TT-1']}},edges:[{from:'a',to:'b',tickets:['EE-1','SH-1']}]};
 for(const step of [{edge:'a->b'},{edges:['a->b']},{failures:{'a->b':'blocked'}},{failures:{'a->b':'dropped'}}]){
  assert.deepEqual(plain(C.liveStatusStepTickets(d,step,true)),['EE-1','SH-1']);
  assert.deepEqual(plain(C.liveStatusStepTickets(d,{...step,nodes:['a','a','text']},true)),['EE-1','SH-1','AA-1']);
  assert.deepEqual(plain(C.liveStatusStepTickets(d,step)),['EE-1','SH-1','AA-1','BB-1']);
  assert.deepEqual(plain(C.liveStatusStepCarriers(d,step).map(carrier=>carrier.id)),['a->b','a','b']);
  assert.equal(C.liveStatusStep(d,step,{'AA-1':{state:'blocked'},'EE-1':{state:'done'},'SH-1':{state:'done'}}),'done');
  assert.equal(C.liveStatusCaption(d,step,{'AA-1':{state:'blocked',detail:'Endpoint work'},'EE-1':{state:'todo'},'SH-1':{state:'todo'}}),'TODO · 2 tickets');
  assert.equal(C.liveStatusCaption(d,step,{'BB-1':{state:'missing'},'EE-1':{state:'done'},'SH-1':{state:'done'}}),'DONE');
  assert.equal(C.liveStatusStep(d,{...step,nodes:['a']},{'AA-1':{state:'blocked'},'EE-1':{state:'done'},'SH-1':{state:'done'}}),'blocked','an explicitly added endpoint participates');
  assert.equal(C.liveStatusCaption(d,{...step,nodes:['a']},{'AA-1':{state:'blocked',detail:'Endpoint work'},'EE-1':{state:'done'},'SH-1':{state:'done'}}),'BLOCKED · AA-1 · Endpoint work');
 }
 assert.deepEqual(plain(C.liveStatusStepTickets(d,{nodes:['a','text']},true)),['AA-1','SH-1']);
 assert.deepEqual(plain(C.liveStatusStepTickets(d,{nodes:['text']},true)),[]);
});
test('direct step rollups ignore prior beats and implicit endpoint gaps across edge aliases',()=>{
 const {C}=harness(),d={nodes:{a:{tickets:['AA-1']},b:{missingWork:true},c:{tickets:['CC-1']}},edges:[{from:'a',to:'b',tickets:['EE-1']},{from:'b',to:'c'}]},blocked={'AA-1':{state:'blocked'},'CC-1':{state:'missing'},'EE-1':{state:'done'}};
 const steps=[{nodes:['a']},{edge:'a->b'},{edges:['a->b']},{failures:{'a->b':'dropped'}},{edge:'b->c'},{nodes:['b'],edge:'a->b'}];
 for(const step of steps.slice(1,4)){
  assert.equal(C.liveStatusStep(d,step,blocked),'done','a previous blocked node and an implicit missing endpoint cannot contaminate a direct edge');
  assert.equal(C.liveStatusCaption(d,step,blocked),'DONE');
 }
 assert.equal(C.liveStatusStep(d,steps[4],blocked),'unchanged','an untracked edge does not inherit endpoint state');
 assert.equal(C.liveStatusCaption(d,steps[4],blocked),'NO CHANGE NEEDED');
 assert.equal(C.liveStatusStep(d,steps[5],blocked),'missing','explicitly adding the endpoint opts it in');
 assert.equal(C.liveStatusCaption(d,steps[5],blocked),'MISSING WORK · unlinked work remains');
 assert.equal(C.liveStatusStep(d,{edge:'a->b'},{'AA-1':{state:'blocked'}}),null,'the selected edge awaits its own evidence');
 assert.equal(C.liveStatusCaption(d,{edge:'a->b'},{'AA-1':{state:'blocked'}}),'AWAITING TICKET STATUS');
 assert.equal(C.liveStatusCaption(d,{edge:'a->b'},{'EE-1':{state:'todo'}},{'AA-1':{tone:'red',on:[{key:'UP-1'}]}}),'TODO · 1 tickets','an implicit endpoint cannot add a waiting suffix');
 assert.equal(C.liveStatusCaption(d,{edge:'a->b'},{'EE-1':{state:'todo'}},{'EE-1':{tone:'red',on:[{key:'UP-3'}]}}),'TODO · 1 tickets · waiting on UP-3');
 assert.equal(C.liveStatusStep(d,{nodes:['unknown']},blocked),null,'an empty direct set has no state');
 assert.equal(C.liveStatusCaption(d,{nodes:['unknown']},blocked),'');
});
test('B1 lane suppression belongs only to diagrams with an authored live-status panel',()=>{
 const diagram=panel=>({nodes:{a:{tickets:['AA-1']}},rows:[['a']],panels:panel?[{id:'status',type:'live-status'}]:[],steps:[{lane:'TEAM',nodes:['a']}]});
 const h=harness({page:{lanes:{TEAM:{label:'Authored team'}},sections:[{id:'board',diagram:diagram(true)},{id:'ordinary',diagram:diagram(false)}]}});
 const board=stepTicketControls(h,h.ctl.sections[0]),ordinary=stepTicketControls(h,h.ctl.sections[1]);
 for(const enabled of [true,false,true]){
  h.ctl.liveStatus.setEnabled(enabled);assert.ok(board.pill.classList.contains('dv-live-board-lane'));assert.ok(!ordinary.pill.classList.contains('dv-live-board-lane'));assert.equal(ordinary.pill.textContent,'Authored team');
 }
 board.change(0,'ambient');assert.ok(board.pill.classList.contains('dv-live-board-lane'));h.ctl.liveStatus.destroy();
 assert.ok(!board.pill.classList.contains('dv-live-board-lane'));assert.equal(ordinary.pill.textContent,'Authored team');
});
test('B1 step ticket titles arrive, update and disappear without replacing links or authored prose',()=>{
 const h=harness({page:{tracking:{jira:{site:'https://jira.test/'}},sections:[{diagram:{nodes:{a:{tickets:['AA-1','BB-1']}},rows:[['a']],steps:[{nodes:['a']}]}}]}});
 const {host}=stepTicketControls(h),api=h.ctl.liveStatus,row=host.querySelector('.dv-live-step-tickets'),anchor=row.querySelector('a');
 const titles=()=>host.querySelectorAll('.dv-live-step-title').map(el=>el.textContent);
 assert.deepEqual(titles(),[],'pending evidence has no placeholder titles');
 api.apply({'AA-1':{state:'active',title:'  Repair <strong>doorbell</strong> & delivery  '},'BB-1':{state:'todo',title:' \t '}});
 assert.deepEqual(titles(),['Repair <strong>doorbell</strong> & delivery']);assert.equal(row.querySelectorAll('strong').length,0);
 const title=row.querySelector('.dv-live-step-title');assert.equal(title.getAttribute('title'),'Repair <strong>doorbell</strong> & delivery');assert.equal(row.children[0].children[1],title);assert.equal(row.children[0].children[2].textContent,'In progress');
 api.apply({'AA-1':{state:'active',title:'Updated ticket name'},'BB-1':{state:'todo'}});
 assert.deepEqual(titles(),['Updated ticket name']);assert.equal(title.getAttribute('title'),'Updated ticket name');assert.equal(row.querySelector('.dv-live-step-title'),title);assert.equal(row.querySelector('a'),anchor);
 api.apply({'AA-1':{state:'active'},'BB-1':{state:'todo',title:'Second ticket name'}});
 assert.deepEqual(titles(),['Second ticket name']);assert.equal(row.querySelector('a'),anchor);
 api.clear();assert.deepEqual(titles(),[]);assert.equal(host.querySelector('.dv-live-step-tickets'),row);assert.equal(row.querySelector('a'),anchor);assert.equal(host.textContent,'Authored prose');
 api.destroy();
});
test('B1 ticket URLs refresh safely and authored plain keys survive absent runtime URLs',()=>{
 const h=harness({nodes:{a:{tickets:['AA-1','BB-1']}},rows:[['a']],steps:[{nodes:['a']}]});
 const {host}=stepTicketControls(h),api=h.ctl.liveStatus;
 assert.deepEqual(host.querySelectorAll('.nbacklink').map(el=>el.textContent),['AA-1','BB-1']);
 api.apply({'AA-1':{state:'todo',url:'https://runtime.test/AA-1'},'BB-1':{state:'todo',url:'javascript:alert(1)'}});
 assert.equal(host.querySelector('a').getAttribute('href'),'https://runtime.test/AA-1');assert.equal(host.querySelectorAll('a').length,1);
 api.apply({'AA-1':{state:'active',url:'https://updated.test/AA-1'}});assert.equal(host.querySelector('a').getAttribute('href'),'https://updated.test/AA-1');
 api.clear();assert.equal(host.querySelectorAll('a').length,0);assert.equal(host.querySelectorAll('.dv-live-step-tickets').length,1);assert.deepEqual(host.querySelectorAll('.dv-live-step-state').map(el=>el.textContent),['No status','No status']);
 api.destroy();assert.equal(host.querySelectorAll('.dv-live-step-tickets').length,0);
 const pending=harness({nodes:{a:{tickets:['AA-1']}},rows:[['a']],steps:[{nodes:['a']}]});const controls=stepTicketControls(pending);
 pending.ctl.liveStatus.destroy();assert.equal(controls.host.querySelectorAll('.dv-live-step-tickets').length,0,'teardown before any provider map');
});
test('B1 external detail step links use the detail page Jira site',async()=>{
 const h=await externalStoryHarness(),api=h.ctl.liveStatus;
 const {host}=stepTicketControls(h,h.childRec);
 // The approved external page owns the site; the root has none.
 api.apply({'DD-1':{state:'todo',url:'https://detail-runtime.test/DD-1'}});
 assert.equal(host.querySelector('a').getAttribute('href'),'https://detail-jira.test/browse/DD-3');
 assert.deepEqual(host.querySelectorAll('.nbacklink').map(el=>el.textContent),['DD-3']);api.destroy();
});
test('B2 caption distinguishes blocked missing active done todo and untracked steps',()=>{
 const {C}=harness();assert.equal(typeof C.liveStatusCaption,'function','B2 caption helper');
 const d={nodes:{a:{tickets:['AA-1']},b:{tickets:['BB-1']}},edges:[{from:'a',to:'b',tickets:['EE-1']} ]},step={edge:'a->b'};
 assert.equal(C.liveStatusCaption(d,step,{'EE-1':{state:'blocked',detail:'waiting on bench'}}),'BLOCKED · EE-1 · waiting on bench');
 assert.equal(C.liveStatusCaption(d,{nodes:['a']},{'AA-1':{state:'missing'}}),'MISSING · AA-1');
 assert.equal(C.liveStatusCaption(d,step,{'AA-1':{state:'active'},'BB-1':{state:'todo'}}),'AWAITING TICKET STATUS');
 assert.equal(C.liveStatusCaption(d,{nodes:['a']},{'AA-1':{state:'done'}}),'DONE');
 assert.equal(C.liveStatusCaption(d,{nodes:['a']},{'AA-1':{state:'todo'}}),'TODO · 1 tickets');
 assert.equal(C.liveStatusCaption(d,{nodes:['unknown']},{}),'');
});
test('B6 stale is strictly older than threshold, active only, and needs a timestamp',()=>{
 const {C}=harness();assert.equal(typeof C.liveStatusStale,'function','B6 stale helper');
 const now=Date.parse('2026-10-26T00:00:00Z'),entry={state:'active',updatedAt:'2026-10-19T00:00:00Z'};
 assert.equal(C.liveStatusStale(entry,now,7),false);assert.equal(C.liveStatusStale(entry,now+1,7),true);
 assert.equal(C.liveStatusStale(entry,now+1),true);assert.equal(C.liveStatusStale({state:'active'},now,7),false);
 assert.equal(C.liveStatusStale({...entry,state:'done'},now+1,7),false);
 assert.equal(C.liveStatusStale({...entry,updatedAt:'invalid'},now,7),false);
});
test('B5 first apply logs nothing; changed states pulse once and activity preserves evidence time and caps at 20',()=>{
 const h=harness(fixture()),api=h.ctl.liveStatus;mountStatus(h);api.apply({'AA-1':{state:'todo'}});
 assert.ok(h.view.querySelector('.dv-live-panel-body'),'B7 authored panel body');
 assert.equal(h.view.querySelectorAll('.dv-live-activity-entry').length,0);
 const storedAt=Date.parse('2020-01-01T00:00:00Z');api.apply({'AA-1':{state:'active'},storedAt});
 let rows=h.view.querySelectorAll('.dv-live-activity-entry');assert.equal(rows.length,1);assert.match(rows[0].textContent,/AA-1 · todo → active · \d+d ago/);assert.equal(rows[0].getAttribute('data-updated-at'),new Date(storedAt).toISOString());
 const carrier=h.view.querySelector('[data-dv-node="a"]');assert.ok(carrier.classList.contains('dv-live-changed'));carrier.dispatchEvent({type:'animationend'});assert.ok(!carrier.classList.contains('dv-live-changed'));
 api.apply({'AA-1':{state:'active'},storedAt});assert.equal(h.view.querySelectorAll('.dv-live-activity-entry').length,1);assert.ok(!carrier.classList.contains('dv-live-changed'));
 for(let i=0;i<25;i++)api.apply({'AA-1':{state:i%2?'active':'done',updatedAt:'2021-01-01T00:00:00Z'},storedAt});
 rows=h.view.querySelectorAll('.dv-live-activity-entry');assert.equal(rows.length,20);assert.equal(rows[0].getAttribute('data-updated-at'),'2021-01-01T00:00:00.000Z');
 api.destroy();assert.equal(h.view.querySelectorAll('.dv-live-panel').length,0);
});
test('B6 B9 stale decorates carriers without changing rollup and reduced motion suppresses change pulses',()=>{
 const h=harness(fixture()),api=h.ctl.liveStatus;h.win.matchMedia=()=>({matches:true});
 api.apply({'AA-1':{state:'active',updatedAt:'2000-01-01T00:00:00Z'}});
 const node=h.view.querySelector('[data-dv-node="a"]');assert.ok(node.classList.contains('dv-live-stale'),'B6 stale carrier');assert.ok(node.classList.contains('dv-live-active'));
 h.view.dispatchEvent({type:'click',target:node.querySelector('.card'),button:0,preventDefault(){},stopPropagation(){}});
 assert.ok(h.view.querySelector('.dv-live-stale-detail'));api.apply({'AA-1':{state:'done'}});assert.ok(!node.classList.contains('dv-live-stale'));assert.ok(!node.classList.contains('dv-live-changed'));
 api.clear();assert.equal(h.view.querySelectorAll('.dv-live-stale').length,0);
});
test('B7 readiness uses every tracked carrier on primary path, ignoring alternate-only work',()=>{
 const {C}=harness();assert.equal(typeof C.liveStatusReadiness,'function','B7 readiness helper');
 const page={sections:[{diagram:{nodes:{a:{tickets:['AA-1']},b:{tickets:['BB-1']}},edges:[],steps:[{id:'main',nodes:['a']},{id:'alt',nodes:['b']}],paths:[{id:'primary',steps:['main']},{id:'alternate',steps:['alt']}]}}]};
 let result=C.liveStatusReadiness(page,{'AA-1':{state:'done'},'BB-1':{state:'todo'}});assert.equal(result.ready,true);assert.equal(result.total,2);assert.equal(result.done,1);
 assert.equal(C.liveStatusReadiness(page,{'BB-1':{state:'done'}}).ready,false);
 delete page.sections[0].diagram.paths;assert.equal(C.liveStatusReadiness(page,{'AA-1':{state:'done'},'BB-1':{state:'todo'}}).ready,false);
});
test('B10 validator warns for non-positive staleDays and Story mode documents the public contract',()=>{
 const {C}=harness(),raw=story();raw.page.tracking.staleDays=0;
 assert.ok(C.validate(C.normalize(raw)).warnings.some(w=>/tracking.staleDays/.test(w)),'B10 zero staleDays warning');
 raw.page.tracking.staleDays=3;assert.ok(!C.validate(C.normalize(raw)).warnings.some(w=>/tracking.staleDays/.test(w)));
 const doc=fs.readFileSync('docs/live-status.md','utf8');assert.match(doc,/## Story mode/);assert.match(doc,/onBeforeAdvance/);assert.match(doc,/staleDays/);assert.match(fs.readFileSync('contract/authoring-contract.md','utf8'),/tracking\.staleDays/);
});

test('B5 status updates never scale or move the positioned node or text',()=>{
 const h=harness(fixture()),api=h.ctl.liveStatus,node=h.view.querySelector('g.node[data-dv-node="a"]');
 node.setAttribute('transform','translate(320 180)');api.apply({'AA-1':{state:'todo'}});api.apply({'AA-1':{state:'active'}});
 assert.ok(node.matches('.node.dv-live-changed'));
 assert.ok(node.querySelector('.card'),'the changed carrier owns the CSS pulse target');
 const css=fs.readFileSync('src/style.core.css','utf8');
 assert.doesNotMatch(css,/\.node\.dv-live-changed \.card,\s*path\.edge\.dv-live-changed\{[^}]*animation:dvnodepulse/);
 assert.doesNotMatch(css,/\.node\.dv-live-changed\s*[,\{]/);
 assert.equal(node.getAttribute('transform'),'translate(320 180)');
 node.dispatchEvent({type:'animationend',target:node.querySelector('.card'),animationName:'dvnodepulse'});
 assert.ok(!node.classList.contains('dv-live-changed'),'card animation completion clears the carrier class');api.destroy();
});

async function externalStoryHarness(rootLanes){
 const detail={page:{tracking:{staleDays:2,jira:{site:'https://detail-jira.test/'}},lanes:{TEAM:{label:'Detail team'}},sections:[{id:'detail',diagram:{
  nodes:{child:{tickets:['DD-1']},end:{tickets:['DD-2']}},rows:[['child','end']],edges:[{from:'child',to:'end',tickets:['DD-3']}],steps:[{id:'detail-step',lane:'TEAM',edge:'child->end'}]
 }}]}};
 const root={page:{lanes:rootLanes,sections:[{id:'main',diagram:{nodes:{parent:{tickets:['RR-1'],detail:{spec:'remote-story'}}},rows:[['parent']],steps:[{id:'root-step',lane:'TEAM',nodes:['parent']}]}}]}};
 const renderOptions={loadDetail:()=>Promise.resolve(detail)},h=harness(root,{},renderOptions),child=harness(detail);
 child.ctl.liveStatus.destroy();const rootRec=h.ctl.sections[0],childRec=child.ctl.sections[0];h.view.appendChild(childRec.sectionEl);
 for(const rec of [rootRec,childRec]){rec.stepper={sourceIndex:()=>0,mode:()=> 'ambient',path:()=> 'default'};rec.sectionEl.appendChild(new Element('span',{class:'lanepill'}));}
 h.ctl.details={snapshot:()=>({section:'main',frames:[{node:'parent'}]}),activeSections:()=>[rootRec,childRec]};
 await renderOptions.loadDetail({spec:'remote-story'},new AbortController().signal);h.flush();
 return {...h,rootRec,childRec};
}
test('B1 external detail team pills retain their page context without lane-wide progress',async()=>{
 for(const lanes of [undefined,{TEAM:{label:'Root team'}}]){
  const h=await externalStoryHarness(lanes),api=h.ctl.liveStatus;
  mountStatus(h);api.apply({'RR-1':{state:'done'},'DD-1':{state:'blocked'},'DD-2':{state:'done'},'DD-3':{state:'active'}});
  const pill=h.childRec.sectionEl.querySelector('.lanepill');
  assert.equal(pill.textContent,'Detail team');assert.doesNotMatch(pill.className,/dv-live-/);
  assert.equal(pill.getAttribute('title'),null);assert.equal(pill.getAttribute('tabindex'),null);
  assert.ok(h.view.querySelector('.dv-live-panel-body'));
  assert.equal(h.view.querySelectorAll('.dv-live-lane').length,0);
  assert.equal(h.view.querySelector('.dv-live-blocker-lanes').textContent,'Detail team');
  if(lanes)assert.equal(h.rootRec.sectionEl.querySelector('.lanepill').textContent,'Root team');
  api.setEnabled(false);assert.equal(pill.textContent,'Detail team');api.destroy();
 }
});
test('B6 external detail staleDays applies to its nodes edges badges and popovers independently of root default',async()=>{
 const h=await externalStoryHarness(),api=h.ctl.liveStatus,entry={state:'active',updatedAt:new Date(Date.now()-3*86400000).toISOString()};
 api.apply({'RR-1':entry,'DD-1':entry,'DD-3':entry});
 const parent=h.rootRec.sectionEl.querySelector('g.node'),child=h.childRec.sectionEl.querySelector('g.node[data-dv-node="child"]'),edge=h.childRec.sectionEl.querySelector('path.edge');
 for(const carrier of [child,edge]){assert.ok(carrier.classList.contains('dv-live-stale'));assert.ok(carrier.classList.contains('dv-live-active'));}
 assert.ok(!parent.classList.contains('dv-live-stale'));assert.ok(parent.classList.contains('dv-live-active'));
 for(const target of [child.querySelector('.card'),h.childRec.sectionEl.querySelector('text.lbl[data-dv-edge="0"]')]){
  assert.ok(target.classList.contains('dv-live-target'));h.view.dispatchEvent({type:'click',target:target,button:0,preventDefault(){},stopPropagation(){}});
  assert.equal(h.view.querySelector('.dv-live-stale-detail').textContent,'no activity 3 d');
 }
 const rootCard=parent.querySelector('.card');assert.ok(rootCard.classList.contains('dv-live-target'));
 h.view.dispatchEvent({type:'click',target:rootCard,button:0,preventDefault(){},stopPropagation(){}});assert.equal(h.view.querySelector('.dv-live-stale-detail'),null);
 api.clear();assert.equal(h.view.querySelectorAll('.dv-live-stale').length,0);api.destroy();
});

/* E1–E11 epic contract. Existing assertions above retain carrier-only scope;
   extra-key inclusion supersedes the old demo's EX-1 omission fixture. */
const epicFixture=()=>({page:{tracking:{jira:{site:'https://jira.test',epic:['EP-1','EP-2']}},lanes:{APP:{label:'App',color:'#34d399'}},sections:[{id:'main',diagram:{nodes:{a:{title:'Client',tickets:['AA-1'],prs:['https://code.test/pull/1']},b:{title:'Service',tickets:['BB-1','CC-1','DD-1','EE-1','FF-1']}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'Call',tickets:['AA-1'],prs:['https://code.test/pull/2']}],steps:[{id:'one',edge:'a->b',lane:'APP'}]}}]}});
const textOf=el=>(el.textContent||'')+el.children.map(textOf).join(' ');
test('E1 epic parser deduplicates ordered keys and validator warns per invalid entry without errors',()=>{
 const {C}=harness();assert.equal(typeof C.trackingEpics,'function');
 for(const [value,want,warnings] of [['EP-1',['EP-1'],0],[['EP-2','EP-1','EP-2','bad',null],['EP-2','EP-1'],2],[{},[],1],[null,[],1],[17,[],1],['bad',[],1]]){
  const raw=epicFixture();raw.page.tracking.jira.epic=value;const before=JSON.stringify(raw);
  assert.deepEqual(plain(C.trackingEpics(raw.page)),want);const result=C.validate(C.normalize(raw));
  assert.deepEqual(plain(result.errors),[]);assert.equal(result.warnings.filter(w=>/tracking.jira.epic/.test(w)).length,warnings);assert.equal(JSON.stringify(raw),before);
 }
 assert.deepEqual(plain(C.trackingEpics({})),[]);
});
test('E2 refs include root and loaded detail epics and coverage leaves carrier rollups unchanged',async()=>{
 const renderOptions={loadDetail:()=>Promise.resolve({page:{tracking:{jira:{epic:['EP-2','EP-3']}},sections:[{diagram:{nodes:{child:{tickets:['ZZ-1']}},rows:[['child']]}}]}})};
 const h=harness(epicFixture(),{},renderOptions),api=h.ctl.liveStatus,C=h.C;
 assert.ok(Array.isArray(api.refs().epics),'epics array');assert.deepEqual(plain(api.refs().epics),['EP-1','EP-2']);await renderOptions.loadDetail({spec:'detail'},new AbortController().signal);
 assert.deepEqual(plain(api.refs().epics),['EP-1','EP-2','EP-3']);assert.equal(typeof C.liveStatusCoverage,'function');
 const map={'AA-1':{state:'done',epic:'EP-1'},'BB-1':{state:'todo',epic:'OTHER-1'},'EX-1':{state:'blocked',epic:'EP-2'},'EX-2':{state:'active',epic:'EP-3'},'NO-1':{state:'done',epic:'OTHER-1'}};
 api.apply(map);assert.equal(api.state('EX-1').epic,'EP-2');
 assert.deepEqual(plain(C.liveStatusCoverage(h.ctl.page,map,api.refs())),{epics:['EP-1','EP-2','EP-3'],onDiagram:['AA-1','BB-1','CC-1','DD-1','EE-1','FF-1','ZZ-1'],notOnDiagram:['EX-1','EX-2'],notInEpic:['BB-1','CC-1','DD-1','EE-1','FF-1','ZZ-1'],excluded:[]});
 assert.deepEqual(plain(C.liveStatusCoverage({},map,{tickets:['AA-1'],epics:[]})).notInEpic,[]);
 assert.ok(h.view.querySelector('g.node[data-dv-node="a"]').classList.contains('dv-live-done'));assert.equal(C.liveStatusCarrier({tickets:['AA-1']},map),'done');api.destroy();
});
test('E3 epic watches paginate both cursor envelopes tag children and keep evidence on errors',async()=>{
 const h=providerHarness(epicFixture());await h.start();
 const epic=h.watches.find(w=>w.input.jql==='parent = EP-1'),flag=h.watches.find(w=>w.input.jql==='parent = EP-1 AND Flagged = Impediment');
 assert.ok(epic,'one epic watch');assert.ok(flag,'paired flagged watch');assert.equal(h.watches.filter(w=>/^parent =/.test(w.input.jql)).length,4);
 assert.deepEqual(epic.input.fields,['summary','status','assignee','updated','issuelinks','parent','issuetype']);assert.equal(epic.input.maxResults,10);
 h.data(0,[jira('AA-1')]);h.data(1,[]);hierarchyBranch(h,'EP-2',[]);hierarchyData(h,'parent = EP-1 AND Flagged = Impediment',[]);const calls=[];
 h.mcp.callTool=async(server,tool,input)=>{calls.push(plain(input));return input.nextPageToken==='two'?{payload:{issues:[jira('EX-2')],nextPageToken:'three'}}:{payload:{issues:[jira('EX-3')]}};};
 epic.handler({type:'data',result:{payload:{issues:{nodes:[jira('AA-1'),jira('EX-1')]},pageInfo:{hasNextPage:true,endCursor:'two'}}}});await settle();await settle();
 assert.deepEqual(calls.map(c=>c.nextPageToken),['two','three']);assert.ok(calls.every(c=>c.jql==='parent = EP-1' && c.maxResults===10));
 for(const key of ['AA-1','EX-1','EX-2','EX-3'])assert.equal(h.ctl.liveStatus.state(key).epic,'EP-1');
 flag.handler({type:'data',result:{payload:{issues:[jira('EX-3')]}}});assert.equal(h.ctl.liveStatus.state('EX-3').state,'blocked');
 for(const code of ['tool_error','rate_limited','needs_reauth']){epic.handler({type:'error',error:{code,retryable:true}});assert.equal(h.ctl.liveStatus.state('AA-1').state,'active');assert.equal(h.ctl.liveStatus.state('EX-3').state,'blocked');}
 h.ctl.liveStatus.destroy();assert.ok(h.watches.every(w=>w.stopped===1));
});
test('E4 demo includes extra keys and epic metadata while missing requested keys stay missing',()=>{
 const C=storyContext(),map=plain(C.liveStatusDemoMap({issues:{'AA-1':{state:'done',epic:'EP-1'},'EX-1':{state:'active',epic:'EP-1',lane:'APP'}}},['AA-1','MISS-1']));
 assert.deepEqual(map['EX-1'],{state:'active',epic:'EP-1',lane:'APP'});assert.equal(map['AA-1'].epic,'EP-1');assert.deepEqual(map['MISS-1'],{state:'missing'});
});
test('E6 Tickets table orders states and keeps PRs, lane stripes and informational tags',()=>{
 const h=harness(epicFixture()),api=h.ctl.liveStatus;mountStatus(h);
 api.apply({'AA-1':{state:'done',epic:'EP-1',title:'Client work',assignee:'Alex',prs:{count:2,state:'declined'}},'BB-1':{state:'todo'},'CC-1':{state:'active',epic:'EP-1'},'DD-1':{state:'missing',epic:'EP-1'},'EE-1':{state:'blocked',epic:'EP-1'},'FF-1':{state:'blocked',epic:'EP-1'},'EX-1':{state:'active',epic:'EP-1',title:'Extra',lane:'APP'},'NO-1':{state:'blocked',epic:'OTHER-1'}});
 assert.ok(h.view.querySelector('.dv-live-panel-body'));const table=h.view.querySelector('table.dv-live-tickets');assert.ok(table);
 assert.deepEqual(table.querySelectorAll('th').map(el=>textOf(el).trim()),['Key','Title','State','Owner','Depends on','PRs']);
 const all=table.querySelectorAll('tbody')[0].children,rows=all.filter(el=>el.getAttribute('data-live-ticket')),coverageOf=key=>all.find(el=>el.getAttribute('data-live-coverage-for')===key);assert.deepEqual(rows.map(el=>el.getAttribute('data-live-ticket')),['EE-1','FF-1','DD-1','CC-1','EX-1','BB-1','AA-1']);
 assert.equal(all.length,9);assert.equal(all[1].getAttribute('data-live-ticket'),'FF-1');
 const aa=rows.at(-1),extra=coverageOf('EX-1');assert.equal(aa.querySelector('.dv-live-state-pill').textContent,'done');assert.match(textOf(aa),/Client work.*Alex/);assert.doesNotMatch(textOf(aa),/time unavailable|ago/);assert.match(textOf(aa),/2 declined/);
 assert.deepEqual(aa.querySelectorAll('a').map(el=>el.getAttribute('href')),['https://jira.test/browse/AA-1','https://code.test/pull/1','https://code.test/pull/2']);
 assert.equal(extra.querySelector('.dv-live-coverage-tag').textContent,'NOT ON DIAGRAM');assert.equal(coverageOf('BB-1').querySelector('.dv-live-coverage-tag').textContent,'NOT IN PARENT EPIC');
 assert.equal(rows.find(el=>el.getAttribute('data-live-ticket')==='EX-1').props['--dv-live-lane-color'],'#34d399');assert.equal(coverageOf('AA-1'),undefined);assert.equal(table.querySelectorAll('.dv-live-chip').length,0);
 let focused=false;h.view.querySelector('g.node[data-dv-node="a"]').querySelector('.card').focus=()=>focused=true;api.focusCarrier(api.snapshot().tickets.find(item=>item.key==='AA-1').carriers[0]);assert.equal(focused,true,'controller navigation remains available');
 assert.match(h.view.querySelector('.dv-live-epic-progress').textContent,/6 of 7 on diagram/);assert.match(api.snapshot().verdict,/6 of 7 stories on diagram/);
 const exRow=rows.find(el=>el.getAttribute('data-live-ticket')==='EX-1'),exTag=extra;api.apply({'EX-1':{state:'blocked',epic:'EP-1'},'BB-1':{state:'done',epic:'EP-1'}});
 const reordered=table.querySelector('tbody').children;assert.ok(reordered[0]===exRow,'tagged ticket reorders with its keyed row');assert.ok(reordered[1]===exTag,'tag stays directly after its ticket');assert.equal(table.querySelector('tr[data-live-coverage-for="BB-1"]'),null,'tag row disappears when membership is supplied');api.destroy();
});
test('E7 later unreferenced epic children log addition once with evidence time and cap',()=>{
 const h=harness(epicFixture()),api=h.ctl.liveStatus;mountStatus(h);api.apply({'AA-1':{state:'done',epic:'EP-1'}});assert.ok(h.view.querySelector('.dv-live-panel-body'));
 const map={'AA-1':{state:'done',epic:'EP-1'},'EX-1':{state:'todo',epic:'EP-1'}};api.apply(map);
 let rows=h.view.querySelectorAll('.dv-live-activity-entry');assert.equal(rows.length,1);assert.equal(rows[0].textContent,'EX-1 · added to epic · not on diagram · time unavailable');api.apply(map);assert.equal(h.view.querySelectorAll('.dv-live-activity-entry').length,1);
 for(let i=2;i<24;i++){map['EX-'+i]={state:'todo',epic:'EP-1',updatedAt:'2026-10-20T00:00:00Z'};api.apply(map);}
 rows=h.view.querySelectorAll('.dv-live-activity-entry');assert.equal(rows.length,20);assert.equal(rows[0].getAttribute('data-updated-at'),'2026-10-20T00:00:00.000Z');api.destroy();
});
test('E9 E11 docs and built example declare epic and Tickets table',()=>{
 const docs=fs.readFileSync('docs/live-status.md','utf8');assert.match(docs,/### Tickets table/);assert.match(docs,/parent =/);assert.match(fs.readFileSync('contract/authoring-contract.md','utf8'),/tracking.jira.epic/);
 const built=fs.readFileSync('examples/live-status/live-status.html','utf8');assert.match(built,/function liveStatusCoverage\(/);assert.match(built,/Alert sound setting/);assert.match(built,/dv-live-tickets/);
});

test('E7 a previously seen child returning after absence is not a new epic addition',()=>{
 const h=harness(epicFixture()),api=h.ctl.liveStatus;mountStatus(h);
 api.apply({'EX-1':{state:'todo',epic:'EP-1'}});assert.ok(h.view.querySelector('.dv-live-panel-body'));
 api.apply({});api.apply({'EX-1':{state:'todo',epic:'EP-1'}});assert.equal(h.view.querySelectorAll('.dv-live-activity-entry').length,0);api.destroy();
});
test('E3 failed and superseded pagination cannot replace complete carrier or epic evidence',async()=>{
 const h=providerHarness(epicFixture());await h.start();h.data(0,[jira('AA-1')]);const watch=h.watches.find(w=>w.input.jql==='parent = EP-1');
 const deliver=payload=>watch.handler({type:'data',result:{payload}});
 deliver({issues:[jira('EX-1')]});h.data(1,[]);hierarchyBranch(h,'EP-2',[]);hierarchyData(h,'parent = EP-1 AND Flagged = Impediment',[]);let resolve;
 h.mcp.callTool=()=>Promise.reject({code:'upstream_error',retryable:true});
 deliver({issues:[jira('EX-2')],pageInfo:{hasNextPage:true,endCursor:'two'}});await settle();
 assert.equal(h.ctl.liveStatus.state('EX-1').state,'active');assert.equal(h.ctl.liveStatus.state('EX-2'),null);assert.equal(h.ctl.liveStatus.state('AA-1').state,'active');assert.equal(h.timers.size,1);
 h.mcp.callTool=()=>new Promise(r=>resolve=r);deliver({issues:[jira('EX-2')],nextPageToken:'two'});await settle();
 deliver({issues:[jira('EX-3','done')]});resolve({payload:{issues:[jira('EX-4')]}});await settle();
 assert.equal(h.ctl.liveStatus.state('EX-3').state,'done');assert.equal(h.ctl.liveStatus.state('EX-2'),null);assert.equal(h.ctl.liveStatus.state('EX-4'),null);h.ctl.liveStatus.destroy();
});
test('E3 an epic without carrier tickets still starts its two watches and exposes details',async()=>{
 const h=providerHarness({page:{tracking:{jira:{epic:'EP-1'}},sections:[{diagram:{nodes:{a:{}},rows:[['a']]}}]}});await h.start();
 assert.deepEqual(h.watches.map(w=>w.input.jql),['parent = EP-1','parent = EP-1 AND Flagged = Impediment','key in (EP-1)']);
 h.data(0,[jira('EX-1')]);assert.equal(h.ctl.liveStatus.state('EX-1'),null,'initial epic children wait for Flagged evidence');h.data(1,[]);assert.equal(h.ctl.liveStatus.state('EX-1').epic,'EP-1');assert.equal(h.view.querySelector('.dv-live-head').hidden,false);h.ctl.liveStatus.destroy();
});

/* Round 2 regressions: preserve the frozen E1–E11 RED rows above. */
test('E8 rework Workbench demo entries paint carrier badges with page epics configured',()=>{
 const raw=epicFixture(),h=harness(raw),before=JSON.stringify(h.ctl.page);
 vm.runInNewContext(fs.readFileSync('src/workbench/preview.js','utf8'),h.C);
 const map=h.C.workbenchDemoStatus(h.ctl.page);
 assert.deepEqual(plain(map),{'AA-1':{state:'todo',epic:'EP-1'},'BB-1':{state:'active',epic:'EP-1'},'CC-1':{state:'done',epic:'EP-1'},'DD-1':{state:'blocked',epic:'EP-1'},'EE-1':{state:'todo',epic:'EP-1'},'FF-1':{state:'active',epic:'EP-1'}});
 h.ctl.liveStatus.apply(map);
 assert.match(h.ctl.liveStatus.snapshot().verdict,/6 of 6 stories on diagram/,'E8 demo entries count as epic stories');
 assert.equal(h.view.querySelectorAll('.dv-live-badge').length,0);assert.equal(h.view.querySelectorAll('.dv-live-target').length,3);
 assert.ok(h.view.querySelector('[data-dv-node="a"]').classList.contains('dv-live-todo'));
 assert.ok(h.view.querySelector('[data-dv-node="b"]').classList.contains('dv-live-blocked'));
 assert.ok(h.view.querySelector('path.edge').classList.contains('dv-live-todo'));
 assert.deepEqual(plain(h.ctl.liveStatus.refs().epics),['EP-1','EP-2']);
 assert.equal(JSON.stringify(h.ctl.page),before,'demo must not write status into authored data');
 h.ctl.liveStatus.destroy();
});

test('E3 rework loaded detail epics add deduplicated paginated watches without replacing carrier evidence',async()=>{
 const detail={page:{tracking:{jira:{epic:['EP-2','EP-3']}},sections:[{id:'child',diagram:{nodes:{child:{tickets:['CH-1']}},rows:[['child']]}}]}};
 const renderOptions={loadDetail:async()=>detail},h=providerHarness(epicFixture(),renderOptions),api=h.ctl.liveStatus;
 await h.start();h.data(0,[jira('AA-1')]);h.data(1,[]);hierarchyBranch(h,'EP-1',[]);hierarchyBranch(h,'EP-2',[]);assert.equal(h.watches.length,7);
 await renderOptions.loadDetail({spec:'detail'},new AbortController().signal);h.flush();
 assert.equal(h.watches.length,12,'one new key batch and one new epic, each with Flagged');
 const watch=h.watches.find(w=>w.input.jql==='parent = EP-3'),flag=h.watches.find(w=>w.input.jql==='parent = EP-3 AND Flagged = Impediment');
 assert.ok(watch);assert.ok(flag);assert.deepEqual(watch.input.fields,['summary','status','assignee','updated','issuelinks','parent','issuetype']);assert.equal(watch.input.maxResults,10);
 assert.equal(api.state('AA-1').state,'active');assert.equal(api.state('CH-1'),null,'new unanswered chunks do not erase or invent evidence');
 h.mcp.callTool=async(server,tool,input)=>{h.calls.push(plain(input));return {payload:{issues:[jira('CH-2')]}};};
 watch.handler({type:'data',result:{payload:{issues:[jira('CH-1')],pageInfo:{hasNextPage:true,endCursor:'second'}}}});await settle();
 assert.equal(h.calls.at(-1).nextPageToken,'second');assert.equal(api.state('CH-2'),null,'new scope waits for its ticket and Flagged evidence');
 hierarchyData(h,'key in (CH-1)',[jira('CH-1')]);hierarchyData(h,'key in (CH-1) AND Flagged = Impediment',[]);hierarchyData(h,'parent = EP-3 AND Flagged = Impediment',[]);assert.equal(api.state('CH-2').epic,'EP-3');assert.equal(api.state('CH-1').epic,'EP-3');
 flag.handler({type:'data',result:{payload:{issues:[jira('CH-2')]}}});assert.equal(api.state('CH-2').state,'blocked');
 watch.handler({type:'error',error:{code:'tool_error',message:'Temporary epic failure'}});assert.equal(api.state('AA-1').state,'active');assert.equal(api.state('CH-2').state,'blocked');
 for(let i=0;i<3;i++){await renderOptions.loadDetail({spec:'detail'},new AbortController().signal);h.view.dispatchEvent({type:'detail-navigation'});h.flush();api.setEnabled(i%2===0);}
 assert.equal(h.watches.length,12,'reopening details and toggles never duplicate watches');
 api.destroy();await settle();assert.ok(h.watches.every(w=>w.stopped===1));
});

test('E3 rework synchronous watch delivery and late detail completion retire cleanly',async()=>{
 let resolve;const renderOptions={loadDetail:()=>new Promise(r=>resolve=r)},h=providerHarness(epicFixture(),renderOptions);
 const originalWatch=h.mcp.watchTool;h.mcp.watchTool=(server,tool,input,handler,options)=>{
  const off=originalWatch(server,tool,input,handler,options);handler({type:'data',result:{payload:{issues:[]}}});return off;
 };
 await h.start();assert.equal(h.watches.length,7);
 const pending=renderOptions.loadDetail({spec:'late'},new AbortController().signal);h.ctl.liveStatus.destroy();
 resolve({page:{tracking:{jira:{epic:'EP-9'}},sections:[{diagram:{nodes:{child:{tickets:['CH-9']}}}}]}});await pending;await settle();
 assert.equal(h.watches.length,7);assert.ok(h.watches.every(w=>w.stopped===1));assert.equal(h.frames.size,0);
});

test('E6 controller navigation opens inactive local and loaded external detail carriers before focusing',async()=>{
 for(const external of [false,true]){
  const childSection={id:'child',detailOnly:!external,diagram:{nodes:{child:{title:'Child carrier',tickets:['CH-1']}},rows:[['child']]}};
  const detail={page:{sections:[childSection]}},ref=external?{spec:'remote',section:'child'}:{section:'child'};
  const raw={page:{sections:[{id:'root',diagram:{nodes:{parent:{tickets:['AA-1'],detail:ref}},rows:[['parent']]}}]}};
  if(!external)raw.page.sections.push(childSection);
  const renderOptions={loadDetail:async()=>detail},h=harness(raw,{},renderOptions),api=h.ctl.liveStatus,child=harness(detail);
  child.ctl.liveStatus.destroy();const rootRec=h.ctl.sections[0],childRec=child.ctl.sections[0],restores=[];
  let saved=null,active=[];if(!external)h.ctl.sections[1].sectionEl.hidden=true;
  h.ctl.details={snapshot:()=>saved,activeSections:()=>active,showSection:()=>{saved=null;active=[];rootRec.sectionEl.hidden=false;},restore:async value=>{
   restores.push(plain(value));if(external)await renderOptions.loadDetail(ref,new AbortController().signal);
   saved=value;active=[rootRec,childRec];rootRec.sectionEl.hidden=true;h.view.appendChild(childRec.sectionEl);
  }};
  if(external)await renderOptions.loadDetail(ref,new AbortController().signal);
  // Carriers are the harness's own cards (no canvas badges), so they take the focus stub.
  for(const el of [...h.view.querySelectorAll('.card'),...childRec.sectionEl.querySelectorAll('.card')])el.focus=()=>h.doc.activeElement=el;
  mountStatus(h);api.apply({'AA-1':{state:'done'},'CH-1':{state:'active'}});
  for(let i=0;i<2;i++){
   assert.ok(h.view.querySelector('.dv-live-panel-body'));
   assert.equal(h.view.querySelector('tr[data-live-coverage-for="CH-1"]'),null);const carrier=api.snapshot().tickets.find(item=>item.key==='CH-1').carriers[0];assert.equal(carrier.label,'Child carrier');api.focusCarrier(carrier);await settle();h.flush();
   assert.equal(restores.length,i+1);assert.deepEqual(restores[i],{section:'root',frames:[{node:'parent',state:{mode:'ambient'}}]});
   assert.ok(childRec.sectionEl.contains(h.doc.activeElement),'focus is in the active detail, not its hidden original');assert.equal(h.doc.activeElement.getAttribute('data-live-carrier'),'child');
   saved=null;active=[];rootRec.sectionEl.hidden=false;childRec.sectionEl.remove();h.view.dispatchEvent({type:'detail-navigation'});h.flush();
  }
  api.destroy();
 }
});

test('E3 rework an initially untracked page defers discovery until a detail introduces an epic',async()=>{
 const renderOptions={loadDetail:async()=>({page:{tracking:{jira:{epic:'EP-9'}},sections:[{diagram:{nodes:{child:{tickets:['CH-9']}},rows:[['child']]}}]}})},h=providerHarness({nodes:{parent:{}},rows:[['parent']]},renderOptions);
 assert.equal(h.start(),null);assert.equal(h.calls.length,0);assert.equal(h.watches.length,0);
 await renderOptions.loadDetail({spec:'first-tracked-detail'},new AbortController().signal);await settle();
 assert.equal(h.calls.length,1);assert.deepEqual(h.watches.map(w=>w.input.jql),['key in (CH-9)','key in (CH-9) AND Flagged = Impediment','parent = EP-9','parent = EP-9 AND Flagged = Impediment','key in (EP-9)']);
 h.data(2,[jira('EX-9')]);h.data(0,[jira('CH-9')]);h.data(1,[]);h.data(3,[]);assert.equal(h.ctl.liveStatus.state('EX-9').epic,'EP-9');
 h.ctl.liveStatus.destroy();await settle();assert.ok(h.watches.every(w=>w.stopped===1));
});

/* L3 supersedes disposable previews: keep unlinked local/remote node and edge coverage. */
test('E6 unlinked local and loaded remote carriers have no panel links or previews',async()=>{
 for(const external of [false,true])for(const detailOnly of [false,true]){
  if(!external && !detailOnly)continue;
  const section={id:'unlinked',detailOnly,heading:'Unlinked work',diagram:{nodes:{child:{title:'Unlinked child',tickets:['CH-1']},end:{}},rows:[['child','end']],edges:[{from:'child',to:'end',label:'Unlinked edge',tickets:['CH-2']}]}};
  const remote={page:{sections:[{id:'entry',diagram:{nodes:{entry:{}},rows:[['entry']]}},section]}};
  const raw={page:{sections:[{id:'root',diagram:{nodes:{parent:{tickets:['AA-1'],...(external?{detail:{spec:'approved',section:'entry'}}:{})}},rows:[['parent']]}},...(!external?[section]:[])]}};
  let loads=0;const renderOptions={loadDetail:async()=>{loads++;return remote;}},h=harness(raw,{},renderOptions),api=h.ctl.liveStatus;
  if(external)await renderOptions.loadDetail({spec:'approved',section:'entry'},new AbortController().signal);else h.ctl.sections[1].sectionEl.hidden=true;
  h.ctl.details={snapshot:()=>null,activeSections:()=>[],restore(){assert.fail('no authored route exists');}};
  const before=JSON.stringify([h.ctl.page,remote]);mountStatus(h);api.apply({'AA-1':{state:'done'},'CH-1':{state:'active'},'CH-2':{state:'missing'}});
  for(const key of ['CH-1','CH-2']){assert.equal(h.view.querySelector('tr[data-live-coverage-for="'+key+'"]'),null);const carrier=api.snapshot().tickets.find(item=>item.key===key).carriers[0];assert.equal(carrier.disabled,true);assert.match(carrier.title,/Unlinked work/);api.focusCarrier(carrier);}
  assert.equal(h.view.querySelector('.dv-live-carrier-preview'),null);assert.equal(loads,external?1:0);assert.equal(JSON.stringify([h.ctl.page,remote]),before);api.destroy();assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);
 }
});
test('E6 pending controller navigation cannot steal a newer panel control focus',async()=>{
 const childSection={id:'child',detailOnly:true,diagram:{nodes:{child:{title:'Child carrier',tickets:['CH-1']}},rows:[['child']]}};
 const h=harness({page:{sections:[{id:'root',diagram:{nodes:{parent:{tickets:['AA-1'],detail:{section:'child'}}},rows:[['parent']]}},childSection]}}),api=h.ctl.liveStatus,child=h.ctl.sections[1];child.sectionEl.hidden=true;
 let finish;h.ctl.details={snapshot:()=>null,activeSections:()=>[],showSection(){},restore:()=>new Promise(resolve=>finish=resolve)};
 mountStatus(h);api.apply({'AA-1':{state:'done'},'CH-1':{state:'active'}});
 api.focusCarrier(api.snapshot().tickets.find(item=>item.key==='CH-1').carriers[0]);assert.equal(typeof finish,'function');
 const toggle=h.view.querySelector('.dv-live-toggle');h.doc.activeElement=toggle;child.sectionEl.hidden=false;finish();await settle();h.flush();
 assert.equal(h.doc.activeElement,toggle);assert.equal(h.view.querySelector('.dv-live-carrier-preview'),null);api.destroy();assert.equal(h.frames.size,0);
});

/* L1–L11: authored Live status panel. These RED rows stay fixed in rework. */
function mountStatus(h,host=h.view){
 const d=h.C.PanelRegistry.get('live-status');assert.ok(d,'L1 registered panel');
 const body=host.appendChild(new Element('div',{class:'pbody'}));
 const result=d.render(body,{id:'status',type:'live-status'}, {},'pastel',[],0,false);
 result.mounted();return {body,remount:result.mounted,destroy(){if(body._panelMotionCleanup)body._panelMotionCleanup();body.remove();}};
}
test('L2 controller registry resolves nearest root and retires without cross-view leakage',()=>{
 const h=harness(fixture());assert.equal(typeof h.C.liveStatusControllerFor,'function');
 const child=h.view.appendChild(new Element());assert.equal(h.C.liveStatusControllerFor(child),h.ctl.liveStatus);
 const nested={view:child,sections:[]},api=h.C.createLiveStatus(nested,h.ctl.page);assert.equal(h.C.liveStatusControllerFor(child),api);api.destroy();assert.equal(h.C.liveStatusControllerFor(child),h.ctl.liveStatus);
 h.ctl.liveStatus.destroy();assert.equal(h.C.liveStatusControllerFor(child),null);
});
test('L2 L3 snapshot exposes rollup and all mutations notify; navigation controls are absent',()=>{
 const h=harness(epicFixture()),api=h.ctl.liveStatus;assert.equal(typeof api.snapshot,'function');assert.equal(api.mountControls,undefined);
 const changes=[];api.onChange(v=>changes.push(v));api.apply({'AA-1':{state:'done',epic:'EP-1'}});api.setEnabled(false);api.note('Waiting','warn');api.action('Retry',()=>{});api.setDemoControls({playing:false,manual:true,ended:false,next(){},toggle(){}});
 assert.equal(changes.length,5);const value=plain(api.snapshot());for(const key of ['counts','updatedAt','enabled','note','actionLabel','lanes','blockers','tickets','coverage','activity','demo','verdict'])assert.ok(key in value,key);
 assert.equal(value.enabled,false);assert.equal(value.note.text,'Waiting');assert.equal(value.actionLabel,'Retry');assert.equal(value.tickets[0].key,'BB-1');
 value.states['AA-1'].state='blocked';assert.equal(api.state('AA-1').state,'done');api.destroy();
});
test('L2 L3 L4 panel paints synchronously, controls act, focus survives refresh and cleanup preserves print',()=>{
 const h=harness(fixture()),api=h.ctl.liveStatus;api.apply(fixed);const mount=mountStatus(h),body=mount.body;
 assert.equal(body.firstChild.className,'dv-status-header');assert.ok(body.firstChild.querySelector('.dv-status-modes'));assert.ok(body.querySelector('.dv-live-head'));assert.ok(body.querySelector('table.dv-live-tickets'));assert.ok(body.querySelector('.dv-live-epic'));assert.ok(body.querySelector('.dv-live-verdict')===null,'no verdict line');
 assert.deepEqual(body.querySelectorAll('h3').map(el=>el.textContent),['Tickets','Blockers and dependency chains','Activity']);
 const toggle=body.querySelector('.dv-live-toggle');assert.equal(toggle.textContent,'Live');toggle.dispatchEvent({type:'click'});assert.equal(api.enabled(),false);toggle.dispatchEvent({type:'click'});assert.equal(api.enabled(),true);
 let action=0,next=0,prev=0;api.action('Retry',()=>action++);body.querySelector('.dv-live-action').dispatchEvent({type:'click'});assert.equal(action,1);
 api.setDemoControls({ended:false,first:false,prev(){prev++;},next(){next++;}});
 const demo=body.querySelector('.dv-live-demo');assert.deepEqual(demo.children.map(el=>[el.textContent,el.getAttribute('aria-label')]),[['<','Previous day'],['>','Next day']]);demo.children[0].dispatchEvent({type:'click'});demo.children[1].dispatchEvent({type:'click'});assert.equal(prev,1);assert.equal(next,1);
 h.doc.activeElement=toggle;api.apply(fixed);assert.equal(h.doc.activeElement,toggle);assert.ok(body.contains(toggle));
 const before=textOf(body);body._panelMotionCleanup();api.note('After cleanup');assert.equal(textOf(body),before);mount.remount();assert.equal(body.querySelector('.dv-live-note').textContent,'After cleanup');
 mount.remount();api.note('Once');assert.equal(body.querySelectorAll('.dv-live-head').length,1);api.destroy();assert.equal(textOf(body).includes('Once'),true);
});
test('L2 empty page and disconnected provider render only the appropriate message',()=>{
 // #1136: a page without ticket references opens on the Trace view, not on a Jira view that says it has none.
 const empty=harness(),mount=mountStatus(empty);assert.equal(empty.ctl.liveStatus.snapshot().mode,'trace');assert.match(textOf(mount.body),/No traceMatch steps on this board/);assert.doesNotMatch(textOf(mount.body),/This page has no ticket references/);assert.equal(mount.body.querySelector('table'),null);
 const h=harness(fixture());h.ctl.liveStatus.note('Add the Atlassian connector');const m=mountStatus(h);assert.equal(m.body.querySelector('.dv-live-note').textContent,'Add the Atlassian connector');assert.equal(m.body.querySelector('table'),null);assert.ok(m.body.querySelector('.dv-live-toggle').hidden);
 empty.ctl.liveStatus.destroy();h.ctl.liveStatus.destroy();
});

test('L2 early panels connect once after controller construction and cleanup removes pending subscriptions',()=>{
 const h=harness(fixture());h.ctl.liveStatus.destroy();
 const kept=mountStatus(h),removed=mountStatus(h);assert.equal(h.C.liveStatusPending.length,2);removed.destroy();assert.equal(h.C.liveStatusPending.length,1);
 const api=h.C.createLiveStatus(h.ctl,h.ctl.page);h.ctl.liveStatus=api;assert.equal(h.C.liveStatusPending.length,0);api.apply(fixed);assert.ok(kept.body.querySelector('table'));
 let subscriptions=0,unsubscriptions=0;const original=api.onChange;api.onChange=fn=>{subscriptions++;const off=original(fn);return ()=>{unsubscriptions++;off();};};
 kept.remount();kept.remount();assert.equal(subscriptions,2);assert.equal(unsubscriptions,1);kept.body._panelMotionCleanup();assert.equal(unsubscriptions,2);
 const before=textOf(kept.body);api.note('Hidden section');assert.equal(textOf(kept.body),before);kept.remount();assert.equal(kept.body.querySelector('.dv-live-note').textContent,'Hidden section');api.destroy();assert.equal(unsubscriptions,3);
});
test('L4 keyed Tickets rows retain a focused control through reorder and update links',()=>{
 const raw=epicFixture();delete raw.page.tracking.jira.site;const h=harness(raw),api=h.ctl.liveStatus;api.apply({'AA-1':{state:'done',epic:'EP-1'},'BB-1':{state:'active'}});const {body}=mountStatus(h);
 const dataRow=body.querySelector('tr[data-live-ticket="AA-1"]'),control=dataRow.querySelector('.dv-live-pr-link');h.doc.activeElement=control;
 api.apply({'AA-1':{state:'blocked',epic:'EP-1',url:'https://jira.test/browse/AA-1'},'BB-1':{state:'done'}});
 const tbody=body.querySelector('tbody');assert.ok(tbody.children[0]===dataRow,'data row first after reorder');assert.equal(body.querySelector('tr[data-live-coverage-for="AA-1"]'),null);assert.ok(dataRow.querySelector('.dv-live-pr-link')===control);assert.ok(h.doc.activeElement===control);
 assert.equal(dataRow.querySelector('a').getAttribute('href'),'https://jira.test/browse/AA-1');api.destroy();
});
test('L3 First blocker has a fixed place: it uses the current path, and with nothing to reach it greys out and says why',()=>{
 const h=harness(fixture()),api=h.ctl.liveStatus;let jumped;
 h.ctl.sections[0].stepper={path:()=> 'happy',sourceIndex:()=>0,mode:()=> 'ambient',jumpSource:(index,path)=>jumped=[index,path]};
 api.apply(fixed);const {body}=mountStatus(h),first=body.querySelector('.dv-live-first');assert.equal(first.hidden,false);first.dispatchEvent({type:'click'});assert.deepEqual(jumped,[0,'happy']);
 assert.equal(first.textContent,'First blocker');assert.equal(first.disabled,false);
 // Colors off: blockers still exist, so the label stays true and the button only greys out.
 api.setEnabled(false);assert.equal(first.hidden,false);assert.equal(first.disabled,true);assert.equal(first.textContent,'First blocker');api.setEnabled(true);
 jumped=null;api.apply({'AA-1':{state:'done'}});assert.equal(first.hidden,false);assert.equal(first.textContent,'No blockers');assert.equal(first.disabled,true);first.dispatchEvent({type:'click'});assert.equal(jumped,null);api.destroy();
});
test('L2 detail panel mounted before attachment connects on navigation with the existing controller',()=>{
 const h=harness(fixture()),detached=new Element(),mount=mountStatus(h,detached);assert.match(textOf(mount.body),/no ticket references/);assert.equal(h.C.liveStatusPending.length,1);
 h.view.appendChild(detached);h.ctl.liveStatus.apply(fixed);h.view.dispatchEvent({type:'detail-navigation'});h.flush();assert.equal(h.C.liveStatusPending.length,0);assert.ok(mount.body.querySelector('table.dv-live-tickets'));h.ctl.liveStatus.destroy();
});

/* S1–S4 (#769): connector state, activity and last-checked time in the panel header; PR links as icons. */
test('S1 host provider reports connecting, busy, connected with a checked time, and error through status()',async()=>{
 let fail=false;const h=harness(fixture(),{provider:()=>fail?Promise.reject(Error('Unavailable')):Promise.resolve(fixed),refreshMs:1}),api=h.ctl.liveStatus;
 assert.equal(typeof api.status,'function','S1 status() exists');mountStatus(h);
 let value=plain(api.snapshot());assert.ok(value.connection,'S1 snapshot.connection');assert.equal(value.connection.state,'connecting');assert.equal(value.connection.source,'Host');assert.equal(value.connection.busy,false);
 h.flush();h.flush();await new Promise(setImmediate);value=plain(api.snapshot());
 assert.equal(value.connection.state,'connected');assert.equal(value.connection.busy,false);assert.ok(isFinite(Date.parse(value.connection.checkedAt)),'S1 checkedAt is a timestamp');const clock=at=>new Date(at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'});assert.equal(value.connection.checkedText,'refreshed '+clock(value.connection.checkedAt),'S1 refresh time is the local clock time');assert.equal(h.view.querySelector('time.dv-live-updated'),null,'S1 no separate updated time');
 const badge=h.view.querySelector('.dv-live-connection');assert.ok(badge,'S1 header connection element');assert.equal(badge.getAttribute('data-state'),'connected');assert.equal(badge.getAttribute('data-busy'),'false');
 const badgeText=()=>badge.querySelectorAll('span')[0].textContent;assert.equal(badgeText(),'Host connected, refreshed '+clock(value.connection.checkedAt));assert.equal(badge.getAttribute('role'),'status');assert.ok(badge.querySelector('.dv-live-connection-dot'));
 fail=true;const tick=[...h.timers.values()][0];h.timers.clear();tick.fn();value=plain(api.snapshot());assert.equal(value.connection.busy,true);assert.equal(badge.getAttribute('data-busy'),'true');
 await new Promise(setImmediate);value=plain(api.snapshot());assert.equal(value.connection.state,'error');assert.equal(value.connection.busy,false);assert.equal(badge.getAttribute('data-state'),'error');
 api.status({state:'bogus',source:42});assert.equal(plain(api.snapshot()).connection.state,'error');assert.equal(plain(api.snapshot()).connection.source,'Host');
 api.status({state:'demo',source:'Demo',checkedAt:Date.now()});value=plain(api.snapshot());assert.equal(value.connection.state,'demo');assert.equal(value.connection.source,'Demo');assert.equal(badgeText(),'Demo, refreshed '+clock(value.connection.checkedAt));
 api.status({checkedAt:Date.UTC(2020,0,2,15,4,5)});value=plain(api.snapshot());assert.equal(badgeText(),'Demo, refreshed '+new Date(Date.UTC(2020,0,2,15,4,5)).toLocaleDateString([],{month:'short',day:'numeric'})+' '+clock(Date.UTC(2020,0,2,15,4,5)),'S1 an older refresh shows its date');
 api.destroy();
});
test('S2 the Jira adapter reports disconnected, connecting, connected and retrying error states',async()=>{
 const h=providerHarness();h.start();await new Promise(setImmediate);await new Promise(setImmediate);await new Promise(setImmediate);
 let value=plain(h.ctl.liveStatus.snapshot());assert.equal(value.connection.source,'Jira');assert.ok(['connecting','connected'].includes(value.connection.state),'S2 after discovery: '+value.connection.state);assert.equal(value.connection.busy,true);
 assert.ok(h.watches.length>=2,'S2 the ticket watch and its Flagged watch are registered');h.watches[0].handler({type:'data',result:{payload:{issues:{nodes:[]}},cache:{storedAt:1793000000000}}});
 value=plain(h.ctl.liveStatus.snapshot());assert.equal(value.connection.state,'connected');assert.equal(value.connection.checkedAt,new Date(1793000000000).toISOString());assert.equal(value.connection.busy,true,'S2 still busy while the second watch is outstanding');
 for(let i=1;i<h.watches.length;i++)h.watches[i].handler({type:'data',result:{payload:{issues:{nodes:[]}},cache:{storedAt:1793000000000}}});value=plain(h.ctl.liveStatus.snapshot());assert.equal(value.connection.busy,false,'S2 idle once every watch answered');
 h.watches[0].handler({type:'error',error:{code:'tool_error',message:'boom'}});value=plain(h.ctl.liveStatus.snapshot());assert.equal(value.connection.state,'error');assert.equal(value.connection.busy,false,'S2 a non-retryable failure leaves nothing in flight');
 h.watches[0].handler({type:'error',error:{code:'rate_limited',retryable:true}});value=plain(h.ctl.liveStatus.snapshot());assert.equal(value.connection.state,'error');assert.equal(value.connection.busy,true,'S2 busy while a retry timer is pending');
 h.ctl.liveStatus.destroy();
 const nons=providerHarness();nons.win.claude={use:()=>Promise.resolve(null)};nons.start();await new Promise(setImmediate);await new Promise(setImmediate);
 value=plain(nons.ctl.liveStatus.snapshot());assert.equal(value.connection.state,'disconnected','S2 no mcp namespace is reported, not left connecting');assert.equal(value.connection.busy,false);nons.ctl.liveStatus.destroy();
 const throws=providerHarness();throws.win.claude={use:()=>{throw new Error('no runtime');}};assert.equal(throws.start(),null);
 value=plain(throws.ctl.liveStatus.snapshot());assert.equal(value.connection.state,'disconnected','S2 a throwing claude.use is reported, not left connecting');assert.equal(value.connection.busy,false);throws.ctl.liveStatus.destroy();
 const none=providerHarness();none.servers.length=0;none.start();await new Promise(setImmediate);await new Promise(setImmediate);
 value=plain(none.ctl.liveStatus.snapshot());assert.equal(value.connection.state,'disconnected');assert.equal(value.connection.busy,false);assert.match(value.note.text,/Add the Atlassian connector/);none.ctl.liveStatus.destroy();
 const nosite=providerHarness();nosite.mcp.callTool=()=>Promise.resolve({payload:[]});nosite.start();await new Promise(setImmediate);await new Promise(setImmediate);await new Promise(setImmediate);
 value=plain(nosite.ctl.liveStatus.snapshot());assert.equal(value.connection.state,'disconnected','S2 no available site is reported, not left connecting');assert.equal(value.connection.busy,false);assert.match(value.note.text,/No Atlassian site/);nosite.ctl.liveStatus.destroy();
});
test('S3 the demo player reports a demo connection with the day as the checked time',()=>{
 const h=harness(fixture(),{demo:{mount(api){api.status({state:'demo',source:'Demo',checkedAt:Date.now()});api.apply(fixed);return ()=>{};}}});mountStatus(h);
 const value=plain(h.ctl.liveStatus.snapshot());assert.equal(value.connection.state,'demo');assert.equal(h.view.querySelector('.dv-live-connection').getAttribute('data-state'),'demo');h.ctl.liveStatus.destroy();
});
test('S4 authored PR links render as icons with accessible names, not URL text',()=>{
 const h=harness(epicFixture()),api=h.ctl.liveStatus;mountStatus(h);api.apply({'AA-1':{state:'done',epic:'EP-1'}});
 const row=h.view.querySelectorAll('.dv-live-tickets tbody tr').find(el=>el.getAttribute('data-live-ticket')==='AA-1'),links=row.querySelectorAll('.dv-live-pr-link');
 assert.equal(links.length,2,'S4 both authored PR links render as icon links');for(const a of links){assert.match(String(a.className || a.getAttribute('class') || ''),/dv-live-pr-link/,'S4 icon link class');assert.ok(a.querySelector('svg') || /<svg\b/.test(String(a.innerHTML || '')),'S4 inline icon');
  const href=a.getAttribute('href'),number=/\/pull\/(\d+)/.exec(href)[1];assert.equal(a.getAttribute('aria-label'),'Pull request #'+number+' on code.test');assert.equal(a.getAttribute('title'),href);
  assert.ok(!a.textContent || !/https?:/.test(a.textContent),'S4 no URL text');}
 api.destroy();
});

test('E8 verdict counts manual stories before parent membership is available',()=>{
 const h=harness(epicFixture()),api=h.ctl.liveStatus;api.apply({'AA-1':{state:'todo'}});
 assert.match(api.snapshot().verdict,/6 of 6 stories on diagram/,'manual references count even without status or membership');
 api.apply({'AA-1':{state:'todo',epic:'EP-1'}});assert.match(api.snapshot().verdict,/6 of 6 stories on diagram/);api.destroy();
});

test('O1 #764 Owner cell links to the Confluence people page only with a site and a usable accountId',()=>{
 const h=harness(epicFixture()),api=h.ctl.liveStatus;mountStatus(h);
 api.apply({'AA-1':{state:'done',assignee:'Alex',assigneeId:'557058:0f1a-2b3c'},'BB-1':{state:'todo',assignee:'Sam'},'CC-1':{state:'active',assignee:'Kim',assigneeId:'a b/c?d'},'DD-1':{state:'active',assignee:'Pat',assigneeId:'   '},'EE-1':{state:'active',assigneeId:'nobody'}});
 assert.equal(api.state('AA-1').assigneeId,'557058:0f1a-2b3c','state() carries the id');assert.equal(api.state('BB-1').assigneeId,undefined);
 const rows=h.view.querySelectorAll('.dv-live-tickets tbody tr[data-live-ticket]'),owner=key=>rows.find(el=>el.getAttribute('data-live-ticket')===key).querySelector('td.dv-live-ticket-owner');
 const alex=owner('AA-1').querySelector('a');assert.ok(alex,'linked owner');assert.equal(alex.textContent,'Alex');assert.equal(alex.getAttribute('href'),'https://jira.test/wiki/people/557058:0f1a-2b3c');
 assert.equal(alex.getAttribute('target'),'_blank');assert.match(alex.getAttribute('rel'),/\bnoopener\b/);assert.match(alex.className,/\bnbacklink\b/,'same look as other panel links');
 assert.equal(owner('BB-1').querySelector('a'),null,'no id, plain text');assert.equal(textOf(owner('BB-1')).trim(),'Sam');
 assert.equal(owner('CC-1').querySelector('a').getAttribute('href'),'https://jira.test/wiki/people/a%20b%2Fc%3Fd','id is URL-encoded');
 assert.equal(owner('DD-1').querySelector('a'),null,'blank id, plain text');assert.equal(owner('EE-1').querySelector('a'),null,'id without a name stays Unassigned');assert.equal(textOf(owner('EE-1')).trim(),'Unassigned');
 assert.equal(rows.find(el=>el.getAttribute('data-live-ticket')==='AA-1').querySelectorAll('img').length,0,'no avatar');
 api.apply({'AA-1':{state:'done',assignee:'Alex'}});assert.equal(owner('AA-1').querySelector('a'),null,'link leaves when the id leaves');assert.equal(textOf(owner('AA-1')).trim(),'Alex');api.destroy();
 const raw=epicFixture();delete raw.page.tracking.jira.site;const nosite=harness(raw);mountStatus(nosite);
 nosite.ctl.liveStatus.apply({'AA-1':{state:'done',assignee:'Alex',assigneeId:'557058:0f1a-2b3c',url:'https://elsewhere.test/browse/AA-1'}});
 const cell=nosite.view.querySelectorAll('.dv-live-tickets tbody tr[data-live-ticket]').find(el=>el.getAttribute('data-live-ticket')==='AA-1').querySelector('td.dv-live-ticket-owner');assert.equal(cell.querySelector('a'),null,'no site, plain text');assert.equal(textOf(cell).trim(),'Alex');nosite.ctl.liveStatus.destroy();
});
test('O2 #764 provider demo and docs carry the assignee accountId',()=>{
 const C=providerContext(),issue=jira('AA-1');issue.fields.assignee.accountId='557058:0f1a-2b3c';
 const result=plain(C.liveStatusJiraMap(['AA-1','BB-1'],[[issue,jira('BB-1')]],new Set(),'https://jira.test/'));
 assert.equal(result['AA-1'].assigneeId,'557058:0f1a-2b3c');assert.equal(result['AA-1'].assignee,'Alex');assert.equal(result['BB-1'].assigneeId,undefined,'absent accountId stays absent');
 const blank=jira('CC-1');blank.fields.assignee.accountId='';assert.equal(plain(C.liveStatusJiraMap(['CC-1'],[[blank]],new Set(),''))['CC-1'].assigneeId,undefined,'empty accountId is dropped');
 const S=storyContext(),demo=plain(S.liveStatusDemoMap({issues:{'AA-1':{state:'done',assignee:'Alex',assigneeId:'557058:0f1a-2b3c'},'BB-1':{state:'todo',assignee:'Sam'}}},['AA-1']));
 assert.equal(demo['AA-1'].assigneeId,'557058:0f1a-2b3c');assert.equal(demo['BB-1'].assigneeId,undefined);
 const timeline=JSON.parse(fs.readFileSync('examples/live-status/live-status.timeline.json','utf8'));
 for(const day of timeline.days)for(const [key,entry] of Object.entries(day.issues))assert.match(entry.assigneeId || '',/\S/,'timeline '+key+' names an accountId for the demo');
 assert.match(fs.readFileSync('docs/live-status.md','utf8'),/wiki\/people/);assert.match(fs.readFileSync('src/native/mount.d.ts','utf8'),/assigneeId\?: string/);
});
/* G1: #758 embedded agent guide. The panel points editors at the guide block only when the document carries it. */
test('G1 panel shows the agent-guide line only when the document carries the dv-agent-guide block',()=>{
 const text="Editors: ask your agent to read this page's agent guide (id dv-agent-guide)";
 const bare=harness(fixture());let status=mountStatus(bare);assert.equal(bare.view.querySelector('.dv-live-agent-guide'),null,'no guide block, no line');
 bare.ctl.liveStatus.apply(fixed);assert.ok(bare.view.querySelector('.dv-live-panel-body'));assert.equal(bare.view.querySelector('.dv-live-agent-guide'),null,'still none with data');status.destroy();bare.ctl.liveStatus.destroy();
 const h=harness(fixture());h.doc.appendChild(new Element('script',{type:'text/markdown',id:'dv-agent-guide'}));status=mountStatus(h);
 let line=h.view.querySelector('.dv-live-agent-guide');assert.ok(line,'line present before any data');assert.equal(line.textContent,text);assert.equal(line.tagName,'p');
 h.ctl.liveStatus.apply(fixed);const body=h.view.querySelector('.dv-live-panel-body');assert.ok(body);const after=h.view.querySelector('.dv-live-agent-guide');assert.ok(after===line,'identity retained across repaint');assert.equal(after.textContent,text);
 const children=status.body.children;assert.ok(children.indexOf(after)>children.indexOf(body),'line follows the panel body');
 assert.equal(h.view.querySelectorAll('.dv-live-agent-guide').length,1);
 const d=h.C.PanelRegistry.get('live-status');assert.match(d.styles,/\.dv-live-agent-guide\{[^}]*--dfaint/);
 status.destroy();h.ctl.liveStatus.destroy();
});
/* G1–G12 GitHub enrichment contract (#756): connector payloads match the captured schema.
   Rulings (Chuck, 2026-10-27): PR links stay an icon in the PRs column; GitHub state, checks and
   review colour the icon and fill its tooltip; no "time since updated" text; a missing GitHub
   connector leaves plain links and is reported on the header connection line. Browser rows
   cover real icon colours and desktop scope Undo/Redo/export. */
const ghURL=n=>'https://github.com/acme/firmware/pull/'+n;
const ghFixture=()=>({page:{tracking:{jira:{site:'https://jira.test'},github:{repos:['acme/firmware']}},sections:[{diagram:{nodes:{a:{tickets:['AA-1'],prs:[ghURL(742),'https://code.test/pull/1']},b:{tickets:['BB-1'],prs:[ghURL(742)]}},rows:[['a','b']]}}]}});
const GH_FIELDS=['number','title','state','html_url','user','pull_request','repository_url','draft'];
function githubHarness(raw=ghFixture()){
 const h=providerHarness(raw);h.servers.push({server:'GitHub',tools:[{name:'search_pull_requests'},{name:'pull_request_read'}]});
 h.github=()=>h.watches.filter(w=>w.tool==='search_pull_requests'||w.tool==='pull_request_read');
 h.search=key=>h.github().find(w=>w.input.query?.startsWith('"'+key+'"'));
 h.reads=method=>h.github().filter(w=>w.input.method===method);
 h.deliver=(w,payload)=>{assert.ok(w,'GitHub watch exists');w.handler({type:'data',result:{payload}});};
 h.icons=root=>root.querySelectorAll('a.dv-live-pr-link').filter(a=>a.getAttribute('data-pr-state'));
 h.ghConnection=()=>h.view.querySelector('.dv-live-connection-github');
 h.openPopover=id=>{const card=h.view.querySelector('g.node[data-dv-node="'+id+'"] .card');h.view.dispatchEvent({type:'click',target:card,button:0,preventDefault(){},stopPropagation(){}});return h.view.querySelector('.dv-live-popover');};
 return h;
}
const searchPR=(number,state='open',extra={})=>({number,title:'PR '+number,state,html_url:ghURL(number),repository_url:'https://api.github.com/repos/acme/firmware',user:{login:'sam'},updated_at:'2026-10-27T12:00:00Z',pull_request:{html_url:ghURL(number)},draft:false,...extra});
test('G1 GitHub scope normalizes and warns per malformed entry without mutating authored data',()=>{
 const {C}=harness();assert.equal(typeof C.trackingGithubScope,'function');
 for(const [value,want,count] of [[{repos:['acme/a','bad','acme/a',null,'acme/b'],org:'team'},{repos:['acme/a','acme/b'],org:'team'},2],[{repos:'acme/a',org:'bad org'},{repos:[],org:null},2],[null,{repos:[],org:null},1],[[],{repos:[],org:null},1],[{},{repos:[],org:null},0]]){
  const raw=ghFixture();raw.page.tracking.github=value;const before=JSON.stringify(raw);assert.deepEqual(plain(C.trackingGithubScope(raw.page)),want);
  const result=C.validate(C.normalize(raw));assert.deepEqual(plain(result.errors),[]);assert.equal(result.warnings.filter(w=>w.includes('tracking.github')).length,count);assert.equal(JSON.stringify(raw),before);
 }
 assert.deepEqual(plain(C.trackingGithubScope({})),{repos:[],org:null});
});
test('G2 GitHub selection requires both tools prefers GitHub then first qualifying; absence is silent except on the connection line',async()=>{
 for(const preferred of [true,false]){
  const h=githubHarness();h.servers.splice(1,0,{server:'Other code',tools:['search_pull_requests','pull_request_read']});if(!preferred)h.servers[2].tools=['search_pull_requests'];
  await h.start();assert.ok(h.github().length);assert.ok(h.github().every(w=>w.server===(preferred?'GitHub':'Other code')));
  assert.equal(h.ghConnection().getAttribute('data-state'),'connecting');assert.equal(h.ghConnection().textContent,'GitHub connecting');h.data(0,[jira('AA-1')]);h.deliver(h.search('AA-1'),{items:[]});
  assert.equal(h.ghConnection().getAttribute('data-state'),'connected');assert.equal(plain(h.ctl.liveStatus.snapshot()).connection.github.state,'connected');assert.equal(h.view.querySelector('.dv-live-connection').getAttribute('data-state'),'connected');h.ctl.liveStatus.destroy();
 }
 const h=providerHarness(ghFixture());await h.start();h.data(0,[jira('AA-1')]);assert.ok(h.watches.every(w=>w.server==='Atlassian MCP'));assert.equal(h.view.querySelector('.dv-live-note').textContent,'');assert.equal(h.ctl.liveStatus.state('AA-1').prs,undefined);
 assert.equal(h.view.querySelector('.dv-live-connection-github').textContent,'','#1022 no GitHub text without a connector');assert.equal(h.view.querySelector('.dv-live-connection-github').getAttribute('data-state'),'disconnected');assert.equal(h.view.querySelector('.dv-live-connection-github').hidden,true);
 assert.equal(h.view.querySelector('tr[data-live-ticket="AA-1"]').querySelectorAll('a.dv-live-pr-link').length,2,'plain authored icons stay');assert.equal(h.view.querySelector('tr[data-live-ticket="AA-1"]').querySelectorAll('a.dv-live-pr-link').filter(a=>a.getAttribute('data-pr-state')).length,0);h.ctl.liveStatus.destroy();
 // A page without GitHub links or scope never mentions GitHub.
 const plainPage=providerHarness();await plainPage.start();plainPage.data(0,[jira('AA-1')]);assert.equal(plainPage.view.querySelector('.dv-live-connection-github').hidden,true);assert.equal(plain(plainPage.ctl.liveStatus.snapshot()).connection.github.state,'none');plainPage.ctl.liveStatus.destroy();
});
test('G3 search scopes use separate repo queries org or authored repos only and map all PR states',async()=>{
 for(const [scope,expected,authored] of [[{repos:['acme/a','acme/b'],org:'ignored'},[' repo:acme/a',' repo:acme/b'],true],[{org:'acme'},[' org:acme'],true],[undefined,[' repo:acme/firmware'],true],[undefined,[],false]]){
  const raw=ghFixture();raw.page.tracking.github=scope;if(!authored)for(const node of Object.values(raw.page.sections[0].diagram.nodes))delete node.prs;
  const h=githubHarness(raw);await h.start();const watches=h.github().filter(w=>w.tool==='search_pull_requests');assert.deepEqual(watches.filter(w=>w.input.query.startsWith('"AA-1"')).map(w=>w.input.query),expected.map(s=>'"AA-1" in:title,body'+s));
  if(expected.length){assert.ok(watches.length);for(const w of watches){assert.equal(w.input.perPage,20);assert.deepEqual(w.input.fields,GH_FIELDS);assert.deepEqual(w.opts,{refetchInterval:300000});}}
  h.ctl.liveStatus.destroy();
 }
 const h=githubHarness();await h.start();h.data(0,[jira('AA-1')]);h.deliver(h.search('AA-1'),{items:[searchPR(755,'closed',{pull_request:{html_url:ghURL(755),merged_at:'2026-10-27T10:00:00Z'}}),searchPR(700,'open',{draft:true}),searchPR(701,'closed'),searchPR(743)]});
 const links=h.ctl.liveStatus.state('AA-1').prs?.links;assert.ok(links);assert.deepEqual(plain(links.map(p=>p.state)),['merged','draft','closed','open']);assert.equal(links[0].mergedAt,'2026-10-27T10:00:00Z');assert.equal(links[0].repo,'acme/firmware');assert.equal(links[0].author,'sam');assert.equal(links[0].source,'github-search');assert.equal(links[0].url,ghURL(755));
 assert.equal(links[0].updatedAt,undefined,'no update times travel with a link');assert.deepEqual([links[0].checks,links[0].review],['none','none']);h.ctl.liveStatus.destroy();
});
test('G4 authored GitHub URLs get one trimmed PR watch per URL and non-GitHub links stay plain',async()=>{
 const h=githubHarness();await h.start();h.data(0,[jira('AA-1'),jira('BB-1')]);const gets=h.reads('get');assert.equal(gets.length,1);assert.deepEqual(gets[0].input,{method:'get',owner:'acme',repo:'firmware',pullNumber:742});
 h.deliver(gets[0],{number:742,title:'Authored title',state:'closed',merged:true,draft:false,html_url:ghURL(742),user:{login:'alex'},updated_at:'2026-10-27T13:00:00Z',merged_at:'2026-10-27T12:00:00Z',head:{ref:'feature'}});
 for(const key of ['AA-1','BB-1']){const p=h.ctl.liveStatus.state(key).prs?.links?.[0];assert.ok(p);assert.equal(p.state,'merged');assert.equal(p.title,'Authored title');assert.equal(p.source,'authored');assert.equal(p.author,'alex');assert.equal(p.mergedAt,'2026-10-27T12:00:00Z');assert.equal(p.branch,'feature');}
 assert.equal(h.reads('get_check_runs').length,0);assert.equal(h.reads('get_reviews').length,0,'merged PRs are not followed');
 const row=h.view.querySelector('tr[data-live-ticket="AA-1"]'),icons=row.querySelectorAll('a.dv-live-pr-link');assert.deepEqual(icons.map(a=>a.getAttribute('href')),[ghURL(742),'https://code.test/pull/1']);
 assert.equal(icons[0].getAttribute('data-pr-state'),'merged');assert.match(icons[0].getAttribute('title'),/^#742 Authored title\nmerged\nalex · acme\/firmware$/);assert.equal(icons[0].getAttribute('aria-label'),'Pull request #742 Authored title · merged · alex · acme/firmware');assert.equal(icons[0].querySelector('.dv-live-pr-checks'),null);
 assert.equal(icons[1].getAttribute('data-pr-state'),null);assert.equal(icons[1].getAttribute('aria-label'),'Pull request #1 on code.test');assert.equal(icons[1].getAttribute('title'),'https://code.test/pull/1');assert.equal(row.querySelector('.dv-live-pr-summary'),null,'a count equal to the icons adds nothing');h.ctl.liveStatus.destroy();
});
test('G5 check runs roll up failure pending passing and none; reviews take the latest decision; open and draft PRs use checks and reviews not legacy status',async()=>{
 const C=providerContext();assert.equal(typeof C.liveStatusGithubChecks,'function');assert.equal(typeof C.liveStatusGithubReviews,'function');
 const complete=conclusion=>({status:'completed',conclusion});
 for(const failure of ['failure','timed_out','action_required','startup_failure','cancelled'])assert.equal(C.liveStatusGithubChecks({check_runs:[{status:'queued'},complete(failure)]}),'failing');
 for(const status of ['queued','in_progress','waiting','requested','pending'])assert.equal(C.liveStatusGithubChecks({check_runs:[complete('success'),{status}]}),'pending');
 assert.equal(C.liveStatusGithubChecks({check_runs:['success','neutral','skipped'].map(complete)}),'passing');assert.equal(C.liveStatusGithubChecks({check_runs:[]}),'none');assert.equal(C.liveStatusGithubChecks(null),'none');
 const review=(state,login)=>({state,user:{login}});
 assert.equal(C.liveStatusGithubReviews([review('COMMENTED','a')]),'commented');assert.equal(C.liveStatusGithubReviews({reviews:[review('APPROVED','a'),review('COMMENTED','b')]}),'approved');
 assert.equal(C.liveStatusGithubReviews([review('APPROVED','a'),review('CHANGES_REQUESTED','b')]),'changes-requested');assert.equal(C.liveStatusGithubReviews([review('CHANGES_REQUESTED','a'),review('APPROVED','a')]),'approved','latest decision per reviewer');
 assert.equal(C.liveStatusGithubReviews([review('APPROVED','a'),review('DISMISSED','a')]),'none');assert.equal(C.liveStatusGithubReviews([review('PENDING','a')]),'none');assert.equal(C.liveStatusGithubReviews(null),'none');
 const h=githubHarness();await h.start();h.data(0,[jira('AA-1')]);h.deliver(h.search('AA-1'),{items:[searchPR(742),searchPR(700,'open',{draft:true}),searchPR(701,'closed')]});h.deliver(h.reads('get')[0],searchPR(742));
 const checks=h.reads('get_check_runs'),reviews=h.reads('get_reviews');assert.deepEqual(checks.map(w=>w.input.pullNumber).sort(),[700,742]);assert.deepEqual(reviews.map(w=>w.input.pullNumber).sort(),[700,742]);assert.equal(h.reads('get_status').length,0);
 h.deliver(checks.find(w=>w.input.pullNumber===742),{check_runs:[complete('failure')]});h.deliver(reviews.find(w=>w.input.pullNumber===742),[review('CHANGES_REQUESTED','kim')]);
 const pr=h.ctl.liveStatus.state('AA-1').prs.links.find(p=>p.number===742);assert.equal(pr.checks,'failing');assert.equal(pr.review,'changes-requested');
 const icon=h.icons(h.view.querySelector('tr[data-live-ticket="AA-1"]')).find(a=>a.getAttribute('href')===ghURL(742));assert.equal(icon.querySelector('.dv-live-pr-checks').getAttribute('data-checks'),'failing');assert.match(icon.getAttribute('title'),/open · checks failing · changes requested/);
 h.deliver(checks.find(w=>w.input.pullNumber===742),{check_runs:[complete('success')]});assert.equal(icon.querySelector('.dv-live-pr-checks').getAttribute('data-checks'),'passing');h.ctl.liveStatus.destroy();
});
test('G6 G7 merge URLs authored first retain Jira summary render icons and never change carrier class or activity',async()=>{
 const h=githubHarness();await h.start();const issue=jira('AA-1');issue.fields.customFields={Development:'json='+JSON.stringify({cachedValue:{summary:{pullrequest:{overall:{count:9,state:'OPEN'}}}}})};h.data(0,[issue]);
 const node=h.view.querySelector('g.node[data-dv-node="a"]'),before=node.className;
 h.deliver(h.search('AA-1'),{items:[searchPR(755,'closed',{pull_request:{html_url:ghURL(755),merged_at:'2026-10-27'}}),searchPR(742)]});h.deliver(h.reads('get')[0],searchPR(742,'open',{title:'Authored'}));
 const prs=h.ctl.liveStatus.state('AA-1').prs;assert.equal(prs.count,9);assert.equal(prs.state,'open');assert.deepEqual(plain(prs.links.map(p=>p.number)),[742,755]);assert.equal(prs.links[0].source,'authored');assert.equal(node.className,before);
 assert.equal(h.view.querySelectorAll('.dv-live-activity-entry').length,0);const row=h.view.querySelector('tr[data-live-ticket="AA-1"]'),icons=h.icons(row);assert.equal(icons.length,2);
 assert.deepEqual(icons.map(a=>[a.getAttribute('href'),a.getAttribute('data-pr-state')]),[[ghURL(742),'open'],[ghURL(755),'merged']]);assert.match(icons[0].getAttribute('title'),/^#742 Authored\nopen\nsam · acme\/firmware$/);assert.match(icons[1].getAttribute('aria-label'),/^Pull request #755 PR 755 · merged/);
 for(const a of row.querySelectorAll('a'))assert.doesNotMatch(textOf(a)+a.getAttribute('title')+a.getAttribute('aria-label'),/ago|updated/i,'no time since updated');
 assert.equal(row.querySelector('.dv-live-pr-summary').textContent,'9 open','Jira knows more PRs than the icons show');
 const pop=h.openPopover('a');assert.ok(pop);assert.equal(h.icons(pop).length,2);assert.ok(pop.querySelectorAll('span').some(el=>el.textContent==='PRs: 9 open'));h.ctl.liveStatus.destroy();
});
test('G8 GitHub rate-limit tool error retries once preserves PR evidence keeps notes out of the Live chip and reports on the connection line',async()=>{
 const h=githubHarness();await h.start();h.data(0,[jira('AA-1')]);const w=h.search('AA-1');h.deliver(w,{items:[searchPR(755,'closed')]});h.deliver(h.search('BB-1'),{items:[]});h.deliver(h.reads('get')[0],searchPR(742,'closed',{merged:true}));const before=plain(h.ctl.liveStatus.state('AA-1').prs);let retries=0;
 assert.equal(h.ghConnection().getAttribute('data-state'),'connected');assert.equal(h.ghConnection().getAttribute('data-busy'),'false');
 h.mcp.callTool=async(server,tool,input)=>{assert.equal(server,'GitHub');assert.equal(tool,'search_pull_requests');retries++;throw {code:'tool_error',message:'API rate limit exceeded'};};
 w.handler({type:'error',error:{code:'tool_error',message:'API rate limit exceeded'}});const retry=[...h.timers.entries()].find(([,t])=>t.ms>=1000&&t.ms<=3000);assert.ok(retry,'randomized retry delay');
 assert.equal(h.ghConnection().getAttribute('data-state'),'error');assert.equal(h.ghConnection().getAttribute('data-busy'),'true');assert.equal(h.ghConnection().textContent,'GitHub did not answer');
 h.timers.delete(retry[0]);retry[1].fn();await settle();assert.equal(retries,1);assert.equal(h.timers.size,0);assert.deepEqual(plain(h.ctl.liveStatus.state('AA-1').prs),before);assert.equal(h.ctl.liveStatus.state('AA-1').state,'active');assert.equal(h.view.querySelector('.dv-live-note').textContent,'');
 assert.equal(h.ghConnection().getAttribute('data-state'),'error');assert.equal(h.ghConnection().getAttribute('data-busy'),'false');assert.equal(h.view.querySelector('.dv-live-connection').getAttribute('data-state'),'connected','Jira state is untouched');
 w.handler({type:'error',error:{code:'blocked_by_policy'}});assert.equal(h.ctl.liveStatus.state('AA-1').state,'active');assert.equal(h.timers.size,0);assert.equal(h.ghConnection().getAttribute('data-state'),'disconnected');assert.equal(h.ghConnection().textContent,'','#1022 no GitHub text after access is denied');
 await settle();assert.ok(h.github().every(w=>w.stopped===1),'policy answers retire every GitHub watch');assert.deepEqual(plain(h.ctl.liveStatus.state('AA-1').prs),before,'evidence already shown stays');h.ctl.liveStatus.destroy();
});
test('G8 queues GitHub watches at ten rotates fairly at 5 minutes and retires late callbacks',async()=>{
 const raw=ghFixture();raw.page.sections[0].diagram.nodes={a:{tickets:Array.from({length:25},(_,i)=>'AA-'+i)}};const h=githubHarness(raw);await h.start();assert.equal(h.github().filter(w=>!w.stopped).length,10);assert.equal(h.github().length,10);
 for(let i=0;i<3;i++){const timer=[...h.timers.entries()].find(([,t])=>t.ms===300000);assert.ok(timer);h.timers.delete(timer[0]);timer[1].fn();await settle();assert.ok(h.github().filter(w=>!w.stopped).length<=10);}
 assert.equal(new Set(h.github().map(w=>w.input.query)).size,25,'queued tickets must eventually be watched');h.ctl.liveStatus.destroy();await settle();assert.ok(h.github().every(w=>w.stopped===1));assert.equal(h.timers.size,0);h.deliver(h.github()[0],{items:[searchPR(742)]});assert.equal(h.ctl.liveStatus.state('AA-0'),null);
});
test('G9 demo links survive mapping and G10 G12 docs scope and rebuilt example expose GitHub enrichment',()=>{
 const C=storyContext(),timeline=JSON.parse(fs.readFileSync('examples/live-status/live-status.timeline.json'));const day=timeline.days[7],issue=day.issues['FW-45'];assert.ok(issue.prs.links?.length);assert.deepEqual(plain(C.liveStatusDemoMap(day,[]))['FW-45'].prs.links,issue.prs.links);
 for(const d of timeline.days)for(const [key,entry] of Object.entries(d.issues))for(const link of entry.prs.links||[]){assert.ok(/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(link.url),key);assert.ok(['open','draft','merged','closed'].includes(link.state));assert.equal(link.state==='merged',entry.prs.state==='MERGED',d.label+' '+key);assert.equal(link.updatedAt,undefined);}
 const doc=fs.readFileSync('docs/live-status.md','utf8');for(const text of ['## Pull requests from GitHub','https://api.githubcopilot.com/mcp/','OAuth','search_pull_requests','pull_request_read','get_check_runs','get_reviews','get_status','GitHub scope','tracking.github'])assert.ok(doc.includes(text),text);
 assert.match(fs.readFileSync('.claude/skills/live-status-board/SKILL.md','utf8').split('## 4. Publish')[1],/GitHub.*search_pull_requests.*pull_request_read/);
 assert.match(fs.readFileSync('.claude/skills/hld-to-page/references/integrations.md','utf8'),/search_pull_requests.*pull_request_read/);
 assert.match(fs.readFileSync('src/workbench/inspector.js','utf8'),/GitHub scope/);const built=fs.readFileSync('examples/live-status/live-status.html','utf8');assert.match(built,/search_pull_requests/);assert.match(built,/dv-live-pr/);
});
test('G11 a host provider may hand links directly; apply sanitizes them and the icons follow',()=>{
 const h=harness(fixture()),api=h.ctl.liveStatus;mountStatus(h);
 api.apply({'AA-1':{state:'active',prs:{links:[{url:'https://github.com/x/y/pull/1',number:1,title:'One',state:'open',checks:'failing',review:'approved',author:'kim',repo:'x/y',source:'github-search'},{url:'https://github.com/x/y/pull/1'},{url:'javascript:alert(1)'},{url:'https://github.com/x/y/pull/2',state:'bogus',checks:'bogus',review:'bogus',number:-2,updatedAt:'2026-01-01'}]}},'BB-1':{state:'done',prs:{count:3,state:'merged',links:[{url:'https://github.com/x/y/pull/3',state:'merged'}]}}});
 assert.deepEqual(plain(api.state('AA-1').prs),{count:2,state:'open',links:[{url:'https://github.com/x/y/pull/1',state:'open',checks:'failing',review:'approved',source:'github-search',number:1,title:'One',repo:'x/y',author:'kim'},{url:'https://github.com/x/y/pull/2',state:'open',checks:'none',review:'none',source:'authored'}]});
 assert.deepEqual(plain(api.state('BB-1').prs),{count:3,state:'merged',links:[{url:'https://github.com/x/y/pull/3',state:'merged',checks:'none',review:'none',source:'authored'}]});
 const row=h.view.querySelector('tr[data-live-ticket="AA-1"]'),icons=row.querySelectorAll('a.dv-live-pr-link');assert.deepEqual(icons.map(a=>a.getAttribute('data-pr-state')),['open','open']);assert.equal(icons[0].querySelector('.dv-live-pr-checks').getAttribute('data-checks'),'failing');assert.equal(icons[1].querySelector('.dv-live-pr-checks'),null);
 assert.equal(icons[1].getAttribute('aria-label'),'Pull request #2 · open');assert.equal(h.view.querySelector('tr[data-live-ticket="BB-1"] .dv-live-pr-summary').textContent,'3 merged');
 api.apply({'AA-1':{state:'active'}});assert.equal(api.state('AA-1').prs,undefined);assert.equal(row.querySelectorAll('a.dv-live-pr-link').length,0);api.destroy();
});

test('imported consumer tracking drives refs, carrier coverage, dependencies, readiness and refresh without local carriers',()=>{
 const seed=harness(),C=seed.C;seed.ctl.liveStatus.destroy();
 const model=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram:d}]}});
 const provider=model('provider',{nodes:{api:{title:'API'},db:{title:'DB'}},rows:[['api','db']],edges:[{from:'api',to:'db',label:'Persist'}],topologyExports:{core:{nodes:['api','db'],edges:['api->db']}}});
 const consumer=model('consumer',{nodes:{},rows:[[]],topologyImports:[{spec:'provider',export:'core',as:'canon',nodeTracking:{api:{tickets:['AA-1']},db:{tickets:['AA-2']}},edgeTracking:{'api->db':{tickets:['AA-2'],prs:['https://github.com/acme/api/pull/1']}}}],steps:[{id:'persist',edge:'canon::api->canon::db'}]});
 consumer.page.tracking={jira:{site:'https://jira.test'},dependencies:[{ticket:'AA-2',on:'AA-1'}]};
 const resolved=C.FlowTopology.materialize([provider,consumer])[1],h=harness(resolved),api=h.ctl.liveStatus;
 assert.deepEqual(plain(api.refs()).tickets,['AA-1','AA-2']);assert.deepEqual(plain(api.refs()).prs,['https://github.com/acme/api/pull/1']);
 api.apply({'AA-1':{state:'blocked'},'AA-2':{state:'todo'}});
 const snap=api.snapshot();
 assert.deepEqual(plain(snap.counts),{todo:1,active:0,testing:0,done:0,blocked:1,missing:0});
 assert.equal(snap.readiness.total,3);assert.equal(snap.readiness.done,0);assert.equal(snap.readiness.ready,false);assert.equal(snap.readiness.blockers,1);
 assert.deepEqual(plain(snap.coverage.onDiagram),['AA-1','AA-2']);
 const d=h.ctl.page.sections[0].diagram;
 assert.ok(h.view.querySelector('path.edge').classList.contains('dv-live-waiting'));
 assert.ok(h.view.querySelector('g.coin').classList.contains('dv-live-todo'),'the imported edge is todo despite its blocked implicit endpoint');
 assert.equal(C.liveStatusCaption(d,d.steps[0],{'AA-1':{state:'blocked'},'AA-2':{state:'todo'}}),'TODO · 1 tickets');
 assert.equal(C.liveStatusStep(d,{...d.steps[0],nodes:['canon::api']},{'AA-1':{state:'blocked'},'AA-2':{state:'todo'}}),'blocked','an explicitly added imported endpoint participates');
 assert.equal(C.liveStatusCaption(d,{...d.steps[0],nodes:['canon::api']},{'AA-1':{state:'blocked',detail:'Provider work'},'AA-2':{state:'todo'}}),'BLOCKED · AA-1 · Provider work');
 api.apply({'AA-1':{state:'done'},'AA-2':{state:'done'}});
 assert.equal(api.snapshot().readiness.total,3);assert.equal(api.snapshot().readiness.done,3);assert.equal(api.snapshot().readiness.ready,true);
 assert.equal(h.view.querySelectorAll('.dv-live-waiting').length,0);
 assert.deepEqual(Object.keys(consumer.page.sections[0].diagram.nodes),[]);assert.equal(consumer.page.sections[0].diagram.edges,undefined);
 api.destroy();
});

/* Initiative support reuses the existing parent roots; no authored type selector. */
const initiativeFixture=(parents=['IN-1'],tickets=[])=>({page:{tracking:{jira:{site:'https://jira.test',epic:parents}},sections:[{id:'main',diagram:{nodes:{a:{title:'Delivery',tickets}},rows:[['a']],steps:[{id:'delivery',nodes:['a']}],panels:[{id:'status',type:'live-status',title:'Delivery status'}]}}]}});
function hierarchyIssue(key,level,category='indeterminate',parent){
 const issue=jira(key,category);issue.fields.issuetype={name:level===2?'Custom program':level===1?'Delivery epic':'Task',hierarchyLevel:level};
 if(parent)issue.fields.parent={key:parent,fields:{summary:'Work '+parent,status:{statusCategory:{key:'indeterminate'}},issuetype:{hierarchyLevel:level+1}}};return issue;
}
function hierarchyWatch(h,jql){const watch=h.watches.find(w=>!w.stopped && w.input.jql===jql);assert.ok(watch,'active query '+jql);return watch;}
function hierarchyData(h,jql,issues,extra={}){hierarchyWatch(h,jql).handler({type:'data',result:{payload:{issues,...extra}}});}
function hierarchyBranch(h,key,issues){hierarchyData(h,'parent = '+key,issues);hierarchyData(h,'parent = '+key+' AND Flagged = Impediment',[]);}
async function completeInitiative(parents=['IN-1'],tickets=[]){
 const h=providerHarness(initiativeFixture(parents,tickets),{},false);await h.start();
 hierarchyData(h,'key in ('+parents.join(', ')+')',parents.map(key=>hierarchyIssue(key,key.startsWith('IN-')?2:1)));
 hierarchyBranch(h,'IN-1',[hierarchyIssue('EP-1',1,'indeterminate','IN-1'),hierarchyIssue('EP-2',1,'indeterminate','IN-1')]);
 if(tickets.length){hierarchyData(h,'key in ('+tickets.join(', ')+')',tickets.map(key=>hierarchyIssue(key,0,'done','EP-1')));hierarchyData(h,'key in ('+tickets.join(', ')+') AND Flagged = Impediment',[]);}
 hierarchyBranch(h,'EP-1',[hierarchyIssue('ST-1',0,'done','EP-1'),hierarchyIssue('ST-2',0,'indeterminate','EP-1')]);
 hierarchyBranch(h,'EP-2',[hierarchyIssue('ST-3',0,'new','EP-2')]);return h;
}
test('I1 parent roots auto-detect custom hierarchy types; two levels produce distinct story-only totals and coverage',async()=>{
 const h=await completeInitiative(['IN-1','EP-1'],['ST-1']);
 hierarchyData(h,'parent = EP-2 AND Flagged = Impediment',[hierarchyIssue('ST-3',0,'new','EP-2')]);
 const api=h.ctl.liveStatus,s=plain(api.snapshot());assert.deepEqual(s.epic.keys,['IN-1','EP-1']);assert.equal(s.epic.title,'Work IN-1');assert.deepEqual(s.epic.epics,['EP-1','EP-2']);assert.equal(s.epic.stories,3);assert.equal(s.epic.done,1);assert.equal(s.epic.onDiagram,1);
 assert.deepEqual(s.tickets.map(t=>t.key).sort(),['ST-1','ST-2','ST-3']);assert.deepEqual(s.coverage.notInEpic,[]);assert.deepEqual(s.coverage.notOnDiagram.sort(),['ST-2','ST-3']);assert.ok(s.tickets.every(t=>/^epic EP-/.test(t.epicLabel)));assert.equal(s.blockers[0].key,'ST-3');assert.equal(s.readiness.ready,true,'readiness remains about diagram carriers');
 assert.match(textOf(h.view.querySelector('.dv-live-scope')),/Initiative · 2 epics/);assert.match(textOf(h.view.querySelector('.dv-live-epic-counts')),/Diagram ready to demo/);
 assert.equal(h.watches.filter(w=>w.input.jql==='parent = EP-1').length,1,'explicit and discovered epic share a watch');
 assert.ok(h.watches.every(w=>w.input.fields.includes('parent') && w.input.fields.includes('issuetype')));
 assert.equal(api.state('EP-1').kind,'epic');assert.deepEqual(plain(api.state('ST-2').initiatives),['IN-1']);assert.equal(api.state('ST-2').parent,'EP-1');api.destroy();
});
test('I2 initiative-only and empty roots have their own metadata; pre-detection epic rows never become stories',async()=>{
 const h=providerHarness(initiativeFixture(),{},false);await h.start();
 hierarchyData(h,'parent = IN-1',[hierarchyIssue('EP-1',1,'indeterminate','IN-1')]);assert.equal(h.ctl.liveStatus.snapshot().hasData,false);
 const root=hierarchyIssue('IN-1',2);delete root.fields.issuetype.hierarchyLevel;root.fields.issuetype.name='Initiative';
 hierarchyData(h,'key in (IN-1)',[root]);hierarchyData(h,'parent = IN-1 AND Flagged = Impediment',[]);
 hierarchyBranch(h,'EP-1',[]);let s=plain(h.ctl.liveStatus.snapshot());assert.equal(s.epic.title,'Work IN-1');assert.equal(s.epic.stories,0);assert.equal(s.epic.epics.length,1);assert.equal(s.tickets.length,0);
 hierarchyBranch(h,'IN-1',[]);s=plain(h.ctl.liveStatus.snapshot());assert.equal(s.epic.title,'Work IN-1');assert.equal(s.epic.stories,0);assert.equal(s.epic.epics.length,0);assert.equal(s.readiness.ready,false);assert.equal(s.epic.state,'active');assert.equal(s.available,true);
 assert.equal(h.view.querySelector('.dv-live-epic-progress').hidden,false);assert.equal(h.ctl.liveStatus.state('EP-1'),null);h.ctl.liveStatus.destroy();
});
test('I3 root, story and flagged cursor chains all paginate; cycles and unexpected hierarchy containers stay out',async()=>{
 const h=providerHarness(initiativeFixture(),{},false);await h.start();hierarchyData(h,'key in (IN-1)',[hierarchyIssue('IN-1',2)]);
 const calls=[];h.mcp.callTool=async(server,tool,input)=>{calls.push(plain(input));return {payload:{issues:input.nextPageToken==='epics'?[hierarchyIssue('EP-2',1,'indeterminate','IN-1')]:input.nextPageToken==='root-flags'?[hierarchyIssue('EP-2',1)]:[hierarchyIssue('ST-2',0,'done','EP-1')]}};};
 hierarchyData(h,'parent = IN-1',[hierarchyIssue('EP-1',1),hierarchyIssue('IN-1',2),hierarchyIssue('BAD-1',0)],{nextPageToken:'epics'});
 hierarchyData(h,'parent = IN-1 AND Flagged = Impediment',[],{pageInfo:{hasNextPage:true,endCursor:'root-flags'}});await settle();
 hierarchyData(h,'parent = EP-1',[hierarchyIssue('ST-1',0,'done','EP-1'),hierarchyIssue('EP-1',1),hierarchyIssue('BAD-2',2)],{nextPageToken:'stories'});
 hierarchyData(h,'parent = EP-1 AND Flagged = Impediment',[],{nextPageToken:'story-flags'});hierarchyBranch(h,'EP-2',[hierarchyIssue('ST-1',0,'done','EP-1')]);await settle();
 const s=plain(h.ctl.liveStatus.snapshot());assert.equal(s.epic.stories,2);assert.equal(s.epic.done,1);assert.equal(h.ctl.liveStatus.state('ST-2').state,'blocked');assert.deepEqual(calls.map(c=>c.nextPageToken).sort(),['epics','root-flags','stories','story-flags']);assert.ok(!s.tickets.some(t=>t.key.startsWith('BAD-')));assert.equal(h.watches.filter(w=>w.input.jql==='parent = IN-1').length,1);h.ctl.liveStatus.destroy();
});
test('I4 failed and superseded root and flagged refreshes retain the last complete hierarchy',async()=>{
 const h=await completeInitiative(),api=h.ctl.liveStatus,before=plain(api.snapshot().states);
 h.mcp.callTool=()=>Promise.reject({code:'tool_error',message:'page failed'});
 hierarchyData(h,'parent = IN-1',[hierarchyIssue('EP-9',1)],{nextPageToken:'fail'});await settle();assert.deepEqual(plain(api.snapshot().states),before);assert.ok(!h.watches.some(w=>w.input.jql==='parent = EP-9'));
 let resolve;h.mcp.callTool=()=>new Promise(r=>resolve=r);hierarchyData(h,'parent = IN-1',[hierarchyIssue('EP-9',1)],{nextPageToken:'old'});await settle();
 hierarchyData(h,'parent = IN-1',[hierarchyIssue('EP-1',1),hierarchyIssue('EP-2',1)]);resolve({payload:{issues:[hierarchyIssue('EP-8',1)]}});await settle();assert.ok(!h.watches.some(w=>w.input.jql==='parent = EP-8' || w.input.jql==='parent = EP-9'));
 const stable=plain(api.snapshot().states);h.mcp.callTool=()=>Promise.reject({code:'tool_error',message:'flags failed'});
 hierarchyData(h,'parent = EP-1 AND Flagged = Impediment',[],{nextPageToken:'flags'});await settle();hierarchyData(h,'parent = EP-1',[hierarchyIssue('ST-4',0,'done','EP-1')]);assert.deepEqual(plain(api.snapshot().states),stable,'failed flagged evidence cannot publish new partial totals');
 hierarchyData(h,'parent = EP-1 AND Flagged = Impediment',[]);assert.equal(api.state('ST-1'),null);assert.equal(api.state('ST-4').state,'done');api.destroy();
});
test('I5 membership replacement retires old child watches and late results; explicit overlapping epics stay reachable',async()=>{
 for(const explicit of [false,true]){
  const h=await completeInitiative(explicit?['IN-1','EP-2']:['IN-1']),api=h.ctl.liveStatus,old=hierarchyWatch(h,'parent = EP-2');await settle();
  hierarchyData(h,'parent = IN-1',[hierarchyIssue('EP-1',1),hierarchyIssue('EP-3',1)]);assert.equal(api.snapshot().epic.stories,3,'wait for new branch');
  hierarchyBranch(h,'EP-3',[hierarchyIssue('ST-4',0,'done','EP-3')]);assert.equal(api.state('ST-4').epic,'EP-3');assert.equal(!!api.state('ST-3'),explicit);assert.equal(old.stopped,explicit?0:1);
  old.handler({type:'data',result:{payload:{issues:[hierarchyIssue('LATE-1',0)]}}});assert.equal(!!api.state('LATE-1'),explicit);
  api.setEnabled(false);hierarchyData(h,'parent = EP-3',[hierarchyIssue('ST-5',0,'done','EP-3')]);assert.equal(api.state('ST-5'),null);api.setEnabled(true);assert.equal(api.state('ST-5').state,'done');
  api.destroy();await settle();assert.ok(h.watches.every(w=>w.stopped===1));hierarchyDataAfterDestroy(old);assert.equal(api.state('AFTER-1'),null);assert.equal(h.timers.size,0);
 }
 function hierarchyDataAfterDestroy(w){w.handler({type:'data',result:{payload:{issues:[hierarchyIssue('AFTER-1',0)]}}});}
});
test('I6 loaded detail parent roots deduplicate and removal keeps only descendants reachable from remaining roots',async()=>{
 let detail=initiativeFixture(['IN-1','IN-2']);const options={loadDetail:async()=>detail},h=providerHarness(initiativeFixture(),options,false);await h.start();hierarchyData(h,'key in (IN-1)',[hierarchyIssue('IN-1',2)]);hierarchyBranch(h,'IN-1',[hierarchyIssue('EP-1',1)]);hierarchyBranch(h,'EP-1',[hierarchyIssue('ST-1',0)]);
 await options.loadDetail({spec:'detail'},new AbortController().signal);hierarchyData(h,'key in (IN-2)',[hierarchyIssue('IN-2',2)]);hierarchyBranch(h,'IN-2',[hierarchyIssue('EP-1',1),hierarchyIssue('EP-2',1)]);hierarchyBranch(h,'EP-2',[hierarchyIssue('ST-2',0)]);
 assert.deepEqual(plain(h.ctl.liveStatus.refs().epics),['IN-1','IN-2']);assert.equal(h.watches.filter(w=>w.input.jql==='parent = EP-1').length,1);assert.deepEqual(plain(h.ctl.liveStatus.state('ST-1').initiatives),['IN-1','IN-2']);assert.equal(h.ctl.liveStatus.snapshot().epic.stories,2);
 detail=initiativeFixture([]);await options.loadDetail({spec:'detail'},new AbortController().signal);await settle();assert.deepEqual(plain(h.ctl.liveStatus.refs().epics),['IN-1']);assert.equal(h.ctl.liveStatus.state('ST-2'),null);assert.equal(h.ctl.liveStatus.state('IN-2'),null);assert.deepEqual(plain(h.ctl.liveStatus.state('ST-1').initiatives),['IN-1']);assert.ok(h.watches.filter(w=>w.input.jql==='parent = EP-2').every(w=>w.stopped===1));h.ctl.liveStatus.destroy();
});
test('I7 runtime and demo metadata preserve initiative scope without new authored fields',()=>{
 const h=harness(initiativeFixture(['IN-1'],['ST-1'])),C=storyContext(),map=plain(C.liveStatusDemoMap({issues:{'IN-1':{state:'active',kind:'initiative',summary:'Program'},'EP-1':{state:'active',kind:'epic',initiatives:['IN-1']},'ST-1':{state:'done',epic:'EP-1',parent:'EP-1',initiatives:['IN-1']},'ST-2':{state:'blocked',epic:'EP-1',initiatives:['IN-1'],links:[{key:'ST-1',type:'depends on'}]}}},['ST-1']));
 h.ctl.liveStatus.apply(map);const s=plain(h.ctl.liveStatus.snapshot());assert.equal(s.epic.title,'Program');assert.equal(s.epic.stories,2);assert.equal(s.epic.done,1);assert.deepEqual(s.coverage.notInEpic,[]);assert.deepEqual(s.tickets.map(t=>t.key).sort(),['ST-1','ST-2']);assert.equal(h.ctl.liveStatus.state('ST-1').parent,'EP-1');assert.equal(h.ctl.page.tracking.jira.initiative,undefined);h.ctl.liveStatus.destroy();
});
test('I8 missing or unknown root types never pretend to be a completed initiative; malformed rows are ignored',async()=>{
 for(const payload of [[],[jira('IN-1')],[null,{}, {key:'not-a-key'},hierarchyIssue('IN-1',2)]]){
  const h=providerHarness(initiativeFixture(),{},false);await h.start();hierarchyData(h,'key in (IN-1)',payload);hierarchyBranch(h,'IN-1',[]);
  const s=plain(h.ctl.liveStatus.snapshot());assert.equal(s.epic.stories,0);assert.equal(s.readiness.ready,false);assert.notEqual(s.epic.state,'done');assert.equal(s.epic.initiatives.length,payload.length>1?1:0);h.ctl.liveStatus.destroy();
 }
});
test('I9 direct Epic parents publish only complete child and Flagged evidence across failures and supersession',async()=>{
 const h=providerHarness(initiativeFixture(['EP-1']),{},false);await h.start();const api=h.ctl.liveStatus;
 hierarchyData(h,'key in (EP-1)',[hierarchyIssue('EP-1',1)]);
 hierarchyData(h,'parent = EP-1',[hierarchyIssue('ST-1',0,'indeterminate','EP-1')]);
 assert.equal(api.snapshot().hasData,false,'initial child evidence waits for the Flagged answer');
 hierarchyData(h,'parent = EP-1 AND Flagged = Impediment',[]);
 const baseline=plain(api.snapshot().states);assert.equal(baseline['ST-1'].state,'active');
 let rejectPage;h.mcp.callTool=()=>new Promise((resolve,reject)=>{rejectPage=reject;});
 hierarchyData(h,'parent = EP-1 AND Flagged = Impediment',[],{nextPageToken:'pending-flags'});await settle();
 hierarchyData(h,'parent = EP-1',[hierarchyIssue('ST-1',0,'done','EP-1'),hierarchyIssue('ST-2',0,'done','EP-1')]);
 assert.deepEqual(plain(api.snapshot().states),baseline,'a successful child refresh cannot publish while Flagged pagination is in flight');
 rejectPage({code:'tool_error',message:'Flagged continuation failed'});await settle();
 hierarchyData(h,'parent = EP-1',[hierarchyIssue('ST-1',0,'done','EP-1'),hierarchyIssue('ST-2',0,'done','EP-1')]);
 assert.deepEqual(plain(api.snapshot().states),baseline,'a failed Flagged refresh retains the previous complete board');
 hierarchyData(h,'parent = EP-1 AND Flagged = Impediment',[hierarchyIssue('ST-2',0)]);
 assert.equal(api.state('ST-1').state,'done');assert.equal(api.state('ST-2').state,'blocked');
 const complete=plain(api.snapshot().states);let resolveOld;h.mcp.callTool=()=>new Promise(resolve=>{resolveOld=resolve;});
 hierarchyData(h,'parent = EP-1 AND Flagged = Impediment',[],{pageInfo:{hasNextPage:true,endCursor:'stale-flags'}});await settle();
 hierarchyData(h,'parent = EP-1',[hierarchyIssue('ST-3',0,'done','EP-1')]);assert.deepEqual(plain(api.snapshot().states),complete);
 hierarchyData(h,'parent = EP-1 AND Flagged = Impediment',[hierarchyIssue('ST-3',0)]);assert.equal(api.state('ST-3').state,'blocked');assert.equal(api.state('ST-2'),null);
 const latest=plain(api.snapshot().states);resolveOld({payload:{issues:[]}});await settle();assert.deepEqual(plain(api.snapshot().states),latest,'a superseded empty Flagged page cannot clear the current blocker');
 api.destroy();
});

test('X1 exclusion parser validates array entries without mutating source or round-trip data',()=>{
 const h=harness(),C=h.C;
 for(const [exclude,want,warnings] of [[['ST-2','ST-1','ST-2','bad',null],['ST-2','ST-1'],2],[[],[],0],['ST-1',[],1],[null,[],1],[{},[],1],[12,[],1]]){
  const raw=epicFixture();raw.page.tracking.jira.exclude=exclude;const before=JSON.stringify(raw),normalized=C.normalize(raw);
  assert.deepEqual(plain(C.trackingExclusions(normalized)),want);const result=C.validate(normalized);
  assert.deepEqual(plain(result.errors),[]);assert.equal(result.warnings.filter(w=>w.startsWith('tracking.jira.exclude')).length,warnings);
  assert.equal(JSON.stringify(raw),before);assert.deepEqual(JSON.parse(JSON.stringify(normalized)).tracking.jira.exclude,exclude);
 }
 assert.deepEqual(plain(C.trackingExclusions({})),[]);h.ctl.liveStatus.destroy();
});
function exclusionFixture(root='EP-1'){
 return {page:{tracking:{jira:{site:'https://jira.test',epic:root,exclude:['ST-2','ST-3','ST-4','ST-4','ST-5','EP-1']}},sections:[{id:'main',diagram:{
  nodes:{a:{title:'Manual additions',tickets:['ST-3','MAN-1','UNKNOWN-1','EP-1']}},rows:[['a']],edges:[{from:'a',to:'a',tickets:['ST-3','MAN-1']}],steps:[{nodes:['a']}]
 }}]}};
}
function exclusionMap(initiative=false){
 const map={'EP-1':{state:'done',kind:'epic'},'ST-1':{state:'done',epic:'EP-1'},'ST-2':{state:'done',title:'Unrelated delivery',epic:'EP-1'},
  'ST-3':{state:'done',epic:'EP-1'},'ST-4':{state:'blocked',epic:'EP-1',dependsOn:[{key:'UNRELATED-1',source:'jira'}]},
  'ST-5':{state:'todo',epic:'EP-1',dependsOn:[{key:'UNRELATED-2',source:'jira'}]},'MAN-1':{state:'done'},'OTHER-1':{state:'blocked',epic:'OTHER-2'}};
 if(initiative){map['IN-1']={state:'done',kind:'initiative'};map['EP-1'].initiatives=['IN-1'];for(const key of ['ST-1','ST-2','ST-3','ST-4','ST-5'])map[key].initiatives=['IN-1'];}
 return map;
}
test('X2 Epic and Initiative totals subtract exclusions then add all manual stories once, including unknowns',()=>{
 for(const initiative of [false,true]){
  const h=harness(exclusionFixture(initiative?['IN-1','EP-1','IN-1']:'EP-1')),api=h.ctl.liveStatus;mountStatus(h);api.apply(exclusionMap(initiative));const s=plain(api.snapshot());
  assert.equal(s.epic.stories,4);assert.equal(s.epic.done,3);assert.equal(s.epic.onDiagram,3);assert.equal(s.epic.blocked,0);assert.equal(s.epic.waiting,0);assert.equal(s.epic.outside,2);
  assert.deepEqual(s.counts,{todo:0,active:0,testing:0,done:3,blocked:0,missing:0});assert.deepEqual(s.tickets.map(row=>row.key).sort(),['MAN-1','ST-1','ST-3','UNKNOWN-1']);
  assert.deepEqual(s.coverage.notOnDiagram,['ST-1']);assert.deepEqual(s.chains,[]);assert.deepEqual(s.blockers,[]);assert.equal(s.readiness.ready,false,'unknown carrier ticket remains incomplete');
  assert.deepEqual(s.excluded.map(row=>row.key),['ST-2','ST-3','ST-4','ST-5']);assert.equal(s.excluded[1].reason,'Included by manual attachment');
  assert.equal(s.excluded[0].url,'https://jira.test/browse/ST-2');assert.equal(s.excluded[0].title,'Unrelated delivery');
  assert.equal(h.view.querySelector('.dv-live-epic-progress').textContent,'3 of 4 stories done · 3 of 4 on diagram');assert.equal(h.view.querySelectorAll('.dv-live-excluded-story').length,4);
  const before=JSON.stringify(h.ctl.page);api.setEnabled(false);assert.equal(api.snapshot().epic.done,3);assert.equal(JSON.stringify(h.ctl.page),before);api.destroy();
 }
});
test('X3 displayed upstream stories count once including excluded dependencies and transitive evidence',()=>{
 const raw=exclusionFixture(),map=exclusionMap();raw.page.tracking.dependencies=[{ticket:'ST-1',on:'ST-4'},{ticket:'ST-5',on:'UNRELATED-2'}];
 map['ST-1'].state='todo';map['UNRELATED-1']={state:'blocked'};
 const h=harness(raw),api=h.ctl.liveStatus;api.apply(map);const s=plain(api.snapshot());
 assert.equal(s.epic.stories,6);assert.equal(s.epic.done,2);assert.equal(s.epic.waiting,2);assert.equal(s.epic.blocked,2);assert.equal(s.counts.blocked,2);assert.equal(s.epic.outside,3);
 assert.deepEqual(s.tickets.filter(row=>row.tag==='DEPENDENCY ONLY').map(row=>row.key).sort(),['ST-4','UNRELATED-1']);
 assert.ok(!s.tickets.some(row=>row.key==='ST-5' || row.key==='UNRELATED-2'));assert.deepEqual(s.chains,[['UNRELATED-1','ST-4','ST-1']]);
 assert.deepEqual(s.suggestions,[{ticket:'ST-1',on:'ST-4'}]);assert.equal(s.excluded.find(row=>row.key==='ST-4').included,true);assert.equal(s.excluded.find(row=>row.key==='ST-4').reason,'Included as dependency');api.destroy();
});
test('X4 loaded detail exclusions are local to their source and manual attachments override either source',async()=>{
 const raw=exclusionFixture();raw.page.tracking.jira.exclude=['ST-1','ST-2'];raw.page.sections[0].diagram.nodes.a.tickets=['MAN-1'];raw.page.sections[0].diagram.edges=[];
 const detail={page:{tracking:{jira:{site:'https://detail.test',epic:'EP-1',exclude:['ST-2','ST-3']}},sections:[{diagram:{nodes:{a:{tickets:['ST-2']}},rows:[['a']]}}]}};
 const renderOptions={loadDetail:()=>Promise.resolve(detail)},h=harness(raw,{},renderOptions),api=h.ctl.liveStatus;api.apply(exclusionMap());
 await renderOptions.loadDetail({spec:'approved'},new AbortController().signal);h.flush();const s=plain(api.snapshot());
 assert.equal(s.epic.stories,8);assert.equal(s.epic.done,4);assert.deepEqual(s.coverage.onDiagram,['MAN-1','ST-2']);
 assert.equal(s.excluded.find(row=>row.key==='ST-1').reason,'Included by another source');assert.equal(s.excluded.find(row=>row.key==='ST-2').reason,'Included by manual attachment');
 assert.equal(s.excluded.find(row=>row.key==='ST-3').reason,'Included by another source');assert.equal(s.excluded.find(row=>row.key==='ST-3').url,'https://detail.test/browse/ST-3');api.destroy();
});
test('X5 manual-only and empty pages show useful progress, and exclusion-only pages retain the audit list',()=>{
 for(const root of [undefined,[]]){
  const raw=exclusionFixture();raw.page.tracking.jira.epic=root;const h=harness(raw),api=h.ctl.liveStatus;mountStatus(h);api.apply(exclusionMap());
  assert.equal(api.snapshot().epic.stories,3);assert.equal(api.snapshot().epic.done,2);assert.equal(api.snapshot().epic.onDiagram,3);assert.equal(h.view.querySelector('.dv-live-epic-progress').textContent,'2 of 3 stories done · 3 of 3 on diagram');api.destroy();
 }
 const raw=exclusionFixture();raw.page.tracking.jira.epic=[];raw.page.sections=[];const h=harness(raw),api=h.ctl.liveStatus;mountStatus(h);api.apply({});
 assert.equal(api.snapshot().epic.stories,0);assert.equal(api.snapshot().epic.done,0);assert.equal(h.view.querySelector('.dv-live-epic-progress').textContent,'0 of 0 stories done · 0 of 0 on diagram');assert.equal(h.view.querySelectorAll('.dv-live-excluded-story').length,5);api.destroy();
});

test('X6 completed, unknown and shared outside dependencies count once with manual and inherited overlap',()=>{
 const raw={page:{tracking:{jira:{epic:'EP-1',exclude:['OUT-1']}},sections:[{diagram:{nodes:{a:{tickets:['MAN-1','OUT-1']}},rows:[['a']]}}]}};
 const h=harness(raw),api=h.ctl.liveStatus;api.apply({'EP-1':{state:'done',kind:'epic'},'ST-1':{state:'todo',epic:'EP-1',dependsOn:[{key:'OUT-1',source:'jira'},{key:'UNKNOWN-1',source:'jira'},{key:'EP-1',source:'jira'}]},
  'MAN-1':{state:'active',dependsOn:[{key:'OUT-1',source:'jira'},{key:'UNKNOWN-1',source:'jira'}]},'OUT-1':{state:'done',epic:'OTHER-1'}});
 const s=plain(api.snapshot());assert.equal(s.epic.stories,4);assert.equal(s.epic.done,1);assert.equal(s.epic.onDiagram,2);assert.equal(s.epic.outside,3);assert.equal(s.epic.waiting,1);
 assert.deepEqual(s.tickets.map(row=>row.key).sort(),['MAN-1','OUT-1','ST-1','UNKNOWN-1']);assert.deepEqual(s.counts,{todo:1,active:1,testing:0,done:1,blocked:0,missing:0});
 assert.equal(s.tickets.find(row=>row.key==='UNKNOWN-1').state,'No status');assert.equal(s.excluded[0].reason,'Included by manual attachment');api.destroy();
});
test('X7 authored exclusions are visible and linked before live evidence is available',()=>{
 const h=harness(exclusionFixture());mountStatus(h);assert.equal(h.view.querySelectorAll('.dv-live-excluded-story').length,4);
 assert.equal(h.view.querySelector('.dv-live-excluded-story').querySelector('a').getAttribute('href'),'https://jira.test/browse/ST-2');assert.equal(h.view.querySelector('.dv-live-epic'),null);h.ctl.liveStatus.destroy();
});

test('X8 hidden container excluded and unrelated dependents cannot create a phantom waiting count',()=>{
 for(const hidden of ['EP-1','EX-1','OTHER-1']){
  const raw={page:{tracking:{jira:{epic:'EP-1',exclude:['EX-1']},dependencies:[{ticket:hidden,on:'UP-1'}]},sections:[{diagram:{nodes:{a:{tickets:['ST-1']}},rows:[['a']]}}]}};
  const map={'ST-1':{state:'done',epic:'EP-1'},'EP-1':{state:'todo',kind:'epic'},'EX-1':{state:'todo',epic:'EP-1'},'OTHER-1':{state:'todo'},'UP-1':{state:'todo'}};
  const h=harness(raw),api=h.ctl.liveStatus;api.apply(map);
  // Reproduces the former global-count bug: one hidden dependent waits while
  // the only included story is done. Scope filtering must remove that count.
  const unscoped=h.C.liveStatusTicketWaiting(h.C.liveStatusDependencies([h.ctl.page],map),map);assert.equal(Object.keys(unscoped).length,1);
  let s=plain(api.snapshot());assert.deepEqual(s.tickets.map(row=>row.key),['ST-1']);assert.equal(s.epic.waiting,0);assert.deepEqual(s.waiting,{});assert.deepEqual(s.chains,[]);
  map['ST-1']={state:'todo',epic:'EP-1',dependsOn:[{key:'UP-1',source:'jira'}]};api.apply(map);s=plain(api.snapshot());assert.equal(s.epic.waiting,1);assert.equal(s.tickets.filter(row=>row.waiting).length,1);assert.deepEqual(Object.keys(s.waiting),['ST-1']);
  map['ST-1'].state='done';api.apply(map);s=plain(api.snapshot());assert.equal(s.epic.waiting,0,'completed dependent cannot wait even with its unfinished upstream retained');assert.deepEqual(s.chains,[]);
  map['ST-1'].state='todo';map['UP-1'].state='done';api.apply(map);assert.equal(api.snapshot().epic.waiting,0,'fresh done upstream removes previous waiting');
  map['UP-1'].state='todo';delete map['ST-1'].dependsOn;api.apply(map);assert.equal(api.snapshot().epic.waiting,0,'removed live link cannot leave stale waiting evidence');api.destroy();
 }
});
test('X9 board waiting and chains match displayed story dependents across a container bridge',()=>{
 const raw={page:{tracking:{jira:{epic:'EP-1'}},sections:[{diagram:{nodes:{a:{tickets:['ST-1']}},rows:[['a']]}}]}};
 const h=harness(raw),api=h.ctl.liveStatus;api.apply({'ST-1':{state:'todo',epic:'EP-1',dependsOn:[{key:'EP-1',source:'jira'}]},'EP-1':{state:'todo',kind:'epic',dependsOn:[{key:'OUT-1',source:'jira'}]},'OUT-1':{state:'todo'}});
 const s=plain(api.snapshot());assert.deepEqual(s.tickets.map(row=>row.key).sort(),['OUT-1','ST-1']);assert.equal(s.epic.stories,2);assert.equal(s.epic.state,'todo','parent status stays Jira state');assert.equal(s.epic.waiting,1);
 assert.deepEqual(Object.keys(s.waiting),['ST-1']);assert.equal(s.epic.waiting,s.tickets.filter(row=>row.waiting).length);assert.deepEqual(s.chains,[['EP-1','ST-1']]);assert.equal(s.tickets.find(row=>row.key==='ST-1').dependsOn[0].key,'EP-1');api.destroy();
});

test('X10 Jira linked issue metadata keeps outside containers out of board totals without guessing unknown keys',()=>{
 const C=providerContext(),link=issue=>({type:{inward:'is blocked by'},inwardIssue:issue});
 const upstream=(key,type)=>{const issue=jira(key,'done');if(type)issue.fields.issuetype=type;return issue;};
 for(const legacy of [false,true]){
  const issue=jira('ST-1','new'),other=jira('ST-2','done');
  const epic=upstream('EP-9',legacy?{name:'Epic'}:{name:'Delivery group',hierarchyLevel:1}),initiative=upstream('IN-9',legacy?{name:'Initiative'}:{name:'Program',hierarchyLevel:2});
  issue.fields.issuelinks=[link(upstream('EP-9')),link(initiative),link(upstream('WORK-1',{name:'Story',hierarchyLevel:0})),link(upstream('WORK-2',{name:'Task',hierarchyLevel:0})),link(upstream('WORK-3',{name:'Bug',hierarchyLevel:0})),link(upstream('EP-404'))];
  // The first link is sparse; metadata on a second dependent's link must fill it.
  other.fields.issuelinks=[link(epic)];
  const map=C.liveStatusJiraMap(['ST-1','ST-2'],[[issue,other]],new Set(),'https://jira.test');
  assert.equal(map['EP-9'].kind,'epic');assert.equal(map['IN-9'].kind,'initiative');for(const key of ['WORK-1','WORK-2','WORK-3'])assert.equal(map[key].kind,'story');assert.equal(map['EP-404'].kind,undefined,'no type is unknown, never inferred from prefix');
  const h=harness({page:{sections:[{diagram:{nodes:{a:{tickets:['ST-1','ST-2']}},rows:[['a']]}}]}});h.ctl.liveStatus.apply(map);const s=plain(h.ctl.liveStatus.snapshot());
  assert.equal(s.epic.stories,6);assert.equal(s.epic.done,5);assert.equal(s.epic.waiting,0);assert.deepEqual(s.tickets.map(row=>row.key).sort(),['EP-404','ST-1','ST-2','WORK-1','WORK-2','WORK-3']);assert.deepEqual(s.counts,{todo:1,active:0,testing:0,done:5,blocked:0,missing:0});
  assert.ok(s.tickets.find(row=>row.key==='ST-1').dependsOn.some(dep=>dep.key==='IN-9'),'container remains direct dependency evidence');h.ctl.liveStatus.destroy();
 }
 const direct=upstream('KEEP-1',{name:'Story',hierarchyLevel:0}),dependent=jira('ST-1');dependent.fields.issuelinks=[link(upstream('KEEP-1',{name:'Epic',hierarchyLevel:1}))];
 assert.equal(C.liveStatusJiraMap(['ST-1','KEEP-1'],[[dependent,direct]],new Set(),'')['KEEP-1'].kind,'story','requested issue metadata wins over a linked stub');
});

test('ticket availability requires all explicit Done evidence without changing Jira rollup',()=>{
 const {C}=harness(),value={tickets:['AA-1','AA-2'],existsWhen:'tickets-done'};
 for(const map of [{},{'AA-1':{state:'done'}},{'AA-1':{state:'done'},'AA-2':{state:'unknown'}},{'AA-1':{state:'done'},'AA-2':{state:'missing'}},{'AA-1':{state:'done'},'AA-2':{state:'active'}}])assert.equal(C.liveStatusUnavailable(value,map),true);
 assert.equal(C.liveStatusCarrier(value,{'AA-1':{state:'done'}}),'done','availability must not redefine Jira rollup');
 assert.equal(C.liveStatusUnavailable(value,{'AA-1':{state:'done'},'AA-2':{state:'done'}}),false);
 for(const other of [{tickets:['AA-1']},{existsWhen:'tickets-done'},{existsWhen:'tickets-done',tickets:['invalid'],prs:['https://example.test/pull/1']},{...value,type:'text',text:'Note'},{...value,existsWhen:'other'}])assert.equal(C.liveStatusUnavailable(other,{}),false);
});
test('availability distinguishes awaiting evidence from known unfinished work in every cause',()=>{
 const {C}=harness(),value={title:'API',tickets:['AA-1','AA-2'],existsWhen:'tickets-done'};
 for(const map of [{},{'AA-1':{state:'unknown'}},{'AA-1':{state:'done'}},{'AA-1':{state:'done'},'AA-2':{state:'unknown'}}]){
  const causes=C.liveStatusAvailability(value,map);assert.equal(causes[0].awaiting,true);assert.match(C.liveStatusAvailabilityLabel(causes),/Awaiting Jira status/);assert.doesNotMatch(C.liveStatusAvailabilityLabel(causes),/Not built/);
 }
 for(const state of ['todo','active','blocked','missing']){
  const causes=C.liveStatusAvailability(value,{'AA-1':{state}});assert.equal(causes[0].awaiting,false,state);assert.match(C.liveStatusAvailabilityLabel(causes),/Not built yet/);
 }
 const edge={from:'a',to:'b',tickets:['EE-1'],existsWhen:'tickets-done'},diagram={nodes:{a:value,b:{}}};
 const mixed=C.liveStatusAvailability(edge,{'EE-1':{state:'todo'}},diagram),label=C.liveStatusAvailabilityLabel(mixed);
 assert.equal(mixed[0].awaiting,false);assert.equal(mixed[1].awaiting,true);
 assert.match(label,/Not built yet · a → b requires EE-1/);assert.match(label,/Awaiting Jira status · API requires confirmed Done status for AA-1, AA-2/);
 assert.equal(C.liveStatusAvailability(value,{'AA-1':{state:'done'},'AA-2':{state:'done'}}),null);
});
test('planned nodes and incident edges stay unavailable through unknown evidence, navigation and independent edge gates',()=>{
 const raw={nodes:{a:{title:'Planned API',tickets:['AA-1','AA-2'],existsWhen:'tickets-done'},b:{title:'Existing'}},rows:[['a','b']],edges:[{from:'a',to:'b',existsWhen:'tickets-done',tickets:['EE-1']},{from:'b',to:'a'}]},before=JSON.stringify(raw);
 const h=harness(raw),api=h.ctl.liveStatus,node=h.view.querySelector('[data-dv-node="a"]'),edges=h.view.querySelectorAll('path.edge');
 assert.ok(node.classList.contains('dv-live-unavailable'),'initial unknown evidence is unavailable');assert.equal(h.view.querySelectorAll('.dv-live-comm-failure').length,2);
 assert.match(node.querySelector('.card').getAttribute('aria-label'),/Awaiting Jira status/);
 api.apply({'AA-1':{state:'done'},'AA-2':{state:'active'},'EE-1':{state:'active'}});
 assert.ok(node.classList.contains('dv-live-active'));assert.ok(!node.classList.contains('dv-live-blocked'));
 assert.match(h.view.querySelector('text.lbl[data-dv-edge="1"]').getAttribute('aria-label'),/Planned API requires AA-1, AA-2/);
 h.view.dispatchEvent({type:'navigation-mounted'});h.flush();assert.equal(h.view.querySelectorAll('.dv-live-comm-failure').length,2);
 api.apply({'AA-1':{state:'done'},'AA-2':{state:'done'},'EE-1':{state:'todo'}});
 assert.ok(!node.classList.contains('dv-live-unavailable'));assert.equal(h.view.querySelectorAll('.dv-live-comm-failure').length,1);assert.ok(edges[0].classList.contains('dv-live-unavailable'));assert.ok(!edges[1].classList.contains('dv-live-unavailable'));
 api.apply({'AA-1':{state:'done'},'AA-2':{state:'done'},'EE-1':{state:'done'}});assert.equal(h.view.querySelectorAll('.dv-live-unavailable,.dv-live-comm-failure').length,0);
 api.apply({});assert.ok(node.classList.contains('dv-live-unavailable'));
 api.setEnabled(false);assert.equal(h.view.querySelectorAll('.dv-live-unavailable,.dv-live-comm-failure').length,0);
 api.setEnabled(true);assert.ok(node.classList.contains('dv-live-unavailable'));
 api.clear();assert.equal(h.view.querySelectorAll('.dv-live-unavailable,.dv-live-comm-failure').length,0);
 api.apply({});api.destroy();assert.equal(h.view.querySelectorAll('.dv-live-unavailable,.dv-live-comm-failure,.dv-live-target').length,0);assert.equal(JSON.stringify(raw),before);
 const fresh=harness(raw);fresh.ctl.liveStatus.destroy();assert.equal(fresh.view.querySelectorAll('.dv-live-unavailable,.dv-live-comm-failure,.dv-live-target').length,0,'destroy before first map restores visuals');
});

test('coverage markers survive normalization, propagate to steps, never manufacture Jira evidence and restore cleanly',()=>{
 const raw={nodes:{reuse:{title:'Existing'},gap:{title:'Uncovered',missingWork:true},tracked:{tickets:['AA-1','AA-2']},text:{type:'text',text:'Note',missingWork:true}},rows:[['reuse','gap','tracked']],steps:[{id:'reuse',nodes:['reuse']},{id:'gap',nodes:['gap']},{id:'mixed',nodes:['reuse','tracked']}]};
 const h=harness(raw),api=h.ctl.liveStatus,d=h.ctl.page.sections[0].diagram;
 assert.equal(d.nodes.gap.missingWork,true);assert.equal(api.snapshot().available,true);assert.equal(api.snapshot().hasData,true);
 assert.equal(h.view.querySelector('[data-dv-node="gap"]').getAttribute('data-live-appearance'),'missing');
 api.apply({'AA-1':{state:'done'}});
 assert.equal(h.view.querySelector('[data-dv-node="reuse"]').getAttribute('data-live-appearance'),'unchanged');
 assert.equal(h.view.querySelector('[data-dv-node="tracked"]').getAttribute('data-live-appearance'),null);
 assert.equal(h.view.querySelector('[data-dv-node="text"]').getAttribute('data-live-appearance'),null);
 assert.equal(h.C.liveStatusStep(d,d.steps[1],{}),'missing');assert.equal(h.C.liveStatusCaption(d,d.steps[1],{}),'MISSING WORK · unlinked work remains');
 assert.equal(h.C.liveStatusCaption(d,d.steps[0],{}),'NO CHANGE NEEDED');
 assert.equal(h.C.liveStatusStep(d,d.steps[2],{'AA-1':{state:'done'}}),null);
 assert.equal(h.C.liveStatusStep(d,d.steps[2],{'AA-1':{state:'done'},'AA-2':{state:'done'}}),'done');
 assert.deepEqual(plain(api.refs().tickets),['AA-1','AA-2']);assert.deepEqual(plain(api.snapshot().counts),{todo:0,active:0,testing:0,done:1,blocked:0,missing:0});
 assert.equal(h.C.liveStatusReadiness(h.ctl.page,{'AA-1':{state:'done'},'AA-2':{state:'done'}},{}).ready,false);
 const card=h.view.querySelector('[data-dv-node="gap"]').querySelector('.card');assert.match(card.getAttribute('aria-label'),/Work status.*Missing work/);
 h.view.dispatchEvent({type:'click',target:card,button:0,preventDefault(){},stopPropagation(){}});assert.match(h.view.querySelector('.dv-live-coverage-detail').textContent,/additional work remains/);
 api.clear();assert.equal(h.view.querySelectorAll('[data-live-appearance]').length,0);api.apply({});api.destroy();assert.equal(h.view.querySelectorAll('[data-live-appearance]').length,0);
 const invalid=h.C.validate(h.C.normalize({nodes:{a:{missingWork:'yes'}},rows:[['a']]}));assert.ok(invalid.warnings.some(w=>w.includes('missingWork')));
});

test('missing work activates consistent page-wide coverage before provider evidence without changing ordinary pages',()=>{
 const raw={page:{sections:[{id:'gap',diagram:{nodes:{gap:{missingWork:true}},rows:[['gap']],steps:[{nodes:['gap']}]}} ,{id:'reuse',diagram:{nodes:{reuse:{title:'Existing'},tracked:{tickets:['AA-1']},text:{type:'text',text:'Note'}},rows:[['reuse','tracked']],steps:[{nodes:['reuse']},{nodes:['tracked']}]}}]}};
 const h=harness(raw),api=h.ctl.liveStatus,rec=h.ctl.sections[1],controls=stepTicketControls(h,rec);
 function state(id){return h.view.querySelector('[data-dv-node="'+id+'"]').getAttribute('data-live-appearance');}
 assert.equal(api.snapshot().available,true);assert.equal(api.enabled(),true);
 assert.equal(state('gap'),'missing');assert.equal(state('reuse'),'unchanged');assert.equal(state('tracked'),null);assert.equal(state('text'),null);
 for(const selector of ['g.coin[data-dv-step="0"]','button.schip[data-step-source="0"]'])assert.equal(rec.sectionEl.querySelector(selector).getAttribute('data-live-appearance'),'unchanged');
 assert.equal(controls.host.querySelector('.dv-live-caption').textContent,'NO CHANGE NEEDED');
 controls.change(1);assert.equal(controls.host.querySelector('.dv-live-caption').textContent,'AWAITING TICKET STATUS');
 assert.deepEqual(plain(api.snapshot().counts),{todo:0,active:0,testing:0,done:0,blocked:0,missing:0});
 api.setEnabled(false);assert.equal(h.view.querySelectorAll('[data-live-appearance]').length,0);
 api.setEnabled(true);assert.equal(state('reuse'),'unchanged');assert.equal(state('gap'),'missing');
 api.clear();assert.equal(h.view.querySelectorAll('[data-live-appearance]').length,0);api.destroy();
 for(const nodes of [{reuse:{}},{reuse:{},text:{type:'text',text:'Note',missingWork:true}}]){
  const ordinary=harness({nodes,rows:[['reuse']],steps:[{nodes:['reuse']}]});const control=stepTicketControls(ordinary);
  assert.equal(ordinary.ctl.liveStatus.snapshot().available,false);assert.equal(ordinary.view.querySelectorAll('[data-live-appearance]').length,0);assert.equal(control.host.querySelector('.dv-live-caption'),null);ordinary.ctl.liveStatus.destroy();
 }
});


test('edge missing work activates a real communication break without provider evidence',()=>{
 const raw={nodes:{a:{},b:{}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'Delivery',missingWork:true}],steps:[{edge:'a->b'}]};
 const h=harness(raw),api=h.ctl.liveStatus,d=h.ctl.page.sections[0].diagram;
 assert.equal(api.snapshot().available,true);assert.equal(api.enabled(),true);
 assert.equal(h.view.querySelectorAll('.dv-live-comm-failure').length,1);
 assert.equal(h.view.querySelector('path.edge').getAttribute('data-live-appearance'),'missing');
 assert.equal(h.C.liveStatusStep(d,d.steps[0],{}),'missing');
 assert.equal(h.C.liveStatusCaption(d,d.steps[0],{}),'MISSING WORK · unlinked work remains');
 assert.equal(api.snapshot().readiness.ready,false);assert.equal(api.snapshot().readiness.total,1);
 assert.deepEqual(plain(api.refs().tickets),[]);assert.deepEqual(plain(api.snapshot().counts),{todo:0,active:0,testing:0,done:0,blocked:0,missing:0});
 api.destroy();
});


test('edge missing work beats Done without changing Jira evidence and restores authored failures and traffic',()=>{
 const raw={page:{tracking:{jira:{site:'https://jira.test'}},sections:[{diagram:{nodes:{a:{},b:{}},rows:[['a','b']],edges:[{from:'a',to:'b',missingWork:true,tickets:['EE-1']}],steps:[{edge:'a->b'}]}}]}},original=JSON.stringify(raw);
 const h=harness(raw),api=h.ctl.liveStatus,d=h.ctl.page.sections[0].diagram,path=h.view.querySelector('path.edge'),svg=path.parentNode;
 h.view.querySelector('text.lbl').remove();path.setAttribute('id','edge-0');
 const dot=svg.appendChild(new Element('circle',{'class':'pkt'})),mpath=dot.appendChild(new Element('mpath',{href:'#edge-0'}));
 const authored=svg.appendChild(new Element('g',{'class':'comm-failure comm-dropped','data-dv-edge':'0'}));path.classList.add('comm-hidden');
 for(const state of ['done','active','todo','unknown','missing','blocked']){
  api.apply({'EE-1':{state}});const want=state==='blocked'?'blocked':'missing',broken=h.view.querySelector('.dv-live-comm-failure');
  assert.equal(path.getAttribute('data-live-appearance'),want);assert.equal(broken.getAttribute('data-live-appearance'),want);assert.equal(broken.getAttribute('role'),'button');assert.equal(broken.getAttribute('tabindex'),'0');
  assert.ok(dot.classList.contains('dv-live-packet-hidden'));assert.ok(path.classList.contains('dv-live-comm-hidden'));assert.ok(authored.classList.contains('dv-live-comm-suppressed'));
  assert.equal(h.view.querySelectorAll('.dv-live-unavailable').length,0,'missing work is not availability');
  assert.equal(api.snapshot().readiness.done,0);assert.equal(api.snapshot().readiness.ready,false);
  assert.equal(h.C.liveStatusStep(d,d.steps[0],{'EE-1':{state}}),want);
 }
 api.apply({'EE-1':{state:'done'}});assert.equal(api.snapshot().counts.done,1);assert.equal(api.snapshot().counts.missing,0);
 const broken=h.view.querySelector('.dv-live-comm-failure');h.view.dispatchEvent({type:'keydown',target:broken,key:'Enter',preventDefault(){},stopPropagation(){}});
 assert.match(h.view.querySelector('.dv-live-coverage-detail').textContent,/Missing work/);assert.equal(h.view.querySelector('.dv-live-popover a').getAttribute('href'),'https://jira.test/browse/EE-1');
 h.view.dispatchEvent({type:'navigation-mounted'});h.flush();assert.equal(h.view.querySelectorAll('.dv-live-comm-failure').length,1);
 for(const reset of [()=>api.setEnabled(false),()=>api.clear(),()=>api.destroy()]){
  reset();assert.equal(h.view.querySelectorAll('.dv-live-comm-failure,.dv-live-comm-hidden,.dv-live-packet-hidden,.dv-live-comm-suppressed').length,0);assert.ok(path.classList.contains('comm-hidden'));assert.equal(authored.parentNode,svg);
  api.setEnabled(true);
 }
 assert.equal(JSON.stringify(raw),original);
 const clear=harness(raw),cd=clear.ctl.page.sections[0].diagram;delete cd.edges[0].missingWork;clear.ctl.liveStatus.apply({'EE-1':{state:'done'}});
 assert.equal(clear.view.querySelectorAll('.dv-live-comm-failure').length,0);assert.equal(clear.ctl.liveStatus.snapshot().readiness.ready,true);clear.ctl.liveStatus.destroy();
 const invalid=h.C.validate(h.C.normalize({nodes:{a:{},b:{}},rows:[['a','b']],edges:[{from:'a',to:'b',missingWork:'yes'}]}));assert.ok(invalid.warnings.some(w=>w.includes('.edges[0].missingWork')));
});

/* #827 page.editHistory reaches the edit-history panel through the live-status seam.
   §0 ruling (Chuck 2026-10-30): the issue's own Test + flip plan. Rows (matrix continues
   tests/live-status-panel.test.js H1–H10 and tools/browser-tests/tests/edit-history.spec.mjs B1–B2):
| row | fixture | assertion (scoped) | rejects |
|---|---|---|---|
| H5 snapshot carries validated history | page with one bad and two good entries | `snapshot().editHistory` deep-equals `editHistoryEntries(page)`, newest first, a copy | an impl exposing raw page.editHistory |
| H7 mounted panel renders rows from the controller and repaints on change | panel mounted inside the view | one `details.dv-edit-details` per entry newest first; summary who/when/count/first; change lines op/ticket/carrier; label fallbacks; ticket title appears after apply() | an impl reading page data directly or never subscribing |
| H7b pending bridge | panel mounted before the controller exists | rows appear once `liveStatusWhenReady` connects | an impl that only connects at mount time |
| H8 editor name resolution | mocked window.claude.use('user') | A "Alex Live" (stored "Alex Old"), B "Bo" (resolved ""), C "Someone"; use→null: A "Alex Old" | an impl that drops the profiles() lookup (A shows "Alex Old") |
| H11 panel shows at most 200 rows | 201 entries | 200 details rows | an impl that renders page.editHistory unbounded |
| H12 history works on untracked pages (Chuck 2026-10-30) | page with no page.tracking, no tickets and no live-status panel | snapshot().editHistory carries the entries; the mounted panel renders one row per entry | an impl that creates the controller or paints only for tracked boards |
*/
const HISTORY_PANEL={id:'history',type:'edit-history',title:'Edit history'};
function historyFixture(editHistory){
 const raw={page:{tracking:{jira:{site:'https://jira.test'}},editHistory,sections:[{id:'main',diagram:{nodes:{a:{title:'Node A',tickets:['AA-1']},b:{title:'Node B',tickets:['BB-1']}},rows:[['a','b']],edges:[{from:'a',to:'b',tickets:['EE-1']}],panels:[{id:'status',type:'live-status'},{...HISTORY_PANEL}]}}]}};
 return raw;
}
const HISTORY=[
 {at:'2026-10-28T09:00:00Z',by:{id:'u_bo',name:'Bo'},changes:[{op:'remove',ticket:'EE-1',edge:['a','b']}]},
 {at:'2026-10-30T16:23:15Z',by:{id:'u_alex',name:'Alex Old'},changes:[{op:'add',ticket:'AA-1',node:'a',path:['sections',0,'diagram','nodes','a'],label:'Node A'},{op:'remove',ticket:'BB-1',node:'b',label:'Node B'}]},
 {at:'2026-10-29T12:00:00Z',by:{id:'u_cam',name:''},changes:[{op:'add',ticket:'BB-1',node:'b'}]}];
function mountHistory(h,host=h.view){
 const d=h.C.PanelRegistry.get('edit-history');assert.ok(d,'H7 registered panel');
 const body=host.appendChild(new Element('div',{class:'pbody'}));
 const result=d.render(body,{...HISTORY_PANEL},{},'pastel',[],0,false);result.mounted();
 return {body,rows:()=>body.querySelectorAll('details.dv-edit-details'),destroy(){if(body._panelMotionCleanup)body._panelMotionCleanup();body.remove();}};
}
const historySettle=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};
test('H5 snapshot().editHistory equals the validated entries of the rendered page, newest first',()=>{
 const raw=historyFixture([HISTORY[0],{at:'bad'},HISTORY[1],HISTORY[2]]),h=harness(raw);
 const expected=plain(h.C.editHistoryEntries(h.ctl.page));assert.equal(expected.length,3);assert.equal(expected[0].at,'2026-10-30T16:23:15Z');
 const got=h.ctl.liveStatus.snapshot().editHistory;assert.deepEqual(plain(got),expected);
 got[0].at='mutated';assert.equal(h.ctl.liveStatus.snapshot().editHistory[0].at,'2026-10-30T16:23:15Z','snapshot hands out a copy');
 h.ctl.liveStatus.destroy();
 const none=harness(historyFixture());assert.deepEqual(plain(none.ctl.liveStatus.snapshot().editHistory),[]);none.ctl.liveStatus.destroy();
});
test('H7 H11 a panel mounted in the view lists rows newest first with collapsible details and repaints with ticket titles',async()=>{
 const h=harness(historyFixture(HISTORY)),status=mountHistory(h);await historySettle();
 const rows=status.rows();assert.equal(rows.length,3);
 assert.deepEqual(rows.map(r=>r.closest('li').getAttribute('data-edit-at')),['2026-10-30T16:23:15Z','2026-10-29T12:00:00Z','2026-10-28T09:00:00Z']);
 for(const row of rows){assert.equal(row.tagName,'details');assert.ok(!row.open && row.getAttribute('open')===null,'collapsed by default');assert.equal(row.children[0].tagName,'summary');}
 const first=rows[0],summary=first.querySelector('summary.dv-edit-summary');
 assert.equal(textOf(summary.querySelector('.dv-edit-who')).trim(),'Alex Old','no claude runtime: stored name');
 const when=summary.querySelector('time.dv-edit-when');assert.equal(when.getAttribute('datetime'),'2026-10-30T16:23:15Z');assert.ok(textOf(when).trim().length);
 assert.equal(textOf(summary.querySelector('.dv-edit-count')).trim(),'2 changes');assert.equal(textOf(summary.querySelector('.dv-edit-first')).trim(),'AA-1 added to Node A');
 assert.equal(textOf(rows[2].querySelector('.dv-edit-count')).trim(),'1 change');assert.equal(textOf(rows[2].querySelector('.dv-edit-first')).trim(),'EE-1 removed from a → b','edge without label falls back to from → to');
 assert.equal(textOf(rows[1].querySelector('.dv-edit-first')).trim(),'BB-1 added to b','node without label falls back to the id');
 assert.equal(textOf(rows[1].querySelector('.dv-edit-who')).trim(),'Someone','empty stored name');
 const changes=first.querySelectorAll('li.dv-edit-change');assert.equal(changes.length,2);
 assert.deepEqual(changes.map(c=>[c.getAttribute('data-edit-op'),c.getAttribute('data-edit-ticket'),textOf(c.querySelector('.dv-edit-carrier')).trim()]),[['add','AA-1','Node A'],['remove','BB-1','Node B']]);
 assert.equal(changes[0].querySelector('.dv-edit-ticket-title'),null,'no title before the map arrives');
 h.ctl.liveStatus.apply({'AA-1':{state:'active',title:'Button delivery'}});await historySettle();
 const after=status.rows();assert.equal(after.length,3);assert.equal(textOf(after[0].querySelector('li.dv-edit-change .dv-edit-ticket-title')).trim(),'Button delivery','repainted from onChange with the live title');
 status.destroy();h.ctl.liveStatus.destroy();
 const many=[];for(let i=0;i<201;i++)many.push({at:new Date(Date.UTC(2026,0,1,0,i)).toISOString(),changes:[{op:'add',ticket:'AA-1',node:'a'}]});
 const capped=harness(historyFixture(many)),cappedPanel=mountHistory(capped);await historySettle();assert.equal(cappedPanel.rows().length,200);cappedPanel.destroy();capped.ctl.liveStatus.destroy();
 const empty=harness(historyFixture()),emptyPanel=mountHistory(empty);await historySettle();assert.equal(emptyPanel.rows().length,0);assert.equal(textOf(emptyPanel.body.querySelector('.dv-edit-history-empty')).trim(),'No edits yet.');emptyPanel.destroy();empty.ctl.liveStatus.destroy();
});
/* #855 H7c (contract source: #855 "Reuse plan" (Edit history panel), Chuck 2026-11-01; §0 ruling:
   Chuck 2026-11-01: issue's own Test + flip plan):
| row | fixture | assertion (scoped) | rejects |
|---|---|---|---|
| H7c clear-missing-work rows have no ticket | one entry: clear on node b (label Node B), add AA-1, clear on edge a → b without label | summary first "Missing work cleared from Node B", "3 changes"; change lines [op attr, data-edit-ticket, ticket span, op text, carrier] == [clear-missing-work, null, none, "Missing work cleared from", "Node B"], [add, AA-1, AA-1, "added to", "Node B"], [clear-missing-work, null, none, "Missing work cleared from", "a → b"] | ticket-first prose ("undefined added to …"); a ticket span for a clear |
*/
test('H7c clear-missing-work rows read "Missing work cleared from <carrier>" with no ticket',async()=>{
 const entries=[{at:'2026-11-01T10:00:00Z',by:{name:'Alex'},changes:[{op:'clear-missing-work',node:'b',label:'Node B'},{op:'add',ticket:'AA-1',node:'b',label:'Node B'},{op:'clear-missing-work',edge:['a','b']}]}];
 const h=harness(historyFixture(entries)),status=mountHistory(h);await historySettle();
 const rows=status.rows();assert.equal(rows.length,1);
 assert.equal(textOf(rows[0].querySelector('.dv-edit-first')).trim(),'Missing work cleared from Node B');
 assert.equal(textOf(rows[0].querySelector('.dv-edit-count')).trim(),'3 changes');
 const changes=rows[0].querySelectorAll('li.dv-edit-change');assert.equal(changes.length,3);
 const text=(row,cls)=>{const el=row.querySelector(cls);return el?textOf(el).trim():null;};
 assert.deepEqual(changes.map(c=>[c.getAttribute('data-edit-op'),c.getAttribute('data-edit-ticket'),text(c,'.dv-edit-ticket'),text(c,'.dv-edit-op'),text(c,'.dv-edit-carrier')]),
  [['clear-missing-work',null,null,'Missing work cleared from','Node B'],['add','AA-1','AA-1','added to','Node B'],['clear-missing-work',null,null,'Missing work cleared from','a → b']]);
 status.destroy();h.ctl.liveStatus.destroy();
});
test('H7b a panel mounted before its controller connects through the pending bridge and retires with it',async()=>{
 const raw=historyFixture(HISTORY),h=harness(raw);h.ctl.liveStatus.destroy();
 const status=mountHistory(h);await historySettle();assert.equal(status.rows().length,0,'nothing to paint before a controller');
 h.ctl.liveStatus=h.C.createLiveStatus(h.ctl,h.ctl.page,{},{});h.ctl.liveStatus.note('hello');await historySettle();
 assert.equal(status.rows().length,3,'connected when the controller notified');
 h.ctl.liveStatus.destroy();assert.equal(typeof status.body._panelMotionCleanup,'function');status.destroy();
});
test('H8 editor names: live profile name, else the stored copy, else "Someone"',async()=>{
 const resolved={u_alex:{id:'u_alex',name:'Alex Live'},u_bo:{id:'u_bo',name:''},u_cam:{id:'u_cam',name:''}};
 const h=harness(historyFixture(HISTORY));let asked=null;
 h.win.claude={use:name=>Promise.resolve(name==='user'?{profiles:ids=>{asked=[...ids];return Promise.resolve(Object.fromEntries(ids.map(id=>[id,resolved[id] || {id,name:''}])));}}:null)};
 const status=mountHistory(h);await historySettle();
 assert.deepEqual([...asked].sort(),['u_alex','u_bo','u_cam'],'profiles() batched with the ids on screen');
 assert.deepEqual(status.rows().map(r=>textOf(r.querySelector('.dv-edit-who')).trim()),['Alex Live','Someone','Bo']);
 status.destroy();h.ctl.liveStatus.destroy();
 const none=harness(historyFixture(HISTORY));none.win.claude={use:()=>Promise.resolve(null)};const plainPanel=mountHistory(none);await historySettle();
 assert.deepEqual(plainPanel.rows().map(r=>textOf(r.querySelector('.dv-edit-who')).trim()),['Alex Old','Someone','Bo'],'user namespace absent: stored names');
 plainPanel.destroy();none.ctl.liveStatus.destroy();
});
test('H12 Chuck 2026-10-30: history renders on a page without tracking, tickets or a live-status panel',async()=>{
 const raw={page:{title:'Plain page',editHistory:HISTORY,sections:[{id:'main',diagram:{nodes:{a:{title:'Node A'},b:{title:'Node B'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],panels:[{...HISTORY_PANEL}]}}]}};
 assert.equal(raw.page.tracking,undefined);const h=harness(raw);
 assert.deepEqual(plain(h.C.validate(h.ctl.page)),{errors:[],warnings:[]},'an untracked page with history is clean');
 assert.deepEqual(plain(h.ctl.liveStatus.snapshot().editHistory),plain(h.C.editHistoryEntries(h.ctl.page)));assert.equal(h.ctl.liveStatus.snapshot().editHistory.length,3);
 const status=mountHistory(h);await historySettle();
 const rows=status.rows();assert.equal(rows.length,3);assert.equal(textOf(rows[0].querySelector('.dv-edit-first')).trim(),'AA-1 added to Node A');
 status.destroy();h.ctl.liveStatus.destroy();
});

/* #939 PR 1 of 2 (Metrics): the host telemetry provider, ctl.telemetry and the panel's Metrics button.
   Nothing paints on the canvas in this PR; canvas cues follow in PR 2.
| M1 | `ctl.telemetry` exists on every page with apply, clear, snapshot, onChange, setEnabled, status and bindings; without a provider or demo it reports `absent`, ignores setEnabled and the panel has no Metrics button or metrics connector text. |
| M2 | `bindings()` and the provider's first argument list every bound carrier once, in page order, as `{id, kind, signals, proof, links, card}` from carrierTelemetry: local nodes and edges (template `use` expanded), imported topology nodes and edges (consumer overlay and provider-authored bindings), and loaded detail pages; unbound carriers and text boxes are absent; a repeated id keeps its first binding. |
| M3 | Metrics is off by default (no call, no timer after first paint); setEnabled(true) calls the provider at once, then every max(refreshMs, 60000) ms while visible; hidden pauses and visible catches up once; a rejection sets `error` with the message and keeps the last map; setEnabled(false) aborts the signal, retires the timer, clears the map and returns to `idle`; a late answer after off is dropped; destroy aborts and stays off. |
| M4 | Refresh cadence: the host `refreshMs` wins, else the page `tracking.telemetry.refreshMs`, else one minute; never below 60000. |
| M5 | `apply(map)` keeps the provider result contract `{id: {signals: {name: {value, series, unit}}, observedAt, markers, links}}`, dropping malformed entries; snapshots are copies; `clear()` empties; onChange reports both and unsubscribes. |
| M6 | The panel header shows a Metrics button after Live and its counts, before the Jira connector, off by default; clicking it turns the provider on, the metrics connector text moves from "Metrics: not connected" to "Metrics: connecting" to "Metrics: connected, refreshed <time>" ("Metrics: did not answer · <message>" on error); clicking again clears; Jira Live is untouched. |
| M7 | A page with a telemetry provider and no Jira evidence still shows the header with Metrics while Live stays hidden. |
| M8 | A demo telemetry source (`telemetry.demo.mount(api)`) shows Metrics, mounts only while Metrics is on, reports demo, and its cleanup runs when Metrics turns off or the page is destroyed. |
*/
const TQUEUE=()=>({kind:'queue',signals:{lag:{grafana:'max(kafka_consumergroup_lag)',unit:'msgs'}},proof:{lag:{max:500}}});
const TCALL=()=>({kind:'call',signals:{rate:{grafana:'sum(rate(push_sent_total[5m]))*3600',unit:'req/h'},errors:{grafana:'sum(rate(push_failed_total[5m]))*3600',unit:'req/h'}},proof:{rate:{min:1},errors:{maxRatioOf:'rate',max:0.01}},links:{dashboard:'https://grafana.test/d/push'}});
const TSERVICE=()=>({kind:'service',signals:{rate:{grafana:'sum(rate(http_requests_total{app="api"}[5m]))*3600',unit:'req/h'}},proof:{rate:{min:1}}});
const bound=(id,kind,signals,proof={},links={},card=null)=>({id,kind,signals,proof,links,card});
function telemetryPage(refreshMs){
 const page={tracking:{jira:{site:'https://jira.test'},telemetry:{templates:{svc:{kind:'service',params:['app'],signals:{up:{grafana:'up{app="$app"}'}}}}}},sections:[{id:'main',diagram:{
  nodes:{a:{tickets:['AA-1'],telemetry:TQUEUE()},b:{tickets:['BB-1']},c:{telemetry:{use:'svc',app:'notify'}},note:{type:'text',text:'Note',telemetry:TQUEUE()}},rows:[['a','b','c']],
  edges:[{from:'a',to:'b',tickets:['EE-1'],telemetry:{...TCALL(),card:{side:'below'}}},{from:'b',to:'c',tickets:['EE-2']}]}}]};
 if(refreshMs!==undefined)page.tracking.telemetry.refreshMs=refreshMs;
 return {page};
}
const TQUEUE_BOUND=id=>bound(id,'queue',{lag:{source:'grafana',query:'max(kafka_consumergroup_lag)',unit:'msgs'}},{lag:{max:500}});
const TCALL_BOUND=(id,card=null)=>bound(id,'call',{rate:{source:'grafana',query:'sum(rate(push_sent_total[5m]))*3600',unit:'req/h'},errors:{source:'grafana',query:'sum(rate(push_failed_total[5m]))*3600',unit:'req/h'}},{rate:{min:1},errors:{maxRatioOf:'rate',max:0.01}},{dashboard:'https://grafana.test/d/push'},card);
const LOCAL_BINDINGS=[TQUEUE_BOUND('a'),bound('c','service',{up:{source:'grafana',query:'up{app="notify"}',unit:null}}),TCALL_BOUND('a->b',{side:'below'})];
const metricsClock=at=>new Date(at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'});
const IDLE={state:'idle',busy:false,refreshedAt:null,note:''};

test('M1 ctl.telemetry exists without a provider, reports absent, ignores setEnabled and shows no Metrics control',()=>{
 const h=harness(telemetryPage(),{provider:()=>Promise.resolve(fixed)}),t=h.ctl.telemetry;
 assert.ok(t && typeof t==='object','M1 ctl.telemetry is attached to every controller');
 for(const name of ['apply','clear','snapshot','onChange','setEnabled','status','bindings'])assert.equal(typeof t[name],'function','M1 ctl.telemetry.'+name);
 assert.deepEqual(plain(t.status()),{state:'absent',busy:false,refreshedAt:null,note:''});
 assert.equal(t.snapshot().available,false);assert.equal(t.snapshot().enabled,false);
 t.setEnabled(true);assert.equal(t.snapshot().enabled,false,'M1 nothing to enable');assert.equal(t.status().state,'absent');
 const panel=mountStatus(h);h.flush();h.flush();
 const metrics=h.view.querySelector('button.dv-live-metrics'),conn=h.view.querySelector('.dv-live-metrics-connection');
 assert.ok(!metrics || metrics.hidden,'M1 no Metrics button without a telemetry provider or demo');
 assert.ok(!conn || conn.hidden,'M1 no metrics connector text without a telemetry provider or demo');
 assert.equal(h.view.querySelector('.dv-live-toggle').hidden,false,'M1 Live is unaffected');
 panel.destroy();h.ctl.liveStatus.destroy();
});

test('M2 bindings cover bound local, imported and loaded detail carriers once, in page order, as parsed bindings',async()=>{
 let seen=null;
 const local=harness(telemetryPage(),{},{telemetry:{provider:b=>{seen=b;return Promise.resolve({});}}});
 assert.ok(local.ctl.telemetry,'M2 ctl.telemetry');
 assert.deepEqual(plain(local.ctl.telemetry.bindings()),LOCAL_BINDINGS,'M2 local nodes, a template use and a carded edge; unbound carriers and the text box are absent');
 local.ctl.telemetry.setEnabled(true);await settle();assert.deepEqual(plain(seen),LOCAL_BINDINGS,'M2 the provider receives the same list');
 local.ctl.liveStatus.destroy();
 const spec=(id,diagram,extra={})=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},...extra,sections:[{id:'main',diagram}]}});
 const provider=spec('provider',{nodes:{api:{title:'API'},store:{title:'Store',telemetry:{use:'db',table:'events'}},cache:{title:'Cache'}},rows:[['api','store','cache']],
  edges:[{from:'api',to:'store',label:'Persist'},{from:'api',to:'cache',label:'Warm'}],topologyExports:{core:{nodes:['api','store','cache'],edges:['api->store','api->cache']}}},
  {tracking:{telemetry:{templates:{db:{kind:'service',params:['table'],signals:{writes:{sql:'select count(*) from $table'}}}}}}});
 const consumer=spec('consumer',{nodes:{local:{title:'Local',telemetry:TQUEUE()}},rows:[['local']],
  topologyImports:[{spec:'provider',export:'core',as:'shared',nodeTracking:{api:{tickets:['AA-1'],telemetry:TSERVICE()}},edgeTracking:{'api->store':{telemetry:TCALL()}}}]});
 const resolved=local.C.FlowTopology.resolveSource(consumer,{version:1,id:'consumer',specs:[provider,consumer]});
 let resolveDetail;const renderOptions={loadDetail:()=>new Promise(r=>resolveDetail=r),telemetry:{provider:b=>{seen=b;return Promise.resolve({});}}};
 const h=harness(resolved,{},renderOptions),t=h.ctl.telemetry;
 const importedBindings=[TQUEUE_BOUND('local'),
  bound('shared::api','service',{rate:{source:'grafana',query:'sum(rate(http_requests_total{app="api"}[5m]))*3600',unit:'req/h'}},{rate:{min:1}}),
  bound('shared::store','service',{writes:{source:'sql',query:'select count(*) from events',unit:null}}),
  TCALL_BOUND('shared::api->shared::store')];
 assert.deepEqual(plain(t.bindings()),importedBindings,'M2 consumer overlay and provider-authored bindings reach imported nodes and edges; unbound imported carriers are absent');
 const pending=renderOptions.loadDetail({spec:'approved-detail'},new AbortController().signal);
 resolveDetail({nodes:{remote:{title:'Remote',telemetry:TQUEUE()},local:{title:'Shadow',telemetry:TSERVICE()}},rows:[['remote','local']]});await pending;
 const withDetail=importedBindings.concat([TQUEUE_BOUND('remote')]);
 assert.deepEqual(plain(t.bindings()),withDetail,'M2 a loaded detail page joins; a repeated id keeps its first binding');
 t.setEnabled(true);await settle();assert.deepEqual(plain(seen),withDetail,'M2 the provider receives local, imported and detail carriers');
 h.ctl.liveStatus.destroy();
});

test('M3 Metrics is off by default; on starts the provider loop with a 60 s floor, pauses hidden, catches up, keeps the last map on error; off and destroy abort',async()=>{
 let calls=0,fail=false,hold=null;const signals=[];
 const sample={a:{signals:{lag:{value:12,series:[[1,10],[2,12]],unit:'msgs'}},observedAt:'2026-11-03T10:00:00.000Z',markers:[],links:{}}};
 const h=harness(telemetryPage(),{},{telemetry:{provider:(b,s)=>{calls++;signals.push(s);if(hold)return hold;return fail?Promise.reject(Error('Grafana timeout')):Promise.resolve(sample);},refreshMs:1}}),t=h.ctl.telemetry;
 assert.ok(t,'M3 ctl.telemetry');
 h.flush();h.flush();await settle();
 assert.equal(calls,0,'M3 no provider call before Metrics is turned on');assert.equal(h.timers.size,0,'M3 no refresh timer while off');
 assert.deepEqual(plain(t.status()),IDLE);assert.equal(t.snapshot().available,true);assert.equal(t.snapshot().enabled,false);
 t.setEnabled(true);assert.equal(t.snapshot().enabled,true);assert.deepEqual(plain(t.status()),{state:'loading',busy:true,refreshedAt:null,note:''});
 await settle();assert.equal(calls,1,'M3 on calls the provider at once');
 const ok=plain(t.status());assert.equal(ok.state,'ok');assert.equal(ok.busy,false);assert.ok(isFinite(Date.parse(ok.refreshedAt)),'M3 refreshedAt is a timestamp');assert.equal(ok.note,'');
 assert.deepEqual(plain(t.snapshot().map),sample);
 assert.deepEqual([...h.timers.values()].map(x=>x.ms),[60000],'M3 refreshMs below a minute uses the 60 s floor');
 h.doc.hidden=true;h.doc.visibilityState='hidden';h.doc.dispatchEvent({type:'visibilitychange'});assert.equal(h.timers.size,0,'M3 a hidden document pauses refresh');
 h.doc.hidden=false;h.doc.visibilityState='visible';h.doc.dispatchEvent({type:'visibilitychange'});await settle();assert.equal(calls,2,'M3 one catch-up call on return');
 fail=true;let next=[...h.timers.values()][0];h.timers.clear();next.fn();assert.equal(t.status().busy,true,'M3 busy during a refresh');await settle();
 assert.equal(t.status().state,'error');assert.equal(t.status().note,'Grafana timeout');assert.equal(t.status().busy,false);
 assert.deepEqual(plain(t.snapshot().map),sample,'M3 the last map survives a failed refresh');
 fail=false;next=[...h.timers.values()][0];h.timers.clear();next.fn();await settle();assert.equal(t.status().state,'ok');assert.equal(t.status().note,'','M3 success clears the error note');
 t.setEnabled(false);
 assert.equal(signals[signals.length-1].aborted,true,'M3 off aborts the signal');assert.equal(h.timers.size,0,'M3 off retires the timer');
 assert.deepEqual(plain(t.snapshot().map),{},'M3 off clears the map');assert.deepEqual(plain(t.status()),IDLE,'M3 off returns to idle');
 const before=calls;h.doc.dispatchEvent({type:'visibilitychange'});await settle();assert.equal(calls,before,'M3 visibility never calls while off');
 let release;hold=new Promise(r=>release=r);t.setEnabled(true);await settle();assert.equal(calls,before+1);t.setEnabled(false);release(sample);await settle();
 assert.deepEqual(plain(t.snapshot().map),{},'M3 a late answer after off is dropped');assert.deepEqual(plain(t.status()),IDLE);
 hold=null;t.setEnabled(true);await settle();assert.equal(t.status().state,'ok');const live=signals[signals.length-1];assert.equal(live.aborted,false,'M3 on again gets a fresh signal');
 h.ctl.liveStatus.destroy();assert.equal(live.aborted,true,'M3 destroy aborts the signal');assert.equal(h.timers.size,0,'M3 destroy retires the timer');
 const after=calls;t.setEnabled(true);await settle();assert.equal(t.snapshot().enabled,false,'M3 a destroyed controller stays off');assert.equal(calls,after);
});

test('M4 refresh cadence: host refreshMs wins, else the page tracking.telemetry.refreshMs, else one minute, never below it',async()=>{
 for(const [pageMs,hostMs,want] of [[undefined,undefined,60000],[300000,undefined,300000],[300000,120000,120000],[undefined,30000,60000],[undefined,'soon',60000],[90000,0,90000]]){
  const h=harness(telemetryPage(pageMs),{},{telemetry:{provider:()=>Promise.resolve({}),refreshMs:hostMs}});
  assert.ok(h.ctl.telemetry,'M4 ctl.telemetry');h.ctl.telemetry.setEnabled(true);await settle();
  assert.deepEqual([...h.timers.values()].map(x=>x.ms),[want],JSON.stringify({pageMs,hostMs}));h.ctl.liveStatus.destroy();
 }
});

test('M5 apply keeps the provider result contract, snapshots are copies, clear empties, onChange reports and unsubscribes',()=>{
 const h=harness(telemetryPage(),{},{telemetry:{provider:()=>new Promise(()=>{})}}),t=h.ctl.telemetry,seen=[];
 assert.ok(t,'M5 ctl.telemetry');
 const off=t.onChange(value=>seen.push(plain(value)));
 t.apply({
  a:{signals:{lag:{value:12,series:[[1,10],['2026-11-03T10:00:00Z',11],[NaN,1],[3,'x'],[4],'bad',['never',2]],unit:'msgs'},rate:{value:Infinity,unit:7},bad:'x','9bad':{value:1}},
   observedAt:Date.UTC(2026,10,3,10),markers:[{at:'2026-11-03T09:00:00Z',kind:'deploy',label:'firmware 2.4.1'},{kind:'deploy'},'x',{at:'2026-11-03T09:30:00Z',kind:7}],
   links:{query:'https://grafana.test/explore?x=1',dashboard:'javascript:alert(1)',other:'https://x.test/'}},
  'a->b':{signals:{rate:{value:0}},observedAt:'not a time'},
  b:'nope',c:null,d:[1]
 });
 const want={a:{signals:{lag:{value:12,series:[[1,10],['2026-11-03T10:00:00Z',11]],unit:'msgs'},rate:{}},observedAt:'2026-11-03T10:00:00.000Z',
   markers:[{at:'2026-11-03T09:00:00.000Z',kind:'deploy',label:'firmware 2.4.1'},{at:'2026-11-03T09:30:00.000Z'}],links:{query:'https://grafana.test/explore?x=1'}},
  'a->b':{signals:{rate:{value:0}},observedAt:null,markers:[],links:{}}};
 assert.deepEqual(plain(t.snapshot().map),want);
 assert.equal(seen.length,1,'M5 apply reports one change');assert.deepEqual(seen[0].map,want);assert.equal(seen[0].enabled,false);assert.deepEqual(seen[0].status,IDLE,'M5 apply while off leaves the connector idle');
 const copy=t.snapshot().map;copy.a.signals.lag.value=99;assert.equal(t.snapshot().map.a.signals.lag.value,12,'M5 snapshot is a copy');
 t.clear();assert.deepEqual(plain(t.snapshot().map),{});assert.equal(seen.length,2,'M5 clear reports a change');
 off();t.apply(want);assert.equal(seen.length,2,'M5 unsubscribe stops change callbacks');assert.deepEqual(plain(t.snapshot().map),want);
 h.ctl.liveStatus.destroy();
});

test('M6 the Metrics overlay switch is in the shared header, off by default; on calls the provider and updates its connector text; off clears; Live is untouched',async()=>{
 let calls=0,seen=null,fail=false;const sample={a:{signals:{lag:{value:3}}}};
 const h=harness(telemetryPage(),{provider:()=>Promise.resolve(fixed)},{telemetry:{provider:b=>{calls++;seen=b;return fail?Promise.reject(Error('Grafana timeout')):Promise.resolve(sample);}}});
 const panel=mountStatus(h);h.flush();h.flush();await settle();
 const head=h.view.querySelector('.dv-live-head'),header=h.view.querySelector('.dv-status-header'),live=header.querySelector('.dv-live-toggle'),metrics=header.querySelector('button.dv-live-metrics'),conn=head.querySelector('.dv-live-metrics-connection'),jira=head.querySelector('.dv-live-connection');
 assert.ok(metrics,'M6 Metrics switch in the panel header');assert.equal(metrics.hidden,false);assert.equal(textOf(metrics).trim(),'Metrics overlay');assert.equal(metrics.type,'button');assert.equal(metrics.getAttribute('role'),'switch');
 assert.ok(!metrics.classList.contains('tbtn'),'#1131 a switch, not a button that looks like a third view');
 assert.equal(metrics.getAttribute('aria-checked'),'false','M6 off by default');assert.equal(calls,0,'M6 no provider call while off');
 const top=header.querySelector('.dv-status-top'),controls=head.querySelector('.dv-live-controls');
 assert.equal(top.children.at(-1),metrics,'#1131 the switch ends the top row');assert.ok(header.children.indexOf(top)<header.children.indexOf(live.parentElement),'#1131 Live | Over time is the row below');
 assert.ok(head.children.indexOf(controls)<head.children.indexOf(head.querySelector('.dv-live-status')),'M6 controls precede status text');
 assert.ok(conn,'M6 metrics connector text');assert.ok(!conn.classList.contains('dv-live-connection'),'M6 distinct connector');
 assert.equal(head.querySelectorAll('.dv-live-connection').length,1);
 assert.equal(h.view.querySelectorAll('.dv-live-metrics-connection').length,1,'#1136 one metrics connector line per view');assert.ok(conn.closest('.dv-live-status'),'#1162 in the Jira status row, below the counts and First blocker');
 const text=()=>conn.querySelectorAll('span')[0].textContent;
 assert.equal(conn.hidden,false);assert.equal(conn.tagName,jira.tagName,'M6 same markup as the Jira connector');assert.equal(conn.getAttribute('role'),'status');assert.ok(conn.querySelector('i.dv-live-metrics-dot'),'M6 its own status dot');
 assert.equal(conn.getAttribute('data-state'),'disconnected');assert.equal(conn.getAttribute('data-busy'),'false');assert.equal(text(),'Metrics: not connected');
 const livePressed=live.getAttribute('aria-pressed');assert.equal(livePressed,'true');
 metrics.dispatchEvent({type:'click'});
 assert.equal(metrics.getAttribute('aria-checked'),'true');assert.equal(conn.getAttribute('data-state'),'connecting');assert.equal(conn.getAttribute('data-busy'),'true');assert.equal(text(),'Metrics: connecting');
 await settle();assert.equal(calls,1);assert.deepEqual(plain(seen),LOCAL_BINDINGS,'M6 the click hands the provider the bound carriers');
 const at=h.ctl.telemetry.status().refreshedAt;
 assert.equal(conn.getAttribute('data-state'),'connected');assert.equal(conn.getAttribute('data-busy'),'false');assert.equal(text(),'Metrics: connected, refreshed '+metricsClock(at));
 assert.equal(h.ctl.liveStatus.snapshot().metrics.enabled,true,'M6 the panel snapshot carries the Metrics state');
 fail=true;const tick=[...h.timers.values()].find(x=>x.ms===60000);assert.ok(tick,'M6 metrics refresh is armed');for(const [id,x] of h.timers)if(x===tick)h.timers.delete(id);tick.fn();await settle();
 assert.equal(conn.getAttribute('data-state'),'error');assert.equal(text(),'Metrics: did not answer · Grafana timeout');
 assert.equal(live.getAttribute('aria-pressed'),livePressed,'M6 Jira Live is untouched');assert.equal(h.ctl.liveStatus.enabled(),true);
 metrics.dispatchEvent({type:'click'});
 assert.equal(metrics.getAttribute('aria-checked'),'false');assert.deepEqual(plain(h.ctl.telemetry.snapshot().map),{},'M6 off clears the map');
 assert.equal(conn.getAttribute('data-state'),'disconnected');assert.equal(text(),'Metrics: not connected');
 live.dispatchEvent({type:'click'});assert.equal(h.ctl.liveStatus.enabled(),false);assert.equal(h.ctl.telemetry.snapshot().enabled,false,'M6 Live does not drive Metrics');assert.equal(metrics.getAttribute('aria-checked'),'false');
 panel.destroy();h.ctl.liveStatus.destroy();
});

test('M7 a page with a telemetry provider and no Jira evidence still shows Metrics in the header',()=>{
 const h=harness(telemetryPage(),{},{telemetry:{provider:()=>Promise.resolve({})}});
 const panel=mountStatus(h),header=h.view.querySelector('.dv-status-header'),metrics=header.querySelector('button.dv-live-metrics'),line=h.view.querySelector('.dv-live-status .dv-live-metrics-connection');
 assert.ok(metrics && !metrics.hidden,'M7 Metrics overlay switch');assert.ok(line && !line.hidden,'M7 and its connector line (#1162: in the Jira status row)');
 assert.equal(h.view.querySelector('.dv-live-head').hidden,false);assert.equal(h.view.querySelector('.dv-live-status').hidden,false,'M7 the status row shows for the Metrics line alone');
 assert.equal(h.view.querySelector('.dv-live-toggle').hidden,true,'M7 Live stays hidden without Jira evidence');
 panel.destroy();h.ctl.liveStatus.destroy();
});

test('M8 a demo telemetry source shows Metrics, mounts only while on, reports demo, and is cleaned up on off and destroy',()=>{
 let mounted=0,cleaned=0,given=null;
 const h=harness(telemetryPage(),{},{telemetry:{demo:{mount:api=>{mounted++;given=api;api.apply({a:{signals:{lag:{value:1}}}});return ()=>cleaned++;}}}}),t=h.ctl.telemetry;
 assert.ok(t,'M8 ctl.telemetry');assert.equal(t.snapshot().available,true);assert.deepEqual(plain(t.status()),IDLE);
 const panel=mountStatus(h),metrics=h.view.querySelector('button.dv-live-metrics'),conn=h.view.querySelector('.dv-live-metrics-connection');
 assert.ok(metrics && !metrics.hidden,'M8 a demo source shows Metrics');assert.equal(mounted,0,'M8 the demo waits for Metrics');
 metrics.dispatchEvent({type:'click'});assert.equal(mounted,1);assert.equal(given,t,'M8 the demo drives ctl.telemetry');
 assert.equal(t.status().state,'ok');assert.deepEqual(plain(t.snapshot().map.a.signals),{lag:{value:1}});
 assert.equal(conn.getAttribute('data-state'),'demo');assert.match(conn.querySelectorAll('span')[0].textContent,/^Metrics: demo, refreshed /);
 metrics.dispatchEvent({type:'click'});assert.equal(cleaned,1,'M8 off runs the demo cleanup');assert.deepEqual(plain(t.snapshot().map),{});assert.deepEqual(plain(t.status()),IDLE);
 metrics.dispatchEvent({type:'click'});assert.equal(mounted,2);h.ctl.liveStatus.destroy();assert.equal(cleaned,2,'M8 destroy runs the demo cleanup');
 panel.destroy();
});

/* #939 PR 2 of 2 (Metrics canvas cues and the proof wrapper).
| W1 | `ctl.telemetry.verdicts()` runs proofVerdicts over every carrier of the page walk (bound or not, text boxes excluded) with the runtime Jira map and the telemetry map: per-carrier verdicts, telemetry state and rollups. |
| W2 | Step rollups: each authored step id judged over its directly selected carriers (liveStatusStepCarriers(d, step, true)). |
| W3 | Verdicts are re-evaluated on every Jira or telemetry change; telemetry change callbacks carry `verdicts` and fire after a Jira apply too. |
| C1 | Metrics on: a bound call/service edge with traffic gets a packet stream (`g.dv-metrics-stream[data-metrics-edge]`, 1–5 moving packets by order of magnitude of its primary rate, the same count of static packets for reduced motion and print); red packets follow the error share; a degraded edge is amber (`dv-metrics-degraded`); a silent Done edge gets a dotted ghost (`path.dv-metrics-ghost`) over a dimmed stroke (`dv-metrics-silent`); unbound edges and non-call edges get no stream; Jira paint is untouched. |
| C2 | Metrics on: a bound node gets `g.dv-metrics-node` with a sparkline of its primary rate series along the card bottom and a proof seal at the bottom-right (proven, degraded, unproven, live-early by verdict); unbound nodes and text boxes are unchanged; no text on the canvas. |
| C3 | Metrics off removes every cue; cues are re-applied after a rebuild (`dv:pathrender`) and follow telemetry and Jira changes; destroy removes them. |
| C4 | Imported topology carriers receive the same cues as local ones. Direct and nested consumers each have independent binding, stream, seal, sparkline, ghost, dimming, unbound-node, off and destroy tests below. Loaded-detail equivalents use the real native host loader and a clicked detail control in telemetry-overlay.spec.mjs (P12); no synthetic detail controller or mounted section. Rejects: walking only locally authored carriers, skipping detail-page paint, or leaving imported/detail cues behind on off or destroy. |
| C5 | Metrics packets never wear the ordinary `.pkt` or `.comm-packet` classes, and the frame measure skips the stream layer. |
| C6 | Demo: a Live status demo source carrying `telemetry: {provider}` (the #944 demo shape) shows Metrics as demo; the demo reaches the same controller as `ctl.liveStatus.telemetry`; a host telemetry provider wins over it. |
*/
const CUE_SERVICE=()=>({kind:'service',signals:{rate:{grafana:'sum(rate(http_requests_total[5m]))*3600',unit:'req/h'}},proof:{rate:{min:10}}});
function cuePage(){return {page:{tracking:{jira:{site:'https://jira.test'}},sections:[{id:'main',diagram:{
 nodes:{a:{tickets:['AA-1'],telemetry:TQUEUE()},b:{tickets:['BB-1'],telemetry:CUE_SERVICE()},c:{tickets:['CC-1'],telemetry:CUE_SERVICE()},d:{tickets:['DD-1']},f:{tickets:['FF-1'],telemetry:CUE_SERVICE()},note:{type:'text',text:'Note',telemetry:TQUEUE()}},
 rows:[['a','b','c','d','f']],
 edges:[{from:'a',to:'b',tickets:['EE-10'],telemetry:TCALL()},{from:'b',to:'c',tickets:['EE-11'],telemetry:TCALL()},{from:'c',to:'d',tickets:['EE-12'],telemetry:TCALL()},{from:'d',to:'a',tickets:['EE-13']},{from:'a',to:'c',tickets:['EE-14'],telemetry:TQUEUE()}],
 steps:[{id:'s1',edge:'a->b'},{id:'s2',edge:'b->c'},{id:'s3',nodes:['f','b']}]}}]}};}
const CUE_JIRA={'AA-1':{state:'done'},'BB-1':{state:'active'},'CC-1':{state:'done'},'DD-1':{state:'todo'},'FF-1':{state:'done'},'EE-10':{state:'done'},'EE-11':{state:'done'},'EE-12':{state:'active'},'EE-13':{state:'todo'},'EE-14':{state:'done'}};
const CUE_MAP=()=>({a:{signals:{lag:{value:10}}},b:{signals:{rate:{value:50,series:[[1,40],[2,45],[3,50]]}}},c:{signals:{rate:{value:0,series:[[1,0],[2,0]]}}},f:{signals:{rate:{value:5,series:[[1,5],[2,5]]}}},
 'a->b':{signals:{rate:{value:1300,series:[[1,1200],[2,1300]]},errors:{value:4}}},'b->c':{signals:{rate:{value:0,series:[[1,0],[2,0]]},errors:{value:0}}},'c->d':{signals:{rate:{value:100},errors:{value:30}}},'a->c':{signals:{lag:{value:3}}}});
const CUE_VERDICTS={a:'done-traffic-unmeasured',b:'active-live-early',c:'done-unproven',d:null,f:'done-degraded','a->b':'proven','b->c':'done-unproven','c->d':'active-failing','d->a':null,'a->c':'done-traffic-unmeasured'};
const CUE_SELECTOR='.dv-metrics-stream,.dv-metrics-ghost,.dv-metrics-node,[data-metrics-state]';
function cueHarness(raw=cuePage(),map=CUE_MAP){
 let telemetryMap=map();const h=harness(raw,{provider:()=>Promise.resolve(CUE_JIRA)},{telemetry:{provider:()=>Promise.resolve(telemetryMap)}});
 h.setMap=next=>{telemetryMap=next;};h.on=async()=>{h.flush();h.flush();await settle();assert.ok(h.ctl.telemetry,'ctl.telemetry');h.ctl.telemetry.setEnabled(true);await settle();};
 h.edge=i=>h.view.querySelector('path.edge[data-dv-edge="'+i+'"]');h.node=id=>h.view.querySelector('g.node[data-dv-node="'+id+'"]');
 h.stream=i=>h.view.querySelectorAll('g.dv-metrics-stream').filter(g=>g.getAttribute('data-metrics-edge')===String(i));
 h.moving=i=>h.stream(i).flatMap(g=>g.querySelectorAll('circle.dv-metrics-moving'));h.still=i=>h.stream(i).flatMap(g=>g.querySelectorAll('circle.dv-metrics-static'));
 h.ghost=i=>h.view.querySelectorAll('path.dv-metrics-ghost').filter(p=>p.getAttribute('data-metrics-edge')===String(i));
 h.cues=()=>h.view.querySelectorAll(CUE_SELECTOR);return h;
}

test('W1 W2 verdicts() judges every page carrier with the Jira and telemetry maps, with rollups and step rollups',async()=>{
 const h=cueHarness();await h.on();const t=h.ctl.telemetry;
 assert.equal(typeof t.verdicts,'function','W1 ctl.telemetry.verdicts');
 const v=plain(t.verdicts());
 assert.deepEqual(Object.keys(v.carriers).sort(),Object.keys(CUE_VERDICTS).sort(),'W1 every node and edge, bound or not; the text box is not a carrier');
 for(const [id,want] of Object.entries(CUE_VERDICTS))assert.equal(v.carriers[id].verdict,want,'W1 '+id);
 assert.equal(v.carriers.d.bound,false);assert.equal(v.carriers['d->a'].bound,false);
 assert.equal(v.carriers['b->c'].telemetry,'silent');assert.equal(v.carriers['c->d'].telemetry,'degraded');assert.deepEqual(v.carriers['c->d'].failing,['errors']);
 assert.deepEqual(v.rollups,{bound:8,unbound:2,proven:1,degraded:2,unproven:2,liveEarly:1});
 assert.deepEqual(v.steps,{s1:{verdict:'proven',label:'PROVEN'},s2:{verdict:'done-unproven',label:'DONE · UNPROVEN'},s3:{verdict:'active-failing',label:'IN PROGRESS · FAILING'}},'W2 step rollups over direct carriers');
 h.ctl.liveStatus.destroy();
});

test('W3 verdicts follow Jira and telemetry changes and reach change subscribers',async()=>{
 const h=cueHarness();await h.on();const t=h.ctl.telemetry,seen=[];
 assert.equal(typeof t.verdicts,'function','ctl.telemetry.verdicts exists');
 t.onChange(value=>seen.push(plain(value)));
 h.ctl.liveStatus.apply({...CUE_JIRA,'AA-1':{state:'active'}});
 assert.equal(t.verdicts().carriers.a.verdict,'active','W3 a Jira change re-judges');
 assert.ok(seen.length>=1,'W3 a Jira change notifies telemetry subscribers');assert.equal(seen[seen.length-1].verdicts.carriers.a.verdict,'active');
 t.apply({...CUE_MAP(),a:{signals:{lag:{value:900}}}});
 assert.equal(t.verdicts().carriers.a.verdict,'active-failing','W3 a telemetry change re-judges');assert.equal(seen[seen.length-1].verdicts.carriers.a.verdict,'active-failing');
 assert.equal(h.node('a').querySelector('.dv-metrics-seal').getAttribute('data-seal'),'degraded','W3 the canvas follows');
 h.ctl.liveStatus.destroy();
});

test('C1 Metrics on paints packet streams, red error packets, amber degraded edges and a ghost on the silent Done edge',async()=>{
 const h=cueHarness();await h.on();
 assert.equal(h.stream(0).length,1,'C1 flowing call edge has a stream');assert.equal(h.moving(0).length,4,'C1 1300 req/h is four packets');assert.equal(h.still(0).length,4,'C1 a static copy for reduced motion and print');
 const animated=c=>c.children.some(x=>x.tagName==='animateMotion');
 assert.ok(h.moving(0).every(animated),'C1 moving packets animate');assert.ok(h.still(0).every(c=>!animated(c)),'C1 static packets do not');
 assert.equal(h.moving(0).filter(c=>c.classList.contains('dv-metrics-packet-error')).length,0,'C1 0.3 % errors leave no red packet');
 assert.equal(h.edge(0).getAttribute('data-metrics-state'),'flowing');assert.equal(h.edge(0).getAttribute('data-metrics-verdict'),'proven');
 assert.equal(h.edge(0).getAttribute('data-live-appearance'),'done','C1 Jira paint is untouched');
 assert.equal(h.moving(2).length,3,'C1 100 req/h is three packets');assert.equal(h.moving(2).filter(c=>c.classList.contains('dv-metrics-packet-error')).length,1,'C1 30 % errors make one red packet');
 assert.ok(h.edge(2).classList.contains('dv-metrics-degraded'),'C1 degraded edge is amber');
 assert.equal(h.stream(1).length,0,'C1 silent edge has no stream');assert.equal(h.ghost(1).length,1,'C1 silent Done edge has a ghost');
 assert.ok(h.edge(1).classList.contains('dv-metrics-silent'),'C1 dimmed stroke under the ghost');assert.equal(h.ghost(1)[0].getAttribute('data-dv-edge'),null,'C1 the ghost is not a second carrier');
 assert.equal(h.edge(3).getAttribute('data-metrics-state'),null,'C1 unbound edge unchanged');assert.equal(h.stream(3).length+h.ghost(3).length,0);
 assert.equal(h.edge(4).getAttribute('data-metrics-state'),'unmeasured');assert.equal(h.stream(4).length,0,'C1 only call and service edges stream');
 for(const i of [0,2])assert.equal(h.edge(i).classList.contains('dv-metrics-silent'),false);
 h.ctl.liveStatus.destroy();
});

test('C2 Metrics on gives bound nodes a sparkline strip and a proof seal, and leaves unbound nodes and text boxes alone',async()=>{
 const h=cueHarness();await h.on();
 const seal=id=>h.node(id).querySelector('.dv-metrics-seal'),spark=id=>h.node(id).querySelector('.dv-metrics-sparkline');
 for(const [id,want] of [['b','live-early'],['c','unproven'],['f','degraded']]){
  assert.ok(seal(id),'C2 seal on '+id);assert.equal(seal(id).getAttribute('data-seal'),want,'C2 seal kind on '+id);
  assert.equal(seal(id).getAttribute('transform'),'translate(110 45)','C2 bottom-right corner of the 120×55 card');
  assert.equal(h.node(id).getAttribute('data-metrics-verdict'),CUE_VERDICTS[id]);
 }
 assert.equal(seal('a'),null,'C2 a maximum alone cannot earn a proof seal');
 assert.equal(spark('a'),null,'C2 no rate-like signal, no sparkline');
 const points=h.node('b').querySelectorAll('circle.dv-metrics-sparkline').map(dot=>[Number(dot.getAttribute('cx')),Number(dot.getAttribute('cy'))]);
 assert.equal(points.length,3,'C2 one visible dot per observed series point');
 assert.ok(points.every(([x,y])=>x>=0 && x<=120 && y>=55-12 && y<=55),'C2 the strip runs along the card bottom');
 assert.ok(points[0][1]>points[2][1],'C2 a rising series rises');
 const segments=h.node('b').querySelectorAll('polyline.dv-metrics-sparkline').map(line=>line.getAttribute('points').trim().split(/\s+/).map(p=>p.split(',').map(Number)));
 assert.equal(segments.length,2,'C2 each adjacent observed pair has its own segment');
 segments.forEach((segment,i)=>{assert.equal(segment.length,2);segment.forEach((point,j)=>point.forEach((coordinate,axis)=>assert.ok(Math.abs(coordinate-points[i+j][axis])<=.051,'C2 segments join their actual neighboring dots')));});
 for(const id of ['d','note']){assert.equal(h.node(id).querySelector('.dv-metrics-node'),null,'C2 '+id+' unchanged');assert.equal(h.node(id).getAttribute('data-metrics-state'),null);}
 assert.equal(h.view.querySelectorAll('.dv-metrics-node,.dv-metrics-stream').flatMap(g=>g.querySelectorAll('text')).length,0,'C2 no text on the canvas');
 h.ctl.liveStatus.destroy();
});

test('C3 Metrics off removes every cue; a rebuild re-applies them; destroy removes them',async()=>{
 const h=cueHarness();await h.on();const t=h.ctl.telemetry;
 assert.ok(h.cues().length>0,'C3 cues while on');
 t.setEnabled(false);assert.equal(h.cues().length,0,'C3 off removes every cue');assert.equal(h.edge(0).getAttribute('data-live-appearance'),'done','C3 Jira paint stays');
 t.setEnabled(true);await settle();assert.equal(h.moving(0).length,4,'C3 on again');
 h.cues().forEach(el=>{if(el.getAttribute('data-metrics-state')===null)el.remove();});
 h.ctl.sections[0].sectionEl.dispatchEvent({type:'dv:pathrender'});h.flush();
 assert.equal(h.moving(0).length,4,'C3 re-applied after a rebuild');assert.equal(h.ghost(1).length,1);
 h.setMap({...CUE_MAP(),'a->b':{signals:{rate:{value:20},errors:{value:0}}}});t.apply({...CUE_MAP(),'a->b':{signals:{rate:{value:20},errors:{value:0}}}});
 assert.equal(h.moving(0).length,2,'C3 the stream follows a telemetry change');
 h.ctl.liveStatus.destroy();assert.equal(h.cues().length,0,'C3 destroy removes every cue');
});

async function importedCueHarness(label,t){
 const spec=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
 const provider=spec('provider',{nodes:{api:{title:'API'},store:{title:'Store'}},rows:[['api','store']],edges:[{from:'api',to:'store',label:'Persist'},{from:'store',to:'api',label:'Return'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store','store->api']}}});
 const consumer=spec('consumer',{nodes:{},rows:[[]],topologyImports:[{spec:'provider',export:'core',as:'shared',nodeTracking:{api:{tickets:['IMP-1'],telemetry:CUE_SERVICE()}},edgeTracking:{'api->store':{tickets:['IMP-2'],telemetry:TCALL()},'store->api':{tickets:['IMP-3'],telemetry:TCALL()}}}]});
 const middle=structuredClone(consumer);middle.page.canon.id='middle';middle.page.sections[0].diagram.topologyExports={nested:{nodes:['shared::api','shared::store'],edges:['shared::api->shared::store','shared::store->shared::api']}};
 const outer=spec('outer',{nodes:{},rows:[[]],topologyImports:[{spec:'middle',export:'nested',as:'outer'}]});
 const seed=harness();t.after(()=>seed.ctl.liveStatus.destroy());
 const doc=label==='direct'?consumer:outer,prefix=label==='direct'?'shared::':'outer::shared::';
 const resolved=seed.C.FlowTopology.resolveSource(doc,{version:1,id:doc.page.canon.id,specs:[provider,consumer,middle,outer]});
 const api=prefix+'api',store=prefix+'store',edgeId=api+'->'+store,silentId=store+'->'+api;
 const samples={[api]:{signals:{rate:{value:50,series:[[1,30],[2,50]]}}},[edgeId]:{signals:{rate:{value:500},errors:{value:1}}},[silentId]:{signals:{rate:{value:0},errors:{value:0}}}};
 const h=harness(resolved,{provider:()=>Promise.resolve({'IMP-1':{state:'done'},'IMP-2':{state:'done'},'IMP-3':{state:'done'}})},{telemetry:{provider:()=>Promise.resolve(samples)}});
 t.after(()=>h.ctl.liveStatus.destroy());
 const scope=h.ctl.sections[0].sectionEl,d=h.ctl.page.sections[0].diagram;
 const index=d.edges.findIndex(e=>e.from+'->'+e.to===edgeId),silentIndex=d.edges.findIndex(e=>e.from+'->'+e.to===silentId);
 assert.ok(index>=0 && silentIndex>=0,'C4 '+label+' imported edges resolved');
 h.flush();h.flush();await settle();h.ctl.telemetry.setEnabled(true);await settle();
 return {...h,scope,api,store,edgeId,silentId,index,silentIndex,node:scope.querySelector('g.node[data-dv-node="'+api+'"]')};
}
// Each scope AND cue contract gets its own test: an absent direct-node seal
// cannot prevent nested streams, ghosts or cleanup from reaching assertions.
for(const label of ['direct','nested']){
 test('C4 '+label+' imported carriers retain the selected telemetry bindings',async t=>{
  const h=await importedCueHarness(label,t),bindings=plain(h.ctl.telemetry.bindings());
  assert.deepEqual(bindings.map(b=>b.id),[h.api,h.edgeId,h.silentId]);
  assert.deepEqual(bindings[0].signals.rate,{source:'grafana',query:'sum(rate(http_requests_total[5m]))*3600',unit:'req/h'});
 });
 test('C4 '+label+' imported node gets a proven seal',async t=>{
  const h=await importedCueHarness(label,t);
  assert.equal(h.node.querySelector('.dv-metrics-seal')?.getAttribute('data-seal'),'proven','C4 '+label+' imported node seal');
 });
 test('C4 '+label+' imported node gets a sparkline',async t=>{
  const h=await importedCueHarness(label,t);
  assert.ok(h.node.querySelector('polyline.dv-metrics-sparkline'),'C4 '+label+' imported node sparkline');
 });
 test('C4 '+label+' imported flowing edge gets a stream',async t=>{
  const h=await importedCueHarness(label,t);
  const moving=h.scope.querySelectorAll('g.dv-metrics-stream').filter(g=>g.getAttribute('data-metrics-edge')===String(h.index)).flatMap(g=>g.querySelectorAll('circle.dv-metrics-moving'));
  assert.equal(moving.length,3,'C4 '+label+' imported edge stream');
 });
 test('C4 '+label+' imported silent Done edge gets a ghost',async t=>{
  const h=await importedCueHarness(label,t);
  assert.equal(h.scope.querySelectorAll('path.dv-metrics-ghost').filter(p=>p.getAttribute('data-metrics-edge')===String(h.silentIndex)).length,1,'C4 '+label+' silent imported edge ghost');
 });
 test('C4 '+label+' imported silent edge stroke is dimmed',async t=>{
  const h=await importedCueHarness(label,t);
  assert.ok(h.scope.querySelector('path.edge[data-dv-edge="'+h.silentIndex+'"]').classList.contains('dv-metrics-silent'),'C4 '+label+' silent imported stroke dimmed');
 });
 test('C4 '+label+' unbound imported node stays unchanged',async t=>{
  const h=await importedCueHarness(label,t),node=h.scope.querySelector('g.node[data-dv-node="'+h.store+'"]');
  assert.equal(node.querySelectorAll(CUE_SELECTOR).length,0);
  assert.equal(node.getAttribute('data-metrics-state'),null,'C4 '+label+' unbound imported node unchanged');
 });
 for(const action of ['off','destroy'])test('C4 '+label+' '+action+' removes imported cues and carrier decoration',async t=>{
  const h=await importedCueHarness(label,t),paintedWhileOn=h.scope.querySelectorAll(CUE_SELECTOR).length;
  if(action==='off')h.ctl.telemetry.setEnabled(false);else h.ctl.liveStatus.destroy();
  assert.deepEqual({paintedWhileOn:paintedWhileOn>0,remaining:h.scope.querySelectorAll(CUE_SELECTOR).length},{paintedWhileOn:true,remaining:0},'C4 '+label+' '+action+' removes cues painted while on');
  assert.equal(h.scope.querySelectorAll('.dv-metrics-bound,.dv-metrics-flowing,.dv-metrics-degraded,.dv-metrics-silent,.dv-metrics-unobserved,.dv-metrics-ghosted,[data-metrics-verdict]').length,0,'C4 '+label+' '+action+' removes carrier classes and verdicts');
 });
}

test('C5 Metrics packets never wear the ordinary packet classes and the frame measure skips the stream layer',async()=>{
 const h=cueHarness();await h.on();
 const packets=h.view.querySelectorAll('circle.dv-metrics-packet');assert.ok(packets.length>0);
 assert.ok(packets.every(c=>!c.classList.contains('pkt') && !c.classList.contains('comm-packet') && !c.classList.contains('loopdot')),'C5 own classes only');
 assert.match(fs.readFileSync('src/engine.js','utf8'),/child\.matches\('[^']*\.dv-metrics-stream[^']*'\)/,'C5 the frame measure skips the stream layer');
 const css=fs.readFileSync('src/style.core.css','utf8');
 assert.match(css,/@media \(prefers-reduced-motion: reduce\)\{[^}]*\.dv-metrics-moving\{display:none/,'C5 reduced motion hides moving packets');
 assert.match(css,/@media print\{[^}]*\.dv-metrics-moving\{display:none/,'C5 print hides moving packets');
 h.ctl.liveStatus.destroy();
});

test('C6 a Live status demo source with telemetry shows Metrics as demo, reaches the same controller, and yields to a host provider',async()=>{
 let live=null;const day={'a->b':{signals:{rate:{value:1300},errors:{value:0}}}};
 const demo=()=>({provider:()=>Promise.resolve(CUE_JIRA),telemetry:{provider:()=>day},demo:{mount:api=>{live=api;return ()=>{};}}});
 const h=harness(cuePage(),demo()),t=h.ctl.telemetry;
 assert.ok(t && t.snapshot().available,'C6 the demo telemetry source makes Metrics available');
 assert.equal(live.telemetry,t,'C6 the demo reaches ctl.telemetry through the Live status API');
 const panel=mountStatus(h);h.flush();h.flush();await settle();
 const metrics=h.view.querySelector('button.dv-live-metrics'),conn=h.view.querySelector('.dv-live-metrics-connection');
 assert.equal(metrics.hidden,false);metrics.dispatchEvent({type:'click'});await settle();
 assert.equal(conn.getAttribute('data-state'),'demo','C6 reported as demo');assert.match(conn.querySelectorAll('span')[0].textContent,/^Metrics: demo, refreshed /);
 live.telemetry.apply({'a->b':{signals:{rate:{value:20},errors:{value:0}}}});
 assert.equal(h.view.querySelectorAll('g.dv-metrics-stream').filter(g=>g.getAttribute('data-metrics-edge')==='0').flatMap(g=>g.querySelectorAll('circle.dv-metrics-moving')).length,2,'C6 a demo day push repaints the canvas');
 panel.destroy();h.ctl.liveStatus.destroy();
 let hostCalls=0;const hosted=harness(cuePage(),demo(),{telemetry:{provider:()=>{hostCalls++;return Promise.resolve({});}}});
 hosted.flush();hosted.flush();await settle();hosted.ctl.telemetry.setEnabled(true);await settle();
 assert.equal(hostCalls,1,'C6 a host telemetry provider wins over the demo');assert.equal(hosted.ctl.liveStatus.snapshot().metrics.demo,false);
 hosted.ctl.liveStatus.destroy();
});

/* #943: the claude.ai Grafana adapter (src/viewer/telemetry-claude.js) names its connector.
| M9 | With `telemetry.source` (the Grafana adapter passes 'Grafana') the metrics connector text reads "<source> not connected", "<source> connecting · <window> window", "<source> connected · <window> window · refreshed <time>" plus " · <note>" when the provider reported a note for that answer (third provider argument, `report.note(text)`; a clean answer clears it), "<source> needs approval · <window> window" with data-state approval for a rejection whose `state` is 'approval', and the error note (else "<source> did not answer") on error. The window is tracking.telemetry.window, default 24h. snapshot().metrics carries source and window. Without a source the "Metrics: …" text is unchanged (M6). |
| M10 | The panel's action button (ctl.liveStatus.action) also shows on a page whose only live evidence is a telemetry provider, so "Allow Grafana" reaches viewers of a metrics-only board. |
*/
test('M9 a named telemetry source reads "<source> connected · <window> window · refreshed <time>", carries its note, approval and error',async()=>{
 let mode='ok',reports=0;const sample={a:{signals:{lag:{value:3}}}};
 const provider=(b,signal,report)=>{
  if(report && typeof report.note==='function'){reports++;if(mode==='note')report.note('1 Grafana query failed: a lag: boom');}
  if(mode==='approval')return Promise.reject(Object.assign(Error('Grafana access needs your approval'),{state:'approval'}));
  if(mode==='error')return Promise.reject(Error('Reconnect Grafana in claude.ai Settings → Connectors'));
  if(mode==='bare')return Promise.reject(Error(''));
  return Promise.resolve(sample);
 };
 const h=harness(telemetryPage(),{},{telemetry:{source:'Grafana',provider}});
 const panel=mountStatus(h);h.flush();h.flush();await settle();
 const metrics=h.view.querySelector('button.dv-live-metrics'),conn=h.view.querySelector('.dv-live-metrics-connection'),text=()=>conn.querySelectorAll('span')[0].textContent;
 assert.equal(text(),'Grafana not connected','M9 idle');assert.equal(conn.getAttribute('data-state'),'disconnected');
 metrics.dispatchEvent({type:'click'});assert.equal(text(),'Grafana connecting · 24h window','M9 connecting names the default 24h window');
 await settle();assert.ok(reports>0,'M9 the provider receives a report object with note()');
 const clock=()=>metricsClock(h.ctl.telemetry.status().refreshedAt);
 assert.equal(conn.getAttribute('data-state'),'connected');assert.equal(text(),'Grafana connected · 24h window · refreshed '+clock());
 const snap=h.ctl.liveStatus.snapshot().metrics;assert.equal(snap.source,'Grafana');assert.equal(snap.window,'24h');
 const tick=()=>{const entry=[...h.timers].find(([,x])=>x.ms===60000);assert.ok(entry,'M9 refresh armed');h.timers.delete(entry[0]);entry[1].fn();};
 mode='note';tick();await settle();
 assert.equal(h.ctl.telemetry.status().state,'ok');assert.equal(h.ctl.telemetry.status().note,'1 Grafana query failed: a lag: boom','M9 a reported note rides a good answer');
 assert.equal(text(),'Grafana connected · 24h window · refreshed '+clock()+' · 1 Grafana query failed: a lag: boom');
 mode='ok';tick();await settle();assert.equal(h.ctl.telemetry.status().note,'','M9 a clean answer clears the note');assert.equal(text(),'Grafana connected · 24h window · refreshed '+clock());
 const kept=plain(h.ctl.telemetry.snapshot().map);mode='approval';tick();await settle();
 assert.equal(h.ctl.telemetry.status().state,'approval','M9 a rejection with state approval');assert.equal(conn.getAttribute('data-state'),'approval');assert.equal(text(),'Grafana needs approval · 24h window');
 assert.deepEqual(plain(h.ctl.telemetry.snapshot().map),kept,'M9 approval keeps the map like any rejection');
 mode='error';tick();await settle();assert.equal(conn.getAttribute('data-state'),'error');assert.equal(text(),'Reconnect Grafana in claude.ai Settings → Connectors','M9 the error note names the fix');
 mode='bare';tick();await settle();assert.equal(text(),'Grafana did not answer','M9 an error without a note');
 panel.destroy();h.ctl.liveStatus.destroy();
 const six=telemetryPage();six.page.tracking.telemetry.window='6h';
 const w=harness(six,{},{telemetry:{source:'Grafana',provider:()=>new Promise(()=>{})}}),wp=mountStatus(w);
 w.view.querySelector('button.dv-live-metrics').dispatchEvent({type:'click'});
 assert.equal(w.view.querySelector('.dv-live-metrics-connection').querySelectorAll('span')[0].textContent,'Grafana connecting · 6h window','M9 the authored window');
 wp.destroy();w.ctl.liveStatus.destroy();
});

test('M10 the action button shows on a metrics-only page so Allow Grafana reaches its viewers',()=>{
 const page={page:{tracking:{telemetry:{grafana:{prometheus:'prom-main'}}},sections:[{id:'main',diagram:{nodes:{a:{title:'A',telemetry:TQUEUE()}},rows:[['a']]}}]}};
 const h=harness(page,{},{telemetry:{source:'Grafana',provider:()=>Promise.resolve({})}}),panel=mountStatus(h);
 assert.equal(h.ctl.liveStatus.snapshot().available,false,'M10 no Jira evidence on this page');
 // #1136: a metrics-only page opens on the Trace view, which carries the action button.
 let ran=0;h.ctl.liveStatus.action('Allow Grafana',()=>ran++);assert.equal(h.ctl.liveStatus.snapshot().mode,'trace');
 const action=namedControls(h.view,'Allow Grafana');
 assert.equal(action.length,1,'M10 the action button');
 action[0].dispatchEvent({type:'click'});assert.equal(ran,1,'M10 it runs the adapter action');
 h.ctl.liveStatus.action('',null);assert.equal(namedControls(h.view,'Allow Grafana').length,0,'M10 cleared, it hides');
 panel.destroy();h.ctl.liveStatus.destroy();
});

/* Over time contract matrix (#929, PR 1 of 3). Source: issue behavior items 1-4, 6, 8 and 11 and
   Chuck's rulings of 2026-11-03. Real slider input and the demo player are in live-status.spec.mjs.
| row | fixture | assertion (scoped) | rejects |
|---|---|---|---|
| OT1 | board with and without a history source, before and after evidence | `button.dv-live-over-time` hidden unless a source exists and evidence applied; `snapshot().overTime` null without a source | a button on every board; a button that shows before status has loaded |
| OT2 | source that counts load calls | load count 0 before the click, 1 after it | loading history at page load or on any repaint |
| OT3 | `liveStatusDayMap` over a full entry | status and detail from the day; title, owner, PRs, dependencies and epic from today; no updatedAt; a ticket the day does not name is missing | an overlay that copies the day's metadata; an overlay that keeps today's status name |
| OT4 | local nodes, an edge, a step, a lane and a planned node | carrier classes, coin, counts, ring, lanes, blockers, Tickets State and availability follow the day | repainting nodes only |
| OT5 | imported carriers | imported node and edge classes follow the day | a local-only slice |
| OT6 | tickets absent from the day, one of them upstream of another (#1012) | keeps its row and title, stays in the total, state reads missing, never done, its carrier wears dv-live-missing, it is not a blocker (Chuck, 2026-11-04), and its dependent reports a Missing upstream with a grey tone | dropping the ticket from the map; an uncolored carrier that hides the gap; a gap in the record counted as a blocker |
| OT16 | a step whose only ticket has no status on one day and is blocked on the next | First blocker cannot reach it on the first day and reads No blockers; the blocked day is a real blocker | First blocker jumping to a ticket that did not exist |
| OT7 | overdue active ticket with a live change pulse available | moving days logs no Activity, adds no dv-live-changed, shows no dv-live-stale | moving days through apply() |
| OT8 | live apply while a past day shows | display, Activity and the editor's remembered map stay put; Live shows the newest map and logs its change once | a refresh that overwrites the past day; a past day saved as the last live map |
| OT9 | fake board editor | Edit disabled with the stated reason on a past day, enabled after; Over time disabled while Edit is active | an editable past day |
| OT10 | index out of range and not whole | clamped to the range, or ignored | a fractional or undefined day |
| OT11 | clear() on a past day | mode ends and today's evidence is gone | a past day surviving a permission loss |
| OT12 | demo timeline with a late ticket, a ticket that later disappears, and one never named | not created yet: no status entry; absent after existing: missing; epic state per day; last day matches the live demo | treating every absent ticket the same |
| OT13 | provider entry without a state | apply() still drops it | widening the provider contract |
| OT15 | status row and day buttons (#986, #1162) | connection and notes are in `.dv-live-status`, which wraps, with their full text in its title; the counts strip and the buttons are in `.dv-live-controls`, First blocker last; a board's `<` and `>` step the slider, are disabled at the ends, and are absent on Live | changing text beside static buttons; step buttons on a board with no slider |
| OT14 | the two mode buttons (Chuck, 2026-11-04) | Live and Over time are the only two buttons of their header row (#1131), exactly one is pressed, the selected Over time click does nothing, Live returns to today without turning colors off, the selected Live click still turns colors off, and Over time turns colors back on | a Back to today button; a past day with colors off |
| OT17 | days dated two days ago to today, then a history ending before today and one with no dates (#1082) | the Over time row's heading shows the selected day's label large; on a day dated today it reads TODAY with the label beside it; the slider and `<` `>` update it; Live has no heading | a date only in the small note; TODAY on a last day that is not today |
| OT18 | Metrics off; days from the product builders in America/New_York: a normal day, the 23 h and 25 h DST days, a demo day, today; days with no date key (#1132) | `snapshot().overTime.window` is `{from, to, label}`: from the day key's local midnight to the next local midnight in UTC, today ending now; null in Live and on a day with no key | a UTC-midnight day; a fixed 24 h day; a demo day cut at its UTC `at`; a window that needs Metrics; a today window ending in the future |
| OT19 | log lookup with a Grafana transport; a dated past day, today (the default day) with the clock moved 2 min, Previous day, Live, an undated day (#1141) | Find sends exactly the day's window (today: local midnight to now) once; results survive repaints while today's end moves; a day change clears results with no call and keeps the typed value; Live sends now-2h..now; an undated day names itself | an identity keyed on the window (today's rows vanish on the next paint); a day search that refetches on repaint |
| OT20 | a board with no ticket or epic references and two telemetry carriers, a window-mode history spy; the local day builder at fixed times in America/New_York; a detail with a ticket or a Jira history source arriving while it is open; a click on the selected Live (#1138) | Over time shows and opens on 7 days keyed by local date, ending today, each ending at the next local midnight; no provider or history call with Metrics off; with Metrics on one history window per new day and none for a past day already loaded; the local Over time ends when the board gains a ticket or a Jira source arrives; Live stays selected | Over time only with a Jira history source; a UTC or fixed 24 h day list; a day list that calls a connector; a refetch of a loaded past day; a reader left on a past day with no Live; a Live click that un-presses Live with nothing to turn off |
*/
const overFixture=()=>({page:{tracking:{jira:{site:'https://jira.test',epic:'EP-1'}},lanes:{APP:{label:'App',color:'#34d399'}},sections:[{id:'main',diagram:{nodes:{a:{title:'Alpha',tickets:['AA-1']},b:{title:'Beta',tickets:['BB-1']},planned:{title:'Planned',tickets:['AA-1'],existsWhen:'tickets-done'}},rows:[['a','b','planned']],edges:[{from:'a',to:'b',tickets:['EE-1']}],steps:[{id:'hop',edge:'a->b',lane:'APP'},{id:'beta',nodes:['b'],lane:'APP'}],panels:[{id:'status',type:'live-status',title:'Status'}]}}]}});
const overStale='2000-01-01T00:00:00Z';
const overToday=()=>({'EP-1':{state:'active',kind:'epic',title:'Epic'},'AA-1':{state:'done',title:'Alpha work',assignee:'Alex',epic:'EP-1',detail:'Done today',prs:{count:1,state:'merged'}},'BB-1':{state:'active',title:'Beta work',assignee:'Sam',epic:'EP-1',updatedAt:overStale,dependsOn:[{key:'AA-1',source:'jira',linkType:'is blocked by'}]},'EE-1':{state:'active',title:'Edge work',epic:'EP-1'},'ZZ-2':{state:'done',title:'Epic only story',epic:'EP-1'}});
// Day 0: AA-1 and ZZ-2 do not exist yet. Day 1: AA-1 is blocked. Day 2 is today.
const overDays=()=>[
 {label:'Oct 20',short:'Oct 20',states:{'EP-1':{state:'todo'},'BB-1':{state:'todo'},'EE-1':{state:'todo'}}},
 {label:'Oct 21',short:'Oct 21',states:{'EP-1':{state:'active'},'AA-1':{state:'blocked',detail:'Flagged then'},'BB-1':{state:'todo'},'EE-1':{state:'active'},'ZZ-2':{state:'todo'}}},
 {label:'Oct 22',short:'Oct 22',states:{'EP-1':{state:'active'},'AA-1':{state:'done'},'BB-1':{state:'active'},'EE-1':{state:'active'},'ZZ-2':{state:'done'}}}];
const overButton=h=>h.view.querySelector('button.dv-live-over-time'),overLiveButton=h=>h.view.querySelector('button.dv-live-toggle');
function overReady(api){assert.equal(typeof api.setHistory,'function','#929: the controller accepts a history source');return api;}
function overBackToLive(api){assert.equal(typeof api.overTimeClose,'function','#929: Live returns to today');api.overTimeClose();}
async function overOpen(h,index){const api=overReady(h.ctl.liveStatus);api.setHistory({load:()=>({days:overDays()})});api.overTime();await historySettle();if(index!=null)api.overTimeDay(index);return api;}
const overRow=(h,key)=>h.view.querySelector('tr[data-live-ticket="'+key+'"]');
const overState=(h,key)=>overRow(h,key).querySelector('.dv-live-state-pill');
test('OT1 OT2 Over time shows with a history source and evidence, and only the click loads',async()=>{
 const none=harness(overFixture()),noneApi=none.ctl.liveStatus;mountStatus(none);noneApi.apply(overToday());
 assert.equal(noneApi.snapshot().overTime,null,'no source, no mode');assert.ok(!overButton(none) || overButton(none).hidden,'no source, no button');
 const h=harness(overFixture()),api=overReady(h.ctl.liveStatus);let loads=0;mountStatus(h);api.setHistory({load(){loads++;return {days:overDays()};}});
 assert.ok(!overButton(h) || overButton(h).hidden,'no evidence, no button');
 api.apply(overToday());assert.equal(overButton(h).hidden,false);assert.equal(overButton(h).textContent,'Over time');assert.equal(loads,0);
 api.apply(overToday());h.flush();assert.equal(loads,0,'repaints and refreshes load nothing');
 overButton(h).dispatchEvent({type:'click'});await historySettle();assert.equal(loads,1);assert.equal(overButton(h).textContent,'Over time');assert.equal(overButton(h).getAttribute('aria-pressed'),'true');
 assert.equal(api.snapshot().overTime.active,true);assert.equal(api.snapshot().overTime.count,3);assert.equal(api.snapshot().overTime.index,2,'a board opens on its last day');
 const slider=h.view.querySelector('input.dv-live-over-time-slider');assert.equal(slider.type,'range');assert.equal(slider.min,'0');assert.equal(slider.max,'2');assert.equal(slider.step,'1');assert.equal(slider.getAttribute('aria-label'),'Day');
 assert.deepEqual(h.view.querySelectorAll('.dv-live-over-time-end').map(el=>el.textContent),['Oct 20','Oct 22']);
 assert.equal(h.view.querySelector('.dv-live-over-time-note').textContent,'Status as of Oct 22 · other columns show today');
 slider.value='1';slider.dispatchEvent({type:'input'});assert.equal(api.snapshot().overTime.index,1);assert.equal(slider.getAttribute('aria-valuetext'),'Oct 21');
 overLiveButton(h).dispatchEvent({type:'click'});await historySettle();assert.equal(api.snapshot().overTime.active,false);assert.equal(h.view.querySelector('input.dv-live-over-time-slider'),null);assert.equal(loads,1,'closing loads nothing');
});
test('OT3 a day overlay takes status from the day and everything else from today',()=>{
 const C=harness().C,today=overToday();assert.equal(typeof C.liveStatusDayMap,'function');
 const map=plain(C.liveStatusDayMap(today,{'AA-1':{state:'blocked',detail:'Flagged then',title:'Old title'},'BB-1':{state:'unknown'}}));
 assert.deepEqual(map['AA-1'],{state:'blocked',title:'Alpha work',assignee:'Alex',epic:'EP-1',detail:'Flagged then',prs:{count:1,state:'merged'}});
 assert.deepEqual(map['BB-1'],{title:'Beta work',assignee:'Sam',epic:'EP-1',dependsOn:[{key:'AA-1',source:'jira',linkType:'is blocked by'}],state:'missing',noTicket:true,detail:'No ticket on this day'});
 assert.equal(map['EE-1'].state,'missing');assert.equal(today['BB-1'].updatedAt,overStale,'today is not modified');assert.equal(today['AA-1'].state,'done');
});
test('OT4 moving days repaints carriers, coins, counts, ring, lanes, blockers, Tickets and availability',async()=>{
 const h=harness(overFixture());mountStatus(h);const api=h.ctl.liveStatus;api.apply(overToday());
 const a=h.view.querySelector('[data-dv-node="a"]'),planned=h.view.querySelector('[data-dv-node="planned"]'),edge=h.view.querySelector('path.edge'),coin=h.view.querySelector('g.coin[data-dv-step="1"]');
 // Contrasting precondition: today AA-1 is done and the planned node is available.
 assert.ok(a.classList.contains('dv-live-done'));assert.ok(!planned.classList.contains('dv-live-unavailable'));assert.equal(api.snapshot().counts.blocked,0);assert.equal(api.snapshot().readiness.done,2);
 await overOpen(h,1);h.flush();
 assert.ok(a.classList.contains('dv-live-blocked'));assert.ok(!a.classList.contains('dv-live-done'));assert.ok(edge.classList.contains('dv-live-active'));assert.ok(coin.classList.contains('dv-live-todo'));assert.ok(planned.classList.contains('dv-live-unavailable'),'availability follows the day');
 const snap=api.snapshot();assert.equal(snap.counts.blocked,1);assert.equal(snap.counts.todo,2);assert.equal(snap.readiness.done,0);assert.deepEqual(plain(snap.blockers).map(item=>item.key),['AA-1']);
 assert.equal(snap.lanes[0].state,'blocked');assert.equal(snap.lanes[0].done,0);assert.equal(overState(h,'AA-1').textContent,'blocked');assert.equal(overState(h,'ZZ-2').textContent,'todo');assert.equal(h.view.querySelector('.dv-live-blocker').querySelector('.nbacklink').textContent,'AA-1');
 assert.match(overCaption(h,0),/^IN PROGRESS/);
 api.overTimeDay(0);h.flush();assert.ok(edge.classList.contains('dv-live-todo'));assert.ok(!edge.classList.contains('dv-live-active'));
 api.overTimeDay(2);h.flush();assert.ok(a.classList.contains('dv-live-done'));assert.ok(!planned.classList.contains('dv-live-unavailable'));assert.equal(api.snapshot().counts.blocked,0);assert.equal(overState(h,'ZZ-2').textContent,'done');
});
function overCaption(h,step){const d=h.ctl.page.sections[0].diagram,snap=h.ctl.liveStatus.snapshot();return h.C.liveStatusCaption(d,d.steps[step],snap.states,snap.waiting);}
test('OT5 imported carriers follow the same day map as local ones',async()=>{
 const seed=harness(),C=seed.C;seed.ctl.liveStatus.destroy();
 const model=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram:d}]}});
 const provider=model('provider',{nodes:{api:{title:'API'},db:{title:'DB'}},rows:[['api','db']],edges:[{from:'api',to:'db',label:'Persist'}],topologyExports:{core:{nodes:['api','db'],edges:['api->db']}}});
 const consumer=model('consumer',{nodes:{},rows:[[]],topologyImports:[{spec:'provider',export:'core',as:'canon',nodeTracking:{api:{tickets:['AA-1']}},edgeTracking:{'api->db':{tickets:['AA-2']}}}],steps:[{id:'persist',edge:'canon::api->canon::db'}]});
 consumer.page.tracking={jira:{site:'https://jira.test'}};
 const h=harness(C.FlowTopology.materialize([provider,consumer])[1]),api=h.ctl.liveStatus;api.apply({'AA-1':{state:'done',title:'One'},'AA-2':{state:'done',title:'Two'}});
 const node=h.view.querySelector('[data-dv-node="canon::api"]'),edge=h.view.querySelector('path.edge');assert.ok(node.classList.contains('dv-live-done'));assert.ok(edge.classList.contains('dv-live-done'));
 overReady(api).setHistory({load:()=>({days:[{label:'One',short:'One',states:{'AA-1':{state:'blocked'},'AA-2':{state:'active'}}},{label:'Two',short:'Two',states:{'AA-1':{state:'done'},'AA-2':{state:'done'}}}]})});api.overTime();await historySettle();api.overTimeDay(0);h.flush();
 assert.ok(node.classList.contains('dv-live-blocked'));assert.ok(edge.classList.contains('dv-live-active'));assert.ok(!edge.classList.contains('dv-live-done'));
 assert.equal(api.state('AA-1').title,'One','imported ticket metadata stays as of today');api.destroy();
});
test('OT6 a ticket with no status on a day shows as Missing there, keeps its row and stays in the total',async()=>{
 const h=harness(overFixture());mountStatus(h);const api=h.ctl.liveStatus;api.apply(overToday());const total=api.snapshot().epic.stories;assert.equal(total,4);
 const a=h.view.querySelector('[data-dv-node="a"]');assert.ok(!a.classList.contains('dv-live-missing'),'contrasting precondition: AA-1 exists today');
 await overOpen(h,0);h.flush();const snap=api.snapshot();
 assert.equal(snap.epic.stories,total,'the total is the same on every day');assert.equal(snap.epic.done,0);
 assert.equal(overState(h,'ZZ-2').textContent,'missing');assert.equal(overRow(h,'ZZ-2').querySelector('.dv-live-ticket-title').textContent,'Epic only story');assert.match(textOf(overRow(h,'ZZ-2').querySelector('.dv-live-ticket-owner')),/Unassigned/);
 assert.equal(overState(h,'AA-1').textContent,'missing');assert.match(textOf(overRow(h,'AA-1').querySelector('.dv-live-ticket-owner')),/Alex/,'owner stays as of today');
 assert.ok(a.classList.contains('dv-live-missing'),'#1012 the carrier is painted, not left uncolored');assert.equal(snap.counts.missing,2);
 assert.deepEqual(plain(snap.blockers),[],'a ticket that did not exist yet is not a blocker');assert.equal(snap.epic.blocked,0);assert.equal(snap.readiness.blockers,0);assert.equal(h.view.querySelectorAll('.dv-live-blocker').length,0);
 const up=plain(snap.tickets.find(item=>item.key==='BB-1').dependsOn[0]);assert.equal(up.key,'AA-1');assert.equal(up.state,'missing');assert.equal(up.tone,'grey');assert.equal(snap.waiting['BB-1'].tone,'grey');
 assert.equal(overCaption(h,1),'TODO · 1 tickets · waiting on AA-1');
 // Back on today the ticket is not missing any more.
 api.overTimeClose();await historySettle();h.flush();assert.ok(!a.classList.contains('dv-live-missing'));assert.equal(api.snapshot().counts.missing,0);
});
test('OT7 moving days logs no Activity, adds no change pulse and shows no stale mark',async()=>{
 const h=harness(overFixture());mountStatus(h);const api=h.ctl.liveStatus,today=overToday();api.apply(today);today['EE-1'].state='todo';api.apply(today);
 const b=h.view.querySelector('[data-dv-node="b"]'),edge=h.view.querySelector('path.edge'),rows=()=>h.view.querySelectorAll('.dv-live-activity-entry').map(el=>el.textContent);
 // Contrasting precondition: a real change pulsed and logged one row, and BB-1 is overdue and active today.
 assert.equal(rows().length,1);assert.ok(edge.classList.contains('dv-live-changed'));edge.dispatchEvent({type:'animationend'});assert.equal(h.view.querySelectorAll('.dv-live-changed').length,0);assert.ok(b.classList.contains('dv-live-stale'));const before=rows();
 await overOpen(h,1);h.flush();
 for(const index of [0,1,2,0]){api.overTimeDay(index);h.flush();assert.deepEqual(rows(),before);assert.equal(h.view.querySelectorAll('.dv-live-changed').length,0,'day '+index);assert.equal(h.view.querySelectorAll('.dv-live-stale').length,0,'day '+index);}
 api.overTimeDay(2);overBackToLive(api);await historySettle();h.flush();assert.ok(b.classList.contains('dv-live-stale'),'the stale mark returns with today');assert.deepEqual(rows(),before);
});
test('OT8 a refresh during a past day waits, then Live shows the newest status once',async()=>{
 const remembered=[],editor={state:()=>({editable:false,blocked:'',active:false,pending:0,saving:false,readOnly:false,notice:null}),onChange:()=>()=>{},rememberMap(map){remembered.push(map);},lastMap:()=>null,question:()=>null};
 const h=harness(overFixture(),{},{boardEditor:editor});mountStatus(h);const api=h.ctl.liveStatus,today=overToday();api.apply(today);assert.equal(remembered.length,1);
 await overOpen(h,1);h.flush();const a=h.view.querySelector('[data-dv-node="a"]'),b=h.view.querySelector('[data-dv-node="b"]'),rows=()=>h.view.querySelectorAll('.dv-live-activity-entry').map(el=>el.textContent);
 assert.ok(a.classList.contains('dv-live-blocked'));assert.equal(remembered.length,1,'a past day is never remembered as live');
 const newer=overToday();newer['BB-1'].state='done';delete newer['BB-1'].updatedAt;newer['BB-1'].title='Newest title';api.apply(newer);h.flush();
 assert.ok(a.classList.contains('dv-live-blocked'),'the refresh leaves the day on screen');assert.ok(!b.classList.contains('dv-live-done'));assert.equal(rows().length,0);assert.equal(overRow(h,'BB-1').querySelector('.dv-live-ticket-title').textContent,'Beta work');assert.equal(api.snapshot().overTime.active,true);
 overBackToLive(api);await historySettle();h.flush();
 assert.equal(api.snapshot().overTime.active,false);assert.ok(a.classList.contains('dv-live-done'));assert.ok(b.classList.contains('dv-live-done'));assert.equal(overRow(h,'BB-1').querySelector('.dv-live-ticket-title').textContent,'Newest title');
 assert.equal(rows().length,1);assert.match(rows()[0],/^BB-1 · active → done/);assert.equal(remembered.at(-1),newer,'the newest live map is what an edit re-render restores');
});
test('OT9 Edit is disabled with a reason on a past day and Over time waits for Edit to finish',async()=>{
 let active=false;const editor={state:()=>({editable:true,blocked:'',active,pending:0,saving:false,readOnly:false,notice:null}),onChange:()=>()=>{},rememberMap(){},lastMap:()=>null,question:()=>null,start(){active=true;}};
 const h=harness(overFixture(),{},{boardEditor:editor});mountStatus(h);const api=h.ctl.liveStatus;api.apply(overToday());const edit=()=>h.view.querySelector('button.dv-live-edit'),reason=()=>h.view.querySelector('.dv-live-edit-reason');
 assert.equal(edit().disabled,false);assert.equal(reason().hidden,true);await overOpen(h,1);
 assert.equal(edit().disabled,true);assert.equal(reason().hidden,false);assert.equal(reason().textContent,'Editing is off while a past day is shown.');
 overBackToLive(api);await historySettle();assert.equal(edit().disabled,false);assert.equal(reason().hidden,true);
 active=true;api.note('repaint');assert.equal(overButton(h).disabled,true);let loads=0;api.setHistory({load(){loads++;return {days:overDays()};}});api.overTime();await historySettle();assert.equal(loads,0,'Edit mode refuses the click as well');
});
test('OT10 only whole days inside the range are accepted',async()=>{
 const h=harness(overFixture());mountStatus(h);const api=h.ctl.liveStatus;api.apply(overToday());await overOpen(h,1);
 api.overTimeDay(99);assert.equal(api.snapshot().overTime.index,2);api.overTimeDay(-4);assert.equal(api.snapshot().overTime.index,0);
 api.overTimeDay(1);for(const bad of [1.5,NaN,'x',undefined])api.overTimeDay(bad);assert.equal(api.snapshot().overTime.index,1);
});
test('OT11 clear on a past day ends the mode and leaves no evidence',async()=>{
 const h=harness(overFixture());mountStatus(h);const api=h.ctl.liveStatus;api.apply(overToday());await overOpen(h,1);h.flush();api.apply(overToday());api.clear();h.flush();
 assert.equal(api.snapshot().overTime.active,false);assert.equal(h.view.querySelector('input.dv-live-over-time-slider'),null);assert.equal(api.state('AA-1'),null);assert.equal(h.view.querySelectorAll('.dv-live-blocked').length,0);
 api.overTime();await historySettle();assert.equal(api.state('AA-1'),null,'a held refresh does not return after clear');
});
test('OT11 destroy while history loads leaves the board alone',async()=>{
 const h=harness(overFixture());const api=overReady(h.ctl.liveStatus);api.apply(overToday());let resolve;let loads=0;api.setHistory({load:()=>{loads++;return new Promise(done=>{resolve=done;});}});api.overTime();api.overTime();assert.equal(api.snapshot().overTime.loading,true);await historySettle();assert.equal(loads,1,'a second click while loading starts nothing');api.destroy();resolve({days:overDays()});await historySettle();assert.equal(api.snapshot().overTime.active,false);
});
test('OT12 demo days separate tickets not created yet from tickets that later disappear',()=>{
 const C=storyContext();assert.equal(typeof C.liveStatusDemoDays,'function');
 const timeline={epics:{'EP-1':{summary:'Epic'}},days:[{label:'Day 1 — start',issues:{'AA-1':{state:'todo',epic:'EP-1',statusName:'To Do'}}},{label:'second',issues:{'AA-1':{state:'done',epic:'EP-1'},'BB-1':{state:'active',epic:'EP-1'}}},{label:'Day 3 — gone',issues:{'BB-1':{state:'done',epic:'EP-1'}}}]};
 const days=plain(C.liveStatusDemoDays(timeline,['AA-1','BB-1','CC-1']));assert.equal(days.length,3);
 assert.deepEqual(days.map(day=>day.label),['Day 1 — start','Day 2 — second','Day 3 — gone']);assert.deepEqual(days.map(day=>day.short),['Day 1','Day 2','Day 3']);
 assert.equal(days[0].states['BB-1'],undefined,'not created yet');assert.equal(days[0].states['AA-1'].state,'todo');assert.equal(days[0].states['AA-1'].detail,'To Do');
 assert.equal(days[0].states['EP-1'].state,'todo');assert.equal(days[1].states['EP-1'].state,'active');
 assert.equal(days[2].states['AA-1'].state,'missing','absent after it existed: the story says it became unavailable');assert.equal(days[1].states['CC-1'],undefined,'never named before the last day');
 assert.equal(days[2].states['CC-1'].state,'missing','the last day matches the live demo');
});
test('OT13 apply still drops a provider entry without a valid state',()=>{
 const h=harness(overFixture()),api=h.ctl.liveStatus;api.apply({'AA-1':{title:'No state'},'BB-1':{state:'nope'},'EE-1':{state:'todo'}});assert.equal(api.state('AA-1'),null);assert.equal(api.state('BB-1'),null);assert.equal(api.state('EE-1').state,'todo');
});

/* Over time through the connector (#929 and #1009). Source: issue #1009, whose reply shapes were checked on a live
   Atlassian connector, plus #929 items 2, 5, 7, 9, 10, 12 and 13. `historyProvider` keeps the runtime's cache rules: an
   entry is served only inside staleTime, carries cache.storedAt only when served, and refresh skips the read.
| row | fixture | assertion (scoped) | rejects |
|---|---|---|---|
| C1 | connector with or without getJiraIssue | Over time shows only with it; the two tools real connectors lack earn no button | a button that fails on click |
| C2 | load, watch refreshes, then clicks | no call before the click; the click makes one getJiraIssue per ticket with fields and expand, through callTool with a 7-day cache; no search, no new watch | periodic hydration; calling a tool the connector lacks |
| C3 | second click, then one ticket's updated time moves | second click reaches Jira zero times; third reaches Jira once, for that ticket, with refresh | refetching the whole board; never noticing a change |
| C4 | a changelog naming a status no tracked ticket holds | one lookup per unknown id, none for known ids, and the day uses the looked-up category | one lookup per ticket; treating an unknown status as To Do when Jira can say |
| C5 | histories shorter than total, then complete | board stays on today, panel says history could not load, Over time can be clicked again and then works | showing a partial history |
| C6 | a failed ticket call, a failed lookup, no created time, no changelog | same outcome as C5 | wrong days from incomplete data |
| C7 | ticket missing today | no history call for it, Missing on past days, other tickets load | one missing ticket stopping the batch |
| C8 | flagged today with no Flagged history | blocked on past days | losing today's flag |
| C9 | batch waiting on Jira | panel shows loaded count of total; at most six ticket calls at once | an unbounded batch of calls |
| C10 | adapter retires on a past day | mode ends and the source is gone | a past day surviving an account change |
| C11 | the real adapter load over the real mock handler, final story day | every ticket on every day equals the story timeline, with one getJiraIssue per ticket and at most one lookup per unknown status | an adapter and a mock that disagree on shape |
| C12 | many unknown ids, a retired id, and a non-numeric id | at most six lookups at once; a retired status follows the live board's unknown rule; a non-numeric id is never put in JQL | an unbounded lookup batch; a retired status stopping the board; unsafe JQL |
| C13 | a plain top-level REST issue | loads the same as the connector shape | one reply shape only |
*/
const OVER_WEEK=604800000,OVER_STORED=Date.parse('2026-10-25T00:00:00Z');
const OVER_STATUS={'1':['To Do','new'],'2':['In Progress','indeterminate'],'3':['Done','done'],'4':['Review','indeterminate']};
const overStatus=id=>({id,name:OVER_STATUS[id][0],statusCategory:{key:OVER_STATUS[id][1]}});
const overRaw=(keys=['AA-1','BB-1','ZZ-1'])=>({page:{tracking:{jira:{site:'https://jira.test'}},sections:[{id:'main',diagram:{nodes:Object.fromEntries(keys.map((key,i)=>['n'+i,{title:key,tickets:[key]}])),rows:[keys.map((_,i)=>'n'+i)],panels:[{id:'status',type:'live-status',title:'Status'}]}}]}});
const overChange=(created,from,to)=>({created,items:[{field:'status',from,fromString:(OVER_STATUS[from] || ['Status '+from])[0],to,toString:(OVER_STATUS[to] || ['Status '+to])[0]},{field:'description',fromString:'a long description',toString:'a longer description'}]});
function historyProvider({tools=['getJiraIssue'],keys=['AA-1','BB-1','ZZ-1'],gate=null}={}){
 const h=providerHarness(overRaw(keys));tools.forEach(name=>h.servers[0].tools.push({name}));
 const stored=new Map(),upstream=[];Object.assign(h,{upstream,histories:{},current:{},totals:{},fail:()=>false,shape:issue=>({issues:{nodes:[issue]}})});
 const issue=key=>{const histories=h.histories[key] || [];return {key,fields:{created:'2026-10-20T12:00:00.000Z',status:overStatus(h.current[key] || '2')},changelog:{startAt:0,maxResults:100,total:h.totals[key] ?? histories.length,histories}};};
 const execute=(tool,input)=>{
  if(tool==='searchJiraIssuesUsingJql'){const id=/^status = (\S+) ORDER BY updated DESC$/.exec(input.jql)[1];return {issues:{nodes:OVER_STATUS[id]?[{key:'XX-1',fields:{status:overStatus(id)}}]:[]}};}
  return h.shape(issue(input.issueIdOrKey));
 };
 h.mcp.callTool=async(server,tool,input,opts)=>{
  h.calls.push(plain([server,tool,input,opts]));
  if(tool==='getAccessibleAtlassianResources')return {payload:[{id:'cloud',url:'https://jira.test'}]};
  const id=JSON.stringify([tool,input]),cache=opts && opts.cache,hit=stored.get(id);
  if(cache && !cache.refresh && hit && cache.staleTime>0)return {payload:hit.payload,cache:{storedAt:hit.at,revalidating:false}};
  upstream.push({tool,input:plain(input),refresh:!!(cache && cache.refresh)});
  if(gate)await gate(tool,input);
  if(h.fail(tool,input))throw {code:'upstream_error',message:'Jira failed'};
  const payload=execute(tool,input);if(cache && cache.gcTime>0)stored.set(id,{payload,at:OVER_STORED});return {payload};
 };
 return h;
}
async function overLive(h,issues,flagged=[]){await h.start();await historySettle();h.data(0,issues);h.data(1,flagged);await historySettle();}
async function overClick(h){overButton(h).dispatchEvent({type:'click'});for(let i=0;i<8;i++)await historySettle();}
const overLiveIssues=()=>[jira('AA-1'),jira('BB-1')];
const overStatesAt=(h,index)=>{const api=h.ctl.liveStatus;api.overTimeDay(index);return api.snapshot().states;};
const overTicketInput=key=>({cloudId:'cloud',issueIdOrKey:key,fields:['status','created'],expand:'changelog'});
test('C1 Over time needs getJiraIssue, not the tools real connectors lack',async()=>{
 for(const tools of [[],['listJiraStatuses'],['listJiraIssueChangelogs'],['listJiraIssueChangelogs','listJiraStatuses']]){const h=historyProvider({tools});await overLive(h,overLiveIssues());assert.equal(h.ctl.liveStatus.snapshot().overTime,null,tools.join());assert.ok(!overButton(h) || overButton(h).hidden);}
 const h=historyProvider();await overLive(h,overLiveIssues());assert.ok(h.ctl.liveStatus.snapshot().overTime,'#1009 getJiraIssue is enough');assert.equal(overButton(h).hidden,false);assert.equal(h.ctl.liveStatus.snapshot().overTime?.active,false);
});
test('C2 the click is the only thing that calls history: one getJiraIssue per ticket through callTool',async()=>{
 const h=historyProvider();await overLive(h,overLiveIssues());const watches=h.watches.length;
 h.data(0,overLiveIssues());h.data(1,[]);await historySettle();assert.deepEqual(h.upstream,[],'no history call at load or on a watch refresh');
 await overClick(h);
 assert.deepEqual(h.upstream.map(call=>call.tool),['getJiraIssue','getJiraIssue']);assert.equal(h.watches.length,watches,'no watch added');
 assert.deepEqual(h.upstream.map(call=>call.input).sort((a,b)=>a.issueIdOrKey<b.issueIdOrKey?-1:1),[overTicketInput('AA-1'),overTicketInput('BB-1')]);
 for(const [,tool,,opts] of h.calls.filter(call=>call[1]!=='getAccessibleAtlassianResources'))assert.deepEqual(opts.cache,{staleTime:OVER_WEEK,gcTime:OVER_WEEK},tool);
 assert.equal(h.ctl.liveStatus.snapshot().overTime?.active,true);assert.equal(overButton(h).getAttribute('aria-pressed'),'true');
});
test('C3 repeat clicks reuse the cache and refetch only a ticket whose updated time moved',async()=>{
 const h=historyProvider();await overLive(h,overLiveIssues());await overClick(h);overLiveButton(h).dispatchEvent({type:'click'});await historySettle();
 h.upstream.length=0;await overClick(h);assert.deepEqual(h.upstream,[],'nothing changed, nothing reaches Jira');assert.equal(h.ctl.liveStatus.snapshot().overTime?.active,true);overLiveButton(h).dispatchEvent({type:'click'});await historySettle();
 const later=jira('AA-1');later.fields.updated='2026-10-26T00:00:00Z';h.data(0,[later,jira('BB-1')]);h.data(1,[]);await historySettle();
 await overClick(h);assert.deepEqual(h.upstream,[{tool:'getJiraIssue',input:overTicketInput('AA-1'),refresh:true}]);
});
test('C4 a status no tracked ticket holds gets one lookup per id, and the day uses its category',async()=>{
 const h=historyProvider();await overLive(h,overLiveIssues());Object.assign(h.current,{'AA-1':'3','BB-1':'2'});
 // Review (id 4) is held by no tracked ticket; only a lookup can say it is in progress. Done and In Progress are known.
 h.histories['AA-1']=[overChange('2026-10-23T12:00:00.000Z','4','3')];h.histories['BB-1']=[overChange('2026-10-24T12:00:00.000Z','4','2')];
 await overClick(h);assert.equal(h.ctl.liveStatus.snapshot().overTime?.active,true);
 assert.deepEqual(h.upstream.filter(call=>call.tool==='searchJiraIssuesUsingJql').map(call=>call.input),[{cloudId:'cloud',jql:'status = 4 ORDER BY updated DESC',fields:['status'],maxResults:1}]);
 assert.equal(overStatesAt(h,2)['AA-1'].state,'active','Oct 22: Review is in progress, by its looked-up category');assert.equal(overStatesAt(h,3)['AA-1'].state,'done','Oct 23');
 const search=h.calls.filter(call=>call[1]==='searchJiraIssuesUsingJql');assert.deepEqual(search[0][3].cache,{staleTime:OVER_WEEK,gcTime:OVER_WEEK},'lookups use the same cache');
});
test('C5 an incomplete changelog leaves the board on today until a retry works',async()=>{
 const h=historyProvider();await overLive(h,overLiveIssues());const api=h.ctl.liveStatus;h.current['AA-1']='3';h.histories['AA-1']=[overChange('2026-10-23T12:00:00.000Z','2','3')];h.totals['AA-1']=5;
 await overClick(h);
 assert.equal(api.snapshot().overTime?.active,false);assert.equal(h.view.querySelector('input.dv-live-over-time-slider'),null);assert.equal(api.state('AA-1').state,'active','today stays on the board');
 assert.equal(h.view.querySelector('.dv-live-over-time-status')?.textContent,'History could not load. Try Over time again.');assert.equal(overButton(h).textContent,'Over time');assert.equal(overButton(h).disabled,false);
 delete h.totals['AA-1'];h.calls.length=0;await overClick(h);
 assert.equal(api.snapshot().overTime?.active,true,'a retry reads Jira again, because the incomplete reply must not be served from the cache');assert.equal(h.view.querySelector('.dv-live-over-time-status').hidden,true);assert.equal(overStatesAt(h,3)['AA-1'].state,'done','Oct 23');
});
test('C6 incomplete history never shows',async()=>{
 const unknown=h=>{h.histories['AA-1']=[overChange('2026-10-23T12:00:00.000Z','4','2')];};
 const cases=[['a ticket call fails',h=>{h.fail=tool=>tool==='getJiraIssue';}],['a status lookup fails',h=>{unknown(h);h.fail=tool=>tool==='searchJiraIssuesUsingJql';}],['a ticket has no created time',h=>{h.shape=issue=>({issues:{nodes:[{...issue,fields:{status:issue.fields.status}}]}});}],['a ticket has no changelog',h=>{h.shape=issue=>({issues:{nodes:[{key:issue.key,fields:issue.fields}]}});}],['a reply has no issue',h=>{h.shape=()=>({issues:{nodes:[]}});}]];
 for(const [name,arrange] of cases){const h=historyProvider();await overLive(h,overLiveIssues());arrange(h);await overClick(h);assert.equal(h.ctl.liveStatus.snapshot().overTime?.active,false,name);assert.match(h.view.querySelector('.dv-live-over-time-status')?.textContent || '',/could not load/,name);assert.equal(h.ctl.liveStatus.state('AA-1').state,'active',name);}
});
test('C7 a ticket missing today gets no history call and stays Missing on past days',async()=>{
 const h=historyProvider();await overLive(h,overLiveIssues());assert.equal(h.ctl.liveStatus.state('ZZ-1').state,'missing');await overClick(h);assert.ok(h.upstream.length>0,'the click reached Jira');
 assert.ok(!h.upstream.some(call=>call.input.issueIdOrKey==='ZZ-1'));
 const first=overStatesAt(h,0);assert.equal(first['ZZ-1'].state,'missing','#1012 still missing on past days');assert.equal(first['ZZ-1'].title,undefined);assert.equal(first['AA-1'].state,'active');
});
test('C8 a ticket flagged today with no Flagged history is blocked on past days',async()=>{
 const h=historyProvider();await overLive(h,overLiveIssues(),[jira('AA-1')]);assert.equal(h.ctl.liveStatus.state('AA-1').state,'blocked');await overClick(h);assert.equal(h.ctl.liveStatus.snapshot().overTime?.active,true,'history opened');assert.equal(overStatesAt(h,0)['AA-1'].state,'blocked');assert.equal(overStatesAt(h,0)['BB-1'].state,'active');
});
test('C9 the panel shows loaded count of total and at most six ticket calls run at once',async()=>{
 const keys=Array.from({length:9},(_,i)=>'AA-'+(i+1)),waiting=[];let running=0,peak=0;
 const h=historyProvider({keys,gate:async tool=>{if(tool!=='getJiraIssue')return;running++;peak=Math.max(peak,running);await new Promise(done=>waiting.push(done));running--;}});
 await overLive(h,keys.map(key=>jira(key)));overButton(h).dispatchEvent({type:'click'});for(let i=0;i<8;i++)await historySettle();
 assert.equal(overButton(h).textContent,'Loading history 0 of 9…');assert.equal(overButton(h).getAttribute('aria-disabled'),'true','#1253 inert while loading, but it keeps keyboard focus');assert.equal(waiting.length,6);
 for(let done=1;done<=9;done++){waiting.shift()();for(let i=0;i<8;i++)await historySettle();if(done<9)assert.equal(overButton(h).textContent,'Loading history '+done+' of 9…');}
 assert.equal(peak,6);assert.equal(overButton(h).textContent,'Over time');assert.equal(overButton(h).getAttribute('aria-pressed'),'true');
});
test('C10 an adapter that retires on a past day ends the mode and removes the source',async()=>{
 const h=historyProvider();await overLive(h,overLiveIssues());await overClick(h);const api=h.ctl.liveStatus;assert.equal(api.snapshot().overTime?.active,true);
 h.watches[0].handler({type:'error',error:{code:'user_changed'}});await historySettle();assert.equal(api.snapshot().overTime,null);assert.equal(h.view.querySelector('input.dv-live-over-time-slider'),null);assert.ok(!overButton(h) || overButton(h).hidden);
});
test('C11 the adapter load over the real mock handler rebuilds the story timeline day by day',async()=>{
 const C=providerContext(),{handleMcp}=await import('../deploy/cloudflare/mock-atlassian-mcp/mcp.mjs'),story=JSON.parse(fs.readFileSync('examples/live-status/live-status.timeline.json','utf8'));
 assert.equal(typeof C.liveStatusHistoryLoad,'function','#929 connector load exists');
 const last=story.days.length-1,env={scenario:'story',day:last,now:Date.parse('2026-11-03T12:00:00Z')},calls=[];
 const mcp={callTool:async(server,tool,input)=>{calls.push(tool);const response=handleMcp({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:tool,arguments:input}},env);assert.equal(response.error,undefined,tool);return {payload:response.result.structuredContent};}};
 const keys=Object.keys(story.days[last].issues),found=(await mcp.callTool('Mock','searchJiraIssuesUsingJql',{cloudId:'mock-cloud-id-0001',jql:'key in ('+keys.join(', ')+')',maxResults:50})).payload.issues.nodes;
 assert.equal(found.length,keys.length);
 const today=plain(C.liveStatusJiraMap(keys,[found],new Set(),'https://acme.atlassian.net',null)),issues=Object.fromEntries(found.map(issue=>[issue.key,issue]));calls.length=0;
 const result=plain(await C.liveStatusHistoryLoad({mcp,server:'Mock',cloudId:'mock-cloud-id-0001',today,issues,flagged:{}},()=>{}));
 assert.equal(calls.filter(tool=>tool==='getJiraIssue').length,keys.length,'one call per ticket');assert.ok(calls.filter(tool=>tool==='searchJiraIssuesUsingJql').length<=3,'at most one lookup per status no ticket holds');assert.ok(!calls.includes('listJiraStatuses'));
 const lastDone=story.days.findIndex(day=>keys.every(key=>day.issues[key] && day.issues[key].state==='done'));assert.equal(result.days.length,lastDone+1,'the range ends on the last Done day');
 result.days.forEach((day,index)=>{for(const key of keys){
  let source=null;for(let i=index;i>=0 && !source;i--)source=story.days[i].issues[key] || null;
  // A ticket absent from the story on a later day carries its previous status: history has no "unavailable" day.
  assert.equal(day.states[key]?.state ?? null,source?source.state:null,key+' on day '+(index+1));
 }});
 assert.equal(result.days[0].states['UX-90'],undefined,'UX-90 does not exist on day 1');assert.equal(result.days[3].states['HW-124'].state,'blocked','Flagged and Blocked');
});
test('C12 lookups run six at a time, a retired status follows the unknown rule and only numeric ids reach JQL',async()=>{
 const waiting=[];let running=0,peak=0;
 const h=historyProvider({gate:async tool=>{if(tool!=='searchJiraIssuesUsingJql')return;running++;peak=Math.max(peak,running);await new Promise(done=>waiting.push(done));running--;}});
 await overLive(h,overLiveIssues());h.histories['AA-1']=['101','102','103','104','105','106','107','108'].map((id,index)=>overChange('2026-10-2'+(index+1)+'T12:00:00.000Z',id,index<7?String(102+index):'2'));
 overButton(h).dispatchEvent({type:'click'});for(let i=0;i<8;i++)await historySettle();assert.equal(waiting.length,6,'six lookups are open');
 for(let released=0;released<8;released++){if(waiting.length)waiting.shift()();for(let i=0;i<8;i++)await historySettle();}
 assert.equal(peak,6);assert.equal(h.upstream.filter(call=>call.tool==='searchJiraIssuesUsingJql').length,8,'one lookup per id');assert.equal(h.ctl.liveStatus.snapshot().overTime?.active,true,'retired statuses do not stop the board');
 assert.equal(overStatesAt(h,1)['AA-1'].state,'todo','a status Jira cannot describe follows the live board: To Do');
 const named=historyProvider();await overLive(named,overLiveIssues());named.histories['AA-1']=[{created:'2026-10-23T12:00:00.000Z',items:[{field:'status',from:'x" OR 1=1',fromString:'Blocked by vendor',to:'2',toString:'In Progress'}]}];await overClick(named);
 assert.deepEqual(named.upstream.filter(call=>call.tool==='searchJiraIssuesUsingJql'),[],'a non-numeric id is never put in JQL');assert.equal(overStatesAt(named,2)['AA-1'].state,'blocked','the name rule still applies');
});
test('C13 a plain top-level REST issue loads like the connector shape',async()=>{
 const h=historyProvider();await overLive(h,overLiveIssues());h.shape=issue=>issue;h.current['AA-1']='3';h.histories['AA-1']=[overChange('2026-10-23T12:00:00.000Z','2','3')];await overClick(h);
 assert.equal(h.ctl.liveStatus.snapshot().overTime?.active,true);assert.equal(overStatesAt(h,2)['AA-1'].state,'active');assert.equal(overStatesAt(h,3)['AA-1'].state,'done');
});
test('OT14 Live and Over time are two mode buttons: Live returns to today and the selected Over time stays',async()=>{
 const h=harness(overFixture());mountStatus(h);const api=overReady(h.ctl.liveStatus);api.apply(overToday());let loads=0;api.setHistory({load(){loads++;return {days:overDays()};}});
 const pressed=()=>[overLiveButton(h).getAttribute('aria-pressed'),overButton(h).getAttribute('aria-pressed')];
 assert.ok(h.view.querySelector('.dv-live-time'),'#1131 a row of their own');assert.deepEqual(h.view.querySelector('.dv-live-time').children.map(el=>el.className.split(' ').find(name=>/^dv-live-(toggle|over-time)$/.test(name))),['dv-live-toggle','dv-live-over-time']);assert.deepEqual(pressed(),['true','false']);
 overButton(h).dispatchEvent({type:'click'});await historySettle();assert.deepEqual(pressed(),['false','true']);assert.equal(overButton(h).textContent,'Over time');assert.equal(api.enabled(),true);
 assert.ok(!textOf(h.view).includes('Back to today'),'no separate return button');
 overButton(h).dispatchEvent({type:'click'});await historySettle();assert.equal(api.snapshot().overTime.active,true,'the selected mode stays');assert.equal(loads,1);
 overLiveButton(h).dispatchEvent({type:'click'});await historySettle();assert.equal(api.snapshot().overTime.active,false);assert.equal(api.enabled(),true,'returning to Live keeps colors on');assert.deepEqual(pressed(),['true','false']);
 overLiveButton(h).dispatchEvent({type:'click'});assert.equal(api.enabled(),false,'the selected Live still turns colors off');assert.deepEqual(pressed(),['false','false']);
 overButton(h).dispatchEvent({type:'click'});await historySettle();assert.equal(api.snapshot().overTime.active,true);assert.equal(api.enabled(),true,'Over time shows colors');assert.deepEqual(pressed(),['false','true']);
});
test('OT15 changing text has its own row, and a board steps days with < and > only on the slider row',async()=>{
 const h=harness(overFixture());mountStatus(h);const api=overReady(h.ctl.liveStatus);api.apply(overToday());api.note('A long note about the connector','warn');api.setHistory({load:()=>({days:overDays()})});
 const controls=h.view.querySelector('.dv-live-controls'),status=h.view.querySelector('.dv-live-status');assert.ok(controls,'#986 a row of counts and buttons');assert.ok(status,'#986 a row of changing text');
 // #1162: the counts strip (fixed height) shares the first row with the buttons; status text, which wraps, has the row below.
 assert.equal(controls.querySelectorAll('.dv-live-connection,.dv-live-note').length,0,'no status text beside the buttons');assert.ok(controls.querySelector('.dv-live-counts [data-live-count="active"]'));assert.ok(status.querySelector('.dv-live-note'));assert.match(status.getAttribute('title'),/A long note about the connector/);
 assert.ok(controls.children.at(-1).classList.contains('dv-live-first'),'First blocker is last, so a button appearing beside it cannot move it');
 assert.equal(h.view.querySelectorAll('.dv-live-step').length,0,'no step buttons on Live');
 overButton(h).dispatchEvent({type:'click'});await historySettle();
 const steps=h.view.querySelectorAll('.dv-live-over-time-row .dv-live-step');assert.deepEqual(steps.map(el=>[el.textContent,el.getAttribute('aria-label')]),[['<','Previous day'],['>','Next day']]);assert.equal(h.view.querySelector('.dv-live-demo'),null);
 const [prev,next]=steps;assert.equal(api.snapshot().overTime.index,2);assert.equal(next.disabled,true);assert.equal(prev.disabled,false);
 prev.dispatchEvent({type:'click'});assert.equal(api.snapshot().overTime.index,1);prev.dispatchEvent({type:'click'});assert.equal(api.snapshot().overTime.index,0);assert.equal(prev.disabled,true);assert.equal(next.disabled,false);
 next.dispatchEvent({type:'click'});assert.equal(api.snapshot().overTime.index,1);
});
// #1162: the counts and First blocker share the first row (First blocker last, in its fixed slot); the status row below
// holds only text, which wraps. Rejects First blocker alone on a row above the counts.
test('#1162 the counts and First blocker share the first row; the status row holds only text',()=>{
 const h=harness(overFixture());mountStatus(h);const api=h.ctl.liveStatus;api.apply(overToday());api.note('A long note about the connector','warn');
 const controls=h.view.querySelector('.dv-live-controls'),status=h.view.querySelector('.dv-live-status');
 assert.ok(controls.querySelector('.dv-live-counts[role="region"]'),'the counts are on the first row');
 assert.ok(controls.children.at(-1).classList.contains('dv-live-first'),'First blocker ends that row, so a button appearing to its left cannot move it');
 assert.equal(status.querySelector('.dv-live-counts'),null,'the status row holds text only');assert.ok(status.querySelector('.dv-live-note'));assert.match(status.getAttribute('title'),/A long note about the connector/);
 api.destroy();
 // Before the first answer an action (Allow Jira) shows alone: no empty, focusable counts region beside it.
 const w=harness(overFixture());mountStatus(w);w.ctl.liveStatus.action('Allow Jira',()=>{});
 // The counts strip stays as an unnamed spacer and First blocker's slot is reserved, unseen and inert, so the action keeps its place when data arrives.
 const row=w.view.querySelector('.dv-live-controls'),strip=row.querySelector('.dv-live-counts'),slot=row.querySelector('.dv-live-first');assert.equal(row.hidden,false);assert.equal(row.querySelector('.dv-live-action').hidden,false);
 assert.equal(strip.hidden,false);assert.equal(strip.getAttribute('role'),null,'an unnamed spacer, not a focusable region');assert.equal(strip.getAttribute('tabindex'),null);
 assert.equal(slot.hidden,false,'the slot is kept, not removed');assert.equal(slot.getAttribute('data-reserved'),'true');assert.equal(slot.getAttribute('aria-hidden'),'true');assert.equal(slot.getAttribute('tabindex'),'-1');assert.equal(slot.disabled,true);
 w.ctl.liveStatus.apply(overToday());assert.equal(strip.getAttribute('role'),'region');assert.equal(slot.getAttribute('data-reserved'),null);assert.equal(slot.getAttribute('aria-hidden'),null);
 w.ctl.liveStatus.destroy();
});
// #1082: a day's key is its calendar date in the viewer's time zone, as liveStatusHistoryDays writes it.
const overDayKey=offset=>{const now=new Date();return new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()+offset)).toISOString().slice(0,10);};
test('OT17 the selected day is shown large, today reads TODAY, and changing the day updates it (#1082)',async()=>{
 const h=harness(overFixture());mountStatus(h);const api=overReady(h.ctl.liveStatus);api.apply(overToday());
 api.setHistory({load:()=>({days:overDays().map((day,index)=>({...day,key:overDayKey(index-2)}))})});overButton(h).dispatchEvent({type:'click'});await historySettle();
 const heading=()=>h.view.querySelector('.dv-live-over-time-row .dv-live-over-time-heading'),big=()=>heading().querySelector('.dv-live-over-time-day'),beside=()=>heading().querySelector('.dv-live-over-time-date');
 assert.ok(heading(),'a date heading on the Over time row');
 assert.equal(api.snapshot().overTime.today,true,'the last day is today');assert.equal(big().textContent,'TODAY');assert.equal(beside().textContent,'Oct 22');assert.equal(beside().hidden,false);
 const slider=h.view.querySelector('input.dv-live-over-time-slider');slider.value='0';slider.dispatchEvent({type:'input'});
 assert.equal(api.snapshot().overTime.today,false);assert.equal(big().textContent,'Oct 20','a past day shows its date');assert.ok(beside().hidden,'no second date on a past day');
 const [prev,next]=h.view.querySelectorAll('.dv-live-over-time-row .dv-live-step');
 next.dispatchEvent({type:'click'});assert.equal(big().textContent,'Oct 21','> updates it');
 next.dispatchEvent({type:'click'});assert.equal(big().textContent,'TODAY');
 prev.dispatchEvent({type:'click'});assert.equal(big().textContent,'Oct 21','< updates it');
 overBackToLive(api);await historySettle();assert.equal(h.view.querySelector('.dv-live-over-time-heading'),null,'Live has no date heading');
 // A history whose last day is not today's date (every ticket done earlier), or whose days carry no date, never reads TODAY.
 for(const days of [overDays().map((day,index)=>({...day,key:overDayKey(index-5)})),overDays()]){
  api.setHistory({load:()=>({days})});api.overTime();await historySettle();
  assert.equal(api.snapshot().overTime.index,2);assert.equal(api.snapshot().overTime.today,false);assert.equal(big().textContent,'Oct 22');assert.ok(beside().hidden);
  overBackToLive(api);await historySettle();
 }
 // The product's own day builder, run now: its last day reads TODAY.
 const built=historyDays(providerContext(),[historyTicket('AA-1',Date.now()-2*86400000,'In Progress')],{'AA-1':{state:'active'}},Date.now());
 api.setHistory({load:()=>built});api.overTime();await historySettle();
 assert.equal(api.snapshot().overTime.index,built.days.length-1);assert.equal(api.snapshot().overTime.today,true);assert.equal(big().textContent,'TODAY');assert.equal(beside().textContent,built.days.at(-1).label);
});
test('OT18 the selected Over time day gives its local-day search window, with Metrics off (#1132)',async()=>{
 const zone=process.env.TZ;process.env.TZ='America/New_York';
 try{
  const h=harness(overFixture()),api=overReady(h.ctl.liveStatus);api.apply(overToday());
  const over=()=>api.snapshot().overTime,open=async days=>{api.setHistory({load:()=>days});api.overTime();await historySettle();assert.equal(over().active,true);};
  const build=(created,now)=>historyDays(providerContext(),[historyTicket('AA-1',created,'In Progress')],{'AA-1':{state:'active'}},now);
  assert.equal(api.snapshot().metrics.enabled,false,'Metrics is off');
  api.setHistory({load:()=>({days:overDays()})});assert.ok('window' in over(),'#1132: overTime carries the day window');assert.equal(over().window,null,'Live has no day window');
  // Mar 7 2025 is a normal day; Mar 9 springs forward (23 h); Nov 2 falls back (25 h).
  await open(build(historyAt(2025,3,7),historyAt(2025,3,9)));
  assert.deepEqual(plain(over().window),{from:'2025-03-09T05:00:00.000Z',to:'2025-03-10T04:00:00.000Z',label:'Mar 9 00:00–24:00 local'},'23 h day');
  api.overTimeDay(0);assert.deepEqual(plain(over().window),{from:'2025-03-07T05:00:00.000Z',to:'2025-03-08T05:00:00.000Z',label:'Mar 7 00:00–24:00 local'},'normal day');
  overBackToLive(api);await historySettle();assert.equal(over().window,null,'Live again');
  await open(build(historyAt(2025,11,2),historyAt(2025,11,3)));api.overTimeDay(0);
  assert.deepEqual(plain(over().window),{from:'2025-11-02T04:00:00.000Z',to:'2025-11-03T05:00:00.000Z',label:'Nov 2 00:00–24:00 local'},'25 h day');
  overBackToLive(api);await historySettle();
  // A demo day's key is its UTC date and its at is the next UTC midnight; the window is still the whole local day.
  await open({days:plain(storyContext().liveStatusDemoDays({days:[{label:'kickoff',telemetry:{start:'2025-03-07T00:00:00Z'},issues:{'AA-1':{state:'active'}}},{label:'next',telemetry:{start:'2025-03-08T00:00:00Z'},issues:{'AA-1':{state:'done'}}}]},['AA-1']))});api.overTimeDay(0);
  assert.deepEqual(plain(over().window),{from:'2025-03-07T05:00:00.000Z',to:'2025-03-08T05:00:00.000Z',label:'Day 1 — kickoff 00:00–24:00 local'},'demo day');
  overBackToLive(api);await historySettle();
  // Today ends at the moment of the snapshot, not at the coming midnight.
  const today=build(Date.now()-86400000,Date.now());await open(today);
  const before=Date.now(),range=over().window,after=Date.now(),midnight=new Date();midnight.setHours(0,0,0,0);
  const end=new Date(range.to),pad=n=>String(n).padStart(2,'0');
  assert.equal(over().today,true);assert.equal(range.from,midnight.toISOString());
  assert.ok(end.getTime()>=before && end.getTime()<=after,'today is clamped to now');
  assert.equal(range.label,today.days.at(-1).label+' 00:00–'+pad(end.getHours())+':'+pad(end.getMinutes())+' local');
  overBackToLive(api);await historySettle();
  // A day without a date key has no window, even when it carries an end time.
  for(const days of [overDays(),overDays().map(day=>({...day,at:'2025-03-08T05:00:00.000Z'}))]){
   await open({days});assert.equal(over().window,null);api.overTimeDay(0);assert.equal(over().window,null);
   overBackToLive(api);await historySettle();
  }
 }finally{if(zone===undefined)delete process.env.TZ;else process.env.TZ=zone;}
});
// #1138 (D2): a board with no Jira references gets Over time from the last 7 local days, built with no calls.
const freeFixture=()=>({page:{tracking:{telemetry:{window:'24h'}},sections:[{id:'main',diagram:{nodes:{a:{title:'Alpha',telemetry:TQUEUE()},b:{title:'Beta'}},rows:[['a','b']],edges:[{from:'a',to:'b',telemetry:TCALL()}],panels:[{id:'status',type:'live-status',title:'Status'}]}}]}});
const localMidnight=back=>{const now=new Date();return new Date(now.getFullYear(),now.getMonth(),now.getDate()-back).toISOString();};
test('OT20 the local day list is the last 7 local days ending today, keyed, each ending at the next local midnight (#1138)',()=>{
 const zone=process.env.TZ;process.env.TZ='America/New_York';
 try{
  const C={URL};vm.runInNewContext(entrypoint('native').source,C);assert.equal(typeof C.liveStatusLocalDays,'function','#1138: a local day list builder');
  const spring=plain(C.liveStatusLocalDays(new Date(2025,2,10,12).getTime(),'en-US'));assert.equal(spring.index,6);
  assert.deepEqual(spring.days.map(d=>[d.key,d.at,d.label,d.short]),[['2025-03-04','2025-03-05T05:00:00.000Z','Mar 4','Mar 4'],['2025-03-05','2025-03-06T05:00:00.000Z','Mar 5','Mar 5'],['2025-03-06','2025-03-07T05:00:00.000Z','Mar 6','Mar 6'],
   ['2025-03-07','2025-03-08T05:00:00.000Z','Mar 7','Mar 7'],['2025-03-08','2025-03-09T05:00:00.000Z','Mar 8','Mar 8'],['2025-03-09','2025-03-10T04:00:00.000Z','Mar 9','Mar 9'],['2025-03-10','2025-03-11T04:00:00.000Z','Mar 10','Mar 10']],'Mar 9 is 23 h');
  assert.ok(spring.days.every(d=>Object.keys(d.states).length===0),'no ticket states');
  const turn=plain(C.liveStatusLocalDays(new Date(2026,0,2,9).getTime(),'en-US'));
  assert.deepEqual(turn.days.map(d=>d.key),['2025-12-27','2025-12-28','2025-12-29','2025-12-30','2025-12-31','2026-01-01','2026-01-02']);assert.equal(turn.days[0].label,'Dec 27, 2025','a list over a new year carries the year');assert.equal(turn.days[6].label,'Jan 2, 2026');
 }finally{if(zone===undefined)delete process.env.TZ;else process.env.TZ=zone;}
});
test('OT20 a Jira-free board offers Over time on the local days, with no calls until Metrics is on, then one window per new day (#1138)',async()=>{
 let live=0;const windows=[];
 const h=harness(freeFixture(),{},{telemetry:{historyMode:'window',provider:async()=>{live++;return {};},history:async(bindings,range)=>{windows.push(plain(range.window));return {};}}});
 const api=h.ctl.liveStatus,over=()=>api.snapshot().overTime;mountStatus(h);
 assert.equal(api.snapshot().available,false,'the board has no Jira references');
 assert.ok(over(),'#1138: a Jira-free board offers Over time');assert.equal(overButton(h).hidden,false,'the Over time button shows');
 overButton(h).dispatchEvent({type:'click'});await historySettle();
 assert.equal(over().active,true);assert.equal(over().count,7);assert.equal(over().index,6,'it opens on today');assert.equal(over().today,true);assert.ok(h.view.querySelector('input.dv-live-over-time-slider'),'the day row shows');
 for(let index=0;index<7;index++){api.overTimeDay(index);assert.equal(over().window.from,localMidnight(6-index),'day '+index+' starts at its local midnight');}
 await historySettle();assert.equal(live,0,'Metrics off: no live call');assert.equal(windows.length,0,'Metrics off: no history call');
 api.overTimeDay(5);api.setMetricsEnabled(true);await historySettle();
 for(const index of [4,5,4]){api.overTimeDay(index);await historySettle();}
 assert.deepEqual(windows.map(w=>w.to),[localMidnight(0),localMidnight(1)],'one window per new day; a loaded past day comes from the cache');
 assert.ok(windows.every(w=>Date.parse(w.to)-Date.parse(w.from)===86400000),'each is the Metrics window ending at the day end');
 api.overTimeDay(6);await historySettle();assert.equal(windows.length,3);assert.ok(Date.parse(windows[2].to)<=Date.now() && windows[2].to>=localMidnight(0),'today ends now');
 overBackToLive(api);await historySettle();assert.equal(over().active,false);
 api.destroy();
});
const freeTelemetry=()=>({historyMode:'window',provider:async()=>({}),history:async()=>({})});
test('OT20 a local Over time ends when a detail with tickets loads or a Jira history source arrives (#1138)',async()=>{
 let resolve;const renderOptions={telemetry:freeTelemetry(),loadDetail:()=>new Promise(r=>resolve=r)},h=harness(freeFixture(),{},renderOptions),api=h.ctl.liveStatus;mountStatus(h);
 api.overTime();await historySettle();api.overTimeDay(2);assert.equal(api.snapshot().overTime.active,true);
 const pending=renderOptions.loadDetail({spec:'approved-detail'},new AbortController().signal);resolve({nodes:{child:{tickets:['DD-1']}},rows:[['child']]});await pending;h.flush();
 assert.equal(api.snapshot().available,true,'the board now has a ticket');
 assert.ok(!api.snapshot().overTime?.active,'the local Over time ends, so the reader is not left on a past day');
 assert.equal(h.ctl.telemetry.snapshot().historical,false,'Metrics is back on Live');assert.equal(h.view.querySelector('.dv-live-over-time-row'),null);
 api.destroy();
 const j=harness(freeFixture(),{},{telemetry:freeTelemetry()}),jira=j.ctl.liveStatus;mountStatus(j);
 jira.overTime();await historySettle();jira.overTimeDay(1);assert.equal(jira.snapshot().overTime.active,true);
 let loads=0;jira.setHistory({load(){loads++;return {days:overDays()};}});
 assert.equal(jira.snapshot().overTime.active,false,'a Jira history source closes the local Over time');assert.equal(j.ctl.telemetry.snapshot().historical,false);assert.equal(loads,0,'and loads nothing until the reader asks');
 jira.destroy();
});
test('OT20 on a Jira-free board a click on the selected Live changes nothing (#1138)',()=>{
 const h=harness(freeFixture(),{},{telemetry:freeTelemetry()}),api=h.ctl.liveStatus,live=()=>h.view.querySelector('button.dv-live-toggle');mountStatus(h);
 assert.equal(live().hidden,false);assert.equal(live().getAttribute('aria-pressed'),'true');
 live().dispatchEvent({type:'click'});assert.equal(api.enabled(),true,'there are no ticket colors to turn off');assert.equal(live().getAttribute('aria-pressed'),'true','Live stays selected');
 api.destroy();
});
test('OT16 First blocker cannot reach a ticket that has no status on the day, and a real blocker on another day still counts',async()=>{
 const h=harness(overFixture());mountStatus(h);const api=overReady(h.ctl.liveStatus);h.ctl.sections[0].stepper={path:()=>'happy',sourceIndex:()=>0,mode:()=>'ambient',jumpSource(){}};api.apply(overToday());
 const rest={'EP-1':{state:'active'},'AA-1':{state:'todo'},'BB-1':{state:'todo'},'ZZ-2':{state:'todo'}},first=()=>h.view.querySelector('.dv-live-first'),edge=h.view.querySelector('path.edge');
 api.setHistory({load:()=>({days:[{label:'One',short:'One',states:{...rest}},{label:'Two',short:'Two',states:{...rest,'EE-1':{state:'blocked'}}}]})});api.overTime();await historySettle();h.flush();
 assert.equal(api.snapshot().firstBlocker,true,'contrasting day: EE-1 is really blocked');assert.equal(first().textContent,'First blocker');assert.equal(first().disabled,false);assert.equal(api.snapshot().epic.blocked,1);
 api.overTimeDay(0);h.flush();assert.ok(edge.classList.contains('dv-live-missing'),'the step edge wears the Missing paint');
 assert.equal(api.snapshot().firstBlocker,false);assert.equal(first().textContent,'No blockers');assert.equal(first().disabled,true);assert.equal(api.snapshot().epic.blocked,0);
});
/* #1131 (epic #1130, Chuck D1 D6 D8 D12): one header above the Jira and the Trace view. Top row: Jira | Trace, an Env
   select, a "Metrics overlay" switch. Second row: Live | Over time. The day row and the Over time error below it.
   Rejects: a header drawn only in the Jira view; Over time that leaves the Trace view; a second environment select or a
   second Metrics control; "Enable traces". */
const headerFixture=()=>{const raw=overFixture();raw.page.tracking.telemetry={environment:'prd',environments:{prd:{},stg:{}}};return raw;};
const accessibleName=el=>el.getAttribute('aria-label') || textOf(el).replace(/\s+/g,' ').trim();
const shownIn=(el,root)=>{for(let node=el;node && node!==root;node=node.parentElement)if(node.hidden)return false;return true;};
const namedControls=(root,name,role)=>root.querySelectorAll('button,select,input').filter(el=>shownIn(el,root) && accessibleName(el)===name && (!role || el.getAttribute('role')===role));
test('OT18 #1131 the shared header shows Live | Over time, the day row, one Env and one Metrics overlay switch in the Jira and the Trace view',async()=>{
 const h=harness(headerFixture(),{},{telemetry:{provider:()=>Promise.resolve({})}}),api=overReady(h.ctl.liveStatus),m=mountStatus(h);api.apply(overToday());
 let fail=false;api.setHistory({load:()=>fail?{days:[]}:{days:overDays()}});
 const header=view=>{
  assert.equal(namedControls(m.body,'Live').length,1,view+': one Live');assert.equal(namedControls(m.body,'Over time').length,1,view+': one Over time');
  const env=namedControls(m.body,'Env');assert.equal(env.length,1,view+': one control named Env');assert.equal(env[0].tagName,'select');
  const metrics=namedControls(m.body,'Metrics overlay','switch');assert.equal(metrics.length,1,view+': one Metrics overlay switch');
  for(const gone of ['Enable traces','Disconnect traces','Metrics','Environment','Trace environment'])assert.equal(namedControls(m.body,gone).length,0,view+': no control named '+gone);
  return {env:env[0],metrics:metrics[0],live:namedControls(m.body,'Live')[0],over:namedControls(m.body,'Over time')[0]};
 };
 api.setStatusMode('trace');assert.ok(m.body.querySelector('.dv-live-trace'));assert.equal(m.body.querySelector('table.dv-live-tickets'),null);
 let c=header('Trace');
 // The switch and Env call the controller actions the old Metrics button and Environment select called.
 assert.equal(c.metrics.getAttribute('aria-checked'),'false');c.metrics.dispatchEvent({type:'click'});assert.equal(api.snapshot().metrics.enabled,true);
 c=header('Trace');assert.equal(c.metrics.getAttribute('aria-checked'),'true');c.metrics.dispatchEvent({type:'click'});assert.equal(api.snapshot().metrics.enabled,false);
 c.env.value='stg';c.env.dispatchEvent({type:'change'});assert.equal(api.snapshot().metrics.environment,'stg');
 assert.equal(c.live.getAttribute('aria-pressed'),'true');assert.equal(c.over.getAttribute('aria-pressed'),'false');
 c.over.dispatchEvent({type:'click'});await historySettle();
 assert.equal(api.snapshot().mode,'trace','Over time from the Trace view keeps the Trace view');assert.equal(api.snapshot().overTime.active,true);assert.ok(m.body.querySelector('.dv-live-trace'));
 c=header('Trace, Over time');assert.equal(c.over.getAttribute('aria-pressed'),'true');assert.equal(c.live.getAttribute('aria-pressed'),'false');
 const row=()=>m.body.querySelector('.dv-live-over-time-row');assert.ok(row() && shownIn(row(),m.body),'the day row shows in the Trace view');
 assert.equal(row().querySelector('.dv-live-over-time-day').textContent,'Oct 22');assert.ok(row().querySelector('input.dv-live-over-time-slider'));
 const [prev]=row().querySelectorAll('.dv-live-step');prev.dispatchEvent({type:'click'});assert.equal(api.snapshot().overTime.index,1);assert.equal(row().querySelector('.dv-live-over-time-day').textContent,'Oct 21');assert.equal(api.snapshot().mode,'trace');
 c.live.dispatchEvent({type:'click'});await historySettle();assert.equal(api.snapshot().overTime.active,false);assert.equal(api.snapshot().mode,'trace');assert.equal(row(),null);
 // The Over time error shows in the Trace view too.
 fail=true;c=header('Trace');c.over.dispatchEvent({type:'click'});await historySettle();
 const error=m.body.querySelector('.dv-live-over-time-status');assert.ok(error && shownIn(error,m.body),'the Over time error shows in the Trace view');assert.equal(error.textContent,'History could not load. Try Over time again.');
 api.setStatusMode('jira');header('Jira');assert.ok(m.body.querySelector('table.dv-live-tickets'));assert.ok(shownIn(m.body.querySelector('.dv-live-over-time-status'),m.body),'and in the Jira view');
 m.destroy();api.destroy();
});
/* #1136 (epic #1130, Chuck 2026-11-08 "just show the trace part with the metrics toggle - same thing just no jira"):
   a board with no ticket or epic references after imports (snapshot().available false) opens on the Trace view and
   shows no Jira | Trace switch. Edit is in the shared header for any editor, in both views.
   Rejects: a Jira view that says "This page has no ticket references."; Edit gated on tickets; a board whose tickets
   come only through an import treated as Jira-free. */
const jiraFreeEditor=()=>({starts:0,state(){return {editable:true,blocked:'',active:false,pending:0,saving:false,readOnly:false,notice:null};},onChange:()=>()=>{},rememberMap(){},lastMap:()=>null,question:()=>null,start(){this.starts++;}});
const jiraFreeBoard=tickets=>({page:{tracking:{...(tickets?{jira:{site:'https://jira.test'}}:{}),telemetry:{environment:'prd',environments:{prd:{},stg:{}}}},sections:[{id:'main',diagram:{
 nodes:{web:{title:'Web',...(tickets?{tickets:['AA-1']}:{})},api:{title:'API',telemetry:TSERVICE()}},rows:[['web','api']],edges:[{from:'web',to:'api',label:'call',telemetry:TCALL()}],
 steps:[{id:'call',edge:'web->api',traceMatch:{serviceName:'api',operation:'GET /cart'}}],panels:[{id:'status',type:'live-status',title:'Status'}]}}]}});
test('#1136 a board without ticket references opens on Trace with no Jira | Trace switch, and Edit is in the shared header for an editor',()=>{
 const viewButtons=root=>root.querySelectorAll('button').filter(el=>shownIn(el,root) && /^(Jira|Trace)( · \d+)?$/.test(accessibleName(el)));
 const open=raw=>{const editor=jiraFreeEditor(),h=harness(raw,{},{telemetry:{provider:()=>Promise.resolve({})},boardEditor:editor}),m=mountStatus(h);return {h,m,api:h.ctl.liveStatus,editor};};
 const free=open(jiraFreeBoard(false));
 assert.equal(free.api.snapshot().available,false,'contrasting precondition: no ticket or epic references');
 assert.equal(free.api.snapshot().mode,'trace','a Jira-free board opens on the Trace view');
 assert.deepEqual(viewButtons(free.m.body).map(accessibleName),[],'no Jira | Trace switch');
 assert.ok(free.m.body.querySelector('.dv-live-trace'));assert.ok(!textOf(free.m.body).includes('This page has no ticket references.'));
 assert.equal(namedControls(free.m.body,'Env').length,1,'Env stays');assert.equal(namedControls(free.m.body,'Metrics overlay','switch').length,1,'the Metrics overlay switch stays');
 const edit=namedControls(free.m.body,'Edit');assert.equal(edit.length,1,'an editor sees one Edit');assert.ok(edit[0].closest('.dv-status-header'),'Edit is in the shared header');
 edit[0].dispatchEvent({type:'click'});assert.equal(free.editor.starts,1,'Edit starts board editing');
 // The Metrics overlay's connector line is drawn by each view below its button rows (#1162), so the Trace view shows it here.
 const metricsLines=b=>b.m.body.querySelectorAll('.dv-live-metrics-connection').filter(el=>shownIn(el,b.m.body));
 assert.equal(metricsLines(free).length,1,'the metrics status line shows on a Jira-free board');assert.ok(metricsLines(free)[0].closest('.dv-live-trace'),'#1162 under the Trace view controls');assert.match(textOf(metricsLines(free)[0]),/Metrics: not connected/);
 free.m.destroy();free.api.destroy();
 // Boards with tickets, local or only through an import, keep the switch and open on Jira; Edit is in the header in both views.
 const seed=harness(),C=seed.C;seed.ctl.liveStatus.destroy();
 const model=(id,d)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram:d}]}});
 const provider=model('provider',{nodes:{api:{title:'API'},db:{title:'DB'}},rows:[['api','db']],edges:[{from:'api',to:'db',label:'Persist'}],topologyExports:{core:{nodes:['api','db'],edges:['api->db']}}});
 const consumer=model('consumer',{nodes:{},rows:[[]],topologyImports:[{spec:'provider',export:'core',as:'canon',nodeTracking:{api:{tickets:['AA-1']}}}],panels:[{id:'status',type:'live-status',title:'Status'}]});
 consumer.page.tracking={jira:{site:'https://jira.test'}};
 for(const [name,raw] of [['local tickets',jiraFreeBoard(true)],['tickets only through an import',C.FlowTopology.materialize([provider,consumer])[1]]]){
  const b=open(raw);
  assert.equal(b.api.snapshot().available,true,name+': has references');assert.equal(b.api.snapshot().mode,'jira',name+': opens on Jira');
  assert.deepEqual(viewButtons(b.m.body).map(accessibleName),['Jira','Trace'],name+': keeps the Jira | Trace switch');
  for(const view of ['jira','trace']){b.api.setStatusMode(view);const edits=namedControls(b.m.body,'Edit');assert.equal(edits.length,1,name+' '+view+': one Edit');assert.ok(edits[0].closest('.dv-status-header'),name+' '+view+': Edit is in the shared header');
   assert.equal(b.m.body.querySelectorAll('.dv-live-metrics-connection').filter(el=>shownIn(el,b.m.body)).length,1,name+' '+view+': one metrics status line');}
  b.m.destroy();b.api.destroy();
 }
});

test('#1136 a board that opened on Trace for want of references moves to Jira when a loaded detail brings tickets, unless the reader chose a view',async()=>{
 const raw={page:{tracking:{jira:{site:'https://jira.test'}},sections:[{id:'main',diagram:{nodes:{domain:{title:'Domain',detail:{spec:'remote',section:'child',mode:'link'}}},rows:[['domain']]}}]}},remote={page:{sections:[{id:'child',diagram:{nodes:{child:{tickets:['AA-1']}},rows:[['child']]}}]}};
 const switchShown=body=>body.querySelectorAll('button.dv-status-mode').filter(el=>shownIn(el,body)).map(accessibleName);
 for(const chose of [false,true]){
  const options={loadDetail:async()=>remote},h=harness(raw,{},options),api=h.ctl.liveStatus,m=mountStatus(h);
  assert.equal(api.snapshot().available,false);assert.equal(api.snapshot().mode,'trace');assert.deepEqual(switchShown(m.body),[]);
  if(chose)api.setStatusMode('trace');
  await options.loadDetail({spec:'remote',section:'child'},new AbortController().signal);h.flush();
  assert.equal(api.snapshot().available,true);assert.equal(api.snapshot().mode,chose?'trace':'jira',chose?'the chosen view stays':'the board now has Jira');
  assert.deepEqual(switchShown(m.body),['Jira','Trace'],'the switch appears with the references');
  m.destroy();api.destroy();
 }
});

test('#1136 a reader working on a loaded trace keeps the Trace view when a loaded detail brings tickets',async()=>{
 const profile=JSON.parse(JSON.stringify(require('./fixtures/trace-connection-profile.json'))),recorded=fs.readFileSync('tests/fixtures/provider-traces/honeycomb-trace.txt','utf8'),ID='8413cd87a9f15b6bfe8e1acf5b3346d0';
 const tool={name:'get_trace',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string'}},required:['trace_id','from','environment_slug','team_slug','view_mode']}};
 const raw={page:{tracking:{jira:{site:'https://jira.test'},telemetry:{traceConnections:{company:profile}}},sections:[{id:'main',diagram:{nodes:{domain:{title:'Domain',detail:{spec:'remote',section:'child',mode:'link'}}},rows:[['domain']]}}]}},remote={page:{sections:[{id:'child',diagram:{nodes:{child:{tickets:['AA-1']}},rows:[['child']]}}]}};
 const options={loadDetail:async()=>remote,telemetry:{provider:()=>Promise.resolve({}),directTrace:{describe:async()=>tool,call:async()=>({payload:recorded})}}};
 const h=harness(raw,{},options),api=h.ctl.liveStatus,m=mountStatus(h);
 assert.equal(api.snapshot().available,false);assert.equal(api.snapshot().mode,'trace');
 api.setDirectTraceField({field:'environment',value:'prod'});api.setDirectTraceField({field:'input',value:ID});
 assert.ok(await api.loadDirectTrace(false),'contrasting precondition: the trace loads');assert.ok(api.snapshot().trace.selected,'and is shown');
 await options.loadDetail({spec:'remote',section:'child'},new AbortController().signal);h.flush();
 // The detail adds a mapping diagram; the loaded trace stays (#1145) and the reader stays in the Trace view.
 assert.equal(api.snapshot().available,true);assert.equal(api.snapshot().mode,'trace','trace work keeps the Trace view');assert.ok(api.snapshot().trace.selected,'#1145: the loaded trace stays');
 assert.deepEqual(m.body.querySelectorAll('button.dv-status-mode').filter(el=>shownIn(el,m.body)).map(accessibleName),['Jira','Trace · 1'],'the switch appears with the references');
 m.destroy();api.destroy();
});
test('#1136 choosing a trace or focusing a span keeps the Trace view when a loaded detail brings tickets',async()=>{
 const remote={page:{sections:[{id:'child',diagram:{nodes:{child:{tickets:['AA-1']}},rows:[['child']]}}]}};
 for(const work of ['none','choose','span']){
  const f=await (await import('./helpers/step-evidence.mjs')).stepFixture(),d=f.spec.page.sections[0].diagram;
  delete f.spec.page.tracking.jira;d.edges.forEach(e=>delete e.tickets);Object.values(d.nodes).forEach(n=>delete n.tickets);d.nodes.app.detail={spec:'remote',section:'child',mode:'link'};
  const options={telemetry:{},loadDetail:async()=>remote},h=harness(f.spec,{},options),api=h.ctl.liveStatus;
  h.ctl.sections[0].stepper={path:()=>'short',sourceIndex:()=>0,mode:()=>'ambient',pause(){},jumpSource(){return true;}};
  h.ctl.telemetry.apply(f.samples);
  assert.equal(api.snapshot().available,false);assert.equal(api.snapshot().mode,'trace');
  // #1164: an example trace is listed but selected only when the reader picks it.
  const entry=api.snapshot().trace.entries[0];assert.ok(entry,'contrasting precondition: an example trace is listed');assert.equal(api.snapshot().trace.selected,null);
  if(work!=='none')await api.chooseTrace({key:entry.key,traceId:entry.exemplar.traceId});
  if(work==='span'){const selected=api.snapshot().trace.selected;assert.equal(api.selectTraceSpan({context:selected.context,spanId:selected.exemplar.spans[0].id}),true);}
  await options.loadDetail({spec:'remote',section:'child'},new AbortController().signal);h.flush();
  assert.equal(api.snapshot().available,true);assert.equal(api.snapshot().mode,work==='none'?'jira':'trace',work==='none'?'an example trace alone is not the reader choosing Trace':work+' keeps the Trace view');
  api.destroy();
 }
});
test('#1136 D13 Metrics overlay paints its cues in the Trace view on every board, and nothing while it is off',async()=>{
 const raw=cuePage();delete raw.page.tracking.jira;const d=raw.page.sections[0].diagram;Object.values(d.nodes).forEach(n=>delete n.tickets);d.edges.forEach(e=>delete e.tickets);
 const free=cueHarness(raw);await free.on();
 assert.equal(free.ctl.liveStatus.snapshot().available,false);assert.equal(free.ctl.liveStatus.snapshot().mode,'trace');
 assert.equal(free.stream(0).length,1,'the overlay paints in the only view');free.ctl.liveStatus.destroy();
 // Chuck 2026-11-08 (D13): the Metrics overlay draws in both views on every board.
 const jira=cueHarness();await jira.on();assert.equal(jira.stream(0).length,1,'the Jira view paints the overlay');
 jira.ctl.liveStatus.setStatusMode('trace');assert.equal(jira.stream(0).length,1,'so does the Trace view of a board with tickets');
 jira.ctl.telemetry.setEnabled(false);assert.equal(jira.cues().length,0,'off, the overlay draws nothing');jira.ctl.liveStatus.destroy();
});

test('Proof is cleared from retained panels on telemetry and live-status controller destruction',()=>{
 for(const owner of ['telemetry','liveStatus']){
  const h=harness(fixture()),api=h.ctl.liveStatus;h.ctl.page.sections[0].diagram.nodes.a.telemetry={kind:'service',signals:{rate:{grafana:'explicit',unit:'req/h'}},proof:{rate:{min:1}}};
  api.apply(fixed);api.note('Keep Jira print evidence');const mounted=mountStatus(h);
  h.ctl.telemetry.apply({a:{signals:{rate:{value:5}}}});assert.ok(mounted.body.querySelector('.dv-live-proof'));
  h.ctl[owner].destroy();assert.ok(!mounted.body.querySelector('.dv-live-proof'),owner+' removes Proof from retained DOM');assert.ok(!mounted.body.querySelector('.dv-live-proof-table'));
  assert.equal(mounted.body.querySelector('.dv-live-note').textContent,'Keep Jira print evidence');api.destroy();
 }
});


test('Testing Jira names override category fallback while flags and blocked names still win',()=>{
 const C=providerContext();
 for(const category of ['new','indeterminate','done',undefined])for(const name of ['Testing','TESTING',' testing '])assert.equal(C.liveStatusJiraState(jira('AA-1',category,name)),'testing');
 assert.equal(C.liveStatusJiraState(jira('AA-1','done','Testing'),new Set(['AA-1'])),'blocked');
 assert.equal(C.liveStatusJiraState(jira('AA-1','indeterminate','Testing blocked')),'blocked');
 assert.equal(C.liveStatusJiraState(jira('AA-1','indeterminate','User acceptance')),'active');
 assert.equal(C.liveStatusJiraState(jira('AA-1','done','Released')),'done');
});
test('Testing remains unfinished, rolls up conservatively and keeps started dependency behavior',()=>{
 const h=harness(),C=h.C;
 for(const [states,want] of [[['testing'],'testing'],[['testing','done','todo'],'testing'],[['testing','active'],'active'],[['testing','missing'],'missing'],[['testing','blocked'],'blocked'],[['testing','unknown'],'testing'],[['done','unknown'],null]])assert.equal(C.liveStatusPresentationRollup(states),want);
 const value={tickets:['AA-1'],existsWhen:'tickets-done'},map={'AA-1':{state:'testing'},'BB-1':{state:'todo'}};
 assert.equal(C.liveStatusUnavailable(value,map),true);
 const deps={'AA-1':[{key:'BB-1'}],'BB-1':[{key:'AA-1'}]},waiting=plain(C.liveStatusTicketWaiting(deps,map));
 assert.equal(waiting['AA-1'],undefined);assert.equal(waiting['BB-1'].on[0].state,'testing');assert.equal(waiting['BB-1'].tone,'grey');
 h.ctl.liveStatus.destroy();
});
test('Testing is preserved in local and imported node paint, counts, step labels, history and cleanup',()=>{
 const seed=harness(),model=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
 const provider=model('provider',{nodes:{testing:{tickets:['AA-1']}},rows:[['testing']],topologyExports:{core:{nodes:['testing'],edges:[]}}});
 const consumer=model('consumer',{nodes:{local:{tickets:['AA-1']}},rows:[['local']],topologyImports:[{spec:'provider',export:'core',as:'shared'}],steps:[{nodes:['local','shared::testing']}]});
 const resolved=seed.C.FlowTopology.materialize([provider,consumer])[1];seed.ctl.liveStatus.destroy();
 const h=harness(resolved),api=h.ctl.liveStatus;mountStatus(h);api.apply({'AA-1':{state:'testing'}});
 const diagram=h.ctl.page.sections[0].diagram;for(const id of ['local','shared::testing'])assert.equal(h.C.liveStatusCaption(diagram,{nodes:[id]},{'AA-1':{state:'testing'}}),'TESTING · 1 tickets');
 assert.equal(api.state('AA-1').state,'testing');assert.equal(api.snapshot().counts.testing,1);assert.equal(api.snapshot().readiness.done,0);
 assert.equal(h.view.querySelectorAll('.node').length,2);for(const node of h.view.querySelectorAll('.node'))assert.equal(node.getAttribute('data-live-appearance'),'testing');
 assert.equal(h.view.querySelector('[data-live-count="testing"]').textContent,'testing 1');assert.equal(h.view.querySelector('tr[data-live-ticket="AA-1"] .dv-live-state-pill').textContent,'testing');
 for(const item of h.view.querySelectorAll('.coin,.schip'))assert.equal(item.getAttribute('data-live-appearance'),'testing');
 const C=providerContext(),days=historyDays(C,[historyTicket('AA-1',historyAt(2026,10,20),'Testing',[historyChange(historyAt(2026,10,21),'In Progress','Testing')])],{'AA-1':{state:'testing'}});
 assert.deepEqual(historyStates(days,'AA-1'),['active','testing','testing','testing','testing']);
 assert.equal(h.C.liveStatusDayMap({'AA-1':{state:'done'}},days.days[2].states)['AA-1'].state,'testing');
 api.setEnabled(false);assert.equal(h.view.querySelectorAll('.dv-live-testing').length,0);api.setEnabled(true);assert.ok(h.view.querySelectorAll('.dv-live-testing').length);api.clear();assert.equal(h.view.querySelectorAll('.dv-live-testing').length,0);api.destroy();
});

test('Testing survives demo timelines and epic aggregation without claiming Done',()=>{
 const C=storyContext(),day={issues:{'AA-1':{state:'testing',epic:'EP-1'}}};
 const map=plain(C.liveStatusDemoMap(day,['AA-1'],{'EP-1':{summary:'Preview'}}));
 assert.equal(map['AA-1'].state,'testing');assert.equal(map['EP-1'].state,'testing');
 assert.equal(C.liveStatusDemoDays({days:[day]},['AA-1'])[0].states['AA-1'].state,'testing');
});

test('Testing rolls into epic and initiative history while other demo container states keep their semantics',()=>{
 const C=providerContext(),today={'AA-1':{state:'testing',epic:'EP-1',initiatives:['IN-1']},'EP-1':{state:'testing',kind:'epic'},'IN-1':{state:'testing',kind:'initiative'}};
 const days=historyDays(C,[historyTicket('AA-1',historyAt(2026,10,20),'Testing')],today);
 assert.deepEqual(historyStates(days,'EP-1'),['testing','testing','testing','testing','testing']);assert.deepEqual(historyStates(days,'IN-1'),['testing','testing','testing','testing','testing']);
 const D=storyContext();for(const [state,want] of [['blocked','active'],['missing','todo'],['active','active'],['done','done'],['todo','todo']])assert.equal(D.liveStatusDemoMap({issues:{'AA-1':{state,epic:'EP-1'}}},['AA-1'],{'EP-1':{}})['EP-1'].state,want);
});

test('Status Jira and Trace bodies are exclusive, remain instance-owned and preserve Jira state',()=>{
 const h=harness(fixture()),peer=harness(fixture()),api=h.ctl.liveStatus;api.apply(fixed);const m=mountStatus(h),other=mountStatus(peer);
 assert.equal(api.snapshot().mode,'jira');assert.ok(m.body.querySelector('table.dv-live-tickets'));
 api.setStatusMode('trace');assert.equal(api.snapshot().mode,'trace');assert.ok(m.body.querySelector('.dv-live-trace'));assert.equal(m.body.querySelector('table.dv-live-tickets'),null);assert.match(textOf(m.body),/No traceMatch steps on this board/);
 assert.equal(peer.ctl.liveStatus.snapshot().mode,'jira');assert.equal(other.body.querySelector('.dv-live-trace'),null);
 api.setStatusMode('jira');assert.ok(m.body.querySelector('table.dv-live-tickets'));assert.equal(m.body.querySelector('.dv-live-trace'),null);assert.equal(api.state('AA-1').state,fixed['AA-1'].state);
 api.destroy();peer.ctl.liveStatus.destroy();
});

test('span focus controller pauses, jumps exact source steps, shares state, and rejects retired evidence',async t=>{
 const f=await (await import('./helpers/step-evidence.mjs')).stepFixture(),h=harness(f.spec,{}, {telemetry:{}}),api=h.ctl.liveStatus;
 t.after(()=>api.destroy());
 const exemplar=f.samples['mcu->ingest'].exemplars[0];
 // Use the real envelope validator in this VM. Missing browser primitives must
 // fail here rather than being swallowed as rejected evidence by telemetrySample.
 assert.doesNotThrow(()=>h.C.telemetryTraceEnvelope(exemplar));
 let path='short',index=3,pauses=0;const jumps=[];
 h.ctl.sections[0].stepper={path:()=>path,sourceIndex:()=>index,mode:()=> 'ambient',pause(){pauses++;},jumpSource(i,p){jumps.push([i,p]);index=i;path=p;return true;}};
 h.ctl.telemetry.apply(f.samples);
 assert.equal(h.ctl.telemetry.snapshot().map['mcu->ingest'].exemplars[0].traceId,exemplar.traceId);
 api.setStatusMode('trace');
 // #1164: an example trace is selected only when the reader picks it.
 assert.equal(api.snapshot().trace.selected,null);const first=api.snapshot().trace.entries[0];await api.chooseTrace({key:first.key,traceId:first.exemplar.traceId});
 let selected=api.snapshot().trace.selected;assert.ok(selected);assert.equal(selected.exemplar.traceId,exemplar.traceId);assert.equal(selected.focus,null);
 const edge=h.view.querySelector('path.edge[data-dv-edge="0"]');edge.setAttribute('id','focus-edge');edge.setAttribute('d','M0 0 C30 40 70 40 100 0');edge.setAttribute('transform','translate(5 7)');
 const span=selected.exemplar.spans.find(s=>s.service==='event-ingest' && s.name==='POST /v1/events'),action={context:selected.context,spanId:span.id};
 assert.equal(api.selectTraceSpan(action),true);assert.equal(pauses,1);assert.deepEqual(jumps,[[0,'short']]);
 selected=api.snapshot().trace.selected;assert.equal(selected.focus.spanId,span.id);assert.equal(selected.focus.choice.stepId,'submit');
 assert.equal(h.view.querySelectorAll('.dv-trace-focus-overlay').length,1);assert.equal(h.view.querySelectorAll('.dv-trace-edge-focus').length,1);assert.equal(h.view.querySelector('.dv-trace-edge-focus').getAttribute('transform'),'translate(5 7)');assert.equal(h.view.querySelector('.dv-trace-edge-outline').getAttribute('d'),edge.getAttribute('d'));
 api.setTraceShow(true);api.setTraceShow(true);assert.equal(h.view.querySelectorAll('.dv-trace-focus-overlay').length,1);assert.equal(h.view.querySelectorAll('.dv-trace-edge-focus').length,1);assert.equal(h.view.querySelectorAll('mask').length,1);assert.equal(edge.getAttribute('d'),'M0 0 C30 40 70 40 100 0');
 api.clearTraceFocus({context:selected.context});assert.equal(api.snapshot().trace.selected.focus,null);assert.equal(h.view.querySelectorAll('.dv-trace-focus-overlay[data-trace-level="current"],.dv-trace-edge-focus[data-trace-level="current"]').length,0);
 // #1185: with no span focused the trace's carriers keep their "below" marks, one mask per outline.
 assert.equal(h.view.querySelectorAll('.dv-trace-edge-focus[data-trace-level="below"]').length,1);assert.equal(h.view.querySelectorAll('mask').length,1);assert.equal(pauses,1);assert.equal(api.selectTraceSpan(action),false);
 const next={context:api.snapshot().trace.selected.context,spanId:span.id};api.destroy();assert.equal(api.selectTraceSpan(next),false);assert.equal(jumps.length,1);
});

test('live status supports prose-only pages and prose alongside domain summaries',()=>{
 for(const mixed of [false,true]){
  const prose={id:'notes',text:'Keep the authored notes intact.'},sections=[prose];
  if(mixed)sections.push({id:'main',diagram:{nodes:{domain:{detail:{section:'child'}}},rows:[['domain']]}},{id:'child',detailOnly:true,diagram:{nodes:{'shared::child':{tickets:['AA-1']}},rows:[['shared::child']]}});
  const h=harness({page:{sections}}),api=h.ctl.liveStatus,original=plain(h.ctl.page);
  assert.deepEqual(plain(api.refs().tickets),mixed?['AA-1']:[]);
  api.apply({'AA-1':{state:'blocked'}});
  if(mixed)assert.equal(h.view.querySelector('[data-dv-node="domain"]').getAttribute('data-live-appearance'),'blocked');
  h.view.dispatchEvent({type:'diagram-view-change'});h.flush();
  api.setEnabled(false);api.setEnabled(true);api.clear();
  assert.deepEqual(plain(h.ctl.page),original,'status projection must not add a diagram to prose or mutate authored content');
  api.destroy();
 }
});
test('local and nested imported domains preserve authored styles until status presentation is active',()=>{
 const seed=harness(),model=(id,sections)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections}});
 const provider=model('provider',[{id:'main',diagram:{nodes:{domain:{style:'rose'}},rows:[['domain']],topologyExports:{core:{nodes:['domain'],edges:[]}}}}]);
 const middle=model('middle',[{id:'main',diagram:{topologyImports:[{spec:'provider',export:'core',as:'nested'}],topologyExports:{core:{nodes:['nested::domain'],edges:[]}}}}]);
 for(const missing of [false,true]){
  // #1137: the ticketed node gives the board ticket references; a board without any gets no status presentation.
  const consumer=model('consumer',[{id:'main',diagram:{nodes:{local:{style:'rose',detail:{section:'child'}},tracked:{tickets:['AA-1']}},rows:[['local','tracked']],steps:[{id:'visit',nodes:['local','shared::nested::domain']}],topologyImports:[{spec:'middle',export:'core',as:'shared',nodeDetails:{'nested::domain':{section:'child'}}}]}},{id:'child',detailOnly:true,diagram:{nodes:{leaf:missing?{missingWork:true}:{}},rows:[['leaf']]}}]);
  const h=harness(seed.C.FlowTopology.materialize([provider,middle,consumer])[2]),api=h.ctl.liveStatus;
  let beforeAdvance;
  h.ctl.sections[0].stepper={path:()=>h.C.diagramPathList(h.ctl.page.sections[0].diagram)[0].id,sourceIndex:()=>0,mode:()=>'ambient',onBeforeAdvance(fn){beforeAdvance=fn;return ()=>{};}};
  for(const id of ['local','shared::nested::domain']){
   const node=h.view.querySelector('[data-dv-node="'+id+'"]');
   assert.equal(node.getAttribute('data-live-appearance'),missing?'missing':null);
   if(!missing){assert.ok(!node.classList.contains('ns-moss'));assert.ok(!node.querySelector('.card').classList.contains('dv-live-target'));node.classList.add('node-styled','ns-rose');}
  }
  if(!missing){h.view.dispatchEvent({type:'diagram-view-change'});h.flush();for(const id of ['local','shared::nested::domain'])assert.ok(h.view.querySelector('[data-dv-node="'+id+'"]').classList.contains('ns-rose'));}
  api.apply({});
  for(const id of ['local','shared::nested::domain']){const node=h.view.querySelector('[data-dv-node="'+id+'"]');assert.equal(node.getAttribute('data-live-appearance'),missing?'missing':'unchanged');assert.ok(node.querySelector('.card').classList.contains('dv-live-target'));}
  assert.equal(beforeAdvance(0),!missing,'Jira mode stops at descendant Missing work');
  api.setStatusMode('trace');
  for(const id of ['local','shared::nested::domain']){const node=h.view.querySelector('[data-dv-node="'+id+'"]');assert.equal(node.getAttribute('data-live-appearance'),missing?'missing':'unchanged','Trace retains domain summary ink');assert.ok(!node.querySelector('.card').classList.contains('dv-live-target'));}
  assert.equal(beforeAdvance(0),true,'Trace inspection does not introduce Jira auto-stops');
  api.setStatusMode('jira');assert.equal(beforeAdvance(0),!missing);
  api.clear();
  for(const id of ['local','shared::nested::domain']){const node=h.view.querySelector('[data-dv-node="'+id+'"]');assert.equal(node.getAttribute('data-live-appearance'),null);assert.ok(!node.querySelector('.card').classList.contains('dv-live-target'),'Clear removes summary-only controls');}
  api.apply({});
  api.setEnabled(false);
  for(const id of ['local','shared::nested::domain']){const node=h.view.querySelector('[data-dv-node="'+id+'"]');assert.equal(node.getAttribute('data-live-appearance'),null);assert.ok(!node.querySelector('.card').classList.contains('dv-live-target'));if(!missing)assert.ok(node.classList.contains('ns-rose'));}
  api.destroy();
 }
 seed.ctl.liveStatus.destroy();
});
test('domain summaries include unopened recursive local/imported nodes and connections without adding board totals',()=>{
 const raw={page:{sections:[{id:'main',diagram:{nodes:{domain:{title:'Domain',tickets:['AA-1'],detail:{section:'inside',mode:'focus'}}},rows:[['domain']],steps:[{id:'domain',nodes:['domain']}]}},{id:'inside',detailOnly:true,diagram:{nodes:{'shared::nested::a':{tickets:['AA-1','AA-2'],detail:{section:'deep',mode:'focus'}},shared:{detail:{section:'deep',mode:'focus'}},note:{type:'text',text:'Note',tickets:['IGNORE-1'],missingWork:true}},rows:[['shared::nested::a','shared']],edges:[{from:'shared::nested::a',to:'shared',tickets:['AA-3']}]}},{id:'deep',detailOnly:true,diagram:{nodes:{child:{missingWork:true,tickets:['AA-2']}},rows:[['child']]}}]}};
 const h=harness(raw),node=h.view.querySelector('[data-dv-node="domain"]'),summary=h.C.liveStatusDomainSummary(h.ctl.page,h.ctl.page.sections[0].diagram.nodes.domain,{});
 assert.deepEqual(plain(summary.tickets),['AA-1','AA-2','AA-3']);assert.equal(summary.carriers,4);assert.equal(summary.missing,1);
 h.ctl.liveStatus.apply({'AA-1':{state:'done'},'AA-2':{state:'done'},'AA-3':{state:'done'}});
 assert.equal(node.getAttribute('data-live-appearance'),'missing');assert.ok(!node.classList.contains('dv-live-unavailable'));
 assert.equal(h.view.querySelector('[data-step-source="0"]').getAttribute('data-live-appearance'),'missing');
 const target=node.querySelector('.card');h.view.dispatchEvent({type:'click',target,preventDefault(){},stopPropagation(){}});
 assert.match(h.view.querySelector('.dv-live-domain-summary').textContent,/3 unique tickets.*Missing work/);
 assert.equal(h.view.querySelector('.dv-live-coverage-detail'),null);
 h.ctl.liveStatus.setEnabled(false);assert.equal(node.getAttribute('data-live-appearance'),null);h.ctl.liveStatus.destroy();
});
test('domain summary preserves unknown tickets, unloaded links, recursion and loaded remote revisions without fetching',()=>{
 const h=harness(),C=h.C,page={sections:[{id:'root',diagram:{nodes:{domain:{tickets:['AA-1'],detail:{section:'child'}}},rows:[['domain']]}},{id:'child',diagram:{nodes:{external:{detail:{spec:'remote',revision:'rev',section:'remote'}},other:{tickets:['AA-2']}},rows:[['external','other']]}}]},node=page.sections[0].diagram.nodes.domain;
 let summary=C.liveStatusDomainSummary(page,node,{});assert.equal(summary._detailUnavailable,true);assert.equal(C.liveStatusPresentation(summary,{'AA-1':{state:'done'},'AA-2':{state:'done'}}),null);
 const loaded={['["remote","rev"]']:{sections:[{id:'remote',diagram:{nodes:{remote:{tickets:['AA-3']}},rows:[['remote']]}}]}};
 summary=C.liveStatusDomainSummary(page,node,loaded);assert.equal(summary._detailUnavailable,false);assert.equal(C.liveStatusPresentation(summary,{'AA-1':{state:'done'},'AA-2':{state:'done'}}),null);
 assert.equal(C.liveStatusPresentation(summary,{'AA-1':{state:'done'},'AA-2':{state:'done'},'AA-3':{state:'testing'}}),'testing');
 page.sections[1].diagram.nodes.external.detail={section:'root'};summary=C.liveStatusDomainSummary(page,node,loaded);assert.equal(summary._detailUnavailable,true);assert.match(summary.unavailable.join(),/Recursive/);h.ctl.liveStatus.destroy();
});
test('domain summary popovers retain own PRs and descendant ticket URLs',()=>{
 const raw={page:{sections:[{id:'main',diagram:{nodes:{domain:{title:'Domain',prs:['https://github.com/acme/repo/pull/1'],detail:{section:'child'}}},rows:[['domain']]}},{id:'child',detailOnly:true,diagram:{nodes:{child:{tickets:['https://child-jira.test/browse/AA-1']}},rows:[['child']]}}]}};
 const h=harness(raw);h.ctl.liveStatus.apply({'AA-1':{state:'blocked'}});const target=h.view.querySelector('[data-dv-node="domain"] .card');
 h.view.dispatchEvent({type:'click',target,button:0,preventDefault(){},stopPropagation(){}});
 const links=h.view.querySelector('.dv-live-popover').querySelectorAll('a').map(el=>el.getAttribute('href'));assert.ok(links.includes('https://child-jira.test/browse/AA-1'));assert.ok(links.includes('https://github.com/acme/repo/pull/1'));h.ctl.liveStatus.destroy();
});
test('loaded external domain tickets retain their owning Jira site',async()=>{
 const raw={page:{tracking:{jira:{site:'https://parent-jira.test'}},sections:[{id:'main',diagram:{nodes:{domain:{title:'Domain',detail:{spec:'remote',section:'child',mode:'link'}}},rows:[['domain']]}}]}},remote={page:{tracking:{jira:{site:'https://remote-jira.test'}},sections:[{id:'child',diagram:{nodes:{child:{tickets:['AA-1']}},rows:[['child']]}}]}};
 const options={loadDetail:async()=>remote},h=harness(raw,{},options);await options.loadDetail({spec:'remote',section:'child'},new AbortController().signal);h.ctl.liveStatus.apply({'AA-1':{state:'blocked'}});
 const target=h.view.querySelector('[data-dv-node="domain"] .card');h.view.dispatchEvent({type:'click',target,button:0,preventDefault(){},stopPropagation(){}});
 const links=h.view.querySelector('.dv-live-popover').querySelectorAll('a').map(el=>el.getAttribute('href'));assert.ok(links.includes('https://remote-jira.test/browse/AA-1'));assert.ok(!links.includes('https://parent-jira.test/browse/AA-1'));h.ctl.liveStatus.destroy();
});
test('First blocker focuses an explicit domain whose only blocker is in its detail',()=>{
 const raw={page:{sections:[{id:'main',diagram:{nodes:{domain:{title:'Domain',detail:{section:'child'}}},rows:[['domain']],steps:[{id:'visit',nodes:['domain']}]}},{id:'child',detailOnly:true,diagram:{nodes:{child:{tickets:['AA-1']}},rows:[['child']]}}]}};
 const h=harness(raw),api=h.ctl.liveStatus;mountStatus(h);let jumped=false,focused=false;
 h.ctl.sections[0].stepper={path:()=>h.C.diagramPathList(h.ctl.page.sections[0].diagram)[0].id,sourceIndex:()=>0,mode:()=>'ambient',jumpSource(){jumped=true;}};
 h.view.querySelector('[data-dv-node="domain"] .card').focus=()=>{focused=true;};api.apply({'AA-1':{state:'blocked'}});
 assert.equal(api.snapshot().firstBlocker,true);h.view.querySelector('.dv-live-first').dispatchEvent({type:'click'});assert.equal(jumped,true);assert.equal(focused,true);api.destroy();
});
/* #1081 wiring: the controller hands the board Environment to the Load-trace form. */
test('#1081 Load-trace connection environment follows the board Environment until the user picks one',()=>{
 const profile=JSON.parse(JSON.stringify(require('./fixtures/trace-connection-profile.json')));
 const raw={tracking:{telemetry:{environment:'prd',environments:{prd:{},stg:{},perf:{}},traceConnections:{company:profile}}},sections:[{id:'main',diagram:{nodes:{a:{}},rows:[['a']]}}]};
 const h=harness(raw,{},{telemetry:{provider:()=>Promise.resolve({}),directTrace:{describe(){},call(){}}}}),api=h.ctl.liveStatus,form=()=>api.snapshot().trace.direct.form;
 assert.equal(form().connection,'company');assert.equal(form().environment,'prod','board prd starts the trace dropdown at prod');
 api.setMetricsEnvironment('stg');assert.equal(form().environment,'stage','board change is followed');
 api.setMetricsEnvironment('perf');assert.equal(form().environment,'','no match shows Choose…');
 api.setMetricsEnvironment('prd');api.setDirectTraceField({field:'environment',value:'stage'});api.setMetricsEnvironment('stg');api.setMetricsEnvironment('prd');assert.equal(form().environment,'stage','the user pick stays');
 api.destroy();
});
test('#1125 the log lookup note names why it is unavailable, and Live restores it',async()=>{
 const profile=JSON.parse(JSON.stringify(require('./fixtures/trace-connection-profile.json'))),settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);};
 const raw=(enabled=true)=>({tracking:{telemetry:{...(enabled?{}:{enabled:false}),grafana:{loki:'logs'},lookups:{camera:{label:'Camera model',query:'{app="cams"} | cameraModel="$value"'}},traceConnections:{company:profile}}},sections:[{id:'main',diagram:{nodes:{a:{}},rows:[['a']]}}]});
 const host=()=>({telemetry:{provider:()=>Promise.resolve({}),directTrace:{describe(){},call(){},logsConnector:async()=>'Grafana',queryLogs:async()=>({data:[]})}}});
 const logs=h=>{const value=h.ctl.liveStatus.snapshot().trace.direct.logs;return [value.available,value.note];},seen={};
 const live=harness(raw(),{},host()),api=live.ctl.liveStatus;api.setStatusMode('trace');await settle();
 assert.deepEqual(logs(live),[true,'']);
 live.ctl.telemetry.openHistory([{at:'2026-11-01T00:00:00.000Z'}],0);seen.overTime=logs(live);
 live.ctl.telemetry.closeHistory();await settle();seen.backToLive=logs(live);
 api.destroy();seen.closed=logs(live);
 const board=harness(raw(false),{},host());seen.boardOff=logs(board);board.ctl.liveStatus.destroy();
 const off=harness(raw(),{},{telemetry:false});seen.hostOff=logs(off);off.ctl.liveStatus.destroy();
 // A host without a logs connector cannot run lookups in Live either, so Over time does not outrank that note.
 const bare=harness(raw(),{},{telemetry:{provider:()=>Promise.resolve({}),directTrace:{describe(){},call(){}}}});bare.ctl.telemetry.openHistory([{at:'2026-11-01T00:00:00.000Z'}],0);seen.noConnectorOverTime=logs(bare);bare.ctl.liveStatus.destroy();
 assert.deepEqual(seen,{
  overTime:[false,'Log lookups need a dated Over time day; this day has none.'],
  backToLive:[true,''],
  closed:[false,'This view was closed. Reopen it to look up log lines.'],
  boardOff:[false,'Log lookups need telemetry, which this board turns off.'],
  hostOff:[false,'Log lookups need telemetry, which this host turns off.'],
  noConnectorOverTime:[false,'Log lookups need a Grafana connector, which this host does not provide.']});
});
test('#1124 a log-line trace that is not found says it may not have been kept and offers the next line',async()=>{
 const profile=JSON.parse(JSON.stringify(require('./fixtures/trace-connection-profile.json'))),settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);};
 const ids=['a1'.repeat(16),'b2'.repeat(16),'c3'.repeat(16)],calls=[];
 const notFound=id=>'---\nMetadata:\n  environment: production\n  navigation_hints: no spans found\n  total_spans: 0\n  trace_id: '+id+'\n  view_mode: full\n  visible_spans: 0\n';
 const ns=ago=>(BigInt(Date.now()-ago)*1000000n).toString(),line=(ago,meta)=>({timestamp:ns(ago),line:'Handling camera stats message',labels:{env:'stg'},structuredMetadata:meta});
 const data=[line(600000,{trace_id:ids[0]}),line(900000,{cameraModel:'arch'}),line(1200000,{trace_id:ids[1]}),line(3*3600000,{trace_id:ids[2]})];
 const tool={name:'get_trace',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string'}},required:['trace_id','from','environment_slug','team_slug','view_mode']}};
 const raw={tracking:{telemetry:{grafana:{loki:'logs'},lookups:{camera:{label:'Camera model',query:'{app="cams"} | cameraModel="$value"'}},traceConnections:{company:profile}}},sections:[{id:'main',diagram:{nodes:{a:{}},rows:[['a']]}}]};
 const h=harness(raw,{},{telemetry:{provider:()=>Promise.resolve({}),directTrace:{describe:async()=>tool,call:async(request,args)=>{calls.push(args.trace_id);froms.push(args.from);return {payload:notFound(args.trace_id)};},logsConnector:async()=>'Grafana',queryLogs:async()=>({data})}}}),api=h.ctl.liveStatus,froms=[];
 const report=()=>api.snapshot().trace.direct.report,m=mountStatus(h);
 api.setStatusMode('trace');await settle();api.setDirectTraceField({field:'environment',value:'prod'});api.setLogLookupField({field:'value',value:'arch'});api.setLogLookupField({field:'traced',value:false});await api.findLogLines();
 assert.equal(await api.loadLogTrace(0),null);assert.deepEqual(calls,[ids[0]]);assert.equal(report().code,'trace_not_found');
 assert.equal(report().error,'Trace not found. The provider may not have kept this trace (sampling). Try the next log line.');
 const next=m.body.querySelector('.dv-trace-log-next');assert.ok(next,'the not-found report offers the next log line');assert.equal(next.textContent,'Try the next log line');
 next.dispatchEvent({type:'click'});await settle();assert.deepEqual(calls,[ids[0],ids[1]],'the next line with a trace id loads; the line without one is skipped');
 assert.equal(report().error,'Trace not found. The provider may not have kept this trace (sampling). Try the next log line.');
 // #1145 (D9): a log-line load searches back to the line's time − 1 h, so a 3 h old line is inside its
 // window and gets no lookback hint; with no later line there is no next-line offer.
 assert.equal(await api.loadLogTrace(3),null);assert.ok(['-4h','-5h'].includes(froms.at(-1)),froms.at(-1));assert.equal(report().error,'Trace not found. The provider may not have kept this trace (sampling).');
 assert.equal(m.body.querySelector('.dv-trace-log-next'),null);
 // A typed Trace start wins, so a line outside it still gets the lookback hint.
 api.setDirectTraceField({field:'start',value:'-2h'});assert.equal(await api.loadLogTrace(3),null);assert.equal(froms.at(-1),'-2h');
 assert.equal(report().error,'Trace not found. The provider may not have kept this trace (sampling). The log line is older than the last 2h; try a longer lookback under Lookback.');
 api.setDirectTraceField({field:'start',value:''});
 // A pasted ID keeps today's text.
 api.setDirectTraceField({field:'input',value:ids[0]});assert.equal(await api.loadDirectTrace(false),null);assert.equal(report().error,'Trace not found in the last 2h. Try a longer lookback under Lookback.');
 api.destroy();
});
test('#1158 the log form renders "Only lines with a trace ID" checked, and unchecking it reaches the controller',async()=>{
 const profile=JSON.parse(JSON.stringify(require('./fixtures/trace-connection-profile.json'))),settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);},calls=[];
 const raw={tracking:{telemetry:{grafana:{loki:'logs'},lookups:{camera:{label:'Camera model',query:'{app="cams"} | cameraModel="$value"'}},traceConnections:{company:profile}}},sections:[{id:'main',diagram:{nodes:{a:{}},rows:[['a']]}}]};
 const h=harness(raw,{},{telemetry:{provider:()=>Promise.resolve({}),directTrace:{describe(){},call(){},logsConnector:async()=>'Grafana',queryLogs:async args=>{calls.push(plain(args));return {data:[]};}}}}),api=h.ctl.liveStatus;
 api.setStatusMode('trace');await settle();const m=mountStatus(h),logs=()=>api.snapshot().trace.direct.logs;
 const box=m.body.querySelector('.dv-trace-logs .dv-trace-log-traced');assert.ok(box,'the checkbox renders in the log form');
 assert.equal(box.type,'checkbox');assert.equal(box.checked,true,'checked by default');assert.equal(box.disabled,false);
 assert.equal(box.closest('label').querySelector('span').textContent,'Only lines with a trace ID');
 api.setLogLookupField({field:'value',value:'arch'});await api.findLogLines();assert.equal(calls.length,1);assert.ok(logs().result);
 box.checked=false;box.dispatchEvent({type:'change'});
 assert.equal(logs().form.traced,false,'unchecking reaches the controller');assert.equal(logs().result,null,'and clears the results');assert.equal(calls.length,1,'without a call');
 h.flush();assert.equal(m.body.querySelector('.dv-trace-log-traced').checked,false,'the repaint keeps it unchecked');
 api.destroy();
});
/* #1142: in Over time, Load trace and Verify call the transport and search the selected day. */
test('#1142 Over time Load trace and Verify call the transport with the selected day window',async()=>{
 const profile=JSON.parse(JSON.stringify(require('./fixtures/trace-connection-profile.json'))),recorded=fs.readFileSync('tests/fixtures/provider-traces/honeycomb-trace.txt','utf8'),ID='8413cd87a9f15b6bfe8e1acf5b3346d0',calls=[];
 const tool={name:'get_trace',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string'}},required:['trace_id','from','environment_slug','team_slug','view_mode']}};
 const raw=overFixture();raw.page.tracking.telemetry={traceConnections:{company:profile}};
 const h=harness(raw,{},{telemetry:{provider:()=>Promise.resolve({}),directTrace:{describe:async()=>tool,call:async(request,args)=>{calls.push(plain(args));return {payload:recorded};}}}}),api=overReady(h.ctl.liveStatus),m=mountStatus(h);
 api.apply(overToday());api.setStatusMode('trace');
 const days=historyDays(providerContext(),[historyTicket('AA-1',Date.now()-4*86400000,'In Progress')],{'AA-1':{state:'active'}},Date.now());
 api.setHistory({load:()=>days});api.overTime();await historySettle();api.overTimeDay(days.days.length-3);
 // Opening Over time clears typed trace input, as it does today; type it on the day.
 api.setDirectTraceField({field:'environment',value:'prod'});api.setDirectTraceField({field:'input',value:ID});
 const day=api.snapshot().overTime,hours=()=>Math.max(1,Math.ceil((Date.now()-Date.parse(day.window.from))/3600000)),before=hours();
 assert.equal(day.active,true);assert.equal(day.today,false);
 assert.ok(await api.loadDirectTrace(false),'Over time loads a trace');assert.ok(await api.loadDirectTrace(true),'Over time verifies');
 assert.equal(calls.length,2,'one get_trace per Load and per Verify');
 calls.forEach(args=>assert.ok(['-'+before+'h','-'+hours()+'h'].includes(args.from),args.from+' reaches the day start'));
 assert.equal(api.snapshot().trace.direct.available,true);
 const note=m.body.querySelector('.dv-trace-lookback-note');assert.ok(note);
 assert.equal(note.textContent,'Searches '+day.label+' · looks back '+calls[1].from.slice(1)+' (this connection cannot stop at a past time)');
 // The loaded trace is the selected request, as in Live; example traces stay Live-only.
 assert.equal(api.snapshot().trace.selected && api.snapshot().trace.selected.manual,true,'the loaded trace is selected in Over time');
 assert.deepEqual(plain(api.snapshot().trace.entries.map(e=>e.label.split(' · ')[0])),['Loaded trace']);
 assert.ok(m.body.querySelector('.dv-trace-selected'),'the panel shows the selected request');
 // A day without a date has no window; Load trace stays off there.
 overBackToLive(api);await historySettle();api.setHistory({load:()=>({days:overDays()})});api.overTime();await historySettle();
 assert.equal(api.snapshot().overTime.window,null);assert.equal(api.snapshot().trace.direct.available,false);assert.equal(await api.loadDirectTrace(false),null);assert.equal(calls.length,2);
 api.destroy();
});
/* #1142 review: on today the window end moves with every read. Repaints must not cancel a pending
   load, drop the loaded trace, clear the typed ID or fetch again. */
test('#1142 on today, repaints keep a pending and a loaded trace and the typed ID',async()=>{
 const profile=JSON.parse(JSON.stringify(require('./fixtures/trace-connection-profile.json'))),recorded=fs.readFileSync('tests/fixtures/provider-traces/honeycomb-trace.txt','utf8'),ID='8413cd87a9f15b6bfe8e1acf5b3346d0',calls=[];let release;
 const tool={name:'get_trace',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string'}},required:['trace_id','from','environment_slug','team_slug','view_mode']}};
 const raw=overFixture();raw.page.tracking.telemetry={traceConnections:{company:profile}};
 const h=harness(raw,{},{telemetry:{provider:()=>Promise.resolve({}),directTrace:{describe:async()=>tool,call:async(request,args)=>{calls.push(plain(args));await new Promise(r=>release=r);return {payload:recorded};}}}}),api=overReady(h.ctl.liveStatus);mountStatus(h);
 api.apply(overToday());api.setStatusMode('trace');
 const days=historyDays(providerContext(),[historyTicket('AA-1',Date.now()-2*86400000,'In Progress')],{'AA-1':{state:'active'}},Date.now());
 api.setHistory({load:()=>days});api.overTime();await historySettle();api.overTimeDay(days.days.length-1);
 assert.equal(api.snapshot().overTime.today,true);
 api.setDirectTraceField({field:'environment',value:'prod'});api.setDirectTraceField({field:'input',value:ID});
 const repaint=async()=>{for(let i=0;i<5;i++){await new Promise(r=>setTimeout(r,2));api.setTraceShow(true);api.snapshot();}};
 const pending=api.loadDirectTrace(false);for(let i=0;i<20 && !release;i++)await new Promise(setImmediate);assert.ok(release,'the load reached the transport');
 await repaint();release();
 assert.ok(await pending,'pending load survives repaints on today');
 await repaint();
 const trace=api.snapshot().trace;
 assert.ok(trace.direct.exemplar,'the loaded trace survives repaints');assert.equal(trace.direct.form.input,ID,'the typed ID is kept');
 assert.equal(trace.selected && trace.selected.manual,true);assert.equal(calls.length,1,'no repaint fetches again');
 api.destroy();
});
test('#1141 in Over time the log search runs on the selected day, a day change clears results, and the Over time note is gone',async()=>{
 const profile=JSON.parse(JSON.stringify(require('./fixtures/trace-connection-profile.json'))),settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);},calls=[];
 const raw=overFixture();raw.page.tracking.telemetry={grafana:{loki:'logs'},lookups:{camera:{label:'Camera model',query:'{app="cams"} | cameraModel="$value"'}},traceConnections:{company:profile}};
 const lines={data:[{timestamp:'1794044533123456789',line:'Handling camera stats message',labels:{app:'cams'},structuredMetadata:{trace_id:'ab'.repeat(16)}}]};
 const h=harness(raw,{},{telemetry:{provider:()=>Promise.resolve({}),directTrace:{describe(){},call(){},logsConnector:async()=>'Grafana',queryLogs:async args=>{calls.push(plain(args));return lines;}}}});
 const api=overReady(h.ctl.liveStatus),logs=()=>api.snapshot().trace.direct.logs,day=()=>api.snapshot().overTime.window;api.apply(overToday());api.setStatusMode('trace');await settle();
 const days=historyDays(providerContext(),[historyTicket('AA-1',Date.now()-3*86400000,'In Progress')],{'AA-1':{state:'active'}},Date.now());
 api.setHistory({load:()=>days});api.overTime();await historySettle();api.overTimeDay(0);await settle();
 assert.deepEqual([logs().available,logs().note],[true,''],'Over time no longer disables the log search');
 api.setLogLookupField({field:'value',value:'arch'});await api.findLogLines();
 assert.equal(calls.length,1,'one call per Find');assert.deepEqual([calls[0].startRfc3339,calls[0].endRfc3339],[day().from,day().to]);
 assert.equal(logs().search,'Loki · '+day().label);assert.equal(logs().result.rows.length,1);
 api.overTimeDay(1);assert.equal(logs().result,null,'a day change clears the results');assert.equal(calls.length,1,'without a call');assert.equal(logs().form.value,'arch','the typed value stays');
 overBackToLive(api);await historySettle();await api.findLogLines();assert.deepEqual([calls[1].startRfc3339,calls[1].endRfc3339],['now-2h','now'],'Live is unchanged');
 // Days without a date have no window: the search names that instead of the old Over time note.
 api.setHistory({load:()=>({days:overDays()})});api.overTime();await historySettle();
 assert.deepEqual([logs().available,logs().note],[false,'Log lookups need a dated Over time day; this day has none.']);
 api.destroy();
});
test('OT19 #1141 on today Find searches local midnight to now, and its results survive repaints as now moves',async()=>{
 const profile=JSON.parse(JSON.stringify(require('./fixtures/trace-connection-profile.json'))),settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);},calls=[];
 const raw=overFixture();raw.page.tracking.telemetry={grafana:{loki:'logs'},lookups:{camera:{label:'Camera model',query:'{app="cams"} | cameraModel="$value"'}},traceConnections:{company:profile}};
 const lines={data:[{timestamp:'1794044533123456789',line:'Handling camera stats message',labels:{app:'cams'},structuredMetadata:{trace_id:'ab'.repeat(16)}}]};
 const h=harness(raw,{},{telemetry:{provider:()=>Promise.resolve({}),directTrace:{describe(){},call(){},logsConnector:async()=>'Grafana',queryLogs:async args=>{calls.push(plain(args));return lines;}}}});
 const api=overReady(h.ctl.liveStatus),logs=()=>api.snapshot().trace.direct.logs;api.apply(overToday());api.setStatusMode('trace');await settle();
 const days=historyDays(providerContext(),[historyTicket('AA-1',Date.now()-2*86400000,'In Progress')],{'AA-1':{state:'active'}},Date.now());
 api.setHistory({load:()=>days});api.overTime();await historySettle();await settle();assert.equal(api.snapshot().overTime.today,true,'Over time opens on today');
 api.setLogLookupField({field:'value',value:'arch'});const before=Date.now();await api.findLogLines();const after=Date.now();
 const now=new Date();assert.equal(calls.length,1);assert.equal(calls[0].startRfc3339,new Date(now.getFullYear(),now.getMonth(),now.getDate()).toISOString(),'today starts at local midnight');
 const end=Date.parse(calls[0].endRfc3339);assert.ok(end>=before && end<=after,'today ends now');assert.equal(logs().result && logs().result.rows.length,1,'the results are listed');
 // Two minutes later in the viewer's clock, repaints move today's end but keep the results and call nothing.
 vm.runInContext('(function(){var real=Date.now;Date.now=function(){return real()+120000;};globalThis.__restoreNow=function(){Date.now=real;};})()',h.C);
 try{for(let i=0;i<5;i++){api.snapshot();h.flush();}await settle();
  assert.equal(logs().result && logs().result.rows.length,1,'today\'s results survive repaints');assert.equal(calls.length,1,'no call without a click');
 }finally{vm.runInContext('__restoreNow()',h.C);}
 api.destroy();
});

/* #1137: a board without ticket references (snapshot().available === false) gives metric cards
   no Jira presentation; a board with tickets keeps "unchanged" on an unticketed carded edge. */
async function paintedCard(nodes){
 const raw={page:{tracking:{telemetry:{}},sections:[{id:'main',diagram:{nodes,rows:[['a','b']],edges:[{from:'a',to:'b',label:'PlaceOrder',telemetry:TCALL()}]}}]}};
 const h=harness(raw,{},{telemetry:{provider:()=>Promise.resolve({'a->b':{signals:{rate:{value:100},errors:{value:50}}}})}}),matrix={a:1,b:0,c:0,d:1,e:0,f:0,inverse(){return this;},multiply(m){return m;}};
 // SVG measurement shims so the real card painter places a card in the VM DOM.
 h.doc.defaultView={getComputedStyle:()=>({display:'inline',visibility:'visible',backgroundColor:'',getPropertyValue:()=>''})};
 const make=h.doc.createElementNS;h.doc.createElementNS=(ns,tag)=>Object.assign(make(ns,tag),{getComputedTextLength(){return 6*String(this.textContent||'').length;}});
 for(const el of h.view.querySelectorAll('svg,path.edge'))el.getCTM=()=>matrix;
 h.ctl.telemetry.setEnabled(true);for(let i=0;i<6;i++)await settle();h.flush();
 return {h,card:h.view.querySelector('g.dv-metrics-card[data-metrics-card="a->b"]')};
}
function workPresentation(h,card){
 h.view.dispatchEvent({type:'click',target:card,button:0,preventDefault(){},stopPropagation(){}});
 const pop=h.view.querySelector('.dv-live-popover');
 return {appearance:card.getAttribute('data-live-appearance'),classes:Array.from(h.C.LIVE_STATUS_APPEARANCES).filter(s=>card.classList.contains('dv-live-'+s)),halo:!!card.querySelector('.dv-live-halo'),
  label:/No change needed/.test(card.getAttribute('aria-label')||''),popover:!!pop && pop.querySelectorAll('.dv-live-coverage-detail').some(p=>/No change needed/.test(p.textContent||''))};
}
/* #1163 review c4: a board scale change re-lays out trace label text. It repaints (cards placed again)
   only when a label's box changed and now meets a metric card or a drawn card leader; any other scale
   change (Follow active moves, Ctrl+wheel) paints nothing. */
test('#1163 a board scale change repaints only when a changed trace label meets a card or a leader',async()=>{
 const f=await (await import('./helpers/step-evidence.mjs')).stepFixture();
 const h=harness(f.spec,{},{telemetry:{provider:()=>Promise.resolve(structuredClone(f.samples))}}),api=h.ctl.liveStatus,matrix={a:1,b:0,c:0,d:1,e:0,f:0,inverse(){return this;},multiply(m){return m;}};
 // SVG measurement shims so the real card painter places cards and the trace painter draws labels.
 h.doc.defaultView={getComputedStyle:()=>({display:'inline',visibility:'visible',backgroundColor:'',getPropertyValue:()=>''})};
 const make=h.doc.createElementNS;h.doc.createElementNS=(ns,tag)=>Object.assign(make(ns,tag),{getComputedTextLength(){return 6*String(this.textContent||'').length;},getCTM:()=>matrix,ownerDocument:h.doc});
 for(const el of h.view.querySelectorAll('svg,path.edge'))el.getCTM=()=>matrix;
 h.ctl.sections[0].stepper={path:()=>'event',sourceIndex:()=>0,mode:()=>'ambient',pause(){},jumpSource(){return true;}};
 h.ctl.telemetry.setEnabled(true);for(let i=0;i<6;i++)await settle();h.flush();api.setStatusMode('trace');h.flush();
 const entry=api.snapshot().trace.entries[0];await api.chooseTrace({key:entry.key,traceId:entry.exemplar.traceId});h.flush();
 let cards=h.view.querySelectorAll('g.dv-metrics-card');const labels=()=>h.view.querySelectorAll('.dv-trace-overlay text');
 assert.ok(cards.length && labels().length,'cards and trace labels are painted');
 const paints=()=>{const now=h.view.querySelectorAll('g.dv-metrics-card'),moved=now[0]!==cards[0];cards=now;return moved;};
 const scale=()=>h.view.dispatchEvent({type:'board-scale-change'});
 const place=()=>cards.forEach(card=>card.querySelector('.dv-metrics-card-box').getBBox=()=>({x:0,y:400,width:240,height:100}));
 place();const label=labels()[0],box=label.getBBox();
 label.getBBox=()=>({...box,x:900,y:100});scale();assert.equal(paints(),false,'same size as at paint: no paint');
 label.getBBox=()=>({x:900,y:100,width:box.width+40,height:box.height});scale();assert.equal(paints(),false,'a label grew but meets nothing: no paint');
 label.getBBox=()=>({x:0,y:420,width:box.width+60,height:box.height});scale();assert.equal(paints(),true,'a label grew onto a card: paint, the cards are placed again');
 place();const leader=h.view.querySelector('path.dv-metrics-leader').getAttribute('d').match(/-?[\d.]+/g).map(Number),mid={x:(leader[0]+leader[2])/2,y:(leader[1]+leader[3])/2};
 const next=labels()[0],size=next.getBBox();next.getBBox=()=>({x:mid.x-(size.width+20)/2,y:mid.y-size.height/2,width:size.width+20,height:size.height});
 scale();assert.equal(paints(),true,'a label grew under a drawn leader: paint');
 api.destroy();
});
// #1200: a card never wears Jira work paint; on a ticketed board the Jira view still names an unticketed card "No change needed".
test('#1137 metric cards on a board without tickets get no Jira presentation; ticketed boards keep unchanged',async()=>{
 const free=await paintedCard({a:{},b:{}});
 assert.equal(free.h.ctl.liveStatus.snapshot().available,false,'fixture has no ticket references');
 // #1136: a Jira-free board opens on Trace; its Jira view (reached through the controller) is where the references guard matters.
 free.h.ctl.liveStatus.setStatusMode('jira');free.h.flush();free.card=free.h.view.querySelector('g.dv-metrics-card[data-metrics-card="a->b"]');
 assert.ok(free.card,'the degraded carrier has a metric card');
 assert.equal(free.card.getAttribute('data-verdict'),'degraded');
 assert.deepEqual(workPresentation(free.h,free.card),{appearance:null,classes:[],halo:false,label:false,popover:false},'no Jira presentation on a Jira-free board');
 assert.ok(free.card.classList.contains('dv-live-target'),'the card still opens its production evidence');
 assert.ok(free.h.view.querySelector('.dv-live-popover'),'the click opened the popover');
 assert.equal(free.card.getAttribute('data-verdict'),'degraded','the card keeps its own verdict');
 free.h.ctl.liveStatus.destroy();
 const ticketed=await paintedCard({a:{tickets:['AA-1']},b:{}});
 assert.equal(ticketed.h.ctl.liveStatus.snapshot().available,true);
 assert.ok(ticketed.card);
 assert.equal(ticketed.card.getAttribute('data-verdict'),'degraded');
 assert.deepEqual(workPresentation(ticketed.h,ticketed.card),{appearance:null,classes:[],halo:false,label:true,popover:true},'an unticketed edge on a ticketed board stays unchanged in its name and popover, not its paint');
 ticketed.h.ctl.liveStatus.destroy();
});
// Chuck 2026-11-08 (D13): the Metrics overlay draws in every view. In the Trace view its cards carry no Jira work colouring,
// and the Workbench card preview still draws there.
/* #1153: the Trace view's metrics popup states metric evidence only: signal values, window, verdict and query links,
   with no Jira state or proof words and no Since Done line; since #1202 the Jira view's popup evidence does too. No ISO dates. */
test('#1153 the Trace-view metrics popup shows metric evidence only, and neither popup has a Since Done line or an ISO date (#1202)',async()=>{
 const DONE='2026-11-05T12:00:00.000Z',ISO=/\d{4}-\d\d-\d\dT\d\d:\d\d/;
 const raw={page:{tracking:{jira:{site:'https://jira.test'},telemetry:{}},sections:[{id:'main',diagram:{nodes:{a:{title:'A'},b:{title:'B'}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'PlaceOrder',tickets:['EE-1'],telemetry:TCALL()}]}}]}};
 const h=harness(raw,{},{telemetry:{provider:()=>Promise.resolve({'a->b':{signals:{rate:{value:5500},errors:{value:12}}}})}}),api=h.ctl.liveStatus,matrix={a:1,b:0,c:0,d:1,e:0,f:0,inverse(){return this;},multiply(m){return m;}};
 h.doc.defaultView={getComputedStyle:()=>({display:'inline',visibility:'visible',backgroundColor:'',getPropertyValue:()=>''})};
 const make=h.doc.createElementNS;h.doc.createElementNS=(ns,tag)=>Object.assign(make(ns,tag),{getComputedTextLength(){return 6*String(this.textContent||'').length;}});
 for(const el of h.view.querySelectorAll('svg,path.edge'))el.getCTM=()=>matrix;
 api.apply({'EE-1':{state:'done',updatedAt:DONE}});h.ctl.telemetry.setEnabled(true);for(let i=0;i<6;i++)await settle();h.flush();
 const card=()=>h.view.querySelector('g.dv-metrics-card[data-metrics-card="a->b"]'),pop=()=>h.view.querySelector('.dv-live-popover'),escape=()=>h.doc.dispatchEvent({type:'keydown',key:'Escape',preventDefault(){},stopPropagation(){}});
 workPresentation(h,card());const jira=textOf(pop());
 // #1202: the Jira-view popup's evidence reads like the Trace view's too, so it has no Since Done line.
 assert.doesNotMatch(jira,/Since Done/,'no Since Done line in the Jira-view popup (#1202)');assert.doesNotMatch(jira,ISO,'no ISO timestamp in the Jira-view popup');
 escape();api.setStatusMode('trace');h.flush();workPresentation(h,card());const trace=textOf(pop());
 assert.match(pop().getAttribute('aria-label'),/^Metrics for /,'the Trace view opens the metrics popup');
 assert.match(trace,/rate/,'it still shows the signal values');assert.match(trace,/5,500/);
 for(const word of [/\bDONE\b/,/Since Done/,/\bDone\b/,/proven/i,/IN PROGRESS/i])assert.doesNotMatch(trace,word,'no Jira or proof words in the Trace-view popup: '+word);
 assert.doesNotMatch(trace,ISO,'no ISO timestamp in the Trace-view popup');
 assert.equal(pop().querySelector('.dv-live-production').getAttribute('data-verdict'),null,'no Jira-derived verdict token on the metrics popup');
 api.destroy();
});
test('#1153 readable times: this year without the year, another year with it, an invalid value as given',()=>{
 const h=harness(),C=h.C,now=new Date(),thisYear=new Date(now.getFullYear(),1,3,9,5).toISOString(),otherYear=new Date(now.getFullYear()-3,1,3,9,5).toISOString();
 const time=d=>new Date(d).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
 assert.equal(C.liveStatusReadableTime(thisYear),new Date(thisYear).toLocaleDateString([],{month:'short',day:'numeric'})+', '+time(thisYear));
 assert.equal(C.liveStatusReadableTime(otherYear),new Date(otherYear).toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'})+', '+time(otherYear));
 assert.match(C.liveStatusReadableTime(otherYear),new RegExp(String(now.getFullYear()-3)));assert.doesNotMatch(C.liveStatusReadableTime(thisYear),new RegExp(String(now.getFullYear())));
 assert.equal(C.liveStatusReadableTime('not a date'),'not a date');
 h.ctl.liveStatus.destroy();
});
test('#1153 the Trace-view metrics popup states each metric state in its own words, for Done and In Progress carriers alike',async()=>{
 const shim=h=>{const matrix={a:1,b:0,c:0,d:1,e:0,f:0,inverse(){return this;},multiply(m){return m;}};
  h.doc.defaultView={getComputedStyle:()=>({display:'inline',visibility:'visible',backgroundColor:'',getPropertyValue:()=>''})};
  const make=h.doc.createElementNS;h.doc.createElementNS=(ns,tag)=>Object.assign(make(ns,tag),{getComputedTextLength(){return 6*String(this.textContent||'').length;}});
  for(const el of h.view.querySelectorAll('svg,path.edge'))el.getCTM=()=>matrix;};
 const P95={kind:'call',signals:{p95:{grafana:'histogram_quantile(0.95, x)',unit:'ms'}},proof:{}};
 const cases=[
  ['degraded',TCALL(),{rate:{value:5000},errors:{value:900}},/^DEGRADED · Outside limit: errors is /],
  ['silent',TCALL(),{rate:{value:0},errors:{value:0}},/^SILENT · Outside limit: rate is 0 req\/h; limit rate at least 1 req\/h$/],
  ['unmeasured, no limits',P95,{p95:{value:41}},/^OBSERVED · Observed signals; no authored limits\.$/],
  ['unmeasured, max only',{...P95,proof:{p95:{max:300}}},{p95:{value:41}},/^OBSERVED · Observed signals are within their authored limits; no traffic minimum is authored\.$/],
  ['flowing',TCALL(),{rate:{value:5500},errors:{value:12}},/^OBSERVED · Observed signals are within their authored limits\.$/]];
 for(const state of ['done','active'])for(const [name,telemetry,signals,expected] of cases){
  const raw={page:{tracking:{jira:{site:'https://jira.test'},telemetry:{}},sections:[{id:'main',diagram:{nodes:{a:{title:'A'},b:{title:'B'}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'PlaceOrder',tickets:['EE-1'],telemetry}]}}]}};
  const h=harness(raw,{},{telemetry:{provider:()=>Promise.resolve({'a->b':{signals}})}}),api=h.ctl.liveStatus;shim(h);
  api.apply({'EE-1':{state,updatedAt:'2026-11-05T12:00:00.000Z'}});h.ctl.telemetry.setEnabled(true);for(let i=0;i<6;i++)await settle();api.setStatusMode('trace');h.flush();
  workPresentation(h,h.view.querySelector('g.dv-metrics-card[data-metrics-card="a->b"]'));
  const pop=h.view.querySelector('.dv-live-popover'),verdict=pop.querySelector('.dv-live-production-verdict').textContent,text=textOf(pop);
  assert.match(verdict,expected,state+' '+name+': '+verdict);
  for(const word of [/\bDONE\b/i,/IN PROGRESS/i,/live early/i,/proven/i,/proof/i,/Since Done/])assert.doesNotMatch(text,word,state+' '+name+': '+word);
  api.destroy();
 }
});
test('D13 metric cards draw in the Trace view of a board with tickets without Jira work colouring, and the Workbench preview draws there too',async()=>{
 const shim=h=>{const matrix={a:1,b:0,c:0,d:1,e:0,f:0,inverse(){return this;},multiply(m){return m;}};
  h.doc.defaultView={getComputedStyle:()=>({display:'inline',visibility:'visible',backgroundColor:'',getPropertyValue:()=>''})};
  const make=h.doc.createElementNS;h.doc.createElementNS=(ns,tag)=>Object.assign(make(ns,tag),{getComputedTextLength(){return 6*String(this.textContent||'').length;}});
  for(const el of h.view.querySelectorAll('svg,path.edge'))el.getCTM=()=>matrix;};
 const ticketed=await paintedCard({a:{tickets:['AA-1']},b:{}}),api=ticketed.h.ctl.liveStatus,card=()=>ticketed.h.view.querySelector('g.dv-metrics-card[data-metrics-card="a->b"]');
 assert.match(card().getAttribute('aria-label') || '',/No change needed/,'contrasting precondition: the Jira view names the card\'s work status');
 api.setStatusMode('trace');ticketed.h.flush();
 assert.ok(card(),'the Trace view draws the card');assert.equal(card().getAttribute('data-verdict'),'degraded');
 const classes=Array.from(ticketed.h.C.LIVE_STATUS_APPEARANCES).filter(s=>card().classList.contains('dv-live-'+s));
 assert.deepEqual({appearance:card().getAttribute('data-live-appearance'),classes,halo:!!card().querySelector('.dv-live-halo')},{appearance:null,classes:[],halo:false},'no Jira work colouring in the Trace view');
 const presented=workPresentation(ticketed.h,card());assert.deepEqual({label:presented.label,popover:presented.popover},{label:false,popover:false},'in Trace a card opens only its metrics detail, with no Jira work status');
 assert.doesNotMatch(card().getAttribute('aria-label') || '',/Work status/,'and its name is not a Jira work status');
 assert.equal(ticketed.h.view.querySelector('.dv-live-popover .node-link-close').getAttribute('aria-label'),'Close metrics','its close button names the metrics');
 api.destroy();
 const raw={page:{tracking:{jira:{site:'https://jira.test'},telemetry:{}},sections:[{id:'main',diagram:{nodes:{a:{tickets:['AA-1']},b:{}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'PlaceOrder',telemetry:TCALL()}]}}]}};
 const w=harness(raw,{},{authoring:true,metricsPreview:true});shim(w);w.ctl.liveStatus.setStatusMode('trace');w.flush();
 assert.ok(w.view.querySelector('g.dv-metrics-card'),'the Workbench preview draws a card in the Trace view');w.ctl.liveStatus.destroy();
});
// The board frame grows for the overlay's cards through svg._refreshStatusFrame (src/engine.js); the Trace view must call it too,
// or a card placed below the authored frame is cut off (#1148 review: GetCart hidden in Trace).
test('D13 the Trace view grows the diagram frame for its metric cards, on boards with and without tickets',async()=>{
 for(const nodes of [{a:{tickets:['AA-1']},b:{}},{a:{},b:{}}]){
  const {h}=await paintedCard(nodes),api=h.ctl.liveStatus;let grown=0;
  for(const svg of h.view.querySelectorAll('svg'))svg._refreshStatusFrame=()=>{if(svg.querySelector('g.dv-metrics-card'))grown++;};
  api.setStatusMode('jira');assert.ok(grown>0,'contrasting precondition: the Jira view refreshes the frame after its cards');
  grown=0;api.setStatusMode('trace');assert.ok(h.view.querySelector('g.dv-metrics-card'),'the Trace view draws the card');
  assert.ok(grown>0,(nodes.a.tickets?'ticketed':'Jira-free')+' board: the Trace view refreshes the frame after its cards');
  api.destroy();
 }
});
test('#1137 an applied status map on a board without tickets gives nodes, step coins and captions no Jira presentation',()=>{
 const seed=harness(),model=(id,diagram)=>({page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',diagram}]}});
 const provider=model('provider',{nodes:{api:{title:'Imported API'}},rows:[['api']],topologyExports:{core:{nodes:['api'],edges:[]}}});
 const consumer=model('consumer',{nodes:{a:{title:'Sender'},b:{title:'Receiver'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],steps:[{nodes:['a','shared::api']},{edge:'a->b'}],topologyImports:[{spec:'provider',export:'core',as:'shared'}]});
 const h=harness(seed.C.FlowTopology.materialize([provider,consumer])[1]),api=h.ctl.liveStatus,rec=h.ctl.sections[0],controls=stepTicketControls(h,rec);seed.ctl.liveStatus.destroy();
 api.apply({});controls.change(0);
 assert.equal(api.snapshot().available,false,'fixture has no ticket references');
 const presentation=id=>{const node=h.view.querySelector('g.node[data-dv-node="'+id+'"]');return {node:node.getAttribute('data-live-appearance'),label:/No change needed/.test(node.querySelector('.card').getAttribute('aria-label')||'')};};
 const caption=controls.host.querySelector('.dv-live-caption');
 assert.deepEqual({local:presentation('a'),imported:presentation('shared::api'),
  coin:rec.sectionEl.querySelector('g.coin[data-dv-step="0"]').getAttribute('data-live-appearance'),chip:rec.sectionEl.querySelector('button.schip[data-step-source="0"]').getAttribute('data-live-appearance'),
  caption:caption?caption.textContent:null,painted:h.view.querySelectorAll('[data-live-appearance]').length},
  {local:{node:null,label:false},imported:{node:null,label:false},coin:null,chip:null,caption:null,painted:0});
 api.destroy();
});
/* #1145 (D5, D14): a loaded trace sets the view's day. The recorded Honeycomb trace is moved so its first
   span starts at a chosen time. The board has Jira history: AA-1 is To Do until yesterday, Done today. */
const DAY_TRACE_ID='8413cd87a9f15b6bfe8e1acf5b3346d0',DAY_TRACE=fs.readFileSync('tests/fixtures/provider-traces/honeycomb-trace.txt','utf8');
const dayTraceAt=ms=>{const delta=BigInt(ms)*1000000n-1791779586602194688n;return DAY_TRACE.replace(/\b\d{19}\b/g,n=>String(BigInt(n)+delta));};
const daysBack=(n,hour=12)=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate()-n,hour).getTime();};
const dayKeyOf=ms=>{const d=new Date(ms);return new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())).toISOString().slice(0,10);};
const dayLabelOf=ms=>new Date(ms).toLocaleDateString([],{month:'short',day:'numeric'});
function dayTraceBoard({at,loadDetail,lines,deferHistory=false,apply=true}={}){
 const profile=JSON.parse(JSON.stringify(require('./fixtures/trace-connection-profile.json'))),calls=[];let payload=dayTraceAt(at);
 const tool={name:'get_trace',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string'}},required:['trace_id','from','environment_slug','team_slug','view_mode']}};
 const raw=overFixture();raw.page.tracking.telemetry={traceConnections:{company:profile}};
 let hold=null;const renderOptions={telemetry:{provider:()=>Promise.resolve({}),directTrace:{describe:async()=>tool,call:async(request,args)=>{calls.push(plain(args));if(hold)await hold.promise;return {payload};}}}};
 if(lines){Object.assign(raw.page.tracking.telemetry,{grafana:{loki:'logs'},lookups:{camera:{label:'Camera model',query:'{app="cams"} | cameraModel="$value"'}}});Object.assign(renderOptions.telemetry.directTrace,{logsConnector:async()=>'Grafana',queryLogs:async()=>({data:lines})});}
 if(loadDetail)renderOptions.loadDetail=loadDetail;
 const h=harness(raw,{},renderOptions),api=overReady(h.ctl.liveStatus),m=mountStatus(h),now=Date.now();
 if(apply)api.apply(overToday());api.setStatusMode('trace');
 const history=historyDays(providerContext(),[historyTicket('AA-1',now-4*86400000,'In Progress',[historyChange(now-86400000,'To Do','In Progress')])],{'AA-1':{state:'done'}},now);
 let release=null,loads=0;api.setHistory({load:()=>{loads++;return deferHistory?new Promise(r=>{release=()=>r(history);}):history;}});
 api.setDirectTraceField({field:'environment',value:'prod'});api.setDirectTraceField({field:'input',value:DAY_TRACE_ID});
 return {h,api,m,calls,renderOptions,days:history.days,traceAt:ms=>{payload=ms==null?'---\nMetadata:\n  environment: production\n  navigation_hints: no spans found\n  total_spans: 0\n  trace_id: '+DAY_TRACE_ID+'\n  view_mode: full\n  visible_spans: 0\n':dayTraceAt(ms);},release:()=>{const r=release;release=null;if(r)r();},loads:()=>loads,
  holdCalls:()=>{let open;hold={promise:new Promise(r=>open=r)};return ()=>{hold=null;open();};},note:()=>api.snapshot().trace.direct.dayNote,
  loaded:()=>{const t=api.snapshot().trace;return !!(t.direct.exemplar && t.selected && t.selected.manual);}};
}
test('#1145 a trace from two days back opens Over time on its day with that day\'s Jira colours; another day clears it',async()=>{
 const at=daysBack(2),b=dayTraceBoard({at}),{api,h,m,calls}=b,a=()=>h.view.querySelector('[data-dv-node="a"]');
 h.flush();assert.ok(a().classList.contains('dv-live-done'),'Live paints today');
 assert.ok(await api.loadDirectTrace(false));await historySettle();h.flush();
 const over=api.snapshot().overTime;assert.equal(over.active,true,'loading the trace opens Over time');
 assert.equal(b.days[over.index].key,dayKeyOf(at),'on the trace\'s own day');
 assert.ok(b.loaded(),'the trace stays loaded and selected');assert.equal(calls.length,1,'one call');
 assert.ok(a().classList.contains('dv-live-todo') && !a().classList.contains('dv-live-done'),'D14: the node shows that day\'s status');
 assert.equal(m.body.querySelector('.dv-trace-date').textContent,'Started '+dayLabelOf(at)+' 12:00 local','the request card names the trace\'s date');
 assert.equal(b.note() || '','','no note when the view reached the trace\'s day');
 api.overTimeDay(over.index+1);h.flush();
 assert.equal(b.loaded(),false,'another day clears the trace');assert.equal(api.snapshot().trace.direct.exemplar,null);
 assert.equal(b.note(),'Cleared trace '+DAY_TRACE_ID.slice(0,12)+' ('+dayLabelOf(at)+'): the view moved to '+b.days[over.index+1].short+'.');
 assert.equal(m.body.querySelector('.dv-trace-day-note').textContent,b.note());assert.equal(api.snapshot().trace.direct.form.input,DAY_TRACE_ID,'the typed ID stays');
 api.overTimeDay(over.index);h.flush();assert.equal(b.note(),'','the note goes with the next view change');assert.equal(m.body.querySelector('.dv-trace-day-note'),null);
 // Back to Live clears a past-day trace too, with no call.
 assert.ok(await api.loadDirectTrace(false));await historySettle();assert.equal(api.snapshot().overTime.index,over.index);assert.ok(b.loaded());
 overBackToLive(api);await historySettle();assert.equal(b.loaded(),false);assert.equal(b.note(),'Cleared trace '+DAY_TRACE_ID.slice(0,12)+' ('+dayLabelOf(at)+'): the view moved to Live.');
 // Jira clear also returns a past day to Live and clears the trace.
 assert.ok(await api.loadDirectTrace(false));await historySettle();assert.ok(b.loaded());assert.equal(api.snapshot().overTime.active,true);
 api.clear();assert.equal(b.loaded(),false,'Jira clear clears the past-day trace');assert.equal(b.note(),'Cleared trace '+DAY_TRACE_ID.slice(0,12)+' ('+dayLabelOf(at)+'): the view moved to Live.');
 assert.equal(calls.length,3,'moving the day never loads');
 api.destroy();
});
test('#1145 a trace from today keeps or returns to Live; Over time on today keeps it',async()=>{
 const b=dayTraceBoard({at:Date.now()-60000}),{api,calls}=b;
 assert.ok(await api.loadDirectTrace(false));await historySettle();
 assert.equal(api.snapshot().overTime.active,false,'a today trace keeps Live');assert.ok(b.loaded());
 api.overTime();await historySettle();assert.equal(api.snapshot().overTime.today,true);assert.ok(b.loaded(),'the reader\'s Over time on today is the trace\'s day');
 assert.ok(await api.loadDirectTrace(false));await historySettle();assert.equal(api.snapshot().overTime.active,false,'D5: a today trace moves the view to Live');assert.ok(b.loaded());
 api.overTime();await historySettle();api.overTimeDay(0);assert.equal(b.loaded(),false);
 assert.ok(await api.loadDirectTrace(true),'Verify loads it too');await historySettle();
 assert.equal(api.snapshot().overTime.active,false,'a today trace returns a past day to Live');assert.ok(b.loaded());assert.equal(calls.length,3);
 api.destroy();
});
test('#1145 a trace from a day outside the day list keeps the view and says so',async()=>{
 const at=daysBack(30),b=dayTraceBoard({at}),{api,calls}=b,note='This trace is from '+dayLabelOf(at)+', which Over time does not list.';
 assert.ok(await api.loadDirectTrace(false));await historySettle();
 assert.equal(api.snapshot().overTime.active,false,'Live stays');assert.ok(b.loaded());assert.equal(b.note(),note);
 api.overTime();await historySettle();assert.equal(b.loaded(),false,'the reader\'s own move to Over time clears it');
 const index=api.snapshot().overTime.index;assert.ok(await api.loadDirectTrace(false));await historySettle();
 assert.equal(api.snapshot().overTime.index,index,'the selected day stays');assert.ok(b.loaded());assert.equal(b.note(),note);assert.equal(calls.length,2);
 api.destroy();
});
test('#1145 Load on a log line from two days back moves the view to that day; the list says loading moves the date',async()=>{
 const at=daysBack(2),line={timestamp:String(BigInt(at+60000)*1000000n),line:'Handling camera stats message',labels:{env:'stg'},structuredMetadata:{cameraModel:'arch',trace_id:DAY_TRACE_ID,span_id:'011114cbd1fd62de'}};
 const b=dayTraceBoard({at,lines:[line]}),{api,m,calls}=b,settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);};
 await settle();api.setLogLookupField({field:'value',value:'arch'});await api.findLogLines();
 assert.equal(m.body.querySelector('.dv-trace-logs-moves').textContent,'Loading a trace moves the view to its date.');
 const reach=()=>'-'+Math.ceil((Date.now()-(at+60000-3600000))/3600000)+'h',before=reach();
 assert.ok(await api.loadLogTrace(0));await historySettle();
 assert.equal(api.snapshot().overTime.active,true);assert.equal(b.days[api.snapshot().overTime.index].key,dayKeyOf(at),'the view moved to the trace\'s day');
 assert.ok(b.loaded());assert.equal(calls.length,1);assert.ok([before,reach()].includes(calls[0].from),'D9: back to the line time − 1 h');
 assert.equal(api.snapshot().trace.selected.focus && api.snapshot().trace.selected.focus.spanId,'011114cbd1fd62de','the line\'s span stays focused');
 api.destroy();
});
/* #1145 Q2 (a): a move the loaded trace causes keeps the log results, so the list and the next line
   survive the Load; a day change the reader makes clears them, as #1141 does. */
test('#1145 log results survive the move a trace causes and clear on the reader\'s day change',async()=>{
 const at=daysBack(2),other='c3'.repeat(16),line=(ms,id)=>({timestamp:String(BigInt(ms)*1000000n),line:'Handling camera stats message',labels:{env:'stg'},structuredMetadata:{cameraModel:'arch',trace_id:id}});
 const b=dayTraceBoard({at,lines:[line(at+60000,DAY_TRACE_ID),line(at,other)]}),{api,m,calls}=b,settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);};
 const logs=()=>api.snapshot().trace.direct.logs;
 await settle();api.setLogLookupField({field:'value',value:'arch'});await api.findLogLines();assert.equal(logs().result.rows.length,2);
 assert.ok(await api.loadLogTrace(0));await historySettle();
 assert.equal(api.snapshot().overTime.active,true,'the trace moved the view');
 assert.equal(logs().result && logs().result.rows.length,2,'the list survives the move the trace caused');assert.equal(logs().result.chosen,0);
 assert.equal(m.body.querySelectorAll('.dv-trace-log-row').length,2);
 assert.equal(await api.loadNextLogTrace(),null,'the next line still loads');assert.deepEqual(calls.map(c=>c.trace_id),[DAY_TRACE_ID,other]);
 // A trace from another listed day moves Over time day to day; the list stays.
 b.traceAt(daysBack(1));assert.ok(await api.loadLogTrace(0));assert.equal(b.days[api.snapshot().overTime.index].key,dayKeyOf(daysBack(1)));assert.equal(logs().result && logs().result.rows.length,2,'a day-to-day move keeps the list');
 // Today, while the list is from Live: a trace that returns the view to Live keeps it too.
 b.traceAt(Date.now()-60000);assert.ok(await api.loadLogTrace(0));await historySettle();
 assert.equal(api.snapshot().overTime.active,false,'back to Live for a today trace');assert.equal(logs().result && logs().result.rows.length,2);
 // The reader's own day change clears the results, as #1141 does.
 api.overTime();await historySettle();api.overTimeDay(0);assert.equal(logs().result,null,'the reader\'s day change clears them');
 assert.equal(calls.length,4,'no call without a click');
 api.destroy();
});
test('#1145 a history load the trace started follows the trace loaded when it arrives',async()=>{
 // A, then B from another past day: the view opens on B's day and B stays.
 let b=dayTraceBoard({at:daysBack(2),deferHistory:true});
 assert.ok(await b.api.loadDirectTrace(false));assert.equal(b.api.snapshot().overTime.loading,true);
 b.traceAt(daysBack(1));assert.ok(await b.api.loadDirectTrace(false));b.release();await historySettle();
 assert.equal(b.api.snapshot().overTime.active,true);assert.equal(b.days[b.api.snapshot().overTime.index].key,dayKeyOf(daysBack(1)),'B\'s day');assert.ok(b.loaded(),'B stays');assert.equal(b.note(),'');b.api.destroy();
 // A, then a today trace B: the view stays in Live with B.
 b=dayTraceBoard({at:daysBack(2),deferHistory:true});
 assert.ok(await b.api.loadDirectTrace(false));b.traceAt(Date.now()-60000);assert.ok(await b.api.loadDirectTrace(false));b.release();await historySettle();
 assert.equal(b.api.snapshot().overTime.active,false,'Live for today');assert.ok(b.loaded());assert.equal(b.note(),'');b.api.destroy();
 // A, then Clear trace: the history arrives and the view stays in Live.
 b=dayTraceBoard({at:daysBack(2),deferHistory:true});
 assert.ok(await b.api.loadDirectTrace(false));b.api.clearDirectTrace();b.release();await historySettle();
 assert.equal(b.api.snapshot().overTime.active,false,'no trace, no move');assert.equal(b.loaded(),false);b.api.destroy();
});
test('#1145 a trace that runs past midnight takes the day of its first span',async()=>{
 const at=daysBack(2,23)+59*60000+57000,b=dayTraceBoard({at}),{api,m}=b;
 assert.ok(await api.loadDirectTrace(false));await historySettle();
 assert.equal(b.days[api.snapshot().overTime.index].key,dayKeyOf(at),'the first span\'s day, not a later span\'s');
 assert.ok(api.snapshot().trace.selected.exemplar.spans.some(s=>dayKeyOf(Date.parse(s.time))!==dayKeyOf(at)),'the fixture crosses midnight');
 assert.equal(m.body.querySelector('.dv-trace-date').textContent,'Started '+dayLabelOf(at)+' 23:59 local');api.destroy();
});
test('#1145 the log list promises a move only when Over time can open',async()=>{
 const line={timestamp:String(BigInt(daysBack(2))*1000000n),line:'Handling camera stats message',labels:{env:'stg'},structuredMetadata:{cameraModel:'arch',trace_id:DAY_TRACE_ID}};
 const b=dayTraceBoard({at:daysBack(2),lines:[line],apply:false}),{api,m}=b,settle=async()=>{for(let i=0;i<12;i++)await new Promise(setImmediate);};
 await settle();api.setLogLookupField({field:'value',value:'arch'});await api.findLogLines();
 assert.equal(api.snapshot().trace.direct.movesDay,false,'no ticket status yet: Over time cannot open');assert.equal(m.body.querySelector('.dv-trace-logs-moves'),null);
 api.apply(overToday());assert.equal(api.snapshot().trace.direct.movesDay,true);assert.ok(m.body.querySelector('.dv-trace-logs-moves'));
 api.destroy();
});
/* #1145 round 3: a day change never says "Trace selection expired". An example trace the reader chose gets
   the plain note; one shown automatically leaves without a note. Leaving Over time or loading clears it. */
test('#1145 Over time retires example traces without "Trace selection expired"',async()=>{
 for(const work of ['unpicked','choose']){
  const f=await (await import('./helpers/step-evidence.mjs')).stepFixture(),h=harness(f.spec,{},{telemetry:{}}),api=overReady(h.ctl.liveStatus),m=mountStatus(h);
  h.ctl.sections[0].stepper={path:()=>'short',sourceIndex:()=>0,mode:()=>'ambient',pause(){},jumpSource(){return true;}};
  h.ctl.telemetry.apply(f.samples);api.apply({'TRACE-1':{state:'active'}});api.setStatusMode('trace');
  // #1164: listed, and selected only when the reader picks it.
  const selected=api.snapshot().trace.entries[0];assert.ok(selected,work+': an example trace is listed');assert.equal(api.snapshot().trace.selected,null);
  if(work==='choose')await api.chooseTrace({key:selected.key,traceId:selected.exemplar.traceId});
  const now=new Date(),key=back=>new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()-back)).toISOString().slice(0,10);
  api.setHistory({load:()=>({days:[2,1,0].map(back=>({key:key(back),label:key(back),short:key(back),states:{'TRACE-1':{state:'active'}}}))})});
  api.overTime();await historySettle();assert.equal(api.snapshot().overTime.active,true);
  const status=()=>m.body.querySelector('.dv-trace-mode-status').textContent;
  assert.doesNotMatch(api.snapshot().trace.notice,/expired/,work);assert.doesNotMatch(status(),/expired/,work);
  const plainNote='Cleared trace '+selected.exemplar.traceId.slice(0,12)+' ('+new Date(Math.min(...selected.exemplar.spans.map(s=>Date.parse(s.time)))).toLocaleDateString([],{month:'short',day:'numeric'})+'): the view moved to '+key(0)+'.';
  assert.equal(api.snapshot().trace.notice,work==='choose'?plainNote:'',work+': the plain note only for a trace the reader chose');
  api.overTimeDay(0);assert.equal(api.snapshot().trace.notice,'',work+': the next day change ends it');assert.doesNotMatch(status(),/expired/,work);
  overBackToLive(api);await historySettle();assert.equal(api.snapshot().trace.notice,'',work+': leaving Over time clears it');assert.doesNotMatch(status(),/expired|Cleared/);
  api.destroy();
 }
});
/* #1145 with #1138: on a Jira-free board with Metrics, Load opens the local 7-day Over time on the trace's day. */
test('#1145 Load on a Jira-free board opens the local Over time on the trace\'s day',async()=>{
 const profile=JSON.parse(JSON.stringify(require('./fixtures/trace-connection-profile.json'))),calls=[],at=daysBack(2);
 const tool={name:'get_trace',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string'}},required:['trace_id','from','environment_slug','team_slug','view_mode']}};
 const raw=freeFixture();raw.page.tracking.telemetry.traceConnections={company:profile};
 const h=harness(raw,{},{telemetry:{historyMode:'window',provider:async()=>({}),history:async()=>({}),directTrace:{describe:async()=>tool,call:async(request,args)=>{calls.push(plain(args));return {payload:dayTraceAt(at)};}}}}),api=h.ctl.liveStatus,m=mountStatus(h);
 assert.equal(api.snapshot().available,false,'the board has no Jira references');assert.equal(api.snapshot().mode,'trace');
 assert.equal(api.snapshot().trace.direct.movesDay,true,'the local Over time can open');
 api.setDirectTraceField({field:'environment',value:'prod'});api.setDirectTraceField({field:'input',value:DAY_TRACE_ID});
 assert.ok(await api.loadDirectTrace(false));await historySettle();
 const over=api.snapshot().overTime;assert.equal(over.active,true,'Load opens the local Over time');assert.equal(over.count,7);
 assert.equal(over.window.from,localMidnight(2),'on the trace\'s day');
 assert.ok(api.snapshot().trace.selected && api.snapshot().trace.selected.manual,'the trace stays loaded');assert.equal(calls.length,1);
 assert.equal(m.body.querySelector('.dv-trace-date').textContent,'Started '+dayLabelOf(at)+' 12:00 local');
 api.destroy();
});
/* #1145 cycle 2: an example-trace choice still loading when the view enters Over time never ends in
   "Trace selection expired"; the plain note clears on Load, Clear trace and a field edit. */
async function exampleBoard(){
 const f=await (await import('./helpers/step-evidence.mjs')).stepFixture(),h=harness(f.spec,{},{telemetry:{}}),api=overReady(h.ctl.liveStatus),m=mountStatus(h);
 h.ctl.sections[0].stepper={path:()=>'short',sourceIndex:()=>0,mode:()=>'ambient',pause(){},jumpSource(){return true;}};
 h.ctl.telemetry.apply(f.samples);api.apply({'TRACE-1':{state:'active'}});api.setStatusMode('trace');
 const now=new Date(),key=back=>new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()-back)).toISOString().slice(0,10);
 api.setHistory({load:()=>({days:[2,1,0].map(back=>({key:key(back),label:key(back),short:key(back),states:{'TRACE-1':{state:'active'}}}))})});
 return {h,api,m,status:()=>m.body.querySelector('.dv-trace-mode-status').textContent};
}
test('#1145 a choice still loading when Over time opens never ends in "Trace selection expired"',async()=>{
 const {h,api,status}=await exampleBoard(),t=h.ctl.telemetry,real=t.chooseExemplar;let release;
 t.canChooseExemplar=()=>true;
 t.chooseExemplar=function(...args){return new Promise(r=>release=r).then(()=>{if(t.snapshot().historical)throw new Error('Trace selection expired.');return real.apply(t,args);});};
 const selected=api.snapshot().trace.entries[0],other=selected.exemplar.candidates.find(c=>c.traceId!==selected.exemplar.traceId);
 const choosing=api.chooseTrace({key:selected.key,traceId:other.traceId});assert.equal(api.snapshot().trace.notice,'Loading selected trace…');
 api.overTime();await historySettle();assert.equal(api.snapshot().overTime.active,true);
 release();await choosing;await historySettle();
 assert.doesNotMatch(api.snapshot().trace.notice,/expired/);assert.doesNotMatch(status(),/expired/);
 api.destroy();
});
test('#1145 the day notes clear on Load, Clear trace and a field edit',async()=>{
 // traceNotice: an example trace the reader chose, retired by Over time.
 const e=await exampleBoard(),chosen=e.api.snapshot().trace.entries[0];await e.api.chooseTrace({key:chosen.key,traceId:chosen.exemplar.traceId});
 e.api.overTime();await historySettle();assert.match(e.api.snapshot().trace.notice,/^Cleared trace /);
 e.api.clearDirectTrace();assert.equal(e.api.snapshot().trace.notice,'','Clear trace ends it');e.api.destroy();
 // The Load trace day note: from a day outside the list.
 const b=dayTraceBoard({at:daysBack(30)}),{api}=b,outside=async()=>{b.traceAt(daysBack(30));assert.ok(await api.loadDirectTrace(false));await historySettle();assert.match(b.note(),/which Over time does not list/);};
 await outside();api.clearDirectTrace();assert.equal(b.note(),'','Clear trace ends it');
 // #1252: a field edit keeps the shown trace, so its note stays; Clear and a Load still end it.
 await outside();api.setDirectTraceField({field:'start',value:'-3h'});assert.match(b.note(),/which Over time does not list/,'a field edit keeps the trace and its note');api.setDirectTraceField({field:'start',value:''});
 await outside();b.traceAt(Date.now()-60000);assert.ok(await api.loadDirectTrace(false));assert.equal(b.note(),'','a Load ends it');
 api.destroy();
});
test('#1145 a trace loaded while the reader\'s Over time is loading takes the view to its day',async()=>{
 let b=dayTraceBoard({at:daysBack(2),deferHistory:true});
 b.api.overTime();assert.equal(b.api.snapshot().overTime.loading,true);
 assert.ok(await b.api.loadDirectTrace(false));b.release();await historySettle();
 assert.equal(b.days[b.api.snapshot().overTime.index].key,dayKeyOf(daysBack(2)),'the trace\'s day, not today');assert.ok(b.loaded());assert.equal(b.note(),'');b.api.destroy();
 // A trace cleared again before the history arrives: the reader's own click still opens Over time.
 b=dayTraceBoard({at:daysBack(2),deferHistory:true});
 b.api.overTime();assert.ok(await b.api.loadDirectTrace(false));b.api.clearDirectTrace();b.release();await historySettle();
 assert.equal(b.api.snapshot().overTime.active,true,'the reader asked for Over time');assert.equal(b.api.snapshot().overTime.today,true);b.api.destroy();
});
/* #1145 cycle 3: a history parked for a replacement Load is settled when that Load fails or is cleared.
   The reader's own Over time click still opens; a park that a trace started ends and is never reused. */
test('#1145 a parked history settles when its Load fails or is cleared',async()=>{
 const start=async()=>{const b=dayTraceBoard({at:daysBack(2),deferHistory:true});b.api.overTime();assert.ok(await b.api.loadDirectTrace(false),'A loads during the reader\'s Over time');
  const open=b.holdCalls(),pending=b.api.loadDirectTrace(false);for(let i=0;i<20 && b.calls.length<2;i++)await new Promise(setImmediate);assert.equal(b.calls.length,2,'B is running');
  b.release();await historySettle();assert.equal(b.api.snapshot().overTime.active,false,'the history waits for B');return {b,open,pending};};
 // B fails: #1252 brings A back, so the reader's Over time opens on A's day, as for A's own Load.
 let {b,open,pending}=await start();b.traceAt(null);open();assert.equal(await pending,null,'B is not found');await historySettle();
 assert.equal(b.api.snapshot().overTime.active,true,'the reader\'s Over time opens');assert.ok(b.loaded(),'A is shown again');
 assert.equal(b.days[b.api.snapshot().overTime.index].key,dayKeyOf(daysBack(2)),'on A\'s day');assert.equal(b.loads(),1);b.api.destroy();
 // B is cleared: the same.
 ({b,open,pending}=await start());b.api.clearDirectTrace();await historySettle();
 assert.equal(b.api.snapshot().overTime.active,true,'Clear trace keeps the reader\'s click');assert.equal(b.loads(),1);open();await pending;await historySettle();assert.equal(b.api.snapshot().overTime.active,true);b.api.destroy();
});
test('#1145 a park a trace started ends on Clear trace and is never reused by a later Load',async()=>{
 const b=dayTraceBoard({at:daysBack(2),deferHistory:true});
 assert.ok(await b.api.loadDirectTrace(false),'A starts the history load');
 const open=b.holdCalls(),pending=b.api.loadDirectTrace(false);for(let i=0;i<20 && b.calls.length<2;i++)await new Promise(setImmediate);
 b.release();await historySettle();b.api.clearDirectTrace();open();await pending;await historySettle();
 assert.equal(b.api.snapshot().overTime.active,false,'no trace, no reader click: Live');
 b.traceAt(daysBack(3));assert.ok(await b.api.loadDirectTrace(false),'a later, unrelated Load C');
 assert.equal(b.loads(),2,'C loads the history again, not the old parked one');b.release();await historySettle();
 assert.equal(b.days[b.api.snapshot().overTime.index].key,dayKeyOf(daysBack(3)));assert.ok(b.loaded());b.api.destroy();
});
test('#1145 a parked history waits through a Load that replaces the one it parked for',async()=>{
 const b=dayTraceBoard({at:daysBack(2),deferHistory:true});
 assert.ok(await b.api.loadDirectTrace(false),'A starts the history load');
 const open=b.holdCalls(),first=b.api.loadDirectTrace(false);for(let i=0;i<20 && b.calls.length<2;i++)await new Promise(setImmediate);
 b.release();await historySettle();
 b.traceAt(daysBack(3));const second=b.api.loadDirectTrace(false);for(let i=0;i<20 && b.calls.length<3;i++)await new Promise(setImmediate);assert.equal(b.calls.length,3,'C replaces B');
 open();assert.equal(await first,null,'B was replaced');assert.ok(await second,'C loads');await historySettle();
 assert.equal(b.days[b.api.snapshot().overTime.index].key,dayKeyOf(daysBack(3)),'C gets the parked history');assert.equal(b.loads(),1,'one history load');b.api.destroy();
});
test('#1145 a load a trace started stays Live when the reader clears the trace loaded during the wait',async()=>{
 const b=dayTraceBoard({at:daysBack(2),deferHistory:true});
 assert.ok(await b.api.loadDirectTrace(false),'A starts the history load');b.traceAt(daysBack(1));assert.ok(await b.api.loadDirectTrace(false),'B loads during the wait');
 b.api.clearDirectTrace();b.release();await historySettle();
 assert.equal(b.api.snapshot().overTime.active,false,'the reader never asked for Over time');b.api.destroy();
});
test('#1145 a history that arrives while a replacement Load is running is used once that Load ends',async()=>{
 const b=dayTraceBoard({at:daysBack(2),deferHistory:true});
 assert.ok(await b.api.loadDirectTrace(false));assert.equal(b.loads(),1);
 b.traceAt(daysBack(1));const open=b.holdCalls(),pending=b.api.loadDirectTrace(false);for(let i=0;i<20 && b.calls.length<2;i++)await new Promise(setImmediate);assert.equal(b.calls.length,2);
 b.release();await historySettle();open();assert.ok(await pending);await historySettle();
 assert.equal(b.api.snapshot().overTime.active,true);assert.equal(b.days[b.api.snapshot().overTime.index].key,dayKeyOf(daysBack(1)));assert.ok(b.loaded());
 assert.equal(b.loads(),1,'one history load, not a second sweep');b.api.destroy();
});
test('#1145 a drill-down that brings tickets ends the local Over time and clears a past-day trace',async()=>{
 const profile=JSON.parse(JSON.stringify(require('./fixtures/trace-connection-profile.json'))),at=daysBack(2),detail={page:{sections:[{id:'child',diagram:{nodes:{child:{tickets:['AA-1']}},rows:[['child']]}}]}};
 const tool={name:'get_trace',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string'}},required:['trace_id','from','environment_slug','team_slug','view_mode']}};
 const raw=freeFixture();raw.page.tracking.telemetry.traceConnections={company:profile};raw.page.sections[0].diagram.nodes.b.detail={spec:'remote',section:'child',mode:'link'};
 const options={loadDetail:async()=>detail,telemetry:{historyMode:'window',provider:async()=>({}),history:async()=>({}),directTrace:{describe:async()=>tool,call:async()=>({payload:dayTraceAt(at)})}}};
 const h=harness(raw,{},options),api=h.ctl.liveStatus;mountStatus(h);
 api.setDirectTraceField({field:'environment',value:'prod'});api.setDirectTraceField({field:'input',value:DAY_TRACE_ID});
 assert.ok(await api.loadDirectTrace(false));await historySettle();assert.equal(api.snapshot().overTime.active,true,'the local Over time on the trace\'s day');
 await options.loadDetail({spec:'remote',section:'child'},new AbortController().signal);h.flush();
 assert.equal(!!(api.snapshot().overTime && api.snapshot().overTime.active),false,'#1149: the local Over time ends');
 assert.equal(api.snapshot().trace.direct.exemplar,null,'the past-day trace leaves with it');
 assert.equal(api.snapshot().trace.direct.dayNote,'Cleared trace '+DAY_TRACE_ID.slice(0,12)+' ('+dayLabelOf(at)+'): the view moved to Live.');
 api.destroy();
});
test('#1145 opening a drill-down keeps the loaded trace and its selection',async()=>{
 const detail={sections:[{id:'child',diagram:{nodes:{child:{title:'Child'}},rows:[['child']]}}]};
 const b=dayTraceBoard({at:Date.now()-60000,loadDetail:async()=>detail}),{api,h}=b;
 assert.ok(await api.loadDirectTrace(false));const key=api.snapshot().trace.selected.key;
 await b.renderOptions.loadDetail({spec:'detail'},new AbortController().signal);h.flush();
 assert.ok(b.loaded(),'the trace is still loaded');assert.equal(api.snapshot().trace.selected.key,key,'and still selected');
 assert.equal(api.snapshot().trace.direct.sections.length,2,'the drill-down added a mapping diagram');
 api.destroy();
});
/* #1164: example traces (from the metrics fetch) are listed, but none is the selected request and nothing
   paints on the diagram until the reader picks one; a loaded trace still selects itself. Boards with and
   without Jira. */
/* #1185: a shown trace with an error span whose step mapping is unique focuses the earliest such span,
   as if the reader clicked it (the stepper pauses and jumps to its step). An error span with several
   possible steps is not focused and the summary asks for a pick; one that no step maps is named as
   not on this diagram. A cleared focus does not come back, also after an edit re-render. */
async function failedTrace(edit,renderOptions={}){
 const f=await (await import('./helpers/step-evidence.mjs')).stepFixture(),failed=f.samples['mcu->ingest'].exemplars[0].spans.find(s=>s.error);
 assert.ok(failed,'the fixture trace has an error span');if(edit)edit(f,failed);
 const h=harness(f.spec,{},{telemetry:{},...renderOptions}),api=h.ctl.liveStatus,m=mountStatus(h),jumps=[];
 h.ctl.sections[0].stepper={path:()=>'event',sourceIndex:()=>0,mode:()=>'ambient',pause(){},jumpSource(i,path){jumps.push([i,path]);return true;}};
 h.ctl.telemetry.apply(f.samples);api.setStatusMode('trace');h.flush();
 const pick=async()=>{const t=api.snapshot().trace;await api.chooseTrace({key:t.entries[0].key,traceId:t.entries[0].exemplar.traceId});h.flush();h.flush();};
 await pick();
 const text=n=>[n.textContent || ''].concat(n.children.map(text)).join(' ');
 // The collapsed request line (#1182): the error note must stay visible without opening the card.
 const line=()=>{const el=m.body.querySelector('.dv-trace-request-summary');return el?text(el):'';};
 return {h,api,m,jumps,failed,pick,summary:()=>text(m.body),line};
}
test('#1185 a failed trace focuses its earliest uniquely mapped error span, as a click would',async()=>{
 const t=await failedTrace();
 assert.equal(t.api.snapshot().trace.selected.focus && t.api.snapshot().trace.selected.focus.spanId,t.failed.id,'the error span is focused without a click');
 assert.deepEqual(t.jumps,[[0,'event']],'the stepper jumps to its step, as for a click');
 t.api.clearTraceFocus({context:t.api.snapshot().trace.selected.context});t.h.flush();t.h.flush();
 assert.equal(t.api.snapshot().trace.selected.focus,null,'the reader can clear it, and it does not come back');
 t.api.destroy();
});
test('#1185 an error span that no step maps is not focused and is named as not on this diagram',async()=>{
 const t=await failedTrace((f,failed)=>{failed.service='billing';failed.name='charge card';});
 assert.equal(t.api.snapshot().trace.selected.focus,null,'an unmapped error span is not focused');
 assert.match(t.summary(),/error in billing charge card \(not on this diagram\)/,'the request summary names it');
 assert.match(t.line(),/error in billing charge card \(not on this diagram\)/,'on the collapsed request line');
 t.api.destroy();
});
test('#1185 an error span with several possible steps is not focused; the summary asks for a pick',async()=>{
 const t=await failedTrace(f=>{const d=f.spec.page.sections[0].diagram;d.steps.push({...structuredClone(d.steps[0]),id:'submit2'});d.paths[0].steps.push('submit2');});
 assert.equal(t.api.snapshot().trace.selected.focus,null,'an ambiguous error span is not focused');
 assert.doesNotMatch(t.summary(),/not on this diagram/,'it is on this diagram');
 assert.match(t.summary(),/error in event-ingest POST \/v1\/events: pick a step to focus it/);
 assert.match(t.line(),/error in event-ingest POST \/v1\/events: pick a step to focus it/,'on the collapsed request line');
 t.api.destroy();
});
test('#1185 a cleared automatic focus stays cleared after an edit re-render',async()=>{
 let carried=null;const editor=()=>({...jiraFreeEditor(),rememberTrace(c){carried=c;},takeTrace(){const c=carried;carried=null;return c;}});
 const first=await failedTrace(null,{boardEditor:editor()});
 assert.equal(first.api.snapshot().trace.selected.focus.spanId,first.failed.id);
 first.api.clearTraceFocus({context:first.api.snapshot().trace.selected.context});first.h.flush();first.api.destroy();
 assert.ok(carried && carried.autoFocused,'the re-render carries the automatically focused trace');
 const second=await failedTrace(null,{boardEditor:editor()});
 assert.equal(second.api.snapshot().trace.selected.focus,null,'the same trace is not focused again after the re-render');
 assert.deepEqual(second.jumps,[],'and the stepper does not jump');
 second.api.destroy();
});
test('#1164 example traces are not selected or painted until the reader picks one',async()=>{
 for(const jira of [true,false]){
  const f=await (await import('./helpers/step-evidence.mjs')).stepFixture(),d=f.spec.page.sections[0].diagram;
  if(!jira){delete f.spec.page.tracking.jira;d.edges.forEach(e=>delete e.tickets);Object.values(d.nodes).forEach(n=>delete n.tickets);}
  const h=harness(f.spec,{},{telemetry:{}}),api=h.ctl.liveStatus,m=mountStatus(h),painted=()=>h.view.querySelectorAll('.dv-trace-overlay,[data-trace-tone]').length;
  h.ctl.sections[0].stepper={path:()=>'short',sourceIndex:()=>0,mode:()=>'ambient',pause(){},jumpSource(){return true;}};
  h.ctl.telemetry.apply(f.samples);api.setStatusMode('trace');h.flush();
  let t=api.snapshot().trace;assert.ok(t.entries.length,(jira?'Jira':'Jira-free')+': example traces are listed');
  assert.equal(t.selected,null,'none is selected without a reader click');assert.equal(m.body.querySelector('.dv-trace-selected'),null);
  assert.equal(painted(),0,'nothing is painted on the diagram');
  assert.ok(m.body.querySelector('.dv-trace-candidates'),'the list is shown');
  await api.chooseTrace({key:t.entries[0].key,traceId:t.entries[0].exemplar.traceId});h.flush();
  t=api.snapshot().trace;assert.equal(t.selected && t.selected.key,t.entries[0].key,'picking one selects it');assert.ok(m.body.querySelector('.dv-trace-selected'));
  assert.ok(painted()>0,'and paints it');
  api.destroy();
 }
});
/* #1177 Map span to step (Edit mode, desktop). An editor stand-in records mapSpan calls and carries the
   Trace view across a re-render the way board-edit.js does. */
function mapEditor(){
 let carried=null,mapped=null;const calls=[];
 return {calls,undone:0,setMapped(v){mapped=v;},
  state(){return {editable:true,blocked:'',active:true,pending:calls.length,saving:false,readOnly:false,notice:null,mapped};},
  onChange:()=>()=>{},rememberMap(){},lastMap:()=>null,question:()=>null,endQuestion(){},removable:()=>[],missingWork:()=>null,start(){},
  rememberTrace(v){carried=v;},takeTrace(){const v=carried;carried=null;return v;},
  mapSpan(ref,match,previous){calls.push(plain({ref,match,previous:previous===undefined?null:previous}));return true;},undoMap(){this.undone++;return true;}};
}
const runTimers=h=>{for(let i=0;i<5 && h.timers.size;i++){const due=[...h.timers];h.timers.clear();due.forEach(([,t])=>t.fn());}};
const MAP_ID='8413cd87a9f15b6bfe8e1acf5b3346d0',MAP_SPAN='dcce084f04baa9e1',MAP_MATCH={serviceName:'currency',operation:'grpc.msdemo.CurrencyService/GetSupportedCurrencies'};
function mapBoard({editor=mapEditor(),twoOnB=false,alternatives=false,otherSection=false}={}){
 const profile=JSON.parse(JSON.stringify(require('./fixtures/trace-connection-profile.json'))),recorded=fs.readFileSync('tests/fixtures/provider-traces/honeycomb-trace.txt','utf8');
 const tool={name:'get_trace',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string'}},required:['trace_id','from','environment_slug','team_slug','view_mode']}};
 const raw=overFixture();raw.page.tracking.telemetry={traceConnections:{company:profile}};const d=raw.page.sections[0].diagram;
 d.steps[0].text='Hop to beta';d.steps[1].text='Show beta';if(twoOnB)d.steps.push({id:'beta-again',text:'Show beta again',nodes:['b'],traceMatch:alternatives?[{serviceName:'x',operation:'y'},{serviceName:'x',operation:'z'}]:{serviceName:'x',operation:'y'}},{id:'beta-third',text:'Beta third',nodes:['b']});
 if(otherSection)raw.page.sections.push({id:'other',diagram:{nodes:{z:{title:'Zed'}},rows:[['z']],steps:[{id:'zz',text:'Zed step',nodes:['z']}]}});
 const h=harness(raw,{},{boardEditor:editor,telemetry:{provider:()=>Promise.resolve({}),directTrace:{describe:async()=>tool,call:async()=>({payload:recorded})}}}),api=h.ctl.liveStatus,m=mountStatus(h);
 h.ctl.sections[0].stepper={path:()=>h.C.diagramPathList(h.ctl.page.sections[0].diagram)[0].id,sourceIndex:()=>0,mode:()=>'ambient',pause(){},jumpSource(){return true;}};
 api.apply(overToday());api.setStatusMode('trace');api.setDirectTraceField({field:'environment',value:'prod'});api.setDirectTraceField({field:'input',value:MAP_ID});
 if(otherSection)api.setDirectTraceField({field:'section',value:api.snapshot().trace.direct.sections[0].id});
 return {h,api,m,editor,raw,focus:async()=>{assert.ok(await api.loadDirectTrace(false));const s=api.snapshot().trace.selected;assert.equal(api.selectTraceSpan({context:s.context,spanId:MAP_SPAN}),true);return api.snapshot().trace.selected;}};
}
const spanDrop=(h,target,context)=>{const data={'application/x-flowview-span':JSON.stringify({context,spanId:MAP_SPAN})};
 for(const type of ['dragover','drop'])h.view.dispatchEvent({type,target,dataTransfer:{types:Object.keys(data),getData:t=>data[t]||'',dropEffect:''},preventDefault(){}});};
test('#1177 the dropdown preselects nothing and the button names the chosen step',async()=>{
 const b=mapBoard();await b.focus();
 const pick=b.m.body.querySelector('select.dv-trace-map-select'),apply=b.m.body.querySelector('button.dv-trace-map-apply');assert.ok(pick && apply);
 assert.equal(pick.getAttribute('aria-label'),'Step to map');assert.equal(pick.value,'','nothing is preselected');
 assert.equal(apply.disabled,true,'the button waits for a choice');assert.equal(apply.textContent,'Map to step');
 pick.value='beta';pick.dispatchEvent({type:'change'});
 assert.equal(apply.disabled,false);assert.equal(apply.textContent,'Map to step: Show beta','the button names the step');
 apply.dispatchEvent({type:'click',preventDefault(){},stopPropagation(){}});runTimers(b.h);
 assert.deepEqual(b.editor.calls,[{ref:{section:0,kind:'step',id:'beta'},match:MAP_MATCH,previous:null}]);
 b.api.destroy();
});
test('#1177 dragging a span onto a step or a carrier maps it; two candidate steps ask; Esc cancels',async()=>{
 let b=mapBoard();let s=await b.focus();
 const row=b.m.body.querySelector('.dv-trace-span[data-span-id="'+MAP_SPAN+'"]');assert.equal(row.getAttribute('draggable'),'true','Edit mode makes span rows draggable');
 spanDrop(b.h,b.h.view.querySelector('button.schip[data-step-source="0"]'),s.context);runTimers(b.h);
 assert.deepEqual(b.editor.calls.at(-1),{ref:{section:0,kind:'step',id:'hop'},match:MAP_MATCH,previous:null},'a step chip maps that step');
 spanDrop(b.h,b.h.view.querySelector('g.node[data-dv-node="b"]'),s.context);runTimers(b.h);
 assert.deepEqual(b.editor.calls.at(-1).ref,{section:0,kind:'step',id:'beta'},'a node with one unmapped step maps it');
 b.api.destroy();
 b=mapBoard({twoOnB:true});s=await b.focus();
 spanDrop(b.h,b.h.view.querySelector('g.node[data-dv-node="b"]'),s.context);runTimers(b.h);
 assert.equal(b.editor.calls.length,0,'two candidate steps: nothing yet');
 const chooser=b.m.body.querySelector('.dv-trace-map-chooser');assert.ok(chooser,'a chooser appears');
 assert.deepEqual(chooser.querySelectorAll('button.dv-trace-map-choice').map(x=>x.textContent),['Show beta','Show beta again · mapped, replaces','Beta third']);
 chooser.dispatchEvent({type:'keydown',key:'Escape',preventDefault(){},stopPropagation(){}});
 assert.equal(b.m.body.querySelector('.dv-trace-map-chooser'),null,'Esc cancels');assert.equal(b.editor.calls.length,0);
 spanDrop(b.h,b.h.view.querySelector('g.node[data-dv-node="b"]'),s.context);runTimers(b.h);
 b.m.body.querySelectorAll('button.dv-trace-map-choice')[1].dispatchEvent({type:'click',preventDefault(){},stopPropagation(){}});runTimers(b.h);
 assert.deepEqual(b.editor.calls.at(-1),{ref:{section:0,kind:'step',id:'beta-again'},match:{...MAP_MATCH,nodeId:'b'},previous:{serviceName:'x',operation:'y'}},'picking a mapped step replaces the traceMatch it shows (with nodeId b: dropped on node b, which the step names alone)');
 b.api.destroy();
 // Outside Edit mode a span row does not drag.
 const editor=mapEditor();editor.state=()=>({editable:true,blocked:'',active:false,pending:0,saving:false,readOnly:false,notice:null,mapped:null});
 b=mapBoard({editor});await b.focus();assert.notEqual(b.m.body.querySelector('.dv-trace-span[data-span-id="'+MAP_SPAN+'"]').getAttribute('draggable'),'true');b.api.destroy();
});
test('#1177 the latest mapping shows a note with Undo',async()=>{
 const b=mapBoard();await b.focus();b.editor.setMapped({step:'beta',label:'Show beta',traceMatch:MAP_MATCH});b.api.setTraceShow(true);
 const note=b.m.body.querySelector('.dv-trace-map-note');assert.ok(note,'the result note');
 assert.equal(note.querySelector('.dv-trace-map-note-text').textContent,'Mapped currency · grpc.msdemo.CurrencyService/GetSupportedCurrencies to step Show beta.');
 const undo=note.querySelector('button.dv-trace-map-undo');assert.equal(undo.textContent,'Undo');undo.dispatchEvent({type:'click',preventDefault(){},stopPropagation(){}});runTimers(b.h);
 assert.equal(b.editor.undone,1);b.api.destroy();
});
test('#1177 an Edit-mode re-render keeps the loaded trace, the picked example, the selected span and the focus',async()=>{
 // Loaded trace: the next controller shows it focused on the same span.
 const editor=mapEditor();let b=mapBoard({editor});await b.focus();b.api.destroy();
 b=mapBoard({editor});b.h.flush();let s=b.api.snapshot().trace.selected;
 assert.ok(s && s.manual,'the loaded trace stays');assert.equal(s.focus && s.focus.spanId,MAP_SPAN,'and its focused span');
 b.api.destroy();editor.takeTrace();
 // Picked example trace: the next controller has no Metrics data yet and still shows the reader's pick.
 const f=await (await import('./helpers/step-evidence.mjs')).stepFixture(),open=()=>{const h=harness(f.spec,{},{telemetry:{},boardEditor:editor}),m=mountStatus(h);
  h.ctl.sections[0].stepper={path:()=>'short',sourceIndex:()=>0,mode:()=>'ambient',pause(){},jumpSource(){return true;}};return {h,m,api:h.ctl.liveStatus};};
 let x=open();x.h.ctl.telemetry.apply(f.samples);x.api.setStatusMode('trace');
 const entry=x.api.snapshot().trace.entries[0];await x.api.chooseTrace({key:entry.key,traceId:entry.exemplar.traceId});
 s=x.api.snapshot().trace.selected;const spanId=s.exemplar.spans[0].id;assert.equal(x.api.selectTraceSpan({context:s.context,spanId}),true);x.api.destroy();
 x=open();x.h.flush();s=x.api.snapshot().trace.selected;
 assert.ok(s,'the picked example stays selected');assert.equal(s.manual,false);assert.equal(s.carrier,entry.carrier);assert.equal(s.exemplar.traceId,entry.exemplar.traceId);
 assert.equal(s.focus && s.focus.spanId,spanId,'its focused span stays');assert.ok(x.m.body.querySelector('.dv-trace-selected'));
 assert.ok(x.h.view.querySelectorAll('.dv-trace-overlay,[data-trace-tone]').length>0,'the mapped carriers light up again');
 // #1180 m1: live evidence for the same carrier replaces the carried entry; the pick and focus stay when its trace is the same.
 x.h.ctl.telemetry.apply(f.samples);s=x.api.snapshot().trace.selected;
 assert.equal(plain(x.api.snapshot().trace.entries.filter(e=>e.carrier===entry.carrier)).length,1,'never the stale carried entry beside the fresh one');
 assert.ok(s && !s.key.startsWith('carried/'),'the live entry is selected');assert.equal(s.exemplar.traceId,entry.exemplar.traceId);assert.equal(s.focus && s.focus.spanId,spanId,'the focus stays');
 x.api.destroy();editor.takeTrace();
 x=open();x.h.ctl.telemetry.apply(f.samples);x.api.setStatusMode('trace');await x.api.chooseTrace({key:entry.key,traceId:entry.exemplar.traceId});x.api.destroy();
 x=open();x.h.flush();assert.ok(x.api.snapshot().trace.selected);
 const fresh=structuredClone(f.samples),other=fresh[entry.carrier].exemplars[0].candidates.find(c=>c.traceId!==entry.exemplar.traceId);fresh[entry.carrier].exemplars[0].traceId=other.traceId;
 x.h.ctl.telemetry.apply(fresh);s=x.api.snapshot().trace.selected;
 assert.ok(s && s.exemplar.traceId===entry.exemplar.traceId,'#1180 c2: a different live trace keeps the reader\'s carried pick');
 assert.equal(plain(x.api.snapshot().trace.entries.filter(e=>e.carrier===entry.carrier)).length,2,'the live entry is listed beside it');
 x.api.destroy();editor.takeTrace();
 // #1180 MAJOR 1: with a loaded trace and a picked example, the reader's pick wins after the re-render.
 const withDirect=structuredClone(f.spec);withDirect.page.tracking.telemetry.traceConnections={company:JSON.parse(JSON.stringify(require('./fixtures/trace-connection-profile.json')))};
 const recorded=fs.readFileSync('tests/fixtures/provider-traces/honeycomb-trace.txt','utf8'),tool={name:'get_trace',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string'}},required:['trace_id','from','environment_slug','team_slug','view_mode']}};
 const both=()=>{const h=harness(withDirect,{},{telemetry:{directTrace:{describe:async()=>tool,call:async()=>({payload:recorded})}},boardEditor:editor}),m=mountStatus(h);
  h.ctl.sections[0].stepper={path:()=>'short',sourceIndex:()=>0,mode:()=>'ambient',pause(){},jumpSource(){return true;}};return {h,m,api:h.ctl.liveStatus};};
 x=both();x.h.ctl.telemetry.apply(f.samples);x.api.setStatusMode('trace');x.api.setDirectTraceField({field:'environment',value:'prod'});x.api.setDirectTraceField({field:'input',value:MAP_ID});
 assert.ok(await x.api.loadDirectTrace(false));const example=x.api.snapshot().trace.entries.find(e=>!e.key.startsWith('direct/'));
 await x.api.chooseTrace({key:example.key,traceId:example.exemplar.traceId});s=x.api.snapshot().trace.selected;assert.equal(s.manual,false);
 assert.equal(x.api.selectTraceSpan({context:s.context,spanId:s.exemplar.spans[0].id}),true);x.api.destroy();
 x=both();x.h.flush();s=x.api.snapshot().trace.selected;
 assert.ok(s && !s.manual,'the picked example, not the loaded trace');assert.equal(s.carrier,example.carrier);assert.equal(s.focus && s.focus.spanId,example.exemplar.spans[0].id);
 assert.ok(x.api.snapshot().trace.direct.exemplar,'the loaded trace stays loaded too');
 x.api.destroy();
});
test('#1180 the chooser names the span, refocuses on each drop, returns focus, and cannot replace alternatives',async()=>{
 const b=mapBoard({twoOnB:true,alternatives:true});const s=await b.focus(),node=b.h.view.querySelector('g.node[data-dv-node="b"]');
 spanDrop(b.h,node,s.context);runTimers(b.h);
 const chooser=b.m.body.querySelector('.dv-trace-map-chooser');
 assert.equal(chooser.querySelector('.dv-trace-map-prompt').textContent,'Map currency · grpc.msdemo.CurrencyService/GetSupportedCurrencies to which step of Beta?','it names the dragged span');
 const choices=chooser.querySelectorAll('button.dv-trace-map-choice');
 assert.deepEqual(choices.map(x=>[x.textContent,!!x.disabled]),[['Show beta',false],['Show beta again · has alternatives; edit in Inspect',true],['Beta third',false]]);
 let focused=0;choices[0].focus=()=>{focused++;};spanDrop(b.h,node,s.context);runTimers(b.h);assert.equal(focused,1,'a second drop moves focus to the chooser again');
 const row=b.m.body.querySelector('.dv-trace-span[data-span-id="'+MAP_SPAN+'"]');let back=0;row.focus=()=>{back++;};
 chooser.dispatchEvent({type:'keydown',key:'Escape',preventDefault(){},stopPropagation(){}});assert.equal(back,1,'Esc returns focus to the dragged row');
 assert.equal(b.api.mapTraceSpan({context:s.context,spanId:MAP_SPAN,stepId:'beta-again',replace:true}),false,'alternatives are never replaced');
 b.api.destroy();
});
test('#1180 a step or carrier in another section gets no highlight and no drop; the step highlight holds over its children',async()=>{
 const b=mapBoard({otherSection:true});const s=await b.focus(),other=b.h.ctl.sections[1].sectionEl;
 const zed=other.querySelector('g.node[data-dv-node="z"]'),zchip=other.querySelector('button.schip[data-step-source="0"]');assert.ok(zed && zchip);
 const data={'application/x-flowview-span':'{}'},drag={types:Object.keys(data),getData:t=>data[t]||'',dropEffect:''};
 for(const target of [zed,zchip]){
  let allowed=false;b.h.view.dispatchEvent({type:'dragover',target,dataTransfer:drag,preventDefault(){allowed=true;}});
  assert.equal(target.classList.contains('dv-edit-over'),false,'no highlight in another section');assert.equal(allowed,false,'and no drop allowed');
  spanDrop(b.h,target,s.context);runTimers(b.h);
 }
 assert.equal(b.editor.calls.length,0,'nothing maps in another section');assert.equal(b.m.body.querySelector('.dv-trace-map-chooser'),null);
 const chip=b.h.view.querySelector('button.schip[data-step-source="1"]');
 b.h.view.dispatchEvent({type:'dragover',target:chip,dataTransfer:drag,preventDefault(){}});assert.ok(chip.classList.contains('dv-edit-over'),'the step button highlights');
 b.h.view.dispatchEvent({type:'dragleave',target:chip,relatedTarget:chip,dataTransfer:drag});assert.ok(chip.classList.contains('dv-edit-over'),'moving within it keeps the highlight');
 b.api.destroy();
});
/* #1180 c2: through the claude.ai traces adapter (telemetry-traces.js, standalone bundle): the re-render
   re-attaches the adapter, which invalidates its entries and loads the default candidate again under a new
   token. A reader's pick of another candidate stays selected with its focus; the live entry is listed beside it. */
test('#1180 through the claude traces adapter, a re-attach with another default keeps the reader\'s pick',async()=>{
 const {createMockBridge}=await import('./helpers/honeycomb-bridge.mjs'),bridge=createMockBridge({day:9}),settle=async()=>{for(let i=0;i<30;i++)await new Promise(setImmediate);};
 const S={URL,AbortController,TextDecoder,TextEncoder,console,setTimeout,clearTimeout};vm.runInNewContext(entrypoint('standalone').body,S);
 const raw={page:{tracking:{telemetry:{honeycomb:{environment:'flowview-demo',dataset:'doorbell'}}},sections:[{id:'main',diagram:{nodes:{a:{title:'Ingest',telemetry:{kind:'service',signals:{trace:{honeycomb:{query_spec:{filters:[{column:'service.name',op:'=',value:'event-ingest'}]},raw_row_columns:['trace.trace_id','timestamp','error'],results_limit:20}}}}}},rows:[['a']],
  steps:[{id:'s',text:'Ingest step',nodes:['a']}],panels:[{id:'status',type:'live-status',title:'Status'}]}}]}};
 const win={claude:{use:async name=>name==='permissions'?{request:async names=>Object.fromEntries(names.map(n=>[n,'granted']))}:bridge}};
 const adapter=S.createTelemetryTraces(S.normalize(raw),win,()=>Date.parse('2026-10-30T00:00:00Z'));assert.ok(adapter,'the adapter attaches to this board');
 const editor=mapEditor(),open=async()=>{const h=harness(raw,{},{telemetry:adapter.options,boardEditor:editor}),m=mountStatus(h),api=h.ctl.liveStatus;
  h.ctl.sections[0].stepper={path:()=>h.C.diagramPathList(h.ctl.page.sections[0].diagram)[0].id,sourceIndex:()=>0,mode:()=>'ambient',pause(){},jumpSource(){return true;}};
  const handle=adapter.attach({telemetry:h.ctl.telemetry,liveStatus:api},h.ctl.page);await settle();return {h,m,api,handle};};
 let x=await open();x.api.setStatusMode('trace');x.h.ctl.telemetry.setEnabled(true);for(let i=0;i<4;i++){x.h.flush();await settle();}
 const entry=x.api.snapshot().trace.entries[0];assert.ok(entry,'the adapter returned an example trace');
 const other=entry.candidates.find(c=>c.traceId!==entry.exemplar.traceId && c.available);assert.ok(other,'a returned candidate other than the default');
 await x.api.chooseTrace({key:entry.key,traceId:other.traceId});await settle();let s=x.api.snapshot().trace.selected;assert.equal(s && s.exemplar.traceId,other.traceId,'the reader picked another candidate');
 const spanId=s.exemplar.spans[0].id;assert.equal(x.api.selectTraceSpan({context:s.context,spanId}),true);x.handle.destroy();x.api.destroy();
 x=await open();x.h.flush();x.h.ctl.telemetry.setEnabled(true);for(let i=0;i<4;i++){x.h.flush();await settle();}
 const live=x.api.snapshot().trace.entries.filter(e=>!e.key.startsWith('carried/'));assert.ok(live.length,'the re-attached adapter loaded its default again');
 assert.notEqual(live[0].exemplar.traceId,other.traceId,'its default is not the reader\'s pick');
 s=x.api.snapshot().trace.selected;assert.ok(s,'the pick survives the new default');assert.equal(s.exemplar.traceId,other.traceId);assert.equal(s.focus && s.focus.spanId,spanId,'and its focus');
 x.handle.destroy();x.api.destroy();
});
test('#1180 c2 an open chooser survives the carried pick moving to live evidence; an alternatives step takes no drop',async()=>{
 const f=await (await import('./helpers/step-evidence.mjs')).stepFixture(),editor=mapEditor();
 const open=()=>{const h=harness(f.spec,{},{telemetry:{},boardEditor:editor}),m=mountStatus(h);h.ctl.sections[0].stepper={path:()=>'short',sourceIndex:()=>0,mode:()=>'ambient',pause(){},jumpSource(){return true;}};return {h,m,api:h.ctl.liveStatus};};
 let x=open();x.h.ctl.telemetry.apply(f.samples);x.api.setStatusMode('trace');const entry=x.api.snapshot().trace.entries[0];
 await x.api.chooseTrace({key:entry.key,traceId:entry.exemplar.traceId});const span=x.api.snapshot().trace.selected.exemplar.spans.find(sp=>sp.service && sp.name);x.api.destroy();
 x=open();x.h.flush();let s=x.api.snapshot().trace.selected;assert.ok(s && s.key.startsWith('carried/'));
 // Edge mcu->ingest is named by one mapped step (submit), so a drop there asks.
 const data={'application/x-flowview-span':JSON.stringify({context:s.context,spanId:span.id})},drag={types:Object.keys(data),getData:t=>data[t]||'',dropEffect:''};
 x.h.view.dispatchEvent({type:'drop',target:x.h.view.querySelector('path.edge[data-dv-edge="0"]'),dataTransfer:drag,preventDefault(){}});runTimers(x.h);
 assert.ok(x.api.snapshot().trace.mapChooser,'a chooser is open on the carried pick');
 x.h.ctl.telemetry.apply(f.samples);assert.ok(!x.api.snapshot().trace.selected.key.startsWith('carried/'),'the pick moved to the live entry');
 assert.ok(x.api.snapshot().trace.mapChooser,'the chooser stays open');
 assert.equal(x.api.chooseTraceMapStep({stepId:'submit'}),true,'and still maps');runTimers(x.h);assert.equal(editor.calls.at(-1).ref.id,'submit');
 x.api.destroy();
 // A step whose traceMatch is an alternatives array: its button gets no highlight and no drop, and says why.
 const b=mapBoard({twoOnB:true,alternatives:true}),fs2=await b.focus(),chip=b.h.view.querySelector('button.schip[data-step-source="2"]');
 const altData={'application/x-flowview-span':JSON.stringify({context:fs2.context,spanId:MAP_SPAN})},altDrag={types:Object.keys(altData),getData:t=>altData[t]||'',dropEffect:''};let allowed=false;
 b.h.view.dispatchEvent({type:'dragover',target:chip,dataTransfer:altDrag,preventDefault(){allowed=true;}});
 assert.equal(allowed,false);assert.equal(chip.classList.contains('dv-edit-over'),false);assert.equal(chip.getAttribute('title'),'Has alternatives; edit in Inspect');
 b.api.destroy();
});
test('#1180 c2 after a pick the dragged span row gets focus back; a mapping its kept fields exclude says nothing lights',async()=>{
 const editor=mapEditor();let b=mapBoard({editor,twoOnB:true});const s=await b.focus();
 spanDrop(b.h,b.h.view.querySelector('g.node[data-dv-node="b"]'),s.context);runTimers(b.h);
 b.m.body.querySelectorAll('button.dv-trace-map-choice')[0].dispatchEvent({type:'click',preventDefault(){},stopPropagation(){}});runTimers(b.h);b.api.destroy();
 b=mapBoard({editor,twoOnB:true});const row=b.m.body.querySelector('.dv-trace-span[data-span-id="'+MAP_SPAN+'"]');let focused=0;if(row)row.focus=()=>{focused++;};b.h.flush();
 assert.equal(focused,1,'the dragged row has focus after the re-render');b.api.destroy();editor.takeTrace();
 // The step keeps attributes that exclude the span: the note says so.
 const e2=mapEditor(),d=mapBoard({editor:e2});d.h.ctl.page.sections[0].diagram.steps[1].traceMatch={...MAP_MATCH,attributes:{'http.route':'/not-this-span'}};await d.focus();e2.setMapped({step:'beta',label:'Show beta',traceMatch:MAP_MATCH});d.api.setTraceShow(true);
 assert.equal(d.m.body.querySelector('.dv-trace-map-note-text').textContent,'Mapped currency · grpc.msdemo.CurrencyService/GetSupportedCurrencies to step Show beta; this step\'s parent, attributes, namespace or occurrence do not match this span, so nothing lights.');
 d.api.destroy();
});
/* #1173 (epic #1130, Chuck 2026-11-09): the compact Trace view. One-choice selects are not rendered as selects (their value
   still applies), the help line moves to the Load trace summary's title, Show on diagram waits for a shown trace, and with a
   trace shown the search section and the request card are each one collapsed line, so the span list comes right after them.
   Rejects: a select with a single option; a help paragraph in the form; Show on diagram before any trace; a shown trace
   whose search form or request details push the waterfall down. */
const compactTool=()=>({name:'get_trace',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string'}},required:['trace_id','from','environment_slug','team_slug','view_mode']}});
const COMPACT_ID='8413cd87a9f15b6bfe8e1acf5b3346d0';
function compactBoard(envs=['prod']){
 const profile=JSON.parse(JSON.stringify(require('./fixtures/trace-connection-profile.json')));
 profile.environments=Object.fromEntries(Object.entries(profile.environments).filter(([id])=>envs.includes(id)));
 return {page:{tracking:{telemetry:{grafana:{loki:'logs'},lookups:{camera:{label:'Camera model',query:'{app="cams"} | cameraModel="$value"'}},traceConnections:{company:profile}}},sections:[{id:'main',diagram:{
  nodes:{web:{title:'Checkout frontend'},checkout:{title:'Checkout service'},cart:{title:'Cart service'},payment:{title:'Payment service'}},rows:[['web','checkout','payment'],['cart']],
  edges:[{from:'web',to:'checkout',label:'PlaceOrder'},{from:'checkout',to:'cart',label:'GetCart'},{from:'checkout',to:'payment',label:'Charge'}],
  steps:[{id:'accept',nodes:['web'],traceMatch:{serviceName:'frontend',operation:'/cart/checkout',nodeId:'web'}},{id:'place',edge:'web->checkout',traceMatch:{serviceName:'checkout',operation:'msdemo.CheckoutService/PlaceOrder'}},{id:'charge',edge:'checkout->payment',traceMatch:{serviceName:'payment',operation:'grpc.msdemo.PaymentService/Charge'}}],
  panels:[{id:'status',type:'live-status',title:'Status'}]}}]}};
}
function compactHarness(envs,edit){
 const recorded=(edit || (t=>t))(fs.readFileSync('tests/fixtures/provider-traces/honeycomb-trace.txt','utf8')),calls=[];
 const h=harness(compactBoard(envs),{},{telemetry:{provider:()=>Promise.resolve({}),directTrace:{describe:async()=>compactTool(),call:async(request,args)=>{calls.push(args);return {payload:recorded};},logsConnector:async()=>'Grafana',queryLogs:async()=>({data:[]})}}});
 return {h,api:h.ctl.liveStatus,m:mountStatus(h),calls};
}
test('#1173 one-choice selects are not rendered, the help line moves to the summary title, Show on diagram waits for a trace',async()=>{
 const {h,api,m,calls}=compactHarness(['prod']);
 assert.equal(api.snapshot().mode,'trace');
 const selects=()=>m.body.querySelectorAll('select').map(el=>el.getAttribute('aria-label'));
 for(const name of ['Trace connection','Connection environment','Mapping diagram','Log lookup'])assert.ok(!selects().includes(name),'no one-choice select named '+name+': '+selects());
 const config=m.body.querySelector('details.dv-trace-config'),summary=config.querySelector('summary');
 assert.ok(!textOf(config).includes('Load one exact request.'),'the help line is not in the form');
 assert.match(summary.getAttribute('title') || '',/^Load one exact request\. This session only; diagram mappings use authored traceMatch steps\.$/,'its text is the summary title');
 assert.match(textOf(summary),/Fixture Honeycomb · Production/,'the one-choice connection and environment are named in the summary');
 const show=()=>m.body.querySelector('button.dv-trace-show');assert.ok(!show() || show().hidden,'no Show on diagram before a trace is shown');
 // The sole choices still apply: Load sends the same request as with the selects.
 api.setDirectTraceField({field:'input',value:COMPACT_ID});assert.ok(await api.loadDirectTrace(false),'the trace loads');
 assert.deepEqual(plain(calls.at(-1)),{trace_id:COMPACT_ID,from:'-2h',environment_slug:'production',team_slug:'example-team',view_mode:'full'});
 h.flush();assert.equal(show().hidden,false,'Show on diagram after a Load');assert.ok(!show().disabled);
 api.destroy();
 // Two options still render a select.
 const two=compactHarness(['prod','stage']);assert.ok(two.m.body.querySelectorAll('select').some(el=>el.getAttribute('aria-label')==='Connection environment'),'two environments keep the select');two.api.destroy();
});
// #1230 (Chuck 2026-11-09): the shown trace goes in a reserved space above the search, and the search stays open.
test('#1173 #1230 with a trace shown the request card is one collapsed line above the open search, and the span list follows it',async()=>{
 const {h,api,m}=compactHarness(['prod']),config=()=>m.body.querySelector('details.dv-trace-config'),request=()=>m.body.querySelector('details.dv-trace-request');
 assert.equal(config().open,true,'with no trace shown the search section is open');assert.equal(request(),null,'no request card yet');
 const slot=()=>m.body.querySelector('.dv-trace-slot');assert.ok(slot(),'the reserved space');assert.equal(textOf(slot()).trim(),'Load a trace to show it here');
 api.setDirectTraceField({field:'input',value:COMPACT_ID});const loading=api.loadDirectTrace(false);h.flush();
 assert.equal(textOf(slot()).trim(),'Loading trace…','while the Load runs the reserved space says so');await loading;h.flush();
 assert.equal(config().open,true,'the search section stays open');assert.ok(slot().querySelector('.dv-trace-selected'),'the trace is in the reserved space');
 assert.match(textOf(config().querySelector('summary')).replace(/\s+/g,' ').trim(),/^Fixture Honeycomb · Production · Change trace$/);
 assert.ok(request(),'one request card');assert.equal(request().open,false,'collapsed');
 assert.match(textOf(request().querySelector('summary')).replace(/\s+/g,' ').trim(),/^8413cd87a9f1 · partial · [^·]+ \d\d:\d\d · \d+ spans · \d+\/\d+ steps matched$/,'a partial trace says so first (#1186: flags before the date)');
 assert.ok(request().querySelector('.dv-trace-identity'),'expanding shows today\'s details');assert.equal(request().querySelector('.dv-trace-identity').textContent,COMPACT_ID);
 const closed=el=>{for(let n=el.parentElement;n;n=n.parentElement)if(n.tagName==='details' && !n.open && !el.closest('summary'))return true;return false;};
 const span=m.body.querySelector('.dv-trace-span');assert.ok(span && !closed(span),'the span list is not inside a collapsed section');
 const order=m.body.querySelectorAll('details.dv-trace-config,details.dv-trace-request,.dv-trace-spans-head,.dv-trace-waterfall').map(el=>el.className.split(' ')[0]);
 // #1186: the list header replaced the focus box.
 assert.deepEqual(order,['dv-trace-request','dv-trace-spans-head','dv-trace-waterfall','dv-trace-config'],'the waterfall comes right after the collapsed card line and its header; the search follows');
 assert.equal(request().children[0].tagName,'summary','the collapsed card shows only its summary line');
 // A section the reader expanded stays expanded across repaints; a search the reader collapsed stays collapsed.
 request().open=true;config().open=false;config().dispatchEvent({type:'toggle'});api.setTraceShow(false);api.setTraceShow(true);h.flush();
 assert.equal(request().open,true);assert.equal(config().open,false);
 api.clearDirectTrace();h.flush();assert.equal(config().open,true,'with nothing shown again the search reopens');assert.equal(request(),null);
 api.destroy();
});
/* #1175: a step whose traceMatch is optional and that this trace lacks does not count against
   the coverage line; the line adds "· K optional not in this trace". A local board and a drill-down. */
test('#1175 the coverage line leaves out a missing optional step and counts it as optional not in this trace',async()=>{
 for(const optional of [false,true]){
  const f=await (await import('./helpers/step-evidence.mjs')).stepFixture(),d=f.spec.page.sections[0].diagram;
  if(optional)d.steps.find(s=>s.id==='push').traceMatch.optional=true;
  const h=harness(f.spec,{},{telemetry:{}}),api=h.ctl.liveStatus,m=mountStatus(h);
  h.ctl.sections[0].stepper={path:()=>'event',sourceIndex:()=>0,mode:()=>'ambient',pause(){},jumpSource(){return true;}};
  h.ctl.telemetry.apply(f.samples);api.setStatusMode('trace');h.flush();
  const entry=api.snapshot().trace.entries[0];await api.chooseTrace({key:entry.key,traceId:entry.exemplar.traceId});h.flush();
  // The event path: submit matched, publish and push missing, unbound has no traceMatch.
  assert.equal(m.body.querySelector('.dv-trace-coverage').textContent,optional?'1/2 steps matched · 1 optional not in this trace · 1 step without a trace mapping · 0 spans unmatched':'1/3 steps matched · 1 step without a trace mapping · 0 spans unmatched');
  const text=el=>el.children.map(c=>c.textContent || '').join(' | '),row=m.body.querySelectorAll('.dv-trace-mapping').map(text).find(t=>t.startsWith('push notification'));
  assert.equal(row,optional?'push notification | Not observed | Optional, not in this trace.':'push notification | Not observed | Not observed · outcome unknown','the push step is listed among the mappings');
  api.destroy();
 }
});
test('#1175 a drill-down step that is optional and missing reads like a local one',async()=>{
 const profile=JSON.parse(JSON.stringify(require('./fixtures/trace-connection-profile.json'))),recorded=fs.readFileSync('tests/fixtures/provider-traces/honeycomb-trace.txt','utf8'),ID='8413cd87a9f15b6bfe8e1acf5b3346d0';
 const tool={name:'get_trace',annotations:{readOnlyHint:true},inputSchema:{type:'object',properties:{trace_id:{type:'string'},from:{type:'string'},environment_slug:{type:'string'},team_slug:{type:'string'},view_mode:{type:'string'}},required:['trace_id','from','environment_slug','team_slug','view_mode']}};
 const raw={page:{tracking:{telemetry:{traceConnections:{company:profile}}},sections:[{id:'main',diagram:{nodes:{domain:{title:'Domain',detail:{spec:'remote',section:'child',mode:'link'}}},rows:[['domain']]}}]}};
 const remote={page:{sections:[{id:'child',diagram:{nodes:{checkout:{title:'Checkout'}},rows:[['checkout']],steps:[
  {id:'cart',nodes:['checkout'],text:'Check out the cart',traceMatch:{serviceName:'frontend',operation:'/cart/checkout',nodeId:'checkout'}},
  {id:'refund',nodes:['checkout'],text:'Refund the order',traceMatch:{serviceName:'refund',operation:'POST /refund',nodeId:'checkout',optional:true}}]}}]}};
 const options={loadDetail:async()=>remote,telemetry:{provider:()=>Promise.resolve({}),directTrace:{describe:async()=>tool,call:async()=>({payload:recorded})}}};
 const h=harness(raw,{},options),api=h.ctl.liveStatus,m=mountStatus(h);
 await options.loadDetail({spec:'remote',section:'child'},new AbortController().signal);h.flush();api.setStatusMode('trace');
 const child=api.snapshot().trace.direct.sections.find(s=>/ · child$/.test(s.label));assert.ok(child,'the drill-down is a mapping diagram');
 api.setDirectTraceField({field:'section',value:child.id});api.setDirectTraceField({field:'environment',value:'prod'});api.setDirectTraceField({field:'input',value:ID});
 assert.ok(await api.loadDirectTrace(false),'the trace loads against the drill-down diagram');h.flush();
 const selected=api.snapshot().trace.selected;assert.deepEqual(plain(selected.model.rows.map(r=>[r.id,r.status])),[['cart','matched'],['refund','missing']]);
 assert.match(m.body.querySelector('.dv-trace-coverage').textContent,/^1\/1 steps matched · 1 optional not in this trace · \d+ spans unmatched$/);
 const label=h.C.telemetryTraceLabel(selected.model.nodes.checkout);
 assert.equal(label.text,h.C.telemetryTraceDuration(selected.model.rows[0].duration),'the drill-down node reads its matched step\'s time');
 assert.match(label.title,/optional, not in this trace: refund POST \/refund/);
 api.destroy();
});
/* #1180 c3: the carried pick behaves as a live pick on an environment change and on an account change;
   focus returns to the span row only after a mapping (any path), never after Cancel or a refusal; the
   "nothing lights" note only for a missing match and only for fields that filter spans; the alternatives
   title is put back after the drag. */
test('#1180 c3 the carried pick ends on an environment or account change, as a live pick does',async()=>{
 const f=await (await import('./helpers/step-evidence.mjs')).stepFixture(),spec=structuredClone(f.spec);Object.assign(spec.page.tracking.telemetry,{environment:'prd',environments:{prd:{},stg:{}}});
 for(const change of ['environment','account']){
  const editor=mapEditor(),open=()=>{const h=harness(spec,{},{telemetry:{},boardEditor:editor}),m=mountStatus(h);h.ctl.sections[0].stepper={path:()=>'short',sourceIndex:()=>0,mode:()=>'ambient',pause(){},jumpSource(){return true;}};return {h,m,api:h.ctl.liveStatus};};
  let x=open();x.h.ctl.telemetry.apply(f.samples);x.api.setStatusMode('trace');const entry=x.api.snapshot().trace.entries[0];await x.api.chooseTrace({key:entry.key,traceId:entry.exemplar.traceId});x.api.destroy();
  x=open();x.h.flush();assert.ok(x.api.snapshot().trace.selected,change+': precondition, the pick is carried');
  if(change==='environment')x.api.setMetricsEnvironment('stg');else{x.h.ctl.telemetry.clear();x.h.ctl.telemetry.setAvailable(false);}
  const t=x.api.snapshot().trace;assert.equal(t.selected,null,change+': the carried pick ends');assert.equal(t.entries.some(e=>e.key.startsWith('carried/')),false);
  x.api.destroy();
 }
});
test('#1180 c3 focus returns to the span row after a dropdown or drop mapping, never after Cancel',async()=>{
 const editor=mapEditor();let b=mapBoard({editor,twoOnB:true});const s=await b.focus();
 spanDrop(b.h,b.h.view.querySelector('g.node[data-dv-node="b"]'),s.context);runTimers(b.h);
 b.m.body.querySelector('button.dv-trace-map-cancel').dispatchEvent({type:'click',preventDefault(){},stopPropagation(){}});runTimers(b.h);b.api.destroy();
 b=mapBoard({editor,twoOnB:true});let row=b.m.body.querySelector('.dv-trace-span[data-span-id="'+MAP_SPAN+'"]'),focused=0;if(row)row.focus=()=>{focused++;};b.h.flush();
 assert.equal(focused,0,'a cancelled chooser does not steal focus at the next re-render');b.api.destroy();editor.takeTrace();
 b=mapBoard({editor});await b.focus();const pick=b.m.body.querySelector('select.dv-trace-map-select');pick.value='beta';pick.dispatchEvent({type:'change'});
 b.m.body.querySelector('button.dv-trace-map-apply').dispatchEvent({type:'click',preventDefault(){},stopPropagation(){}});runTimers(b.h);b.api.destroy();
 b=mapBoard({editor});row=b.m.body.querySelector('.dv-trace-span[data-span-id="'+MAP_SPAN+'"]');focused=0;if(row)row.focus=()=>{focused++;};b.h.flush();
 assert.equal(focused,1,'a dropdown mapping returns focus to the span row');b.api.destroy();
});
test('#1180 c3 the nothing-lights note needs a missing match; an ambiguous one or a nodeId does not trigger it',async()=>{
 const e=mapEditor(),b=mapBoard({editor:e}),d=b.h.ctl.page.sections[0].diagram;d.steps[0].traceMatch={...MAP_MATCH};d.steps[1].traceMatch={...MAP_MATCH,nodeId:'b'};
 await b.focus();e.setMapped({step:'beta',label:'Show beta',traceMatch:MAP_MATCH});b.api.setTraceShow(true);
 assert.equal(b.m.body.querySelector('.dv-trace-map-note-text').textContent,'Mapped currency · grpc.msdemo.CurrencyService/GetSupportedCurrencies to step Show beta.');
 b.api.destroy();
});
test('#1180 c3 an alternatives step button gets its own title back after the drag',async()=>{
 const b=mapBoard({twoOnB:true,alternatives:true}),s=await b.focus(),chip=b.h.view.querySelector('button.schip[data-step-source="2"]');chip.setAttribute('title','Shared with Recovery');
 const data={'application/x-flowview-span':JSON.stringify({context:s.context,spanId:MAP_SPAN})},drag={types:Object.keys(data),getData:t=>data[t]||'',dropEffect:''};
 b.h.view.dispatchEvent({type:'dragover',target:chip,dataTransfer:drag,preventDefault(){}});assert.equal(chip.getAttribute('title'),'Has alternatives; edit in Inspect');
 b.h.view.dispatchEvent({type:'dragend',target:chip,dataTransfer:drag});assert.equal(chip.getAttribute('title'),'Shared with Recovery');
 b.api.destroy();
});
// #1173 with #1175: the request card's one-line summary and its coverage line count steps the same way, leaving out an
// optional step this trace lacks.
test('#1173 the request summary and the coverage line agree when an optional step is missing',async()=>{
 for(const optional of [false,true]){
  const f=await (await import('./helpers/step-evidence.mjs')).stepFixture(),d=f.spec.page.sections[0].diagram;
  if(optional)d.steps.find(s=>s.id==='push').traceMatch.optional=true;
  const h=harness(f.spec,{},{telemetry:{}}),api=h.ctl.liveStatus,m=mountStatus(h);
  h.ctl.sections[0].stepper={path:()=>'event',sourceIndex:()=>0,mode:()=>'ambient',pause(){},jumpSource(){return true;}};
  h.ctl.telemetry.apply(f.samples);api.setStatusMode('trace');h.flush();
  const entry=api.snapshot().trace.entries[0];await api.chooseTrace({key:entry.key,traceId:entry.exemplar.traceId});h.flush();
  const summary=m.body.querySelector('details.dv-trace-request > summary').textContent,coverage=m.body.querySelector('.dv-trace-coverage').textContent;
  const counts=text=>/(\d+\/\d+) steps matched/.exec(text)[1];
  assert.equal(counts(summary),optional?'1/2':'1/3',summary);assert.equal(counts(summary),counts(coverage),'the summary and the coverage line agree');
  api.destroy();
 }
});

// #1182 review: Verify keeps its report in view and the reader's open search; the open state follows the trace, not its
// selection token, and survives a Jira <-> Trace switch.
test('#1173 Verify keeps its report in view, and open sections survive a re-poll token and a view switch',async()=>{
 const {h,api,m}=compactHarness(['prod']),config=()=>m.body.querySelector('details.dv-trace-config'),request=()=>m.body.querySelector('details.dv-trace-request');
 api.setDirectTraceField({field:'input',value:COMPACT_ID});await api.loadDirectTrace(false);h.flush();assert.equal(config().open,true,'#1230: the search stays open');
 request().open=true;request().dispatchEvent({type:'toggle'});
 await api.loadDirectTrace(true);h.flush();
 assert.equal(config().open,true,'a Verify of the shown trace keeps the search open');assert.equal(request().open,true);
 const report=m.body.querySelector('.dv-trace-direct-report');assert.ok(report,'the verify report');assert.equal(report.closest('details.dv-trace-config'),null,'it is outside the collapsible search');
 assert.equal(m.body.querySelector('.dv-trace-diagnostics').open,true);
 api.setStatusMode('jira');api.setStatusMode('trace');h.flush();
 assert.equal(config().open,true,'a view switch keeps the open search');assert.equal(request().open,true,'and the open card');
 api.destroy();
});
test('#1173 #1230 a picked example trace keeps the search open and collapses the request card',async()=>{
 const f=await (await import('./helpers/step-evidence.mjs')).stepFixture(),profile=JSON.parse(JSON.stringify(require('./fixtures/trace-connection-profile.json')));
 f.spec.page.tracking.telemetry.traceConnections={company:profile};
 const h=harness(f.spec,{},{telemetry:{directTrace:{describe:async()=>compactTool(),call:async()=>({payload:''})}}}),api=h.ctl.liveStatus,m=mountStatus(h);
 h.ctl.sections[0].stepper={path:()=>'event',sourceIndex:()=>0,mode:()=>'ambient',pause(){},jumpSource(){return true;}};
 h.ctl.telemetry.apply(f.samples);api.setStatusMode('trace');h.flush();
 const config=()=>m.body.querySelector('details.dv-trace-config'),request=()=>m.body.querySelector('details.dv-trace-request');
 assert.equal(config().open,true,'nothing shown: the search is open');assert.ok(m.body.querySelector('.dv-trace-candidate'),'the examples are listed');
 const entry=api.snapshot().trace.entries[0];await api.chooseTrace({key:entry.key,traceId:entry.exemplar.traceId});h.flush();
 assert.equal(config().open,true,'a picked example keeps the search open');assert.ok(request());assert.equal(request().open,false,'the request card is collapsed');
 assert.ok(m.body.querySelector('.dv-trace-slot > .dv-trace-selected'),'the picked trace is in the reserved space');
 api.destroy();
});
/* #1233 (replaces #1173's text switch): each authored lookup is its own box with its own Find, in authored order; a lookup
   without a $value slot shows only its button; the typed LogQL query is its own collapsible box. Enter runs a value box's
   Find, Ctrl/Cmd+Enter the typed box's; results sit under the box that ran. */
test('#1173 #1233 each authored lookup is its own box with its own Find; the typed LogQL query is a separate collapsed box',async()=>{
 const profile=JSON.parse(JSON.stringify(require('./fixtures/trace-connection-profile.json'))),calls=[];let hold=null;
 const raw={tracking:{telemetry:{grafana:{loki:'logs'},lookups:{camera:{label:'Camera model',query:'{app="cams"} | cameraModel="$value"',values:['arch']},errors:{label:'Recent errors',query:'{app="cams"} |= "error"'},constructor:{label:'Constructor ID',query:'{app="cams"} | id="$value"'}},traceConnections:{company:profile}}},sections:[{id:'main',diagram:{nodes:{a:{}},rows:[['a']]}}]};
 const h=harness(raw,{},{telemetry:{provider:()=>Promise.resolve({}),directTrace:{describe(){},call(){},logsConnector:async()=>'Grafana',queryLogs:async args=>{calls.push(plain(args));if(hold)await hold.promise;return {data:[]};}}}}),api=h.ctl.liveStatus;
 api.setStatusMode('trace');for(let i=0;i<6;i++)await settle();const m=mountStatus(h);h.flush();
 const typedId=api.snapshot().trace.direct.logs.typed,box=id=>m.body.querySelector('.dv-trace-log-search[data-log-search="'+id+'"]'),find=id=>box(id).querySelector('button.dv-trace-log-find'),first=()=>calls.map(c=>c.logql.split('\n')[0]);
 assert.deepEqual(m.body.querySelectorAll('.dv-trace-logs [data-log-search]').map(n=>n.getAttribute('data-log-search')),['camera','errors','constructor',typedId],'authored order, then the typed box');
 assert.equal(box('constructor').querySelector('input').value,'','an id that is an Object.prototype key starts empty');
 assert.equal(find('camera').getAttribute('aria-label'),'Find log lines for Camera model');assert.equal(find('errors').getAttribute('aria-label'),'Find log lines for Recent errors');assert.equal(find('camera').textContent,'Find log lines');
 const value=box('camera').querySelector('input');assert.equal(value.getAttribute('aria-label'),'Camera model');assert.ok(value.getAttribute('list'),'suggested values stay a pick list');
 assert.equal(box('errors').querySelector('input'),null,'no $value slot: only its button');assert.equal(box('errors').querySelector('.dv-trace-log-name').textContent,'Recent errors');
 const typed=m.body.querySelector('details.dv-trace-log-typed');assert.ok(typed,'the typed box');assert.equal(typed.open,false,'with authored lookups it starts collapsed');assert.equal(typed.querySelector('summary').textContent,'Type a LogQL query');
 assert.equal(m.body.querySelector('button.dv-trace-log-mode'),null,'no mode switch');assert.ok(!m.body.querySelectorAll('select').some(el=>el.getAttribute('aria-label')==='Log lookup'),'no lookup select');
 value.value='arch';value.dispatchEvent({type:'input'});value.dispatchEvent({type:'keydown',key:'Enter',preventDefault(){}});for(let i=0;i<6;i++)await settle();h.flush();
 assert.deepEqual(first(),['{app="cams"} | cameraModel="arch"'],'Enter in a value box runs its Find');
 // While it runs, the pressed Find keeps focus (aria-disabled, not disabled), names what it does, and ignores a repeat press.
 const running=find('errors');hold={};hold.promise=new Promise(resolve=>{hold.release=resolve;});running.dispatchEvent({type:'click'});for(let i=0;i<6;i++)await settle();h.flush();
 assert.equal(find('errors'),running,'the same button');assert.deepEqual([running.disabled,running.getAttribute('aria-disabled'),running.getAttribute('aria-busy'),running.textContent,running.getAttribute('aria-label')],[false,'true','true','Finding…','Finding log lines for Recent errors']);
 assert.equal(find('camera').disabled,true,'the other Finds wait');running.dispatchEvent({type:'click'});await settle();assert.equal(calls.length,2,'a repeat press is ignored');
 const release=hold.release;hold=null;release();for(let i=0;i<6;i++)await settle();h.flush();
 assert.equal(find('errors'),running);assert.deepEqual([running.disabled,running.getAttribute('aria-disabled'),running.textContent,running.getAttribute('aria-label')],[false,null,'Find log lines','Find log lines for Recent errors'],'done: back to Find');
 assert.deepEqual(first(),['{app="cams"} | cameraModel="arch"','{app="cams"} |= "error"'],'the second box runs its own query');
 assert.ok(box('errors').querySelector('.dv-trace-logs-status'),'its result note is under the box that ran');assert.equal(box('camera').querySelector('.dv-trace-logs-status'),null,'and nowhere else');
 const area=typed.querySelector('textarea');assert.equal(area.getAttribute('aria-label'),'LogQL log query');area.value='{app="cams"}';area.dispatchEvent({type:'input'});
 area.dispatchEvent({type:'keydown',key:'Enter',preventDefault(){}});for(let i=0;i<6;i++)await settle();assert.equal(calls.length,2,'plain Enter in the query box is a new line');
 area.dispatchEvent({type:'keydown',key:'Enter',ctrlKey:true,preventDefault(){}});for(let i=0;i<6;i++)await settle();h.flush();assert.deepEqual(first().slice(2),['{app="cams"}'],'Ctrl+Enter runs the typed box');
 assert.equal(typed.querySelector('button.dv-trace-log-find').getAttribute('aria-label'),'Find log lines for LogQL query');
 assert.equal(api.snapshot().trace.direct.logs.form.values.camera,'arch','each box keeps its value');
 api.destroy();
 // lookups: {} shows only the typed box, open.
 const none=harness({...raw,tracking:{telemetry:{...raw.tracking.telemetry,lookups:{}}}},{},{telemetry:{provider:()=>Promise.resolve({}),directTrace:{describe(){},call(){},logsConnector:async()=>'Grafana',queryLogs:async()=>({data:[]})}}});
 none.ctl.liveStatus.setStatusMode('trace');for(let i=0;i<6;i++)await settle();const nm=mountStatus(none);none.flush();
 assert.equal(nm.body.querySelectorAll('.dv-trace-log-search').length,0,'no authored boxes');const only=nm.body.querySelector('details.dv-trace-log-typed');assert.ok(only,'the typed box');assert.equal(only.open,true,'open');
 none.ctl.liveStatus.destroy();
});
// #1182 c2: one open-state slot. Another trace resets it (pick A, open, pick B, back to A: collapsed); a re-poll with the
// same entry key keeps it; focus inside a card removed by a Load moves to the new card's line once.
test('#1173 a repaint never takes focus from outside the panel after a pick in the card',async()=>{
 const {f,h,api,m,request}=await compactExamples(),example=api.snapshot().trace.entries.find(e=>!e.manual);
 let focused=[];const focus=Element.prototype.focus;Element.prototype.focus=function(){focused.push(this);};
 try{
  await api.chooseTrace({key:example.key,traceId:example.exemplar.traceId});h.flush();assert.equal(request().open,false);
  // Focus on the card line, then a repaint: the card keeps it without a focus() call.
  h.doc.activeElement=request().querySelector('summary');h.ctl.telemetry.apply(JSON.parse(JSON.stringify(f.samples)));h.flush();
  // The reader moves on to an input elsewhere, then to the page body; Live repaints leave focus there.
  const input=new Element('input');h.doc.body.appendChild(input);h.doc.activeElement=input;
  h.ctl.telemetry.apply(JSON.parse(JSON.stringify(f.samples)));h.flush();api.setTraceShow(true);h.flush();
  h.doc.activeElement=h.doc.body;api.setTraceShow(false);h.flush();h.ctl.telemetry.apply(JSON.parse(JSON.stringify(f.samples)));h.flush();
  assert.equal(focused.length,0,'no repaint moves focus');
  // A Load from inside the card, with the reader typing elsewhere before it lands: the carried focus is not used.
  // A repaint with focus on the card line records it, so the Load's gap carries it.
  h.doc.activeElement=request().querySelector('summary');api.setTraceShow(true);h.flush();assert.equal(focused.length,0);
  api.setDirectTraceField({field:'environment',value:'prod'});api.setDirectTraceField({field:'input',value:COMPACT_ID});const loading=api.loadDirectTrace(false);h.flush();
  assert.equal(request(),null,'the card is gone while loading');h.doc.activeElement=input;await loading;h.flush();
  assert.equal(api.snapshot().trace.selected.manual,true);assert.equal(focused.length,0,'focus stays on the input');
  h.ctl.telemetry.apply(JSON.parse(JSON.stringify(f.samples)));h.flush();h.doc.activeElement=h.doc.body;h.flush();api.setTraceShow(true);h.flush();
  assert.equal(focused.length,0,'the carried focus was used up, not kept for a later repaint');
 }finally{Element.prototype.focus=focus;api.destroy();}
});

test('#1173 after Clear the same trace loaded again starts with its card collapsed and the search open',async()=>{
 const {h,api,request,config}=await compactExamples();
 const load=async()=>{api.setDirectTraceField({field:'environment',value:'prod'});api.setDirectTraceField({field:'input',value:COMPACT_ID});await api.loadDirectTrace(false);h.flush();};
 await load();assert.equal(api.snapshot().trace.selected.manual,true);
 request().open=true;request().dispatchEvent({type:'toggle'});config().open=true;config().dispatchEvent({type:'toggle'});
 api.clearDirectTrace();h.flush();assert.equal(request(),null);
 await load();assert.equal(api.snapshot().trace.selected.manual,true);assert.equal(request().open,false,'the card starts collapsed');assert.equal(config().open,true,'#1230: the search is open');
 api.destroy();
});

async function compactExamples(){
 const f=await (await import('./helpers/step-evidence.mjs')).stepFixture(),profile=JSON.parse(JSON.stringify(require('./fixtures/trace-connection-profile.json')));
 f.spec.page.tracking.telemetry.traceConnections={company:profile};
 const recorded=fs.readFileSync('tests/fixtures/provider-traces/honeycomb-trace.txt','utf8');
 const h=harness(f.spec,{},{telemetry:{directTrace:{describe:async()=>compactTool(),call:async()=>({payload:recorded})}}}),api=h.ctl.liveStatus,m=mountStatus(h);
 h.ctl.sections[0].stepper={path:()=>'event',sourceIndex:()=>0,mode:()=>'ambient',pause(){},jumpSource(){return true;}};
 h.ctl.telemetry.apply(f.samples);api.setStatusMode('trace');h.flush();
 return {f,h,api,m,request:()=>m.body.querySelector('details.dv-trace-request'),config:()=>m.body.querySelector('details.dv-trace-config')};
}
test('#1173 a trace of unknown completeness says so on the request line',async()=>{
 // Nothing collapsed and every span visible, but the view is not 'full': the provider makes no completeness claim.
 const unknown=t=>t.replace('collapsed_nodes: 1','collapsed_nodes: 0').replace('total_spans: 77','total_spans: 55').replace(/\| true \|$/m,'| false |');
 const {h,api,m}=compactHarness(['prod'],unknown),request=()=>m.body.querySelector('details.dv-trace-request');
 api.setDirectTraceField({field:'input',value:COMPACT_ID});await api.loadDirectTrace(false);h.flush();
 assert.equal(api.snapshot().trace.selected.exemplar.completeness,'unknown');
 assert.match(textOf(request().querySelector('summary')).replace(/\s+/g,' ').trim(),/^8413cd87a9f1 · unknown completeness · [^·]+ \d\d:\d\d · \d+ spans · \d+\/\d+ steps matched$/);
 api.destroy();
});
test('#1173 another trace resets the open sections; a re-poll with the same entry keeps them; focus moves to the card line after a Load',async()=>{
 const {f,h,api,m,request,config}=await compactExamples(),example=api.snapshot().trace.entries.find(e=>!e.manual);
 await api.chooseTrace({key:example.key,traceId:example.exemplar.traceId});h.flush();
 request().open=true;request().dispatchEvent({type:'toggle'});config().open=true;config().dispatchEvent({type:'toggle'});
 // Re-poll with the same entry key and trace: the open sections stay (a new selection token would expire the selection instead).
 const key=api.snapshot().trace.selected.key;h.ctl.telemetry.apply(JSON.parse(JSON.stringify(f.samples)));h.flush();
 assert.equal(api.snapshot().trace.selected.key,key);assert.equal(api.snapshot().trace.selected.exemplar.traceId,example.exemplar.traceId);
 assert.equal(request().open,true,'a re-poll keeps the open card');assert.equal(config().open,true);
 // B: a loaded trace. Focus sits inside the open card; the card collapses and focus moves to its line.
 let focused=null;h.doc.activeElement=request().querySelector('.dv-trace-identity');const focus=Element.prototype.focus;Element.prototype.focus=function(){focused=this;};api.setTraceShow(true);h.flush();
 api.setDirectTraceField({field:'environment',value:'prod'});api.setDirectTraceField({field:'input',value:COMPACT_ID});const loading=api.loadDirectTrace(false);h.flush();
 // The card is gone during the Load; a browser leaves focus on the body.
 assert.equal(request(),null,'the card is gone while loading');h.doc.activeElement=h.doc.body;await loading;h.flush();
 assert.equal(api.snapshot().trace.selected.manual,true);assert.equal(request().open,false,'another trace collapses the card');assert.equal(config().open,true,'#1230: the search stays open');Element.prototype.focus=focus;assert.ok(focused && focused===request().querySelector('summary'),'focus moves to the card line');
 // Back to A: its earlier open state is not restored.
 const again=api.snapshot().trace.entries.find(e=>e.key===example.key) || api.snapshot().trace.entries.find(e=>!e.manual);
 await api.chooseTrace({key:again.key,traceId:again.exemplar.traceId});h.flush();
 assert.equal(api.snapshot().trace.selected.manual,false);assert.equal(request().open,false,'returning to A starts collapsed');assert.equal(config().open,true);
 api.destroy();
});
/* #1200: the painted card carries its metric state, identically in the Jira and Trace views, and never Jira work paint;
   nodes keep theirs. */
test('#1200 a painted metric card shows its metric state in both views and no Jira paint, while nodes keep theirs',async()=>{
 const raw={page:{tracking:{jira:{site:'https://jira.test'},telemetry:{}},sections:[{id:'main',diagram:{nodes:{a:{tickets:['AA-1']},b:{},c:{}},rows:[['a','b','c']],
  edges:[{from:'a',to:'b',label:'PlaceOrder',tickets:['EE-1'],telemetry:TCALL()},{from:'b',to:'c',label:'Ship',tickets:['EE-2'],telemetry:TCALL()}]}}]}};
 const samples={'a->b':{signals:{rate:{value:100},errors:{value:0}}},'b->c':{signals:{rate:{value:100},errors:{value:50}}}};
 const h=harness(raw,{},{telemetry:{provider:()=>Promise.resolve(samples)}}),api=h.ctl.liveStatus,matrix={a:1,b:0,c:0,d:1,e:0,f:0,inverse(){return this;},multiply(m){return m;}};
 h.doc.defaultView={getComputedStyle:()=>({display:'inline',visibility:'visible',backgroundColor:'',getPropertyValue:()=>''})};
 const make=h.doc.createElementNS;h.doc.createElementNS=(ns,tag)=>Object.assign(make(ns,tag),{getComputedTextLength(){return 6*String(this.textContent||'').length;}});
 for(const el of h.view.querySelectorAll('svg,path.edge'))el.getCTM=()=>matrix;
 api.apply({'AA-1':{state:'done'},'EE-1':{state:'done'},'EE-2':{state:'done'}});
 h.ctl.telemetry.setEnabled(true);for(let i=0;i<6;i++)await settle();h.flush();
 const read=()=>Object.fromEntries(h.view.querySelectorAll('g.dv-metrics-card').map(card=>[card.getAttribute('data-metrics-card'),{state:card.getAttribute('data-metric-state'),
  appearance:card.getAttribute('data-live-appearance'),classes:Array.from(h.C.LIVE_STATUS_APPEARANCES).filter(s=>card.classList.contains('dv-live-'+s)),halo:!!card.querySelector('.dv-live-halo')}]));
 const want={'a->b':{state:'held',appearance:null,classes:[],halo:false},'b->c':{state:'failing',appearance:null,classes:[],halo:false}};
 assert.deepEqual(read(),want,'Jira view: metric state only, done tickets do not paint the cards');
 assert.equal(h.view.querySelector('g.node[data-dv-node="a"]').getAttribute('data-live-appearance'),'done','nodes keep their Jira paint');
 assert.equal(h.view.querySelector('path.edge[data-dv-edge="0"]').getAttribute('data-live-appearance'),'done','edges keep their Jira paint');
 api.setStatusMode('trace');h.flush();
 assert.deepEqual(read(),want,'Trace view: the same metric state');
 api.destroy();
});
/* #1177 follow-up (Chuck 2026-11-09): a span dropped on a node writes traceMatch.nodeId for that node when
   the step names exactly that node, so the node lights up at once; a step chip or an edge drop does not. */
test('#1177 a drop on a node writes nodeId when the step names exactly that node',async()=>{
 let b=mapBoard();let s=await b.focus();
 spanDrop(b.h,b.h.view.querySelector('g.node[data-dv-node="b"]'),s.context);runTimers(b.h);
 assert.deepEqual(b.editor.calls.at(-1),{ref:{section:0,kind:'step',id:'beta'},match:{...MAP_MATCH,nodeId:'b'},previous:null},'node drop: nodeId b');
 spanDrop(b.h,b.h.view.querySelector('button.schip[data-step-source="1"]'),s.context);runTimers(b.h);
 assert.deepEqual(b.editor.calls.at(-1).match,MAP_MATCH,'a step-button drop writes no nodeId');
 b.api.destroy();
 // Through the chooser after a node drop: nodeId only for a step that names exactly that node.
 b=mapBoard({twoOnB:true});s=await b.focus();b.h.ctl.page.sections[0].diagram.steps.push({id:'both',text:'Both nodes',nodes:['a','b']});
 spanDrop(b.h,b.h.view.querySelector('g.node[data-dv-node="b"]'),s.context);runTimers(b.h);
 const pick=label=>{const button=b.m.body.querySelectorAll('button.dv-trace-map-choice').find(x=>x.textContent===label);button.dispatchEvent({type:'click',preventDefault(){},stopPropagation(){}});runTimers(b.h);};
 pick('Beta third');assert.deepEqual(b.editor.calls.at(-1).match,{...MAP_MATCH,nodeId:'b'});
 spanDrop(b.h,b.h.view.querySelector('g.node[data-dv-node="b"]'),s.context);runTimers(b.h);pick('Both nodes');
 assert.deepEqual(b.editor.calls.at(-1).match,MAP_MATCH,'a step naming more than that node gets no nodeId');
 b.api.destroy();
});
test('#1192 a step that names the node and an edge, or edges, gets no nodeId from a node drop',async()=>{
 for(const extra of [{edge:'a->b'},{edges:['a->b']}]){
  const b=mapBoard();const d=b.h.ctl.page.sections[0].diagram;Object.assign(d.steps[1],extra);const s=await b.focus();
  spanDrop(b.h,b.h.view.querySelector('g.node[data-dv-node="b"]'),s.context);runTimers(b.h);
  const pick=b.m.body.querySelector('button.dv-trace-map-choice');if(pick){pick.dispatchEvent({type:'click',preventDefault(){},stopPropagation(){}});runTimers(b.h);}
  assert.ok(b.editor.calls.length,JSON.stringify(extra)+': mapped');assert.equal('nodeId' in b.editor.calls.at(-1).match,false,JSON.stringify(extra)+': no nodeId');
  b.api.destroy();
 }
});

// #1186 (Chuck 2026-11-09, stage-2 mockup): the request line carries Show on diagram and Open trace as icons, a header row
// replaces the focus hint box, the focused span's detail opens under its row, and the card holds Source and limitations,
// All operation mappings and Pin as evidence. Desktop only.
async function stage2Loaded(){
 const {h,api,m}=compactHarness(['prod']);api.setDirectTraceField({field:'input',value:COMPACT_ID});await api.loadDirectTrace(false);h.flush();
 return {h,api,m,request:()=>m.body.querySelector('details.dv-trace-request')};
}
test('#1186 the request line holds Show on diagram and Open trace as icons, outside the summary',async()=>{
 const {h,api,m,request}=await stage2Loaded(),line=m.body.querySelector('.dv-trace-request-line');
 assert.ok(line,'one request line');assert.ok(line.contains(request()),'the card is on the line');
 const icons=line.querySelector('.dv-trace-request-icons');assert.ok(icons,'an icon group on the line');
 assert.ok(line.children.indexOf(icons)>=0 && line.children.indexOf(icons)<line.children.indexOf(request()),'#1186 c1: the icons come before the card body in tab order');
 assert.equal(m.body.querySelectorAll('button.dv-trace-show').length,1,'one Show on diagram control');
 const show=icons.querySelector('button.dv-trace-show');assert.ok(show,'Show on diagram is an icon on the request line');
 assert.equal(show.getAttribute('aria-label'),'Show on diagram');assert.equal(show.getAttribute('aria-pressed'),String(api.snapshot().trace.show));assert.equal(textOf(show).trim(),'','an icon, no text');
 const open=icons.querySelector('a.dv-trace-open');assert.ok(open,'Open trace is a link icon next to it');
 assert.equal(open.getAttribute('aria-label'),'Open trace in Honeycomb');assert.match(open.getAttribute('href'),/^https:\/\/ui\.honeycomb\.io\//);assert.equal(textOf(open).trim(),'');
 assert.ok(!request().querySelector('summary').contains(show) && !request().querySelector('summary').contains(open),'the icons are not inside the summary, so clicking them does not toggle the card');
 const before=api.snapshot().trace.show;show.dispatchEvent({type:'click'});h.flush();assert.equal(api.snapshot().trace.show,!before);
 assert.equal(m.body.querySelector('button.dv-trace-show').getAttribute('aria-pressed'),String(!before));
 api.destroy();
});
test('#1186 no focus hint box: the span list has a header row with the count',async()=>{
 const {api,m}=await stage2Loaded(),count=api.snapshot().trace.selected.exemplar.spans.length;
 assert.ok(m.body.querySelector('.dv-trace-focus-summary')===null,'no hint box');assert.ok(m.body.querySelector('.dv-trace-focus-hint')===null);
 const head=m.body.querySelector('.dv-trace-spans-head'),list=m.body.querySelector('.dv-trace-waterfall');assert.ok(head,'a list header');
 assert.equal(textOf(head).replace(/\s+/g,' ').trim(),'Spans · '+count+' · click a span to focus it on the diagram');
 assert.ok(head.parentElement===list.parentElement && head.parentElement.children.indexOf(head)+1===head.parentElement.children.indexOf(list),'the header sits directly above the list');
 api.destroy();
});
test('#1186 the focused span\'s detail opens inline, directly under its row',async()=>{
 const {h,api,m}=await stage2Loaded(),rows=()=>m.body.querySelectorAll('.dv-trace-span'),span=api.snapshot().trace.selected.exemplar.spans[2];
 assert.ok(m.body.querySelector('.dv-trace-span-detail')===null,'no detail before a span is focused');
 rows().find(r=>r.getAttribute('data-span-id')===span.id).dispatchEvent({type:'click'});h.flush();
 const row=m.body.querySelector('.dv-trace-span[aria-pressed="true"]');assert.ok(row && row.getAttribute('data-span-id')===span.id);
 const item=row.parentElement,list=m.body.querySelector('.dv-trace-waterfall');assert.ok(item.parentElement===list,'each row sits in a list item');
 const detail=item.children[item.children.indexOf(row)+1];assert.ok(detail && detail.classList.contains('dv-trace-span-detail'),'the detail follows its row inside the item');
 assert.equal(m.body.querySelectorAll('.dv-trace-span-detail').length,1);
 assert.equal(detail.querySelector('.dv-trace-span-service').textContent,span.service);assert.equal(detail.querySelector('.dv-trace-span-operation').textContent,span.name);assert.ok(detail.querySelector('.dv-trace-duration'));
 const clear=detail.querySelectorAll('button').find(b=>b.textContent==='Clear trace focus');assert.ok(clear,'Clear trace focus is in the detail');
 clear.dispatchEvent({type:'click'});h.flush();assert.ok(m.body.querySelector('.dv-trace-span-detail')===null,'clearing focus closes the detail');
 api.destroy();
});
test('#1186 Source and limitations, All operation mappings and Pin as evidence sit inside the request card',async()=>{
 const {h,api,request}=await compactExamples(),example=api.snapshot().trace.entries.find(e=>!e.manual);
 await api.chooseTrace({key:example.key,traceId:example.exemplar.traceId});h.flush();
 assert.ok(request().querySelector('details.dv-trace-metadata'),'Source and limitations is in the card');
 assert.ok(request().querySelector('details.dv-trace-all'),'All operation mappings is in the card');
 assert.ok(request().querySelectorAll('button').some(b=>b.textContent==='Pin as evidence'),'Pin as evidence is in the card');
 api.destroy();
});
test('#1186 focus that left the card before a Load is not carried to the new card',async()=>{
 const {h,api,request}=await compactExamples(),example=api.snapshot().trace.entries.find(e=>!e.manual);
 let focused=[];const focus=Element.prototype.focus;Element.prototype.focus=function(){focused.push(this);};
 try{
  await api.chooseTrace({key:example.key,traceId:example.exemplar.traceId});h.flush();
  // A repaint while focus is on the card line, then the reader clicks the canvas (focus to the body) before starting a Load.
  h.doc.activeElement=request().querySelector('summary');api.setTraceShow(true);h.flush();h.doc.activeElement=h.doc.body;
  api.setDirectTraceField({field:'environment',value:'prod'});api.setDirectTraceField({field:'input',value:COMPACT_ID});const loading=api.loadDirectTrace(false);h.flush();
  assert.ok(request()===null,'the card is gone while loading');await loading;h.flush();
  assert.equal(api.snapshot().trace.selected.manual,true);assert.equal(focused.length,0,'focus stays where the reader left it');
 }finally{Element.prototype.focus=focus;api.destroy();}
});
/* #1280: the list grows with its spans, so a span focused while the panel is hidden is scrolled into the view of the
   panel body (the nearest ancestor that scrolls) when the panel shows again; the list itself never scrolls. */
test('#1186 #1280 a span focused while the panel is hidden is scrolled into the panel body\'s view when the panel shows again',async()=>{
 const {h,api,m}=await stage2Loaded();
 let hidden=true;const watchers=[];h.C.ResizeObserver=class{constructor(f){this.f=f;this.off=false;watchers.push(this);}observe(t){this.t=t;}disconnect(){this.off=true;}};
 const proto=Element.prototype,rects=Object.getOwnPropertyDescriptor(proto,'getClientRects'),bound=proto.getBoundingClientRect,view=h.doc.defaultView;
 proto.getClientRects=function(){return hidden?[]:[1];};
 proto.getBoundingClientRect=function(){if(this===m.body)return {top:0,bottom:300,left:0,right:100,width:100,height:300};if(this.classList.contains('dv-trace-span-item'))return {top:900,bottom:1100,left:0,right:100,width:100,height:200};return bound.call(this);};
 h.doc.defaultView={getComputedStyle:el=>({overflowY:el===m.body?'auto':'visible'})};m.body.scrollHeight=4000;m.body.clientHeight=300;
 try{
  const t=api.snapshot().trace.selected,span=t.exemplar.spans[41];assert.equal(api.selectTraceSpan({context:t.context,spanId:span.id}),true);h.flush();
  const list=m.body.querySelector('.dv-trace-waterfall');assert.ok(list.querySelector('.dv-trace-span-detail'),'the detail is open');
  assert.equal(m.body.scrollTop,undefined,'nothing is measured or scrolled while the panel is hidden');assert.equal(watchers.length,1,'the list is watched until it has a size');assert.ok(watchers[0].t===list);
  m.body.scrollTop=0;hidden=false;watchers[0].f([]);
  assert.equal(m.body.scrollTop,808,'shown again: the panel body scrolls the least that shows the focused span (its bottom + 8)');assert.equal(list.scrollTop,undefined,'the list does not scroll');assert.equal(watchers[0].off,true,'the watch stops');
  api.setTraceShow(true);h.flush();assert.equal(m.body.scrollTop,808,'a repaint of the same focus does not scroll again');
 }finally{if(rects)Object.defineProperty(proto,'getClientRects',rects);else delete proto.getClientRects;proto.getBoundingClientRect=bound;h.doc.defaultView=view;api.destroy();}
});

/* #1193: "N/M steps matched" counts only steps with a traceMatch, less optional steps this trace lacks. The request
   card's coverage line adds "· K steps without a trace mapping"; the one-line summary does not. Both agree on N/M. */
test('#1193 steps without a traceMatch leave the step count; the coverage line names them and agrees with the summary',async()=>{
 const f=await (await import('./helpers/step-evidence.mjs')).stepFixture(),d=f.spec.page.sections[0].diagram;
 // The event path: submit matched, publish missing, push optional and missing, and four steps with no traceMatch.
 d.steps.find(s=>s.id==='push').traceMatch.optional=true;
 for(const id of ['note-1','note-2','note-3']){d.steps.push({id,text:'Narrative '+id,nodes:['app']});d.paths[0].steps.push(id);}
 const h=harness(f.spec,{},{telemetry:{}}),api=h.ctl.liveStatus,m=mountStatus(h);
 h.ctl.sections[0].stepper={path:()=>'event',sourceIndex:()=>0,mode:()=>'ambient',pause(){},jumpSource(){return true;}};
 h.ctl.telemetry.apply(f.samples);api.setStatusMode('trace');h.flush();
 const entry=api.snapshot().trace.entries[0];await api.chooseTrace({key:entry.key,traceId:entry.exemplar.traceId});h.flush();
 const summary=m.body.querySelector('details.dv-trace-request > summary').textContent,coverage=m.body.querySelector('.dv-trace-coverage').textContent;
 assert.equal(coverage,'1/2 steps matched · 1 optional not in this trace · 4 steps without a trace mapping · 0 spans unmatched');
 assert.match(summary,/ · 1\/2 steps matched/,summary);assert.doesNotMatch(summary,/without a trace mapping|optional/,'the one-line summary keeps only the ratio');
 api.destroy();
});

/* #1198 + #1202 (company round 5, Chuck 2026-11-09): in the Jira view's popup each ticket is one row (key, title, status chip;
   no owner), and the evidence block reads exactly like the Trace view's: no Jira words, one verdict line, no Since Done. */
async function roundFivePopup(state='done'){
 const raw={page:{tracking:{jira:{site:'https://jira.test'},telemetry:{}},sections:[{id:'main',diagram:{nodes:{a:{title:'A'},b:{title:'B'}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'PlaceOrder',tickets:['EE-1','EE-2','EE-3'],telemetry:TCALL()}]}}]}};
 const h=harness(raw,{},{telemetry:{provider:()=>Promise.resolve({'a->b':{signals:{rate:{value:5500},errors:{value:12}}}})}}),api=h.ctl.liveStatus,matrix={a:1,b:0,c:0,d:1,e:0,f:0,inverse(){return this;},multiply(m){return m;}};
 h.doc.defaultView={getComputedStyle:()=>({display:'inline',visibility:'visible',backgroundColor:'',getPropertyValue:()=>''})};
 const make=h.doc.createElementNS;h.doc.createElementNS=(ns,tag)=>Object.assign(make(ns,tag),{getComputedTextLength(){return 6*String(this.textContent||'').length;}});
 for(const el of h.view.querySelectorAll('svg,path.edge'))el.getCTM=()=>matrix;
 const titles={'EE-1':'Place the order through the checkout service with retries and idempotency keys','EE-2':'Charge the card','EE-3':'Send the confirmation email'};
 api.apply(Object.fromEntries(Object.entries(titles).map(([key,title])=>[key,{state,title,assignee:'Pat Lee',updatedAt:'2026-11-05T12:00:00.000Z'}])));
 h.ctl.telemetry.setEnabled(true);for(let i=0;i<6;i++)await settle();h.flush();
 const card=()=>h.view.querySelector('g.dv-metrics-card[data-metrics-card="a->b"]'),pop=()=>h.view.querySelector('.dv-live-popover'),escape=()=>h.doc.dispatchEvent({type:'keydown',key:'Escape',preventDefault(){},stopPropagation(){}});
 return {h,api,card,pop,escape,titles};
}
test('#1198 the Jira-view popup lists each ticket as one row: key, one-line title with the full title as tooltip, status chip; no owner',async()=>{
 const {h,api,card,pop,titles}=await roundFivePopup();workPresentation(h,card());
 const rows=pop().querySelectorAll('.dv-live-ticket');assert.equal(rows.length,3,'three tickets, three rows');
 for(const row of rows){
  const key=row.getAttribute('data-live-ticket'),parts=row.children.map(c=>c.className.split(' ')[0] || c.tagName);
  assert.deepEqual(parts,['nbacklink','dv-live-ticket-title','dv-live-ticket-state'],key+': key, title, chip in one row: '+parts);
  const title=row.querySelector('.dv-live-ticket-title');assert.equal(title.textContent,titles[key]);assert.equal(title.getAttribute('title'),titles[key],'the full title is the tooltip');
  assert.equal(row.children.at(-1).textContent,'done','the status chip ends the row');
 }
 assert.ok(pop().querySelector('.dv-live-ticket-assignee')===null,'no owner element');assert.doesNotMatch(textOf(pop()),/Pat Lee/,'no owner text');
 api.destroy();
});
test('#1202 the Jira-view popup evidence reads exactly like the Trace view: no DONE, one verdict line, no Since Done',async()=>{
 const {h,api,card,pop,escape}=await roundFivePopup();
 workPresentation(h,card());const jira=pop().querySelector('.dv-live-production'),jiraText=textOf(jira);
 for(const word of [/\bDONE\b/,/Since Done/,/\bDone\b/,/proof/i,/proven/i])assert.doesNotMatch(jiraText,word,'no Jira or proof words in the Jira-view evidence: '+word);
 assert.equal(jira.querySelectorAll('.dv-live-production-verdict').length,1,'one verdict line');
 assert.ok(jira.querySelector('.dv-live-production-since')===null,'no Since Done line');
 assert.equal(jira.getAttribute('data-verdict'),null,'no Jira-derived verdict token');
 assert.ok(pop().querySelectorAll('.dv-live-ticket').length===3,'the Tickets stay in the Jira-view popup');
 escape();api.setStatusMode('trace');h.flush();workPresentation(h,card());const trace=textOf(pop().querySelector('.dv-live-production'));
 assert.equal(jiraText,trace,'the evidence block is the same in both views');
 api.destroy();
});

/* #1194: each metric tile in the card popup is one row: the bold label, the metric's graph, and one small line
   "<scope>: <value>". The primary signal's row holds the main chart, so its series is drawn once. The generated CloudWatch
   scope names the queue without the account id; a scope the previous tile showed is not repeated. An authored empty
   scope hides it; an absent scope keeps the generated text. Jira and Trace view popups alike. */
const tileMetric=(name,queue='orders-queue')=>({namespace:'AWS/SQS',metric:name,dimensions:{QueueName:queue},accountId:'123456789012',region:'us-east-1',statistic:'Sum'});
async function openTiles(signals,values,proof={}){
 const raw={page:{tracking:{jira:{site:'https://jira.test'},telemetry:{}},sections:[{id:'main',diagram:{nodes:{a:{title:'A'},b:{title:'B'}},rows:[['a','b']],edges:[{from:'a',to:'b',label:'Orders',tickets:['EE-1'],telemetry:{kind:'call',signals,proof}}]}}]}};
 const h=harness(raw,{},{telemetry:{provider:()=>Promise.resolve({'a->b':{signals:values}})}}),api=h.ctl.liveStatus,matrix={a:1,b:0,c:0,d:1,e:0,f:0,inverse(){return this;},multiply(m){return m;}};
 h.doc.defaultView={getComputedStyle:()=>({display:'inline',visibility:'visible',backgroundColor:'',getPropertyValue:()=>''})};
 const make=h.doc.createElementNS;h.doc.createElementNS=(ns,tag)=>Object.assign(make(ns,tag),{getComputedTextLength(){return 6*String(this.textContent||'').length;}});
 for(const el of h.view.querySelectorAll('svg,path.edge'))el.getCTM=()=>matrix;
 api.apply({'EE-1':{state:'done',updatedAt:new Date(Date.now()-86400000).toISOString()}});h.ctl.telemetry.setEnabled(true);for(let i=0;i<6;i++)await settle();h.flush();
 const card=()=>h.view.querySelector('g.dv-metrics-card[data-metrics-card="a->b"]'),pop=()=>h.view.querySelector('.dv-live-popover');
 return {h,api,pop,open(view){if(view==='trace'){h.doc.dispatchEvent({type:'keydown',key:'Escape',preventDefault(){},stopPropagation(){}});api.setStatusMode('trace');h.flush();}workPresentation(h,card());return pop().querySelectorAll('.dv-live-production-kpi');}};
}
const tileLines=tiles=>tiles.map(t=>t.querySelectorAll('.dv-live-metric-line').map(l=>l.textContent));
test('#1194 metric tiles: one scope line per queue, no account id, an empty scope hides it, and the primary series is drawn once',async()=>{
 const at=Date.now(),series=base=>[3,2,1].map((n,i)=>[new Date(at-n*3600000).toISOString(),base+i*10]);
 const {api,pop,open}=await openTiles({sent:{cloudwatch:tileMetric('NumberOfMessagesSent'),unit:'msgs/day'},received:{cloudwatch:tileMetric('NumberOfMessagesReceived'),unit:'msgs/day'},
  visible:{cloudwatch:tileMetric('ApproximateNumberOfMessagesVisible'),unit:'msgs',scope:''}},{sent:{value:1240,series:series(400)},received:{value:1200,series:series(300)},visible:{value:3}});
 for(const view of ['jira','trace']){
  const tiles=open(view);
  assert.equal(tiles.length,3,view);
  assert.deepEqual(tiles.map(t=>(t.querySelector('.dv-live-metric-label') || {}).textContent),['sent','received','visible'],view+': each tile leads with its label');
  assert.deepEqual(tileLines(tiles),[['orders-queue: 1,240 msgs/day'],['1,200 msgs/day'],['3 msgs']],view+': one line per tile; the shared queue scope once; the empty scope hides it');
  assert.ok(tiles.every(t=>!/123456789012/.test(textOf(t))),view+': no account id on a tile');
  // The primary (sent) row holds the main chart between its label and its line; no second copy of its series.
  assert.equal(pop().querySelectorAll('svg.dv-live-proof-sparkline').length,1,view+': one main chart');
  assert.equal(tiles[0].querySelectorAll('.dv-live-production-chart svg.dv-live-proof-sparkline').length,1,view+': in the primary row');
  assert.deepEqual(tiles[0].children.map(c=>c.className.split(' ')[0]),['dv-live-metric-label','dv-live-production-chart','dv-live-metric-line'],view);
  assert.equal(tiles[0].querySelectorAll('svg.dv-live-metric-sparkline').length,0,view+': the primary series is drawn once');
  assert.equal(tiles[1].querySelectorAll('svg.dv-live-metric-sparkline').length,1,view+': another metric with a series has its own small graph');
  assert.equal(tiles[2].querySelectorAll('svg').length,0,view+': no graph without a series');
 }
 api.destroy();
});
test('#1194 the main chart goes to the primary signal\'s tile found by name, not by index',async()=>{
 // telemetryPrimary skips a maxRatioOf numerator: errors comes first, but rate is the primary.
 const at=Date.now(),series=base=>[3,2,1].map((n,i)=>[new Date(at-n*3600000).toISOString(),base+i*10]);
 const raw={kind:'call',signals:{errors:{grafana:'errors',unit:'req/h'},rate:{grafana:'rate',unit:'req/h'}},proof:{rate:{min:1},errors:{maxRatioOf:'rate',max:0.5}}};
 const {api,pop,open}=await openTiles(raw.signals,{errors:{value:2,series:series(1)},rate:{value:100,series:series(90)}},raw.proof);
 for(const view of ['jira','trace']){
  const tiles=open(view);
  assert.deepEqual(tiles.map(t=>t.querySelector('.dv-live-metric-label').textContent),['errors','rate'],view);
  assert.equal(pop().querySelectorAll('svg.dv-live-proof-sparkline').length,1,view+': the primary series is drawn once');
  assert.equal(tiles[1].querySelectorAll('.dv-live-production-chart svg.dv-live-proof-sparkline').length,1,view+': the rate tile holds the main chart');
  assert.equal(tiles[1].querySelectorAll('svg').length,1,view+': and no second graph');
  assert.equal(tiles[0].querySelectorAll('svg.dv-live-metric-sparkline').length,1,view+': errors keeps its own small graph');
  assert.equal(tiles[0].querySelectorAll('.dv-live-production-chart').length,0,view);
 }
 api.destroy();
});
test('#1194 a scope repeats when the previous tile showed another one; account-wide CloudWatch wording on tiles',async()=>{
 const {api,open}=await openTiles({a1:{cloudwatch:tileMetric('NumberOfMessagesSent','q1')},b:{cloudwatch:tileMetric('NumberOfMessagesSent','q2')},a2:{cloudwatch:tileMetric('NumberOfMessagesReceived','q1')}},{a1:{value:1},b:{value:2},a2:{value:3}});
 assert.deepEqual(tileLines(open('jira')),[['q1: 1'],['q2: 2'],['q1: 3']],'q1, q2, q1: the third tile names its queue again');
 api.destroy();
 const C=harness().C,iot=(metric,dimensions)=>({source:'cloudwatch',query:{namespace:'AWS/IoT',metric,dimensions,accountId:'111111111111',region:'us-east-1',statistic:'Sum'}});
 assert.equal(C.telemetryTileScope(iot('PublishIn.AuthError',{Protocol:'MQTT'})),'All topics · whole account');
 assert.equal(C.telemetryTileScope(iot('Connect.AuthError',{})),'All connections · whole account');
 assert.equal(C.telemetryTileScope(iot('TopicMatch',{RuleName:'camera_rule'})),'camera_rule');
 for(const s of [iot('PublishIn.AuthError',{Protocol:'MQTT'}),iot('TopicMatch',{RuleName:'camera_rule'})])assert.doesNotMatch(C.telemetryTileScope(s),/111111111111/);
});
test('#1194 an authored empty scope is kept and hides the scope on the card; whitespace alone warns; an absent scope keeps the generated text',()=>{
 const h=harness(),C=h.C,signal={cloudwatch:{namespace:'AWS/SQS',metric:'NumberOfMessagesSent',dimensions:{QueueName:'orders-queue'},accountId:'123456789012',region:'us-east-1',statistic:'Sum'},unit:'msgs/day'};
 const clean=scope=>{const warnings=[],out=C.telemetryClean({kind:'call',signals:{sent:scope===undefined?signal:{...signal,scope}}},(at,message)=>warnings.push(at+': '+message),false).signals.sent;return {out,warnings};};
 assert.equal(clean('').out.scope,'','an empty scope is authored text');assert.deepEqual(clean('').warnings,[]);
 assert.equal(Object.prototype.hasOwnProperty.call(clean(undefined).out,'scope'),false);
 const blank=clean('   ');assert.equal(Object.prototype.hasOwnProperty.call(blank.out,'scope'),false,'whitespace alone is ignored');
 assert.ok(blank.warnings.some(w=>/scope: must be non-empty text, or "" to hide the scope/.test(w)),JSON.stringify(blank.warnings));
 const bound={source:'cloudwatch',query:signal.cloudwatch,unit:'msgs/day'};
 assert.equal(C.telemetryCardScope({...bound,scope:''}),'','the card hides it');assert.equal(C.telemetrySignalScope({...bound,scope:''}),'','Proof and Inspect hide it');
 assert.equal(C.telemetryCardScope(bound),'This queue','an absent scope keeps the generated card text');
 const content=C.telemetryCardContent({from:'a',to:'b',telemetry:{}},{kind:'call',signals:{sent:{...bound,scope:''}},proof:{}},{signals:{sent:{value:5}}},null,'24h');
 assert.equal(content.scope,'','the card content carries no scope');
 h.ctl.liveStatus.destroy();
});

/* #1253 sweep: the Jira view, its popover and the artifact Edit mode. */
// Records each focus() and makes it the document's active element, as a browser does. Compare elements with
// assert.ok(a===b): a failing assert.equal on two elements makes the test runner serialize both trees.
// Removing an element that holds focus blurs it, as in a browser.
function trackFocus(){
 const proto=Element.prototype,original=proto.focus,remove=proto.remove,seen={el:null};
 proto.focus=function(){seen.el=this;let root=this;while(root.parentNode)root=root.parentNode;if(root.ownerDocument)root.ownerDocument.activeElement=this;};
 proto.remove=function(){const doc=this.ownerDocument;if(doc && doc.activeElement && this.contains(doc.activeElement)){doc.activeElement=null;seen.el=null;}return remove.call(this);};
 seen.restore=()=>{proto.focus=original;proto.remove=remove;};return seen;
}
// The fake DOM matches only the last part of a selector, so a node's card is found in two steps.
const cardOf=(h,id)=>h.view.querySelector('[data-dv-node="'+id+'"]').querySelector('.card');
const carrierClick=(h,target)=>h.view.dispatchEvent({type:'click',target,button:0,preventDefault(){},stopPropagation(){}});
test('#1253 item 4 a repaint keeps an open Jira popover open, refreshes its lines and keeps focus in it',()=>{
 const focus=trackFocus();try{
  const h=harness(fixture()),api=h.ctl.liveStatus;api.apply(fixed);
  const card=()=>cardOf(h,'b');carrierClick(h,card());
  const pop=h.view.querySelector('.dv-live-popover'),pill=key=>pop.querySelectorAll('.dv-live-ticket[data-live-ticket="'+key+'"]')[0].querySelector('.dv-live-ticket-state').textContent;
  const waiting=()=>pop.querySelectorAll('.dv-live-waiting-detail').map(el=>el.textContent);
  assert.equal(pop.hidden,false);assert.equal(pill('BB-2'),'todo');assert.deepEqual(waiting(),['Waiting on EE-1 · blocked'],'precondition: BB-2 waits on EE-1');
  assert.ok(focus.el===pop.querySelector('.node-link-close'),'opening focuses Close');
  // A Jira refresh changes BB-2 and clears its upstream.
  const next=plain(fixed);next['BB-2'].state='active';next['EE-1'].state='done';api.apply(next);
  assert.equal(pop.hidden,false,'the refresh leaves the popover open');assert.equal(card().getAttribute('aria-expanded'),'true');
  assert.equal(pill('BB-2'),'active','the state line follows the refresh');assert.deepEqual(waiting(),[],'the waiting line follows the refresh');
  assert.ok(pop.contains(focus.el) && focus.el===pop.querySelector('.node-link-close'),'focus stays on Close');
  // Step changes (autoplay) and Live toggles repaint too.
  h.ctl.sections[0].sectionEl.dispatchEvent({type:'dv:stepchange'});h.flush();assert.equal(pop.hidden,false,'a step change leaves it open');
  api.setEnabled(false);api.setEnabled(true);assert.equal(pop.hidden,false,'a Live toggle leaves it open');
  // It closes only when its carrier is gone.
  h.view.querySelector('[data-dv-node="b"]').remove();h.ctl.sections[0].sectionEl.dispatchEvent({type:'dv:pathrender'});h.flush();
  assert.equal(pop.hidden,true,'a carrier that is gone closes its popover');
  api.destroy();
 }finally{focus.restore();}
});
test('#1253 item 5 Play does not stop at a step whose ticket did not exist yet on the Over time day',async()=>{
 const raw=overFixture();raw.page.sections[0].diagram.steps.push({id:'alpha',nodes:['a'],lane:'APP'});
 const h=harness(raw);mountStatus(h);const api=h.ctl.liveStatus;let beforeAdvance=null;
 h.ctl.sections[0].stepper={path:()=>h.C.diagramPathList(h.ctl.page.sections[0].diagram)[0].id,sourceIndex:()=>0,mode:()=>'ambient',pause(){},jumpSource(){return true;},onBeforeAdvance(fn){beforeAdvance=fn;return ()=>{};}};
 api.apply(overToday());await overOpen(h,0);h.flush();
 assert.equal(api.snapshot().states['AA-1'].noTicket,true,'precondition: AA-1 did not exist on the first day');
 assert.equal(api.snapshot().firstBlocker,false,'precondition: First blocker finds nothing to stop at');
 assert.equal(beforeAdvance(2),true,'a ticket that did not exist yet does not stop Play');
 api.overTimeDay(1);h.flush();assert.equal(beforeAdvance(2),false,'a blocked ticket still stops Play');
 api.destroy();
});
test('#1253 item 6 Edit is off while history loads, and a load that ends in Edit mode shows no past day',async()=>{
 let active=false,starts=0;const editor={state:()=>({editable:true,blocked:'',active,pending:0,saving:false,readOnly:false,notice:null}),onChange:()=>()=>{},rememberMap(){},lastMap:()=>null,question:()=>null,start(){starts++;active=true;}};
 const h=harness(overFixture(),{},{boardEditor:editor});mountStatus(h);const api=overReady(h.ctl.liveStatus);api.apply(overToday());
 const edit=()=>h.view.querySelector('button.dv-live-edit'),reason=()=>h.view.querySelector('.dv-live-edit-reason');
 let resolve;api.setHistory({load:()=>new Promise(done=>{resolve=done;})});
 overButton(h).dispatchEvent({type:'click'});await historySettle();assert.equal(api.snapshot().overTime.loading,true);
 assert.equal(edit().disabled,true,'Edit waits while history loads');assert.equal(reason().hidden,false);assert.equal(reason().textContent,'Editing is off while history loads.');
 edit().dispatchEvent({type:'click'});api.editStart();assert.equal(starts,0,'Edit mode cannot start while history loads');
 resolve({days:overDays()});await historySettle();assert.equal(api.snapshot().overTime.active,true);assert.equal(reason().textContent,'Editing is off while a past day is shown.');
 api.overTimeClose();await historySettle();assert.equal(edit().disabled,false);
 // Edit mode can still start without the button (a conflict replay turns it on): the load then shows no past day.
 api.setHistory({load:()=>new Promise(done=>{resolve=done;})});api.overTime();await historySettle();assert.equal(api.snapshot().overTime.loading,true);
 active=true;resolve({days:overDays()});await historySettle();h.flush();
 const over=api.snapshot().overTime;assert.equal(over.active,false,'no past day is shown while editing');assert.equal(over.loading,false);
 assert.match(over.error,/editing/i,'the reader is told why Over time did not open');
 assert.equal(h.view.querySelector('[data-dv-node="a"]').classList.contains('dv-live-done'),true,'the board keeps today\'s colours');
 api.destroy();
});
test('#1253 item 10 without a Jira provider the panel names what live status needs and lists the authored tickets and PRs',()=>{
 const raw=fixture();raw.page.sections[0].diagram.nodes.a.prs=['https://code.test/pull/7'];
 const h=harness(raw),{body}=mountStatus(h);assert.equal(h.ctl.liveStatus.snapshot().connection.state,'none','precondition: no provider');
 const text=textOf(body);
 assert.match(text,/Live ticket status needs a host with a Jira connector \(claude\.ai\)\./);
 for(const key of ['AA-1','BB-1','BB-2','CC-1','CC-2','EE-1','ZZ-1'])assert.ok(text.includes(key),key+' is listed');
 const hrefs=body.querySelectorAll('a').map(el=>el.getAttribute('href'));
 assert.ok(hrefs.includes('https://jira.test/browse/AA-1'),'a ticket links to Jira');assert.ok(hrefs.includes('https://code.test/pull/7'),'an authored PR is listed');
 // The note goes when a host supplies status.
 h.ctl.liveStatus.apply(fixed);assert.doesNotMatch(textOf(body),/needs a host with a Jira connector/);
 const p=harness(fixture(),{provider:()=>new Promise(()=>{})}),m=mountStatus(p);assert.doesNotMatch(textOf(m.body),/needs a host with a Jira connector/,'a host provider is connecting');
 h.ctl.liveStatus.destroy();p.ctl.liveStatus.destroy();
});
test('#1253 item 14 Over time keeps keyboard focus while history loads, then moves it to the day slider',async()=>{
 const focus=trackFocus();try{
  const h=harness(overFixture());mountStatus(h);const api=overReady(h.ctl.liveStatus);api.apply(overToday());
  let resolve,loads=0;api.setHistory({load:()=>{loads++;return new Promise(done=>{resolve=done;});}});
  const button=overButton(h);button.focus();button.dispatchEvent({type:'click'});await historySettle();
  assert.equal(api.snapshot().overTime.loading,true);
  assert.equal(button.disabled,false,'a disabled button would drop keyboard focus');assert.equal(button.getAttribute('aria-disabled'),'true');
  assert.ok(h.doc.activeElement===button);button.dispatchEvent({type:'click'});await historySettle();assert.equal(loads,1,'a click while loading starts nothing');
  resolve({days:overDays()});await historySettle();
  const slider=h.view.querySelector('input.dv-live-over-time-slider');assert.ok(slider);assert.ok(h.doc.activeElement===slider,'focus moves to the day slider');
  api.destroy();
 }finally{focus.restore();}
});
test('#1253 item 20 an empty Activity section says None yet',()=>{
 const h=harness(fixture()),api=h.ctl.liveStatus;api.apply(fixed);const {body}=mountStatus(h);
 const section=()=>{const heading=body.querySelectorAll('h3').find(el=>el.textContent==='Activity'),parent=heading.parentNode,at=parent.children.indexOf(heading);return parent.children.slice(at+1,at+3).map(textOf).join(' ');};
 assert.equal(api.snapshot().activity.length,0,'precondition: the first apply logs nothing');
 assert.match(section(),/None yet/);
 const next=plain(fixed);next['AA-1'].state='done';api.apply(next);assert.equal(api.snapshot().activity.length,1);assert.doesNotMatch(section(),/None yet/);
 api.destroy();
});

/* A real board editor (src/viewer/board-edit.js) whose render re-renders the board: the old controller and
   panel are destroyed and a new pair is built from the new text, as boot.flowview.js rerender does. */
async function editBoard(raw=fixture(),{reject=null}={}){
 const S={console,URL};vm.runInNewContext(entrypoint('standalone').body,S);
 const store=new Map(),published=[],board={published};
 const win={console,location:{pathname:'/board/'},addEventListener(){},removeEventListener(){},
  sessionStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  claude:{use:async name=>name==='artifact'?{publish:async files=>{published.push(files['flowspec.json'].content);if(reject)throw {code:reject,message:'mock '+reject};}}:name==='user'?{canEdit:async()=>true,me:async()=>({id:'u1',name:'Reader'})}:null}};
 const mount=text=>{
  if(board.h){board.h.ctl.liveStatus.destroy();board.m.destroy();}
  board.h=harness(JSON.parse(text),{},{boardEditor:board.editor});board.m=mountStatus(board.h);return null;
 };
 const text=JSON.stringify(raw,null,2);board.editor=S.createBoardEditor({win,text,specFile:'flowspec.json',render:mount});
 mount(text);board.h.ctl.liveStatus.apply(fixed);await settle();await settle();
 board.control=name=>board.m.body.querySelector('button.dv-live-'+name);
 board.runTimers=()=>runTimers(board.h);
 return board;
}
test('#1253 item 14 Edit, Done, Save and Discard hand keyboard focus to the control that replaces them',async()=>{
 const focus=trackFocus();try{
  const b=await editBoard(),visible=el=>el && !el.hidden && !el.disabled;
  assert.ok(visible(b.control('edit')),'precondition: Edit is offered');
  b.control('edit').focus();b.control('edit').dispatchEvent({type:'click'});
  assert.equal(b.editor.state().active,true);assert.equal(b.control('edit').hidden,true);
  assert.ok(focus.el===b.control('edit-done'),'Edit hands focus to Done');
  b.control('edit-done').dispatchEvent({type:'click'});assert.equal(b.editor.state().active,false);
  assert.ok(focus.el===b.control('edit'),'Done hands focus to Edit');
  b.control('edit').dispatchEvent({type:'click'});assert.equal(b.editor.add({section:0,kind:'node',id:'a'},'NEW-1'),true);
  assert.ok(visible(b.control('save')));b.control('save').focus();b.control('save').dispatchEvent({type:'click'});
  assert.ok(focus.el===b.control('save'),'Save keeps focus while it saves');
  await settle();await settle();assert.equal(b.published.length,1,'saved');
  assert.ok(visible(b.control('edit')));assert.ok(focus.el===b.control('edit'),'after Save, focus is on Edit in the re-rendered board');
  b.control('edit').dispatchEvent({type:'click'});b.editor.add({section:0,kind:'node',id:'a'},'NEW-2');
  b.control('discard').focus();b.control('discard').dispatchEvent({type:'click'});assert.equal(b.editor.state().pending,0);
  assert.ok(focus.el===b.control('edit'),'after Discard, focus is on Edit in the re-rendered board');
  b.h.ctl.liveStatus.destroy();
 }finally{focus.restore();}
});
test('#1253 item 15 Remove and Clear Missing work return focus to the edited carrier after the board re-renders',async()=>{
 const focus=trackFocus();try{
  const raw=fixture();raw.page.sections[0].diagram.nodes.c.missingWork=true;
  const b=await editBoard(raw);b.control('edit').dispatchEvent({type:'click'});
  const press=el=>el.dispatchEvent({type:'click',preventDefault(){},stopPropagation(){}});
  carrierClick(b.h,cardOf(b.h,'b'));
  let pop=b.h.view.querySelector('.dv-live-popover');press(pop.querySelectorAll('button.dv-live-remove').find(el=>el.getAttribute('aria-label').startsWith('Remove BB-2 ')));b.runTimers();
  assert.equal(b.editor.state().pending,1,'BB-2 was removed');
  assert.ok(focus.el===cardOf(b.h,'b'),'focus is on the edited node in the new render');
  carrierClick(b.h,cardOf(b.h,'c'));
  pop=b.h.view.querySelector('.dv-live-popover');press(pop.querySelector('button.dv-live-clear-missing'));b.runTimers();
  assert.equal(b.editor.state().pending,2,'the marker was cleared');
  assert.ok(focus.el===cardOf(b.h,'c'),'focus is on the cleared node');
  // A node without tickets keeps its work-status button, so it takes focus too.
  carrierClick(b.h,cardOf(b.h,'a'));
  pop=b.h.view.querySelector('.dv-live-popover');press(pop.querySelector('button.dv-live-remove'));b.runTimers();
  assert.equal(b.editor.state().pending,3);assert.ok(focus.el===cardOf(b.h,'a'),'focus is on the node that lost its last ticket');
  // An edge without tickets is no button at all: focus goes to Save, which shows the new count.
  carrierClick(b.h,b.h.view.querySelector('text.lbl'));
  pop=b.h.view.querySelector('.dv-live-popover');assert.ok(pop.getAttribute('aria-label').startsWith('Live tickets for '),'the edge popover is open');press(pop.querySelector('button.dv-live-remove'));b.runTimers();
  assert.equal(b.editor.state().pending,4);assert.equal(b.h.view.querySelectorAll('.dv-live-target').some(el=>el.getAttribute('data-dv-edge')!=null),false,'precondition: the edge is no longer a button');
  assert.ok(focus.el===b.control('save'),'focus falls back to Save');assert.equal(b.control('save').textContent,'Save 4 changes');
  b.h.ctl.liveStatus.destroy();
 }finally{focus.restore();}
});
test('#1253 item 15 a first change that leaves no carrier button hands focus to Save 1 change',async()=>{
 const focus=trackFocus();try{
  const b=await editBoard();b.control('edit').dispatchEvent({type:'click'});
  carrierClick(b.h,b.h.view.querySelector('text.lbl'));
  const pop=b.h.view.querySelector('.dv-live-popover');pop.querySelector('button.dv-live-remove').dispatchEvent({type:'click',preventDefault(){},stopPropagation(){}});b.runTimers();
  assert.equal(b.editor.state().pending,1);
  assert.ok(focus.el===b.control('save'),'focus is on Save, not on Done, which the first change hides');
  assert.equal(b.control('save').hidden,false);assert.equal(b.control('save').textContent,'Save 1 change');
  b.h.ctl.liveStatus.destroy();
 }finally{focus.restore();}
});
test('#1253 review: an edit hand-off never takes focus from where the reader moved, and a read-only answer focuses its notice',async()=>{
 const focus=trackFocus();try{
  let b=await editBoard(fixture(),{reject:'network'});b.control('edit').dispatchEvent({type:'click'});b.editor.add({section:0,kind:'node',id:'a'},'NEW-1');
  b.control('save').focus();b.control('save').dispatchEvent({type:'click'});
  const elsewhere=cardOf(b.h,'b');elsewhere.focus();await settle();await settle();
  assert.match(b.editor.state().notice.text,/Save failed/);assert.ok(focus.el===elsewhere,'the failed save leaves focus where the reader put it');
  b.h.ctl.liveStatus.destroy();
  b=await editBoard(fixture(),{reject:'not_writer'});b.control('edit').dispatchEvent({type:'click'});b.editor.add({section:0,kind:'node',id:'a'},'NEW-1');
  b.control('save').focus();b.control('save').dispatchEvent({type:'click'});await settle();await settle();
  const notice=b.m.body.querySelector('.dv-live-edit-notice');assert.match(notice.textContent,/read-only here/);
  assert.ok(focus.el===notice,'focus is on the read-only notice, not on the page');assert.equal(notice.getAttribute('tabindex'),'-1','the notice takes focus without becoming a Tab stop');
  b.h.ctl.liveStatus.destroy();
 }finally{focus.restore();}
});
test('#1253 review: the post-drop question stays open through a repaint without taking focus back',async()=>{
 const focus=trackFocus();try{
  const raw=fixture();raw.page.sections[0].diagram.nodes.c.missingWork=true;
  const b=await editBoard(raw);b.control('edit').dispatchEvent({type:'click'});
  assert.equal(b.editor.add({section:0,kind:'node',id:'c'},'NEW-1'),true);
  const pop=b.h.view.querySelector('.dv-live-popover');assert.equal(pop.hidden,false);assert.ok(pop.querySelector('.dv-live-question'),'the question opens');
  const elsewhere=cardOf(b.h,'b');elsewhere.focus();
  const next=plain(fixed);next['CC-1']={state:'done'};b.h.ctl.liveStatus.apply(next);
  assert.ok(b.h.view.querySelector('.dv-live-popover')===pop && pop.hidden===false,'the same popover stays open');assert.ok(pop.querySelector('.dv-live-question'),'still asking');
  assert.ok(focus.el===elsewhere,'the repaint does not pull focus to Close');
  b.h.ctl.liveStatus.destroy();
 }finally{focus.restore();}
});
test('#1253 review: a board with only Missing work and no ticket references shows no Jira connector note',()=>{
 const h=harness({page:{sections:[{id:'main',diagram:{nodes:{a:{title:'A',missingWork:true}},rows:[['a']],panels:[{id:'status',type:'live-status',title:'Status'}]}}]}}),{body}=mountStatus(h);
 assert.equal(h.ctl.liveStatus.snapshot().noProvider,null);assert.doesNotMatch(textOf(body),/needs a host with a Jira connector/);h.ctl.liveStatus.destroy();
});
test('#1253 review: a repaint keeps focus on a link inside the popover\'s Metrics section',async()=>{
 const focus=trackFocus();try{
  const {h,api,card,pop}=await roundFivePopup();
  h.view.dispatchEvent({type:'click',target:card(),button:0,preventDefault(){},stopPropagation(){}});
  const link=pop().querySelector('.dv-live-production').querySelector('a');assert.ok(link,'precondition: the Metrics section has a link');
  link.focus();h.ctl.telemetry.apply({'a->b':{signals:{rate:{value:5500},errors:{value:40}}}});h.flush();
  assert.equal(pop().hidden,false);assert.ok(h.doc.activeElement===link && link.isConnected,'the focused Metrics link keeps focus through the repaint');
  api.destroy();
 }finally{focus.restore();}
});
/* #1252 item 11: typing the next trace ID (or a Trace start or end) keeps the shown trace and its span focus; a Load
   that fails keeps it too. Only a successful Load or Clear replaces it. */
test('#1252 typing in Trace ID keeps the loaded trace and its focus; a failed Load keeps it too',async()=>{
 const {h,api,m,calls}=compactHarness(['prod']);
 api.setDirectTraceField({field:'input',value:COMPACT_ID});await api.loadDirectTrace(false);h.flush();
 let selected=api.snapshot().trace.selected;const span=selected.exemplar.spans[1].id;assert.equal(api.selectTraceSpan({context:selected.context,spanId:span}),true);
 for(const [field,value] of [['input','5ab0'],['start','-6h'],['end','']]){api.setDirectTraceField({field,value});h.flush();
  selected=api.snapshot().trace.selected;assert.ok(selected && selected.manual,field+': the trace stays');assert.equal(selected.exemplar.traceId,COMPACT_ID);assert.equal(selected.focus && selected.focus.spanId,span,field+': the span focus stays');
  assert.ok(m.body.querySelector('.dv-trace-slot .dv-trace-selected'),field+': still drawn');}
 api.setDirectTraceField({field:'start',value:''});api.setDirectTraceField({field:'input',value:'f'.repeat(32)});assert.equal(await api.loadDirectTrace(false),null,'a trace whose ID does not match fails');h.flush();
 selected=api.snapshot().trace.selected;assert.ok(selected && selected.exemplar.traceId===COMPACT_ID,'the failed Load keeps the shown trace');assert.ok(api.snapshot().trace.direct.report.error,'and reports its error');
 assert.equal(selected.focus && selected.focus.spanId,span,'review c1: and its span focus');
 api.clearDirectTrace();h.flush();assert.equal(api.snapshot().trace.selected,null,'Clear removes it');assert.equal(calls.length,2);
 api.destroy();
});
/* #1252 item 13: Enter in "Trace ID or link" runs Load trace when the button is enabled. */
test('#1252 Enter in Trace ID or link runs Load trace',async()=>{
 const {h,api,m,calls}=compactHarness(['prod']),input=()=>m.body.querySelectorAll('input').find(el=>el.getAttribute('aria-label')==='Trace ID or link');
 let prevented=0;const enter=()=>input().dispatchEvent({type:'keydown',key:'Enter',preventDefault(){prevented++;}});
 enter();for(let i=0;i<6;i++)await settle();assert.equal(calls.length,0,'an empty box loads nothing');
 // The successful Load reveals the trace (scrollIntoView after getClientRects), which the test DOM does not lay out.
 const proto=Object.getPrototypeOf(input()),had=Object.prototype.hasOwnProperty.call(proto,'getClientRects');proto.getClientRects=()=>[];
 try{api.setDirectTraceField({field:'input',value:COMPACT_ID});h.flush();enter();for(let i=0;i<6;i++)await settle();h.flush();
  assert.equal(calls.length,1,'Enter loads');assert.ok(prevented>0);assert.equal(api.snapshot().trace.selected.exemplar.traceId,COMPACT_ID);
  // Review c1: Enter in Trace start and Trace end loads too; a held key's repeats and Enter during a Load do not.
  const field=name=>m.body.querySelectorAll('input').find(el=>el.getAttribute('aria-label')===name);
  for(const name of ['Trace start','Trace end']){const before=calls.length;field(name).dispatchEvent({type:'keydown',key:'Enter',preventDefault(){}});for(let i=0;i<6;i++)await settle();h.flush();assert.equal(calls.length,before+1,'Enter in '+name+' loads');}
  input().dispatchEvent({type:'keydown',key:'Enter',repeat:true,preventDefault(){}});for(let i=0;i<6;i++)await settle();assert.equal(calls.length,3,'a repeated key does not load again');
  const busy=api.loadDirectTrace(false);h.flush();assert.equal(api.snapshot().trace.direct.busy,true);input().dispatchEvent({type:'keydown',key:'Enter',preventDefault(){}});await busy;for(let i=0;i<6;i++)await settle();
  assert.equal(calls.length,4,'Enter while a Load runs does nothing');}
 finally{if(!had)delete proto.getClientRects;api.destroy();}
});
/* #1252 item 22: a log line's time is shown in local time like the trace card, with the UTC time in its title. */
test('#1252 log result times are local, with UTC in the title',async()=>{
 const profile=JSON.parse(JSON.stringify(require('./fixtures/trace-connection-profile.json')));
 const raw={tracking:{telemetry:{grafana:{loki:'logs'},lookups:{camera:{label:'Camera model',query:'{app="cams"} | cameraModel="$value"'}},traceConnections:{company:profile}}},sections:[{id:'main',diagram:{nodes:{a:{}},rows:[['a']]}}]};
 const line={timestamp:'1794044533123456789',line:'Handling camera stats message',labels:{},structuredMetadata:{cameraModel:'arch',trace_id:COMPACT_ID}};
 const h=harness(raw,{},{telemetry:{provider:()=>Promise.resolve({}),directTrace:{describe(){},call(){},logsConnector:async()=>'Grafana',queryLogs:async()=>({data:[line]})}}}),api=h.ctl.liveStatus;
 api.setStatusMode('trace');for(let i=0;i<6;i++)await settle();const m=mountStatus(h);api.setLogLookupField({field:'value',value:'arch'});await api.findLogLines();h.flush();
 const time=m.body.querySelector('.dv-trace-log-row .dv-trace-log-time');assert.ok(time,'one row');
 assert.equal(time.getAttribute('title'),'2026-11-07 09:42:13 UTC','UTC said once');assert.equal(time.getAttribute('datetime'),'2026-11-07T09:42:13.123Z');
 const d=new Date('2026-11-07T09:42:13.123Z');assert.equal(time.textContent,h.C.liveStatusReadableTime('2026-11-07T09:42:13.123Z',true));
 assert.ok(time.textContent.includes(d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'})),'local time with seconds: '+time.textContent);assert.doesNotMatch(time.textContent,/Z$/);
 api.destroy();
});

/* #1252 item 12 (panel): with no Grafana connector the search offers Check again; it keeps its place (aria-disabled,
   "Checking…") while it looks, and a connector added meanwhile enables Find. */
test('#1252 Check again finds a Grafana connector added after the panel opened',async()=>{
 const profile=JSON.parse(JSON.stringify(require('./fixtures/trace-connection-profile.json')));let server=null,release=null;
 const raw={tracking:{telemetry:{grafana:{loki:'logs'},lookups:{camera:{label:'Camera model',query:'{app="cams"} | cameraModel="$value"'}},traceConnections:{company:profile}}},sections:[{id:'main',diagram:{nodes:{a:{}},rows:[['a']]}}]};
 const h=harness(raw,{},{telemetry:{provider:()=>Promise.resolve({}),directTrace:{describe(){},call(){},logsConnector:async()=>{if(release)await new Promise(r=>{const go=release;release=null;go(r);});return server;},queryLogs:async()=>({data:[]})}}}),api=h.ctl.liveStatus;
 api.setStatusMode('trace');for(let i=0;i<6;i++)await settle();const m=mountStatus(h);h.flush();
 const again=()=>m.body.querySelector('button.dv-trace-log-recheck'),findButton=()=>m.body.querySelector('.dv-trace-log-search button.dv-trace-log-find');
 assert.ok(again(),'Check again is offered');assert.equal(again().textContent,'Check again');assert.equal(again().title,'Look for the Grafana connector again');assert.equal(findButton().disabled,true);
 // Review c1: a look that still finds nothing says so, with the time.
 again().dispatchEvent({type:'click'});for(let i=0;i<6;i++)await settle();h.flush();
 const checked=m.body.querySelectorAll('.dv-trace-logs p').find(p=>/^Still not found \(checked \d\d:\d\d:\d\d/.test(p.textContent));assert.ok(checked,'Still not found (checked HH:MM:SS)');assert.equal(checked.getAttribute('role'),'status');
 const button=again();server='Grafana';let resume;release=r=>{resume=r;};button.dispatchEvent({type:'click'});for(let i=0;i<6;i++)await settle();h.flush();
 assert.equal(again(),button,'the same button while it looks');assert.deepEqual([!!button.disabled,button.getAttribute('aria-disabled'),button.textContent],[false,'true','Checking…']);
 resume();for(let i=0;i<6;i++)await settle();h.flush();
 assert.equal(again(),null,'found: no Check again');assert.equal(findButton().disabled,false,'Find is enabled');
 api.destroy();
});

/* #1256 review c1 MAJOR: Cancel request during a Load stops it and brings the shown trace back with its span focus;
   with nothing loading, Clear loaded trace still clears. */
test('#1252 Cancel request during a Load keeps the shown trace and its focus; Clear clears',async()=>{
 const recorded=fs.readFileSync('tests/fixtures/provider-traces/honeycomb-trace.txt','utf8'),calls=[];let hold=null;
 const h=harness(compactBoard(['prod']),{},{telemetry:{provider:()=>Promise.resolve({}),directTrace:{describe:async()=>compactTool(),call:async(request,args)=>{calls.push(args);if(hold)await hold.promise;return {payload:recorded};}}}}),api=h.ctl.liveStatus,m=mountStatus(h);
 api.setDirectTraceField({field:'input',value:COMPACT_ID});await api.loadDirectTrace(false);h.flush();
 let selected=api.snapshot().trace.selected;const span=selected.exemplar.spans[1].id;assert.equal(api.selectTraceSpan({context:selected.context,spanId:span}),true);
 hold={};hold.promise=new Promise(r=>hold.release=r);api.setDirectTraceField({field:'input',value:'5ab0'.repeat(8)});const pending=api.loadDirectTrace(false);for(let i=0;i<6;i++)await settle();h.flush();
 assert.equal(api.snapshot().trace.direct.busy,true,'B is loading');
 const cancel=m.body.querySelectorAll('button').find(b=>b.textContent==='Cancel request');assert.ok(cancel,'Cancel request is offered');cancel.dispatchEvent({type:'click'});h.flush();
 selected=api.snapshot().trace.selected;assert.ok(selected && selected.manual && selected.exemplar.traceId===COMPACT_ID,'A is shown again at once');
 // Review c2: the reader focuses another span of A before B's late answer; that focus is kept.
 const other=selected.exemplar.spans[2].id;assert.equal(api.selectTraceSpan({context:selected.context,spanId:other}),true);
 const release=hold.release;hold=null;release();assert.equal(await pending,null,'B is stopped');for(let i=0;i<6;i++)await settle();h.flush();
 selected=api.snapshot().trace.selected;assert.ok(selected && selected.manual && selected.exemplar.traceId===COMPACT_ID,'A stays');
 assert.equal(selected.focus && selected.focus.spanId,other,'the reader\'s newer focus is not replaced');assert.equal(api.snapshot().trace.direct.report,null,'no report');
 const clear=m.body.querySelectorAll('button').find(b=>b.textContent==='Clear loaded trace');assert.ok(clear);clear.dispatchEvent({type:'click'});h.flush();
 assert.equal(api.snapshot().trace.selected,null,'idle: Clear loaded trace clears');assert.equal(calls.length,2);
 api.destroy();
});
/* #1280 light check for fixed-size tiles (Chuck 2026-11-10: the stretching layout is the case that matters; elsewhere the
   panel body scrolls as a whole): the Spans list's own CSS caps nothing and scrolls nothing, and no rule fills a tile with it. */
test('#1280 the Spans list has no height cap or scroll of its own in the panel CSS',()=>{
 const h=harness(fixture()),styles=h.C.PanelRegistry.get('live-status').styles,css=typeof styles==='string'?styles:(Array.isArray(styles)?styles:[]).map(s=>typeof s==='string'?s:s.css || '').join('\n');
 assert.ok(css.includes('.dv-trace-waterfall{'),'the waterfall rule is in the panel CSS');
 const own=css.match(/\.dv-trace-waterfall\{[^}]*\}/g) || [],rules=css.match(/[^{}]*\.dv-trace-waterfall[^{]*\{[^}]*\}/g) || [];
 assert.ok(own.length>=1);for(const rule of rules)assert.doesNotMatch(rule.slice(rule.indexOf('{')),/max-height|overflow|contain:size|flex:1 1 0/,rule.trim());
 assert.ok(!css.includes('dv-trace-fill'),'no tile fill rule');
 h.ctl.liveStatus.destroy();
});
/* #1280 review: with no scrolling ancestor below the page, a span focus the reader asked for scrolls the page by the least
   needed (scrollIntoView nearest); an automatic focus (the failed span on load passes auto) never scrolls the page. */
test('#1280 an automatic span focus never scrolls the page; a reader\'s focus scrolls it by the least needed',async()=>{
 const {h,api,m}=await stage2Loaded();
 const proto=Element.prototype,rects=Object.getOwnPropertyDescriptor(proto,'getClientRects'),bound=proto.getBoundingClientRect,view=h.doc.defaultView,calls=[];
 proto.getClientRects=function(){return [1];};proto.getBoundingClientRect=function(){return {top:900,bottom:930,left:0,right:100,width:100,height:30};};
 proto.scrollIntoView=function(options){calls.push([this.className,options]);};h.doc.defaultView={getComputedStyle:()=>({overflowY:'visible'})};
 try{
  const t=api.snapshot().trace.selected;
  assert.equal(api.selectTraceSpan({context:t.context,spanId:t.exemplar.spans[41].id,auto:true}),true);h.flush();
  assert.equal(api.snapshot().trace.selected.focus.auto,true,'the focus says it is automatic');
  assert.equal(calls.filter(c=>/dv-trace-span-item/.test(c[0])).length,0,'an automatic focus does not scroll the page');
  const t2=api.snapshot().trace.selected;assert.equal(api.selectTraceSpan({context:t2.context,spanId:t2.exemplar.spans[45].id}),true);h.flush();
  assert.equal(api.snapshot().trace.selected.focus.auto,false);
  const page=calls.filter(c=>/dv-trace-span-item/.test(c[0]));assert.equal(page.length,1,'a reader\'s focus scrolls the page once');assert.deepEqual(plain(page[0][1]),{block:'nearest',inline:'nearest'});
 }finally{if(rects)Object.defineProperty(proto,'getClientRects',rects);else delete proto.getClientRects;proto.getBoundingClientRect=bound;delete proto.scrollIntoView;h.doc.defaultView=view;api.destroy();}
});
