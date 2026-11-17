import { useMemo, useState } from 'react';
import { Calculator, Cloud, Database, Folder, Mail, Network, Search, Terminal, Wrench, Ban } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, EmptyState, ErrorState, Loading, Page, PageHeader, Pill, RiskPill, SearchInput } from '../components/common';
import { useAsync } from '../hooks/useAsync';
import { toolService } from '../services';
import { useConsole } from '../state/ConsoleContext';
import type { PermissionLevel, ToolDef } from '../types';
import { cx } from '../utils/format';

const LEVELS: PermissionLevel[] = ['READ', 'WRITE', 'EXECUTE', 'RESTRICTED', 'BLOCKED', 'DISABLED'];
const ICON: Record<string, ReactNode> = { fs: <Folder />, db: <Database />, calc: <Calculator />, rag: <Search />, shell: <Terminal />, sock: <Network />, mail: <Mail />, http: <Cloud /> };

export default function ToolPermissions() {
  const { toast, refreshCounts } = useConsole();
  const { data, loading, error, reload, setData } = useAsync(() => toolService.list());
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All Categories');
  const cats = useMemo(() => ['All Categories', ...Array.from(new Set((data ?? []).map((t) => t.category)))], [data]);
  const rows = (data ?? []).filter((t) => (cat === 'All Categories' || t.category === cat) && `${t.name} ${t.category} ${t.description}`.toLowerCase().includes(q.toLowerCase()));
  const blocked = (data ?? []).filter((t) => t.level === 'BLOCKED').length;

  async function setLevel(t: ToolDef, level: PermissionLevel) {
    if (t.level === level) return;
    const prev = t.level;
    setData((d) => (d ?? []).map((x) => (x.id === t.id ? { ...x, level } : x))); // optimistic
    try { await toolService.setLevel(t.id, level); toast(`${t.name}: ${level}`, level === 'BLOCKED' || level === 'DISABLED' ? 'amber' : 'green'); refreshCounts(); }
    catch (e) { setData((d) => (d ?? []).map((x) => (x.id === t.id ? { ...x, level: prev } : x))); toast(e instanceof Error ? e.message : 'Update failed', 'red'); }
  }

  return (
    <Page>
      <PageHeader icon={<Wrench color="#2563ff" />} title="Tool Permissions & Sandbox Access" subtitle="Least-privilege capability boundaries for local tools. Dangerous network, email, and socket tools are blocked."
        aside={<Pill tone="red" large><Ban />{blocked} Tools Blocked (Air-Gap)</Pill>} />
      <div className="cx-toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Search tools (e.g. File System, Terminal, HTTP)…" label="Search tools" />
        <label className="cx-toolbar__label" htmlFor="tcat">Category:</label>
        <select id="tcat" className="cx-select" value={cat} onChange={(e) => setCat(e.target.value)}>{cats.map((c) => <option key={c}>{c}</option>)}</select>
      </div>
      {loading && <Loading rows={3} height={200} />}
      {error && <Card><ErrorState message={error} onRetry={reload} /></Card>}
      {data && rows.length === 0 && <Card><EmptyState title="No tools match" /></Card>}
      <div className="cx-grid cx-grid--3">
        {rows.map((t) => (
          <Card key={t.id} className="tp" tone={t.level === 'BLOCKED' ? 'red' : undefined}>
            <div className="tp__head">
              <span className={cx('cx-icon-box', t.airGapLocked ? 'cx-icon-box--red' : 'cx-icon-box--blue')}>{ICON[t.id]}</span>
              <div><b>{t.name.toUpperCase()}</b><small>Category: {t.category}</small></div>
              <span className="tp__pills"><RiskPill risk={t.risk} /><Pill tone={t.level === 'BLOCKED' || t.level === 'DISABLED' ? 'red' : t.level === 'RESTRICTED' ? 'amber' : 'green'} dot>{t.level === 'BLOCKED' || t.level === 'DISABLED' ? t.level : t.level === 'RESTRICTED' ? 'RESTRICTED' : 'ALLOWED'}</Pill></span>
            </div>
            <p className="cx-sub">{t.description}</p>
            <span className="cx-label cx-label--caps">Configured permission level:</span>
            <div className="tp__levels" role="radiogroup" aria-label={`${t.name} permission level`}>
              {LEVELS.map((l) => {
                const locked = t.airGapLocked && l !== 'BLOCKED' && l !== 'DISABLED';
                return <button key={l} type="button" role="radio" aria-checked={t.level === l} disabled={locked} title={locked ? 'Locked by the air-gap policy' : undefined}
                  className={cx('tp__lvl', t.level === l && (l === 'BLOCKED' || l === 'DISABLED' ? 'on-bad' : 'on'))} onClick={() => void setLevel(t, l)}>{l}</button>;
              })}
            </div>
            <div className="tp__foot"><span>Executions: <b>{t.executions}</b></span><span>Last run: {t.lastRun}</span></div>
          </Card>
        ))}
      </div>
    </Page>
  );
}
