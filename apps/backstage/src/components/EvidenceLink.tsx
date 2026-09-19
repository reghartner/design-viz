import type { ReactNode } from 'react';

export function EvidenceLink({
  url,
  children,
}: {
  url: string;
  children: ReactNode;
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
    <a href={safe} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ) : (
    <span>{children}</span>
  );
}
