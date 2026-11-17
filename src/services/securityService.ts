import { config, mock, request } from './client';
import * as db from './mock/db';
import type { BlockedConnection, SecurityEvent, ThreatRecord } from '../types';
import { demoClassify, type DemoVerdict } from '../utils/demoClassifier';
import { stamp } from '../utils/format';

export interface MonitorData { hourly: typeof db.hourlyDecisions; events: SecurityEvent[] }
export interface AirGapPosture { status: 'ISOLATED' | 'NOT_ISOLATED' | 'UNKNOWN'; outbound: number | null; defaultRoute: boolean | null; reasons: string[]; note: string; guard: { installed: boolean; enforcing: boolean } }
export interface AirGapData { series: typeof db.egressSeries; log: BlockedConnection[]; posture?: AirGapPosture }

export const securityService = {
  /** BACKEND: GET /api/security/threats */
  threats(): Promise<ThreatRecord[]> {
    if (!config.useMocks) return request('/api/security/threats');
    return mock(() => db.threats);
  },
  /** BACKEND: POST /api/security/analyze  -> real classifier verdict */
  async analyze(input: string): Promise<DemoVerdict> {
    if (!config.useMocks) return request('/api/security/analyze', { method: 'POST', body: JSON.stringify({ input }) });
    const v = demoClassify(input);
    db.addAudit({ user: 'operator', action: `Classifier test: ${v.category}`, component: 'Prompt Injection', risk: v.riskLabel, decision: v.decision, classification: v.classification, payload: `pi:test:${v.decision}` });
    if (v.decision === 'BLOCK') {
      db.threats.unshift({ id: db.nextThreatId(), category: v.category, timestamp: stamp(), risk: v.risk, status: 'BLOCKED', input, reason: v.reason, timeline: [{ step: 'Ingress', detail: 'Submitted via analyzer', ok: true }, { step: 'Demo scan', detail: v.matched.join(', '), ok: false }, { step: 'Policy', detail: 'POL-003', ok: false }] });
    }
    return mock(() => v, 400);
  },
  /** BACKEND: GET /api/security/monitor */
  monitor(): Promise<MonitorData> {
    if (!config.useMocks) return request<MonitorData>('/api/security/monitor');
    return mock(() => ({ hourly: db.hourlyDecisions, events: db.securityEvents }));
  },
  /** BACKEND: GET /api/airgap */
  airGap(): Promise<AirGapData> {
    if (!config.useMocks) return request<AirGapData>('/api/airgap');
    return mock(() => ({ series: db.egressSeries, log: db.blockedConnections }));
  },
  /**
   * BACKEND: POST /api/airgap/probe. The backend/OS firewall performs the real check.
   * Mock mode only appends a simulated row; no network request is ever made.
   */
  async probe(host: string): Promise<BlockedConnection> {
    const row: BlockedConnection = { time: stamp().slice(11), host, port: 443, protocol: 'HTTPS', subsystem: 'Operator Probe Simulator', rule: 'POL-001 (Air-Gap Isolation)' };
    if (config.useMocks) {
      db.blockedConnections.push(row);
      db.addAudit({ user: 'operator', action: `Simulated egress probe: ${host}`, component: 'Air-Gap Monitor', risk: 'HIGH', decision: 'BLOCK', classification: 'INTERNAL', payload: `airgap:probe:${host}` });
      return mock(() => row, 300);
    }
    return request('/api/airgap/probe', { method: 'POST', body: JSON.stringify({ host }) });
  },
  /** BACKEND: GET /api/taint/scenario */
  taintScenario(): Promise<{ blocked: boolean }> {
    if (!config.useMocks) return request<{ blocked: boolean }>('/api/taint/scenario', { method: 'POST', body: '{}' });
    if (config.useMocks) db.addAudit({ user: 'operator', action: 'Taint block scenario (simulated)', component: 'Data / Taint', risk: 'CRITICAL', decision: 'BLOCK', classification: 'CONFIDENTIAL', payload: 'taint:sim:http_post:blocked' });
    return mock(() => ({ blocked: true }), 600);
  },
};
