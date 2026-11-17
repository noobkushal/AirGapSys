import { useMemo, useState } from 'react';
import { Download, FileText, CheckCircle2 } from 'lucide-react';
import { Card, ClassPill, DecisionPill, EmptyState, ErrorState, Loading, Page, PageHeader, Pill, RiskPill, SearchInput, CopyButton } from '../components/common';
import { useAsync } from '../hooks/useAsync';
import { auditService } from '../services';
import { useConsole } from '../state/ConsoleContext';
import type { Risk } from '../types';
import { csvEscape, download } from '../utils/format';

const RISKS: ('All Risk Levels' | Risk)[] = ['All Risk Levels', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export default function Audit() {
  const { toast } = useConsole();
  const { data, loading, error, reload } = useAsync(() => auditService.list());
  const [q, setQ] = useState('');
  const [risk, setRisk] = useState<string>('All Risk Levels');
  const [comp, setComp] = useState('All Components');

  const comps = useMemo(() => ['All Components', ...Array.from(new Set((data ?? []).map((e) => e.component)))], [data]);
  const rows = useMemo(() => (data ?? []).filter((e) =>
    (risk === 'All Risk Levels' || e.risk === risk) && (comp === 'All Components' || e.component === comp) &&
    `${e.id} ${e.user} ${e.action} ${e.component} ${e.hash ?? ''} ${e.payload}`.toLowerCase().includes(q.toLowerCase())), [data, q, risk, comp]);

  function exportJson() { download('clarix-audit.json', JSON.stringify(rows, null, 2), 'application/json'); toast(`Exported ${rows.length} events (JSON).`, 'green'); }
  function exportCsv() {
    const head = ['timestamp', 'event_id', 'user', 'action', 'component', 'risk', 'decision', 'classification', 'sha256', 'prev_hash'];
    const lines = rows.map((e) => [e.timestamp, e.id, e.user, e.action, e.component, e.risk, e.decision, e.classification, e.hash ?? '', e.prevHash ?? ''].map(csvEscape).join(','));
    download('clarix-audit.csv', [head.join(','), ...lines].join('\n'), 'text/csv'); toast(`Exported ${rows.length} events (CSV).`, 'green');
  }

  return (
    <Page>
      <PageHeader icon={<FileText color="#0a9f73" />} title="Tamper-Evident Audit & Security Ledger" subtitle="Complete cryptographic audit trail recording every prompt, taint propagation, tool invocation, and policy block."
        aside={<Pill tone="green" large><CheckCircle2 />{data?.length ?? 0} Cryptographic Blocks Committed (demo ledger)</Pill>} />
      <div className="cx-toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search events, actions, tools, SHA-256 hashes…" label="Search audit events" />
        <select className="cx-select" aria-label="Risk level" value={risk} onChange={(e) => setRisk(e.target.value)}>{RISKS.map((r) => <option key={r}>{r}</option>)}</select>
        <select className="cx-select" aria-label="Component" value={comp} onChange={(e) => setComp(e.target.value)}>{comps.map((c) => <option key={c}>{c}</option>)}</select>
        <button type="button" className="cx-btn cx-btn--ghost" disabled={!rows.length} onClick={exportJson}><Download color="#2563ff" />JSON</button>
        <button type="button" className="cx-btn cx-btn--ghost" disabled={!rows.length} onClick={exportCsv}><Download color="#0a9f73" />CSV</button>
      </div>
      <Card>
        {loading && <Loading rows={5} height={44} />}
        {error && <ErrorState message={error} onRetry={reload} />}
        {data && rows.length === 0 && <EmptyState title="No events match your filters" />}
        {data && rows.length > 0 && (
          <div className="cx-tbl-wrap"><table className="cx-tbl">
            <thead><tr><th>Timestamp</th><th>Event ID</th><th>User</th><th>Action</th><th>Component</th><th>Risk</th><th>Decision</th><th>Class</th><th>SHA-256</th></tr></thead>
            <tbody>{rows.map((e) => (
              <tr key={e.id}><td className="cx-mono" style={{ fontSize: '.76rem', whiteSpace: 'nowrap' }}>{e.timestamp}</td><td className="cx-id">{e.id}</td><td>{e.user}</td><td style={{ fontWeight: 600 }}>{e.action}</td>
                <td><span className="cx-pill cx-pill--gray">{e.component}</span></td><td><RiskPill risk={e.risk} /></td><td><DecisionPill decision={e.decision} /></td><td><ClassPill value={e.classification} /></td>
                <td className="cx-mono" style={{ fontSize: '.72rem', whiteSpace: 'nowrap' }}>{e.hash ? <>{e.hash.slice(0, 12)}…<CopyButton text={e.hash} label={`Copy hash of ${e.id}`} /></> : <span className="cx-muted">n/a</span>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </Page>
  );
}
