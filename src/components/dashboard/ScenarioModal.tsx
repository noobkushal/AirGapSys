import { useEffect, useState } from 'react';
import { Check, Circle, ShieldX, Loader2 } from 'lucide-react';
import { Modal } from '../common';

export interface ScenarioStep { title: string; detail: string; blocked?: boolean }

interface Props { title: string; steps: ScenarioStep[]; onClose: () => void; onDone?: () => void }

/** Animated, clearly-labelled simulation. No network traffic and no real scan is performed. */
export function ScenarioModal({ title, steps, onClose, onDone }: Props) {
  const [n, setN] = useState(0);
  const done = n >= steps.length;
  useEffect(() => {
    if (done) { onDone?.(); return; }
    const t = window.setTimeout(() => setN((x) => x + 1), 750);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, done]);
  return (
    <Modal title={title} onClose={onClose} width={620} footer={<button type="button" className="cx-btn cx-btn--primary" onClick={onClose}>{done ? 'Close' : 'Stop'}</button>}>
      <p className="cx-sub">Simulation only. No request leaves this browser and no real security scan runs.</p>
      <ol className="scn">
        {steps.map((s, i) => {
          const state = i < n ? 'done' : i === n ? 'run' : 'wait';
          return (
            <li key={s.title} className={`scn__row scn--${state} ${s.blocked && state === 'done' ? 'scn--blocked' : ''}`}>
              <span className="scn__ico">{state === 'done' ? (s.blocked ? <ShieldX /> : <Check />) : state === 'run' ? <Loader2 className="cx-spin" /> : <Circle />}</span>
              <div><b>{s.title}</b><p>{s.detail}</p></div>
            </li>
          );
        })}
      </ol>
      {done && <div className="cx-banner cx-banner--red" role="status"><ShieldX />Outcome: the outbound transfer was blocked and an audit entry was recorded (simulated).</div>}
    </Modal>
  );
}
