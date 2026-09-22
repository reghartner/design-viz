'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {readSource, sourceFiles} = require('../tools/source-loader.cjs');
function core(overrides = {}) {
  const context = {...overrides};
  vm.runInNewContext(readSource('validator.js') + '\n' + readSource('engine.js'), context);
  return context;
}
test('every supported panel has one discoverable renderer and duplicate registration fails', () => {
  const c = core();
  const files = sourceFiles('validator.js').filter(file => file.startsWith('panels/types/'));
  assert.deepEqual(files.map(file => path.basename(file, '.js')).sort(), Array.from(c.PANEL_TYPES).sort());
  assert.deepEqual(Array.from(c.PanelViews.types()).sort(), Array.from(c.PANEL_TYPES).sort());
  assert.throws(() => c.PanelViews.register('gauge', () => ({})), /Duplicate/);
  assert.equal(c.PanelViews.get('constructor'), undefined);
  const host = {querySelector(){return null;},querySelectorAll(){return [];}};
  c.renderPanelBody(host,{type:'unknown<panel>'},{},'pastel',[],0,false);
  assert.match(host.innerHTML,/unknown&lt;panel&gt;/);
});
test('adding a renderer file needs no assembly-list or shared lifecycle edit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'flowview-panel-module-'));
  try {
    fs.mkdirSync(path.join(root,'panels/types'),{recursive:true});
    fs.mkdirSync(path.join(root,'core'),{recursive:true});
    fs.copyFileSync(path.join(__dirname,'../src/source-bundles.json'),path.join(root,'source-bundles.json'));
    fs.copyFileSync(path.join(__dirname,'../src/panels/shared.js'),path.join(root,'panels/shared.js'));
    fs.copyFileSync(path.join(__dirname,'../src/panels/registry.js'),path.join(root,'panels/registry.js'));
    fs.copyFileSync(path.join(__dirname,'../src/validator.js'),path.join(root,'validator.js'));
    for (const file of sourceFiles('validator.js').filter(file => file.startsWith('core/')))
      fs.copyFileSync(path.join(__dirname,'../src',file),path.join(root,file));
    for (const file of sourceFiles('engine.js').filter(file => file !== 'engine.js')) {
      fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});
      fs.copyFileSync(path.join(__dirname,'../src',file),path.join(root,file));
    }
    fs.writeFileSync(path.join(root,'engine.js'),'var RM = true;');
    const file = path.join(root,'panels/types/probe.js');
    fs.writeFileSync(file,"PanelViews.register('probe',function(host,panel,state){return {html:esc(state.text)};});");
    const context = {};
    vm.runInNewContext(readSource('validator.js',root) + '\n' + readSource('engine.js',root),context);
    let writes=0;
    const host={querySelector(){return null;},querySelectorAll(){return [];},set innerHTML(html){this.html=html;writes++;}};
    context.renderPanelBody(host,{type:'probe'},{text:'<ready>'},'pastel',[],0,false);
    context.renderPanelBody(host,{type:'probe'},{text:'<ready>'},'pastel',[],0,false);
    assert.equal(host.html,'&lt;ready&gt;');
    assert.equal(writes,1,'the new panel shares unchanged-DOM behavior');
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('an immediate jump cancels a pending shared level release before it can overwrite the target', () => {
  const frames=[];
  const c=core({requestAnimationFrame:fn=>(frames.push(fn),frames.length),cancelAnimationFrame(){}});
  const fill={style:{},getBoundingClientRect(){return {};}};
  const value={firstChild:{nodeValue:''}};
  const host={querySelector:selector=>selector==='.gaugefill'?fill:selector==='.gaugeval'?value:null,querySelectorAll(){return [];}};
  c.renderPanelBody(host,{type:'gauge',max:100},{value:20},'pastel',[],0,false);
  c.renderPanelBody(host,{type:'gauge',max:200},{value:20},'pastel',[],1,true);
  assert.ok(frames.length,'a level transition has been scheduled');
  c.renderPanelBody(host,{type:'gauge',max:100},{value:60},'pastel',[],2,false);
  while(frames.length)frames.shift()();
  assert.equal(fill.style.width,'60.0%');
  assert.equal(fill.style.transition,'none');
  assert.equal(value.firstChild.nodeValue,'60');
});
test('panel cleanup cancels timer/tween ownership and invalidates pending frame releases', () => {
  const cancelled=[],timers=[];
  const c=core({cancelAnimationFrame:id=>cancelled.push(id),clearTimeout:id=>timers.push(id)});
  const host={_thTween:41,_pulseTimer:42,_ifEpoch:2};
  c.cancelPanelMotion(host);
  assert.deepEqual(cancelled,[41]);assert.deepEqual(timers,[42]);
  assert.equal(host._thTween,null);assert.equal(host._pulseTimer,null);assert.equal(host._ifEpoch,3);
});
