"""Request handlers. Each takes (ctx, req) and returns JSON-serialisable data whose shape matches the
frontend's TypeScript types (camelCase)."""
from __future__ import annotations

import re
import threading
import time

from .airgap import guard, monitor
from .classification import norm_class
from .errors import ApiError, bad_request, forbidden, not_found, unavailable
from .llm.ollama import OllamaError, OllamaUnavailable
from .security import injection
from .security.taint import TaintContext
from .tools.registry import LEVELS, TOOLS
from .util import clock, utcstamp

_HOST = re.compile(r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$|^(\d{1,3}\.){3}\d{1,3}$", re.I)


def _str(body: dict, key: str, maxlen: int, required: bool = True) -> str:
    v = body.get(key)
    if v is None and not required:
        return ""
    if not isinstance(v, str) or (required and not v.strip()):
        raise bad_request(f"'{key}' must be a non-empty string")
    if len(v) > maxlen:
        raise bad_request(f"'{key}' exceeds {maxlen} characters")
    return v


def _event(e: dict) -> dict:
    kind = "BLOCKED" if e["decision"] == "BLOCK" else "AUDIT" if e["component"] in ("Audit", "Integrity") else "INFO" if e["decision"] == "REQUIRE_APPROVAL" else "SUCCESS"
    return {"id": e["id"], "time": e["timestamp"][11:], "source": e["component"], "message": e["action"], "kind": kind}


def _live_events(ctx) -> list[dict]:
    p = monitor.posture(guard.status())
    n = p["outbound"]
    ev = [{"id": "live-net", "time": clock(), "source": "Air-Gap Monitor", "kind": "INFO",
           "message": f"Host check: {'unknown' if n is None else n} non-loopback connection(s); posture {p['status']}"}]
    try:
        ver = ctx.ollama.version()
        ev.append({"id": "live-ollama", "time": clock(), "source": "Ollama Core", "kind": "SUCCESS", "message": f"Ollama {ver} reachable on loopback"})
    except OllamaUnavailable:
        ev.append({"id": "live-ollama", "time": clock(), "source": "Ollama Core", "kind": "BLOCKED", "message": "Ollama is not reachable on loopback"})
    return ev


# --------------------------------------------------------------------------- meta
def public_health(ctx, req):
    return {"status": "ok", "version": __import__("clarix").__version__, "authRequired": ctx.settings.auth_enabled,
            "airgapGuard": guard.status(), "uptimeS": int(time.time() - ctx.started)}


def overview(ctx, req):
    ctx.approvals.expire_stale()
    posture = monitor.posture(guard.status())
    try:
        ctx.ollama.version()
        ollama = {"status": "ONLINE", "note": f"{ctx.settings.default_model} on {ctx.settings.ollama_url.split('//')[-1]}"}
    except OllamaUnavailable:
        ollama = {"status": "OFFLINE", "note": "Not reachable on loopback"}
    pols = ctx.policy.view()
    since = time.time() - 86400
    buckets = []
    for i in range(6):
        lo = since + i * 14400
        r = ctx.db.one("SELECT COUNT(*) n, SUM(decision='BLOCK') b FROM requests WHERE component='agent' AND ts>=? AND ts<?", (lo, lo + 14400))
        buckets.append({"h": f"{int(clock(lo)[:2]):02d}h", "runs": r["n"], "blocked": r["b"] or 0})
    events = [_event(e) for e in reversed(ctx.audit.list(12))]
    return {"agent": {"status": "RUNNING", "note": "Request pipeline active"}, "ollama": ollama,
            "threats": ctx.threats.count(), "blocked": ctx.db.one("SELECT COUNT(*) n FROM audit_events WHERE decision='BLOCK'")["n"],
            "toolCalls": int(ctx.metrics.get("tool.calls")), "pendingApprovals": ctx.approvals.pending_count(), "auditEvents": ctx.audit.count(),
            "outbound": posture["outbound"], "activePolicies": sum(p["enabled"] for p in pols), "totalPolicies": len(pols),
            "events": _live_events(ctx) + events, "activity": buckets, "threatCats": ctx.threats.categories(),
            "airGap": {"status": posture["status"], "reasons": posture["reasons"]}}


# --------------------------------------------------------------------------- agent / security
_SESSION = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def agent_chat(ctx, req):
    b = req.json()
    sid = b.get("sessionId")
    if sid is not None and not (isinstance(sid, str) and _SESSION.match(sid)):
        raise bad_request("'sessionId' must be 8-64 letters, digits, '-' or '_'")
    return ctx.agent.chat(_str(b, "message", 4000), (b.get("model") if isinstance(b.get("model"), str) else None), req.operator, sid)


def threats(ctx, req):
    return ctx.threats.list()


def analyze(ctx, req):
    text = _str(req.json(), "input", injection.MAX_INPUT)
    v = injection.scan(text)
    ctx.metrics.inc("prompts.scanned")
    ctx.audit.append(user=req.operator, action=f"Classifier test: {v.category}", component="Prompt Injection", risk=v.risk_label,
                     decision=v.decision, classification=v.classification, payload=f"pi:analyze:{v.decision}")
    if v.decision == "BLOCK":
        ctx.slack.on_event(
            event_type="Malicious Prompt Blocked",
            category="prompt_injection",
            severity="CRITICAL",
            title=f"Malicious Prompt Detected ({v.category})",
            description=f"Prompt blocked by injection detector: {v.reason}",
            component="Prompt Injection",
            decision="BLOCK",
            event_id=f"PI-{int(time.time())}",
        )
        ctx.threats.record(category=v.category, input_text=text, reason=v.reason, risk=v.risk, status="BLOCKED", source="analyzer",
                           timeline=[{"step": "Ingress", "detail": "Submitted via analyzer", "ok": True}, {"step": "Scan", "detail": ", ".join(v.matched), "ok": False},
                                     {"step": "Policy", "detail": "Would be rejected before inference", "ok": False}])
    return v.to_dict()


def security_monitor(ctx, req):
    now = time.time()
    hourly = []
    for i in range(4, -1, -1):
        lo = (int(now) // 3600 - i) * 3600
        r = ctx.db.one("SELECT SUM(decision!='BLOCK') a, SUM(decision='BLOCK') b FROM requests WHERE ts>=? AND ts<?", (lo, lo + 3600))
        hourly.append({"h": clock(lo)[:5], "allowed": r["a"] or 0, "blocked": r["b"] or 0})
    return {"hourly": hourly, "events": _live_events(ctx) + [_event(e) for e in reversed(ctx.audit.list(15))]}


def airgap_get(ctx, req):
    log_rows = ctx.db.q("SELECT * FROM blocked_connections ORDER BY id DESC LIMIT 100")
    return {"series": ctx.telemetry.egress_series(), "posture": monitor.posture(guard.status()),
            "log": [{"time": clock(r["ts"]), "host": r["host"], "port": r["port"], "protocol": r["protocol"], "subsystem": r["subsystem"], "rule": r["rule"]} for r in reversed(log_rows)]}


def airgap_probe(ctx, req):
    b = req.json()
    host = _str(b, "host", 253).strip().lower()
    port = b.get("port", 443)
    if not _HOST.match(host) or not isinstance(port, int) or not (1 <= port <= 65535):
        raise bad_request("Provide a valid hostname/IPv4 address and port")
    if not guard.status()["installed"]:
        raise unavailable("The in-process air-gap guard is not installed, so a probe cannot be performed safely.", "guard_disabled")
    try:
        guard.probe(host, port)
    except ValueError as e:
        raise ApiError(422, "loopback_probe", str(e)) from None
    r = ctx.db.one("SELECT * FROM blocked_connections WHERE host=? ORDER BY id DESC LIMIT 1", (host,))
    return {"time": clock(r["ts"]), "host": r["host"], "port": r["port"], "protocol": r["protocol"], "subsystem": r["subsystem"], "rule": r["rule"]}


def taint_scenario(ctx, req):
    """Runs a REAL exfiltration attempt through the taint tracker and policy engine (no network traffic)."""
    t = TaintContext()
    t.absorb("LOCAL_DOCUMENT", "financial_report.pdf", "CONFIDENTIAL")
    t.absorb("RETRIEVED_DATA", "chunk #251", "CONFIDENTIAL")
    res = ctx.runtime.invoke("http", "http://example.com", actor=req.operator, taint=t, sink="http_post")
    return {"blocked": res.decision == "BLOCK", "policies": res.policies, "detail": res.output, "taintClassification": t.classification}


# --------------------------------------------------------------------------- policies / tools / approvals
def policies_list(ctx, req):
    return ctx.policy.view()


def policy_patch(ctx, req):
    pid = req.params["id"]
    if pid not in {p["id"] for p in ctx.policy.view()}:
        raise not_found(f"Policy {pid} not found")
    en = req.json().get("enabled")
    if not isinstance(en, bool):
        raise bad_request("'enabled' must be true or false")
    ctx.policy.set_enabled(pid, en)
    ctx.audit.append(user=req.operator, action=f"{'Enabled' if en else 'Disabled'} {pid}", component="Policy Engine", risk="LOW" if en else "HIGH",
                     decision="ALLOW", classification="INTERNAL", payload=f"policy:{pid}:{en}")
    ctx.slack.on_event(
        event_type="Security Policy Changed",
        category="policy_changes",
        severity="HIGH" if not en else "LOW",
        title=f"Security Policy {pid} {'Enabled' if en else 'Disabled'}",
        description=f"Policy {pid} was {'enabled' if en else 'disabled'} by {req.operator}.",
        component="Policy Engine",
        decision="ALLOWED",
        event_id=f"POL-CHG-{pid}",
    )
    return next(p for p in ctx.policy.view() if p["id"] == pid)


def tools_list(ctx, req):
    return ctx.tools.view(include_hidden=req.query.get("all") == "1")


def tool_permission(ctx, req):
    tid = req.params["id"]
    if tid not in TOOLS:
        raise not_found(f"Tool {tid} not found")
    level = _str(req.json(), "level", 20)
    if level not in LEVELS:
        raise bad_request(f"level must be one of {', '.join(LEVELS)}")
    try:
        ctx.tools.set_level(tid, level)
    except PermissionError as e:
        ctx.audit.append(user=req.operator, action=f"Refused: set {TOOLS[tid].name} to {level}", component="Tool Permission", risk="CRITICAL",
                         decision="BLOCK", classification="INTERNAL", payload=f"tool:{tid}:{level}:refused")
        raise forbidden(str(e), "air_gap_locked") from None
    ctx.audit.append(user=req.operator, action=f"Set {TOOLS[tid].name} permission to {level}", component="Tool Permission", risk=TOOLS[tid].risk,
                     decision="ALLOW", classification="INTERNAL", payload=f"tool:{tid}:{level}")
    return next(t for t in ctx.tools.view(True) if t["id"] == tid)


def tool_execute(ctx, req):
    tid = req.params["id"]
    if tid not in TOOLS:
        raise not_found(f"Tool {tid} not found")
    r = ctx.runtime.invoke(tid, _str(req.json(), "input", 2000, required=False), actor=req.operator)
    return {"output": r.output, "ok": r.ok, "ms": r.ms, "decision": r.decision, "approvalId": r.approval_id, "policies": r.policies}


def approvals_list(ctx, req):
    return ctx.approvals.list()


def approval_resolve(ctx, req):
    b = req.json()
    return ctx.approvals.resolve(req.params["id"], _str(b, "decision", 12), req.operator, b.get("note") if isinstance(b.get("note"), str) else None)


def approval_simulate(ctx, req):
    if not ctx.settings.demo_endpoints:
        raise not_found("Demo endpoints are disabled")
    return ctx.approvals.create(action="Export audit ledger snapshot to external storage (demo request)", tool="Local Database", resource="/sandbox/db/ledger.sqlite",
                                risk="CRITICAL", classification="RESTRICTED", requester="Agent Reasoning Core (demo)")


# --------------------------------------------------------------------------- RAG
def rag_documents(ctx, req):
    return ctx.rag.documents()


def rag_ingest(ctx, req):
    if req.files:
        fname, data = next(iter(req.files.values()))
        cls = req.form.get("classification", "")
    else:
        b = req.json()
        fname, cls = _str(b, "name", 120), _str(b, "classification", 20)
        data = _str(b, "text", ctx.settings.max_upload_bytes).encode("utf-8") if "text" in b else b""
        if not data:
            raise bad_request("Send a multipart 'file' upload, or JSON with 'name', 'classification' and 'text'")
    return ctx.rag.ingest(fname, data, cls, req.operator)


def rag_query(ctx, req):
    q = _str(req.json(), "q", 2000)
    try:
        return ctx.rag.search(q, k=5)
    except (OllamaUnavailable, OllamaError) as e:
        raise unavailable(f"Embedding model unavailable: {e}", "embedding_unavailable") from None


# --------------------------------------------------------------------------- Ollama
_ctx_len: dict[str, int] = {}
_ctx_lock = threading.Lock()


def _context_len(ctx, name: str) -> int:
    with _ctx_lock:
        if name in _ctx_len:
            return _ctx_len[name]
    n = 0
    try:
        for k, v in (ctx.ollama.show(name).get("model_info") or {}).items():
            if k.endswith(".context_length") and isinstance(v, int):
                n = v
    except (OllamaUnavailable, OllamaError):
        return 0
    with _ctx_lock:
        _ctx_len[name] = n
    return n


def ollama_status(ctx, req):
    m = ctx.metrics
    base = {"online": False, "version": "unreachable", "accel": "n/a", "speed": m.get("ollama.tps"), "total": int(m.get("inference.total")), "models": []}
    try:
        version, tags, loaded = ctx.ollama.version(), ctx.ollama.tags(), ctx.ollama.ps()
    except OllamaUnavailable:
        return base
    except OllamaError as e:
        return {**base, "version": f"error: {e}"}
    in_mem = {(x.get("name") or x.get("model")): x for x in loaded}
    vram = [x for x in loaded if x.get("size_vram")]
    accel = ("GPU offload (" + ", ".join(f"{round(100 * x['size_vram'] / x['size'])}% in VRAM" for x in vram if x.get("size")) + ")") if vram else ("CPU" if loaded else "n/a (no model loaded)")
    models = []
    for t in tags:
        name = t.get("name") or t.get("model") or "?"
        n, ms = m.get(f"inference.{name}.n"), m.get(f"inference.{name}.ms")
        models.append({"id": name, "label": name.split(":")[0].upper(), "params": (t.get("details") or {}).get("parameter_size", "n/a"),
                       "status": "ONLINE" if name in in_mem else "STANDBY", "context": _context_len(ctx, name),
                       "requests": int(n), "avgResponse": f"{ms / n / 1000:.2f}s" if n else "n/a", "sizeGb": round((t.get("size") or 0) / 1e9, 1)})
    return {**base, "online": True, "version": version, "accel": accel, "models": models}


def ollama_benchmark(ctx, req):
    b = req.json()
    model = _str(b, "model", 80)
    temp, top_p = b.get("temperature", 0.2), b.get("topP", 0.9)
    if not all(isinstance(x, (int, float)) for x in (temp, top_p)) or not (0 <= temp <= 2) or not (0 < top_p <= 1):
        raise bad_request("temperature must be 0..2 and topP in (0,1]")
    try:
        name = ctx.ollama.resolve_model(model)  # strict: never benchmark a different model than the one asked for
        r = ctx.ollama.chat(name, [{"role": "user", "content": "Count from 1 to 40, separated by spaces."}], temperature=float(temp), top_p=float(top_p), num_predict=64, timeout=ctx.settings.chat_timeout_s)
    except OllamaUnavailable as e:
        raise unavailable(f"Ollama is not reachable: {e}", "ollama_unavailable") from None
    except OllamaError as e:
        raise ApiError(404 if e.status == 404 else 502, "ollama_error", str(e)) from None
    ec, ed = r.get("eval_count") or 0, r.get("eval_duration") or 0
    tps = round(ec / (ed / 1e9), 2) if ec and ed else 0.0
    ttft = round(((r.get("load_duration") or 0) + (r.get("prompt_eval_duration") or 0)) / 1e6)
    ctx.metrics.set("ollama.tps", tps)
    return {"tokensPerSec": tps, "ttftMs": ttft, "note": f"Measured on this host: {ec} tokens generated by {name}."}


# --------------------------------------------------------------------------- audit / health
def audit_list(ctx, req):
    try:
        limit = max(1, min(5000, int(req.query.get("limit", "1000"))))
    except ValueError:
        raise bad_request("limit must be an integer") from None
    return ctx.audit.list(limit)


def audit_verify(ctx, req):
    t = time.perf_counter()
    r = ctx.audit.verify()
    return {**r, "ms": int((time.perf_counter() - t) * 1000), "verifiedAt": utcstamp()}


def audit_head(ctx, req):
    return {**ctx.audit.head(), "note": "Record this hash somewhere an attacker with database access cannot reach (print it, sign it, copy it to write-once media). A chain without an external anchor can be rewritten wholesale."}


def health_view(ctx, req):
    return ctx.telemetry.health()


# --------------------------------------------------------------------------- slack
def slack_status(ctx, req):
    return ctx.slack.get_status()


def slack_config_post(ctx, req):
    b = req.json()
    webhook_url = b.get("webhookUrl")
    channel = b.get("channel")
    enabled = b.get("enabled")
    return ctx.slack.save_config(webhook_url=webhook_url, channel=channel, enabled=enabled, operator=req.operator)


def slack_config_delete(ctx, req):
    return ctx.slack.clear_config(operator=req.operator)


def slack_test(ctx, req):
    return ctx.slack.test_connection(operator=req.operator)


def slack_preferences_get(ctx, req):
    return ctx.slack.get_preferences()


def slack_preferences_put(ctx, req):
    b = req.json()
    return ctx.slack.save_preferences(b, operator=req.operator)


def slack_history(ctx, req):
    try:
        limit = max(1, min(500, int(req.query.get("limit", "50"))))
    except ValueError:
        raise bad_request("limit must be an integer") from None
    status = req.query.get("status")
    return ctx.slack.get_history(limit=limit, status=status)

