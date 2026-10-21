'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync,spawnSync}=require('node:child_process');
const {kitFiles}=require('./helpers/checkout-copy.js');
const {beaconPath,relayPath,spec,scratchFork,supplyIcons,buildFork}=require('./helpers/company-icons.cjs');
let root,loader,plain;
const run=source=>{const context={};vm.runInNewContext(source,context);return context;};
test.before(()=>{
  root=scratchFork();loader=require(path.join(root,'tools/source-loader.cjs'));
  plain=loader.readSource('icons/library.js');supplyIcons(root);buildFork(root);
});
test.after(()=>{if(root)fs.rmSync(root,{recursive:true,force:true});});

test('real fork modules add frozen metadata and distinctive artwork; absent overlay keeps the upstream library',()=>{
  const upstream=run(plain).FlowIcons,icons=run(loader.readSource('icons/library.js')).FlowIcons;
  assert.equal(upstream.has('acme-beacon'),false);
  assert.equal(upstream.render('acme-beacon'),upstream.render('gear'));
  assert.deepEqual(Array.from(icons.ids).slice(-2),['acme-beacon','acme-relay']);
  assert.equal(icons.ids.length,upstream.ids.length+2);
  for(const [id,label,tone,geometry] of [['acme-beacon','Acme beacon','teal',beaconPath],['acme-relay','Acme relay','violet',relayPath]]){
    assert.deepEqual(JSON.parse(JSON.stringify(icons.registry[id])),{id,label,category:'Acme equipment',tone,primary:tone==='teal'?'#318585':'#8063B1',accent:tone==='teal'?'#78C1B6':'#B7A0E2',legacy:false});
    assert.ok(Object.isFrozen(icons.registry[id]));assert.ok(icons.render(id).includes('d="'+geometry+'"'));
    assert.ok(icons.glyph(id,{monochrome:true}).includes('stroke="currentColor"'));
  }
  assert.ok(Object.isFrozen(icons)&&Object.isFrozen(icons.ids)&&Object.isFrozen(icons.registry));
  assert.equal(icons.defineIcon,undefined);assert.equal(icons.render('unavailable-fork-icon'),icons.render('gear'));
  for(const id of upstream.ids)assert.equal(icons.render(id),upstream.render(id),id);
});

test('every assembly path carries custom geometry, declared IDs and one symbol per icon even with identity disabled',()=>{
  const previous=process.env.FLOWVIEW_COMPANY_IDENTITY;process.env.FLOWVIEW_COMPANY_IDENTITY='off';
  try{
    const raw=loader.sourceRecords(['validator.js'],undefined,false).map(item=>item.source).join('\n');
    assert.ok(run(raw).FlowIcons.render('acme-beacon').includes(beaconPath));
    assert.ok(loader.panelAssets().iconIds.includes('acme-beacon'));
    const compatibility=loader.moduleSource('compatibility','cjs');assert.ok(compatibility.includes('acme-relay'));
    for(const name of ['standalone','workbench','native']){
      const assets=loader.entrypointAssets(name),ids=Array.from(assets.icons.matchAll(/<symbol id="([^"]+)"/g),m=>m[1]);
      assert.equal(new Set(ids).size,ids.length,name);assert.equal(ids.filter(id=>id==='i-acme-beacon').length,1,name);
      assert.ok(assets.icons.includes(beaconPath)&&assets.icons.includes(relayPath),name);
    }
  }finally{if(previous===undefined)delete process.env.FLOWVIEW_COMPANY_IDENTITY;else process.env.FLOWVIEW_COMPANY_IDENTITY=previous;}
  for(const file of ['template/flowview.html','workbench/flowspec.html','tools/canon/generated-runtime.cjs','native.js']){
    const source=fs.readFileSync(path.join(root,file),'utf8');assert.ok(source.includes(beaconPath)&&source.includes(relayPath),file);
  }
  const input=path.join(root,'custom.spec.json');fs.writeFileSync(input,JSON.stringify(spec()));
  const result=execFileSync(process.execPath,['tools/validate.js',input],{cwd:root,encoding:'utf8'});assert.match(result,/0 errors, 0 warnings/);
});

test('offline authoring contract, packet and source-free validator know the supplied icons',()=>{
  const kit=kitFiles(fs.readFileSync(path.join(root,'workbench/flowspec.html'),'utf8'));
  assert.match(kit['contract/authoring-contract.md'],/acme-beacon.*Acme beacon.*Acme equipment.*teal/);
  assert.equal(Object.keys(kit).some(file=>file.startsWith('company/icons/')),false);
  const exported=path.join(root,'portable');fs.mkdirSync(exported);
  for(const [file,source] of Object.entries(kit)){const target=path.join(exported,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source);}
  fs.writeFileSync(path.join(exported,'custom.spec.json'),JSON.stringify(spec()));
  assert.match(execFileSync(process.execPath,['tools/validate.js','custom.spec.json'],{cwd:exported,encoding:'utf8'}),/0 errors, 0 warnings/);
  for(const cwd of [root,exported]){
    const packet=execFileSync('python3',['tools/authoring-packet.py','--feature','icons','--mode','edit'],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});
    assert.match(packet,/acme-beacon.*Acme beacon/);assert.match(packet,/acme-relay.*Acme relay/);
  }
});

test('invalid definitions and built-in or fork collisions fail the real loader with the module path',()=>{
  const file=path.join(root,'company/icons/99-invalid.js');
  const valid={id:'acme-other',label:'Other',category:'Acme',tone:'blue',svg:'<path d="M1 1h2"/>'};
  const cases=[['duplicate icon id: gear',{id:'gear'}],['duplicate icon id: acme-beacon',{id:'acme-beacon'}],['icon id must',{id:'bad" id'}],['label must',{label:''}],['category must',{category:'<script>'}],['tone must',{tone:'constructor'}],['svg must',{svg:''}],['unknown icon field: legacy',{legacy:true}]];
  try{
    for(const [message,patch] of cases){
      fs.writeFileSync(file,'defineIcon('+JSON.stringify({...valid,...patch})+');');
      const result=spawnSync(process.execPath,['tools/source-loader.cjs','--sources','icons/library.js'],{cwd:root,encoding:'utf8'});
      assert.notEqual(result.status,0,message);assert.ok(result.stderr.includes('company/icons/99-invalid.js'),result.stderr);assert.ok(result.stderr.includes(message),result.stderr);
    }
  }finally{fs.rmSync(file,{force:true});}
});

test('fork geometry rejects wrappers, references and malformed fragments while retaining normal SVG styling',()=>{
  const file=path.join(root,'company/icons/99-geometry.js');
  const write=svg=>fs.writeFileSync(file,'defineIcon('+JSON.stringify({id:'acme-styled',label:'Styled',category:'Acme',tone:'blue',svg})+');');
  try{
    const svg='<g transform="translate(1 1)" opacity="0.8"><path d="M1 1h8v8Z" fill="$wash" fill-rule="evenodd" stroke="$primary" stroke-width="2" stroke-dasharray="2 1"></path><ellipse cx="12" cy="12" rx="2" ry="3" fill="$accent"/><line x1="2" y1="3" x2="4" y2="5"/><polyline points="1,2 3,4"/><polygon points="1,2 3,4 5,2"/></g>';
    write(svg);
    const icons=run(loader.readSource('icons/library.js')).FlowIcons;
    assert.match(icons.render('acme-styled'),/transform="translate\(1 1\)"/);
    assert.match(icons.render('acme-styled'),/fill-rule="evenodd"/);
    assert.match(icons.render('acme-styled'),/stroke-dasharray="2 1"/);
    assert.match(icons.render('acme-styled'),/var\(--fv-icon-wash,#E1ECFB\)/);
    for(const svg of [
      '<svg><script>bad()</script><use href="https://example.invalid/icon.svg"/></svg>',
      '</g><symbol id="i-gear"><path d="M1 1h2"/></symbol><g>',
      '<symbol id="i-gear"><path d="M1 1h2"/></symbol>',
      '<path id="i-gear" d="M1 1h2"/>',
      '<use href="#i-gear"/>',
      '<path d="M1 1h2" xlink:href="https://example.invalid/icon.svg"/>',
      '<path d="M1 1h2" fill="url(https://example.invalid/paint.svg#color)"/>',
      '<path d="M1 1h2" fill="u&#114;l(#color)"/>',
      '<path d="M1 1h2" style="fill:red"/>',
      '<path d="M1 1h2" onload="bad()"/>',
      '<path d="M1 1h2" fill="$missing"/>',
      '<path d="M1 1h2" fill="$primary-color"/>',
      '<path d="M1 1h2" stroke="$wash.foo"/>',
      '<path d="$primary"/>',
      '<g><path d="M1 1h2"/></path>',
      '<g><path d="M1 1h2"/>',
      '<path d="M1 1h2" d="M2 2h3"/>',
      '<path d=M1/>',
      '<path d="M1 1h2"/>not geometry',
      '<g></g>',
    ]){
      write(svg);
      const result=spawnSync(process.execPath,['tools/source-loader.cjs','--sources','icons/library.js'],{cwd:root,encoding:'utf8'});
      assert.notEqual(result.status,0,svg);
      assert.ok(result.stderr.includes('company/icons/99-geometry.js'),result.stderr);
      assert.ok(result.stderr.includes('acme-styled: invalid SVG geometry:'),result.stderr);
    }
  }finally{fs.rmSync(file,{force:true});}
});
