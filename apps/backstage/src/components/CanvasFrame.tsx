import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ScrollPosition = { element: Element; left: number; top: number };
function captureScroll(root: Element | ShadowRoot): ScrollPosition[] {
  const positions: ScrollPosition[] = [];
  root.querySelectorAll('*').forEach(element => {
    if (element.scrollLeft || element.scrollTop)
      positions.push({ element, left: element.scrollLeft, top: element.scrollTop });
    if (element.shadowRoot) positions.push(...captureScroll(element.shadowRoot));
  });
  return positions;
}

/** Move one live subtree into the host's modal surface, without remounting it. */
export function CanvasFrame({ expanded, onClose, children, title }: {
  expanded: boolean; onClose: () => void; children: ReactNode; title: string;
}) {
  const inline = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const [surface] = useState(() => document.createElement('div'));
  const scroll = useRef<ScrollPosition[]>([]);
  useLayoutEffect(() => {
    const modal = dialog.current!, slot = inline.current!;
    if (expanded) {
      modal.appendChild(surface);
      modal.showModal();
    } else {
      if (modal.open) modal.close();
      slot.appendChild(surface);
    }
    // A detached subtree loses its scroll offsets, including the native
    // viewer's shadow-root canvas. Restore the last live offsets before its
    // resize observers convert the camera to the destination dimensions.
    scroll.current.forEach(({ element, left, top }) => {
      element.scrollLeft = left; element.scrollTop = top;
    });
    scroll.current = [];
    return () => {
      scroll.current = captureScroll(surface);
      if (modal.open) modal.close();
      surface.remove();
    };
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
