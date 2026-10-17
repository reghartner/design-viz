import {test,expect} from '../helpers/test.mjs';
import {createThumbnailCapture,thumbnailAsset} from '../../canon/thumbnails.mjs';
import {publishLibrary} from '../../canon/library.mjs';
import {mkdir,readFile,writeFile,rm,symlink,readdir,stat,chmod} from 'node:fs/promises';
import path from 'node:path';

const graph=title=>({nodes:{a:{title},b:{title:'Worker'}},rows:[['a','b']],edges:[{from:'a',to:'b'}]});
const home=()=>({id:'home',type:'homemap',title:'Household activity',outline:{w:280,h:160},rooms:[{id:'living',label:'Living room',x:0,y:0,w:280,h:160}],devices:[{id:'door',kind:'camera',label:'Front door',x:40,y:90}],subjects:[]});
async function setup(server){
  const root=path.join(server.root,'thumbnail-publish');await mkdir(path.join(root,'diagrams'),{recursive:true});
  return {root,file:path.join(root,'diagrams/story.json'),output:path.join(root,'workbench/diagrams.json')};
}
test.afterEach(async({server})=>{await rm(path.join(server.root,'thumbnail-publish'),{recursive:true,force:true});});

test('real opening-view captures preserve panel-only content, hidden graph, first-step state and inactive tabs',async({server},info)=>{
  const f=await setup(server),capture=await createThumbnailCapture(f.root);try{
    const raw={page:{title:'Authored views',sections:[
      {id:'other',heading:'Hidden chapter',diagram:graph('PRIVATE')},
      {id:'intro',heading:'Introduction',text:'Read first'},
      {id:'chosen',heading:'Actual entry',diagram:{...graph('Hidden topology'),view:'step',autoplay:true,panels:[home(),{id:'log',type:'log',title:'Hidden log',entries:[]}],steps:[{id:'start',panelVisibility:{log:false}},{id:'later',panelVisibility:{log:true}}],layouts:[{id:'panels',name:'Panels',sectionLayout:{default:[{x:0,y:0,w:12,h:8,hidden:true},{panel:'home',x:0,y:0,w:18,h:12},{panel:'log',x:18,y:0,w:6,h:12}]}},{id:'graph',name:'Graph',sectionLayout:{default:[{x:0,y:0,w:24,h:12}]}}],defaultLayout:'graph'}},
    ],views:[{id:'opening',name:'Overview',presentation:'standard',sections:['intro',{section:'chosen',layout:'panels'}]},{id:'other',name:'Other',presentation:'standard',sections:['other']}],defaultView:'opening'}};
    await writeFile(f.file,JSON.stringify(raw));const entry={id:'story',filename:f.file,spec:raw},before=JSON.stringify(raw),first=await capture.capture(entry);
    expect(JSON.stringify(raw)).toBe(before);expect(first.section).toBe('chosen');expect(first.view).toBe('opening');expect(first.observed.nodes).toEqual([]);expect(first.observed.panels.join('\n')).toContain('HOUSEHOLD ACTIVITY');expect(first.observed.panels.join('\n')).not.toContain('HIDDEN LOG');
    expect(first.png.readUInt32BE(16)).toBe(960);expect(first.png.readUInt32BE(20)).toBe(600);expect(first.png.length).toBeLessThan(750*1024);expect(first.png.length).toBeGreaterThan(5000);
    await info.attach('panels-only-authored-view',{body:first.png,contentType:'image/png'});
    raw.page.sections[0].diagram.nodes.a.title='DIFFERENT PRIVATE';raw.page.sections[2].diagram.nodes.a.title='ALSO PRIVATE';
    const hiddenChange=await capture.capture(entry);expect(hiddenChange.png.equals(first.png)).toBe(true);
    raw.page.sections[2].diagram.panels[0].devices[0].label='Garden camera';const visibleChange=await capture.capture(entry);expect(visibleChange.png.equals(first.png)).toBe(false);
    raw.page.sections[2].diagram.steps[0].panelVisibility.log=true;const initialChange=await capture.capture(entry);expect(initialChange.observed.panels.join('\n')).toContain('HIDDEN LOG');expect(initialChange.png.equals(visibleChange.png)).toBe(false);
    const tabs={page:{blocks:[{tabs:[{label:'Opening',sections:[{id:'intro',heading:'Only prose here',text:'Welcome'}]},{label:'Private',sections:[{diagram:graph('INACTIVE SECRET')}]}]}]}};
    const prose=await capture.capture({...entry,spec:tabs});expect(prose.observed.nodes).toEqual([]);expect(prose.observed.text).toContain('Only prose here');
    tabs.page.blocks[0].tabs[0].sections.push({id:'visible',heading:'Visible graph',diagram:graph('Active service')});const active=await capture.capture({...entry,spec:tabs});expect(active.section).toBe('visible');expect(active.observed.nodes.join(' ')).toContain('Active service');expect(active.observed.nodes.join(' ')).not.toContain('INACTIVE SECRET');
    await info.attach('opening-tab-graph',{body:active.png,contentType:'image/png'});
  }finally{await capture.close();}
});

test('publication commits image batches before the index, preserves sources, and fails atomically on unreadable images',async({server},info)=>{
  const f=await setup(server),raw={page:{title:'Home',canon:{version:1,id:'home',kind:'canonical',owner:'group:default/home'},sections:[{heading:'Home',diagram:{nodes:{},rows:[[]],edges:[],panels:[home()],primaryPanel:'home'}}]}};
  await writeFile(f.file,JSON.stringify(raw));const before=await readFile(f.file),options={diagramsDir:path.dirname(f.file),output:f.output,thumbnails:true};
  let library;const previousMask=process.umask(0o077);
  try{library=await publishLibrary(options);}finally{process.umask(previousMask);}
  const index=await readFile(f.output),preview=library.diagrams[0].preview,image=await readFile(path.join(path.dirname(f.output),preview.url));
  expect(preview.revision).toBe(library.diagrams[0].revision);expect(await readFile(f.file)).toEqual(before);expect(image.readUInt32BE(16)).toBe(960);await info.attach('published-home',{body:image,contentType:'image/png'});
  const imageFile=path.join(path.dirname(f.output),preview.url),batchDir=path.dirname(imageFile),imageDir=path.dirname(batchDir);
  for(const directory of [imageDir,batchDir])expect((await stat(directory)).mode&0o777).toBe(0o755);
  expect((await stat(imageFile)).mode&0o777).toBe(0o644);
  // Matching batches from an earlier private publication must become readable too.
  for(const directory of [imageDir,batchDir])await chmod(directory,0o700);
  await chmod(imageFile,0o600);
  const again=await publishLibrary(options);expect(again).toEqual(library);
  for(const directory of [imageDir,batchDir])expect((await stat(directory)).mode&0o777).toBe(0o755);
  expect((await stat(imageFile)).mode&0o777).toBe(0o644);
  // Passes structural validation but cannot decode as a real image.
  raw.page.sections[0].diagram.panels.push({id:'broken',type:'image',title:'Broken',src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',alt:'Broken test'});
  await writeFile(f.file,JSON.stringify(raw));await expect(publishLibrary(options)).rejects.toThrow(/Thumbnail capture failed/);
  expect(await readFile(f.output)).toEqual(index);expect(await readFile(path.join(path.dirname(f.output),preview.url))).toEqual(image);
  expect((await readdir(path.join(path.dirname(f.output),'library-thumbnails'))).some(n=>n.startsWith('.stage-'))).toBe(false);
  await writeFile(f.file,before);
  const pending=publishLibrary(options).then(()=>null,error=>error);
  await expect.poll(async()=>(await readdir(path.join(path.dirname(f.output),'library-thumbnails'))).some(n=>n.startsWith('.stage-'))).toBe(true);
  const edited=JSON.parse(before);edited.page.title='Changed during capture';await writeFile(f.file,JSON.stringify(edited));
  expect((await pending).message).toContain('Source changed during thumbnail publication');expect(await readFile(f.output)).toEqual(index);
  // Reusing a batch must not chmod an image symlink's destination.
  await writeFile(f.file,before);
  const outside=path.join(f.root,'outside.png');await writeFile(outside,image,{mode:0o600});
  await rm(imageFile);await symlink(outside,imageFile);
  await expect(publishLibrary(options)).rejects.toThrow();
  expect((await stat(outside)).mode&0o777).toBe(0o600);expect(await readFile(f.output)).toEqual(index);
});

test('capture asset guard refuses outbound, code, traversal and symlink escapes',async({server})=>{
  const f=await setup(server),png=Buffer.from('89504e470d0a1a0a','hex');await writeFile(path.join(f.root,'local.png'),png);
  expect((await thumbnailAsset('http://flowview-preview.invalid/local.png','image',f.root)).body).toEqual(png);
  for(const [url,type] of [['https://evil.test/image.png','image'],['http://flowview-preview.invalid/local.png','script'],['http://flowview-preview.invalid/local.png?query','image'],['file:///etc/passwd','image'],['http://flowview-preview.invalid/%2e%2e%2fsecret.png','image']])await expect(thumbnailAsset(url,type,f.root)).rejects.toThrow();
  await symlink(path.join(server.root,'workbench.html'),path.join(f.root,'escape.png'));await expect(thumbnailAsset('http://flowview-preview.invalid/escape.png','image',f.root)).rejects.toThrow(/outside approved/);
  await rm(path.dirname(f.output),{recursive:true,force:true});await mkdir(path.dirname(f.output),{recursive:true});await symlink(path.dirname(f.file),path.join(path.dirname(f.output),'library-thumbnails'));
  const raw={page:{title:'Test',canon:{version:1,id:'test',kind:'canonical',owner:'group:default/test'},sections:[{diagram:graph('Service')}]}};await writeFile(f.file,JSON.stringify(raw));
  await expect(publishLibrary({diagramsDir:path.dirname(f.file),output:f.output,thumbnails:true})).rejects.toThrow(/real directory/);
});

test('production capture renders embedded app screens and device apps, and bounds large graphs without truncating membership',async({server},info)=>{
  const f=await setup(server),capture=await createThumbnailCapture(f.root);try{
    for(const name of ['app-screens/app-screens','device-app-navigation/device-app-navigation']){
      const raw=JSON.parse(await readFile(new URL('../../../examples/'+name+'.spec.json',import.meta.url),'utf8'));await writeFile(f.file,JSON.stringify(raw));const result=await capture.capture({id:name,filename:f.file,spec:raw});
      expect(result.observed.panels.length).toBeGreaterThan(0);expect(result.png.length).toBeGreaterThan(15000);
      if(name.startsWith('app-screens')){expect(result.observed.images).toContainEqual({width:390,height:844});expect(result.observed.panels.join(' ')).toContain('Home');}
      else expect(result.observed.panels.join(' ')).toContain('Homestead');
      await info.attach(name.split('/')[0],{body:result.png,contentType:'image/png'});
    }
    const ids=Array.from({length:45},(_,i)=>'n'+i),raw={page:{sections:[{diagram:{nodes:Object.fromEntries(ids.map(id=>[id,{title:'Service '+id}])),rows:Array.from({length:5},(_,i)=>ids.slice(i*9,i*9+9)),edges:ids.slice(1).map(id=>({from:'n0',to:id}))}}]}};
    const large=await capture.capture({id:'large',filename:f.file,spec:raw});expect(large.observed.nodes).toHaveLength(45);expect(large.observed.clippedNodes).toBe(0);expect(large.png.readUInt32BE(16)).toBe(960);expect(large.png.readUInt32BE(20)).toBe(600);expect(large.png.length).toBeLessThan(750*1024);
    raw.page.sections[0].diagram.nodes=Object.fromEntries(Array.from({length:1001},(_,i)=>['n'+i,{title:'Service'}]));await expect(capture.capture({id:'too-large',filename:f.file,spec:raw})).rejects.toThrow(/bounded thumbnail workload/);
  }finally{await capture.close();}
});
