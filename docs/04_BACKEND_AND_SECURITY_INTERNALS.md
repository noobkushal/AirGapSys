# 04 — Backend & Security Internals

## 1. Backend Architecture Overview

The Clarix AI backend is written in Python (3.10+) with a dual-server design:

1. **Production Engine**: FastAPI + Uvicorn with ASGI routing, JSON schema serialization, and connection pooling.
2. **Zero-Dependency Fallback (`--server stdlib`)**: A native Python HTTP server (`clarix/web/stdlib_server.py`) using only standard libraries (`http.server`, `urllib`, `sqlite3`). This allows Clarix AI to run even in bare-metal air-gapped environments where installing Python wheels/dependencies via pip is prohibited or impossible.

---

## 2. In-Process Egress Guard (`clarix/airgap/guard.py`)

To ensure that neither the AI agent nor third-party Python packages can open external network connections, Clarix patches Python's foundational `socket` library at startup:

### Intercepted Methods
* `socket.socket.connect`
* `socket.socket.connect_ex`
* `socket.socket.sendto`
* `socket.getaddrinfo`
* `socket.gethostbyname`
* `socket.gethostbyname_ex`

### Guard Logic
```python
def guarded_connect(sock, address):
    host, port = extract_host_port(address)
    if not is_loopback_host(host):
        # 1. Record egress attempt in telemetry database
        record_airgap_violation(host=host, port=port, subsystem=get_subsystem())
        # 2. Append violation to SHA-256 audit ledger
        audit_log.append(
            user="guard", action=f"Blocked socket connection to {host}:{port}",
            component="airgap_guard", risk="CRITICAL", decision="BLOCK", classification="RESTRICTED"
        )
        # 3. Raise OS exception before any packet reaches the NIC
        raise AirGapViolation(errno.EPERM, f"Air-gap policy blocks outbound connection to {host}:{port}")
    return original_connect(sock, address)
```

> **Security Note**: This in-process guard provides Defense-in-Depth at the runtime application layer. Host-level packet filters (`iptables`, `nftables`) must also be enabled to prevent native C libraries or sub-processes from bypassing the Python interpreter.

---

## 3. Deterministic Policy Engine (`clarix/security/policy.py`)

Clarix uses a deterministic policy engine evaluated before any tool call or document access:

### Policy Catalog

| Policy ID | Name | Category | Rules & Description |
|---|---|---|---|
| **POL-001** | No Internet Access | Network | Deny all outbound TCP/UDP to non-loopback addresses. Drops external DNS queries. Blocks external URLs in tool arguments. |
| **POL-002** | Sensitive File Protection | Data | Blocks access to `.env`, `.ssh`, `.aws`, `/etc/`, `/root/`, and system paths. Enforces workspace sandbox. Requires approval for CONFIDENTIAL/RESTRICTED data. |
| **POL-003** | Tool Least Privilege | Tools | Restricts tool execution to whitelisted commands. Denies unauthorized subprocess spawning. Disables tools set to `BLOCKED`. |
| **POL-004** | Human Approval for High Risk | Approval | Halts execution pipeline and opens cryptographic approval request for any action marked `HIGH` or `CRITICAL` risk. |
| **POL-005** | Prevent External Data Transfer | Network | Prevents tainted or classified tokens from reaching tool sinks (e.g., mail, http, raw sockets). Blocks external exports. |

### Evaluation Order
Decisions follow a strict hierarchical precedence:
$$\text{BLOCK} \succ \text{REQUIRE\_APPROVAL} \succ \text{ALLOW}$$
If any enabled policy returns `BLOCK`, the action is unconditionally halted and recorded as a violation.

---

## 4. Sandboxed Tool Execution (`clarix/tools/`)

### A. Safe Calculator (`calc`)
To eliminate remote code execution vulnerabilities via `eval()`, Clarix evaluates mathematical expressions through an Abstract Syntax Tree (AST) allow-list parser:
* Permitted AST nodes: `ast.Expression`, `ast.BinOp`, `ast.UnaryOp`, `ast.Constant`.
* Permitted operators: `+`, `-`, `*`, `/`, `//`, `%`, `**` (capped at exponent 100 to prevent DoS).
* Disallowed: Function calls, attribute lookups, variable names, loops, list comprehensions.

### B. Read-Only SQLite Database (`db`)
Queries run against a dedicated read-only database connection with SQLite Authorizers:
```python
def db_authorizer(action_code, arg1, arg2, db_name, trigger_name):
    # Prohibit any DDL/DML write operations
    if action_code in (sqlite3.SQLITE_INSERT, sqlite3.SQLITE_UPDATE, sqlite3.SQLITE_DELETE):
        return sqlite3.SQLITE_DENY
    # Prevent model from inspecting internal embeddings vector table
    if action_code == sqlite3.SQLITE_READ and arg1 == "rag_embeddings":
        return sqlite3.SQLITE_IGNORE
    return sqlite3.SQLITE_OK
```

### C. Whitelisted Shell (`shell`)
* `shell=False` is strictly enforced to prevent shell expansion, pipe chaining (`|`), or redirection (`>`).
* Executable commands are restricted to a safe inspection whitelist: `uptime`, `whoami`, `uname -a`, `df -h`, `date`.
* Execution always requires explicit human approval under POL-004.

### D. Filesystem Path Containment (`fs`)
Prevents path traversal attacks (`../../`) and symlink escapes:
```python
def resolve_sandboxed_path(workspace: Path, user_path: str) -> Path:
    target = (workspace / user_path).resolve()
    # Ensure canonical realpath is strictly within workspace
    if not target.is_relative_to(workspace.resolve()):
        raise PermissionError(f"Path traversal detected: {user_path} escapes sandbox")
    return target
```

---

## 5. Tamper-Evident SHA-256 Audit Ledger (`clarix/audit.py`)

All system activities (prompts, tool calls, policy decisions, approvals, and egress blocks) are committed to an append-only, cryptographically linked SQLite table.

### Cryptographic Chaining Formula
$$\text{Hash}_0 = \text{"0"}^{64} \quad (\text{Genesis Hash})$$
$$\text{Hash}_n = \text{SHA-256}\Big(\text{Hash}_{n-1} + \text{CanonicalJSON}(\text{Record}_n)\Big)$$

The `CanonicalJSON` function formats every field in deterministic key-sorted order with no whitespace (`separators=(',', ':')`). If an adversary modifies even a single character in an old audit event, all subsequent hashes in the chain become invalid.

### SQLite Database Triggers
```sql
CREATE TRIGGER IF NOT EXISTS audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
    SELECT RAISE(FAIL, 'Clarix Audit Ledger is append-only: UPDATE is forbidden');
END;

CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
    SELECT RAISE(FAIL, 'Clarix Audit Ledger is append-only: DELETE is forbidden');
END;
```

### External Head Anchoring
Because a local root attacker could theoretically drop the database triggers, security administrators should regularly poll `GET /api/audit/head` and mirror the latest hash to an external immutable medium (e.g., optical WORM drive or paper ledger).

---

## 6. Human Approval State Machine (`clarix/approvals.py`)

High-risk actions require human authorization:
1. **Suspend**: The agent execution pipeline halts, creating a pending request record with a unique UUID, action metadata, risk rating, and expiration timestamp (current time + 300 seconds).
2. **Atomic Resolution (Compare-and-Set)**:
   ```sql
   UPDATE approvals 
   SET status = :new_status, resolved_by = :operator, resolved_at = :now
   WHERE id = :id AND status = 'PENDING' AND expires_at > :now
   ```
   This atomic query prevents race conditions and ensures that no approval can be resolved twice.
3. **Resume / Cancel**: If approved, the agent resumes execution. If denied or if 300 seconds elapse, the action is cancelled and an audit event is recorded.
