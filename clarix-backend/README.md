# Clarix AI — backend

Policy-enforced, air-gap-oriented backend for the Clarix console: prompt-injection screening, taint tracking,
policy engine, tool permissions with sandboxed execution, human approval with real suspend/resume, tamper-evident
SHA-256 audit ledger, local RAG, Ollama integration, host air-gap monitoring and telemetry.

Python 3.10+ · stdlib SQLite · `psutil` · FastAPI/uvicorn for serving. Ollama is reached over loopback only.

```bash
python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
cp .env.example .env            # then export the variables (or use a systemd EnvironmentFile)
python3 -m clarix --check       # config, host air-gap posture, Ollama reachability, ledger check
python3 -m clarix               # http://127.0.0.1:8000  (docs at /docs when no token is configured)
python3 -m unittest discover -s tests -t . -v
```
`python3 -m clarix --server stdlib` runs the same routes on a dependency-free server (development fallback).

Frontend: set `VITE_USE_MOCKS=false` and `VITE_API_URL=http://localhost:8000` in the frontend's `.env.local`.

## What enforces what (read this before trusting it)

| Property | Enforced by | Strength | Limit |
|---|---|---|---|
| Server reachable only from this host | Refuses to start on a non-loopback `CLARIX_HOST` | Config check | `CLARIX_ALLOW_NON_LOOPBACK=1` overrides it deliberately |
| Ollama is local | Refuses a non-loopback `CLARIX_OLLAMA_URL`; client re-checks | Config check | |
| No outbound connections from this process | In-process guard on `socket.connect/connect_ex/sendto/getaddrinfo/gethostbyname`; refuses **before** any DNS query or packet, logs + audits every attempt | Stops the agent, tools and any Python library it calls | Not a firewall: native code, other processes and root bypass it |
| Host really is isolated | **OS only**: `deploy/nftables-airgap.conf`, `iptables-airgap.sh`, `pf-airgap.conf`, systemd `IPAddressDeny=any`, or a physical disconnect | Kernel | Untested here (see below). The app only *observes* and reports posture |
| Network tools can never run | Hard lock in `ToolRuntime` (independent of policy toggles) + no executor exists | Code invariant | |
| File reads stay in the workspace | `realpath` containment (symlink + `..` safe) in the executor | Code invariant, independent of POL-002 | Not a chroot/container |
| Calculator is safe | `ast` allow-list evaluator, size/exponent caps (no `eval`) | Code invariant | |
| DB tool is read-only | Separate read-only connection + `query_only` + SQLite authorizer allow-list of tables/columns (embeddings hidden) | Code invariant | |
| Shell tool | Allow-list of inspection commands, `shell=False`, metacharacters rejected, always needs approval | Code invariant | |
| Confidential data can't reach sinks | Taint context + POL-005, evaluated for every proposed tool call | Policy | A disabled policy stops enforcing: network sinks stay blocked by the hard lock regardless |
| Risky actions need a human | `REQUIRE_APPROVAL` suspends the exact action; approve resumes it (re-checked against policy); deny/expiry (300 s) cancels; atomic compare-and-set prevents double resolution | Code | Identity is only as strong as your tokens (`CLARIX_OPERATOR_TOKENS`); dev mode has none |
| Audit can't be silently edited | Append-only triggers + hash chain over **every** field (`SHA-256(prev + canonical)`); `/api/audit/verify` recomputes from fields | Tamper-**evident** | Someone with DB write access can drop triggers and rewrite the *whole* chain. **Anchor `GET /api/audit/head` somewhere they can't reach** |
| Prompt injection detection | Normalising pattern detector (unicode/zero-width/spaced letters/base64) | **Weak by nature** | Paraphrases evade it (there is a test documenting that). It is one layer; the gates above are the real protection |
| Indirect injection in documents | Chunks scanned at ingest (quarantined, never retrieved) and again at retrieval; tool output scanned before the model sees it | Heuristic | Same limits as above |

## API (all JSON; errors are `{"error":{"code","message"}}`)

`GET /health` (public) · `GET /api/overview` · `POST /api/agent/chat` · `GET /api/security/threats` · `POST /api/security/analyze` ·
`GET /api/security/monitor` · `GET /api/airgap` · `POST /api/airgap/probe` · `POST /api/taint/scenario` · `GET /api/policies` ·
`PATCH /api/policies/{id}` · `GET /api/tools` · `PUT /api/tools/{id}/permission` · `POST /api/tools/{id}/execute` ·
`GET /api/approvals` · `POST /api/approvals/{id}/resolve` · `POST /api/approvals/simulate` (demo flag) ·
`GET /api/rag/documents` · `POST /api/rag/ingest` (multipart `file` + `classification`) · `POST /api/rag/query` ·
`GET /api/ollama/status` · `POST /api/ollama/benchmark` · `GET /api/audit` (`/chain`, `/verify`, `/head`) · `GET /api/health` ·
`GET /api/slack/status` · `POST /api/slack/config` · `DELETE /api/slack/config` · `POST /api/slack/test` · `GET/PUT /api/slack/preferences` · `GET /api/slack/history`

Responses are shaped to the frontend's TypeScript types. Timestamps are **UTC**.

## Slack Integration & Outbound Relay Architecture

Clarix AI provides a secure, air-gap-respecting Slack notification subsystem:

```
+-------------------------------------------------------------+
|                CLARIX AI PROTECTED PROCESS                  |
|                                                             |
|  [Agent Core]  [Approvals]  [Policy Engine]  [Air-Gap Guard]|
|        |            |              |               |        |
|        +------------+--------------+---------------+        |
|                             |                               |
|                     [SlackService]                          |
|                             | (Sanitize & Deduplicate)      |
|                             v                               |
|            +--------------------------------+               |
|            |  Durable SQLite Queue Table    |               |
|            |      (slack_notifications)     |               |
|            +--------------------------------+               |
+-----------------------------|-------------------------------+
                              | (DB Polling)
                              v
+-------------------------------------------------------------+
|                ISOLATED SLACK RELAY WORKER                  |
|                 (python -m clarix.slack.relay)              |
|                                                             |
|  * Runs outside the in-process socket guard                 |
|  * Checks strict air-gap and relay authorization            |
|  * Delivers Block Kit alerts to hooks.slack.com:443         |
|  * Exponential backoff retries (max 3)                      |
+-------------------------------------------------------------+
```

### Air-Gap Guarantee
1. **In-Process Guard Intact:** The main Python process retains `guard.install(enforce=True)`. Even if compromised, internal code cannot connect to external IP addresses or domain names.
2. **Separated Egress:** Outbound delivery is delegated to an isolated relay worker with explicitly configured firewall rules.
3. **Strict Air-Gap Default:** If `CLARIX_SLACK_RELAY_ENABLED=false` or physical connectivity is severed, alerts safely accumulate in the SQLite table without data loss or application crashes.
4. **Credential Protection:** Slack webhook URLs are never returned over frontend REST APIs. They are masked as `https://hooks.slack.com/services/T.../***`.
5. **Content Redaction:** All outgoing payloads are scanned to strip API tokens, bearer keys, credentials, and sensitive file paths before being written to the queue.

## Agent chat commands: `/rag`

Type these in the AI Agent chat (or pick them from the menu that opens when you type `/`). They use your existing Local RAG; there is no second
RAG system and no separate chatbot.

| Command | What it does |
|---|---|
| `/rag list` | Documents indexed locally, with classification, page count and whether access is open, needs approval, or approved until a time |
| `/rag search <query>` | Matching passages with document name, location, classification and score. No model is called |
| `/rag ask <question>` | An answer written by your local model from your documents only, with `[n]` citations, a "Sources used" list, and an attribution summary |
| `/rag sources` | The sources behind your last `/rag search` or `/rag ask` in this chat tab |

**Locations:** PDFs show real page numbers (`p. 4`). `.txt`, `.md` and `.docx` have no real pages, so they show `section 3/12` instead of an invented page.

**Security is the same path as normal chat, not a bypass.** Commands are parsed on the server. Each one goes through: injection scan -> taint context ->
policy-gated retrieval (CONFIDENTIAL/RESTRICTED documents are withheld and a Human Approval request is opened; approving grants one hour of access) ->
local Ollama only -> secret redaction -> audit ledger (the question text is not written to the audit log). `/rag ask` has **no tool loop**, so a document or
the model cannot trigger tools through it. `/rag sources` re-checks access at view time, so a passage you could see earlier is hidden if the document was
reclassified or the approval expired. Sources are bound to the operator and the chat-tab session id.

**Evidence handling.** The model must cite numbered sources. The backend removes citations that point at sources that do not exist, counts how many sentences
carry a citation, retries once if the model ignored the format, and flags cited sentences that share little wording with their source (a lexical heuristic,
not a proof of support). If nothing relevant is retrieved, or the model answers `INSUFFICIENT_EVIDENCE`, the reply says so and no answer is invented.
Passages scoring under a floor, or under half of the best candidate's score, are not sent to the model.

**Tuning.** `CLARIX_RAG_MIN_SCORE_NEURAL` (default 0.30) and `CLARIX_RAG_MIN_SCORE_LEXICAL` (default 0.10) are starting points, **not calibrated** for your
embedding model. If good answers are being refused, lower them; if weak passages get through, raise them. The word-overlap fallback (`hash-lexical-v1`) finds
shared words only, so install `nomic-embed-text` for meaningful semantic search.

## Agent pipeline

ingress scan → block (no model call) or continue → taint context → policy-gated RAG (CONFIDENTIAL+ documents are *withheld* and an
approval is opened; approving grants one hour of access) → local LLM → tool-call loop (max 3; every call goes through permission → policy →
approval → sandbox → audit) → secret redaction → audit. A prompt scoring 35–59 runs in *restricted mode* (tools disabled).
Tool-call protocol: the model replies with one line `TOOL_CALL {"tool": "...", "input": "..."}`.

## Configuration

See `.env.example`. Dev mode (no token) is single-user and loopback-only and logs a warning. Set `CLARIX_API_TOKEN` or
`CLARIX_OPERATOR_TOKENS=alice:<token>,bob:<token>` for anything shared: the approving operator is taken from the token, never from a header.

## Models in an air-gapped host

Pull models on a connected staging machine (`ollama pull llama3`, `ollama pull nomic-embed-text`) and copy `~/.ollama/models`
onto the host. Run Ollama with `OLLAMA_HOST=127.0.0.1:11434`. Without the embedding model, ingestion falls back to a **lexical** hash
embedder and labels the document `hash-lexical-v1` (it is not semantic search).

## Tests and what they do and do not prove

`python3 -m unittest discover -s tests -t .` — 136 tests: audit chain & tamper detection, injection corpus (attacks + benign controls),
sandboxes (traversal, symlinks, SQL, shell, calculator abuse), policy/taint/approval semantics, the egress guard, RAG, the agent
pipeline against a fake Ollama, and the full HTTP API over real sockets including auth, CORS, limits and multipart upload. A contract test
parses the frontend's service files and fails if the backend lacks an endpoint the UI calls. Eight security properties were
mutation-tested (each deliberately broken once; the suite caught all eight).

Not exercised in the build environment: the **FastAPI adapter itself** (FastAPI is not installable there; it is a thin layer over the same
dispatcher the stdlib server tests cover, and was desk-checked against the FastAPI API), a **real Ollama** (a fake speaking the same HTTP
shapes was used), the **firewall/systemd files**, PDF text extraction, and non-Linux hosts. Do a first-run `python3 -m clarix --check`
and `deploy/verify_airgap.sh` on the target machine.
