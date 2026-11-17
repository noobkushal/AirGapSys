import { config, mock, request } from './client';
import * as db from './mock/db';
import type { Policy } from '../types';

export const policyService = {
  /** BACKEND: GET /api/policies */
  list(): Promise<Policy[]> {
    if (!config.useMocks) return request('/api/policies');
    return mock(() => db.policies);
  },
  /** BACKEND: PATCH /api/policies/{id}  { enabled }  (server may refuse; POL-001 is OS-locked) */
  async setEnabled(id: string, enabled: boolean): Promise<Policy> {
    if (!config.useMocks) return request(`/api/policies/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
    const p = db.policies.find((x) => x.id === id);
    if (!p) throw new Error('Unknown policy');
    p.enabled = enabled;
    p.lastModified = new Date().toISOString().slice(0, 19).replace('T', ' ');
    db.addAudit({ user: 'operator', action: `${enabled ? 'Enabled' : 'Disabled'} ${id}`, component: 'Policy Engine', risk: enabled ? 'LOW' : 'HIGH', decision: 'ALLOW', classification: 'INTERNAL', payload: `policy:${id}:${enabled}` });
    return mock(() => p, 200);
  },
};
