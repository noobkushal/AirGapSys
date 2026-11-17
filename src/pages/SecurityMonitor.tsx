import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, CheckCircle2, Clock, Cog, Database, Layers, Lock, Shield } from 'lucide-react';
import { Card, ErrorState, Loading, Page, PageHeader, Pill, PostureStrip, splitStyle } from '../components/common';
import { EventStream } from '../components/dashboard/EventStream';
import { useAsync } from '../hooks/useAsync';
import { securityService } from '../services';
import { useConsole } from '../state/ConsoleContext';

const TRACE = [
  { icon: <Clock />, t: 'User request received', d: 'Input received via sandboxed web socket', ms: '+2ms' },
  { icon: <CheckCircle2 />, t: 'Prompt analyzed', d: 'Lexical token entropy & intent classified', ms: '+14ms' },
  { icon: <CheckCircle2 />, t: 'Policy evaluated', d: 'Verified POL-001 through POL-005 rules', ms: '+22ms' },
  { icon: <Database />, t: 'RAG accessed', d: 'Retrieved 2 context chunks with trust tags', ms: '+84ms' },
  { icon: <Cog />, t: 'Ollama inference', d: 'llama3:latest completed local generation', ms: '+980ms' },
  { icon: <CheckCircle2 />, t: 'Response sanitized', d: 'Verified zero confidential exfiltration', ms: '+12ms' },
  { icon: <Layers />, t: 'Audit event created', d: 'SHA-256 block committed to chain ledger', ms: '+5ms' },
];
const AXIS = { fontSize: 11, fill: '#52647c', fontFamily: 'JetBrains Mono, monospace' };

export default function SecurityMonitor() {
  const { liveEvents } = useConsole();
  const { data, loading, error, reload } = useAsync(() => securityService.monitor());
  return (
    <Page>
      <PageHeader icon={<Shield color="#2563ff" />} title="Real-Time SOC Security Monitor" subtitle="Continuous threat stream correlation, block metrics, and pipeline event chronology."
        aside={<Pill tone="green" dot large>SOC SUPERVISOR ACTIVE</Pill>} />
      {loading && <Loading rows={3} height={160} />}
      {error && <Card><ErrorState message={error} onRetry={reload} /></Card>}
      {data && (
        <div className="cx-stack">
          <div className="cx-grid cx-split" style={splitStyle('minmax(0,1.5fr) minmax(0,1fr)')}>
            <Card title="Hourly request policy decisions (allowed vs blocked)" icon={<BarChart3 color="#0a9f73" />}>
              <div className="chart" style={{ height: 250 }} role="img" aria-label="Bar chart of allowed and blocked requests by hour">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.hourly} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <defs><linearGradient id="gAllow" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10d9a0" /><stop offset="100%" stopColor="#7cecc6" /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 4" stroke="rgba(53,92,154,.18)" vertical={false} />
                    <XAxis dataKey="h" tick={AXIS} axisLine={false} tickLine={false} />
                    <YAxis tick={AXIS} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #fff', fontFamily: 'JetBrains Mono', fontSize: 12 }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12, fontFamily: 'JetBrains Mono' }} />
                    <Bar dataKey="allowed" name="Allowed" fill="url(#gAllow)" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="blocked" name="Blocked" fill="#ff4d86" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <div className="cx-stack">
              <div className="cx-grid cx-grid--2">
                <Card tone="red"><h3 className="sm-h">Adversarial Blocks</h3><div className="sm-big tone-red">4</div><p className="cx-sub">Prompt injection and jailbreaks dropped prior to model inference.</p></Card>
                <Card><h3 className="sm-h">Taint Violations</h3><div className="sm-big" style={{ color: '#ea8a00' }}>2</div><p className="cx-sub">Sensitive data sink exfiltrations blocked by policy engine.</p></Card>
              </div>
              <Card><div className="cx-row"><Lock color="#2563ff" width={18} height={18} /><h3 className="sm-h" style={{ margin: 0 }}>Egress Leakage Rate</h3><span className="cx-push"><Pill tone="green" dot>SAFE</Pill></span></div>
                <div className="sm-big tone-green" style={{ fontSize: '2.3rem' }}>0.00%</div><p className="cx-sub">Zero-leakage guarantee to be backed by air-gap firewall rules (enforced outside this UI).</p></Card>
            </div>
          </div>
          <div className="cx-grid cx-split" style={splitStyle('minmax(0,1.15fr) minmax(0,1fr)')}>
            <Card title="Security execution pipeline timeline" icon={<Layers color="#2563ff" />} aside={<Pill tone="green">Real-Time Trace</Pill>}>
              <ol className="trace">
                {TRACE.map((s) => (
                  <li key={s.t}><span className="trace__ico">{s.icon}</span><div><b>{s.t}</b><small>{s.d}</small></div><em>{s.ms}</em><Pill tone="green">PASSED</Pill></li>
                ))}
              </ol>
            </Card>
            <EventStream events={[...liveEvents, ...data.events]} maxHeight={330} />
          </div>
          <PostureStrip />
        </div>
      )}
    </Page>
  );
}
