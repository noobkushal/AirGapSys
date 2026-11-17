import type { CSSProperties, ReactNode } from 'react';

export function Page({ children }: { children: ReactNode }) {
  return <div className="cx-page"><div className="cx-page__inner">{children}</div></div>;
}

/** Two-column layout that collapses to one column on small screens (see .cx-split in ds.css). */
export function splitStyle(cols: string, align?: 'start' | 'stretch'): CSSProperties {
  return { '--cols': cols, ...(align ? { alignItems: align } : {}) } as CSSProperties;
}
