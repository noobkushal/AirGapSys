import { config, mock, request } from './client';
import * as db from './mock/db';
import type { PermissionLevel, ToolDef } from '../types';
import { safeEvaluate } from '../utils/safeMath';

export interface ToolRun { output: string; ok: boolean; ms: number }

export const toolService = {
  /** BACKEND: GET /api/tools */
  list(): Promise<ToolDef[]> {
    if (!config.useMocks) return request('/api/tools');
    return mock(() => db.tools.filter((t) => t.id !== 'sysinfo'));
  },
  /** BACKEND: PUT /api/tools/{id}/permission  { level } */
  async setLevel(id: string, level: PermissionLevel): Promise<ToolDef> {
    if (!config.useMocks) return request(`/api/tools/${id}/permission`, { method: 'PUT', body: JSON.stringify({ level }) });
    const t = db.tools.find((x) => x.id === id);
    if (!t) throw new Error('Unknown tool');
    if (t.airGapLocked && level !== 'BLOCKED' && level !== 'DISABLED') throw new Error(`${t.name} is locked by the air-gap policy and cannot be enabled from the UI.`);
    t.level = level;
    db.addAudit({ user: 'operator', action: `Set ${t.name} permission to ${level}`, component: 'Tool Permission', risk: t.risk, decision: 'ALLOW', classification: 'INTERNAL', payload: `tool:${id}:${level}` });
    return mock(() => t, 150);
  },
  /**
   * BACKEND: POST /api/tools/{id}/execute  { input }
   * Mock mode: the calculator really evaluates with a safe parser; other tools return canned output.
   */
  async execute(id: string, input: string): Promise<ToolRun> {
    if (!config.useMocks) return request(`/api/tools/${id}/execute`, { method: 'POST', body: JSON.stringify({ input }) });
    const t = db.tools.find((x) => x.id === id);
    if (!t) throw new Error('Unknown tool');
    if (t.level === 'BLOCKED' || t.level === 'DISABLED') return { ok: false, ms: 0, output: `Denied: ${t.name} is ${t.level.toLowerCase()} by policy.` };
    const started = performance.now();
    let out: string; let ok = true;
    try {
      if (id === 'calc') out = `${Number(safeEvaluate(input).toFixed(10))} (evaluated locally by the safe expression parser)`;
      else if (id === 'fs') out = /^\/sandbox\/workspace\//.test(input.trim()) ? `[mock] Would read ${input.trim()} (read-only, sandboxed).` : (ok = false, 'Denied: path is outside /sandbox/workspace.');
      else if (id === 'db') out = /^\s*select\s/i.test(input) && !/;|--|\b(drop|delete|update|insert|attach)\b/i.test(input) ? '[mock] 1 row returned: { documents: 4, chunks: 766 }' : (ok = false, 'Denied: only a single read-only SELECT is permitted.');
      else if (id === 'sysinfo') out = '[mock] OS: sandboxed host | arch: arm64 | memory bound: 16 GB';
      else out = `[mock] ${t.name} executed.`;
    } catch (e) { ok = false; out = `Rejected: ${(e as Error).message}`; }
    const ms = Math.max(1, Math.round(performance.now() - started));
    t.executions += ok ? 1 : 0;
    db.addAudit({ user: 'operator', action: `${ok ? 'Executed' : 'Rejected'} ${t.name}`, component: 'Local Tools', risk: t.risk, decision: ok ? 'ALLOW' : 'BLOCK', classification: 'INTERNAL', payload: `tool:${id}:run:${ok}` });
    return mock(() => ({ output: out, ok, ms }), 180);
  },
  runtimeCards() {
    return [
      { id: 'calc', name: 'Calculator', verb: 'EXECUTE', runs: 215, desc: 'Abstract syntax tree parser evaluating arithmetic without eval() or shell access.', sample: '(450 * 1.15) / 12' },
      { id: 'fs', name: 'File Reader', verb: 'READ', runs: 142, desc: 'Sandboxed file reader restricted strictly to /sandbox/workspace directory.', sample: '/sandbox/workspace/system_manual.pdf' },
      { id: 'db', name: 'Local Database Query', verb: 'READ', runs: 89, desc: 'Local SQLite read-only SELECT querying vector indices and metadata.', sample: 'SELECT count(*) FROM chunks' },
      { id: 'sysinfo', name: 'System Information', verb: 'READ', runs: 52, desc: 'Static host sandbox telemetry (OS, architecture, hardware memory bounds).', sample: 'info' },
    ];
  },
};
// keep a sysinfo entry available for the runtime console without exposing it as a permission card
if (!db.tools.some((t) => t.id === 'sysinfo')) {
  db.tools.push({ id: 'sysinfo', name: 'System Information', category: 'System', risk: 'LOW', level: 'READ', executions: 52, lastRun: '2026-09-27 09:02:11', airGapLocked: false, runtimeVerb: 'READ', description: 'Static host sandbox telemetry.', blurb: 'Static host telemetry.' });
}
