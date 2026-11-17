import { useState, type ReactNode } from 'react';
import { Activity, Ban, Bot, Cpu, Database, Eye, FileText, Flame, Folder, Lock, Server, Shield, User, Wrench, ArrowRight, ArrowDown } from 'lucide-react';
import { Card, Pill } from '../common';
import { riskTone } from '../../utils/tones';
import { cx } from '../../utils/format';
import { ALL_INSPECT, ENV, GATES } from './zeroTrustData';

const ICONS: Record<string, ReactNode> = {
  flame: <Flame />, shield: <Shield />, activity: <Activity />, wrench: <Wrench />, eye: <Eye />, file: <FileText />,
  db: <Database />, cpu: <Cpu />, folder: <Folder />, server: <Server />,
};

export function useInspection(initial = 'policy') {
  const [selected, setSelected] = useState(initial);
  const info = ALL_INSPECT.find((i) => i.id === selected) ?? ALL_INSPECT[0];
  return { selected, setSelected, info };
}
type Insp = ReturnType<typeof useInspection>;

function Node({ id, insp, className, children, label }: { id: string; insp: Insp; className?: string; children: ReactNode; label: string }) {
  return (
    <button type="button" aria-pressed={insp.selected === id} aria-label={`Inspect ${label}`} className={cx('zt-node', className, insp.selected === id && 'is-selected')} onClick={() => insp.setSelected(id)}>
      {children}
    </button>
  );
}

export function ZeroTrustPipeline({ insp }: { insp: Insp }) {
  return (
    <Card as="section" className="zt" title={<>ZERO-TRUST ARCHITECTURE PIPELINE <Pill tone="green">AIR-GAP ENFORCED</Pill></>} icon={<Shield color="#2563ff" />}
      aside={<span className="zt-legend"><span className="cx-pill--dot cx-pill cx-pill--green">Active Flow</span><span className="cx-pill--dot cx-pill cx-pill--red">Egress Blocked</span></span>}>
      <p className="cx-sub">Deterministic security enforcement envelope separating the untrusted client from local reasoning and execution sinks.</p>
      <div className="zt-flow">
        <Node id="user" insp={insp} label="User" className="zt-box">
          <span className="zt-ico zt-ico--blue"><User /></span><b>USER</b><small>INGRESS ORIGIN</small>
          <p>Local terminal prompt submission via web UI</p><Pill tone="green" dot>ONLINE</Pill>
        </Node>
        <ArrowRight className="zt-arrow" aria-hidden />
        <Node id="agent" insp={insp} label="AI Agent" className="zt-box">
          <span className="zt-ico zt-ico--violet"><Bot /></span><b>AI AGENT</b><small>REASONING CORE</small>
          <p>Task planner, context assembler, tool invocation proposer</p><Pill tone="violet" dot>RUNNING</Pill>
        </Node>
        <ArrowRight className="zt-arrow" aria-hidden />
        <div className="zt-perimeter">
          <div className="zt-perimeter__head"><Shield color="#2563ff" /><b>AI HARNESS SECURITY PERIMETER</b><Pill dot>ENFORCING</Pill></div>
          <p className="cx-sub">Deterministic zero-trust policy enforcement & taint verification</p>
          <div className="zt-gates">
            {GATES.map((g) => (
              <Node key={g.id} id={g.id} insp={insp} label={g.label} className="zt-gate">
                <span className="zt-gate__ico">{ICONS[g.icon]}</span>
                <b>{g.n}. {g.label}</b>
                <Pill tone={riskTone(g.risk)} dot>{g.risk}</Pill>
              </Node>
            ))}
          </div>
        </div>
        <Node id="internet" insp={insp} label="Internet blocked" className="zt-net">
          <Ban aria-hidden /><b>INTERNET BLOCKED</b>
          <p>Complete physical and socket-layer air-gap perimeter. Outbound TCP/UDP interfaces are shut down.</p>
          <dl><dt>Outbound:</dt><dd className="tone-green">0 pkts/s</dd><dt>Cloud LLMs:</dt><dd className="tone-red">DISCONNECTED</dd><dt>DNS Resolution:</dt><dd className="tone-red">NULL_ROUTE</dd><dt>Telemetry:</dt><dd className="tone-red">DROPPED</dd></dl>
        </Node>
      </div>
      <div className="zt-bus"><ArrowDown aria-hidden /><span>Authorized Local Execution Bus</span></div>
    </Card>
  );
}

export function LocalEnvironment({ insp }: { insp: Insp }) {
  return (
    <Card title="LOCAL ENVIRONMENT (ISOLATED HOST)" icon={<Lock color="#2563ff" />} aside={<Pill dot>SANDBOXED</Pill>}>
      <div className="zt-env">
        {ENV.map((e) => (
          <Node key={e.id} id={e.id} insp={insp} label={e.label} className="zt-envitem">
            <span className="zt-envico">{ICONS[e.icon]}</span><b>{e.label}</b><small className={e.id === 'ollama' ? 'tone-green' : ''}>{e.sub}</small>
          </Node>
        ))}
      </div>
    </Card>
  );
}

export function InspectionPanel({ insp }: { insp: Insp }) {
  return (
    <Card title={`Interactive Inspection: ${insp.info.title}`} icon={<Eye color="#0a9f73" />} className="zt-inspect">
      <p className="cx-sub" style={{ marginBottom: '.7rem' }}>{insp.info.detail}</p>
      <dl className="zt-metrics">
        {insp.info.metrics.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <p className="cx-sub" style={{ margin: '.7rem 0 0', fontSize: '.68rem' }}>Click any component above to inspect it. Values are sample data.</p>
    </Card>
  );
}
