# 01 — Executive & Security Summary

## 1. Executive Summary

**Clarix AI** is an air-gapped, zero-trust artificial intelligence execution platform designed for high-security environments, critical infrastructure, defense, healthcare, and enterprise research labs. 

Most modern AI solutions rely on external cloud APIs (e.g., OpenAI, Anthropic, Google Cloud) or assume an unconstrained host network environment. In contrast, Clarix AI is engineered from the ground up for environments with **strict physical or logical network isolation (Air-Gap)** where no data may leave the perimeter under any circumstances.

### Core Value Proposition

1. **Complete Perimeter Containment**: Ensures that all AI model inference, embeddings, vector storage, and document processing execute strictly on local hardware (via local Ollama on loopback `127.0.0.1:11434`).
2. **Deterministic Zero-Trust Governance**: Operates under the assumption that LLM outputs cannot be inherently trusted. Every tool call and document access is filtered through deterministic security policies (POL-001 through POL-005) before execution.
3. **Cryptographic Proof of Integrity**: Implements an immutable, append-only SHA-256 hash-chained audit ledger directly in SQLite, guaranteeing tamper-evident records of all user and agent actions.
4. **Human-in-the-Loop Safeguards**: High-risk actions and access to classified materials trigger synchronous cryptographic approval requests with atomic Compare-and-Set (CAS) resolution and automated expiration.
5. **Air-Gap Defense-in-Depth**: Combines in-process socket interception with operating system packet filters (`iptables`, `nftables`, `pf`) and systemd security boundaries.

---

## 2. Threat Model & Philosophy

### Zero-Trust Principle for Generative AI
Generative AI models are stochastic, susceptible to prompt injection, hallucination, and adversarial exploitation. Clarix AI enforces a strict boundary between the **AI reasoning engine** and the **underlying OS / data assets**:

* The **Model** is treated as an untrusted client requesting actions.
* The **Frontend** is treated as an observation and input console, not a security boundary.
* The **Backend & OS** form the sole authoritative security enforcement points.

### Threat Scenarios Mitigated

| Threat Vector | Attack Mechanism | Clarix AI Defense Mechanism |
|---|---|---|
| **Direct Prompt Injection** | Malicious inputs designed to override system instructions | Normalizing keyword & pattern screening + restricted execution mode (tools disabled if risk score > 35). |
| **Indirect Prompt Injection** | Hidden payload embedded in untrusted external documents/PDFs | Ingestion scanner quarantines flagged chunks; retrieval scanner re-checks passages before model ingestion. |
| **Data Exfiltration via Tool Calls** | Model attempts to send sensitive tokens over HTTP/DNS/email | In-process Egress Guard blocks all non-loopback sockets at Python level; OS firewall drops external packets at kernel level; network tools (`sock`, `mail`, `http`) are permanently locked. |
| **Confidential Data Leaks (Taint)** | Model attempts to write confidential internal document data to disk or tools | Taint tracking flags sensitive tokens; POL-005 blocks writing tainted data outside the sandbox workspace or to network sinks. |
| **Path Traversal / Secret Reading** | Model attempts to access `.env`, SSH keys, or system `/etc/` paths | Strict `realpath` containment verifies paths remain within `./data/workspace`; POL-002 rejects sensitive directory patterns. |
| **Silent Audit Tampering** | Attacker or rogue process attempts to delete or modify audit records | SQLite triggers prevent `UPDATE` and `DELETE`; every record is chained to the previous hash (`SHA-256(prev_hash + record)`); external head hash anchoring. |
| **Unauthorized Action Execution** | Automated execution of destructive commands | POL-004 halts execution and demands human cryptographic approval; atomic CAS prevents double resolution; 300s timeout auto-cancels. |

---

## 3. "What Enforces What" Matrix

A foundational principle of Clarix AI is architectural transparency: understanding exactly where security guarantees are enforced and where their limits lie.

| Property | Enforced By | Security Strength | Theoretical Limit / Boundary |
|---|---|---|---|
| **Server only reachable from host** | Config check (`Settings.host == '127.0.0.1'`) | Strong software gate | Deliberately bypassable with `CLARIX_ALLOW_NON_LOOPBACK=1`. |
| **Local Ollama Only** | Config & URL validation | Strong software gate | Loopback destination verified on startup and per-client probe. |
| **No outbound connections from backend** | In-process socket monkey-patch (`clarix/airgap/guard.py`) | Application Layer | Intercepts all Python-level calls (`socket.connect`, `sendto`, `getaddrinfo`). Does not prevent non-Python native binaries or root actions. |
| **Complete host network isolation** | OS Kernel: `iptables`, `nftables`, `pf`, or systemd `IPAddressDeny=any` | Kernel Layer (Absolute) | Physical disconnect or kernel packet filter. The backend observes and reports host posture. |
| **Network tools permanently disabled** | Invariant lock in `ToolRuntime` + omission of network executors | Code Invariant | Tools `sock`, `mail`, and `http` have `air_gap_locked=True` and cannot be enabled even by admin policy toggles. |
| **File containment in workspace** | Path resolution (`realpath` containment checking) | Code Invariant | Confines reads/writes strictly within `./data/workspace/`. Not a container/chroot. |
| **Safe Mathematical Computation** | Python AST allow-list parser | Code Invariant | No use of Python `eval()` or `exec()`. Restricts expressions to basic arithmetic with size and exponent caps. |
| **Database Read-Only Safety** | Dedicated read-only SQLite handle + SQLite Authorizer allow-list | Code Invariant | Prevents DDL/DML; table authorizer hides internal embeddings table from model queries. |
| **Safe Shell Execution** | Whitelist binary dispatch, `shell=False`, argument inspection | Code Invariant | Prohibits shell expansion, command chaining (`;`, `\|`, `&&`), and arbitrary binaries. Shell commands always require approval. |
| **Confidential Data Sinks** | Taint engine + POL-005 evaluation | Policy Layer | Stops classified tokens from reaching tool sinks. Network sinks remain hard-locked regardless of policy toggle. |
| **Human Operator Approval** | State engine with atomic Compare-and-Set and 300s TTL | Code Logic | Identity strength depends on token configuration (`CLARIX_OPERATOR_TOKENS`). Dev mode has no token auth. |
| **Immutable Audit Log** | SQLite triggers + SHA-256 hash chaining | Cryptographic Tamper-Evidence | Someone with direct root SQLite write access could drop triggers. Tamper-evidence requires periodic external anchoring of `GET /api/audit/head`. |
| **Prompt Injection Detection** | Normalizing regex pattern scanner | Heuristic Defense | Heuristics can be bypassed by creative paraphrasing. Serves as early filtering; structural sandbox gates provide the real defense. |

---

## 4. Compliance & Audit Readiness

Clarix AI is structured to align with key air-gap and high-assurance cybersecurity standards:
* **NIST SP 800-53 Rev. 5**: AC-3 (Access Enforcement), AC-4 (Information Flow Enforcement), AU-2/AU-9 (Audit Event Protection & Integrity), SC-7 (Boundary Protection).
* **DoD Zero Trust Strategy**: Explicit verification, least privilege access, assume breach, inspection of all transactions.
* **ISO/IEC 27001**: A.12.1 (Operational procedures), A.12.4 (Logging and monitoring), A.13.1 (Network security management).
