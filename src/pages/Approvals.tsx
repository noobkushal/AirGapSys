import { useState } from 'react';
import { Clock, Eye, Plus } from 'lucide-react';
import { Card, ClassPill, EmptyState, ErrorState, Loading, Modal, Page, PageHeader, Pill, RiskPill, Tabs } from '../components/common';
import { useAsync } from '../hooks/useAsync';
import { approvalService } from '../services';
import { useConsole } from '../state/ConsoleContext';
import type { ApprovalRequest } from '../types';

export default function Approvals() {
  const { toast, refreshCounts, settings } = useConsole();
  const { data, loading, error, reload, setData } = useAsync(() => approvalService.list());
  const [tab, setTab] = useState('pending');
  const [detail, setDetail] = useState<ApprovalRequest | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const pending = (data ?? []).filter((a) => a.status === 'PENDING');
  const history = (data ?? []).filter((a) => a.status !== 'PENDING');
  const list = tab === 'pending' ? pending : history;

  async function resolve(a: ApprovalRequest, decision: 'APPROVED' | 'DENIED') {
    setBusy(a.id);
    try {
      const u = await approvalService.resolve(a.id, decision);
      setData((d) => (d ?? []).map((x) => (x.id === a.id ? u : x)));
      toast(`${a.id} ${decision === 'APPROVED' ? 'approved' : 'denied'}. Execution ${decision === 'APPROVED' ? 'resumed' : 'cancelled'} (simulated).`, decision === 'APPROVED' ? 'green' : 'amber');
      refreshCounts(); setDetail(null);
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not resolve request', 'red'); reload(); }
    finally { setBusy(null); }
  }
  async function simulate() {
    try { const a = await approvalService.simulate(); setData((d) => [a, ...(d ?? [])]); setTab('pending'); refreshCounts(); toast('Simulated high-risk request queued.', 'blue'); }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', 'red'); }
  }

  return (
    <Page>
      <PageHeader icon={<Eye color="#2563ff" />} title="Human-in-the-loop approval queue" subtitle="Cryptographic gate requiring authorized SOC operator approval for high-risk actions or confidential data access."
        aside={settings.demoMode ? <button type="button" className="cx-btn cx-btn--primary" onClick={() => void simulate()}><Plus />Simulate High-Risk Request</button> : undefined} />
      <Tabs active={tab} onChange={setTab} tabs={[{ id: 'pending', label: 'Pending Approvals', count: pending.length }, { id: 'history', label: 'Resolution History', count: history.length }]} />
      {loading && <Loading rows={1} height={220} />}
      {error && <Card><ErrorState message={error} onRetry={reload} /></Card>}
      {data && list.length === 0 && <Card><EmptyState title={tab === 'pending' ? 'No pending approvals' : 'Nothing resolved yet'} hint={tab === 'pending' ? 'Use “Simulate High-Risk Request” to see how a request is handled.' : 'Resolved requests appear here.'} /></Card>}
      <div className="cx-stack">
        {list.map((a) => (
          <Card key={a.id} className="ap">
            <div className="ap__head">
              <b className="tone-blue cx-mono">Approval Request #{a.id}</b><span className="cx-muted">•</span><span className="cx-muted cx-mono" style={{ fontSize: '.78rem' }}>{a.createdAt}</span>
              <span className="cx-push cx-row"><RiskPill risk={a.risk} /><ClassPill value={a.classification} /><Pill tone={a.status === 'PENDING' ? 'blue' : a.status === 'APPROVED' ? 'green' : 'red'} dot>{a.status}</Pill></span>
            </div>
            <span className="cx-label cx-label--caps">Agent wants to:</span>
            <p className="ap__action">“{a.action}”</p>
            <div className="ap__meta">
              <div><small>Requested Tool:</small><b>{a.tool}</b></div>
              <div><small>Target Resource:</small><b className="tone-green">{a.resource}</b></div>
              <div><small>Requester Core:</small><b>{a.requester}</b></div>
            </div>
            <div className="ap__foot">
              {a.status === 'PENDING'
                ? <span className="tone-blue cx-mono" style={{ fontSize: '.8rem' }}><Clock width={15} height={15} style={{ verticalAlign: '-3px' }} /> Execution suspended awaiting SOC signature</span>
                : <span className="cx-muted cx-mono" style={{ fontSize: '.78rem' }}>{a.status === 'APPROVED' ? 'Approved' : 'Denied'} by {a.resolvedBy} at {a.resolvedAt}</span>}
              <span className="cx-push cx-row">
                {a.status === 'PENDING' && <>
                  <button type="button" className="cx-btn cx-btn--danger" disabled={busy === a.id} onClick={() => void resolve(a, 'DENIED')}>Deny</button>
                  <button type="button" className="cx-btn cx-btn--primary" disabled={busy === a.id} onClick={() => void resolve(a, 'APPROVED')}>Approve</button>
                </>}
                <button type="button" className="cx-btn cx-btn--ghost" onClick={() => setDetail(a)}>Inspect Details</button>
              </span>
            </div>
          </Card>
        ))}
      </div>

      {detail && (
        <Modal title={<>Request {detail.id}</>} onClose={() => setDetail(null)}
          footer={detail.status === 'PENDING' ? <><button type="button" className="cx-btn cx-btn--danger" onClick={() => void resolve(detail, 'DENIED')}>Deny</button><button type="button" className="cx-btn cx-btn--primary" onClick={() => void resolve(detail, 'APPROVED')}>Approve</button></> : <button type="button" className="cx-btn cx-btn--ghost" onClick={() => setDetail(null)}>Close</button>}>
          <dl className="kv">
            <dt>Action</dt><dd>{detail.action}</dd><dt>Tool</dt><dd>{detail.tool}</dd><dt>Resource</dt><dd className="tone-green">{detail.resource}</dd>
            <dt>Requester</dt><dd>{detail.requester}</dd><dt>Risk</dt><dd><RiskPill risk={detail.risk} /></dd><dt>Classification</dt><dd><ClassPill value={detail.classification} /></dd>
            <dt>Created</dt><dd>{detail.createdAt}</dd><dt>Status</dt><dd>{detail.status}</dd>
            {detail.resolvedBy && <><dt>Resolved</dt><dd>{detail.resolvedBy} · {detail.resolvedAt}</dd></>}
          </dl>
          <p className="cx-sub" style={{ marginTop: '.8rem' }}>In production the backend signs the decision with the operator identity; this prototype records a mock operator.</p>
        </Modal>
      )}
    </Page>
  );
}
