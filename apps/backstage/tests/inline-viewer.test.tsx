// @vitest-environment jsdom
import React from 'react';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {InlineFlowview} from '../src/InlineFlowview';
import {createSpecLoader,type AssociatedDiagram} from '../src/api';
import {viewerDocument,viewerScriptCsp} from '../src/generated/viewerDocument';
const diagram:AssociatedDiagram={id:'doorbell',revision:'r1',title:'Doorbell',kind:'canonical',owner:'group:default/home',viewerUrl:'https://flows.test/view',editUrl:'https://flows.test/edit',sections:[]};
const spec={page:{canon:{id:'doorbell'},title:'</script><img src="https://untrusted.test/">'}};
class Channel {
  static all:Channel[]=[];
  port1={onmessage:null as null|((e:MessageEvent)=>void),postMessage:vi.fn(),close:vi.fn()};
  port2={postMessage:vi.fn(),close:vi.fn()};
  constructor(){Channel.all.push(this);}
}
beforeEach(()=>{Channel.all=[];vi.stubGlobal('MessageChannel',Channel);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
it('passes data through the private channel and preserves sandbox isolation with no external assets',async()=>{
  const load=vi.fn().mockResolvedValue(spec);
  const view=render(<InlineFlowview diagram={diagram} loadSpec={load}/>);
  const frame=await screen.findByTitle('Flowview: Doorbell') as HTMLIFrameElement;
  expect(frame.hasAttribute('src')).toBe(false);expect(frame.sandbox?.toString() || frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
  expect(frame.srcdoc).not.toContain(spec.page.title);expect(frame.srcdoc).not.toContain('fonts.googleapis.com');
  expect(frame.srcdoc).toContain("connect-src 'none'");expect(frame.srcdoc).toContain('data:font/woff2;base64,');
  const post=vi.spyOn(frame.contentWindow!,'postMessage');fireEvent.load(frame);
  expect(post).toHaveBeenCalledWith({type:'flowview:init',spec,target:undefined},'*',[Channel.all.at(-1)!.port2]);
  const channel=Channel.all.at(-1)!;
  act(()=>channel.port1.onmessage?.({data:{type:'rendered'}} as MessageEvent));
  const target={section:'front-door',path:'cold',step:'shutdown'};
  view.rerender(<InlineFlowview diagram={diagram} loadSpec={load} target={target}/>);
  expect(channel.port1.postMessage).toHaveBeenCalledWith({type:'navigate',target});
  act(()=>channel.port1.onmessage?.({data:{type:'size',height:50000}} as MessageEvent));expect(frame.style.height).toBe('24000px');
  view.unmount();expect(channel.port1.close).toHaveBeenCalled();
});
it('aborts old reads and never renders a late response after selection changes',async()=>{
  let resolve:(v:unknown)=>void=()=>{},signal:AbortSignal|undefined;
  const load=vi.fn((_d:unknown,s:AbortSignal)=>{signal=s;return new Promise<unknown>(r=>{resolve=r;});});
  const view=render(<InlineFlowview diagram={diagram} loadSpec={load}/>);view.unmount();
  expect(signal?.aborted).toBe(true);await act(async()=>resolve(spec));expect(screen.queryByTitle('Flowview: Doorbell')).toBeNull();
});
it('shows read errors and retries without sending credentials into the frame',async()=>{
  const load=vi.fn().mockRejectedValueOnce(new Error('Diagram read failed (403).')).mockResolvedValue(spec);
  render(<InlineFlowview diagram={diagram} loadSpec={load}/>);expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByTitle('Flowview: Doorbell')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Retry diagram'}));
  await screen.findByTitle('Flowview: Doorbell');expect(load).toHaveBeenCalledTimes(2);
});
it('bundled script matches its CSP hash',async()=>{
  const script=viewerDocument.match(/<script>([\s\S]*)<\/script>/)![1];
  const hash=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(script))).toString('base64');
  expect(viewerScriptCsp).toBe("'sha256-"+hash+"'");
});
it('initializes SVG and HTML evidence links without navigating the rendering frame',()=>{
  document.body.innerHTML='<div id="viewer-error" hidden></div><div id="docview"><svg><a href="https://catalog.test/service"><text>Service</text></a></svg><a href="javascript:alert(1)">Unsafe</a></div>';
  vi.stubGlobal('ResizeObserver',class {observe(){}});
  vi.stubGlobal('requestAnimationFrame',()=>0);
  vi.stubGlobal('normalize',(v:unknown)=>v);vi.stubGlobal('validate',()=>({errors:[],warnings:[]}));
  vi.stubGlobal('SKIN_NAMES',['pastel']);vi.stubGlobal('applySkinClasses',()=>{});
  vi.stubGlobal('FlowCanon',{http:(v:string)=>v.startsWith('https://')?v:null});
  vi.stubGlobal('renderPage',()=>({sections:[],steppers:[],destroy(){}}));
  const port={postMessage:vi.fn(),onmessage:null,close:vi.fn()};
  window.eval(readFileSync('viewer/frame.js','utf8'));
  window.dispatchEvent(new MessageEvent('message',{source:window,data:{type:'flowview:init',spec:{skin:'pastel'}},ports:[port as unknown as MessagePort]}));
  expect(port.postMessage).toHaveBeenCalledWith({type:'rendered',warnings:[]});
  const link=document.querySelector('svg a')!;
  expect(link.getAttribute('target')).toBe('_blank');expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  expect(document.querySelector('#docview > a')!.hasAttribute('href')).toBe(false);
  document.body.replaceChildren();
});
it('loads a revision through Backstage FetchApi, refuses stale/wrong/oversized specs and ignores viewerUrl as an API destination',async()=>{
  const discovery={getBaseUrl:vi.fn().mockResolvedValue('https://backstage.test/api/proxy')};
  const fetchApi={fetch:vi.fn().mockResolvedValue({ok:true,text:async()=>JSON.stringify(spec)})};
  const loader=createSpecLoader(discovery,fetchApi),signal=new AbortController().signal;
  expect(await loader(diagram,signal)).toEqual(spec);
  expect(fetchApi.fetch).toHaveBeenCalledWith('https://backstage.test/api/proxy/flowview/specs/doorbell?revision=r1',{signal});
  fetchApi.fetch.mockResolvedValue({ok:false,status:409});await expect(loader(diagram,signal)).rejects.toThrow('Refresh');
  fetchApi.fetch.mockResolvedValue({ok:true,text:async()=>JSON.stringify({page:{canon:{id:'another'}}})});await expect(loader(diagram,signal)).rejects.toThrow('different');
  fetchApi.fetch.mockResolvedValue({ok:true,text:async()=>' '.repeat(2*1024*1024+1)});await expect(loader(diagram,signal)).rejects.toThrow('2 MiB');
  await expect(loader({...diagram,id:'../secret'},signal)).rejects.toThrow('Invalid');
});
