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
 const C={URL,console,AbortController,document:doc,window:win,requestAnimationFrame:f=>schedule(frames,f),cancelAnimationFrame:id=>frames.delete(id),setTimeout:win.setTimeout,clearTimeout:win.clearTimeout,setInterval:win.setInterval,clearInterval:win.clearInterval,
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
 assert.deepEqual(events[0].counts,{todo:1,active:1,done:1,blocked:1,missing:1});assert.equal(events[0].updatedAt,'2026-10-26T10:00:00Z');assert.equal(events[0].states['AA-1'].state,'active');assert.equal(api.state('AA-1').state,'active');
 api.setEnabled(false);assert.equal(api.enabled(),false);assert.equal(view.querySelectorAll('.dv-live-active,.dv-live-blocked,.dv-live-missing').length,0);api.setEnabled(true);assert.ok(view.querySelector('path.edge').classList.contains('dv-live-blocked'));
 api.apply({'AA-1':{state:'nonsense'},'BB-1':{state:'done'}});assert.equal(api.state('AA-1'),null);assert.doesNotMatch(view.querySelector('[data-dv-node="a"]').className,/dv-live-/);assert.ok(view.querySelector('[data-dv-node="b"]').classList.contains('dv-live-done'));
 api.clear();assert.equal(view.querySelectorAll('.dv-live-done,.dv-live-badge').length,0);assert.deepEqual(events.at(-1).counts,{todo:0,active:0,done:0,blocked:0,missing:0});assert.equal(events.length,5);
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
 const root=host.querySelector('.dv-live-head'),toggle=root.querySelector('.dv-live-toggle');assert.equal(root.hidden,false);assert.equal(root.querySelector('[data-live-count="done"]').textContent,'done 1');assert.equal(root.querySelector('.dv-live-note').textContent,'Detail loaded');assert.equal(root.querySelector('time'),null,'V8 no ticket-change time in the header (#769)');assert.equal(h.ctl.liveStatus.snapshot().updatedAt,'2026-10-26T12:00:00Z');
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
 assert.ok(h.view.querySelector('.dv-live-verdict')===null,'the old verdict line is gone');
 const epic=body.querySelector('.dv-live-epic');assert.ok(epic,'epic header box');assert.ok(body.children[0]===epic,'the epic box is first in the body');
 assert.equal(epic.querySelector('a.dv-live-epic-key').getAttribute('href'),'https://jira.test/browse/EP-1');assert.equal(epic.querySelector('.dv-live-epic-key').textContent,'EP-1');
 assert.equal(epic.querySelector('.dv-live-epic-title').textContent,'Connected doorbell');assert.equal(epic.querySelector('.dv-live-epic-state').textContent,'active');
 assert.equal(epic.querySelector('.dv-live-epic-progress').textContent,'0 of 7 stories done · 5 of 7 on diagram');assert.equal(epic.querySelector('.dv-live-epic-counts').textContent,'1 blocked · 3 waiting · 2 outside epic');
 assert.ok(epic.querySelector('.dv-live-completion'),'carrier completion ring lives in the box');assert.equal(h.view.querySelector('.dv-live-head').querySelectorAll('.dv-live-epic').length,0,'never in the header or title bar');
 const table=body.querySelector('table.dv-live-tickets');assert.deepEqual(table.querySelectorAll('th').map(el=>el.textContent),['Key','Title','State','Owner','Depends on','PRs']);
 const rows=table.querySelectorAll('tr[data-live-ticket]'),row=key=>rows.find(el=>el.getAttribute('data-live-ticket')===key),coverage=key=>table.querySelector('tr[data-live-coverage-for="'+key+'"]');
 assert.deepEqual(rows.map(el=>el.getAttribute('data-live-ticket')),['HW-2','GONE-1','HW-1','OUT-9','BE-1','FW-1','UX-1']);
 assert.equal(coverage('FW-1').querySelector('td').getAttribute('colspan'),'6');
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
 assert.equal(table.querySelectorAll('th').map(el=>el.textContent).indexOf('On diagram'),-1,'coverage stays a chip row');
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
 api.setEnabled(false);assert.equal(card.getAttribute('tabindex'),null);assert.equal(card.getAttribute('role'),null);api.setEnabled(true);assert.equal(card.getAttribute('tabindex'),'0');
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
 api.setEnabled(false);assert.equal(h.view.querySelectorAll('.dv-live-pointer').length,0);click(line);assert.equal(h.view.querySelector('.dv-live-popover').hidden,true);
 api.setEnabled(true);click(line);assert.equal(h.view.querySelector('.dv-live-popover').hidden,false);
 api.clear();assert.equal(h.view.querySelectorAll('.dv-live-pointer,.dv-live-target,.dv-live-comm-failure').length,0);click(line);assert.equal(h.view.querySelector('.dv-live-popover').hidden,true);
 api.apply({'EE-1':{state:'done'}});h.ctl.sections[0].sectionEl.dispatchEvent({type:'dv:pathrender'});h.flush();click(line);assert.equal(h.view.querySelector('.dv-live-popover').hidden,false);
 api.destroy();assert.equal(h.view.querySelectorAll('.dv-live-pointer,.dv-live-target').length,0);
 const u=harness(data);u.view.querySelector('text.lbl').remove();u.ctl.liveStatus.apply({'EE-1':{state:'done'}});
 const path=u.view.querySelector('path.edge');assert.equal(path.getAttribute('tabindex'),'0');assert.equal(u.view.querySelector('path.halo').getAttribute('tabindex'),null);
 u.view.dispatchEvent({type:'click',target:path,button:0,preventDefault(){},stopPropagation(){}});assert.equal(u.view.querySelector('.dv-live-popover').hidden,false);
 u.ctl.liveStatus.apply(fixed);const breakTarget=u.view.querySelector('.dv-live-comm-failure');assert.equal(path.getAttribute('tabindex'),null);assert.equal(breakTarget.getAttribute('tabindex'),'0');assert.equal(breakTarget.getAttribute('role'),'button');
 u.view.dispatchEvent({type:'keydown',target:breakTarget,key:'Enter',preventDefault(){},stopPropagation(){}});assert.equal(u.view.querySelector('.dv-live-popover').hidden,false);
 u.ctl.liveStatus.clear();assert.equal(u.view.querySelectorAll('.dv-live-pointer,.dv-live-target,.dv-live-comm-failure').length,0);
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
test('P4 text on live fills follows the engine step-colour contrast rule in light and dark skins',()=>{
 const C={URL};vm.runInNewContext(entrypoint('native').source,C);const css=fs.readFileSync('src/style.core.css','utf8');
 const block=(selector)=>{const at=css.indexOf(selector+'{--dv-live-todo:');assert.ok(at>=0,selector);return css.slice(at,css.indexOf('}',at));};
 for(const selector of [':root','.sk-aurora:not(.sk-editorial):not(.sk-pastel)']){
  const body=block(selector),on=(/--dv-live-on:(#[0-9A-Fa-f]{6})/.exec(body) || /--dv-live-on:(#[0-9A-Fa-f]{6})/.exec(block(':root')))[1];
  for(const state of ['todo','active','done','blocked','missing']){const fill=new RegExp('--dv-live-'+state+':(#[0-9A-Fa-f]{6})').exec(body)[1];assert.equal(C.stepCircleInk(fill.toLowerCase()),on.toLowerCase(),selector+' '+state);}
 }
 assert.match(css,/--step-ink:var\(--dv-live-on\)!important/);assert.match(fs.readFileSync('src/panels/types/live-status.js','utf8'),/\.dv-live-count\{[^}]*color:var\(--dv-live-on\)/);
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
test('P2 chunks of 25 keys preserve order in three batches of at most ten',()=>{
 const C=providerContext();assert.equal(typeof C.liveStatusJiraChunks,'function');const keys=Array.from({length:25},(_,i)=>'AA-'+i);
 const chunks=plain(C.liveStatusJiraChunks(keys));assert.deepEqual(chunks.map(c=>c.length),[10,10,5]);assert.deepEqual(chunks.flat(),keys);assert.deepEqual(plain(C.liveStatusJiraChunks([])),[]);
});
test('P1 P9 provider is standalone only and inert without runtime, refs, namespace or with host provider',async()=>{
 assert.match(entrypoint('standalone').body,/function wireLiveStatusClaude\(/);
 for(const name of ['native','workbench','forge'])assert.doesNotMatch(entrypoint(name).body,/function wireLiveStatusClaude\(/);
 assert.match(fs.readFileSync('src/boot.flowview.js','utf8'),/wireArtifactComments\(ctl, view, window\);\s*(?:if[^\n]+)?wireLiveStatusClaude\(ctl, page, window\)/);
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
 for(let i=0;i<6;i++){const w=h.watches[i];assert.equal(w.tool,'searchJiraIssuesUsingJql');assert.equal(w.input.maxResults,10);assert.deepEqual(w.input.fields,['summary','status','assignee','updated','issuelinks','parent','issuetype']);assert.deepEqual(w.opts,{refetchInterval:60000});assert.equal(w.input.jql,'key in ('+keys.slice(Math.floor(i/2)*10,Math.floor(i/2)*10+10).join(', ')+')'+(i%2?' AND Flagged = Impediment':''));}
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
  const text=fs.readFileSync(file,'utf8');assert.match(text,/server: "Atlassian"/);assert.match(text,/"getAccessibleAtlassianResources", "searchJiraIssuesUsingJql"/);assert.match(text,/comments: \{"composer_only": true, "customAnchors": true\}/);
  assert.match(text,/exact display name/);assert.doesNotMatch(text,/name it exactly \*\*Atlassian MCP\*\*/);
 }
 assert.match(fs.readFileSync('deploy/cloudflare/mock-atlassian-mcp/README.md','utf8'),/directory connector/);
 assert.match(fs.readFileSync('docs/tab-views.md','utf8'),/live-status.md#publishing-as-a-claudeai-artifact/);
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
test('B1 direct ticket selection preserves aliases, edge tickets and broader endpoint rollups',()=>{
 const {C}=harness(),d={nodes:{a:{tickets:['AA-1','SH-1']},b:{tickets:['BB-1','SH-1']},text:{type:'text',text:'Note',tickets:['TT-1']}},edges:[{from:'a',to:'b',tickets:['EE-1','SH-1']}]};
 for(const step of [{edge:'a->b'},{edges:['a->b']},{failures:{'a->b':'blocked'}},{failures:{'a->b':'dropped'}}]){
  assert.deepEqual(plain(C.liveStatusStepTickets(d,step,true)),['EE-1','SH-1']);
  assert.deepEqual(plain(C.liveStatusStepTickets(d,{...step,nodes:['a','a','text']},true)),['EE-1','SH-1','AA-1']);
  assert.deepEqual(plain(C.liveStatusStepTickets(d,step)),['EE-1','SH-1','AA-1','BB-1']);
  assert.deepEqual(plain(C.liveStatusStepCarriers(d,step).map(carrier=>carrier.id)),['a->b','a','b']);
  assert.equal(C.liveStatusStep(d,step,{'AA-1':{state:'blocked'}}),'blocked');
  assert.equal(C.liveStatusCaption(d,step,{'AA-1':{state:'blocked',detail:'Endpoint work'}}),'BLOCKED · AA-1 · Endpoint work');
  assert.equal(C.liveStatusCaption(d,step,{'BB-1':{state:'missing'}}),'MISSING · BB-1');
 }
 assert.deepEqual(plain(C.liveStatusStepTickets(d,{nodes:['a','text']},true)),['AA-1','SH-1']);
 assert.deepEqual(plain(C.liveStatusStepTickets(d,{nodes:['text']},true)),[]);
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
 assert.equal(C.liveStatusCaption(d,step,{'AA-1':{state:'active'},'BB-1':{state:'todo'}}),'IN PROGRESS · 2 tickets');
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

test('B5 change class selects the card pulse without targeting the positioned node group',()=>{
 const h=harness(fixture()),api=h.ctl.liveStatus,node=h.view.querySelector('g.node[data-dv-node="a"]');
 node.setAttribute('transform','translate(320 180)');api.apply({'AA-1':{state:'todo'}});api.apply({'AA-1':{state:'active'}});
 assert.ok(node.matches('.node.dv-live-changed'));
 assert.ok(node.querySelector('.card'),'the changed carrier owns the CSS pulse target');
 const css=fs.readFileSync('src/style.core.css','utf8');
 assert.match(css,/\.node\.dv-live-changed \.card,\s*path\.edge\.dv-live-changed\{[^}]*animation:dvnodepulse/);
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
test('E6 Tickets table orders states includes columns authored PRs lane stripe and coverage focus',()=>{
 const h=harness(epicFixture()),api=h.ctl.liveStatus;mountStatus(h);
 api.apply({'AA-1':{state:'done',epic:'EP-1',title:'Client work',assignee:'Alex',prs:{count:2,state:'declined'}},'BB-1':{state:'todo'},'CC-1':{state:'active',epic:'EP-1'},'DD-1':{state:'missing',epic:'EP-1'},'EE-1':{state:'blocked',epic:'EP-1'},'FF-1':{state:'blocked',epic:'EP-1'},'EX-1':{state:'active',epic:'EP-1',title:'Extra',lane:'APP'},'NO-1':{state:'blocked',epic:'OTHER-1'}});
 assert.ok(h.view.querySelector('.dv-live-panel-body'));const table=h.view.querySelector('table.dv-live-tickets');assert.ok(table);
 assert.deepEqual(table.querySelectorAll('th').map(el=>el.textContent),['Key','Title','State','Owner','Depends on','PRs']);
 const all=table.querySelectorAll('tbody')[0].children,rows=all.filter(el=>el.getAttribute('data-live-ticket')),coverageOf=key=>all.find(el=>el.getAttribute('data-live-coverage-for')===key);assert.deepEqual(rows.map(el=>el.getAttribute('data-live-ticket')),['EE-1','FF-1','DD-1','CC-1','EX-1','BB-1','AA-1']);
 assert.equal(all.length,14);assert.equal(all[1].getAttribute('data-live-coverage-for'),'EE-1');
 const aa=rows.at(-1),extra=coverageOf('EX-1'),aaCoverage=coverageOf('AA-1');assert.equal(aa.querySelector('.dv-live-state-pill').textContent,'done');assert.match(textOf(aa),/Client work.*Alex/);assert.doesNotMatch(textOf(aa),/time unavailable|ago/);assert.match(textOf(aa),/2 declined/);
 assert.deepEqual(aa.querySelectorAll('a').map(el=>el.getAttribute('href')),['https://jira.test/browse/AA-1','https://code.test/pull/1','https://code.test/pull/2']);
 assert.equal(extra.querySelector('.dv-live-coverage-tag').textContent,'NOT ON DIAGRAM');assert.equal(coverageOf('BB-1').querySelector('.dv-live-coverage-tag').textContent,'NOT IN EPIC');
 assert.equal(rows.find(el=>el.getAttribute('data-live-ticket')==='EX-1').props['--dv-live-lane-color'],'#34d399');assert.deepEqual(aaCoverage.querySelectorAll('button').map(el=>el.textContent),['Client','Call']);assert.equal(aa.querySelectorAll('button').length,0,'no coverage buttons inside the data row');
 let focused=false;h.view.querySelector('g.node[data-dv-node="a"]').querySelector('.card').focus=()=>focused=true;aaCoverage.querySelector('button').dispatchEvent({type:'click'});assert.equal(focused,true);
 assert.match(h.view.querySelector('.dv-live-epic-progress').textContent,/6 of 7 on diagram/);assert.match(api.snapshot().verdict,/6 of 7 stories on diagram/);api.destroy();
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

test('E6 rework coverage opens inactive local and loaded external detail carriers before focusing',async()=>{
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
   const button=h.view.querySelector('tr[data-live-coverage-for="CH-1"]').querySelector('button');assert.equal(button.textContent,'Child carrier');button.dispatchEvent({type:'click'});await settle();h.flush();
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
test('E6 unlinked local and loaded remote sections disable coverage without creating previews',async()=>{
 for(const external of [false,true])for(const detailOnly of [false,true]){
  if(!external && !detailOnly)continue;
  const section={id:'unlinked',detailOnly,heading:'Unlinked work',diagram:{nodes:{child:{title:'Unlinked child',tickets:['CH-1']},end:{}},rows:[['child','end']],edges:[{from:'child',to:'end',label:'Unlinked edge',tickets:['CH-2']}]}};
  const remote={page:{sections:[{id:'entry',diagram:{nodes:{entry:{}},rows:[['entry']]}},section]}};
  const raw={page:{sections:[{id:'root',diagram:{nodes:{parent:{tickets:['AA-1'],...(external?{detail:{spec:'approved',section:'entry'}}:{})}},rows:[['parent']]}},...(!external?[section]:[])]}};
  let loads=0;const renderOptions={loadDetail:async()=>{loads++;return remote;}},h=harness(raw,{},renderOptions),api=h.ctl.liveStatus;
  if(external)await renderOptions.loadDetail({spec:'approved',section:'entry'},new AbortController().signal);else h.ctl.sections[1].sectionEl.hidden=true;
  h.ctl.details={snapshot:()=>null,activeSections:()=>[],restore(){assert.fail('no authored route exists');}};
  const before=JSON.stringify([h.ctl.page,remote]);mountStatus(h);api.apply({'AA-1':{state:'done'},'CH-1':{state:'active'},'CH-2':{state:'missing'}});
  for(const key of ['CH-1','CH-2']){const button=h.view.querySelector('tr[data-live-coverage-for="'+key+'"]').querySelector('button');assert.equal(button.disabled,true);assert.match(button.getAttribute('title'),/Unlinked work/);button.dispatchEvent({type:'click'});}
  assert.equal(h.view.querySelector('.dv-live-carrier-preview'),null);assert.equal(loads,external?1:0);assert.equal(JSON.stringify([h.ctl.page,remote]),before);api.destroy();assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);
 }
});
test('E6 pending coverage navigation cannot steal a newer panel control focus',async()=>{
 const childSection={id:'child',detailOnly:true,diagram:{nodes:{child:{title:'Child carrier',tickets:['CH-1']}},rows:[['child']]}};
 const h=harness({page:{sections:[{id:'root',diagram:{nodes:{parent:{tickets:['AA-1'],detail:{section:'child'}}},rows:[['parent']]}},childSection]}}),api=h.ctl.liveStatus,child=h.ctl.sections[1];child.sectionEl.hidden=true;
 let finish;h.ctl.details={snapshot:()=>null,activeSections:()=>[],showSection(){},restore:()=>new Promise(resolve=>finish=resolve)};
 mountStatus(h);api.apply({'AA-1':{state:'done'},'CH-1':{state:'active'}});
 h.view.querySelector('tr[data-live-coverage-for="CH-1"]').querySelector('button').dispatchEvent({type:'click'});assert.equal(typeof finish,'function');
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
 assert.equal(body.firstChild.className,'dv-live-head');assert.ok(body.querySelector('table.dv-live-tickets'));assert.ok(body.querySelector('.dv-live-epic'));assert.ok(body.querySelector('.dv-live-verdict')===null,'no verdict line');
 assert.deepEqual(body.querySelectorAll('h3').map(el=>el.textContent),['Tickets','Blockers and dependency chains','Activity']);
 const toggle=body.querySelector('.dv-live-toggle');assert.equal(toggle.textContent,'Live');toggle.dispatchEvent({type:'click'});assert.equal(api.enabled(),false);toggle.dispatchEvent({type:'click'});assert.equal(api.enabled(),true);
 let action=0,next=0,play=0;api.action('Retry',()=>action++);body.querySelector('.dv-live-action').dispatchEvent({type:'click'});assert.equal(action,1);
 api.setDemoControls({playing:false,manual:false,ended:false,next(){next++;},toggle(){play++;}});
 const demo=body.querySelector('.dv-live-demo');demo.children[0].dispatchEvent({type:'click'});demo.children[1].dispatchEvent({type:'click'});assert.equal(play,1);assert.equal(next,1);
 h.doc.activeElement=toggle;api.apply(fixed);assert.equal(h.doc.activeElement,toggle);assert.ok(body.contains(toggle));
 const before=textOf(body);body._panelMotionCleanup();api.note('After cleanup');assert.equal(textOf(body),before);mount.remount();assert.equal(body.querySelector('.dv-live-note').textContent,'After cleanup');
 mount.remount();api.note('Once');assert.equal(body.querySelectorAll('.dv-live-head').length,1);api.destroy();assert.equal(textOf(body).includes('Once'),true);
});
test('L2 empty page and disconnected provider render only the appropriate message',()=>{
 const empty=harness(),mount=mountStatus(empty);assert.match(textOf(mount.body),/This page has no ticket references\./);assert.equal(mount.body.querySelector('table'),null);
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
test('L4 keyed Tickets rows retain a focused coverage button through reorder and update links',()=>{
 const raw=epicFixture();delete raw.page.tracking.jira.site;const h=harness(raw),api=h.ctl.liveStatus;api.apply({'AA-1':{state:'done',epic:'EP-1'},'BB-1':{state:'active'}});const {body}=mountStatus(h);
 const dataRow=body.querySelector('tr[data-live-ticket="AA-1"]'),row=body.querySelector('tr[data-live-coverage-for="AA-1"]'),button=row.querySelector('button');h.doc.activeElement=button;
 api.apply({'AA-1':{state:'blocked',epic:'EP-1',url:'https://jira.test/browse/AA-1'},'BB-1':{state:'done'}});
 const tbody=body.querySelector('tbody');assert.ok(tbody.children[0]===dataRow,'data row first after reorder');assert.ok(tbody.children[1]===row,'its coverage row follows');assert.ok(row.querySelector('button')===button);assert.ok(h.doc.activeElement===button);
 assert.equal(dataRow.querySelector('a').getAttribute('href'),'https://jira.test/browse/AA-1');api.destroy();
});
test('L3 First blocker header action uses the current path and hides when disabled',()=>{
 const h=harness(fixture()),api=h.ctl.liveStatus;let jumped;
 h.ctl.sections[0].stepper={path:()=> 'happy',sourceIndex:()=>0,mode:()=> 'ambient',jumpSource:(index,path)=>jumped=[index,path]};
 api.apply(fixed);const {body}=mountStatus(h),first=body.querySelector('.dv-live-first');assert.equal(first.hidden,false);first.dispatchEvent({type:'click'});assert.deepEqual(jumped,[0,'happy']);
 api.setEnabled(false);assert.equal(first.hidden,true);api.destroy();
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
 assert.equal(value.connection.state,'connected');assert.equal(value.connection.busy,false);assert.ok(isFinite(Date.parse(value.connection.checkedAt)),'S1 checkedAt is a timestamp');assert.equal(value.connection.checkedText,'refreshed just now');assert.equal(h.view.querySelector('time.dv-live-updated'),null,'S1 no separate updated time');
 const badge=h.view.querySelector('.dv-live-connection');assert.ok(badge,'S1 header connection element');assert.equal(badge.getAttribute('data-state'),'connected');assert.equal(badge.getAttribute('data-busy'),'false');
 const badgeText=()=>badge.querySelectorAll('span')[0].textContent;assert.equal(badgeText(),'Host connected, refreshed just now');assert.equal(badge.getAttribute('role'),'status');assert.ok(badge.querySelector('.dv-live-connection-dot'));
 fail=true;const tick=[...h.timers.values()][0];h.timers.clear();tick.fn();value=plain(api.snapshot());assert.equal(value.connection.busy,true);assert.equal(badge.getAttribute('data-busy'),'true');
 await new Promise(setImmediate);value=plain(api.snapshot());assert.equal(value.connection.state,'error');assert.equal(value.connection.busy,false);assert.equal(badge.getAttribute('data-state'),'error');
 api.status({state:'bogus',source:42});assert.equal(plain(api.snapshot()).connection.state,'error');assert.equal(plain(api.snapshot()).connection.source,'Host');
 api.status({state:'demo',source:'Demo',checkedAt:Date.now()});value=plain(api.snapshot());assert.equal(value.connection.state,'demo');assert.equal(value.connection.source,'Demo');assert.equal(badgeText(),'Demo, refreshed just now');
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
 assert.equal(h.ghConnection?.()??h.view.querySelector('.dv-live-connection-github').textContent,'GitHub not connected');assert.equal(h.view.querySelector('.dv-live-connection-github').getAttribute('data-state'),'disconnected');assert.equal(h.view.querySelector('.dv-live-connection-github').hidden,false);
 assert.equal(h.view.querySelector('tr[data-live-ticket="AA-1"]').querySelectorAll('a.dv-live-pr-link').length,2,'plain authored icons stay');assert.equal(h.view.querySelector('tr[data-live-ticket="AA-1"]').querySelectorAll('a.dv-live-pr-link').filter(a=>a.getAttribute('data-pr-state')).length,0);h.ctl.liveStatus.destroy();
 // A page without GitHub links or scope never mentions GitHub.
 const plainPage=providerHarness();await plainPage.start();plainPage.data(0,[jira('AA-1')]);assert.equal(plainPage.view.querySelector('.dv-live-connection-github').hidden,true);assert.equal(plain(plainPage.ctl.liveStatus.snapshot()).connection.github.state,'none');plainPage.ctl.liveStatus.destroy();
});
test('G3 search scopes use separate repo queries org or authored repos only and map all PR states',async()=>{
 for(const [scope,expected,authored] of [[{repos:['acme/a','acme/b'],org:'ignored'},[' repo:acme/a',' repo:acme/b'],true],[{org:'acme'},[' org:acme'],true],[undefined,[' repo:acme/firmware'],true],[undefined,[],false]]){
  const raw=ghFixture();raw.page.tracking.github=scope;if(!authored)for(const node of Object.values(raw.page.sections[0].diagram.nodes))delete node.prs;
  const h=githubHarness(raw);await h.start();const watches=h.github().filter(w=>w.tool==='search_pull_requests');assert.deepEqual(watches.filter(w=>w.input.query.startsWith('"AA-1"')).map(w=>w.input.query),expected.map(s=>'"AA-1" in:title,body'+s));
  if(expected.length){assert.ok(watches.length);for(const w of watches){assert.equal(w.input.perPage,20);assert.deepEqual(w.input.fields,GH_FIELDS);assert.deepEqual(w.opts,{refetchInterval:60000});}}
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
 w.handler({type:'error',error:{code:'blocked_by_policy'}});assert.equal(h.ctl.liveStatus.state('AA-1').state,'active');assert.equal(h.timers.size,0);assert.equal(h.ghConnection().getAttribute('data-state'),'disconnected');assert.equal(h.ghConnection().textContent,'GitHub not connected');
 await settle();assert.ok(h.github().every(w=>w.stopped===1),'policy answers retire every GitHub watch');assert.deepEqual(plain(h.ctl.liveStatus.state('AA-1').prs),before,'evidence already shown stays');h.ctl.liveStatus.destroy();
});
test('G8 queues GitHub watches at ten rotates fairly at 60 seconds and retires late callbacks',async()=>{
 const raw=ghFixture();raw.page.sections[0].diagram.nodes={a:{tickets:Array.from({length:25},(_,i)=>'AA-'+i)}};const h=githubHarness(raw);await h.start();assert.equal(h.github().filter(w=>!w.stopped).length,10);assert.equal(h.github().length,10);
 for(let i=0;i<3;i++){const timer=[...h.timers.entries()].find(([,t])=>t.ms===60000);assert.ok(timer);h.timers.delete(timer[0]);timer[1].fn();await settle();assert.ok(h.github().filter(w=>!w.stopped).length<=10);}
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
 assert.deepEqual(plain(snap.counts),{todo:1,active:0,done:0,blocked:1,missing:0});
 assert.equal(snap.readiness.total,3);assert.equal(snap.readiness.done,0);assert.equal(snap.readiness.ready,false);assert.equal(snap.readiness.blockers,1);
 assert.deepEqual(plain(snap.coverage.onDiagram),['AA-1','AA-2']);
 assert.ok(h.view.querySelector('path.edge').classList.contains('dv-live-waiting'));assert.ok(h.view.querySelector('g.coin').classList.contains('dv-live-blocked'));
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
  assert.deepEqual(s.counts,{todo:0,active:0,done:3,blocked:0,missing:0});assert.deepEqual(s.tickets.map(row=>row.key).sort(),['MAN-1','ST-1','ST-3','UNKNOWN-1']);
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
 assert.deepEqual(s.tickets.map(row=>row.key).sort(),['MAN-1','OUT-1','ST-1','UNKNOWN-1']);assert.deepEqual(s.counts,{todo:1,active:1,done:1,blocked:0,missing:0});
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
  assert.equal(s.epic.stories,6);assert.equal(s.epic.done,5);assert.equal(s.epic.waiting,0);assert.deepEqual(s.tickets.map(row=>row.key).sort(),['EP-404','ST-1','ST-2','WORK-1','WORK-2','WORK-3']);assert.deepEqual(s.counts,{todo:1,active:0,done:5,blocked:0,missing:0});
  assert.ok(s.tickets.find(row=>row.key==='ST-1').dependsOn.some(dep=>dep.key==='IN-9'),'container remains direct dependency evidence');h.ctl.liveStatus.destroy();
 }
 const direct=upstream('KEEP-1',{name:'Story',hierarchyLevel:0}),dependent=jira('ST-1');dependent.fields.issuelinks=[link(upstream('KEEP-1',{name:'Epic',hierarchyLevel:1}))];
 assert.equal(C.liveStatusJiraMap(['ST-1','KEEP-1'],[[dependent,direct]],new Set(),'')['KEEP-1'].kind,'story','requested issue metadata wins over a linked stub');
});
