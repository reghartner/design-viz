// @vitest-environment jsdom
import React from 'react';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {FlowviewEntityDiagrams} from '../src/FlowviewEntityDiagrams';
import {createDiagramLoader,type EntityDiagrams} from '../src/api';

afterEach(()=>{cleanup();vi.useRealTimers();});
const loadSpec=async()=>new Promise<unknown>(()=>{});
const ref='component:default/recording';
function result(entityRef=ref,title='Doorbell recording'):EntityDiagrams{return {version:1,entityRef,revision:'revision',diagrams:[{id:'doorbell',title,kind:'canonical',owner:'group:default/home',revision:'spec-revision',viewerUrl:'https://flows.example.test/view',editUrl:'https://flows.example.test/edit',sections:[{reference:'recording',title:'Recording flow',url:'https://flows.example.test/view#d=recording',nodes:[{id:'record',title:'Recording service',relationship:'service'}],paths:[{id:'failed',label:'Dropped signal',steps:[{id:'drop',position:3,title:'No delivery',url:'https://flows.example.test/view#d=recording&p=failed&s=drop'}]}]}]}]};}

it('shows matched flows and links directly to an alternate step, with safe evidence URLs',async()=>{
  const data=result();data.diagrams[0].editUrl='javascript:alert(1)';
  render(<FlowviewEntityDiagrams loadSpec={loadSpec} entityRef={ref} loadDiagrams={async()=>data}/>);
  expect(await screen.findByText('Doorbell recording')).toBeTruthy();
  fireEvent.click(screen.getByText(/Where this service appears/));
  expect(screen.getByRole('button',{name:'3. No delivery'})).toBeTruthy();
  expect(screen.getByLabelText('Inline diagram viewer')).toBeTruthy();
  expect(screen.queryByRole('link',{name:'Edit in workbench'})).toBeNull();
  expect(screen.getByText('Associated diagrams (1)')).toBeTruthy();
});

it('empty service pages explain automatic association and do not show unrelated flows',async()=>{
  render(<FlowviewEntityDiagrams loadSpec={loadSpec} entityRef={ref} loadDiagrams={async()=>({...result(),diagrams:[]})}/>);
  expect(await screen.findByText(/No diagrams reference this entity yet/)).toBeTruthy();
  expect(screen.queryByRole('link',{name:'Open standalone viewer'})).toBeNull();
});

it('refreshes automatically and retains results with a visible stale warning on failure',async()=>{
  vi.useFakeTimers();const loader=vi.fn().mockResolvedValue(result());
  await act(async()=>{render(<FlowviewEntityDiagrams loadSpec={loadSpec} entityRef={ref} loadDiagrams={loader} refreshMs={1000}/>);});
  expect(screen.getByText('Doorbell recording')).toBeTruthy();
  loader.mockResolvedValue(result(ref,'Updated recording'));
  await act(async()=>{vi.advanceTimersByTime(1000);});
  expect(screen.getByText('Updated recording')).toBeTruthy();
  loader.mockRejectedValue(new Error('Offline'));
  await act(async()=>{fireEvent.focus(window);});
  expect(screen.getByRole('alert').textContent).toContain('last successful results');
  expect(screen.getByText('Updated recording')).toBeTruthy();
  loader.mockResolvedValue({...result(),diagrams:[]});
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Refresh diagrams'}));});
  expect(screen.getByText(/No diagrams reference this entity yet/)).toBeTruthy();
});

it('entity changes abort old lookups and cannot display a late response from the previous service',async()=>{
  let resolveOld:(value:EntityDiagrams)=>void=()=>{};let oldSignal:AbortSignal|undefined;
  const loader=vi.fn((entityRef:string,signal:AbortSignal)=>{if(entityRef===ref){oldSignal=signal;return new Promise<EntityDiagrams>(resolve=>{resolveOld=resolve;});}return Promise.resolve(result(entityRef,'Another service flow'));});
  const view=render(<FlowviewEntityDiagrams loadSpec={loadSpec} entityRef={ref} loadDiagrams={loader}/>);
  view.rerender(<FlowviewEntityDiagrams loadSpec={loadSpec} entityRef="component:other/recording" loadDiagrams={loader}/>);
  expect(await screen.findByText('Another service flow')).toBeTruthy();expect(oldSignal?.aborted).toBe(true);
  await act(async()=>{resolveOld(result());});
  expect(screen.queryByText('Doorbell recording')).toBeNull();expect(screen.getByText('Another service flow')).toBeTruthy();
});

describe('Backstage authenticated proxy client',()=>{
  it('rediscovers the backend and passes the cancellation signal through FetchApi',async()=>{
    const discovery={getBaseUrl:vi.fn().mockResolvedValue('https://backstage.example.test/api/proxy')};
    const fetchApi={fetch:vi.fn().mockResolvedValue({ok:true,json:async()=>result()})};
    const loader=createDiagramLoader(discovery,fetchApi),signal=new AbortController().signal;
    await loader(ref,signal);await loader(ref,signal);
    expect(discovery.getBaseUrl).toHaveBeenCalledTimes(2);
    expect(fetchApi.fetch).toHaveBeenCalledWith('https://backstage.example.test/api/proxy/flowview/entity-diagrams?entityRef=component%3Adefault%2Frecording',{signal});
  });
  it('fails visibly for access errors, malformed entries, and a mismatched service',async()=>{
    const discovery={getBaseUrl:async()=> 'https://backstage.example.test/api/proxy'},fetchApi={fetch:vi.fn()};
    const loader=createDiagramLoader(discovery,fetchApi),signal=new AbortController().signal;
    fetchApi.fetch.mockResolvedValue({ok:false,status:403});await expect(loader(ref,signal)).rejects.toThrow('403');
    fetchApi.fetch.mockResolvedValue({ok:true,json:async()=>result('component:other/recording')});await expect(loader(ref,signal)).rejects.toThrow('Invalid');
    fetchApi.fetch.mockResolvedValue({ok:true,json:async()=>({...result(),diagrams:[null]})});await expect(loader(ref,signal)).rejects.toThrow('Invalid');
  });
});

it('selects one full-width viewer and cancels its read when the selected diagram disappears',async()=>{
  let signal:AbortSignal|undefined;
  const load=vi.fn(async (_diagram:unknown,abort:AbortSignal)=>{signal=abort;return new Promise(()=>{});});
  const list=vi.fn().mockResolvedValue(result());
  render(<FlowviewEntityDiagrams entityRef={ref} loadDiagrams={list} loadSpec={load}/>);
  await screen.findByLabelText('Diagram');expect(load).toHaveBeenCalledTimes(1);
  list.mockResolvedValue({...result(),diagrams:[]});
  fireEvent.click(screen.getByRole('button',{name:'Refresh diagrams'}));
  await screen.findByText(/No diagrams reference/);expect(signal?.aborted).toBe(true);
  expect(screen.queryByLabelText('Inline diagram viewer')).toBeNull();
});
