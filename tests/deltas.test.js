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
