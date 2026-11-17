import { useMemo, useState } from 'react';
import { CheckCircle2, FileText, Info, Radio, ShieldX, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, EmptyState } from '../common';
import type { SecurityEvent } from '../../types';
import { cx } from '../../utils/format';

const KIND = {
  SUCCESS: { icon: <CheckCircle2 />, cls: 'ok', tag: 'SUCCESS' },
  INFO: { icon: <Info />, cls: 'info', tag: 'INFO' },
  BLOCKED: { icon: <ShieldX />, cls: 'bad', tag: 'BLOCKED' },
  AUDIT: { icon: <FileText />, cls: 'audit', tag: 'AUDIT' },
} as const;

const FILTERS = ['All', 'Blocked', 'Audit'] as const;

export function EventStream({ events, maxHeight = 260 }: { events: SecurityEvent[]; maxHeight?: number }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const shown = useMemo(() => events.filter((e) => filter === 'All' || e.kind === filter.toUpperCase()), [events, filter]);
  return (
    <Card title="LIVE SECURITY EVENT STREAM" icon={<Radio color="#2563ff" />}
      aside={<span className="seg" role="group" aria-label="Filter events">{FILTERS.map((f) => <button key={f} type="button" className="cx-chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}</span>}>
      <ul className="evs" style={{ maxHeight }} aria-live="off">
        {shown.length === 0 && <li><EmptyState title="No events match this filter" /></li>}
        {shown.map((e) => {
          const k = KIND[e.kind];
          return (
            <li key={e.id} className={cx('evs__row', `evs--${k.cls}`)}>
              <span className="evs__ico">{k.icon}</span>
              <div><div className="evs__top"><time>{e.time}</time><span className="evs__src">{e.source}</span></div><p>{e.message}</p></div>
              <span className="evs__tag">{k.tag}</span>
            </li>
          );
        })}
      </ul>
      <div className="evs__foot"><span className="cx-pill cx-pill--green cx-pill--dot">Continuous telemetry active (simulated)</span><Link to="/audit">Audit Log Archive <ArrowRight width={14} height={14} /></Link></div>
    </Card>
  );
}
