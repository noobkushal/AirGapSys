# 08 — Testing & Verification Manual

## 1. Test Suite Architecture

The Clarix AI backend features a comprehensive test suite of **136 automated unit, integration, and security invariant tests**:

```bash
cd clarix-backend
python3 -m unittest discover -s tests -t . -v
```

---

## 2. Test File Breakdown

| Test File | Tests Covered | Security Invariants Validated |
|---|---|---|
| `test_airgap.py` | Egress socket interception | Confirms `socket.connect`, `sendto`, `getaddrinfo` raise `AirGapViolation` on non-loopback destinations while allowing `127.0.0.1`. |
| `test_api.py` | Full REST API surface | Verifies route dispatch, Bearer token authorization, CORS headers, rate limiting, and multipart file upload handling. |
| `test_audit.py` | Cryptographic audit ledger | Verifies `hash = SHA-256(prev_hash + canonical)`, trigger blocks on `UPDATE`/`DELETE`, and tamper-evidence detection when modifying past rows. |
| `test_config.py` | Settings & `.env` parsing | Validates loopback-only defaults, parsing of quoted strings and comments, and rejection of non-loopback binding without explicit override. |
| `test_injection.py` | Prompt injection screening | Evaluates attack corpus (instruction override, unicode obfuscation, spaced characters, base64 payloads) against benign controls. |
| `test_policy_approvals.py`| Policies POL-001..005 | Checks deterministic policy evaluation, approval queue creation, atomic Compare-and-Set resolution, and 300s expiration logic. |
| `test_rag_agent.py` | AI Agent & Ollama mock | Simulates agent chat interactions against a loopback Ollama mock, tool call extraction, secret redaction, and restricted mode transitions. |
| `test_rag_commands.py` | Slash commands (`/rag`) | Tests `/rag list`, `/rag search`, `/rag ask`, and `/rag sources` for citation correctness, source access re-verification, and missing evidence handling. |
| `test_sandbox.py` | Tool isolation | Traversal defense (symlinks, `..`), calculator AST bounds (exponent cap, no `eval`), SQLite authorizer (no DDL/DML, embeddings hidden), and shell whitelist. |

---

## 3. Frontend-Backend Contract Testing

To guarantee seamless integration between the React frontend and the Python backend, `tests/test_api.py` includes an automated contract test:

1. Statically inspects all TypeScript service files in `src/services/*.ts`.
2. Extracts every endpoint pattern annotated with `// BACKEND: <METHOD> <PATH>`.
3. Asserts that the backend route table in `clarix/web/routes.py` implements every expected endpoint.
4. Fails the build immediately if the frontend requests an endpoint that the backend does not provide.

---

## 4. Mutation Testing & Security Invariant Proofs

Eight foundational security properties were subjected to mutation testing (deliberately broken in source code to confirm test suite detection):

1. **Air-gap guard bypassed**: Invariant test immediately fails.
2. **Audit table triggers disabled**: Chain modification test detects tampering.
3. **Canonical JSON key sort omitted**: Hash verification fails.
4. **Tool sandbox path escape permitted**: Traversal tests fail.
5. **Calculator `eval()` substituted for AST**: Code execution tests fail.
6. **SQLite Authorizer bypass for embeddings**: Schema isolation test fails.
7. **Human Approval resolved twice**: CAS concurrency test fails.
8. **CONFIDENTIAL document leaked without approval**: Policy POL-002 test fails.

---

## 5. Host Validation: `python3 -m clarix --check`

Before running Clarix AI in production, execute the integrated self-check tool:

```bash
python3 -m clarix --check
```

### Self-Check Output Example:
```text
[CHECK] Validating configuration ...
  ✓ Host is set to loopback (127.0.0.1:8000)
  ✓ Workspace directory exists (./data/workspace)
  ✓ Database initialized (./data/clarix.db)
[CHECK] Validating audit ledger integrity ...
  ✓ 142 events in audit_events; SHA-256 chain is valid
  ✓ SQLite append-only triggers are active
[CHECK] Validating local Ollama connection ...
  ✓ Ollama reachable at http://127.0.0.1:11434
  ✓ Model 'llama3' is available
  ✓ Model 'nomic-embed-text' is available
[CHECK] Validating in-process egress guard ...
  ✓ Socket patch active: non-loopback probe (1.1.1.1:53) successfully blocked
[RESULT] ALL CHECKS PASSED. Host is ready for air-gapped operation.
```
