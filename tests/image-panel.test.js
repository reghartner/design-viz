const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=vm.createContext({URL,TextEncoder});
for(const f of ['canon','validator','engine','builder.workbench','confluence'])vm.runInContext(fs.readFileSync(__dirname+'/../src/'+f+'.js','utf8'),C);
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4UYAAAAASUVORK5CYII=';
const panel=()=>({id:'capture',type:'image',src:png,alt:'A captured interface',caption:'Local demo',link:'https://example.com/docs'});
const spec=p=>({page:{blocks:[{heading:'Image',diagram:{nodes:{app:{title:'Application'}},rows:[['app']],edges:[],panels:[p],steps:[{nodes:['app']}]}}]}});
test('embedded raster source accepts bounded base64 and rejects remote, active and malformed data',()=>{
 assert.equal(C.embeddedImageSource(png),png);
 for(const value of ['https://example.com/image.png','/local.png','data:image/svg+xml;base64,PHN2Zz4=','data:text/html;base64,PHN2Zz4=',png+'" onerror="bad','data:image/png;base64,abc','data:image/png;base64,abcd===','data:image/png;base64,'])assert.equal(C.embeddedImageSource(value),null,value);
 const atLimit='data:image/jpeg;base64,'+Buffer.alloc(C.EMBEDDED_IMAGE_MAX_BYTES).toString('base64');
 assert.equal(C.embeddedImageSource(atLimit),atLimit);
 assert.equal(C.embeddedImageSource('data:image/jpeg;base64,'+Buffer.alloc(C.EMBEDDED_IMAGE_MAX_BYTES+1).toString('base64')),null);
});
test('image validation and renderer reject remote source even when called without validation',()=>{
 assert.equal(C.validate(C.normalize(spec(panel()))).errors.length,0);
 for(const src of ['https://example.com/private.png','data:image/svg+xml;base64,PHN2Zz4=']){
  const p={...panel(),src},v=C.validate(C.normalize(spec(p)));assert.match(v.errors.join(),/embedded PNG/);
  const host={querySelector:()=>null};C.renderPanelBody(host,p,{},'pastel',[],0,false);assert.doesNotMatch(host.innerHTML,/<img/);
 }
 const host={querySelector:()=>null};C.renderPanelBody(host,{...panel(),alt:'" onerror="bad',caption:'<script>bad()</script>',link:'javascript:bad()'}, {},'pastel',[],0,false);
 assert.match(host.innerHTML,/&lt;script&gt;/);assert.match(host.innerHTML,/alt="&quot; onerror=&quot;bad"/);assert.doesNotMatch(host.innerHTML,/<a/);
});
test('caption, alt and explicit evidence link remain readable; no step mutates the shared image',()=>{
 const p=panel(),host={querySelector:()=>null};C.renderPanelBody(host,p,{src:'https://bad.test',caption:'unrecognized patch'},'pastel',[],0,false);
 assert.match(host.innerHTML,/<figcaption>Local demo<\/figcaption>/);assert.match(host.innerHTML,/rel="noopener noreferrer"/);assert.doesNotMatch(host.innerHTML,/bad.test|unrecognized patch/);
 const v=C.validate(C.normalize(spec({...p,alt:''})));assert.match(v.warnings.join(),/\.alt:/);
 const empty={...C.PANEL_TEMPLATES.image,id:'empty',type:'image'};
 assert.equal(C.validate(C.normalize(spec(empty))).warnings.length,0);
});
test('embedded images round trip through Confluence export and existing byte limits remain enforced',()=>{
 const s=spec(panel()),out=C.buildConfluenceExport(JSON.stringify(s));assert.ok(!out.error,out.error);assert.deepEqual(JSON.parse(out.text),s);
 s.page.blocks[0].diagram.panels[0].src='data:image/jpeg;base64,'+Buffer.alloc(110*1024).toString('base64');
 assert.match(C.buildConfluenceExport(JSON.stringify(s)).error,/128 KiB/);
});
