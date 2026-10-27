/* Contract matrix (browser and VM coverage together):
| row | rule |
|---|---|
| V1 | New file src/viewer/live-status.js, added to the `engine.js` list in src/source-bundles.json (so standalone, workbench, native/Backstage and forge entrypoints all get it; check tests/source-loader.test.js). ES5 browser code like its neighbours. |
| V2 | `renderPage` attaches `ctl.liveStatus` with: `refs()` → `{tickets:[distinct keys], prs:[distinct urls]}` over every diagram of the page (all sections, all paths, detail flows) using `trackingRefs`; `apply(map)`; `clear()`; `enabled()`; `setEnabled(bool)`; `onChange(fn)` (fires after apply/clear/setEnabled with `{states, counts, updatedAt}`); `state(ref)`. `map` is `{ "<ticket key>": {state, title?, url?, assignee?, prs?: {count, state}, detail?, updatedAt?} }`, `state` ∈ `todo|active|done|blocked|missing`. Unknown state strings are ignored (treated as absent). |
| V3 | Rollup for one carrier with several tickets (docs/live-status.md): any blocked → blocked; else any missing → missing; else any active → active; else all done → done; else all todo → todo; else (mix of done and todo) → active. A carrier whose tickets are all absent from the map gets NO class. Implement as a pure function `liveStatusRollup(states[])` (exported as a global like other engine helpers) so it is unit-testable. |
| V4 | `apply(map)` sets exactly one `dv-live-<state>` class (removing the others) on: every node `g.node[data-dv-node]` with tickets; every edge `path.edge[data-dv-edge]` with tickets, plus its halo path and its `text.lbl` label (same `data-dv-edge` index); every step coin `g.coin[data-dv-step]` and step chip `button.schip[data-step-source]` whose step involves (via `edges`/keys, `nodes`, failures) at least one carrier that has a state — rollup of those carriers' states; in path-timeline chips too. Text boxes (`g.node.node-text`) never get a class. |
| V5 | CSS in src/style.core.css, for EVERY skin selector family that paints `.card`/edges today (aurora, daylight, editorial, terminal, pastel, blueprint, rose, lavender, lilac — check the skin list in the file): `.dv-live-todo` grey, `.dv-live-active` amber, `.dv-live-done` green, `.dv-live-blocked` and `.dv-live-missing` red. Node: card stroke + a soft halo (drop-shadow) in the state color and the status badge; edge: stroke color (main + halo) with the state color; coin: circle fill + ink via the same `--step-color`/`--step-ink` custom properties the `.step-colored` rules use (so precedence and `!important` match); chip: background via the same variables. Define the five colors once as CSS custom properties on `:root` (`--dv-live-todo`, …) and reuse. active/blocked/missing pulse: reuse the existing `runtime-pulse` keyframes (stroke-width) on the badge circle and a slow (≈2.4 s) opacity pulse on the card halo; `@media (prefers-reduced-motion: reduce)` disables both (follow the existing reduced-motion blocks). Live classes win over `tone-*` card fill/stroke while present. Step-mode dimming (`.stepmode .node:not(.lit)` etc.) still applies but with an opacity floor of .55 for live-classed elements, like `.stepmode .coin.step-colored:not(.lit)`. Print: no pulse, keep colors. |
| V6 | Badge: on each live-classed node and edge, a small SVG `g.dv-live-badge` (circle + glyph: todo "○", active "◔", done "✓", blocked "!", missing "?") appended like `renderRuntimeConditions` does (`src/engine.js`, around line 1586) — top-right of the card (the bottom-right slot belongs to runtime badges and detail triggers); for edges at the label position. `missing` badge gets a hatched (dashed stroke) circle. Clicking/Enter/Space on a badge opens a popover (reuse the manual popover construction of `wireNodeReferences` / `.nbackpop`): one row per ticket — key (link to `tracking.jira.site + '/browse/' + key` when site exists, else `url` from the map, else plain text), state label, title, assignee, and "PRs: n open/merged" when `prs` present — then the authored `prs` URLs as plain links. Escape/outside click closes; focus returns to the badge. |
| V7 | Node "⋯" menu: `nodeReferenceLinks` (`src/engine.js:257`) gains a "Tickets" group listing ticket keys (browse links when site is set) and authored PR links for that node, so the menu shows them even without a provider. |
| V8 | Live control: in the reader controls (where the theme menu / Contents controls live, `src/viewer/contents.js`), a `button.dv-live-toggle` with text "Live" + counts chip per state (hidden when zero), `aria-pressed` reflecting `enabled()`, a `time.dv-live-updated` ("updated <relative>" from the newest `updatedAt`; omitted when none), and a `span.dv-live-note` text slot set by `ctl.liveStatus.note(text, kind)` (`kind` ∈ `info|warn|error`) plus `ctl.liveStatus.action(label, fn)` to show one button (used by #738 for "Allow"). The control is hidden until the page has at least one ticket ref (`refs().tickets.length > 0`). |
| V9 | Re-apply after every rebuild: listen on the section element for `dv:pathrender` and `dv:pathchange`, on the view for `diagram-tab-change`, `tab-view-change`, `diagram-view-change`, `navigation-mounted`, `detail-navigation`, and use one MutationObserver (childList, subtree) scoped to step-control containers for chip rebuilds; coalesce with requestAnimationFrame. The classes survive a path switch (new SVG) and a detail flow open. `ctl.destroy()` disconnects everything. |
| V10 | Host hook: `renderPage(..., {liveStatus: {provider: function(refs, signal) → Promise<map>, refreshMs}})`. When present: call the provider after first paint, then every `max(refreshMs, 30000)` ms while `document.visibilityState === 'visible'` (pause when hidden, one catch-up call on return); an AbortController signal is passed and aborted on destroy; rejections set `note(message,'error')` and keep the last map. `mountNativeSpec` (src/native/mount.js) forwards `liveStatus` and src/native/mount.d.ts declares `liveStatus?: {provider: (refs: {tickets: string[]; prs: string[]}, signal: AbortSignal) => Promise<Record<string, LiveStatusEntry>>; refreshMs?: number}` with a `LiveStatusEntry` type. src/boot.flowview.js passes `window.flowviewLiveStatus` (if set before boot) as that option. |
| V11 | No provider and no `apply` → no DOM/CSS difference versus today except the hidden Live control markup (keep it out of the DOM entirely when there are no ticket refs, so pages without tickets are byte-identical in structure). |
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
 appendChild(el){el.parentNode=el.parentElement=this;this.children.push(el);return el;}
 insertBefore(el,before){el.parentNode=el.parentElement=this;const i=this.children.indexOf(before);this.children.splice(i<0?this.children.length:i,0,el);return el;}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.isConnected=false;}
 replaceChildren(...els){this.children=[];els.forEach(el=>this.appendChild(el));}
 cloneNode(){return new Element(this.tagName,this.attrs);}
 matches(selector){return selector.split(',').some(s=>{s=s.trim();if(s.includes(' '))s=s.split(' ').pop();let excluded=false;s=s.replace(/:not\(([^)]+)\)/g,(_,q)=>{excluded=this.matches(q);return '';});if(excluded)return false;
  const tag=s.match(/^[a-z]+/);if(tag&&tag[0]!==this.tagName)return false;
  for(const [,c] of s.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(c))return false;
  for(const [,k,v] of s.matchAll(/\[([\w-]+)(?:="([^"\]]*)")?\]/g))if(this.getAttribute(k)===null || v!==undefined&&this.getAttribute(k)!==v)return false;return true;});}
 querySelectorAll(s){return this.children.flatMap(c=>[...(c.matches(s)?[c]:[]),...c.querySelectorAll(s)]);}querySelector(s){return this.querySelectorAll(s)[0]||null;}
 closest(s){return this.matches(s)?this:this.parentElement?.closest(s)||null;}contains(el){return this===el||this.children.some(c=>c.contains(el));}
 addEventListener(t,f){(this.events[t]??=new Set()).add(f);}removeEventListener(t,f){this.events[t]?.delete(f);}dispatchEvent(ev){ev.target??=this;for(const f of this.events[ev.type]||[])f(ev);}
 getBoundingClientRect(){return {left:0,top:0,right:100,bottom:50,width:100,height:50};}getBBox(){return {x:50,y:30,width:60,height:12};}
 getTotalLength(){return 100;}getPointAtLength(){return {x:50,y:30};}focus(){}get firstChild(){return this.children[0]||null;}
}
function harness(raw,options={},renderOptions={}){
 const frames=new Map(),timers=new Map(),observers=[];let serial=0;
 const doc=new Element('document');doc.hidden=false;doc.visibilityState='visible';doc.createElement=tag=>new Element(tag);doc.createElementNS=(_,tag)=>new Element(tag);doc.body=new Element('body');doc.documentElement=new Element('html');
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
const fixed={'AA-1':{state:'active',updatedAt:'2026-10-26T10:00:00Z'},'BB-1':{state:'done'},'BB-2':{state:'todo'},'CC-2':{state:'missing'},'EE-1':{state:'blocked'}};

test('V1 shared entrypoints include the live overlay',()=>{
 for(const name of ['standalone','workbench','native','forge'])assert.match(entrypoint(name).body,/function liveStatusRollup\(/,name);
});
test('V3 rollup covers every precedence branch and ignores absent and unknown states',()=>{
 const C={URL};vm.runInNewContext(entrypoint('native').source,C);assert.equal(typeof C.liveStatusRollup,'function');
 for(const [states,want] of [[[],null],[[null,undefined],null],[['bogus'],null],[['todo'],'todo'],[['done','done'],'done'],[['todo','todo'],'todo'],[['done','todo'],'active'],[['active','done'],'active'],[['missing','active'],'missing'],[['blocked','missing','active','done','todo'],'blocked'],[[null,'done'],'done']])assert.equal(C.liveStatusRollup(states),want,JSON.stringify(states));
});
test('V2 refs uses the shared parser across sections, tabs, paths and detail-only flows',()=>{
 const raw=JSON.parse(fs.readFileSync('examples/live-status/live-status.spec.json')),h=harness(raw);
 const refs=plain(h.ctl.liveStatus.refs());refs.tickets.sort();assert.deepEqual(refs,{tickets:['BE-67','BE-68','FW-45','FW-46','HW-123','HW-124','UX-89'],prs:['https://github.com/acme/firmware/pull/88','https://github.com/acme/backend/pull/91']});h.ctl.liveStatus.destroy();
 const data=fixture(),d=data.page.sections[0].diagram;d.nodes.a.tickets.push('invalid','AA-1');d.steps.push({id:'other',nodes:['c']});d.paths=[{id:'main',steps:['hop']},{id:'other',steps:['other']}];data.page.blocks=[{tabs:[{label:'One',sections:data.page.sections},{label:'Two',sections:[{id:'detail',detailOnly:true,diagram:{nodes:{child:{tickets:['DD-1'],prs:['https://example.test/pr']}}}}]}]}];delete data.page.sections;
 const next=harness(data);assert.ok(next.ctl.liveStatus.refs().tickets.includes('DD-1'));assert.ok(next.ctl.liveStatus.refs().tickets.includes('CC-2'));assert.ok(!next.ctl.liveStatus.refs().tickets.includes('invalid'));assert.equal(next.ctl.liveStatus.refs().tickets.filter(k=>k==='AA-1').length,1);
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
 h.ctl.liveStatus.mountControls(h.view);const note=h.view.querySelector('.dv-live-note');assert.equal(note.hidden,true);
 assert.equal(calls,0);h.flush();h.flush();await new Promise(setImmediate);assert.equal(calls,1);assert.equal(h.ctl.liveStatus.state('AA-1').state,'active');assert.equal([...h.timers.values()][0].ms,30000);
 h.doc.hidden=true;h.doc.visibilityState='hidden';h.doc.dispatchEvent({type:'visibilitychange'});assert.equal(h.timers.size,0);
 h.doc.hidden=false;h.doc.visibilityState='visible';h.doc.dispatchEvent({type:'visibilitychange'});await new Promise(setImmediate);assert.equal(calls,2);
 fail=true;const tick=[...h.timers.values()][0];h.timers.clear();tick.fn();await new Promise(setImmediate);assert.equal(h.ctl.liveStatus.state('AA-1').state,'active');
 assert.equal(note.textContent,'Unavailable');assert.equal(note.getAttribute('data-kind'),'error');assert.equal(note.hidden,false);assert.equal(h.view.querySelector('.dv-live-control').hidden,false);
 fail=false;const retry=[...h.timers.values()][0];h.timers.clear();retry.fn();await new Promise(setImmediate);assert.equal(note.textContent,'');assert.equal(note.hidden,true);assert.equal(note.getAttribute('data-kind'),'info');
 h.ctl.liveStatus.destroy();assert.equal(signal.aborted,true);assert.equal(h.timers.size,0);
});
test('V10 late provider resolution after destroy cannot publish state',async()=>{
 let resolve;const h=harness(fixture(),{provider:()=>new Promise(r=>resolve=r)});h.flush();h.flush();await new Promise(setImmediate);h.ctl.liveStatus.destroy();resolve(fixed);await new Promise(setImmediate);assert.equal(h.ctl.liveStatus.state('AA-1'),null);
});
test('V11 absent provider and apply leave carrier DOM untouched',()=>{
 const h=harness(fixture());assert.equal(h.view.querySelectorAll('.dv-live-badge,.dv-live-active').length,0);assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);h.ctl.liveStatus.destroy();
});

test('V8 notes and host actions update, replace and clear the reader controls',()=>{
 const h=harness(fixture()),api=h.ctl.liveStatus,mount=api.mountControls(h.view),root=h.view.querySelector('.dv-live-control'),note=root.querySelector('.dv-live-note'),action=root.querySelector('.dv-live-action');
 assert.equal(root.hidden,true);assert.equal(note.hidden,true);assert.equal(action.hidden,true);assert.equal(root.querySelector('time'),null);
 for(const kind of ['info','warn','error']){api.note('Provider '+kind,kind);assert.equal(root.hidden,false);assert.equal(note.hidden,false);assert.equal(note.textContent,'Provider '+kind);assert.equal(note.getAttribute('data-kind'),kind);}
 api.note('Fallback','unknown');assert.equal(note.getAttribute('data-kind'),'info');api.note('','info');assert.equal(note.hidden,true);assert.equal(root.hidden,true);
 let first=0,second=0;api.action('Allow',()=>first++);assert.equal(root.hidden,false);assert.equal(action.hidden,false);assert.equal(action.textContent,'Allow');action.dispatchEvent({type:'click'});assert.equal(first,1);
 api.action('Retry',()=>second++);assert.equal(root.querySelectorAll('.dv-live-action').length,1);assert.equal(action.textContent,'Retry');action.dispatchEvent({type:'click'});assert.equal(second,1);assert.equal(first,1);
 api.action('',()=>first++);assert.equal(action.hidden,true);assert.equal(root.hidden,true);action.dispatchEvent({type:'click'});assert.equal(first,1);
 mount.destroy();api.note('Detached','warn');api.action('Allow',()=>first++);assert.equal(h.view.querySelectorAll('.dv-live-control').length,0);api.destroy();
});

test('V8 V9 V11 external detail refs create a deferred control and retired mounts stay absent',async()=>{
 let resolve;const loadDetail=()=>new Promise(r=>resolve=r),renderOptions={loadDetail},h=harness(undefined,{},renderOptions),api=h.ctl.liveStatus;
 const removed=h.view.appendChild(new Element('nav')),host=h.view.appendChild(new Element('nav'));
 const retiredMount=api.mountControls(removed),mount=api.mountControls(host);
 assert.equal(h.view.querySelectorAll('.dv-live-control').length,0);assert.ok(retiredMount && mount,'empty refs still register disposable reader mounts');retiredMount.destroy();
 api.apply({'DD-1':{state:'done',updatedAt:'2026-10-26T12:00:00Z'}});api.note('Detail loaded','info');assert.equal(h.view.querySelectorAll('.dv-live-control').length,0);
 const pending=renderOptions.loadDetail({spec:'approved-detail'},new AbortController().signal);resolve({nodes:{child:{tickets:['DD-1']}},rows:[['child']]});await pending;h.flush();
 assert.deepEqual(plain(api.refs().tickets),['DD-1']);assert.equal(removed.children.length,0);assert.equal(host.querySelectorAll('.dv-live-toggle').length,1);
 const root=host.querySelector('.dv-live-control'),toggle=root.querySelector('.dv-live-toggle');assert.equal(root.hidden,false);assert.equal(root.querySelector('[data-live-count="done"]').textContent,'done 1');assert.equal(root.querySelector('.dv-live-note').textContent,'Detail loaded');assert.equal(root.querySelector('time').getAttribute('datetime'),'2026-10-26T12:00:00Z');
 toggle.dispatchEvent({type:'click'});assert.equal(api.enabled(),false);assert.equal(toggle.getAttribute('aria-pressed'),'false');
 h.view.dispatchEvent({type:'detail-navigation'});h.flush();assert.equal(host.querySelectorAll('.dv-live-toggle').length,1);
 mount.destroy();api.apply({});h.view.dispatchEvent({type:'navigation-mounted'});h.flush();assert.equal(host.children.length,0);
 const replacement=api.mountControls(host);assert.equal(host.querySelectorAll('.dv-live-toggle').length,1);api.destroy();replacement.destroy();assert.equal(host.children.length,0);assert.equal(renderOptions.loadDetail,loadDetail);
});

test('V9 a late detail load cannot create controls after overlay destruction',async()=>{
 let resolve;const renderOptions={loadDetail:()=>new Promise(r=>resolve=r)},h=harness(undefined,{},renderOptions),api=h.ctl.liveStatus;
 api.mountControls(h.view);const pending=renderOptions.loadDetail({spec:'late-detail'},new AbortController().signal);api.destroy();resolve({nodes:{child:{tickets:['DD-1']}}});await pending;h.flush();
 assert.deepEqual(plain(api.refs().tickets),[]);assert.equal(h.view.querySelectorAll('.dv-live-control').length,0);assert.equal(h.frames.size,0);
});

/* Story contract matrix (paired with browser cases below):
 S1: built 6-node/5-edge/7-step story, tickets and index (browser + test_index).
 S2: standalone-only demo source, embedded timeline, early hash and fallback.
 S3: conversion, default cadence, controls, reduced motion, completion and cleanup.
 S4: directed fork/join propagation, edge/missing blockers, own paint and clearing.
 S5: blocked breaks in ambient/step, todo packets, done/active restoration (browser).
 S6: waiting tag/badge/popover, skin and print paint (browser).
 S7: named documentation sections. S8: demo excluded from workbench; scoped diff gate.
 Carrier keys in the pure helper are node IDs and directed from->to edge keys.
*/
function storyContext(){const C={URL};vm.runInNewContext(entrypoint('standalone').body,C);return C;}
function forkJoin(){return {nodes:{up:{tickets:['UP-1']},a:{tickets:['AA-1']},b:{tickets:['BB-1']},c:{tickets:['CC-1']},join:{tickets:['JJ-1']},end:{}},edges:[{from:'up',to:'a'},{from:'a',to:'b'},{from:'a',to:'c'},{from:'b',to:'join',tickets:['EE-1']},{from:'c',to:'join'},{from:'join',to:'end'}]};}
test('S4 blocked fork/join propagates forward through done, never upstream or onto blockers',()=>{
 const C=storyContext();assert.equal(typeof C.liveStatusWaiting,'function');const d=forkJoin(),before=JSON.stringify(d);
 const states={'AA-1':{state:'blocked'},'BB-1':{state:'todo'},'CC-1':{state:'done'},'JJ-1':{state:'active'}};
 assert.deepEqual(plain(C.liveStatusWaiting(d,states)),{'a->b':['AA-1'],b:['AA-1'],'b->join':['AA-1'],join:['AA-1'],'join->end':['AA-1'],end:['AA-1'],'a->c':['AA-1'],'c->join':['AA-1']});assert.equal(JSON.stringify(d),before);
 d.edges.push({from:'end',to:'a'});assert.equal(C.liveStatusWaiting(d,states).a,undefined,'cycles do not mark blocker');
});
test('S4 edge and missing blockers start at target and accumulate distinct blocking keys',()=>{
 const C=storyContext();assert.equal(typeof C.liveStatusWaiting,'function');const d=forkJoin();
 const result=plain(C.liveStatusWaiting(d,{'EE-1':{state:'blocked'},'CC-1':{state:'missing'}}));
 assert.deepEqual(result.join,['EE-1','CC-1'].sort());assert.deepEqual(result.end,['EE-1','CC-1'].sort());
 for(const key of ['up','a','b','c','b->join','up->a','a->b'])assert.equal(result[key],undefined,key);
 assert.deepEqual(plain(C.liveStatusWaiting(d,{})),{});
});
test('S4 waiting preserves own state, supplies badge/popover keys and clears on toggle/apply',()=>{
 const h=harness(fixture()),api=h.ctl.liveStatus;api.apply(fixed);const b=h.view.querySelector('[data-dv-node="b"]');
 assert.ok(b.classList.contains('dv-live-waiting'));assert.ok(b.classList.contains('dv-live-active'));assert.equal(b.getAttribute('data-dv-live-waiting-on'),'EE-1');
 const badge=b.querySelector('.dv-live-badge');assert.match(badge.getAttribute('aria-label'),/waiting on EE-1/);badge.dispatchEvent({type:'click',preventDefault(){},stopPropagation(){}});
 assert.ok(h.view.querySelector('.dv-live-popover').querySelectorAll('div').some(el=>(el.textContent||'').includes('EE-1')));
 api.setEnabled(false);assert.equal(b.getAttribute('data-dv-live-waiting-on'),null);api.setEnabled(true);assert.ok(b.classList.contains('dv-live-waiting'));
 api.apply({'BB-1':{state:'done'},'BB-2':{state:'done'},'EE-1':{state:'blocked'}});assert.ok(!b.classList.contains('dv-live-waiting'));api.clear();assert.equal(h.view.querySelectorAll('.dv-live-waiting').length,0);
});
test('S2 S3 demo conversion maps metadata, PR case and missing requested keys',()=>{
 const C=storyContext();assert.equal(typeof C.liveStatusDemoMap,'function');
 const day={issues:{'AA-1':{state:'blocked',summary:'Signal',assignee:'Alex',updated:'2026-10-26',statusName:'Blocked',flagged:true,prs:{count:2,state:'OPEN'}},'BB-1':{state:'done',prs:{count:0,state:null}},'EX-1':{state:'active'}}};
 const map=plain(C.liveStatusDemoMap(day,['AA-1','BB-1','CC-1']));assert.deepEqual(map['AA-1'],{state:'blocked',title:'Signal',assignee:'Alex',updatedAt:'2026-10-26',detail:'Blocked · flagged',prs:{count:2,state:'open'}});assert.deepEqual(map['CC-1'],{state:'missing'});assert.equal(map['BB-1'].prs,undefined);assert.equal(map['EX-1'],undefined);
});
test('S2 synthesized fallback uses only page tickets across four days',()=>{
 const C=storyContext();assert.equal(typeof C.liveStatusDemoTimeline,'function');const t=plain(C.liveStatusDemoTimeline(['AA-1','BB-1']));assert.equal(t.intervalSeconds,6);assert.equal(t.days.length,4);
 for(const day of t.days){assert.ok(day.label);assert.deepEqual(Object.keys(day.issues).sort(),['AA-1','BB-1']);}
 for(const [i,state] of [[0,'todo'],[1,'active'],[3,'done']])assert.ok(Object.values(t.days[i].issues).every(v=>v.state===state));assert.equal(Object.values(t.days[2].issues).filter(v=>v.state==='blocked').length,1);
});
test('S2 demo module is standalone-only and S7 documents story behavior',()=>{
 assert.ok(/function createLiveStatusDemo\(/.test(entrypoint('standalone').source),'standalone has demo provider');assert.doesNotMatch(entrypoint('workbench').source,/function createLiveStatusDemo\(/);
 const docs=fs.readFileSync('docs/live-status.md','utf8');for(const heading of ['Demo mode','Blocker propagation','Blocked edges'])assert.ok(docs.includes('## '+heading),heading);
});
