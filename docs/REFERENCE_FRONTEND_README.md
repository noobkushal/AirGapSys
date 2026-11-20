# Clarix AI — Air-Gapped Secure AI Agent (frontend)

React 18 + TypeScript + Vite + React Router + Lucide + Recharts. Styling: global design tokens + CSS Modules.
The landing page from your original HTML lives at `/`; the 17-module console lives under `/overview` … `/settings`.

## Run

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # tsc -b && vite build
npm run preview
```

Fonts are self-hosted via `@fontsource` (no Google Fonts request), which an air-gapped host requires.

## Important: this is a UI, not a security boundary

Air-gap, policy, taint, approval and audit **enforcement must live in the FastAPI backend and the OS**
(firewall / iptables / pf, chroot, loopback-only Ollama). Everything the UI shows is mock data until the
backend exists, and is labelled as such ("SIMULATED DATA" chip, "sample data" pills, notices on the Air-Gap,
RAG and Prompt-Injection pages). The prompt-injection analyzer is a tiny keyword heuristic for demo purposes only.

What is genuinely real in the browser: SHA-256 hashing and chain verification (Web Crypto, over the demo ledger),
the safe calculator parser (no `eval`), JSON/CSV export, and the Settings "Test connection" probes.

## Structure

```
src/
  components/ layout/ navigation/ common/ dashboard/
  pages/        one file per module (17) + NotFound
  landing/      original landing page, ported to TSX
  hooks/        useHoverDrawer (drawer state machine), useAsync, useInterval, useLocalStorage
  services/     API layer (+ mock/db.ts). One file per backend domain
  state/        ConsoleContext (settings, badge counts, toasts, heartbeat)
  types/ utils/ styles/
```

## Clarix logo drawer (`hooks/useHoverDrawer.ts`)

Hover opens · cursor may cross from logo to drawer (280 ms grace) · leaving both closes · click pins · click again
unpins/closes · close button · outside pointer-down · Escape (returns focus to logo) · touch tap toggles ·
keyboard Enter/Tab works · page scroll locks only while pinned.

## Connecting the backend

1. Copy `.env.example` to `.env.local`, set `VITE_USE_MOCKS=false` and `VITE_API_URL`.
2. Each service in `src/services/*.ts` already contains the call to make, marked `BACKEND:`:

| UI | Endpoint expected |
|---|---|
| Overview | `GET /api/overview` |
| Agent chat | `POST /api/agent/chat` |
| Security monitor / threats / analyze | `GET /api/security/monitor`, `GET /api/security/threats`, `POST /api/security/analyze` |
| Air-gap | `GET /api/airgap`, `POST /api/airgap/probe` |
| Policies | `GET /api/policies`, `PATCH /api/policies/{id}` |
| Tools | `GET /api/tools`, `PUT /api/tools/{id}/permission`, `POST /api/tools/{id}/execute` |
| Approvals | `GET /api/approvals`, `POST /api/approvals/{id}/resolve` |
| RAG | `GET /api/rag/documents`, `POST /api/rag/ingest`, `POST /api/rag/query` |
| Ollama | `GET /api/ollama/status`, `POST /api/ollama/benchmark` |
| Audit / integrity | `GET /api/audit`, `GET /api/audit/chain` |
| Health | `GET /api/health` |
| Settings test | `GET /health` |

The browser should talk only to FastAPI; FastAPI talks to Ollama on `127.0.0.1:11434`.
Add CORS for the dev origin on the backend.

## Live mode (with the Clarix backend)

```bash
# backend (see ../clarix-backend/README.md)
python3 -m clarix
# frontend .env.local
VITE_USE_MOCKS=false
VITE_API_URL=http://127.0.0.1:8000
# VITE_API_TOKEN=...   only if the backend has CLARIX_API_TOKEN set
```
In live mode the console shows real data: observed host air-gap posture (Overview and Air-Gap pages show "NOT ISOLATED" if the host can reach
other networks), measured telemetry (`n/a` where a value cannot be measured), real file upload to RAG, server-side policy/permission changes,
and a SHA-256 chain the backend produced that your browser re-verifies with Web Crypto.

## Document commands in the agent chat

In **AI Agent**, type `/` for a menu: `/rag list`, `/rag search <query>`, `/rag ask <question>`, `/rag sources`. Answers show `[n]` citation chips and a sources
panel (document, page or section, classification, score, passage). In live mode the backend does the work with all security controls; in mock mode the same
commands are simulated over sample documents and clearly labelled as simulated. See `clarix-backend/README.md` for details.
