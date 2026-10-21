'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), path=require('node:path'), vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function cli(args,company=true,packages='sports') {
  return execFileSync(process.execPath,[path.join(root,'tools/source-loader.cjs'),...args],{encoding:'utf8',maxBuffer:32*1024*1024,
    env:{...process.env,FLOWVIEW_COMPANY_IDENTITY:company?'':'off',FLOWVIEW_SITE_CONFIG:'',FLOWVIEW_PACKAGE_BASE:packages,FLOWVIEW_PACKAGES:''}});
}

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
