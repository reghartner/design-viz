'use strict';
/* Focused compare view text helpers (src/viewer/compare-view.js; issue #848 PR 2 of 3).
   Chuck 2026-11-01: coverage = new browser spec + old tests updated in place + Node unit
   tests for the value labels ("field chips"), the word diff and the carried-range text.

   CONTRACT MATRIX
   U1 chips    one label per changed top-level state field, in after-state key order then
               removed keys: scalar "key a → b"; added scalar "key → b"; removed scalar
               "key a → (none)"; array grown "key +n entry/entries"; array shrunk
               "key −n entry/entries"; array same length or object changed "key changed";
               equal states give no labels; strings are kept as literal text
                                                       rejects: whole-object JSON; one label for all fields
   U2 words    word-level diff (whitespace-separated) as runs {op:'same'|'del'|'ins', text}
               with consecutive words of one op joined by a single space, in reading order;
               identical text is one 'same' run; empty sides give only ins/del runs
                                                       rejects: character diff; whole-text replace
   U3 carried  "<title> differs at step N only" when the run is one step, else
               "<title> differs from step F through step T"
                                                       rejects: missing range end; wrong single-step text */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
function load(){const c={console};vm.createContext(c);for(const f of ['validator.js','canon.js','viewer/compare-view.js'])vm.runInContext(readSource(f),c);return c;}
const out=v=>JSON.parse(JSON.stringify(v));/* copy out of the vm realm */

test('U1 value labels name each changed state field with its before and after value',()=>{
  const c=load();
  assert.equal(typeof c.compareValueChips,'function','compare-view.js defines compareValueChips(before, after)');
  const chips=(a,b)=>out(c.compareValueChips(a,b));
  assert.deepEqual(chips({value:6},{value:42}),['value 6 → 42']);
  assert.deepEqual(chips({radio:'on'},{radio:'tx'}),['radio on → tx']);
  assert.deepEqual(chips({value:6},{value:6,label:'hot'}),['label → hot']);
  assert.deepEqual(chips({value:6,label:'hot'},{value:6}),['label hot → (none)']);
  assert.deepEqual(chips({log:[1]},{log:[1,2]}),['log +1 entry']);
  assert.deepEqual(chips({log:[1]},{log:[1,2,3]}),['log +2 entries']);
  assert.deepEqual(chips({log:[1,2,3]},{log:[1]}),['log −2 entries']);
  assert.deepEqual(chips({log:[1,2]},{log:[1,3]}),['log changed']);
  assert.deepEqual(chips({cfg:{a:1}},{cfg:{a:2}}),['cfg changed']);
  assert.deepEqual(chips({b:1,a:1,gone:true},{a:2,b:3}),['a 1 → 2','b 1 → 3','gone true → (none)']);
  assert.deepEqual(chips({value:6,log:[1]},{value:6,log:[1]}),[]);
  assert.deepEqual(chips(undefined,{value:1}),['value → 1']);
  assert.deepEqual(chips({label:'a'},{label:'<img src=x onerror=window.__pwned=1>'}),['label a → <img src=x onerror=window.__pwned=1>']);
});
test('U2 the caption word diff returns runs of unchanged, removed and added words',()=>{
  const c=load();
  assert.equal(typeof c.compareWordDiff,'function','compare-view.js defines compareWordDiff(before, after)');
  const diff=(a,b)=>out(c.compareWordDiff(a,b));
  assert.deepEqual(diff('Hub logs the press','Hub records the button press'),[
    {op:'same',text:'Hub'},{op:'del',text:'logs'},{op:'ins',text:'records'},{op:'same',text:'the'},{op:'ins',text:'button'},{op:'same',text:'press'}]);
  assert.deepEqual(diff('Store confirms','Store confirms the write'),[{op:'same',text:'Store confirms'},{op:'ins',text:'the write'}]);
  assert.deepEqual(diff('a  b','a b'),[{op:'same',text:'a b'}]);
  assert.deepEqual(diff('','new text'),[{op:'ins',text:'new text'}]);
  assert.deepEqual(diff('old text',''),[{op:'del',text:'old text'}]);
  assert.deepEqual(diff('one two three','uno dos'),[{op:'del',text:'one two three'},{op:'ins',text:'uno dos'}]);
});
test('U3 the carried-range note names the run of steps where the panel differs',()=>{
  const c=load();
  assert.equal(typeof c.compareCarriedText,'function','compare-view.js defines compareCarriedText(title, from, to)');
  assert.equal(c.compareCarriedText('Battery',6,6),'Battery differs at step 6 only');
  assert.equal(c.compareCarriedText('Power draw',6,7),'Power draw differs from step 6 through step 7');
  assert.equal(c.compareCarriedText('Event log',6,12),'Event log differs from step 6 through step 12');
});
