# Clarix AI — Air-Gapped Secure AI Agent & Enterprise SOC Platform

[![Security: Air-Gap Isolated](https://img.shields.io/badge/Security-Air--Gap%20Isolated-red.svg)](#air-gap-security-architecture)
[![Policy: Zero-Trust Engine](https://img.shields.io/badge/Policy-Zero--Trust%20Enforced-green.svg)](#zero-trust-policy-engine)
[![Ledger: SHA--256 Tamper--Evident](https://img.shields.io/badge/Audit-SHA--256%20Merkle%20Chain-blue.svg)](#tamper-evident-audit-ledger)
[![Integration: Slack Incoming Webhooks](https://img.shields.io/badge/Integration-Slack%20Block%20Kit-4A154B.svg)](#slack-integration-official-incoming-webhooks)
[![LLM: Ollama Loopback](https://img.shields.io/badge/LLM-Local%20Ollama%20Only-orange.svg)](#local-llm--rag-pipeline)

Clarix AI is an enterprise-grade, air-gap-first artificial intelligence security platform and autonomous agent harness. It provides strict containment for local Large Language Models (LLMs), sandboxed tools, policy-gated Retrieval-Augmented Generation (RAG), human-in-the-loop approvals, tamper-evident cryptographic audit logging, and an isolated outbound Slack notification relay.

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Security Architecture & Guarantees](#security-architecture--guarantees)
3. [Slack Integration (Official Incoming Webhooks)](#slack-integration-official-incoming-webhooks)
4. [Localhost Quickstart](#localhost-quickstart)
5. [Configuration & Environment Variables](#configuration--environment-variables)
6. [API Specification Reference](#api-specification-reference)
7. [Automated Testing & Verification](#automated-testing--verification)
8. [Documentation Library](#documentation-library)

---

## Architecture Overview

```
                                 CLARIX AI ARCHITECTURE
                                 
+-----------------------------------------------------------------------------------------+
|                                    OPERATOR BROWSER                                     |
|                                                                                         |
|   React 18 + TypeScript + Vite + Web Crypto SHA-256 Ledger Verification                 |
|   Console UI: Overview, Agent Chat, Security Monitor, Policies, Approvals, Settings    |
+-----------------------------------------------------------------------------------------+
                                            |
                              HTTP / REST (Loopback Only)
                                            v
+-----------------------------------------------------------------------------------------+
|                         CLARIX CORE SERVICE (clarix-backend)                           |
|                                                                                         |
|  +-----------------------------------------------------------------------------------+  |
|  | IN-PROCESS EGRESS GUARD (clarix.airgap.guard)                                     |  |
|  | Intercepts socket.connect, getaddrinfo, sendto before packets leave process.      |  |
|  | Denies and audits any attempt to contact non-loopback destinations.                |  |
|  +-----------------------------------------------------------------------------------+  |
|                                            |                                            |
|   +--------------------+  +----------------------+  +-------------------------------+   |
|   |  AI Agent Pipeline |  |  Policy Engine       |  |  Human Approvals Queue        |   |
|   |  - Prompt Scan     |  |  - POL-001 (AirGap)  |  |  - Suspend / Resume           |   |
|   |  - Taint Tracking  |  |  - POL-002 (Creds)   |  |  - Time-Boxed TTL (300s)      |   |
|   |  - Tool Sandbox    |  |  - POL-003..POL-005  |  |  - Compare-and-Set AtomicCAS  |   |
|   +--------------------+  +----------------------+  +-------------------------------+   |
|                                            |                                            |
|   +--------------------+  +----------------------+  +-------------------------------+   |
|   |  Local RAG Store   |  |  Audit Ledger        |  |  Slack Notification Service   |   |
|   |  - Chunk embed     |  |  - Append-Only Trig  |  |  - Sanitizer & Masking        |   |
|   |  - Ingest gate     |  |  - SHA-256 HashChain |  |  - Block Kit Formatter        |   |
|   |  - Quarantine      |  |  - External Anchor   |  |  - Deduplication Engine       |   |
|   +--------------------+  +----------------------+  +-------------------------------+   |
|                                            |                                            |
|                     +----------------------------------------------+                    |
|                     | SQLite WAL Database (clarix.db)              |                    |
|                     | - audit_events       - slack_notifications   |                    |
|                     | - approvals          - slack_config          |                    |
|                     | - threats / policies - slack_preferences     |                    |
|                     +----------------------------------------------+                    |
+--------------------------------------------|--------------------------------------------+
                                             |
                         Local Loopback IPC  |  Local SQLite Queue
                                             |
       +-------------------------------------+-------------------------------------+
       |                                                                           |
       v                                                                           v
+-----------------------------+                             +-----------------------------+
|    LOCAL OLLAMA ENGINE      |                             | ISOLATED SLACK RELAY WORKER |
|  http://127.0.0.1:11434     |                             | (python -m clarix.slack)    |
|                             |                             |                             |
|  - Llama 3 / Qwen / Mistral |                             |  * Runs in separate process |
|  - Nomic Embed Text         |                             |  * Honors strict air-gap    |
|  - Strict loopback bind     |                             |  * Dispatches Block Kit     |
|                             |                             |  * Retry limit with backoff |
+-----------------------------+                             +-----------------------------+
                                                                           |
                                                             Outbound HTTPS (Port 443)
                                                             (Explicitly Authorized Only)
                                                                           v
                                                            +-----------------------------+
                                                            |   SLACK PLATFORM WEBHOOKS   |
                                                            |   hooks.slack.com           |
                                                            +-----------------------------+
```

---

## Security Architecture & Guarantees

Clarix AI enforces zero trust through multi-tiered controls:

### 1. In-Process Outbound Network Guard
- Patches the Python `socket` module at initialization (`socket.connect`, `socket.connect_ex`, `socket.sendto`, `socket.getaddrinfo`, `socket.gethostbyname`).
- Every non-loopback connection or DNS lookup raises an immediate `AirGapViolation` **before any packet leaves the host**.
- Every interception is committed to the immutable audit ledger.

### 2. Zero-Trust Policy Engine
- **POL-001 (Air-Gap Isolation):** Blocks all outbound network requests from tools and sinks.
- **POL-002 (Sensitive File Protection):** Prevents access to credentials, SSH keys, private keys, `.env`, shadow, and system paths.
- **POL-003 (Destructive Actions):** Requires human operator authorization for destructive or state-changing commands.
- **POL-004 (Excessive Token Limit):** Prevents Denial-of-Wallet or context exhaustion attacks.
- **POL-005 (Egress Data Taint Sink):** Prevents classified/tainted data from entering any egress sink.

### 3. Human-in-the-Loop Approvals
- Any action flagged with `REQUIRE_APPROVAL` suspends execution and records an approval token (`AP-XXXX`).
- Actions can only be resumed by an authorized operator.
- Approvals time out automatically (default 300 seconds) and transition to `DENIED`.

### 4. Tamper-Evident SHA-256 Audit Ledger
- Append-only database triggers prevent updates or deletions in `audit_events`.
- Every entry links cryptographically to the previous event:
  $$\text{Hash}_n = \text{SHA-256}(\text{Hash}_{n-1} + \text{Canonical JSON}_n)$$
- The browser independently verifies the full ledger using the native Web Crypto API.

---

## Slack Integration (Official Incoming Webhooks)

Clarix AI features a complete, battle-tested integration with Slack Incoming Webhooks using **Slack Block Kit**.

### Air-Gap Safeguards for Slack
1. **Disabled by Default:** The integration is strictly disabled upon startup.
2. **In-Process Guard Isolation:** Slack webhooks are **never** called from the protected AI agent process. Outbound notifications are stored in a local SQLite table (`slack_notifications`).
3. **Dedicated Egress Relay:** A separate worker process (`clarix.slack.relay`) handles delivery exclusively when external network access is authorized (`CLARIX_SLACK_RELAY_ENABLED=true`).
4. **Strict Air-Gap Hold:** When operating in strict air-gap mode (`CLARIX_AIRGAP_ENFORCE=true`) without relay authorization, external delivery is blocked and alerts remain queued safely in the database.
5. **Secret Redaction:** Bearer tokens, API keys (`sk-...`), passwords, private keys, and confidential file paths are scrubbed from message text.
6. **Zero Webhook Leakage:** The raw Slack webhook secret is stored exclusively on the backend and is always masked in frontend responses (`https://hooks.slack.com/services/T.../***`).

### Automated Event Triggers (9 Categories)
1. **Prompt Injection Detected:** Adversarial prompt patterns or overrides detected.
2. **Malicious Prompt Blocked:** Scanned prompt rejected before LLM inference.
3. **Critical Tool Execution Blocked:** Unauthorized tool or command blocked by policy.
4. **Human Approval Requested:** Suspended action awaiting operator authorization.
5. **Human Approval Granted:** Operator approved execution.
6. **Human Approval Denied:** Operator denied execution or TTL expired.
7. **Unauthorized Network Connection Blocked:** Air-gap guard intercepted egress attempt.
8. **Security Policy Changed:** Policy enabled or disabled by administrator.
9. **Critical Security Event Recorded:** High-risk audit ledger commitment.

---

## Localhost Quickstart

### Prerequisites
- **Node.js** (v18+) and **npm**
- **Python** (3.10+)
- **Ollama** installed locally (`ollama serve`)

---

### Step 1: Start Local Ollama
```bash
ollama serve
# Pull the default chat and embedding models:
ollama pull qwen3:4b
ollama pull nomic-embed-text
```

---

### Step 2: Start the Backend Service
```bash
cd clarix-backend

# Install dependencies
pip install -r requirements.txt

# Copy environment variables
cp .env.example .env

# Verify host air-gap posture and configuration
python -m clarix --check

# Start the production FastAPI server (runs on http://127.0.0.1:8000)
python -m clarix
```

---

### Step 3: Start the Frontend Console
In a separate terminal:
```bash
cd Clarix-AI

# Install dependencies
npm install

# Start Vite development server (runs on http://127.0.0.1:5173)
npm run dev
```

Open `http://127.0.0.1:5173` in your browser to access the console.

---

### Step 4: (Optional) Run the Slack Relay Worker
To deliver queued notifications to an authorized Slack channel:
```bash
cd clarix-backend
python -m clarix.slack --daemon --interval 3.0 --relay-enabled
```

---

## Configuration & Environment Variables

### Backend Environment (`clarix-backend/.env`)

```ini
# Host Exposure (loopback only)
CLARIX_HOST=127.0.0.1
CLARIX_PORT=8000

# Storage
CLARIX_DATA_DIR=./data

# Ollama LLM (must point to loopback)
CLARIX_OLLAMA_URL=http://127.0.0.1:11434
CLARIX_DEFAULT_MODEL=qwen3:4b
CLARIX_EMBED_MODEL=nomic-embed-text
CLARIX_EMBED_BACKEND=auto

# Security & Invariants
CLARIX_AIRGAP_ENFORCE=true
CLARIX_APPROVAL_TIMEOUT_S=300
CLARIX_RATE_LIMIT_PER_MIN=60

# Slack Integration (Disabled by default)
CLARIX_SLACK_ENABLED=false
CLARIX_SLACK_WEBHOOK_URL=
CLARIX_SLACK_CHANNEL=#security-alerts
CLARIX_SLACK_RELAY_ENABLED=false
CLARIX_SLACK_RELAY_INTERVAL_S=3.0
```

### Frontend Environment (`.env.local`)
```ini
VITE_USE_MOCKS=false
VITE_API_URL=http://127.0.0.1:8000
VITE_OLLAMA_URL=http://localhost:11434
```

---

## API Specification Reference

All endpoints return JSON. In live mode, requests require bearer tokens if `CLARIX_API_TOKEN` is configured.

| Endpoint | Method | Description |
|---|---|---|
| `/health` | `GET` | Public health, guard status, and node uptime. |
| `/api/overview` | `GET` | SOC dashboard summary, metrics, and event activity. |
| `/api/agent/chat` | `POST` | Execute prompt through the security pipeline & tool sandbox. |
| `/api/security/threats` | `GET` | List recorded prompt injection threats and forensic timelines. |
| `/api/security/analyze` | `POST` | Analyze prompt with injection heuristic scanner. |
| `/api/security/monitor` | `GET` | Hourly SOC decision metrics and event stream. |
| `/api/airgap` | `GET` | Real-time egress telemetry, connection posture, and blocked log. |
| `/api/airgap/probe` | `POST` | Safely test egress guard with an outbound probe attempt. |
| `/api/policies` | `GET` | List security policies POL-001 through POL-005. |
| `/api/policies/{id}` | `PATCH` | Enable or disable a policy toggle. |
| `/api/tools` | `GET` | List registered tools and permission levels. |
| `/api/tools/{id}/permission` | `PUT` | Update tool execution permission level. |
| `/api/tools/{id}/execute` | `POST` | Execute tool through policy engine and local sandbox. |
| `/api/approvals` | `GET` | List pending and resolved human approval requests. |
| `/api/approvals/{id}/resolve`| `POST` | Approve or deny a pending action. |
| `/api/rag/documents` | `GET` | List indexed local documents. |
| `/api/rag/ingest` | `POST` | Ingest and classify document into local vector store. |
| `/api/rag/query` | `POST` | Semantic search over local documents. |
| `/api/audit` | `GET` | Tamper-evident audit ledger with SHA-256 chain. |
| `/api/audit/verify` | `GET` | Recompute and cryptographically verify audit ledger. |
| `/api/slack/status` | `GET` | Slack integration state, connection status, queue metrics. |
| `/api/slack/config` | `POST` | Configure Slack webhook URL and channel. |
| `/api/slack/config` | `DELETE` | Clear Slack credentials and disable integration. |
| `/api/slack/test` | `POST` | Dispatch isolated test alert to Slack webhook. |
| `/api/slack/preferences` | `GET` | Retrieve category notification toggles. |
| `/api/slack/preferences` | `PUT` | Update category notification preferences. |
| `/api/slack/history` | `GET` | View Slack notification delivery history. |

---

## Automated Testing & Verification

Run the complete backend test suite:
```bash
cd clarix-backend
python -m pytest tests/
```
**Results:** **150 passed, 1 skipped in 97.5s**

Run frontend build verification:
```bash
cd Clarix-AI
npm run build
```
**Result:** **Compiled clean in 9.3s**

---

## Documentation Library

Detailed documentation manuals are available in the [`docs/`](./docs) directory:
- [00_MASTER_INDEX.md](./docs/00_MASTER_INDEX.md): Complete architecture documentation index.
- [01_EXECUTIVE_AND_SECURITY_SUMMARY.md](./docs/01_EXECUTIVE_AND_SECURITY_SUMMARY.md): Executive summary and threat model.
- [02_SYSTEM_ARCHITECTURE.md](./docs/02_SYSTEM_ARCHITECTURE.md): Deep-dive system architecture.
- [03_FRONTEND_DEVELOPER_GUIDE.md](./docs/03_FRONTEND_DEVELOPER_GUIDE.md): React/TypeScript UI component guide.
- [04_BACKEND_AND_SECURITY_INTERNALS.md](./docs/04_BACKEND_AND_SECURITY_INTERNALS.md): Backend internals, policies, and sandboxing.
- [05_AIRGAP_OS_DEPLOYMENT_GUIDE.md](./docs/05_AIRGAP_OS_DEPLOYMENT_GUIDE.md): OS kernel hardening (iptables, nftables, pf).
- [06_API_SPECIFICATION_REFERENCE.md](./docs/06_API_SPECIFICATION_REFERENCE.md): Complete REST API documentation.
- [07_RAG_AND_LOCAL_LLM_PIPELINE.md](./docs/07_RAG_AND_LOCAL_LLM_PIPELINE.md): Local Ollama and RAG pipeline.
- [08_TESTING_AND_VERIFICATION_MANUAL.md](./docs/08_TESTING_AND_VERIFICATION_MANUAL.md): Testing procedures and benchmarks.
- [09_OPERATIONS_AND_ADMIN_GUIDE.md](./docs/09_OPERATIONS_AND_ADMIN_GUIDE.md): Production SOC administration guide.

---

## License

Confidential & Proprietary — Clarix AI Air-Gapped Security Architecture.
