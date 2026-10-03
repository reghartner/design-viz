import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Move one live subtree into the host's modal surface, without remounting it. */
export function CanvasFrame({ expanded, onClose, children, title }: {
  expanded: boolean; onClose: () => void; children: ReactNode; title: string;
}) {
  const inline = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const [surface] = useState(() => document.createElement('div'));
  useLayoutEffect(() => {
    const modal = dialog.current!, slot = inline.current!;
    if (expanded) {
      modal.appendChild(surface);
      modal.showModal();
    } else {
      if (modal.open) modal.close();
      slot.appendChild(surface);
    }
    return () => { if (modal.open) modal.close(); surface.remove(); };
  }, [expanded, surface]);
  return <>
    <div ref={inline}/>
    <dialog ref={dialog} aria-label={'Canvas: ' + title}
      onCancel={event => { event.preventDefault(); onClose(); }}
      style={{ position: 'fixed', inset: 0, margin: 0, padding: 0, border: 0,
        width: '100vw', height: '100dvh', maxWidth: 'none', maxHeight: 'none',
        overflow: 'hidden', background: '#fff', color: '#202b38' }}/>
    {createPortal(children, surface)}
  </>;
}
