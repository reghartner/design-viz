'use strict';
/* #1318 (PERFDRAG): two render-time writes that restyle the whole page on every Workbench render.
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| T1 | When one reader Contents replaces another on the same view (destroy, then mount), the inherited --reader-host-inset on the inset target (Workbench body) is not removed; it is cleared only once no Contents remains. | fake DOM: body > #docview; Contents with insetTarget body; body inset 44px | mutation log has no `remove --reader-host-inset` across destroy+mount; value kept; after the last destroy it is removed | removing then re-setting the body property (two full-page restyles per render) |
| T2 | geometry() writes --reader-host-inset only when its value changes. | same | a second geometry() adds no `set --reader-host-inset` | rewriting an unchanged inherited property |
| T3 | Document search keeps one style element and one ::highlight name per view: a replacement search (render) reuses both, outside the re-rendered view, and clears the old ranges; destroying the last search removes them. | fake DOM with CSS.highlights; two searches on #docview, one on another view | one `insert style document-search-style`, no `remove style` across replace; same registry name; ranges cleared; distinct name per view; registry and style gone after the last destroy | a style element and highlight name re-created on every render (a full-page restyle) |
Strings are compared, never elements. */
const test=require('node:test'),assert=require('node:assert/strict');
const {viewerEnvironment}=require('./helpers/fake-viewer-dom.js');
const INSET='--reader-host-inset';

test('T1 T2 replacing Contents keeps the inherited inset on the Workbench body; the last destroy clears it',async()=>{
  const env=viewerEnvironment({stubSearch:true}),body=env.doc.body;
  const {nav,ctl}=env.view('docview',true);
  body.style.setProperty(INSET,'44px');
  const first=env.C.createReaderContents(ctl,nav,env.element('div'),{insetTarget:body});
  first.geometry();await env.flush();
  const value=body.style.getPropertyValue(INSET);assert.ok(value,'Contents sets the inset');
  env.log.length=0;
  first.destroy();
  const second=env.C.createReaderContents(ctl,nav,env.element('div'),{insetTarget:body});
  second.geometry();await env.flush();
  assert.deepEqual(env.log.filter(entry=>entry==='remove '+INSET),[],'T1 no removal of the body inset when one Contents replaces another');
  assert.equal(body.style.getPropertyValue(INSET),value,'the inset is unchanged');
  env.log.length=0;second.geometry();second.geometry();
  assert.deepEqual(env.log.filter(entry=>entry.startsWith('set '+INSET)),[],'T2 an unchanged inset is not written again');
  second.destroy();await env.flush();
  assert.equal(body.style.getPropertyValue(INSET),'','with no Contents left the inset is cleared');
});

test('T3 document search reuses one style element and highlight name per view across renders',async()=>{
  const env=viewerEnvironment(),{registry,log}=env;
  const {view,nav,ctl}=env.view('docview',false);
  const make=()=>env.C.createDocumentSearch(ctl,nav,env.element('div'),env.element('div'),()=>[],()=>{},()=>{});
  const first=make();
  const names=()=>[...registry.keys()].join(',');
  const name=names();assert.match(name,/^flowview-search-\d+$/,'one highlight name');
  registry.get(name).add('old range');
  log.length=0;
  first.destroy();const second=make();await env.flush();
  assert.equal(names(),name,'the replacement search keeps the same highlight name');
  assert.equal(registry.get(name).size,0,'the old ranges are cleared');
  assert.deepEqual(log.filter(entry=>entry.endsWith('style document-search-style')),[],'the style element is neither removed nor inserted again');
  assert.equal(env.doc.head.children.filter(child=>child.className==='document-search-style').length,1,'one style element, kept outside the re-rendered view');
  assert.equal(view.children.filter(child=>child.className==='document-search-style').length,0,'not inside the view, which a render clears');
  const other=env.view('other-view',false),third=env.C.createDocumentSearch(other.ctl,other.nav,env.element('div'),env.element('div'),()=>[],()=>{},()=>{});
  assert.equal(registry.size,2,'another view has its own highlight name');
  second.destroy();third.destroy();await env.flush();
  assert.equal(registry.size,0,'destroying the last searches removes their highlights');
  assert.equal(env.doc.head.children.filter(child=>child.className==='document-search-style').length,0,'and their style elements');
});
