import { useMemo, useState } from 'react';
import { ListChecks, Power, ShieldCheck, FileCheck } from 'lucide-react';
import { Card, EmptyState, ErrorState, Loading, Modal, Page, PageHeader, Pill, SearchInput } from '../components/common';
import { useAsync } from '../hooks/useAsync';
import { policyService } from '../services';
import { useConsole } from '../state/ConsoleContext';
import type { Policy } from '../types';

export default function Policies() {
  const { toast } = useConsole();
  const { data, loading, error, reload, setData } = useAsync(() => policyService.list());
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All Categories');
  const [confirm, setConfirm] = useState<Policy | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const cats = useMemo(() => ['All Categories', ...Array.from(new Set((data ?? []).map((p) => p.category)))], [data]);
  const rows = (data ?? []).filter((p) => (cat === 'All Categories' || p.category === cat) && `${p.id} ${p.name} ${p.description} ${p.rules.join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  const active = (data ?? []).filter((p) => p.enabled).length;

  async function apply(p: Policy, enabled: boolean) {
    setBusy(p.id);
    try {
      const updated = await policyService.setEnabled(p.id, enabled);
      setData((prev) => (prev ?? []).map((x) => (x.id === p.id ? updated : x)));
      toast(`${p.id} ${enabled ? 'enabled' : 'disabled'}.`, enabled ? 'green' : 'amber');
    } catch (e) { toast(e instanceof Error ? e.message : 'Update failed', 'red'); }
    finally { setBusy(null); setConfirm(null); }
  }

  return (
    <Page>
      <PageHeader icon={<FileCheck color="#0a9f73" />} title="Policy Engine Management" subtitle="Deterministic zero-trust security policies enforced on prompt ingestion, tool invocation, and sink transmission."
        aside={<Pill tone={active === (data?.length ?? 0) ? 'green' : 'amber'} large>{active} / {data?.length ?? 0} Policies Active</Pill>} />
      <div className="cx-toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search policies by name, rule or ID (e.g. POL-001)…" label="Search policies" />
        <label className="cx-toolbar__label" htmlFor="pcat">Category:</label>
        <select id="pcat" className="cx-select" value={cat} onChange={(e) => setCat(e.target.value)}>{cats.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      {loading && <Loading rows={4} height={180} />}
      {error && <Card><ErrorState message={error} onRetry={reload} /></Card>}
      {data && rows.length === 0 && <Card><EmptyState title="No policies match" hint="Try a different search or category." /></Card>}
      <div className="cx-grid cx-grid--2">
        {rows.map((p) => (
          <Card key={p.id} className="pol" tone={p.enabled ? undefined : 'red'}>
            <div className="pol__head">
              <span className="cx-icon-box cx-icon-box--green"><ShieldCheck /></span>
              <div><div className="cx-row" style={{ gap: '.5rem' }}><b className="cx-id">{p.id}</b><span className="cx-muted cx-mono" style={{ fontSize: '.72rem' }}>• Priority: {p.priority}</span></div><h2>{p.name}</h2></div>
              <Pill tone={p.enabled ? 'green' : 'gray'} dot>{p.enabled ? 'ACTIVE' : 'DISABLED'}</Pill>
              {p.enabled
                ? <button type="button" className="cx-btn cx-btn--danger cx-btn--sm" disabled={busy === p.id} onClick={() => setConfirm(p)}><Power />Disable</button>
                : <button type="button" className="cx-btn cx-btn--success cx-btn--sm" disabled={busy === p.id} onClick={() => void apply(p, true)}><Power />Enable</button>}
            </div>
            <p className="pol__desc">{p.description}</p>
            <div className="pol__rules"><h3><ListChecks width={14} height={14} />ENFORCED RULES:</h3><ul>{p.rules.map((r) => <li key={r}>{r}</li>)}</ul></div>
            <div className="pol__foot"><span>Enforcements: <b>{p.enforcements} blocks</b></span><span>Last modified: {p.lastModified}</span></div>
          </Card>
        ))}
      </div>

      {confirm && (
        <Modal title={<>Disable {confirm.id}?</>} onClose={() => setConfirm(null)}
          footer={<><button type="button" className="cx-btn cx-btn--ghost" onClick={() => setConfirm(null)}>Keep enabled</button><button type="button" className="cx-btn cx-btn--danger" onClick={() => void apply(confirm, false)}>Disable policy</button></>}>
          <p className="cx-sub"><b>{confirm.name}</b></p>
          <p className="cx-sub">This records the change in the audit log and asks the backend to stop applying the rule set.</p>
          {(confirm.id === 'POL-001' || confirm.id === 'POL-005') && <div className="cx-banner cx-banner--red"><Power />Network isolation is enforced by the operating system firewall, outside this UI. Disabling this record must not be relied on to open or close network access.</div>}
        </Modal>
      )}
    </Page>
  );
}
