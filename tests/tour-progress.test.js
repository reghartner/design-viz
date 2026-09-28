const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
function setup(){
  const c=vm.createContext({});
  vm.runInContext(readSource('core/tour-model.js')+'\n'+readSource('viewer/tour-progress.js'),c);
  const values=new Map(),win={localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)}};
  return {c,values,win,progress:c.createTourProgress(win)};
}
const plain=x=>JSON.parse(JSON.stringify(x));

test('only lesson topics count as seen, with one transport topic shared by both personas',()=>{
  const {c,progress,values}=setup();
  progress.seen({id:'welcome',kind:'chooser'});progress.seen({id:'finish',kind:'done'});
  assert.equal(values.size,0);
  progress.seen({id:'controls'});progress.seen({id:'mode-step'});
  assert.deepEqual(plain(progress.read().seen),['mode-step']);
  assert.deepEqual(plain(c.unseenTourSteps([{id:'controls'},{id:'mode-step'},{id:'drill'},{id:'end',kind:'done'}],progress.read())),[{id:'drill'}]);
});
test('remember topics across reader mounts and preserve the selected audience',()=>{
  const {c,progress,win}=setup();progress.persona('ux');progress.seen({id:'views'});
  const next=c.createTourProgress(win);
  assert.deepEqual(plain(next.read()),{version:1,persona:'ux',seen:['views']});
});
test('merge another tab’s learned topics before saving new progress',()=>{
  const {c,progress,values}=setup();progress.seen({id:'views'});
  values.set(c.TOUR_PROGRESS_KEY,JSON.stringify({version:1,persona:'eng',seen:['views','drill']}));
  progress.seen({id:'links'});
  assert.deepEqual(JSON.parse(values.get(c.TOUR_PROGRESS_KEY)),{version:1,persona:'eng',seen:['views','drill','links']});
});
test('malformed stored history is bounded and cannot inject arbitrary object keys',()=>{
  const {c}=setup();
  for(const text of ['{','null','[]','{"version":2,"seen":[]}','{"version":1,"seen":{}}'])
    assert.deepEqual(plain(c.parseTourProgress(text)),{version:1,persona:'both',seen:[]});
  assert.deepEqual(plain(c.parseTourProgress(JSON.stringify({version:1,persona:'admin',seen:['views','views',{},'__proto__','<script>']}))),
    {version:1,persona:'both',seen:['views']});
});
test('storage denial retains same-page progress without throwing',()=>{
  const {c}=setup(),win={get localStorage(){throw Error('Denied');}};
  const progress=c.createTourProgress(win);progress.persona('eng');progress.seen({id:'links'});
  assert.deepEqual(plain(c.createTourProgress(win).read()),{version:1,persona:'eng',seen:['links']});
});
