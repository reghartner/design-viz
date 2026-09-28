import type { AssociatedDiagram } from '../api/types';
import type { NativeViewerTarget } from '../generated/nativeViewer';

/** Navigation metadata stays in the fragment; the company owns the destination.
 * Never put a spec, credentials, local paths or agent instructions into a URL. */
export function workspaceLink(base: string, diagram: AssociatedDiagram,
  target: NativeViewerTarget | null | undefined, entity: string | undefined,
  action: 'view' | 'edit' | 'build') {
  try {
    const url = new URL(base);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
    const hash = new URLSearchParams(url.hash.slice(1));
    // Replace a previous Flowview address, preserving unrelated host flags.
    for (const key of ['d','v','p','s','m','dd','b','t','c','ct','r','q','x','e']) hash.delete(key);
    if (target) {
      hash.set('d', target.section);
      if (target.view) hash.set('v', target.view);
      if (target.path) hash.set('p', target.path);
      if (target.step) { hash.set('s', target.step); hash.set('m', 'step'); }
    }
    hash.set('tour', '0');
    hash.set('fv', JSON.stringify({version:1, id:diagram.id, revision:diagram.revision, entity, action}));
    url.hash = hash.toString().replace(/\+/g, '%20');
    return url.href;
  } catch { return ''; }
}
