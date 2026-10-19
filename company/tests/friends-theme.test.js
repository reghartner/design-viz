'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const {cli}=require('./theme-fixture.cjs');
const C={URL,console};vm.runInNewContext(JSON.parse(cli(['--entrypoint','native'])).source,C);
const css=cli(['--styles','style.core.css']);

test('Friends selects its theme independently of packages and preserves URL precedence',()=>{
  assert.equal(C.resolveSkin('dv_skin=terminal','daylight','?theme=islanders'),'islanders');
  assert.deepEqual(Array.from(C.skinClasses('islanders')),['sk-aurora','sk-pastel','sk-islanders']);
  const standalone={URL,console};vm.runInNewContext(JSON.parse(cli(['--entrypoint','native'],'')).source,standalone);
  assert.ok(standalone.SKIN_NAMES.includes('islanders'));
  assert.equal(standalone.PanelRegistry.get('seatmap'),undefined);
  assert.match(css,/body\.sk-islanders/);
  assert.match(cli(['--sources','library.workbench.js']),/function createCompanyLibraryDecoration/);
});

test('official Islanders crest is embedded, centered on UBS ice, and absent from generic maps', () => {
  for (const variant of ['light','dark']) {
    const bytes = fs.readFileSync(path.join(__dirname,'../themes/islanders/assets/primary-'+variant+'.png'));
    assert.equal(C.IslandersBrand[variant], 'data:image/png;base64,'+bytes.toString('base64'));
    assert.ok(bytes.length < 80*1024);
  }
  const p = {id:'home',type:'seatmap',venue:'ubs-arena'};
  const model = C.seatmapModel(p,{}), html = C.seatmapHTML(p,{});
  const mark = /<image class="seatmap-islanders-logo" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(html);
  assert.ok(mark);assert.equal(mark[3],mark[4]);
  assert.ok(Math.abs(+mark[1]+(+mark[3]/2)-(model.fieldBox.x+model.fieldBox.width/2))<0.1);
  assert.ok(Math.abs(+mark[2]+(+mark[4]/2)-(model.fieldBox.y+model.fieldBox.height/2))<0.1);
  assert.match(html,/preserveAspectRatio="xMidYMid meet" href="data:image\/png;base64,/);
  assert.doesNotMatch(C.seatmapHTML({id:'map',type:'seatmap',rings:[],sections:[],bowl:'rink'},{}),/seatmap-islanders-logo/);
  assert.doesNotMatch(C.seatmapHTML({id:'map',type:'seatmap',rings:[],sections:[],venue:'unknown'},{}),/seatmap-islanders-logo/);
  assert.match(css,/\.seatmap-islanders-logo\{display:none/);
  assert.match(css,/\.sk-islanders \.seatmap-islanders-logo\{display:inline/);
  assert.equal(C.IslandersBrand.story('copy-gate'),false);
  assert.equal(C.IslandersBrand.story('nsp15-insertion-evidence'),false);
  assert.equal(C.IslandersBrand.story('season-of-seats'),true);
});
