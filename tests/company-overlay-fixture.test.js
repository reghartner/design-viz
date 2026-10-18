'use strict';
/* Acceptance for the fork-owned company/ overlay. A fixture overlay adds a panel
   type with a helper module, a contract fragment, an example folder, Node and
   Python tests and a release note. In a fresh copy of this checkout, the build,
   validation, the folder-agent kit, widget_doc and both test runners pick it up
   while every upstream-owned file stays byte-identical. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync,spawnSync}=require('node:child_process');
const ROOT=path.join(__dirname,'..');
const {GENERATED,copyCheckout,inventory,kitFiles}=require('./helpers/checkout-copy.js');
const FIXTURE=path.join(__dirname,'fixtures/company-overlay');
const FULL_SUITE_CHILD='FLOWVIEW_COMPANY_OVERLAY_FULL_SUITE_CHILD';

let checkout,before,plainValidation;
test.before(()=>{
  checkout=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-company-overlay-'));
  copyCheckout(checkout);
  execFileSync('git',['init','-q'],{cwd:checkout});
  execFileSync('python3',['tools/build.py','--no-config'],{cwd:checkout,encoding:'utf8',timeout:120000,maxBuffer:20*1024*1024});
  plainValidation=spawnSync(process.execPath,['tools/validate.js',path.join(FIXTURE,'examples/ticket-board/ticket-board.spec.json')],{
    cwd:checkout,encoding:'utf8'
  });
  for(const file of GENERATED)fs.rmSync(path.join(checkout,file),{force:true});
  before=inventory(checkout);
  fs.cpSync(FIXTURE,path.join(checkout,'company'),{recursive:true});
  fs.writeFileSync(path.join(checkout,'company/company.json'),JSON.stringify({
    version:1,companyName:'Fixture Co',repository:'https://github.com/fixture/design-viz',brand:'brand.json',
    site:{baseUrl:'https://company.example/team/workbench/flowspec.html'}
  }));
  fs.writeFileSync(path.join(checkout,'company/brand.json'),JSON.stringify({
    companyName:'Fixture Flow',logo:'FF',primaryColor:'#2463EB',secondaryColor:'#FFFFFF'
  }));
  fs.writeFileSync(path.join(checkout,'workbench/site.json'),JSON.stringify({version:1,landing:{
    spec:'../company/examples/ticket-board/ticket-board.spec.json',title:'Fixture architecture',label:'Company example'
  }}));
  execFileSync('git',['add','-A'],{cwd:checkout});
  execFileSync('git',['-c','user.name=Flowview fixture','-c','user.email=fixture@invalid.example','commit','-qm','fixture checkout'],{cwd:checkout});
  execFileSync('python3',['tools/build.py'],{cwd:checkout,encoding:'utf8',timeout:120000,maxBuffer:20*1024*1024});
});
test.after(()=>{if(checkout)fs.rmSync(checkout,{recursive:true,force:true});});

test('the overlay panel and its helper are bundled into every built output and the validator',()=>{
  const viewer=fs.readFileSync(path.join(checkout,'template/flowview.html'),'utf8');
  const helper=viewer.indexOf('/* ---- company/panels/ticket-math.js ---- */');
  const upstream=viewer.indexOf('/* ---- src/panels/types/gauge.js ---- */');
  const type=viewer.indexOf('/* ---- company/panels/types/ticket-board.js ---- */');
  assert.ok(helper>0&&upstream>helper&&type>upstream,'helper, then upstream types, then company types');
  assert.ok(fs.readFileSync(path.join(checkout,'workbench/flowspec.html'),'utf8').includes("PanelRegistry.define('ticket-board'"));
  assert.ok(fs.readFileSync(path.join(checkout,'tools/canon/generated-runtime.cjs'),'utf8').includes("PanelRegistry.define('ticket-board'"));
  const spec='company/examples/ticket-board/ticket-board.spec.json';
  const overlaid=execFileSync(process.execPath,['tools/validate.js',spec],{cwd:checkout,encoding:'utf8'});
  assert.match(overlaid,/0 errors, 0 warnings/);
  // Without the overlay the type is unknown, so the overlay made the difference.
  assert.match(plainValidation.stdout+plainValidation.stderr,/unknown panel type "ticket-board"/);  // A fork venue (company/panels/venues) joins the seatmap venue library.
  const venue=viewer.indexOf('/* ---- company/panels/venues/fixture-hall.js ---- */');
  assert.ok(venue>viewer.indexOf('/* ---- src/panels/venues/ubs-arena.js ---- */')&&venue<upstream,'upstream venues, then fork venues, before the panel types');
  const venueSpec=path.join(checkout,'company/venue-check.spec.json');
  fs.writeFileSync(venueSpec,JSON.stringify({nodes:{n:{}},rows:[['n']],panels:[{id:'map',type:'seatmap',venue:'fixture-hall'}]}));
  try{assert.match(execFileSync(process.execPath,['tools/validate.js',venueSpec],{cwd:checkout,encoding:'utf8'}),/0 errors, 0 warnings/);}
  finally{fs.rmSync(venueSpec,{force:true});}
});

test('the folder-agent kit carries the company example and the contract with its fragment appended',()=>{
  const kit=kitFiles(fs.readFileSync(path.join(checkout,'workbench/flowspec.html'),'utf8'));
  for(const file of ['company/examples/ticket-board/ticket-board.spec.json','company/examples/ticket-board/README.md',
    'company/examples/ticket-board-notes/notes.txt'])
    assert.equal(kit[file],fs.readFileSync(path.join(FIXTURE,file.slice('company/'.length)),'utf8'),file);
  // A folder's .agent-kit globs replace the default *.md / *.json selection.
  assert.equal('company/examples/ticket-board-notes/README.md' in kit,false);
  assert.equal(Object.keys(kit).some(file=>file.endsWith('.agent-kit')),false);
  const contract=kit['contract/authoring-contract.md'];
  assert.ok(contract.startsWith(fs.readFileSync(path.join(ROOT,'contract/authoring-contract.md'),'utf8').trimEnd()));
  assert.match(contract,/## Company contract additions[\s\S]*<!-- company\/contract\/ticket-board\.md -->\n### panels — company additions\n\n- `ticket-board` — closed tickets/);
  // Fragment links are rewritten so they still resolve from contract/.
  assert.ok(contract.includes('](../company/examples/ticket-board/ticket-board.spec.json)'));
  assert.equal(Object.keys(kit).some(file=>file.startsWith('company/contract/')),false);
  assert.equal(Object.keys(kit).some(file=>file.startsWith('company/tests/')||file.startsWith('company/panels/')),false);
  for(const file of ['examples/contract-blocks/contract-blocks.spec.json','examples/independent-extraction/README.md'])
    assert.equal(kit[file],fs.readFileSync(path.join(ROOT,file),'utf8'),file);
});

test('the nearest .agent-kit marker selects a file, and a marker that selects nothing fails',t=>{
  const notes=path.join(checkout,'company/examples/ticket-board-notes');
  const nested=path.join(notes,'nested');
  t.after(()=>fs.rmSync(nested,{recursive:true,force:true}));
  fs.mkdirSync(nested);
  fs.writeFileSync(path.join(nested,'.agent-kit'),'*.md\n');
  fs.writeFileSync(path.join(nested,'guide.md'),'# Nested guide\n');
  fs.writeFileSync(path.join(nested,'skip.txt'),'The parent marker selects *.txt, but this folder has its own marker.\n');
  const examples=()=>spawnSync('python3',['-c','import json,sys;sys.path.insert(0,"tools");from company_overlay import kit_examples;print(json.dumps(kit_examples(".")))'],{cwd:checkout,encoding:'utf8'});
  const listed=JSON.parse(examples().stdout);
  assert.ok(listed.includes('company/examples/ticket-board-notes/nested/guide.md'));
  assert.ok(listed.includes('company/examples/ticket-board-notes/notes.txt'));
  assert.equal(listed.includes('company/examples/ticket-board-notes/nested/skip.txt'),false);
  fs.writeFileSync(path.join(nested,'.agent-kit'),'*.yaml\n');
  const empty=examples();
  assert.notEqual(empty.status,0);
  assert.match(empty.stderr,/company\/examples\/ticket-board-notes\/nested\/\.agent-kit: globs match no files/);
});

test('a company example file that is not UTF-8 text fails the build with its path',t=>{
  const binary=path.join(checkout,'company/examples/ticket-board-notes/logo.txt');
  fs.writeFileSync(binary,Buffer.from([0xff,0xfe,0x00,0x81]));
  t.after(()=>fs.rmSync(binary,{force:true}));
  const result=spawnSync('python3',['-c','import sys;sys.path.insert(0,"tools");from folder_agent_kit import folder_agent_kit;folder_agent_kit(".","")'],{cwd:checkout,encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/company\/examples\/ticket-board-notes\/logo\.txt: the folder-agent kit bundles UTF-8 text only/);
});

test('widget_doc and authoring packets document the company panel from its fragment',()=>{
  const list=execFileSync('python3',['tools/widget_doc.py','--list'],{cwd:checkout,encoding:'utf8'}).split(/\s+/);
  assert.ok(list.includes('ticket-board')&&list.includes('gauge'));
  const doc=execFileSync('python3',['tools/widget_doc.py','ticket-board'],{cwd:checkout,encoding:'utf8'});
  assert.match(doc,/^### panels — synchronized inspector widgets/);
  assert.match(doc,/- `ticket-board` — closed tickets out of a fixed total\.[\s\S]*Step patches set `done`/);
  assert.match(doc,/Patches are SPARSE/);
  const packet=execFileSync('python3',['tools/authoring-packet.py','--panel','ticket-board','--mode','edit'],{cwd:checkout,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  assert.match(packet,/<!-- Source: contract\/authoring-contract\.md # panel: ticket-board -->\n- `ticket-board`/);
});

test('company tests and example validation run in the normal Node and Python suites',()=>{
  // A nested runner reports to its parent runner unless the inherited context is cleared.
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  const node=spawnSync(process.execPath,['--test','--test-reporter=spec','tests/company-overlay.test.js','tests/panel-modules.test.js','tests/source-loader.test.js'],{cwd:checkout,env,encoding:'utf8',timeout:240000});
  assert.equal(node.status,0,node.stdout+node.stderr);
  assert.match(node.stdout,/company overlay fixture: ticket board registers through its helper and validates its example/);
  assert.match(node.stdout,/company example specs validate without errors/);
  const python=spawnSync('python3',['-m','unittest','-v','tests.test_company_overlay','tests.test_widget_doc'],{cwd:checkout,encoding:'utf8',timeout:240000});
  assert.equal(python.status,0,python.stdout+python.stderr);
  assert.match(python.stderr,/test_company_overlay_fixture_panel_doc_is_extractable/);
});

test('the complete upstream Python and Node suites pass with overlay, identity and site config',
  {skip:process.env[FULL_SUITE_CHILD]==='1'},()=>{
    const env={...process.env,[FULL_SUITE_CHILD]:'1'};
    delete env.NODE_TEST_CONTEXT;
    const python=spawnSync('python3',['-m','unittest','discover','-s','tests'],{
      cwd:checkout,env,encoding:'utf8',timeout:1200000,maxBuffer:64*1024*1024
    });
    assert.equal(python.status,0,python.stdout+python.stderr);
    execFileSync('python3',['tools/build.py'],{cwd:checkout,env,encoding:'utf8',timeout:120000,maxBuffer:20*1024*1024});
    const node=spawnSync('sh',['-c','node --test tests/*.test.js'],{
      cwd:checkout,env,encoding:'utf8',timeout:1200000,maxBuffer:64*1024*1024
    });
    assert.equal(node.status,0,node.stdout+node.stderr);
});

test('no upstream-owned file changed; only the overlay and generated outputs are new',()=>{
  const after=inventory(checkout);
  for(const [name,hash] of Object.entries(before))assert.equal(after[name],hash,name);
  const added=Object.keys(after).filter(name=>!Object.hasOwn(before,name));
  assert.deepEqual(added.filter(name=>!name.startsWith('company/')&&name!=='workbench/site.json'&&!GENERATED.has(name)),[]);
  assert.ok(added.includes('company/CHANGELOG.md'));
  assert.equal(fs.readFileSync(path.join(checkout,'CHANGELOG.md'),'utf8'),fs.readFileSync(path.join(ROOT,'CHANGELOG.md'),'utf8'));
});
