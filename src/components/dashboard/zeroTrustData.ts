import type { Risk } from '../../types';

export interface GateInfo { id: string; n: number; label: string; risk: Risk; icon: string; detail: string; metrics: [string, string][] }

export const GATES: GateInfo[] = [
  { id: 'pi', n: 1, label: 'Prompt Injection', risk: 'HIGH', icon: 'flame', detail: 'Pre-inference scanner parses every ingress prompt into an AST and scores it against jailbreak, override and exfiltration patterns.', metrics: [['Prompts scanned', '768'], ['Intercepted', '4'], ['Mode', 'Pre-inference']] },
  { id: 'policy', n: 2, label: 'Policy Engine', risk: 'CRITICAL', icon: 'shield', detail: 'Deterministic rules POL-001 to POL-005 evaluated for every proposed tool call. First matching deny wins.', metrics: [['Rules enforced', '5'], ['Decisions', '1,204'], ['Blocks', '107']] },
  { id: 'taint', n: 3, label: 'Data / Taint Checker', risk: 'HIGH', icon: 'activity', detail: 'Propagates classification tags from sources into agent memory and stops tainted data reaching outbound sinks.', metrics: [['Tagged chunks', '766'], ['Violations', '2'], ['Tiers', '6']] },
  { id: 'tool', n: 4, label: 'Tool Permission', risk: 'HIGH', icon: 'wrench', detail: 'Least-privilege capability map for local tools. Network, e-mail and socket tools are denied by the air-gap policy.', metrics: [['Tools registered', '8'], ['Blocked', '3'], ['Restricted', '1']] },
  { id: 'approval', n: 5, label: 'Human Approval', risk: 'CRITICAL', icon: 'eye', detail: 'Suspends execution of HIGH and CRITICAL actions until an authorised operator signs off.', metrics: [['Pending', '1'], ['Timeout', '300 s'], ['Signed by', 'Operator ID']] },
  { id: 'audit', n: 6, label: 'Audit Logger', risk: 'LOW', icon: 'file', detail: 'Appends every decision to a backward-linked SHA-256 ledger so tampering is detectable.', metrics: [['Events', '7'], ['Hash', 'SHA-256'], ['Chain', 'Backward-linked']] },
];

export interface EnvInfo { id: string; label: string; sub: string; icon: string; detail: string; metrics: [string, string][] }
export const ENV: EnvInfo[] = [
  { id: 'rag', label: 'LOCAL RAG', sub: 'Vector Chunks', icon: 'db', detail: 'Local dense-embedding vector store with source-level taint tags.', metrics: [['Chunks', '766'], ['Embeddings', 'nomic-embed-text'], ['Egress', 'None']] },
  { id: 'tools', label: 'LOCAL TOOLS', sub: 'AST Compute', icon: 'wrench', detail: 'Whitelisted deterministic tools executed inside isolated memory boundaries.', metrics: [['Runs', '498'], ['Shell', 'Disabled'], ['eval()', 'Not used']] },
  { id: 'ollama', label: 'OLLAMA', sub: 'llama3:latest', icon: 'cpu', detail: 'Local open-weights inference bound to 127.0.0.1:11434.', metrics: [['Model', 'llama3'], ['Bind', '127.0.0.1'], ['Telemetry', 'Off']] },
  { id: 'fs', label: 'FILE SYSTEM', sub: 'Chroot Jailed', icon: 'folder', detail: 'Read access limited to /sandbox/workspace; write paths guarded by POL-002.', metrics: [['Root', '/sandbox'], ['Mode', 'Read-only'], ['Escapes', '0']] },
  { id: 'sqlite', label: 'DATABASE', sub: 'Local SQLite', icon: 'server', detail: 'Embedded SQLite for vectors and audit metadata. Single read-only SELECT permitted for tools.', metrics: [['Engine', 'SQLite'], ['Access', 'Read-only'], ['Remote', 'No']] },
];

export const ALL_INSPECT = [
  ...GATES.map((g) => ({ id: g.id, title: `${g.n}. ${g.label}`, detail: g.detail, metrics: g.metrics })),
  ...ENV.map((e) => ({ id: e.id, title: e.label, detail: e.detail, metrics: e.metrics })),
  { id: 'user', title: 'User (ingress origin)', detail: 'Local terminal prompt submission via the web UI. Treated as untrusted until scanned.', metrics: [['Trust label', 'USER'], ['Channel', 'Local console'], ['Remote', 'No']] },
  { id: 'agent', title: 'AI Agent (reasoning core)', detail: 'Plans tasks, assembles context and proposes tool calls. It cannot execute anything without passing every gate.', metrics: [['State', 'Running'], ['Model', 'llama3'], ['Autonomy', 'Gated']] },
  { id: 'internet', title: 'Internet (blocked)', detail: 'Complete socket-layer air-gap perimeter. Enforcement is performed by the OS firewall and backend, not this UI.', metrics: [['Outbound', '0 pkts/s'], ['Cloud LLMs', 'DISCONNECTED'], ['DNS', 'NULL_ROUTE']] },
];
