'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource,entrypointAssets}=require('../tools/source-loader.cjs');
const c={};vm.runInNewContext(readSource('validator.js'),c);
const plain=v=>JSON.parse(JSON.stringify(v));
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6E0AAAAASUVORK5CYII=';
test('global company config becomes one immutable safe brand fallback',()=>{
 assert.deepEqual(plain(c.FlowBrand.global()),{app:'YOUR COMPANY',logo:'YC',accent:'#6750A4',bg:'#6750A4',fg:'#FFFFFF'});
 assert.equal(Object.isFrozen(c.FlowBrand.global()),true);
 assert.equal(c.FlowBrand.global(),c.FlowBrand.global());
});
test('global config accepts embedded raster logos and rejects remote or SVG sources',()=>{
 const source=readSource('validator.js');
 const raster={};vm.runInNewContext(source.replace("logo: 'YC'",'logo: '+JSON.stringify(png)),raster);
 assert.equal(raster.FlowBrand.global().logoImage,png);assert.equal(raster.FlowBrand.global().logo,undefined);
 for(const unsafe of ['https://example.test/logo.png','data:image/svg+xml;base64,PHN2Zz4=']){
   const context={};vm.runInNewContext(source.replace("logo: 'YC'",'logo: '+JSON.stringify(unsafe)),context);
   assert.equal(context.FlowBrand.global().logoImage,undefined);assert.equal(context.FlowBrand.global().logo,undefined);
 }
});
test('brand resolves shared defaults and local marks without mutating either source',()=>{
 const shared={app:'Company',logoImage:png,accent:'#123456'},local={icon:'shield',fg:'#fff'};
 assert.deepEqual(plain(c.FlowBrand.resolve(shared,local)),{app:'Company',icon:'shield',accent:'#123456',fg:'#fff'});
 assert.equal(shared.logoImage,png);assert.deepEqual(local,{icon:'shield',fg:'#fff'});
 assert.equal(c.FlowBrand.resolve(shared,false),null);assert.equal(c.FlowBrand.resolve(null,{}),null);
 assert.equal(c.FlowBrand.resolve(shared,{app:'App'}).logoImage,png);
 assert.equal(c.FlowBrand.resolve(shared,{logoImage:'https://example.com/logo.png'}).logoImage,png);
});
test('effective brand precedence is global then diagram then panel with scoped opt-outs',()=>{
 const diagram={app:'Diagram',icon:'house',accent:'#123456'};
 const panel={app:'Panel',logo:'PN',fg:'#abc'};
 const before=JSON.stringify({diagram,panel});
 assert.deepEqual(plain(c.FlowBrand.effective(diagram,panel)),{
   app:'Panel',logo:'PN',accent:'#123456',bg:'#6750A4',fg:'#abc'
 });
 assert.equal(JSON.stringify({diagram,panel}),before);
 assert.equal(c.FlowBrand.effective(diagram,false),null);
 assert.equal(c.FlowBrand.effective(false,undefined),null);
 assert.deepEqual(plain(c.FlowBrand.effective(false,{app:'Local',logo:'L'})),{app:'Local',logo:'L'});
 assert.deepEqual(plain(c.FlowBrand.effective({app:'Only diagram'},undefined)),{
   app:'Only diagram',logo:'YC',accent:'#6750A4',bg:'#6750A4',fg:'#FFFFFF'
 });
});
test('branding renders embedded images and escaped names, preserves monograms, rejects URL and CSS injection',()=>{
 const html=c.FlowBrand.render({app:'A < B "team"',logoImage:png});
 assert.match(html,/alt="A &lt; B &quot;team&quot; logo"/);assert.ok(html.includes(png));
 assert.match(c.FlowBrand.render({logo:'XY',app:'Company'}),/fv-brand-monogram/);
 assert.match(c.FlowBrand.render({icon:'battery-low'}),/data-icon="battery-low"/);
 for(const logoImage of ['https://x.test/logo.png','data:image/svg+xml;base64,PHN2Zz4=','javascript:alert(1)'])assert.equal(c.FlowBrand.render({logoImage}),'');
 assert.equal(c.FlowBrand.clean({accent:'#fff;background:url(x)'}).accent,undefined);
 const warnings=[];c.FlowBrand.warnings({logoImage:'https://x.test',icon:'<script>',accent:'red'},'brand',warnings);assert.equal(warnings.length,3);
});
test('compact branding exposes an additive styling hook for every mark without changing full-size lockups',()=>{
 for(const brand of [{logoImage:png},{icon:'shield'},{logo:'CO'}]){
   const compact=c.FlowBrand.render(brand,{compact:true,className:'surface-brand'});
   assert.match(compact,/class="fv-brand fv-brand-compact surface-brand"/);
   assert.match(compact,/fv-brand-mark/);
   assert.doesNotMatch(compact,/fv-brand-name/);
 }
 assert.match(c.FlowBrand.render({logo:'ABCD'},{compact:true}),/fv-brand-monogram-4[^>]*><span class="fv-brand-monogram-text">ABCD<\/span>/);
 assert.match(c.FlowBrand.render({logo:'<&'},{compact:true}),/fv-brand-monogram-2[^>]*><span class="fv-brand-monogram-text">&lt;&amp;<\/span>/);
 const full=c.FlowBrand.render({app:'Company',logoImage:png},{className:'surface-brand'});
 assert.match(full,/class="fv-brand surface-brand"/);
 assert.doesNotMatch(full,/fv-brand-compact/);
 assert.match(full,/fv-brand-name/);
});
test('compact marks are bounded and Screen marks shrink with their canvas',()=>{
 const styles=entrypointAssets('native').styles.map(s=>s.source).join('\n');
 assert.match(styles,/\.fv-brand-compact \.fv-brand-mark\{width:clamp\(12px,1\.35em,18px\);height:clamp\(12px,1\.35em,18px\);\}/);
 assert.match(styles,/\.screen-brand \.fv-brand-mark\{width:clamp\(12px,7cqi,20px\);height:clamp\(12px,7cqi,20px\);\}/);
 assert.match(styles,/\.screenbox\{[^}]*container-type:inline-size;/);
});
test('validator accepts shared branding and reports malformed brand fields without fetching',()=>{
 const spec={nodes:{a:{}},rows:[['a']],brand:{app:'Home company',icon:'shield'},panels:[{id:'cam',type:'screen',brand:{logoImage:png}}]};
 let result=c.validate(c.normalize(spec));assert.deepEqual(plain(result.errors),[]);assert.deepEqual(plain(result.warnings),[]);
 spec.brand={logoImage:'https://test/logo'};result=c.validate(c.normalize(spec));assert.ok(result.warnings.some(v=>v.includes('.brand.logoImage')));
 const page={title:'Branded',brand:false,sections:[{diagram:{nodes:{a:{}},rows:[['a']]}}]};
 assert.deepEqual(plain(c.validate(page).warnings),[]);
 page.brand={logoImage:'https://test/header.svg'};
 assert.ok(c.validate(page).warnings.some(v=>v.includes('page.brand.logoImage')));
});
test('all public viewer assets contain exactly one symbol for every registered icon',()=>{
 const assets=entrypointAssets('native');
 for(const id of c.FlowIcons.ids)assert.equal(assets.icons.split('id="i-'+id+'"').length-1,1,id);
 assert.match(assets.styles.find(s=>s.key==='core').source,/\.fv-brand\{/);
});
