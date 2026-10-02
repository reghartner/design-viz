import {describe,it,expect} from 'vitest';
import {parseCanonManifest,materializeCanonSpec,materializeCanonSpecs,buildEntityDiagramIndex,diagramsForEntity} from '../src/backend';
import {readFileSync} from 'node:fs';

describe('central canon membership for GitHub adapters',()=>{
  it('materializes a full approved topology snapshot before entity indexing',()=>{
    const source=['platform','checkout'].map(id=>JSON.parse(readFileSync('../../examples/canon/topology/'+id+'.json','utf8')));
    const snapshot=materializeCanonSpecs(source);
    expect(()=>buildEntityDiagramIndex(source)).toThrow(/materializeCanonSpecs/);
    expect(diagramsForEntity(buildEntityDiagramIndex(snapshot),'component:default/api').diagrams).toHaveLength(2);
    expect(materializeCanonSpecs(snapshot)).toEqual(snapshot);
  });
  it('uses manifest identity and ownership before indexing service bindings',()=>{
    const entries=parseCanonManifest({version:1,diagrams:[{folder:'diagrams/checkout',owner:'group:default/team'}]});
    expect(entries).toEqual([{
      id:'checkout',folder:'diagrams/checkout',owner:'group:default/team',path:'diagrams/checkout/checkout.spec.json',
      html:'diagrams/checkout/checkout.html',
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
  });
  it('rejects a manifest path outside the diagram folders',()=>{
    expect(()=>parseCanonManifest({version:1,diagrams:[{folder:'diagrams/../secret',owner:'group:default/team'}]})).toThrow();
  });
});
