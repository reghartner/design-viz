import {expect} from '@playwright/test';

// Read card bounds in diagram coordinates, independent of viewport pan/zoom.
export async function nodeGeometry(page,id){
  return page.locator('#docview g.node[data-dv-node="'+id+'"]').evaluate(node=>
    Object.fromEntries(Array.from(node.closest('svg').querySelectorAll('g.node')).map(n=>{
      const m=n.transform.baseVal.consolidate().matrix,card=n.querySelector('.card'),w=Number(card.getAttribute('width')),h=Number(card.getAttribute('height'));
      return [n.getAttribute('data-dv-node'),{x:m.e+w/2,y:m.f+h/2,w,h}];
    })));
}

export async function expectImportPlacement(page,imp,reference,ids,before={}){
  const {position,nodePositions,...identity}=imp;
  expect(identity).toEqual(reference);
  expect(Object.keys(nodePositions).sort()).toEqual([...ids].sort());
  expect(Number.isFinite(position.x) && Number.isFinite(position.y)).toBe(true);
  const actual=await nodeGeometry(page,imp.as+'::'+ids[0]);
  for(const id of ids){
    const point=nodePositions[id],key=imp.as+'::'+id,p=actual[key];
    expect(Number.isFinite(point.x) && Number.isFinite(point.y),key).toBe(true);
    expect(p.x,key).toBeCloseTo(position.x+point.x,5);expect(p.y,key).toBeCloseTo(position.y+point.y,5);
    for(const [other,q] of Object.entries(actual))if(other!==key)
      expect(Math.abs(p.x-q.x)>=(p.w+q.w)/2+23.9 || Math.abs(p.y-q.y)>=(p.h+q.h)/2+23.9,key+' overlaps '+other).toBe(true);
  }
  for(const [id,p] of Object.entries(before))expect(actual[id],id+' retained center/bounds').toEqual(p);
}
