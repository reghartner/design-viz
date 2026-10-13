'use strict';
/* Company identity from the fork-owned company/company.json: repository links,
   company labels and brand come from configuration, never from source edits.
   Without the file (or with build.py --no-config) outputs are unchanged. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {copyCheckout}=require('./helpers/checkout-copy.js');
const ROOT=path.join(__dirname,'..');
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
const CONFIG={version:1,companyName:'Acme',repository:'https://github.com/acme/design-viz.git',revision:'release/2',brand:'brand.json'};
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

test('company.json replaces the labels, repository links and brand in assembled sources',t=>{
  const {loader,write}=scratchLoader(t);
  write('company.json',CONFIG);write('brand.json',BRAND);write('acme.png',PNG);
  const config=loader.companyConfig();
  assert.equal(config.repository,'https://github.com/acme/design-viz');
  assert.equal(config.revision,'release/2');
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
  fails({version:1,brand:'brand.json'},{tagline:'x'},/unknown field tagline/);
  fails({version:1,brand:'brand.json'},{primaryColor:'blue'},/primaryColor must be #RGB or #RRGGBB/);
  fails({version:1,brand:'brand.json'},{logo:'TOOLONG'},/logo must be a 1–4 character monogram/);
  fails({version:1,brand:'brand.json'},{logo:'logo.png'},/brand\.json: logo file not found: logo\.png/);
  write('fake.png','not a png');
  fails({version:1,brand:'brand.json'},{logo:'fake.png'},/logo fake\.png must be a PNG, JPEG or WebP file/);
  fails({version:1,package:{registry:'ftp://x'}},undefined,/package\.registry must be an http\(s\) URL/);
  fails({version:1,package:{token:'x'}},undefined,/unknown package field token/);
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

  // --no-config ignores company.json; deleting it gives the same bytes.
  assert.deepEqual(build('--no-config'),plain);
  fs.rmSync(path.join(checkout,'company/company.json'));
  assert.deepEqual(build(),plain);
});
