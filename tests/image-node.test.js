'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const C=vm.createContext({URL,TextEncoder});
for(const source of ['validator.js','workbench/source-edit.js','workbench/targets.js','workbench/commands/common.js','workbench/commands/graph.js','workbench/commands/clipboard.js','workbench/image-nodes.js'])vm.runInContext(readSource(source),C);
const plain=value=>JSON.parse(JSON.stringify(value));
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4UYAAAAASUVORK5CYII=';
const JPEG='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3E//Z';
const WEBP='data:image/webp;base64,UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA=';
const WEBP_LOSSLESS='data:image/webp;base64,UklGRhwAAABXRUJQVlA4TA8AAAAvAYAAEAfQ/4gCBiKi/wEA';
const WEBP_EXTENDED='data:image/webp;base64,UklGRmAAAABXRUJQVlA4WAoAAAAQAAAAAQAAAgAAQUxQSAcAAAAAgICAgICAAFZQOCAyAAAA0AEAnQEqAgADAAFAJiWgAnS6AfgAA7AA/ukiH/vPn7nz9z5/0Z//lP3yOP5HH/ygQAA=';
const truncate=(url,count)=>{const [head,data]=url.split(',');return head+','+Buffer.from(Buffer.from(data,'base64').subarray(0,count)).toString('base64');};
const makeWebp=chunks=>{
  const encoded=chunks.map(({type,payload})=>{const chunk=Buffer.alloc(8+payload.length+(payload.length%2));chunk.write(type,0,'ascii');chunk.writeUInt32LE(payload.length,4);payload.copy(chunk,8);return chunk;});
  const file=Buffer.alloc(12+encoded.reduce((sum,chunk)=>sum+chunk.length,0));file.write('RIFF',0,'ascii');file.writeUInt32LE(file.length-8,4);file.write('WEBP',8,'ascii');
  let at=12;for(const chunk of encoded){chunk.copy(file,at);at+=chunk.length;}
  return 'data:image/webp;base64,'+file.toString('base64');
};
const fakeWebp=(type,payload)=>makeWebp([{type,payload}]);
const webpChunks=url=>{const file=Buffer.from(url.split(',')[1],'base64'),chunks=[];for(let at=12;at+8<=file.length;){const type=file.toString('ascii',at,at+4),size=file.readUInt32LE(at+4);chunks.push({type,payload:Buffer.from(file.subarray(at+8,at+8+size))});at+=8+size+(size%2);}return chunks;};
const diagram=raw=>(raw.page||raw).sections[0].diagram;
const fixture=()=>({page:{title:'Images',sections:[{heading:'Canvas',diagram:{nodes:{a:{title:'A'},b:{title:'B'}},rows:[['a','b']],edges:[]}}]}});

test('strict raster identity accepts real bounded PNG and rejects active, remote, mismatched and impostor data',()=>{
  assert.equal(C.embeddedImageKind(PNG),'png');
  assert.equal(C.embeddedImageKind(JPEG),'jpeg');
  assert.equal(C.embeddedImageKind(WEBP),'webp');
  assert.equal(C.embeddedImageKind(WEBP_LOSSLESS),'webp');
  assert.equal(C.embeddedImageKind(WEBP_EXTENDED),'webp');
  for(const value of [
    PNG.replace('image/png','image/jpeg'),
    'data:image/png;base64,'+Buffer.from('not an image').toString('base64'),
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'https://example.test/image.png'
  ])assert.equal(C.embeddedImageKind(value),null,value);
});

test('WebP proof rejects fake subtype chunks and metadata-only extended containers',()=>{
  const zeroVp8=fakeWebp('VP8 ',Buffer.alloc(11));
  const zeroVp8l=fakeWebp('VP8L',Buffer.alloc(6));
  const vp8xOnly=fakeWebp('VP8X',Buffer.alloc(10));
  const badVp8=Buffer.alloc(11);badVp8[0]=16;badVp8.set([157,1,42],3);
  const badVp8l=Buffer.from([47,0,0,0,224,0]);
  const animation=Buffer.from(WEBP_EXTENDED.split(',')[1],'base64');animation[20]|=2;
  const reserved=Buffer.from(WEBP_EXTENDED.split(',')[1],'base64');reserved[21]=1;
  for(const value of [zeroVp8,zeroVp8l,vp8xOnly,fakeWebp('VP8 ',badVp8),fakeWebp('VP8L',badVp8l),
    'data:image/webp;base64,'+animation.toString('base64'),'data:image/webp;base64,'+reserved.toString('base64')])
    assert.equal(C.embeddedImageKind(value),null,value);
});

test('WebP proof requires coded payload and legal ALPH ordering',()=>{
  const shortVp8=Buffer.from([48,0,0,157,1,42,1,0,1,0,0]);
  const shortVp8l=Buffer.from([47,0,0,0,0,0]);
  const chunks=webpChunks(WEBP_EXTENDED),vp8x=chunks.find(chunk=>chunk.type==='VP8X');
  const alph=chunks.find(chunk=>chunk.type==='ALPH'),vp8=chunks.find(chunk=>chunk.type==='VP8 ');
  const noAlpha={type:'VP8X',payload:Buffer.from(vp8x.payload)};noAlpha.payload[0]&=~16;
  const reservedAlpha={type:'ALPH',payload:Buffer.from(alph.payload)};reservedAlpha.payload[0]=64;
  const badPreprocess={type:'ALPH',payload:Buffer.from(alph.payload)};badPreprocess.payload[0]=32;
  const badCompression={type:'ALPH',payload:Buffer.from(alph.payload)};badCompression.payload[0]=2;
  const shortCompressed={type:'ALPH',payload:Buffer.from([1,0])};
  const vp8l=webpChunks(WEBP_LOSSLESS).find(chunk=>chunk.type==='VP8L');
  for(const value of [
    fakeWebp('VP8 ',shortVp8),fakeWebp('VP8L',shortVp8l),
    makeWebp([vp8x,alph,alph,vp8]),makeWebp([vp8x,vp8,alph]),makeWebp([noAlpha,alph,vp8]),
    makeWebp([vp8x,alph,vp8l]),makeWebp([vp8x,reservedAlpha,vp8]),makeWebp([vp8x,badPreprocess,vp8]),
    makeWebp([vp8x,badCompression,vp8]),makeWebp([vp8x,shortCompressed,vp8])
  ])assert.equal(C.embeddedImageKind(value),null,value);
});

test('strict raster identity rejects header-only and truncated raster structures',()=>{
  for(const value of [
    truncate(PNG,8),truncate(PNG,33),truncate(PNG,Buffer.from(PNG.split(',')[1],'base64').length-1),
    truncate(JPEG,2),truncate(JPEG,100),truncate(JPEG,Buffer.from(JPEG.split(',')[1],'base64').length-1),
    truncate(WEBP,12),truncate(WEBP,30),truncate(WEBP,Buffer.from(WEBP.split(',')[1],'base64').length-1)
  ])assert.equal(C.embeddedImageKind(value),null,value);
});

test('drop planner humanizes the filename, creates a safe unique id, and inserts at the nearest row slot',()=>{
  const raw=fixture(),before=JSON.stringify(raw),plan=C.planAddImageNode(before,raw,0,{name:'doorbell_ui.PNG',data:PNG},{row:0,slot:1});
  assert.ok(!plan.error,plan.error);const out=JSON.parse(plan.text),d=diagram(out),id=plan.id;
  assert.equal(id,'doorbell-ui1');assert.deepEqual(d.rows,[['a',id,'b']]);
  assert.deepEqual(d.nodes[id],{title:'Doorbell ui',alt:'Doorbell ui',image:PNG});
  assert.deepEqual(plain(C.validate(C.normalize(out)).errors),[]);assert.equal(JSON.stringify(raw),before);
});

test('paste placement, duplicate and object clipboard round-trip keep a normal selectable node',()=>{
  const raw=fixture(),added=C.planAddImageNode(JSON.stringify(raw),raw,0,{name:'Pasted image',data:PNG});
  assert.ok(!added.error,added.error);let out=JSON.parse(added.text),id=added.id,d=diagram(out);
  assert.deepEqual(d.rows,[['a','b',id]]);assert.equal(d.floats,undefined);
  const duplicate=C.planDuplicateNode(added.text,out,0,id);assert.ok(!duplicate.error,duplicate.error);
  out=JSON.parse(duplicate.text);assert.equal(diagram(out).nodes[duplicate.id].image,PNG);
  const copied=C.builderClipboardCopy(out,[{kind:'node',section:0,id}]);assert.ok(!copied.error,copied.error);
  const pasted=C.planPasteBuilderClipboard(duplicate.text,out,copied.data,{section:0});assert.ok(!pasted.error,pasted.error);
  const final=JSON.parse(pasted.text),copy=diagram(final).nodes[pasted.target.id];
  assert.equal(copy.image,PNG);assert.equal(copy.alt,'Pasted image');assert.deepEqual(plain(C.validate(C.normalize(final)).errors),[]);
});

test('transfer ownership requires exactly one supported image and no text representation',()=>{
  const image={name:'shot.png',type:'image/png'},json={name:'data.json',type:'application/json'};
  const fileItem=file=>({kind:'file',type:file.type,getAsFile:()=>file});
  const stringItem=type=>({kind:'string',type});
  const transfer=(files,items,types)=>({files,items,types});
  assert.equal(C.builderImageTransfer(transfer([image],[fileItem(image),stringItem('')],['Files',''])).file,image);
  for(const payload of [
    transfer([image],[fileItem(image),stringItem('text/plain')],['Files','text/plain']),
    transfer([image],[fileItem(image),stringItem('text/html')],['Files','text/html']),
    transfer([image],[fileItem(image),stringItem('text/uri-list')],['Files','text/uri-list']),
    transfer([image,json],[fileItem(image),fileItem(json)],['Files']),
    transfer([image,image],[fileItem(image),fileItem(image)],['Files'])
  ])assert.equal(C.builderImageTransfer(payload),null);
});

test('invalid image declarations and stale placement plans fail without a partial edit',()=>{
  const raw=fixture(),text=JSON.stringify(raw),impostor='data:image/png;base64,'+Buffer.from('plain bytes').toString('base64');
  assert.match(C.planAddImageNode(text,raw,0,{name:'fake.png',data:impostor}).error,/readable PNG/);
  assert.match(C.planAddImageNode(text,raw,0,{name:'ok.png',data:PNG},{row:9,slot:0}).error,/drop position/);
  assert.equal(JSON.stringify(raw),text);
  diagram(raw).nodes.bad={title:'Bad',image:impostor,alt:'fake'};diagram(raw).rows[0].push('bad');
  assert.match(C.validate(C.normalize(raw)).errors.join('\n'),/mislabeled files/);
  diagram(raw).nodes.bad.image=PNG;delete diagram(raw).nodes.bad.alt;
  assert.match(C.validate(C.normalize(raw)).errors.join('\n'),/describe the image/);
});
