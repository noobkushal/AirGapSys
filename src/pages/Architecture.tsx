import { Layers, Network, Shield, Lock, Settings as Cog } from 'lucide-react';
import { Card, Page, PageHeader, Pill, splitStyle } from '../components/common';
import { InspectionPanel, LocalEnvironment, useInspection, ZeroTrustPipeline } from '../components/dashboard/ZeroTrust';

const LAYERS = [
  { icon: <Shield color="#0a9f73" />, title: '1. Ingress & Inspection Layer', text: 'All user prompts entering via socket or console are immediately parsed into an Abstract Syntax Tree (AST). Token entropy and semantic classifiers intercept jailbreak templates, prompt overrides, and system prompt leakage prior to agent ingestion.' },
  { icon: <Lock color="#8b5cf6" />, title: '2. Policy & Taint Supervisory Layer', text: 'Data lineage tracking applies persistent security tags (PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED) to all RAG vector chunks. If tainted confidential data attempts to reach network or external file sinks, execution is halted deterministically.' },
  { icon: <Cog color="#ec4899" />, title: '3. Local Isolated Execution Layer', text: 'Inference executes exclusively via local Ollama models (llama3) bound to 127.0.0.1. Tools operate inside chroot sandbox containers. Outbound NIC sockets are blocked at kernel level, preserving total air-gapped immunity.' },
];

export default function Architecture() {
  const insp = useInspection();
  return (
    <Page>
      <PageHeader icon={<Layers color="#2563ff" />} title="System Architecture & Security Topology" subtitle="Structural decomposition of the zero-trust AI Harness isolating the autonomous agent from unverified external networks."
        aside={<Pill tone="green" large><Network />Formal Defense-in-Depth Topology</Pill>} />
      <div className="cx-stack">
        <ZeroTrustPipeline insp={insp} />
        <div className="cx-grid cx-split" style={splitStyle('minmax(0,1.9fr) minmax(0,1fr)')}>
          <LocalEnvironment insp={insp} />
          <InspectionPanel insp={insp} />
        </div>
        <div className="cx-grid cx-grid--3">
          {LAYERS.map((l) => <Card key={l.title} title={l.title} icon={l.icon} className="arch-layer"><p className="cx-sub" style={{ margin: 0, fontSize: '.78rem' }}>{l.text}</p></Card>)}
        </div>
        <p className="cx-sub">This diagram describes the intended design. Enforcement of each layer is implemented by the backend and operating system, not by this interface.</p>
      </div>
    </Page>
  );
}
