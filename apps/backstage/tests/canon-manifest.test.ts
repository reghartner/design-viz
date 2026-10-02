import {describe,it,expect} from 'vitest';
import {parseCanonManifest,materializeCanonSpec,materializeCanonSpecs,prepareCanonSnapshot,buildEntityDiagramIndex,diagramsForEntity} from '../src/backend';
import {readFileSync} from 'node:fs';

describe('central canon membership for GitHub adapters',()=>{
  it('materializes a full approved topology snapshot before entity indexing',()=>{
    const source=['platform','checkout'].map(id=>JSON.parse(readFileSync('../../examples/canon/topology/'+id+'.json','utf8')));
    const snapshot=materializeCanonSpecs(source);
    expect(buildEntityDiagramIndex(source)).toEqual(buildEntityDiagramIndex(snapshot));
    expect(diagramsForEntity(buildEntityDiagramIndex(snapshot),'component:default/api').diagrams).toHaveLength(2);
    expect(materializeCanonSpecs(snapshot)).toEqual(snapshot);
    const approved=prepareCanonSnapshot(source);
    expect(approved.loadSpec('checkout')).toEqual(snapshot[1]);
    expect(approved.loadWorkspace('checkout')?.source).toEqual(source[1]);
    expect(prepareCanonSnapshot(source,{authorize:(s:any)=>s.page.canon.id==='checkout'}).loadWorkspace('checkout')).toBeNull();
  });
  it('uses manifest identity and ownership before indexing service bindings',()=>{
    const entries=parseCanonManifest({version:1,diagrams:[{folder:'diagrams/payments/checkout',owner:'group:default/team'}]});
    expect(entries).toEqual([{
      id:'checkout',folder:'diagrams/payments/checkout',owner:'group:default/team',path:'diagrams/payments/checkout/checkout.spec.json',
      html:'diagrams/payments/checkout/checkout.html',
    }]);
    const source={page:{title:'Checkout',canon:{id:'old',kind:'design'},sections:[{heading:'Flow',diagram:{
      nodes:{service:{title:'Service',binding:{entityRef:'component:default/checkout'}}},rows:[['service']],edges:[],steps:[],
    }}]}};
    const specs=entries.map(entry=>materializeCanonSpec(source,entry));
    const index=buildEntityDiagramIndex(specs,{diagramUrls:({id})=>({
      viewerUrl:'https://flows.test/diagrams/'+id+'/'+id+'.html',editUrl:'https://flows.test/workbench/flowspec.html?diagram='+id,
    })});
    const found=diagramsForEntity(index,'component:default/checkout').diagrams;
    expect(found).toHaveLength(1);expect(found[0]).toMatchObject({id:'checkout',owner:'group:default/team',kind:'canonical'});
    expect(source.page.canon.kind).toBe('design');
    expect(parseCanonManifest({version:1,diagrams:[]})).toEqual([]);
    expect(parseCanonManifest({version:1,diagrams:[{folder:'diagrams/flat-diagram',owner:'group:default/team'}]})[0].id).toBe('flat-diagram');
  });
  it('rejects unsafe paths and duplicate leaf IDs across namespaces',()=>{
    for(const folder of ['../secret','/diagrams/secret','diagrams/../secret','diagrams/','diagrams//a','diagrams/a/','diagrams/a//b','diagrams/a/.','diagrams/a/..','https://evil.test/a','diagrams/a%2fb','diagrams/a%2Fb','diagrams/a\\b']){
      expect(()=>parseCanonManifest({version:1,diagrams:[{folder,owner:'group:default/team'}]})).toThrow();
    }
    expect(()=>parseCanonManifest({version:1,diagrams:[
      {folder:'diagrams/payments/checkout',owner:'group:default/team'},
      {folder:'diagrams/archive/checkout',owner:'group:default/team'},
    ]})).toThrow(/Duplicate canon ID: checkout/);
  });
});
