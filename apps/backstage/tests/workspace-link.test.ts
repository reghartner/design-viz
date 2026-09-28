import {it,expect} from 'vitest';
import {workspaceLink} from '../src/viewer/workspaceLink';
import type {AssociatedDiagram} from '../src/api/types';
const diagram={id:'story',revision:'a'.repeat(64)} as AssociatedDiagram;
it('preserves the company destination and replaces stale navigation with the current view and step',()=>{
  const url=new URL(workspaceLink('https://flows.test/editor?diagram=story&ticket=keep#d=old&x=old&tour=1&custom=keep',diagram,
    {section:'customer-story',view:'service-flow',path:'retry',step:'try again'},'component:default/recording','build'));
  expect(url.search).toBe('?diagram=story&ticket=keep');
  const hash=new URLSearchParams(url.hash.slice(1));
  expect(hash.get('d')).toBe('customer-story');expect(hash.get('v')).toBe('service-flow');expect(hash.get('s')).toBe('try again');
  expect(url.hash).toContain('try%20again');expect(hash.has('x')).toBe(false);expect(hash.get('custom')).toBe('keep');
  expect(JSON.parse(hash.get('fv')!)).toEqual({version:1,id:'story',revision:diagram.revision,entity:'component:default/recording',action:'build'});
});
it('never makes unsafe or credential-bearing destinations clickable',()=>{
  for(const base of ['javascript:alert(1)','https://user:secret@flows.test','/relative'])expect(workspaceLink(base,diagram,null,undefined,'view')).toBe('');
});
