'use strict';
// #1305: the closed-Contents rail and the "Page n of m" pager share one list of document pages.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const C={};vm.createContext(C);vm.runInContext(readSource('viewer/contents.js'),C);
// Two Tabs; the first holds a section in two Views, plus a page section above the Tabs: five pages.
function documentPages(){
  const owner=(label,views)=>({label,views}),rec=(id,title)=>({id,title}),view=(id,name,members)=>({id,name,members});
  const intro=rec('intro','Introduction'),a1=rec('a1','Alpha one'),a2=rec('a2','Alpha two'),b1=rec('b1','Beta one');
  const page=owner('Rail pages',[view('page','Page',[intro])]),alpha=owner('Alpha',[view('one','View one',[a1,a2]),view('two','View two',[a2])]),beta=owner('Beta',[view('beta','Beta',[b1])]);
  const pages=[];[page,alpha,beta].forEach(o=>o.views.forEach(d=>d.members.forEach(r=>pages.push({owner:o,definition:d,rec:r}))));
  return pages;
}
test('#1305 readerRailPages gives one marker per document page, in pager order, with the pager\'s current page',()=>{
  assert.equal(typeof C.readerRailPages,'function','the rail derives its markers from the pager\'s page list');
  const pages=documentPages();
  for(let current=0;current<pages.length;current++){
    const marks=C.readerRailPages(pages,current,rec=>rec.title);
    assert.equal(marks.length,pages.length,'marker count = m');
    assert.deepEqual(marks.map(m=>m.current),pages.map((_,i)=>i===current),'the current marker is the pager\'s page');
    marks.forEach((mark,i)=>{assert.ok(mark.rec===pages[i].rec && mark.definition===pages[i].definition && mark.owner===pages[i].owner,'marker '+(i+1)+' targets page '+(i+1));});
  }
  assert.deepEqual(C.readerRailPages(pages,3,rec=>rec.title).map(m=>m.label),
    ['Page 1: Introduction · Page','Page 2: Alpha one · View one','Page 3: Alpha two · View one','Page 4: Alpha two · View two','Page 5: Beta one · Beta']);
  assert.deepEqual(C.readerRailPages([],-1,rec=>rec.title).length,0);
});
