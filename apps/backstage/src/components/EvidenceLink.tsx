import type { ReactNode } from 'react';

export function EvidenceLink({
  url,
  children,
  prominent = false,
}: {
  url: string;
  children: ReactNode;
  prominent?: boolean;
}) {
  let safe: string | undefined;
  try {
    const parsed = new URL(url);
    if (
      ['https:', 'http:'].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password
    )
      safe = parsed.href;
  } catch {
    /* Invalid evidence is readable text, not an active link. */
  }
  return safe ? (
    <a href={safe} target="_blank" rel="noopener noreferrer" style={prominent ? {display:'inline-flex',alignItems:'center',padding:'10px 16px',borderRadius:8,background:'#6368d2',color:'#fff',textDecoration:'none',fontWeight:600} : undefined}>
      {children}
    </a>
  ) : (
    <span>{children}</span>
  );
}
