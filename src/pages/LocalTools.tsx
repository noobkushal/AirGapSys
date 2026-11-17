import { useState } from 'react';
import { Calculator, CheckCircle2, Database, FileText, Info, Play, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, Page, PageHeader, Pill, Spinner } from '../components/common';
import { toolService, type ToolRun } from '../services/toolService';
import { useConsole } from '../state/ConsoleContext';
import { cx } from '../utils/format';

const ICON: Record<string, ReactNode> = { calc: <Calculator />, fs: <FileText />, db: <Database />, sysinfo: <Info /> };
const CARDS = toolService.runtimeCards();

export default function LocalTools() {
  const { toast } = useConsole();
  const [sel, setSel] = useState(CARDS[0].id);
  const [input, setInput] = useState(CARDS[0].sample);
  const [out, setOut] = useState<ToolRun | null>(null);
  const [busy, setBusy] = useState(false);
  const card = CARDS.find((c) => c.id === sel) ?? CARDS[0];

  function choose(id: string) {
    const c = CARDS.find((x) => x.id === id);
    if (!c) return;
    setSel(id); setInput(c.sample); setOut(null);
  }
  async function run() {
    if (!input.trim()) { setOut({ ok: false, ms: 0, output: 'Enter an argument first.' }); return; }
    setBusy(true);
    try { setOut(await toolService.execute(sel, input)); }
    catch (e) { setOut(null); toast(e instanceof Error ? e.message : 'Execution failed', 'red'); }
    finally { setBusy(false); }
  }

  return (
    <Page>
      <PageHeader icon={<Wrench color="#8b5cf6" />} title="Local Tools Runtime & Execution Gateway" subtitle="Whitelisted, deterministic computation executed safely on localhost. No shell expansion or remote code allowed."
        aside={<Pill tone="green" dot large>Zero-Trust Isolation Active</Pill>} />
      <div className="cx-grid cx-grid--4">
        {CARDS.map((c) => (
          <button key={c.id} type="button" aria-pressed={sel === c.id} className={cx('cx-card lt-card', sel === c.id && 'cx-card--selected')} onClick={() => choose(c.id)}>
            <div className="cx-row"><span className="cx-icon-box cx-icon-box--violet">{ICON[c.id]}</span><span className="cx-push"><Pill tone="green" dot>ALLOWED</Pill></span></div>
            <h2>{c.name.toUpperCase()}</h2><p>{c.desc}</p>
            <div className="lt-card__foot"><span>Runs: <b>{c.runs}</b></span><Pill tone={c.verb === 'EXECUTE' ? 'violet' : 'blue'}>{c.verb}</Pill></div>
          </button>
        ))}
      </div>
      <Card title="Interactive sandboxed tool execution console" icon={<Play color="#2563ff" />} aside={<span className="cx-pill cx-pill--gray">Selected: {card.name}</span>} className="lt-console">
        <label className="cx-label" htmlFor="targ">Tool Input / Command Argument:</label>
        <form className="cx-row" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); void run(); }}>
          <input id="targ" className="cx-input" style={{ fontWeight: 700, padding: '.9rem 1rem' }} value={input} onChange={(e) => setInput(e.target.value)} />
          <button type="submit" className="cx-btn cx-btn--violet" style={{ padding: '.9rem 1.6rem' }} disabled={busy}>{busy ? <Spinner label="Running" /> : <><Play />Execute</>}</button>
        </form>
        <div className={cx('lt-out', out && !out.ok && 'bad')} role="status" aria-live="polite">
          <b>SANDBOXED EXECUTION OUTPUT:</b>
          <p>{out ? `${out.output}${out.ok ? ` · ${out.ms}ms` : ''}` : 'Press Execute to run the selected tool. The calculator evaluates locally with a safe parser; other tools return sample output.'}</p>
        </div>
        <div className="cx-banner cx-banner--blue" style={{ margin: '.9rem 0 0' }}><CheckCircle2 color="#0a9f73" /><span><b>Security Notice:</b> In production, commands execute inside isolated memory boundaries without shell subprocesses, enforced by the backend.</span></div>
      </Card>
    </Page>
  );
}
