const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const context={};
vm.createContext(context);
vm.runInContext(readSource('core/tour-model.js'),context);
/* vm results live in another realm: strip prototypes before deep equality */
const plain=value=>JSON.parse(JSON.stringify(value));
const rect=(...args)=>plain(context.tourCutoutRect(...args));
const timeline=(...args)=>plain(context.tourTimeline(...args));

const spot=(id,extra)=>({id,target:{selector:'.x'},...extra});
const config=steps=>({version:1,steps});

test('lint accepts a minimal valid config and rejects shape errors',()=>{
  assert.deepEqual(plain(context.tourLintConfig(config([spot('a')]))),[]);
  assert.ok(context.tourLintConfig(null).length===0,'null tour is simply absent');
  assert.ok(context.tourLintConfig('nope').length,'non-object warns');
  assert.ok(context.tourLintConfig({version:2,steps:[spot('a')]})
    .some(w=>w.includes('version')),'unknown version warns');
  assert.ok(context.tourLintConfig(config([]))
    .some(w=>w.includes('.steps')),'empty steps warns');
  assert.ok(context.tourLintConfig(config([spot('a'),spot('a')]))
    .some(w=>w.includes('duplicate')),'duplicate ids warn');
  assert.ok(context.tourLintConfig(config([{id:'a'}]))
    .some(w=>w.includes('target.selector')),'spot without selector warns');
  assert.ok(context.tourLintConfig(config([{id:'a',kind:'chooser'}])).length===0,
    'chooser needs no target');
  assert.ok(context.tourLintConfig(config([spot('a',{personas:['pm']})]))
    .some(w=>w.includes('unknown persona')));
  assert.ok(context.tourLintConfig(config([spot('a',{offset:{dx:'3'}})]))
    .some(w=>w.includes('offset.dx')));
  assert.ok(context.tourLintConfig(config([spot('a',{target:{selector:'.x',within:'tab'}})]))
    .some(w=>w.includes('within')));
  assert.ok(context.tourLintConfig(config([{id:'w',kind:'chooser',copy:{choices:'nope'}}]))
    .some(w=>w.includes('copy.choices')),'non-array choices warn');
  assert.ok(context.tourLintConfig(config([{id:'w',kind:'chooser',copy:{choices:[{persona:'pm'}]}}]))
    .some(w=>w.includes('choices[0].persona')),'unknown choice persona warns');
  assert.ok(context.tourLintConfig(config([spot('a',{demo:{advance:0}})]))
    .some(w=>w.includes('demo.advance')),'bad demo.advance warns');
  assert.ok(context.tourLintConfig(config([spot('a',{demo:{intervalMs:50}})]))
    .some(w=>w.includes('demo.intervalMs')),'bad demo.intervalMs warns');
  assert.ok(context.tourLintConfig(config([spot('a'),{id:'w',kind:'chooser'}]))
    .some(w=>w.includes('first step')),'late chooser warns');
});

test('usability is looser than lint: any well-formed step qualifies',()=>{
  assert.equal(context.tourUsableConfig(config([spot('a')])),true);
  assert.equal(context.tourUsableConfig(config([{id:'a'}])),true);
  assert.equal(context.tourUsableConfig(config([{kind:'spot'}])),false);
  assert.equal(context.tourUsableConfig({version:2,steps:[spot('a')]}),false);
  assert.equal(context.tourUsableConfig(null),false);
  assert.equal(context.tourUsableConfig({version:1,steps:'x'}),false);
});

test('persona filtering: absent personas means everyone, "both" sees all',()=>{
  const steps=[spot('all'),spot('eng-only',{personas:['eng']}),spot('ux-only',{personas:['ux']})];
  const ids=(persona)=>plain(context.tourStepsForPersona(config(steps),persona).map(s=>s.id));
  assert.deepEqual(ids('eng'),['all','eng-only']);
  assert.deepEqual(ids('ux'),['all','ux-only']);
  assert.deepEqual(ids('both'),['all','eng-only','ux-only']);
});

test('timeline counts the authored list and never counts the chooser',()=>{
  const steps=[{id:'w',kind:'chooser'},spot('a'),spot('b'),{id:'z',kind:'done'}];
  assert.deepEqual(timeline(steps,0),{total:3,current:0});
  assert.deepEqual(timeline(steps,1),{total:3,current:1});
  assert.deepEqual(timeline(steps,3),{total:3,current:3});
});

test('cutout rect pads, applies offsets, clamps to the viewport',()=>{
  const vp={w:1000,h:600};
  assert.deepEqual(rect({x:100,y:100,w:200,h:50},null,8,vp),
    {x:92,y:92,w:216,h:66});
  assert.deepEqual(rect({x:100,y:100,w:200,h:50},{dx:-2,dy:4,dw:10,dh:-6},8,vp),
    {x:90,y:96,w:226,h:60});
  const clamped=rect({x:-20,y:590,w:60,h:40},null,8,vp);
  assert.equal(clamped.x,0);
  assert.equal(clamped.y+clamped.h<=vp.h,true);
  const offscreen=rect({x:990,y:10,w:100,h:10},null,8,vp);
  assert.equal(offscreen.x+offscreen.w<=vp.w,true);
});

test('completion cookie and #tour hash requests parse strictly',()=>{
  assert.equal(context.tourDoneFromCookie('dv_skin=pastel; dv_tour=1'),true);
  assert.equal(context.tourDoneFromCookie('dv_tour=0'),false);
  assert.equal(context.tourDoneFromCookie('xdv_tour=1'),false);
  assert.equal(context.tourDoneFromCookie(null),false);
  assert.equal(context.tourHashRequest('#tour=1'),'force');
  assert.equal(context.tourHashRequest('#d=sec&tour=0'),'suppress');
  assert.equal(context.tourHashRequest('#contour=1'),null);
  assert.equal(context.tourHashRequest(''),null);
});
