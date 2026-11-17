import type { ReactNode } from 'react';
import { cx } from '../../utils/format';

interface Props { icon: ReactNode; label: string; value: ReactNode; note?: ReactNode; tone?: 'green' | 'red' | 'amber' | 'blue' | 'violet' | 'ink'; badge?: ReactNode; onClick?: () => void; tint?: 'red' | 'green' }

export function Kpi({ icon, label, value, note, tone = 'ink', badge, onClick, tint }: Props) {
  const body = (
    <>
      <div className="cx-kpi__head">{icon}<span>{label}</span>{badge && <span className="cx-push">{badge}</span>}</div>
      <div className={cx('cx-kpi__value', `tone-${tone}`)}>{value}</div>
      {note && <div className="cx-kpi__note">{note}</div>}
    </>
  );
  if (onClick) return <button type="button" onClick={onClick} className={cx('cx-card cx-kpi cx-kpi--link', tint && `cx-card--${tint}`)}>{body}</button>;
  return <div className={cx('cx-card cx-kpi', tint && `cx-card--${tint}`)}>{body}</div>;
}
