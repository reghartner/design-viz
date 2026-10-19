'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function cli(args,company=true,packages='sports') {
  return execFileSync(process.execPath,[path.join(root,'tools/source-loader.cjs'),...args],{encoding:'utf8',maxBuffer:32*1024*1024,
    env:{...process.env,FLOWVIEW_COMPANY_IDENTITY:company?'':'off',FLOWVIEW_SITE_CONFIG:'',FLOWVIEW_PACKAGE_BASE:packages,FLOWVIEW_PACKAGES:''}});
}
const C={URL,console};vm.runInNewContext(JSON.parse(cli(['--entrypoint','native'])).source,C);
const css=cli(['--styles','style.core.css']);

test('core and non-company sports assemblies exclude team options, CSS and payload',()=>{
  for(const packages of ['', 'sports']){
    const entry=JSON.parse(cli(['--entrypoint','workbench'],false,packages));
    const context={URL,console};vm.runInNewContext(entry.body,context);
    assert.deepEqual(Array.from(context.SKIN_NAMES),['aurora','daylight','editorial','terminal','pastel','blueprint','rose','lavender','lilac']);
    assert.deepEqual(Array.from(context.SELECTABLE_SKINS),['aurora','pastel','blueprint','terminal','rose','lavender','lilac']);
    assert.equal(context.querySkin('?theme=islanders'),null);
    assert.equal(context.IslandersBrand,undefined);
    assert.equal(context.createCompanyLibraryDecoration,undefined);
    assert.equal(context.CompanyVenueDecoration,undefined);
    for(const text of [entry.source,cli(['--styles','style.core.css'],false,packages),cli(['--styles','style.workbench.css'],false,packages)])assert.doesNotMatch(text,/islanders|@theme-asset:/i);
    if(packages==='sports'){
      assert.ok(context.PanelRegistry.get('seatmap'));
      const html=context.seatmapHTML({id:'home',type:'seatmap',venue:'ubs-arena'},{});
      assert.match(html,/seatmap-landmark/);assert.doesNotMatch(html,/islanders|data:image\/png/);
    }
  }
});

test('Friends selects its theme independently of packages and preserves URL precedence',()=>{
  assert.equal(C.resolveSkin('dv_skin=terminal','daylight','?theme=islanders'),'islanders');
  assert.deepEqual(Array.from(C.skinClasses('islanders')),['sk-aurora','sk-pastel','sk-islanders']);
  const standalone={URL,console};vm.runInNewContext(JSON.parse(cli(['--entrypoint','native'],true,'')).source,standalone);
  assert.ok(standalone.SKIN_NAMES.includes('islanders'));
  assert.equal(standalone.PanelRegistry.get('seatmap'),undefined);
  assert.match(css,/body\.sk-islanders/);
  assert.match(cli(['--sources','library.workbench.js']),/function createCompanyLibraryDecoration/);
});

test('official Islanders crest is embedded, centered on UBS ice, and absent from generic maps', () => {
  for (const variant of ['light','dark']) {
    const bytes = fs.readFileSync(path.join(__dirname,'../company/themes/islanders/assets/primary-'+variant+'.png'));
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
  assert.equal(C.IslandersBrand.story('season-of-seats'),true);
});
