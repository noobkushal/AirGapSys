import { config, mock, request } from './client';
import * as db from './mock/db';
import type { SecurityEvent } from '../types';

export interface OverviewData {
  agent: { status: string; note: string };
  ollama: { status: string; note: string };
  threats: number;
  blocked: number;
  toolCalls: number;
  pendingApprovals: number;
  auditEvents: number;
  /** null = the host could not be inspected */
  outbound: number | null;
  airGap?: { status: string; reasons: string[] };
  activePolicies: number;
  totalPolicies: number;
  events: SecurityEvent[];
  activity: { h: string; runs: number; blocked: number }[];
  threatCats: { name: string; count: number }[];
}

export const overviewService = {
  /** BACKEND: GET /api/overview */
  get(): Promise<OverviewData> {
    if (!config.useMocks) return request<OverviewData>('/api/overview');
    return mock(() => ({
      agent: { status: 'RUNNING', note: 'Autonomous loop active' },
      ollama: { status: 'ONLINE', note: 'llama3 on localhost:11434' },
      threats: db.threats.length,
      blocked: db.auditEvents.filter((e) => e.decision === 'BLOCK').length,
      toolCalls: 768,
      pendingApprovals: db.approvals.filter((a) => a.status === 'PENDING').length,
      auditEvents: db.auditEvents.length,
      outbound: 0,
      activePolicies: db.policies.filter((p) => p.enabled).length,
      totalPolicies: db.policies.length,
      events: db.securityEvents,
      activity: db.agentActivity,
      threatCats: Object.entries(db.threats.reduce<Record<string, number>>((m, t) => ({ ...m, [t.category]: (m[t.category] ?? 0) + 1 }), {})).map(([name, count]) => ({ name, count })),
    }));
  },
};
