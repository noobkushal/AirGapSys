import type { ReactNode } from 'react';

interface Props { icon: ReactNode; title: string; subtitle?: string; aside?: ReactNode }

/** Uppercase monospace title + description + status chip, as in every UI reference. */
export function PageHeader({ icon, title, subtitle, aside }: Props) {
  return (
    <header className="cx-ph">
      <div>
        <h1>{icon}<span>{title}</span></h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {aside}
    </header>
  );
}
