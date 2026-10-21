'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {execFileSync,spawnSync}=require('node:child_process');
const loader=require('../tools/source-loader.cjs');
const root=path.resolve(__dirname,'..'),plain=value=>JSON.parse(JSON.stringify(value));
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-assembly-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const manifest={'validator.js':['validator.js'],'aliased.js':['compatibility.js','helpers/*.js'],entrypoints:{probe:{sources:['aliased.js'],boot:'boot.js',exports:{features:'FEATURES'}}}};
  fs.mkdirSync(path.join(dir,'helpers'));
  fs.writeFileSync(path.join(dir,'validator.js'),"var PanelRegistry={types:()=>['probe'],get:()=>({label:'Probe'})};");
  fs.writeFileSync(path.join(dir,'compatibility.js'),'var FEATURES=/* @panel-features */ {};\r\n\r\n');
  fs.writeFileSync(path.join(dir,'helpers/b.js'),'var second=2;\n');fs.writeFileSync(path.join(dir,'helpers/a.js'),'var first=1;  \n');
  fs.writeFileSync(path.join(dir,'boot.js'),'throw Error("boot must not run during assembly");');
  function save(){fs.writeFileSync(path.join(dir,'source-bundles.json'),JSON.stringify(manifest));}save();return {dir,manifest,save};
}
test('logical expansion, named composition and CLI share order, physical feature substitution and explicit boot boundaries',t=>{
  const {dir}=fixture(t),entry=loader.entrypoint('probe',dir),context={};
  assert.deepEqual(entry.records.map(record=>record.file),['compatibility.js','helpers/a.js','helpers/b.js','boot.js']);
  assert.equal(entry.source,loader.composeSources(['aliased.js','boot.js'],dir));
  assert.equal(entry.body.includes('boot must not'),false);assert.equal(entry.body.includes('\r'),false);
  vm.runInNewContext(loader.readSource('aliased.js',dir),context);
  assert.equal(context.FEATURES['panel.probe'].label,'Probe panel');assert.equal(context.first,1);assert.equal(context.second,2);
  assert.equal(entry.source.includes('/* @panel-features */'),false);
  const real=loader.entrypoint('workbench');
  const cli=JSON.parse(execFileSync(process.execPath,[path.join(root,'tools/source-loader.cjs'),'--entrypoint','workbench'],{encoding:'utf8',maxBuffer:32*1024*1024}));
  assert.deepEqual(cli,real);assert.ok(real.body.includes('function createBuilderInteractions('));
  assert.equal(real.records.at(-1).file,'boot.workbench.js');
});
test('unknown entrypoints, missing inputs/exports, duplicate physical files and empty globs fail explicitly',t=>{
  const {dir,manifest,save}=fixture(t);
  assert.throws(()=>loader.entrypoint('boot.js',dir),/Unknown source entrypoint/);
  manifest.entrypoints.probe.sources.push('compatibility.js');save();assert.throws(()=>loader.entrypoint('probe',dir),/Duplicate physical source/);
  manifest.entrypoints.probe.sources=['missing.js'];save();assert.throws(()=>loader.entrypoint('probe',dir),/missing.js/);
  manifest.entrypoints.probe.sources=['aliased.js'];manifest.entrypoints.probe.exports={missing:'notDeclared'};save();assert.throws(()=>loader.entrypoint('probe',dir),/Missing entrypoint export.*notDeclared/);
  manifest.entrypoints.probe.exports={};save();assert.throws(()=>loader.moduleSource('probe','esm',dir),/no module exports/);
  fs.rmSync(path.join(dir,'helpers/a.js'));fs.rmSync(path.join(dir,'helpers/b.js'));assert.throws(()=>loader.entrypoint('probe',dir),/Empty source glob/);
});
test('actual entrypoints have unique ordered declarations and deliberate exports, without exposing private test helpers',()=>{
  for(const name of ['standalone','workbench','backend','native','forge','compatibility']){
    const entry=loader.entrypoint(name),files=entry.records.map(record=>record.file);
    assert.equal(new Set(files).size,files.length,name);assert.equal(files.filter(file=>file==='compatibility.js').length,1);
    if(files.includes('icons/brand.js')){
      assert.equal(files.filter(file=>file==='company-brand.config.js').length,1,name);
      assert.ok(files.indexOf('company-brand.config.js')<files.indexOf('icons/brand.js'),name);
    }
    assert.equal(entry.source.includes('/* @panel-features */'),false,name);
    assert.equal(Object.keys(entry.exports).includes('wireBuilderCommit'),false);
  }
  assert.equal(loader.entrypoint('backend').records.some(record=>record.file==='engine.js'),false);
  assert.deepEqual(Object.keys(loader.entrypoint('forge').exports),['buildConfluenceExport','buildConfluenceConfig','confluenceSections','confluenceDisplayPage','confluenceSourceUrl','CONFLUENCE_INPUT_BYTES','SKIN_NAMES','SELECTABLE_SKINS','skinLabel','DEFAULT_SKIN','renderPage','applySkinClasses','wireReaderShortcuts']);
});
test('static backend module uses only pure sources and retains the packaged facade and semantic diagnostics',()=>{
  const context={module:{exports:{}}};
  for(const name of ['document','window','require','process'])Object.defineProperty(context,name,{get(){throw Error(name+' accessed');}});
  vm.runInNewContext(loader.moduleSource('backend','cjs'),context);
  const core=context.module.exports,routing=core.viewerRouting();assert.equal(core.viewerRouting(),routing);
  const raw={nodes:{a:{}},rows:[['a']],steps:[{id:'hidden',text:'Exact',nodes:['a']}]};
  assert.deepEqual(plain(core.validateSpec(raw)),{errors:[],warnings:[]});
  assert.equal(typeof routing.resolveSourceStep,'function');assert.equal(typeof core.clone,'function');
  const generated=require('../tools/canon/core.cjs');
  assert.deepEqual(plain(core.validateSpec({nodes:[],rows:[]})),plain(generated.validateSpec({nodes:[],rows:[]})));
  assert.deepEqual(Object.keys(routing),Object.keys(generated.viewerRouting()));
});
test('asset inventory keeps page CSS raw, ordered panel CSS and the explicit all/Forge font policies',()=>{
  const native=loader.entrypointAssets('native'),forge=loader.entrypointAssets('forge');
  assert.deepEqual(native.styles.map(style=>style.file),['style.flowview.css','style.core.css']);
  assert.equal(native.styles[0].source,fs.readFileSync(path.join(root,'src/style.flowview.css'),'utf8'));
  assert.equal(native.styles[1].source,loader.readStyles('style.core.css'));assert.equal(native.icons,forge.icons);
  assert.equal(native.fonts.length,24);assert.equal(forge.fonts.length,9);assert.equal(native.licenses.length,8);assert.equal(forge.licenses.length,3);
  assert.deepEqual(forge.fonts.map(font=>[font.family,font.weight]),[
    ['IBM Plex Sans',400],['IBM Plex Sans',500],['IBM Plex Sans',600],['IBM Plex Mono',400],['IBM Plex Mono',500],['IBM Plex Mono',600],['IBM Plex Mono',700],['Sora',600],['Sora',700]]);
  for(const font of native.fonts){assert.ok(native.licenses.some(license=>license.file===font.license));assert.equal(font.data,fs.readFileSync(path.join(root,'src',font.file)).toString('base64'));}
  for(const font of forge.fonts)assert.match(font.fontsource,/^@fontsource\/.+\/latin-\d+\.css$/);
  assert.equal((loader.fontCss('all').match(/@font-face/g)||[]).length,24);
  assert.throws(()=>loader.fontAssets('unknown'),/Unknown font profile/);
});

test('biology and physics packages register only their own panel sources and assets',()=>{
  const cli=(args,selected='')=>execFileSync(process.execPath,[path.join(root,'tools/source-loader.cjs'),...args],{
    encoding:'utf8',maxBuffer:32*1024*1024,
    env:{...process.env,FLOWVIEW_COMPANY_IDENTITY:'off',FLOWVIEW_PACKAGES:selected}
  });
  assert.deepEqual(JSON.parse(cli(['--packages'])),[]);
  assert.deepEqual(JSON.parse(cli(['--packages'],'science')),['science']);
  assert.deepEqual(JSON.parse(cli(['--packages'],'physics')),['physics']);
  const domains={science:['rnacopy'],physics:['forcebody','wavefield']};
  const baseline=JSON.parse(cli(['--files','validator.js']));
  const basicAssets=JSON.parse(cli(['--assets']));
  for(const [name,names] of Object.entries(domains)){
    const selected=JSON.parse(cli(['--files','validator.js'],name));
    const assets=JSON.parse(cli(['--assets'],name));
    for(const type of names){
      assert.equal(baseline.some(file=>file.includes('/'+type+'.js')),false,type);
      assert.equal(Object.hasOwn(basicAssets.features,'panel.'+type),false,type);
      assert.ok(selected.includes('@package/'+name+'/panels/types/'+type+'.js'),type);
      assert.ok(Object.hasOwn(assets.features,'panel.'+type),type);
    }
    for(const other of Object.keys(domains).filter(other=>other!==name))
      for(const type of domains[other]){
        assert.equal(selected.some(file=>file.includes('/'+type+'.js')),false,name+' excludes '+type);
        assert.equal(Object.hasOwn(assets.features,'panel.'+type),false,name+' excludes '+type);
      }
  }
  assert.doesNotMatch(cli(['--styles','style.core.css']),/\.wavefield-panel\{/);
  assert.doesNotMatch(cli(['--styles','style.core.css'],'science'),/\.wavefield-panel\{/);
  assert.match(cli(['--styles','style.core.css'],'physics'),/\.wavefield-panel\{/);
  const unknown=spawnSync(process.execPath,[path.join(root,'tools/source-loader.cjs'),'--packages'],{
    encoding:'utf8',env:{...process.env,FLOWVIEW_COMPANY_IDENTITY:'off',FLOWVIEW_PACKAGES:'unknown'}
  });
  assert.notEqual(unknown.status,0);
  assert.match(unknown.stderr,/Cannot read package unknown/);
});

test('generic grid and funnel remain core while domain packages stay optional',()=>{
  const cli=(args,selected='')=>execFileSync(process.execPath,[path.join(root,'tools/source-loader.cjs'),...args],{
    encoding:'utf8',maxBuffer:32*1024*1024,
    env:{...process.env,FLOWVIEW_COMPANY_IDENTITY:'off',FLOWVIEW_PACKAGES:selected}
  });
  const cases=[
    {selection:'',packages:[],domain:[]},
    {selection:'science',packages:['science'],domain:['science']},
    {selection:'physics',packages:['physics'],domain:['physics']},
    {selection:'sports',packages:['sports'],domain:['sports']},
    {selection:'science,sports',packages:['science','sports'],domain:['science','sports']},
  ];
  for(const {selection,packages,domain} of cases){
    assert.deepEqual(JSON.parse(cli(['--packages'],selection)),packages,selection);
    const files=JSON.parse(cli(['--files','validator.js'],selection));
    const assets=JSON.parse(cli(['--assets'],selection));
    for(const type of ['funnel','grid']){
      assert.equal(files.filter(file=>file==='panels/types/'+type+'.js').length,1,selection+' '+type);
      assert.equal(Object.hasOwn(assets.features,'panel.'+type),true,selection+' '+type);
    }
    assert.equal(files.some(file=>file.startsWith('@package/science/')),domain.includes('science'),selection);
    assert.equal(files.some(file=>file.startsWith('@package/physics/')),domain.includes('physics'),selection);
    assert.equal(files.some(file=>file.startsWith('@package/sports/')),domain.includes('sports'),selection);
  }
});
