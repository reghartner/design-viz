/* Guards the shipped default tour config: it must lint clean, and every CSS
   class its selectors depend on must still exist verbatim in the renderer,
   so an engine rename cannot silently orphan a tour step. */
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const context={};
vm.createContext(context);
vm.runInContext(readSource('core/tour-model.js')+'\n'+readSource('tour.config.js'),context);
const config=context.TOUR_DEFAULT_CONFIG;
const plain=value=>JSON.parse(JSON.stringify(value));

test('the shipped default config lints clean and is usable',()=>{
  assert.deepEqual(plain(context.tourLintConfig(config)),[]);
  assert.equal(context.tourUsableConfig(config),true);
});

test('the default flow covers chooser, controls, branching, both personas, done',()=>{
  const ids=plain(config.steps.map(s=>s.id));
  assert.deepEqual(ids,['welcome','controls','branching','links','story','panels','finish']);
  const panels=config.steps.find(s=>s.id==='panels');
  assert.deepEqual(plain(panels.demo),{advance:3,intervalMs:1800});
  assert.deepEqual(plain(panels.personas),['ux']);
  assert.equal(config.steps[0].kind,'chooser');
  assert.equal(config.steps[config.steps.length-1].kind,'done');
  assert.deepEqual(plain(config.steps.find(s=>s.id==='links').personas),['eng']);
  assert.deepEqual(plain(config.steps.find(s=>s.id==='story').personas),['ux']);
  const eng=context.tourStepsForPersona(config,'eng').map(s=>s.id);
  const ux=context.tourStepsForPersona(config,'ux').map(s=>s.id);
  assert.ok(eng.includes('links') && !eng.includes('story'));
  assert.ok(ux.includes('story') && !ux.includes('links'));
  assert.equal(context.tourStepsForPersona(config,'both').length,config.steps.length);
});

test('every selector class the default config names is rendered by the engine',()=>{
  const engine=readSource('engine.js');
  const selectors=[];
  config.steps.forEach(step=>{
    if(step.target)selectors.push(step.target.selector);
    const secondaries=Array.isArray(step.secondary)?step.secondary:(step.secondary?[step.secondary]:[]);
    secondaries.forEach(item=>{if(item&&item.target)selectors.push(item.target.selector);});
  });
  assert.ok(selectors.length>=4,'default config names several targets');
  for(const selector of selectors)
    for(const cls of selector.match(/\.[A-Za-z0-9_-]+/g)||[])
      assert.ok(engine.includes(cls.slice(1)),
        'engine no longer renders "'+cls+'" — retarget the default tour config');
});

test('token-based diagram state stays within the documented vocabulary',()=>{
  config.steps.forEach(step=>{
    const ds=step.diagramState;
    if(!ds)return;
    if(typeof ds.path==='string' && ds.path.startsWith('@'))assert.equal(ds.path,'@alt');
    if(typeof ds.step==='string' && ds.step.startsWith('@'))assert.equal(ds.step,'@shared');
  });
});
