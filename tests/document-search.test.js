'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('src/viewer/document-search.js','utf8'),ctx);
const plain=entries=>JSON.parse(JSON.stringify(entries));
test('a contiguous query narrows monotonically, ignoring case and surrounding whitespace',()=>{
 const entries=['Heartbeat','Heartbeat message','Different message'].map(text=>({text}));
 assert.deepEqual(plain(ctx.documentSearchMatches(entries,' HEART ')),entries.slice(0,2));
 assert.deepEqual(plain(ctx.documentSearchMatches(entries,'heartbeat m')),entries.slice(1,2));
 assert.equal(ctx.documentSearchMatches(entries,'heart message').length,0);
 assert.equal(ctx.documentSearchMatches(entries,' ').length,0);
});
test('resolved imported nodes have the same entries and exact page identities as local nodes',()=>{
 const section={heading:'Duplicate',diagram:{nodes:{local:{title:'Local heartbeat'},'shared::api':{title:'Imported heartbeat',sub:'Remote publisher'}},steps:[{text:'First'},{text:'Alternate heartbeat'}]}};
 const rec={number:3,sectionEl:{querySelectorAll:()=>[{textContent:'Authored prose'}]}};
 const owner={source:{label:'Tab B'},records:[{runtime:rec,section}]};
 const pages=['first','second'].map(name=>({owner,rec,definition:{id:name,name}}));
 const index=ctx.documentSearchIndex(pages,text=>String(text || ''));
 const nodes=ctx.documentSearchMatches(index,'heartbeat').filter(hit=>hit.kind==='node');
 assert.equal(nodes.length,4);assert.equal(nodes[0].page,pages[0]);assert.equal(nodes[2].page,pages[1]);
 assert.equal(nodes[1].node,'shared::api');assert.match(nodes[3].location,/Page 2.*Tab B.*second.*Duplicate/);
 assert.equal(ctx.documentSearchMatches(index,'Alternate')[0].sourceIndex,1);
 assert.equal(ctx.documentSearchMatches(index,'shared::api').length,0,'internal IDs are not prose');
});
test('snippets retain a late match with useful surrounding words',()=>{
 const text='Opening sentence. '.repeat(20)+'Exact destination words. Ending.';
 const snippet=ctx.documentSearchSnippet(text,'destination');assert.ok(snippet.startsWith('…'));assert.ok(snippet.includes('Exact destination words.'));assert.ok(snippet.length<180);
});
test('prose results address separate paragraphs without joining unrelated words',()=>{
 const section={heading:'Literal **title**'},rec={number:1,sectionEl:{querySelectorAll:()=>[{textContent:'First paragraph.'},{textContent:'Last needle paragraph.'}]}};
 const owner={source:{label:'Tab'},records:[{runtime:rec,section}]};const pages=[{owner,rec,definition:{name:'Reading',legacy:false}}];
 const index=ctx.documentSearchIndex(pages,text=>String(text || '').replace(/\*/g,''));
 assert.equal(ctx.documentSearchMatches(index,'needle')[0].proseIndex,1);assert.equal(ctx.documentSearchMatches(index,'paragraph.Last').length,0);assert.equal(ctx.documentSearchMatches(index,'**title**')[0].kind,'heading');
});

test('untitled sections still index their nodes and steps',()=>{
 const section={diagram:{nodes:{a:{title:'Visible node'}},steps:[{text:'Visible step'}]}},rec={number:1,sectionEl:{querySelectorAll:()=>[]}};
 const owner={source:{},records:[{runtime:rec,section}]};const entries=ctx.documentSearchIndex([{owner,rec,definition:{name:'Standard',legacy:true}}],text=>String(text || ''));
 assert.equal(ctx.documentSearchMatches(entries,'Visible').length,2);
});

test('Unicode folding returns original offsets after expanded prefixes and for expanded queries',()=>{
 const text='İabc def 😀 𐐀';
 for(const [query,expected] of [['abc','abc'],['İ','İ'],['i\u0307','İ'],['😀','😀'],['𐐨','𐐀']]){
  const spans=ctx.documentSearchSpans(text,query);assert.equal(spans.length,1);assert.equal(text.slice(spans[0].start,spans[0].end),expected);
  assert.equal(ctx.documentSearchMatches([{text}],query).length,1);
 }
 assert.equal(ctx.documentSearchSnippet(text,'abc'),text);
 const long='😀'.repeat(60)+'needle'+'😀'.repeat(60),snippet=ctx.documentSearchSnippet(long,'needle');
 assert.ok(snippet.includes('needle'));assert.equal(snippet.isWellFormed(),true);
});

test('hidden local and imported nodes do not become search destinations',()=>{
 const section={diagram:{nodes:{local:{title:'Local hidden',hidden:true},'shared::api':{title:'Imported hidden',hidden:true},shown:{title:'Shown'}}}},rec={number:1,sectionEl:{querySelectorAll:()=>[]}},owner={source:{},records:[]};owner.records.push({runtime:rec,section});
 const entries=ctx.documentSearchIndex([{owner,rec,definition:{name:'Reading'}}],text=>String(text || ''));
 assert.equal(ctx.documentSearchMatches(entries,'hidden').length,0);assert.equal(ctx.documentSearchMatches(entries,'Shown').length,1);
});


test('Greek final and medial sigma match uppercase words in both directions',()=>{
 for(const [text,query] of [['ΟΣ','ος'],['ος','ΟΣ'],['ΠΡΟΣ','προς'],['προς','ΠΡΟΣ'],['οσ','ος'],['ος','οσ']]){
  assert.equal(ctx.documentSearchMatches([{text}],query).length,1);
  const spans=ctx.documentSearchSpans(text,query);assert.equal(spans.length,1);assert.equal(text.slice(spans[0].start,spans[0].end),text);
 }
});
