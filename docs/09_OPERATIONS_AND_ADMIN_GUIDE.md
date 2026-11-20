# 09 — Operations & Admin Guide

## 1. Quickstart: Installation & First Run

### Step 1: Backend Setup
```bash
cd clarix-backend

# 1. Create Python virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Create configuration file
cp .env.example .env

# 4. Run system self-check
python3 -m clarix --check

# 5. Start the backend service
python3 -m clarix
```
*The backend starts at `http://127.0.0.1:8000` (interactive API docs available at `/docs` in dev mode).*

---

### Step 2: Frontend Setup
```bash
# In the root repository directory:
npm install

# Configure live mode in .env.local
cat << 'EOF' > .env.local
VITE_USE_MOCKS=false
VITE_API_URL=http://127.0.0.1:8000
EOF

# Start Vite dev server
npm run dev
```
*Open `http://localhost:5173` in your browser. The console connects directly to the live backend.*

---

## 2. Environment Variables Reference

### Backend Configuration (`clarix-backend/.env`)

| Variable | Default Value | Description |
|---|---|---|
| `CLARIX_HOST` | `127.0.0.1` | Network interface to bind. Must be loopback unless overridden. |
| `CLARIX_PORT` | `8000` | Port for the HTTP API server. |
| `CLARIX_DATA_DIR` | `./data` | Directory for SQLite database, workspace files, and RAG index. |
| `CLARIX_OLLAMA_URL` | `http://127.0.0.1:11434` | Loopback address of the local Ollama daemon. |
| `CLARIX_DEFAULT_MODEL`| `llama3` | Default local LLM model for general agent conversations. |
| `CLARIX_EMBED_MODEL` | `nomic-embed-text` | Primary local embedding model for vector search. |
| `CLARIX_EMBED_BACKEND`| `auto` | `auto` (prefers Ollama, falls back to lexical), `ollama`, or `hash`. |
| `CLARIX_API_TOKEN` | *empty* | Single global bearer token for API access. |
| `CLARIX_OPERATOR_TOKENS`| *empty* | Multi-operator token map (e.g., `alice:tok123,bob:tok456`). |
| `CLARIX_APPROVAL_TIMEOUT_S`| `300` | Expiration time (seconds) for pending human approval requests. |
| `CLARIX_AIRGAP_ENFORCE`| `1` | Enable/disable in-process outbound socket monkey-patch. |
| `CLARIX_DEMO_ENDPOINTS`| `1` | Enables `/api/approvals/simulate` for demo testing. |
| `CLARIX_RATE_LIMIT_PER_MIN`| `60` | Maximum requests per minute per IP address. |
| `CLARIX_MAX_UPLOAD_BYTES`| `20971520` (20 MB) | Maximum document upload size for RAG ingestion. |

### Frontend Configuration (`.env.local`)

| Variable | Default Value | Description |
|---|---|---|
| `VITE_USE_MOCKS` | `true` | `true` = offline browser simulation mode; `false` = live backend. |
| `VITE_API_URL` | `http://127.0.0.1:8000` | URL of the live Clarix backend API. |
| `VITE_API_TOKEN` | *empty* | Bearer token passed in the `Authorization` header to the backend. |

---

## 3. Production Operations & Hardening

### A. Configuring Named Operator Tokens
In multi-operator environments, never share tokens. Configure `CLARIX_OPERATOR_TOKENS`:
```bash
export CLARIX_OPERATOR_TOKENS="ciso_alice:secretTokenA99,analyst_bob:secretTokenB88"
```
When an operator approves or denies a high-risk request, their specific username (`ciso_alice`) is immutably committed into the cryptographic audit record.

### B. Periodic Audit Head Anchoring
To maintain external non-repudiation of the SQLite audit chain, run a periodic cron task or scheduled job:
```bash
HEAD_HASH=$(curl -s -H "Authorization: Bearer secretTokenA99" http://127.0.0.1:8000/api/audit/head | jq -r .head_hash)
echo "$(date -u) : $HEAD_HASH" >> /mnt/secure-external-media/audit_anchors.log
```

### C. Database Backup & Workspace Maintenance
The entire state of Clarix AI resides inside `CLARIX_DATA_DIR` (`./data`):
* `clarix.db`: Contains policies, tools state, documents, chunk vectors, and the audit ledger.
* `workspace/`: Isolated directory where sandboxed tools read and write permitted artifacts.

To perform a clean backup of SQLite without interrupting the running service:
```bash
sqlite3 data/clarix.db ".backup 'data/clarix-backup-$(date +%F).db'"
```

---

## 4. Frequently Asked Questions (FAQ)

#### Q: Why does the Air-Gap page show "NOT ISOLATED"?
A: The backend probes system network interfaces via `psutil`. If an active network interface has a non-loopback IP address and a default gateway, Clarix reports `NOT ISOLATED` to warn operators that the machine is currently plugged into a physical network. Apply the OS firewall scripts in `deploy/` to isolate the host.

#### Q: How can I change the local LLM model?
A: Set `CLARIX_DEFAULT_MODEL="mistral"` (or any model already pulled in Ollama) in your `.env` file and restart the backend.

#### Q: Can Clarix run completely without internet during installation?
A: Yes! On a connected machine, download the Python wheels (`pip download -r requirements.txt -d wheels/`) and npm packages, transfer them to the air-gapped machine via USB or optical media, and install locally without external network access.
