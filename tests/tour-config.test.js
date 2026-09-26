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
  assert.deepEqual(ids,['welcome','mode-ambient','mode-step','controls','branching-split','branching-rejoin','links','drill','story','panels','finish-ux','finish-eng']);
  const panels=config.steps.find(s=>s.id==='panels');
  assert.deepEqual(plain(panels.demo),{advance:3,intervalMs:1800});
  assert.deepEqual(plain(panels.personas),['ux','both']);
  // Branching is demonstrated, not just pointed at: both halves advance,
  // and both reveal the diagram so the cause is visible, not just the chips.
  assert.equal(config.steps.find(s=>s.id==='branching-split').demo.advance,3);
  assert.equal(config.steps.find(s=>s.id==='branching-rejoin').diagramState.step,'@rejoin');
  for(const id of ['mode-ambient','mode-step','branching-split','branching-rejoin','panels'])
    assert.equal(config.steps.find(s=>s.id===id).reveal[0].selector,'.board',id+' reveals the diagram');
  // The links step opens the menu it talks about and rings the trigger.
  const links=config.steps.find(s=>s.id==='links');
  assert.equal(links.demo.click.selector,'.nrefs-trigger');
  assert.equal(links.target.selector,'.node-link-menu');
  assert.equal(links.secondary[0].target.selector,'.nrefs-trigger');
  // The drill step presses ⊞ and spotlights the opened detail flow, with
  // the breadcrumb (the way back) ringed; engineering tracks only.
  const drill=config.steps.find(s=>s.id==='drill');
  assert.equal(drill.demo.click.selector,'.detail-trigger');
  assert.ok(drill.target.selector.includes('[data-dv-detail-preview]'));
  assert.ok(drill.secondary[0].target.selector.includes('.detail-breadcrumb'));
  assert.deepEqual(plain(drill.personas),['eng','both']);
  // Shipped default copy stays generic: no page-specific widget names.
  config.steps.forEach(s=>{
    const text=((s.copy&&(s.copy.heading+' '+s.copy.body))||'').toLowerCase();
    for(const word of ['home','phone','doorbell','camera','hub'])
      assert.ok(!text.includes(word),'default copy must not name page widgets: '+s.id+' / '+word);
  });
  assert.equal(config.steps[0].kind,'chooser');
  assert.equal(config.steps[config.steps.length-1].kind,'done');
  const eng=plain(context.tourStepsForPersona(config,'eng').map(s=>s.id));
  const ux=plain(context.tourStepsForPersona(config,'ux').map(s=>s.id));
  const both=plain(context.tourStepsForPersona(config,'both').map(s=>s.id));
  // eng: the mode pair (map, then sequence), branching, links, its recap
  assert.deepEqual(eng,['welcome','mode-ambient','mode-step','branching-split','branching-rejoin','links','drill','finish-eng']);
  // ux: one simple controls step, no AMBIENT anywhere in its copy
  assert.deepEqual(ux,['welcome','controls','branching-split','branching-rejoin','story','panels','finish-ux']);
  context.tourStepsForPersona(config,'ux').forEach(s=>{
    const text=(s.copy&&(s.copy.heading+' '+s.copy.body))||'';
    assert.ok(!text.includes('AMBIENT'),'ux copy never mentions AMBIENT: '+s.id);
  });
  // both: the eng mode pair plus the ux story/panels — an authored union
  assert.deepEqual(both,['welcome','mode-ambient','mode-step','branching-split','branching-rejoin','links','drill','story','panels','finish-eng']);
  // the mode pair is adjacent: the map, then the sequence
  assert.equal(eng.indexOf('mode-step'),eng.indexOf('mode-ambient')+1);
});

test('every selector class the default config names is rendered by the engine',()=>{
  const engine=readSource('engine.js');
  const selectors=[];
  config.steps.forEach(step=>{
    if(step.target)selectors.push(step.target.selector);
    if(step.demo&&step.demo.click)selectors.push(step.demo.click.selector);
    (Array.isArray(step.reveal)?step.reveal:[]).forEach(item=>selectors.push(item.selector));
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
    if(typeof ds.step==='string' && ds.step.startsWith('@'))assert.ok(['@shared','@rejoin'].includes(ds.step));
  });
});
