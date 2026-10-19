'use strict';
/* Company identity from the fork-owned company/company.json: repository links,
   company labels and brand come from configuration, never from source edits.
   Without the file (or with build.py --no-config) outputs are unchanged. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {copyCheckout,kitFiles}=require('./helpers/checkout-copy.js');
const ROOT=path.join(__dirname,'..');
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const CONFIG={version:1,companyName:'Acme',repository:'https://github.com/acme/design-viz.git',revision:'release/2',brand:'brand.json',
  backstage:{baseUrl:'https://portal.acme.example/developer///'}};
const BRAND={logo:'acme.png',primaryColor:'#123456',secondaryColor:'#fff'};

// A loader whose own checkout is a scratch copy of src/, so its company/ is ours.
function scratchLoader(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-company-identity-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.cpSync(path.join(ROOT,'src'),path.join(root,'src'),{recursive:true});
  fs.mkdirSync(path.join(root,'tools'));fs.mkdirSync(path.join(root,'company'));
  fs.copyFileSync(path.join(ROOT,'tools/source-loader.cjs'),path.join(root,'tools/source-loader.cjs'));
  const write=(name,value)=>fs.writeFileSync(path.join(root,'company',name),typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));
  return {root,write,loader:require(path.join(root,'tools/source-loader.cjs'))};
}
function brandConfig(source){
  const context={};vm.runInNewContext(source,context);return JSON.parse(JSON.stringify(context.FLOWVIEW_COMPANY_BRAND_CONFIG));
}

test('without company.json every marked source assembles exactly as upstream text',t=>{
  const {loader}=scratchLoader(t),real=require('../tools/source-loader.cjs');
  assert.equal(loader.companyConfig(),null);
  assert.deepEqual(loader.companyAgentContext(),{});
  for(const file of ['canon.workbench.js','library.workbench.js','welcome.workbench.js','workbench/inspector.js','workbench/onboarding.js','company-brand.config.js']){
    const source=loader.readSource(file);
    assert.equal(source.includes('/*@company:'),false,file);
    assert.equal(source,fs.readFileSync(path.join(ROOT,'src',file),'utf8').replace(/\r\n?/g,'\n').trimEnd().replace(/\/\*@company:[a-z-]+\*\//g,''),file);
    if(!real.companyConfig())assert.equal(source,real.readSource(file),file);
  }
  assert.match(loader.readSource('canon.workbench.js'),/summary\.textContent='Company repository'/);
  assert.match(loader.readSource('workbench/inspector.js'),/frow\('Company service',picker\)/);
  assert.match(loader.readSource('workbench/inspector.js'),/'https:\/\/github\.com\/reghartner\/design-viz\/blob\/main\/docs\/tour\.md'/);
  assert.match(loader.readSource('welcome.workbench.js'),/'Use the repository root, such as https:\/\/github\.com\/your-team\/design-viz\.'/);
  assert.deepEqual(brandConfig(loader.readSource('company-brand.config.js')),
    {companyName:'YOUR COMPANY',logo:'YC',primaryColor:'#6750A4',secondaryColor:'#FFFFFF'});
});

test('company package list is an opt-in selection with validated names',t=>{
  const {root,write,loader}=scratchLoader(t);
  fs.mkdirSync(path.join(root,'packages'),{recursive:true});
  fs.cpSync(path.join(ROOT,'packages/science'),path.join(root,'packages/science'),{recursive:true});
  assert.deepEqual(loader.enabledPackages(),[]);
  write('company.json',{version:1,packages:['science']});
  assert.deepEqual(loader.enabledPackages(),['science']);
  assert.ok(loader.sourceFiles('validator.js').includes('@package/science/panels/types/rnacopy.js'));
  write('company.json',{version:1,packages:['science','science']});
  assert.throws(()=>loader.companyConfig(),/packages must be a list of unique/);
  write('company.json',{version:1,packages:['../science']});
  assert.throws(()=>loader.companyConfig(),/packages must be a list of unique/);
});

test('company theme manifests validate names, local resources and disabled selection',t=>{
  const {write,loader}=scratchLoader(t);
  write('company.json',{version:1,theme:'theme.json'});
  write('theme.json',{skins:[{name:'fixture',layers:['aurora','pastel']}],runtime:'theme.js',styles:{core:'theme.css'}});
  write('theme.js','var FixtureTheme=true;');write('theme.css','.sk-fixture{color:#123456}');
  assert.deepEqual(loader.companyTheme().skins,[{name:'fixture',layers:['aurora','pastel']}]);
  assert.ok(loader.sourceFiles('validator.js').includes('@company/theme.js'));
  for(const skins of [[{name:'pastel',layers:['aurora']}],[{name:'fixture',layers:['unknown']}],
    [{name:'fixture',layers:[]}],[{name:'fixture',layers:['aurora']},{name:'fixture',layers:['aurora']}],
    [{name:'fixture',layers:['aurora'],unknown:true}]]){
    write('theme.json',{skins});assert.throws(()=>loader.companyTheme(),/skins must/);
  }
  write('theme.json',{skins:[],runtime:'../src/engine.js'});
  assert.throws(()=>loader.companyTheme(),/invalid theme file/);
  write('theme.json',{skins:[],kitFiles:['../outside.md']});
  assert.throws(()=>loader.companyTheme(),/kitFiles/);
  const prior=process.env.FLOWVIEW_COMPANY_IDENTITY;
  try{
    process.env.FLOWVIEW_COMPANY_IDENTITY='off';
    assert.equal(loader.companyTheme(),null);
    assert.ok(!loader.sourceFiles('validator.js').includes('@company/theme.js'));
  }finally{if(prior===undefined)delete process.env.FLOWVIEW_COMPANY_IDENTITY;else process.env.FLOWVIEW_COMPANY_IDENTITY=prior;}
});

test('optional package helper, venue and type sources load in dependency order without default leakage',t=>{
  const {root,write,loader}=scratchLoader(t);
  const pkg=path.join(root,'packages/sports-fixture');
  for(const directory of ['panels','panels/venues','panels/types'])
    fs.mkdirSync(path.join(pkg,directory),{recursive:true});
  fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({
    name:'sports-fixture',templates:[],sourceFiles:[
      'panels/types/fixture.js','panels/venues/fixture.js','panels/fixture-helper.js'
    ],workbenchSourceFiles:['panels/fixture-import.js']
  }));
  fs.writeFileSync(path.join(pkg,'panels/fixture-helper.js'),"var PACKAGE_ORDER=['helper'];");
  fs.writeFileSync(path.join(pkg,'panels/venues/fixture.js'),"PACKAGE_ORDER.push('venue');");
  fs.writeFileSync(path.join(pkg,'panels/types/fixture.js'),"PACKAGE_ORDER.push('type');PanelRegistry.define('sports-fixture',{label:'Sports fixture'});");
  fs.writeFileSync(path.join(pkg,'panels/fixture-import.js'),"var PACKAGE_WORKBENCH_IMPORT=true;");
  assert.deepEqual(loader.enabledPackages(),[]);
  assert.doesNotMatch(loader.readSource('validator.js'),/PACKAGE_ORDER/);
  assert.ok(!loader.sourceFiles('builder.workbench.js').some(file=>file.includes('fixture-import')));
  write('company.json',{version:1,packages:['sports-fixture']});
  const selected=loader.sourceFiles('validator.js');
  const packageFiles=selected.filter(file=>file.startsWith('@package/'));
  assert.deepEqual(packageFiles,[
    '@package/sports-fixture/panels/fixture-helper.js',
    '@package/sports-fixture/panels/venues/fixture.js',
    '@package/sports-fixture/panels/types/fixture.js'
  ]);
  const context={};vm.runInNewContext(loader.readSource('validator.js'),context);
  assert.deepEqual(Array.from(context.PACKAGE_ORDER),['helper','venue','type']);
  assert.equal(context.PanelRegistry.get('sports-fixture').label,'Sports fixture');
  assert.ok(!loader.sourceFiles('validator.js').some(file=>file.includes('fixture-import')));
  assert.ok(loader.sourceFiles('builder.workbench.js').includes('@package/sports-fixture/panels/fixture-import.js'));
});

test('company venue entries load only when the sports registry is selected',t=>{
  const {root,write,loader}=scratchLoader(t);
  const venue=path.join(root,'company/panels/venues/fixture-hall.js');
  fs.mkdirSync(path.dirname(venue),{recursive:true});
  fs.writeFileSync(venue,"SeatmapVenues.define({id:'fixture-hall',name:'Fixture Hall',seatmap:{rings:[],sections:[]}});");
  assert.ok(!loader.sourceFiles('validator.js').includes('@company/panels/venues/fixture-hall.js'));
  const sports=path.join(root,'packages/sports');
  fs.mkdirSync(sports,{recursive:true});
  fs.writeFileSync(path.join(sports,'package.json'),JSON.stringify({name:'sports',sourceFiles:[],templates:[]}));
  write('company.json',{version:1,packages:['sports']});
  assert.ok(loader.sourceFiles('validator.js').includes('@company/panels/venues/fixture-hall.js'));
});

test('company.json replaces the labels, repository links and brand in assembled sources',t=>{
  const {loader,write}=scratchLoader(t);
  write('company.json',CONFIG);write('brand.json',BRAND);write('acme.png',PNG);
  const config=loader.companyConfig();
  assert.equal(config.repository,'https://github.com/acme/design-viz');
  assert.equal(config.revision,'release/2');
  assert.deepEqual(config.backstage,{baseUrl:'https://portal.acme.example/developer'});
  assert.deepEqual(loader.companyAgentContext(),{backstage:config.backstage});
  assert.deepEqual(config.brand,{companyName:'Acme',logo:'data:image/png;base64,'+PNG.toString('base64'),primaryColor:'#123456',secondaryColor:'#fff'});
  const canon=loader.readSource('canon.workbench.js');
  assert.match(canon,/summary\.textContent="Acme repository"/);
  assert.match(canon,/new Error\("Acme repository unavailable\. Use the local portal/);
  assert.match(loader.readSource('library.workbench.js'),/origin="Acme repository snapshot"/);
  const inspector=loader.readSource('workbench/inspector.js');
  assert.match(inspector,/frow\("Acme service",picker\)/);
  assert.match(inspector,/"https:\/\/github\.com\/acme\/design-viz\/blob\/release%2F2\/docs\/tour\.md"/);
  const onboarding=loader.readSource('workbench/onboarding.js');
  assert.match(onboarding,/"Use Acme service, then Service API/);
  assert.match(onboarding,/label\.textContent==="Acme service"/);
  assert.match(loader.readSource('welcome.workbench.js'),/"Use the repository root, such as https:\/\/github\.com\/acme\/design-viz\."/);
  assert.deepEqual(brandConfig(loader.readSource('company-brand.config.js')),config.brand);
  // The bundled validator brand is what every viewer and Phone panel inherits.
  const context={};vm.runInNewContext(loader.readSource('validator.js'),context);
  assert.equal(context.FlowBrand.global().app,'Acme');assert.equal(context.FlowBrand.global().accent,'#123456');
  // Brand name falls back to companyName; an explicit brand name wins. Labels keep companyName.
  write('brand.json',{companyName:'Acme Devices',logo:'AD'});
  assert.equal(loader.companyConfig().brand.companyName,'Acme Devices');
  assert.match(loader.readSource('workbench/inspector.js'),/frow\("Acme service",picker\)/);
  // Disabled identity (build.py --no-config) restores upstream text.
  process.env.FLOWVIEW_COMPANY_IDENTITY='off';
  t.after(()=>{delete process.env.FLOWVIEW_COMPANY_IDENTITY;});
  assert.equal(loader.companyConfig(),null);
  assert.deepEqual(loader.companyAgentContext(),{});
  assert.match(loader.readSource('workbench/inspector.js'),/frow\('Company service',picker\)/);
});

test('invalid company identity fails the build with the field to fix',t=>{
  const {loader,write}=scratchLoader(t);
  const fails=(config,brand,pattern)=>{
    write('company.json',config);if(brand!==undefined)write('brand.json',brand);
    assert.throws(()=>loader.companyConfig(),pattern);
  };
  fails('{','',/Invalid company config .*company\.json/);
  fails({version:2},undefined,/version must be 1/);
  fails({version:1,owner:'x'},undefined,/unknown field owner/);
  fails({version:1,repository:'http://github.com/acme/design-viz'},undefined,/repository must be an https:\/\/ repository root/);
  fails({version:1,repository:'https://github.com/acme'},undefined,/repository must be an https:\/\/ repository root/);
  fails({version:1,repository:'https://u:p@github.com/acme/x'},undefined,/repository must be/);
  fails({version:1,companyName:'<b>Acme</b>'},undefined,/companyName must be/);
  fails({version:1,revision:'main branch'},undefined,/revision must be/);
  fails({version:1,brand:'missing.json'},undefined,/brand file not found: missing\.json/);
  fails({version:1,brand:'../src/flowview.demo.json'},undefined,/brand must be a relative path inside company\//);
  fails({version:1,brand:'/etc/hosts'},undefined,/brand must be a relative path inside company\//);
  fails({version:1,brand:'brand.json'},{logo:'../src/fonts/x.png'},/logo \.\.\/src\/fonts\/x\.png must be a relative path inside company\//);
  fails({version:1,brand:'brand.json'},{tagline:'x'},/unknown field tagline/);
  fails({version:1,brand:'brand.json'},{primaryColor:'blue'},/primaryColor must be #RGB or #RRGGBB/);
  fails({version:1,brand:'brand.json'},{logo:'TOOLONG'},/logo must be a 1–4 character monogram/);
  fails({version:1,brand:'brand.json'},{logo:'logo.png'},/brand\.json: logo file not found: logo\.png/);
  write('fake.png','not a png');
  fails({version:1,brand:'brand.json'},{logo:'fake.png'},/logo fake\.png must be a PNG, JPEG or WebP file/);
  fails({version:1,package:{registry:'ftp://x'}},undefined,/package\.registry must be an http\(s\) URL/);
  fails({version:1,package:{token:'x'}},undefined,/unknown package field token/);
});

test('Backstage context validates URL structure, preserves subpaths and reaches both connection modes',t=>{
  const {loader,write}=scratchLoader(t);
  for(const value of [null,[],true,'https://portal.example',{}, {baseUrl:null}, {baseUrl:42},
    {baseUrl:''}, {baseUrl:'/backstage'}, {baseUrl:'//portal.example'}, {baseUrl:'ftp://portal.example'},
    {baseUrl:'https:portal.example'}, {baseUrl:'https://user:pass@portal.example'},
    {baseUrl:'https://portal.example?token=secret'}, {baseUrl:'https://portal.example#home'},
    {baseUrl:'https://portal.example?'}, {baseUrl:'https://portal.example#'},
    {baseUrl:' https://portal.example'}, {baseUrl:'https://portal.example/a b'},
    {baseUrl:'https://portal.example/\npath'}, {baseUrl:'https://portal.example/\u0000path'},
    {baseUrl:'https://portal.example/\\path'}, {baseUrl:'https://portal.example',token:'secret'}]){
    write('company.json',{version:1,backstage:value});
    assert.throws(()=>loader.companyConfig(),/backstage/,JSON.stringify(value));
  }
  for(let code=0x80;code<=0x9f;code++){
    write('company.json',{version:1,backstage:{baseUrl:'https://portal.example/'+String.fromCharCode(code)+'team'}});
    assert.throws(()=>loader.companyConfig(),/backstage\.baseUrl.*control characters/,'C1 control U+'+code.toString(16));
  }
  const identity={sessionId:'session',connectionId:'connection'};
  for(const [input,expected] of [
    ['https://PORTAL.example/','https://portal.example'],
    ['http://localhost:7007/backstage/','http://localhost:7007/backstage'],
    ['https://portal.example/team/backstage','https://portal.example/team/backstage']]){
    write('company.json',{version:1,backstage:{baseUrl:input}});
    assert.equal(loader.companyConfig().backstage.baseUrl,expected);
    const context={};vm.runInNewContext(loader.readSource('workbench/agent-chat.js'),context);
    for(const mode of ['external','embedded']){
      const prompt=context.folderAgentInstructions('Story','mixed',false,identity,mode);
      assert.ok(prompt.includes('Company Backstage base URL: '+JSON.stringify(expected)),mode);
      assert.match(prompt,/does not identify a catalog entity, supply authentication or grant access/);
    }
  }
  write('company.json',{version:1});
  assert.deepEqual(loader.companyAgentContext(),{});
  const context={};vm.runInNewContext(loader.readSource('workbench/agent-chat.js'),context);
  assert.doesNotMatch(context.folderAgentInstructions('Story','mixed',false,identity,'external'),/Company Backstage base URL/);
});

test('a marker must name a known placeholder that its literal contains',t=>{
  const {root,loader}=scratchLoader(t);
  fs.writeFileSync(path.join(root,'src/probe.js'),"var a=/*@company:name*/'Our service';");
  assert.throws(()=>loader.readSource('probe.js'),/Company marker name in probe\.js has no placeholder/);
  fs.writeFileSync(path.join(root,'src/probe.js'),"var a=/*@company:owner*/'Company';");
  assert.throws(()=>loader.readSource('probe.js'),/Unknown company marker owner/);
  fs.writeFileSync(path.join(root,'src/probe.js'),"var a=/*@company:name*/'Company\\'s service';");
  assert.throws(()=>loader.readSource('probe.js'),/must precede a single-quoted literal/);
});

test('the built workbench shows configured links, labels and brand; without config it is unchanged',t=>{
  const checkout=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-company-build-'));
  t.after(()=>fs.rmSync(checkout,{recursive:true,force:true}));
  copyCheckout(checkout);
  const build=(...args)=>{
    execFileSync('python3',['tools/build.py',...args],{cwd:checkout,encoding:'utf8',timeout:120000,maxBuffer:20*1024*1024});
    return Object.fromEntries(['template/flowview.html','workbench/flowspec.html','tools/canon/generated-runtime.cjs']
      .map(file=>[file,fs.readFileSync(path.join(checkout,file),'utf8')]));
  };
  const plain=build();
  for(const source of Object.values(plain))assert.doesNotMatch(source,/islanders/i);
  assert.equal(kitFiles(plain['workbench/flowspec.html'])['tools/company-agent-context.json'],undefined);
  const workbench=plain['workbench/flowspec.html'];
  assert.ok(workbench.includes('<a id="welcome-repo-link" href="https://github.com/reghartner/design-viz"'));
  assert.ok(workbench.includes('<input id="welcome-repository" type="url" value="https://github.com/reghartner/design-viz"'));
  assert.ok(workbench.includes('<input id="welcome-revision" type="text" value="main"'));
  assert.ok(workbench.includes('href="https://github.com/reghartner/design-viz/blob/main/.claude/skills/hld-to-page/SKILL.md"'));
  assert.ok(workbench.includes("summary.textContent='Company repository'"));
  assert.ok(workbench.includes('<b>Company service</b>'));

  for(const [name,value] of [['company.json',JSON.stringify(CONFIG)],['brand.json',JSON.stringify(BRAND)],['acme.png',PNG]])
    fs.writeFileSync(path.join(checkout,'company',name),value);
  const branded=build();
  const html=branded['workbench/flowspec.html'];
  assert.ok(html.includes('<a id="welcome-repo-link" href="https://github.com/acme/design-viz"'));
  assert.ok(html.includes('<input id="welcome-repository" type="url" value="https://github.com/acme/design-viz"'));
  assert.ok(html.includes('<input id="welcome-revision" type="text" value="release/2"'));
  assert.ok(html.includes('id="welcome-skill-link" href="https://github.com/acme/design-viz/blob/release%2F2/.claude/skills/hld-to-page/SKILL.md"'));
  assert.ok(html.includes('summary.textContent="Acme repository"'));
  assert.ok(html.includes('frow("Acme service",picker)'));
  assert.ok(html.includes('<b>Acme service</b>')&&html.includes('File → Acme repository'));
  assert.equal(html.includes('reghartner/design-viz"'),false);
  const brand='var FLOWVIEW_COMPANY_BRAND_CONFIG = Object.freeze({"companyName":"Acme","logo":"data:image/png;base64,';
  for(const file of ['template/flowview.html','workbench/flowspec.html','tools/canon/generated-runtime.cjs'])
    assert.ok(branded[file].includes(brand),file);

  // The exact kit shipped in the Workbench carries only public authoring context.
  const files=kitFiles(html),expected={backstage:{baseUrl:'https://portal.acme.example/developer'}};
  assert.deepEqual(JSON.parse(files['tools/company-agent-context.json']),expected);
  for(const name of ['company/company.json','company/brand.json','company/acme.png','tools/source-loader.cjs'])
    assert.equal(files[name],undefined,name);
  const kit=path.join(checkout,'portable');
  for(const [name,content] of Object.entries(files)){
    const destination=path.join(kit,name);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,content);
  }
  const generate=(root,disabled=false)=>{
    execFileSync('python3',[path.join(root,'tools/authoring-packet.py'),'--mode','edit','--out',path.join(root,'packet.md')],
      {cwd:root,encoding:'utf8',env:{...process.env,...(disabled?{FLOWVIEW_COMPANY_IDENTITY:'off'}:{})}});
    return {text:fs.readFileSync(path.join(root,'packet.md'),'utf8'),meta:JSON.parse(fs.readFileSync(path.join(root,'packet.md.json'),'utf8'))};
  };
  for(const root of [checkout,kit]){
    const packet=generate(root);
    assert.ok(packet.text.includes('Backstage base URL: '+JSON.stringify(expected.backstage.baseUrl)));
    assert.deepEqual(packet.meta.companyContext,expected);
    assert.equal(packet.meta.size.bytes,Buffer.byteLength(packet.text));
    assert.equal(packet.meta.size.characters,[...packet.text].length);
    const disabled=generate(root,true);
    assert.doesNotMatch(disabled.text,/## Company Backstage context/);
    assert.equal(disabled.meta.companyContext,undefined);
  }

  // --no-config ignores company.json; deleting it gives the same bytes.
  assert.deepEqual(build('--no-config'),plain);
  fs.rmSync(path.join(checkout,'company/company.json'));
  assert.deepEqual(build(),plain);
  fs.writeFileSync(path.join(checkout,'company/company.json'),JSON.stringify({version:1,companyName:'Other Sports',packages:['sports']}));
  const sports=build();
  for(const source of Object.values(sports))assert.doesNotMatch(source,/islanders/i);
  const sportsKit=kitFiles(sports['workbench/flowspec.html']);
  for(const source of Object.values(sportsKit))assert.doesNotMatch(source,/islanders/i);
  assert.match(sports['template/flowview.html'],/function seatmapHTML/);
  assert.equal(sportsKit['tools/company-theme.json'],undefined);
});

test('site.baseUrl is configured once, validated and embedded in runtime and agent context',t=>{
 const {loader,write}=scratchLoader(t);write('company.json',{version:1,site:{baseUrl:'https://internal.example/teams/diagrams/'}});
 assert.equal(loader.companyConfig().site.baseUrl,'https://internal.example/teams/diagrams/');
 assert.deepEqual(loader.companyAgentContext(),{site:{baseUrl:'https://internal.example/teams/diagrams/'}});
 const B={};vm.runInNewContext(loader.readSource('core/document-links.js'),B);assert.equal(B.FLOWVIEW_SITE_BASE_URL,'https://internal.example/teams/diagrams/');
 for(const baseUrl of ['//internal.example/','https://user:pw@internal.example/','https://internal.example/?x=1','https://internal.example/#','https://internal.example/\\evil',' https://internal.example/']){
  write('company.json',{version:1,site:{baseUrl}});assert.throws(()=>loader.companyConfig(),/site.baseUrl/);
 }
});
