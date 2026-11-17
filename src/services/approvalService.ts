import { config, mock, request } from './client';
import * as db from './mock/db';
import type { ApprovalRequest } from '../types';
import { stamp } from '../utils/format';

export const approvalService = {
  /** BACKEND: GET /api/approvals */
  list(): Promise<ApprovalRequest[]> {
    if (!config.useMocks) return request('/api/approvals');
    return mock(() => db.approvals);
  },
  /** BACKEND: POST /api/approvals/{id}/resolve  { decision, note } (server signs & records operator id) */
  async resolve(id: string, decision: 'APPROVED' | 'DENIED', note?: string): Promise<ApprovalRequest> {
    if (!config.useMocks) return request(`/api/approvals/${id}/resolve`, { method: 'POST', body: JSON.stringify({ decision, note }) });
    const a = db.approvals.find((x) => x.id === id);
    if (!a || a.status !== 'PENDING') throw new Error('Request is no longer pending.');
    a.status = decision; a.resolvedAt = stamp(); a.resolvedBy = 'operator_max'; a.note = note;
    db.addAudit({ user: 'operator_max', action: `${decision === 'APPROVED' ? 'Approved' : 'Denied'} ${id}`, component: 'Human Approval', risk: a.risk, decision: decision === 'APPROVED' ? 'ALLOW' : 'BLOCK', classification: a.classification, payload: `approval:${id}:${decision}` });
    return mock(() => a, 250);
  },
  /** BACKEND: not applicable. In production requests originate from the agent runtime. */
  simulate(): Promise<ApprovalRequest> {
    if (!config.useMocks) return request<ApprovalRequest>('/api/approvals/simulate', { method: 'POST', body: '{}' });
    const a: ApprovalRequest = { id: db.nextApprovalId(), createdAt: stamp(), risk: 'CRITICAL', classification: 'RESTRICTED', action: 'Export audit ledger snapshot to external storage', tool: 'Local Database', resource: '/sandbox/db/ledger.sqlite', requester: 'Agent Reasoning Core (llama3)', status: 'PENDING' };
    db.approvals.unshift(a);
    db.addAudit({ user: 'agent_core', action: 'High-Risk Action Approval Request (simulated)', component: 'Human Approval', risk: 'CRITICAL', decision: 'REQUIRE_APPROVAL', classification: 'RESTRICTED', payload: `approval:${a.id}:pending` });
    return mock(() => a, 250);
  },
};
