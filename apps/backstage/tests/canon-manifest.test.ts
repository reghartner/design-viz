import {describe,it,expect} from 'vitest';
import {parseCanonManifest,materializeCanonSpec,buildEntityDiagramIndex,diagramsForEntity} from '../src/backend';

describe('central canon membership for GitHub adapters',()=>{
  it('uses manifest identity and ownership before indexing service bindings',()=>{
    const entries=parseCanonManifest({version:1,diagrams:[{folder:'diagrams/checkout',owner:'group:default/team'}]});
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
