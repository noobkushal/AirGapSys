export type Risk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Decision = 'ALLOW' | 'BLOCK' | 'REQUIRE_APPROVAL';
export type Classification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
export type TrustLabel =
  | 'SYSTEM'
  | 'LOCAL_DOCUMENT'
  | 'RETRIEVED_DATA'
  | 'USER'
  | 'TOOL_OUTPUT'
  | 'UNTRUSTED';
export type Tone = 'green' | 'red' | 'amber' | 'blue' | 'violet' | 'gray' | 'orange';

export interface Policy {
  id: string;
  priority: number;
  name: string;
  category: string;
  description: string;
  rules: string[];
  enabled: boolean;
  enforcements: number;
  lastModified: string;
}

export type PermissionLevel =
  | 'READ'
  | 'WRITE'
  | 'EXECUTE'
  | 'RESTRICTED'
  | 'BLOCKED'
  | 'DISABLED';

export interface ToolDef {
  id: string;
  name: string;
  category: string;
  risk: Risk;
  description: string;
  level: PermissionLevel;
  executions: number;
  lastRun: string;
  /** Tools forbidden by the air-gap policy: the UI cannot unblock them. */
  airGapLocked: boolean;
  /** Which levels this tool can legitimately be configured to. */
  runtimeVerb: 'EXECUTE' | 'READ';
  runs?: number;
  blurb: string;
}

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'DENIED';
export interface ApprovalRequest {
  id: string;
  createdAt: string;
  risk: Risk;
  classification: Classification;
  action: string;
  tool: string;
  resource: string;
  requester: string;
  status: ApprovalStatus;
  resolvedAt?: string;
  resolvedBy?: string;
  note?: string;
}

export interface ThreatRecord {
  id: string;
  category: string;
  timestamp: string;
  input: string;
  reason: string;
  risk: number;
  status: 'BLOCKED' | 'ALLOWED';
  timeline: { step: string; detail: string; ok: boolean }[];
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  component: string;
  risk: Risk;
  decision: Decision;
  classification: Classification;
  payload: string;
  /** The exact string the backend hashed (all fields). Falls back to `payload` for mock data. */
  canonical?: string;
  /** Present only when computed (Web Crypto) */
  hash?: string;
  prevHash?: string;
}

export interface RagDocument {
  name: string;
  sizeKb: number;
  chunks: number;
  status: 'INDEXED' | 'PENDING';
  trust: TrustLabel;
  classification: Classification;
  lastIndexed: string;
  embeddingModel?: string;
  flaggedChunks?: number;
}
export interface RagChunk {
  id: number;
  doc: string;
  page: number;
  score: number;
  classification: Classification;
  text: string;
}

export interface OllamaModel {
  id: string;
  label: string;
  params: string;
  status: 'ONLINE' | 'STANDBY';
  context: number;
  requests: number;
  avgResponse: string;
  sizeGb: number;
}

export interface HealthService {
  id: string;
  name: string;
  subtitle: string;
  status: 'ACTIVE' | 'ONLINE' | 'SANDBOXED' | 'OFFLINE';
  /** null when the host cannot measure it (never invented) */
  cpu: number | null;
  memLabel: string;
  memPct: number;
  latency: string;
  requests: number;
  icon: string;
}

export interface SecurityEvent {
  id: string;
  time: string;
  source: string;
  message: string;
  kind: 'SUCCESS' | 'INFO' | 'BLOCKED' | 'AUDIT';
}

/** One passage a /rag search or /rag ask result is based on. */
export interface SourceRef {
  n: number;
  doc: string;
  /** "p. 4" for paginated documents (PDF), otherwise "section 3/12": we never invent page numbers */
  locator: string;
  page: number | null;
  classification: Classification;
  score: number;
  snippet: string;
  cited: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  text: string;
  time: string;
  meta?: {
    reqId: string;
    trust: TrustLabel;
    risk: Risk;
    classification: Classification;
    decision: Decision;
    trace: { step: string; ms: number; ok: boolean }[];
    reasons: string[];
    /** present on /rag search | ask | sources replies */
    sources?: SourceRef[];
    command?: string;
    attribution?: { sentences: number; cited: number; weaklySupported: number; method: string };
  };
}

export interface BlockedConnection {
  time: string;
  host: string;
  port: number;
  protocol: string;
  subsystem: string;
  rule: string;
}

export interface BackendStatus {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

export type SlackConnectionState = 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

export interface SlackQueueStats {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  blockedAirgap: number;
}

export interface SlackStatus {
  enabled: boolean;
  connectionState: SlackConnectionState;
  configured: boolean;
  webhookUrlMasked: string;
  channel: string;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastTestedAt: string | null;
  strictAirgap: boolean;
  relayEnabled: boolean;
  queue: SlackQueueStats;
}

export interface SlackPreferences {
  prompt_injection: boolean;
  blocked_actions: boolean;
  approval_requests: boolean;
  approval_decisions: boolean;
  network_security: boolean;
  policy_changes: boolean;
  critical_audit: boolean;
}

export interface SlackNotificationHistoryItem {
  id: string;
  eventType: string;
  category: string;
  severity: Risk | 'INFO';
  title: string;
  description: string;
  component: string;
  decision: string;
  eventId: string;
  timestamp: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'BLOCKED_AIRGAP';
  attempts: number;
  sentAt: string | null;
  error: string | null;
}

export interface SlackConfigUpdate {
  webhookUrl?: string;
  channel?: string;
  enabled?: boolean;
}

