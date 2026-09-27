// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {mountNativeViewer,type NativeViewer,type NativeViewerOptions} from '../src/generated/nativeViewer';
const mounted:NativeViewer[]=[];
beforeEach(()=>{
  vi.stubGlobal('FontFace',class {load(){return Promise.resolve(this);}});
  vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});
  vi.stubGlobal('matchMedia',()=>({matches:true}));
  Object.defineProperty(document,'fonts',{configurable:true,value:new Set()});
  Object.defineProperty(Element.prototype,'getAnimations',{configurable:true,value:()=>[]});
  Object.defineProperty(Element.prototype,'scrollIntoView',{configurable:true,value:vi.fn()});
  Object.defineProperty(SVGElement.prototype,'getTotalLength',{configurable:true,value:()=>100});
  Object.defineProperty(SVGElement.prototype,'getPointAtLength',{configurable:true,value:(x:number)=>({x,y:0})});
});
afterEach(()=>{
  mounted.splice(0).forEach(viewer=>viewer.destroy());
  document.body.replaceChildren();vi.unstubAllGlobals();
});
function spec(){return {page:{title:'</script><img src="https://untrusted.test/">',sections:[{heading:'Recording',diagram:{
  nodes:{cloud:{title:'Cloud',icon:'cloud',binding:{entityRef:'component:home/cloud',catalogUrl:'https://catalog.test/cloud'}}},rows:[['cloud']],
  steps:[{id:'2',text:'First source beat',nodes:['cloud']},{id:'persist',text:'Visible save',nodes:['cloud']},{id:'failure',text:'Hidden failure',nodes:['cloud']}],
  paths:[{id:'happy',steps:['2','persist']},{id:'failed',steps:['failure']}],
  layouts:[{id:'business',name:'Business',steps:['persist'],sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}}],defaultLayout:'business',
}}]}};}
function boot(raw:unknown=spec(),options:NativeViewerOptions={}){
  const host=document.createElement('div');document.body.append(host);
  const viewer=mountNativeViewer(host,raw,{scrollIntoView:false,...options});mounted.push(viewer);return viewer;
}
it('ships trusted static code and embedded assets, with no frame, runtime code compilation or renderer transport',()=>{
  const generated=readFileSync('src/generated/nativeViewer.js','utf8');
  expect(generated).toContain('data:font/woff2;base64,');
  expect(generated).not.toMatch(/\beval\s*\(|\bnew Function\s*\(|\bfetch\s*\(|XMLHttpRequest|createElement\(["']iframe/);
  const viewer=boot();expect(document.querySelector('iframe')).toBeNull();
  expect(viewer.root.textContent).toContain(spec().page.title);
  expect(viewer.root.querySelector('img[src^="https:"]')).toBeNull();
  expect(document.getElementById('i-cloud')).toBeNull();expect(viewer.root.getElementById('i-cloud')).toBeTruthy();
});
it('uses real core identity and view state for hidden alternate and numeric source-step navigation',()=>{
  const raw=spec(),before=JSON.stringify(raw),viewer=boot(raw);
  viewer.navigate({section:'recording',path:'failed',step:'failure'});
  expect(viewer.root.querySelector('.stepid')?.textContent).toBe('failure');
  expect(viewer.root.querySelector('.stepline')?.textContent).toContain('Hidden failure');
  viewer.navigate({section:'recording',path:'happy',step:'2'});
  expect(viewer.root.querySelector('.stepline')?.textContent).toContain('First source beat');
  expect(()=>viewer.navigate({section:'recording',path:'failed'})).toThrow('no visible steps');
  expect(()=>viewer.navigate({section:'recording',path:'happy',step:'deleted'})).toThrow('no longer');
  viewer.navigate({section:'recording',path:'happy',step:'persist'});
  expect(viewer.root.querySelector('.stepline')?.textContent).toContain('Visible save');
  expect(JSON.stringify(raw)).toBe(before);
});
it('accepts and reports the canonical flow view for a diagram without named views',()=>{
  const base=spec(),section=base.page.sections[0],{layouts,defaultLayout,...diagram}=section.diagram;
  const onChange=vi.fn(),viewer=boot({page:{...base.page,sections:[{...section,diagram}]}},{onChange});
  viewer.navigate({section:'recording',view:'flow',path:'failed',step:'failure'});
  expect(onChange).toHaveBeenLastCalledWith({section:'recording',view:'flow',path:'failed',step:'failure'});
  expect(()=>viewer.navigate({section:'recording',view:'removed'})).toThrow('view is no longer');
  viewer.navigate({section:'recording',view:'flow',path:'happy',step:'2'});
  expect(viewer.root.querySelector('.stepline')?.textContent).toContain('First source beat');
});
it('targets named views before paths, reports view changes, and leaves stale-view failures recoverable',()=>{
  const raw=spec(),diagram=raw.page.sections[0].diagram;
  diagram.layouts.push({id:'operations',name:'Operations',steps:['2','persist','failure'],sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}});
  const onChange=vi.fn(),viewer=boot(raw,{onChange});
  const beforeUrl=window.location.href;
  viewer.navigate({section:'recording',view:'operations',path:'failed'});
  expect(viewer.root.querySelector('[data-view-id]')?.getAttribute('data-view-id')).toBe('operations');
  expect(viewer.root.querySelector('.stepid')?.textContent).toBe('failure');
  expect(onChange).toHaveBeenLastCalledWith({section:'recording',view:'operations',path:'failed',step:'failure'});
  viewer.navigate({section:'recording',view:'business',path:'failed',step:'failure'});
  expect(viewer.root.querySelector('[data-view-id]')?.getAttribute('data-view-id')).toBe('business');
  expect(viewer.root.querySelector('.stepid')?.textContent).toBe('failure');
  expect(()=>viewer.navigate({section:'recording',view:'deleted'})).toThrow('view is no longer');
  viewer.navigate({section:'recording',path:'happy',step:'2'});
  expect(onChange).toHaveBeenLastCalledWith({section:'recording',view:'business',path:'happy',step:'2'});
  expect(viewer.root.querySelector('.stepline')?.textContent).toContain('First source beat');
  onChange.mockClear();
  (viewer.root.querySelector('button[data-layout-id="operations"]') as HTMLButtonElement).click();
  expect(onChange.mock.lastCall?.[0].view).toBe('operations');
  expect(onChange.mock.calls.every(([address])=>address.view==='operations')).toBe(true);
  expect(window.location.href).toBe(beforeUrl);
});
it('retains view IDs in drill-down frames and restores them before hidden source steps',()=>{
  const base=spec().page.sections[0];
  base.diagram.layouts.push({id:'operations',name:'Operations',steps:['2','persist','failure'],sectionLayout:{default:[{x:0,y:0,w:12,h:12}]}});
  const raw={page:{title:'Detail views',sections:[
    {...base,id:'recording',diagram:{...base.diagram,nodes:{cloud:{...base.diagram.nodes.cloud,detail:{section:'inside'}}}}},
    {...base,id:'inside',heading:'Inside',detailOnly:true},
  ]}};
  const onChange=vi.fn(),viewer=boot(raw,{onChange});
  const restore=(state:{view?:string;layout?:string;focus?:string})=>viewer.navigate({section:'recording',view:'operations',
    drilldown:{section:'recording',rootState:{view:'operations',path:'happy',step:'persist'},
      frames:[{node:'cloud',expanded:[],state:{...state,path:'failed',step:'failure'}}]}});
  restore({view:'business',layout:'operations',focus:'layout'});
  expect(viewer.root.querySelector('[data-dv-detail-preview]')?.getAttribute('data-view-id')).toBe('business');
  expect(viewer.root.querySelector('[data-dv-detail-preview] .stepid')?.textContent).toBe('failure');
  const address=onChange.mock.lastCall?.[0];
  expect(address.view).toBe('operations');
  expect(address.drilldown.rootState.view).toBe('operations');
  expect(address.drilldown.frames[0].state.view).toBe('business');
  restore({layout:'operations',focus:'layout'});
  expect(viewer.root.querySelector('[data-dv-detail-preview]')?.getAttribute('data-view-id')).toBe('operations');
  restore({view:'removed'});
  expect(viewer.root.querySelector('.detail-notice')?.textContent).toContain('detail view is unavailable');
  viewer.navigate({section:'recording',view:'business',path:'happy',step:'persist'});
  expect(viewer.root.querySelector('.stepid')?.textContent).toBe('persist');
});
it('keeps sibling mounts independent and supports destroy/remount on the same host',()=>{
  const a=boot(),b=boot();a.navigate({section:'recording',path:'failed',step:'failure'});
  expect(b.root.querySelector('.stepid')?.textContent).not.toBe('failure');
  const host=a.root.host as HTMLElement;a.destroy();a.destroy();expect(a.root.childNodes).toHaveLength(0);
  expect(()=>a.navigate({section:'recording'})).toThrow('destroyed');
  const remount=mountNativeViewer(host,spec());mounted.push(remount);
  remount.navigate({section:'recording',path:'happy',step:'persist'});
  expect(remount.root.querySelector('.stepid')?.textContent).toBe('persist');
  expect(b.root.querySelector('.stepid')?.textContent).not.toBe('failure');
});
it('protects dynamic SVG and HTML links and refuses unsafe image declarations before mounting',()=>{
  const viewer=boot(),view=viewer.root.querySelector('.docview')!;
  for(const svg of [false,true]){
    const link=svg?document.createElementNS('http://www.w3.org/2000/svg','a'):document.createElement('a');
    link.setAttribute('href','javascript:alert(1)');view.append(link);
    expect(link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,composed:true}))).toBe(false);
    link.setAttribute('href','https://catalog.test/service');
    // Cancel at the target after the native capture guard, avoiding jsdom navigation.
    link.addEventListener('click',event=>event.preventDefault());
    link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,composed:true}));
    expect(link.getAttribute('target')).toBe('_blank');expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  }
  for(const src of ['https://untrusted.test/image.png','data:image/svg+xml;base64,PHN2Zy8+']){
    const raw=spec();Object.assign(raw.page.sections[0].diagram,{panels:[{id:'image',type:'image',src}]});
    const host=document.createElement('div');document.body.append(host);
    expect(()=>mountNativeViewer(host,raw)).toThrow('embedded PNG');expect(host.shadowRoot?.childNodes).toHaveLength(0);
  }
});
it('cleans up a malformed spec and leaves its host reusable',()=>{
  const host=document.createElement('div');document.body.append(host);
  expect(()=>mountNativeViewer(host,{page:{sections:[{heading:'Broken',diagram:{nodes:null,rows:[null]}}]}})).toThrow();
  expect(host.shadowRoot?.childNodes).toHaveLength(0);expect((document.fonts as unknown as Set<unknown>).size).toBe(0);
  const viewer=mountNativeViewer(host,spec());mounted.push(viewer);expect(viewer.root.querySelector('.docview')).toBeTruthy();
});
it('handles rejected fonts after failed validation and ignores warnings from a retired mount',async()=>{
  let rejectFont:(reason:Error)=>void=()=>{};
  const ready=new Promise((_resolve,reject)=>{rejectFont=reject;});
  vi.stubGlobal('FontFace',class {load(){return ready;}});
  const invalid=document.createElement('div');document.body.append(invalid);
  expect(()=>mountNativeViewer(invalid,{page:{sections:[{diagram:{nodes:null,rows:[null]}}]}})).toThrow();
  const host=document.createElement('div');document.body.append(host);
  const onWarning=vi.fn(),viewer=mountNativeViewer(host,spec(),{onWarning});
  viewer.destroy();rejectFont(new Error('Font decoding failed'));
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(onWarning).not.toHaveBeenCalled();expect(host.shadowRoot?.childNodes).toHaveLength(0);
  expect((document.fonts as unknown as Set<unknown>).size).toBe(0);
});
it('leaves an occupied host untouched and clears construction failures before a root is populated',()=>{
  const occupied=document.createElement('div');occupied.innerHTML='<p>Host content</p>';document.body.append(occupied);
  expect(()=>mountNativeViewer(occupied,spec())).toThrow('empty dedicated host');
  expect(occupied.innerHTML).toBe('<p>Host content</p>');expect(occupied.shadowRoot).toBeNull();
  vi.stubGlobal('FontFace',class {constructor(){throw new Error('Fonts unavailable');}});
  const host=document.createElement('div');document.body.append(host);
  expect(()=>mountNativeViewer(host,spec())).toThrow('Fonts unavailable');
  expect(host.shadowRoot?.childNodes).toHaveLength(0);
});
