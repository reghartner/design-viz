'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource,entrypointAssets}=require('../tools/source-loader.cjs');
const c={};vm.runInNewContext(readSource('validator.js'),c);
const plain=v=>JSON.parse(JSON.stringify(v));
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6E0AAAAASUVORK5CYII=';
test('brand resolves shared defaults and local marks without mutating either source',()=>{
 const shared={app:'Company',logoImage:png,accent:'#123456'},local={icon:'shield',fg:'#fff'};
 assert.deepEqual(plain(c.FlowBrand.resolve(shared,local)),{app:'Company',icon:'shield',accent:'#123456',fg:'#fff'});
 assert.equal(shared.logoImage,png);assert.deepEqual(local,{icon:'shield',fg:'#fff'});
 assert.equal(c.FlowBrand.resolve(shared,false),null);assert.equal(c.FlowBrand.resolve(null,{}),null);
 assert.equal(c.FlowBrand.resolve(shared,{app:'App'}).logoImage,png);
 assert.equal(c.FlowBrand.resolve(shared,{logoImage:'https://example.com/logo.png'}).logoImage,png);
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
test('validator accepts shared branding and reports malformed brand fields without fetching',()=>{
 const spec={nodes:{a:{}},rows:[['a']],brand:{app:'Home company',icon:'shield'},panels:[{id:'cam',type:'screen',brand:{logoImage:png}}]};
 let result=c.validate(c.normalize(spec));assert.deepEqual(plain(result.errors),[]);assert.deepEqual(plain(result.warnings),[]);
 spec.brand={logoImage:'https://test/logo'};result=c.validate(c.normalize(spec));assert.ok(result.warnings.some(v=>v.includes('.brand.logoImage')));
});
test('all public viewer assets contain exactly one symbol for every registered icon',()=>{
 const assets=entrypointAssets('native');
 for(const id of c.FlowIcons.ids)assert.equal(assets.icons.split('id="i-'+id+'"').length-1,1,id);
 assert.match(assets.styles.find(s=>s.key==='core').source,/\.fv-brand\{/);
});
