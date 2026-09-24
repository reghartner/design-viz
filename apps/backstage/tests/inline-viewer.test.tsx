// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {InlineFlowview} from '../src/InlineFlowview';
import {createSpecLoader,type AssociatedDiagram} from '../src/api';
import {mountNativeViewer} from '../src/generated/nativeViewer';
import {FlowviewCompatibility} from '../src/generated/compatibility';
vi.mock('../src/generated/nativeViewer',()=>({mountNativeViewer:vi.fn()}));
const mount=vi.mocked(mountNativeViewer);
const diagram:AssociatedDiagram={id:'doorbell',revision:'r1',title:'Doorbell',kind:'canonical',owner:'group:default/home',viewerUrl:'https://flows.test/view',editUrl:'https://flows.test/edit',sections:[]};
const spec={page:{canon:{id:'doorbell'},title:'</script><img src="https://untrusted.test/">'}};
const owners:Array<{navigate:ReturnType<typeof vi.fn>;pause:ReturnType<typeof vi.fn>;destroy:ReturnType<typeof vi.fn>}>=[];
beforeEach(()=>{
  owners.length=0;mount.mockReset();
  mount.mockImplementation(host=>{
    const owner={root:host.shadowRoot || host.attachShadow({mode:'open'}),warnings:[],navigate:vi.fn(),pause:vi.fn(),destroy:vi.fn()};
    owners.push(owner);return owner;
  });
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
it('refreshes host diagram routing and reapplies the target without reloading the spec',async()=>{
  const load=vi.fn().mockResolvedValue(spec),target={section:'recording',step:'saved'};
  const first=vi.fn().mockReturnValue('https://designs.test/first'),next=vi.fn().mockReturnValue('https://designs.test/next');
  const view=render(<InlineFlowview diagram={diagram} loadSpec={load} target={target} resolveDiagramLink={first}/>);
  await waitFor(()=>expect(mount).toHaveBeenCalledTimes(1));
  expect(mount.mock.calls[0][2]?.resolveDiagramLink).toBe(first);
  // Mounting triggers a state update; target navigation runs in the following effect.
  await waitFor(()=>expect(owners[0].navigate).toHaveBeenCalledWith(target));
  view.rerender(<InlineFlowview diagram={diagram} loadSpec={load} target={target} resolveDiagramLink={first}/>);
  expect(mount).toHaveBeenCalledTimes(1);
  const oldWarning=mount.mock.calls[0][2]?.onWarning;
  view.rerender(<InlineFlowview diagram={diagram} loadSpec={load} target={target} resolveDiagramLink={next}/>);
  await waitFor(()=>expect(mount).toHaveBeenCalledTimes(2));
  expect(owners[0].destroy).toHaveBeenCalledTimes(1);
  expect(mount.mock.calls[1][1]).toBe(spec);
  expect(mount.mock.calls[1][2]?.resolveDiagramLink).toBe(next);
  await waitFor(()=>expect(owners[1].navigate).toHaveBeenCalledWith(target));
  act(()=>oldWarning?.('Retired router callback'));
  expect(screen.queryByRole('alert')).toBeNull();
  view.rerender(<InlineFlowview diagram={diagram} loadSpec={load} target={target}/>);
  await waitFor(()=>expect(mount).toHaveBeenCalledTimes(3));
  expect(mount.mock.calls[2][2]?.resolveDiagramLink).toBeUndefined();
  expect(owners[1].destroy).toHaveBeenCalledTimes(1);
  await waitFor(()=>expect(owners[2].navigate).toHaveBeenCalledWith(target));
  expect(load).toHaveBeenCalledTimes(1);
});
it('warns before rendering a newer spec, lists unavailable features, and passes the original inert spec',async()=>{
  const future={...spec,page:{...spec.page,contract:'1',flowview:{minVersion:'9.0.0',features:['panel.future']}}};
  const load=vi.fn().mockResolvedValue(future);
  render(<InlineFlowview diagram={diagram} loadSpec={load}/>);
  const notice=await screen.findByRole('alert',{name:'Flowview compatibility'});
  expect(notice.textContent).toContain('9.0.0');expect(notice.textContent).toContain(FlowviewCompatibility.version);
  expect(notice.textContent).toContain('panel.future');expect(notice.textContent).toContain('Backstage administrator');
  await waitFor(()=>expect(mount).toHaveBeenCalledTimes(1));
  expect(mount.mock.calls[0][1]).toBe(future);
  act(()=>mount.mock.calls[0][2]?.onWarning?.('Bundled viewer fonts could not load.'));
  expect(screen.getByRole('alert',{name:'Flowview compatibility'})).toBeTruthy();
});
it('blocks an unsupported contract and clears the warning on a different revision',async()=>{
  const load=vi.fn().mockResolvedValueOnce({page:{...spec.page,contract:'2'}}).mockResolvedValue(spec);
  const view=render(<InlineFlowview diagram={diagram} loadSpec={load}/>);
  expect((await screen.findByRole('alert',{name:'Flowview compatibility'})).textContent).toContain('upgrade required');
  expect(mount).not.toHaveBeenCalled();expect(screen.queryByTitle('Flowview: Doorbell')).toBeNull();
  view.rerender(<InlineFlowview diagram={{...diagram,revision:'r2'}} loadSpec={load}/>);
  await screen.findByTitle('Flowview: Doorbell');expect(screen.queryByRole('alert',{name:'Flowview compatibility'})).toBeNull();
});
it('recognizes bundled panels and does not warn for a compatible newer authoring version',async()=>{
  const load=vi.fn().mockResolvedValue({page:{...spec.page,contract:'1',flowview:{authoredWith:'9.0.0',minVersion:FlowviewCompatibility.version,features:['panel.homemap','panel.image']}}});
  render(<InlineFlowview diagram={diagram} loadSpec={load}/>);
  await screen.findByTitle('Flowview: Doorbell');expect(screen.queryByRole('alert',{name:'Flowview compatibility'})).toBeNull();
});
it('owns a native host, recovers from navigation errors, and destroys the mount on unmount',async()=>{
  const load=vi.fn().mockResolvedValue(spec);
  const view=render(<InlineFlowview diagram={diagram} loadSpec={load}/>);
  const host=await screen.findByRole('region',{name:'Flowview: Doorbell'});
  await waitFor(()=>expect(mount).toHaveBeenCalledTimes(1));
  expect(host.shadowRoot).toBeTruthy();expect(document.querySelector('iframe')).toBeNull();
  const owner=owners[0],target={section:'front-door',path:'cold',step:'shutdown'};
  owner.navigate.mockImplementationOnce(()=>{throw new Error('This step is no longer in the published diagram.');});
  view.rerender(<InlineFlowview diagram={diagram} loadSpec={load} target={target}/>);
  expect((await screen.findByRole('alert')).textContent).toContain('no longer');
  expect(owner.destroy).not.toHaveBeenCalled();
  view.rerender(<InlineFlowview diagram={diagram} loadSpec={load} target={{...target,step:'saved'}}/>);
  expect(owner.navigate).toHaveBeenLastCalledWith({...target,step:'saved'});expect(screen.queryByRole('alert')).toBeNull();
  view.unmount();expect(owner.destroy).toHaveBeenCalledTimes(1);
});
it('aborts revision races, retires the old mount immediately, and ignores late responses and callbacks',async()=>{
  const pending:Array<{resolve:(v:unknown)=>void;signal:AbortSignal}>=[];
  const load=vi.fn((_d:unknown,signal:AbortSignal)=>new Promise<unknown>(resolve=>pending.push({resolve,signal})));
  const view=render(<InlineFlowview diagram={diagram} loadSpec={load}/>);
  await act(async()=>pending[0].resolve(spec));expect(mount).toHaveBeenCalledTimes(1);
  const oldWarning=mount.mock.calls[0][2]?.onWarning;
  view.rerender(<InlineFlowview diagram={{...diagram,revision:'r2'}} loadSpec={load}/>);
  expect(owners[0].destroy).toHaveBeenCalledTimes(1);expect(pending[0].signal.aborted).toBe(true);
  expect(screen.queryByTitle('Flowview: Doorbell')).toBeNull();
  view.rerender(<InlineFlowview diagram={{...diagram,revision:'r3'}} loadSpec={load}/>);
  await act(async()=>pending[1].resolve({page:{title:'Stale revision'}}));
  expect(pending[1].signal.aborted).toBe(true);expect(mount).toHaveBeenCalledTimes(1);
  await act(async()=>pending[2].resolve(spec));expect(mount).toHaveBeenCalledTimes(2);
  act(()=>oldWarning?.('Retired font callback'));expect(screen.queryByRole('alert')).toBeNull();
  view.unmount();expect(pending[2].signal.aborted).toBe(true);expect(owners[1].destroy).toHaveBeenCalledTimes(1);
});
it('ignores a late read after unmount',async()=>{
  let resolve:(v:unknown)=>void=()=>{},signal:AbortSignal|undefined;
  const load=vi.fn((_d:unknown,s:AbortSignal)=>{signal=s;return new Promise<unknown>(r=>{resolve=r;});});
  const view=render(<InlineFlowview diagram={diagram} loadSpec={load}/>);view.unmount();
  expect(signal?.aborted).toBe(true);await act(async()=>resolve(spec));expect(mount).not.toHaveBeenCalled();
});
it('pairs visibility/intersection pause subscriptions with the native mount',async()=>{
  let callback:IntersectionObserverCallback=()=>{};
  const disconnect=vi.fn(),observe=vi.fn();
  vi.stubGlobal('IntersectionObserver',class {constructor(fn:IntersectionObserverCallback){callback=fn;}observe=observe;disconnect=disconnect;});
  const load=vi.fn().mockResolvedValue(spec),view=render(<InlineFlowview diagram={diagram} loadSpec={load}/>);
  const host=await screen.findByTitle('Flowview: Doorbell');
  await waitFor(()=>expect(observe).toHaveBeenCalledWith(host));
  act(()=>callback([{isIntersecting:false}] as IntersectionObserverEntry[],{} as IntersectionObserver));
  expect(owners[0].pause).toHaveBeenCalledTimes(1);
  view.unmount();expect(disconnect).toHaveBeenCalledTimes(1);
  act(()=>callback([{isIntersecting:false}] as IntersectionObserverEntry[],{} as IntersectionObserver));
  expect(owners[0].pause).toHaveBeenCalledTimes(1);
});
it('shows read errors and retries through the explicit authenticated loader',async()=>{
  const load=vi.fn().mockRejectedValueOnce(new Error('Diagram read failed (403).')).mockResolvedValue(spec);
  render(<InlineFlowview diagram={diagram} loadSpec={load}/>);expect(await screen.findByRole('alert')).toBeTruthy();
  expect(mount).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Retry diagram'}));
  await screen.findByTitle('Flowview: Doorbell');expect(load).toHaveBeenCalledTimes(2);
});
it('reports a native mount failure and retries with a fresh host',async()=>{
  mount.mockImplementationOnce(()=>{throw new Error('Invalid diagram');});
  const load=vi.fn().mockResolvedValue(spec);
  render(<InlineFlowview diagram={diagram} loadSpec={load}/>);
  expect((await screen.findByRole('alert')).textContent).toContain('Invalid diagram');
  fireEvent.click(screen.getByRole('button',{name:'Retry diagram'}));
  await screen.findByTitle('Flowview: Doorbell');
  await waitFor(()=>expect(mount).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('alert')).toBeNull();
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
