import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Bot, Box, Cpu, Database, FileText, Folder, HardDrive, HeartPulse, Layers, RefreshCw, Shield, BarChart3 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, ErrorState, Loading, Page, PageHeader, Pill } from '../components/common';
import { useAsync } from '../hooks/useAsync';
import { healthService } from '../services';

const ICON: Record<string, ReactNode> = { bot: <Bot />, shield: <Shield />, layers: <Layers />, box: <Box />, db: <Database />, cpu: <Cpu />, folder: <Folder />, file: <FileText /> };
const AXIS = { fontSize: 11, fill: '#52647c', fontFamily: 'JetBrains Mono, monospace' };

export default function Health() {
  const { data, loading, error, reload } = useAsync(() => healthService.get());
  return (
    <Page>
      <PageHeader icon={<HeartPulse color="#e0263c" />} title="System Health & Resource Telemetry" subtitle="Local CPU, memory footprint, request latencies, and process sandbox boundaries (sample data)."
        aside={<div className="cx-row"><Pill tone={data && data.services.some((s) => s.status === 'OFFLINE') ? 'red' : 'green'} large>{data && data.services.some((s) => s.status === 'OFFLINE') ? `${data.services.filter((s) => s.status !== 'OFFLINE').length} OF ${data.services.length} SUBSYSTEMS HEALTHY` : `ALL ${data?.services.length ?? 8} SUBSYSTEMS HEALTHY`}</Pill><button type="button" className="cx-btn cx-btn--ghost cx-btn--sm" onClick={reload} disabled={loading}><RefreshCw className={loading ? 'cx-spin' : ''} />Refresh</button></div>} />
      {loading && !data && <Loading rows={3} height={150} />}
      {error && <Card><ErrorState message={error} onRetry={reload} /></Card>}
      {data && (
        <div className="cx-stack">
          <Card title="Host resource telemetry (CPU % & Memory GB)" icon={<BarChart3 color="#2563ff" />}>
            <div className="chart" style={{ height: 260 }} role="img" aria-label="Chart of CPU load percent and memory footprint over time">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.series} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <defs><linearGradient id="gCpu" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10d9a0" stopOpacity={0.45} /><stop offset="100%" stopColor="#10d9a0" stopOpacity={0.04} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 4" stroke="rgba(53,92,154,.18)" />
                  <XAxis dataKey="t" tick={AXIS} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 60]} tick={AXIS} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #fff', fontFamily: 'JetBrains Mono', fontSize: 12 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12, fontFamily: 'JetBrains Mono' }} />
                  <Area type="monotone" dataKey="cpu" name="CPU Load (%)" stroke="#10c98f" strokeWidth={2} fill="url(#gCpu)" dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} />
                  <Line type="monotone" dataKey="mem" name="Memory Footprint (GB)" stroke="#2563ff" strokeWidth={2} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <div className="cx-grid cx-grid--4">
            {data.services.map((s) => (
              <Card key={s.id} className="hl">
                <div className="hl__head"><span className="hl__ico">{ICON[s.icon] ?? <HardDrive />}</span><div><b>{s.name}</b><small>{s.subtitle}</small></div></div>
                <div style={{ marginBottom: '.5rem' }}><Pill tone={s.status === 'SANDBOXED' ? 'blue' : s.status === 'OFFLINE' ? 'red' : 'green'} dot>{s.status}</Pill></div>
                <div className="hl__bar"><span>CPU Load</span><b>{s.cpu === null ? 'n/a' : `${s.cpu}%`}</b></div><div className="cx-progress" role="progressbar" aria-label={`${s.name} CPU`} aria-valuenow={s.cpu ?? 0} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.min(100, s.cpu ?? 0)}%` }} /></div>
                <div className="hl__bar"><span>Memory (RAM)</span><b>{s.memLabel}</b></div><div className="cx-progress cx-progress--blue" role="progressbar" aria-label={`${s.name} memory`} aria-valuenow={s.memPct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${s.memPct}%` }} /></div>
                <div className="hl__foot"><div><small>Latency</small><b className="tone-green">{s.latency}</b></div><div style={{ textAlign: 'right' }}><small>Requests</small><b>{s.requests}</b></div></div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </Page>
  );
}
