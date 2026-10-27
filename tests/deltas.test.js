'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {entrypoint} = require('../tools/source-loader.cjs');
const C = {URL, console};
vm.runInNewContext(entrypoint('native').source, C);
const plain = value => JSON.parse(JSON.stringify(value));

test('delta coin footprints clear adjacent numbers and cards on diagonal rows and short-edge grids', () => {
  const path = {getPointAtLength:t => ({x:t/Math.SQRT2, y:-t/Math.SQRT2})};
  for (const len of [600, 50]) {
    const pts = C.coinSlots(path,len,path.getPointAtLength(len/2),4,[],true);
    pts.forEach((a,i) => pts.forEach((b,j) => {
      if (i !== j) assert.ok(Math.hypot(a.x+13-b.x,a.y-13-b.y) >= 23, 'badge hit target covers another coin');
    }));
  }
  const flat = {getPointAtLength:t => ({x:t,y:100})}, card = [{x:115,y:73,w:20,h:15}];
  const pts = C.coinSlots(flat,200,{x:100,y:100},1,card,true);
  assert.equal(C.coinCover(pts,card,undefined,true),0,'a lone coin must also keep its badge off a card');
});

test('delta details preserve plain text and accept only HTTP(S) links without changing the authored input', () => {
  const value = {delta:true, deltaText:' <b>New behavior</b>\nSecond line. ', deltaLinks:[
    {label:'Decision',url:'https://example.test/decision'},
    {url:'http://example.test/issue'}, {url:'javascript:alert(1)'}, {url:'data:text/html,bad'},
    null, [], {url:'https://'}, {url:3}, {label:4,url:'https://example.test/fallback'}
  ]};
  const before = JSON.stringify(value), details = plain(C.deltaDetails(value));
  assert.equal(details.interactive, true);
  assert.equal(details.text, '<b>New behavior</b>\nSecond line.');
  assert.deepEqual(details.links, [
    {label:'Decision',url:'https://example.test/decision'},
    {label:'http://example.test/issue',url:'http://example.test/issue'},
    {label:'https://example.test/fallback',url:'https://example.test/fallback'}
  ]);
  assert.equal(JSON.stringify(value), before);
  for (const delta of [false, undefined, 'true']) assert.equal(C.deltaDetails({...value,delta}).interactive, false);
  for (const value of [{delta:true},{delta:true,deltaText:'  ',deltaLinks:[]},{delta:true,deltaText:{},deltaLinks:[{url:'javascript:x'}]}])
    assert.equal(C.deltaDetails(value).interactive, false);
});

test('nodes, edges and steps report malformed details while retaining backward-compatible delta booleans', () => {
  const mark = {delta:true,deltaText:4,deltaLinks:[{url:'javascript:x'},{url:'https://example.test/',label:4}]};
  const result = C.validate(C.normalize({nodes:{a:mark,b:{}},rows:[['a','b']],edges:[{from:'a',to:'b',...mark}],steps:[{edge:'a->b',...mark}]}));
  assert.equal(result.errors.length, 0);
  for (const target of ['nodes.a','edges[0]','steps[0]']) {
    for (const field of ['deltaText','deltaLinks[0].url','deltaLinks[1].label'])
      assert.ok(result.warnings.some(w => w.includes(target+'.'+field+':')), target+'.'+field);
  }
});

const fs = require('node:fs');
const path = require('node:path');
const trackingDiagram = refs => ({nodes:{a:{...refs},b:{}},rows:[['a','b']],edges:[{from:'a',to:'b',...refs}]});

test('trackingRefs keeps valid Jira keys and HTTP(S) URLs in order, deduplicates and preserves source', () => {
  assert.equal(typeof C.trackingRefs, 'function');
  assert.equal(String(C.trackingKeyPattern), '/^[A-Z][A-Z0-9_]+-[0-9]+$/');
  const value = {tickets:['HW-123','FW-45','HW-123','A0_-0','hw-123','A-1',' HW-123','HW-123 ',3,null,'HW-X','1A-1'],
    prs:['https://example.test/pull/88','http://example.test/pull/2','https://example.test/pull/88',
      ' HTTPS://EXAMPLE.TEST/pull/88 ', 'javascript:alert(1)','data:text/plain,no','/pull/1','https://',3,null]};
  const before = JSON.stringify(value);
  assert.deepEqual(plain(C.trackingRefs(value)), {tickets:['HW-123','FW-45','A0_-0'],
    prs:['https://example.test/pull/88','http://example.test/pull/2']});
  assert.equal(JSON.stringify(value), before);
  for (const value of [undefined,null,{},[],false,'HW-123',{tickets:'HW-123',prs:{}},{tickets:null,prs:42}])
    assert.deepEqual(plain(C.trackingRefs(value)), {tickets:[],prs:[]});
  for (const url of ['http://example.test',' HTTPS://EXAMPLE.TEST/pull/88 ','https://','//example.test','ftp://example.test',false])
    assert.deepEqual(plain(C.trackingRefs({prs:[url]})).prs, C.deltaLinkUrl(url) ? [C.deltaLinkUrl(url)] : []);
});

test('tracking warnings identify every bad node and edge entry and retain valid references after normalization', () => {
  const refs = {tickets:['HW-123','bad',3,'FW-45'],prs:['https://example.test/pull/88','/pull/2',null]};
  for (const nested of [false,true]) {
    const diagram = trackingDiagram(refs);
    const raw = nested ? {page:{blocks:[{tabs:[{sections:[{diagram}]}]}]}} : {page:{sections:[{diagram}]}};
    const before = JSON.stringify(raw), page = C.normalize(raw), result = C.validate(page);
    const dp = nested ? 'blocks[0].tabs[0].sections[0].diagram' : 'sections[0].diagram';
    assert.deepEqual(plain(result.errors), []);
    assert.deepEqual(plain(result.warnings), ['nodes.a','edges[0]'].flatMap(target => [
      `${dp}.${target}.tickets[1]: use a Jira key like HW-123 — entry ignored`,
      `${dp}.${target}.tickets[2]: use a Jira key like HW-123 — entry ignored`,
      `${dp}.${target}.prs[1]: must be an absolute http(s) URL — entry ignored`,
      `${dp}.${target}.prs[2]: must be an absolute http(s) URL — entry ignored`
    ]));
    const normalized = nested ? page.blocks[0].tabs[0].sections[0].diagram : page.sections[0].diagram;
    for (const target of [normalized.nodes.a,normalized.edges[0]])
      assert.deepEqual(plain(C.trackingRefs(target)), {tickets:['HW-123','FW-45'],prs:['https://example.test/pull/88']});
    assert.equal(JSON.stringify(raw), before);
  }
});

test('non-array tracking fields warn once per node and edge field, including explicit null', () => {
  for (const value of ['HW-123',{},42,false,null]) {
    const result = C.validate(C.normalize(trackingDiagram({tickets:value,prs:value})));
    assert.deepEqual(plain(result.errors), []);
    assert.deepEqual(plain(result.warnings), ['nodes.a','edges[0]'].flatMap(target => [
      `sections[0].diagram.${target}.tickets: must be an array of Jira keys — ignored`,
      `sections[0].diagram.${target}.prs: must be an array of URLs — ignored`
    ]));
  }
  for (const refs of [{},{tickets:[],prs:[]},{tickets:['HW-123','HW-123'],prs:['http://example.test']}])
    assert.deepEqual(plain(C.validate(C.normalize(trackingDiagram(refs)))), {errors:[],warnings:[]});
});

test('page tracking and Jira site validation are advisory with exact paths', () => {
  const check = tracking => C.validate(C.normalize({page:{tracking,sections:[{diagram:trackingDiagram({})}]}}));
  for (const value of [null,false,42,'https://example.test',[]])
    assert.deepEqual(plain(check(value)), {errors:[],warnings:['tracking: must be an object — ignored']});
  for (const value of [null,false,42,{},[],'/jira','javascript:alert(1)','https://'])
    assert.deepEqual(plain(check({jira:{site:value}})), {errors:[],warnings:['tracking.jira.site: must be an absolute http(s) URL — ignored']});
  for (const value of [{},{jira:{}},{jira:{site:'https://acme.atlassian.net'}},{jira:{site:'http://jira.example.test'}}])
    assert.deepEqual(plain(check(value)), {errors:[],warnings:[]});
});

test('live-status example covers node and edge references without validation or lint warnings', () => {
  const file = path.join(__dirname,'../examples/live-status/live-status.spec.json');
  assert.ok(fs.existsSync(file), 'live-status spec example exists');
  const raw = JSON.parse(fs.readFileSync(file,'utf8')), page = C.normalize(raw);
  assert.deepEqual(plain(C.validate(page)), {errors:[],warnings:[]});
  assert.deepEqual(plain(C.lintPage(page)), []);
  assert.ok(C.deltaLinkUrl(page.tracking.jira.site));
  const diagrams = C.sectionRecords(page).filter(record => record.section.diagram).map(record => record.section.diagram);
  assert.equal(diagrams.length,1);
  const d = diagrams[0], nodes = Object.values(d.nodes);
  assert.equal(nodes.length,6);
  assert.equal(d.edges.length,5);
  // The story names its four teams in lanes, with several carriers per team.
  for (const area of [/hardware/i,/firmware/i,/mobile app/i,/backend/i])
    assert.ok(Object.values(page.lanes).some(lane => area.test(lane.label)), String(area));
  assert.ok(nodes.every(node => C.trackingRefs(node).tickets.length));
  assert.ok(d.edges.every(edge => C.trackingRefs(edge).tickets.length));
  assert.deepEqual([...new Set([...nodes,...d.edges].flatMap(obj => plain(C.trackingRefs(obj)).tickets))].sort(),
    ['BE-67','BE-68','FW-45','FW-46','HW-123','HW-124','UX-89']);
  // This story attaches PRs to nodes; edge PR parsing is covered above.
  assert.ok(nodes.some(node => C.trackingRefs(node).prs.length));
  for (const obj of [...nodes,...d.edges]) {
    const refs = plain(C.trackingRefs(obj));
    assert.deepEqual(refs.tickets, obj.tickets || []);
    assert.deepEqual(refs.prs, obj.prs || []);
  }
});

test('tracking authoring guidance documents references and the future Jira-only state model', () => {
  const contract = fs.readFileSync(path.join(__dirname,'../contract/authoring-contract.md'),'utf8');
  const marker = contract.indexOf('### Delta markers');
  const guidance = contract.slice(marker,contract.indexOf('### groups',marker));
  for (const term of ['`tickets`','`prs`','`tracking`','nodes and edges','warnings','never stores status'])
    assert.ok(guidance.includes(term), 'authoring contract: '+term);
  const file = path.join(__dirname,'../docs/live-status.md');
  assert.ok(fs.existsSync(file), 'live-status guide exists');
  const guide = fs.readFileSync(file,'utf8');
  for (const term of ['flow.live-status','tracking','tickets','prs','Jira','informational','#735']) assert.ok(guide.includes(term),term);
  for (const pattern of [/todo[^\n]*grey/i,/active[^\n]*amber[^\n]*slow pulse/i,/done[^\n]*green/i,
    /blocked[^\n]*red[^\n]*pulse/i,/missing[^\n]*red[^\n]*pulse[^\n]*hatched badge/i,
    /blocked > missing > active > \(all done → done\) > \(all todo → todo\) > otherwise active/,
    /steps, coins and chips[^.]*derive[^.]*edges and nodes[^.]*never carry tickets/is,
    /color comes from Jira status only/i,/prs[^.]*plain links/i,/## Rendering/]) assert.match(guide,pattern);
});
