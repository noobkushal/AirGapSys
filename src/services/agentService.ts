import { config, mock, request } from './client';
import * as db from './mock/db';
import type { ChatMessage, Classification, Decision, Risk } from '../types';
import { demoClassify } from '../utils/demoClassifier';
import { clock, uid } from '../utils/format';
import { isCommand, mockRagCommand } from './mock/ragCommandsMock';

let req = 143;

export const agentService = {
  /**
   * BACKEND: POST /api/agent/chat  { message, model, sessionId }  (messages starting with /rag are commands handled server-side)
   * The backend runs prompt-injection scan -> policy -> RAG -> Ollama -> output sanitiser,
   * and returns the final text plus the pipeline trace. Nothing below is real inference.
   */
  async send(message: string, model: string, sessionId?: string): Promise<ChatMessage> {
    if (!config.useMocks) return request<ChatMessage>('/api/agent/chat', { method: 'POST', body: JSON.stringify({ message, model, sessionId }) }, 130000);
    if (isCommand(message)) return mock(() => mockRagCommand(message), 350);
    const v = demoClassify(message);
    const reqId = `REQ-2026-${String(req++).padStart(5, '0')}`;
    const exfil = v.matched.includes('Data Exfiltration');
    const decision: Decision = v.decision;
    const blocked = decision === 'BLOCK';
    const trace = [
      { step: 'User request received', ms: 2, ok: true },
      { step: 'Prompt analyzed (demo heuristic)', ms: 14, ok: !blocked },
      { step: 'Policy evaluated (POL-001..005)', ms: 22, ok: !blocked },
      ...(blocked ? [] : [{ step: 'RAG accessed', ms: 84, ok: true }, { step: `Ollama inference (${model}, mocked)`, ms: 980, ok: true }, { step: 'Response sanitized', ms: 12, ok: true }]),
      { step: 'Audit event created', ms: 5, ok: true },
    ];
    db.addAudit({ user: 'operator', action: blocked ? `Blocked: ${v.category}` : 'Prompt submitted', component: blocked ? 'Prompt Injection' : 'AI Agent', risk: v.riskLabel as Risk, decision, classification: v.classification as Classification, payload: `agent:${reqId}:${decision}` });
    if (blocked) db.threats.unshift({ id: db.nextThreatId(), category: v.category, timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '), risk: v.risk, status: 'BLOCKED', input: message, reason: v.reason, timeline: [{ step: 'Ingress', detail: 'Prompt received', ok: true }, { step: 'Demo scan', detail: v.matched.join(', '), ok: false }, { step: 'Policy', detail: exfil ? 'POL-001 / POL-005' : 'POL-003', ok: false }, { step: 'Egress', detail: 'Dropped before inference', ok: true }] });
    await mock(() => 0, blocked ? 350 : 900);
    const text = blocked
      ? `Request blocked by policy: ${v.reason} No model inference was performed and no tool was invoked.${exfil ? ' Outbound transfer sinks are denied by POL-001 and POL-005.' : ''}`
      : decision === 'REQUIRE_APPROVAL'
        ? 'This request touches classified material, so it has been placed in the Human Approval queue. Execution is suspended until an operator responds.'
        : `This is a simulated reply from the ${model} placeholder. Connect the backend to receive real local inference. Your request was processed in the zero-trust pipeline and logged to the ledger.`;
    if (decision === 'REQUIRE_APPROVAL') {
      db.approvals.unshift({ id: db.nextApprovalId(), createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '), risk: 'HIGH', classification: v.classification, action: message.slice(0, 120), tool: 'File System', resource: '/secure/vault/(requested)', requester: `Agent Reasoning Core (${model})`, status: 'PENDING' });
    }
    return { id: uid('m'), role: 'agent', text, time: clock(), meta: { reqId, trust: v.trust, risk: v.riskLabel, classification: v.classification, decision, trace, reasons: v.matched.length ? [v.reason] : [] } };
  },
};
