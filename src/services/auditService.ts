import { config, mock, request } from './client';
import * as db from './mock/db';
import type { AuditEvent } from '../types';
import { buildChain, isCryptoAvailable, type ChainLink } from '../utils/sha256';

export const auditService = {
  /** BACKEND: GET /api/audit  (server-side hash chain; the browser only displays/recomputes it) */
  async list(): Promise<AuditEvent[]> {
    if (!config.useMocks) return request('/api/audit');
    const events: AuditEvent[] = await mock(() => db.auditEvents);
    if (!db.flags.crypto || !isCryptoAvailable()) return events;
    const chain = await buildChain(events.map((e) => ({ id: e.id, payload: e.payload })));
    return events.map((e, i) => ({ ...e, hash: chain[i].hash, prevHash: chain[i].prevHash }));
  },
  /** BACKEND: GET /api/audit/chain */
  async chain(): Promise<{ event: AuditEvent; link: ChainLink }[]> {
    const events = await auditService.list();
    return events.map((e) => ({ event: e, link: { id: e.id, payload: e.canonical ?? e.payload, hash: e.hash ?? '', prevHash: e.prevHash ?? '' } }));
  },
};
