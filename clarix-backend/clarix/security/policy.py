"""Deterministic policy engine (POL-001..005). Disabled policies are skipped; decisions are
BLOCK > REQUIRE_APPROVAL > ALLOW. Invariants that must never depend on a toggle (air-gap guard,
path containment, calculator/SQL sandboxes) live in their own modules, not here."""
from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass, field
from typing import Callable
from urllib.parse import urlparse

from ..classification import CLASS_RANK, class_at_least, max_class, max_risk, risk_at_least
from ..db import Database
from ..netutil import is_loopback_host
from ..tools.registry import TOOLS
from ..util import utcstamp
from .taint import TaintContext

SENSITIVE_PATH = re.compile(r"(^|/)(\.env(\..*)?|\.ssh|\.aws|\.gnupg|id_rsa[^/]*|id_ed25519[^/]*|credentials?|shadow|sudoers|passwd|\.netrc|\.pgpass)(/|$)|^/(etc|root|proc|sys|boot)(/|$)", re.I)


@dataclass
class ActionContext:
    kind: str                       # tool_call | rag_read | prompt
    tool_id: str | None = None
    verb: str = "EXECUTE"           # READ | WRITE | EXECUTE
    resource: str = ""              # path, host, sql, doc name ...
    resource_class: str = "PUBLIC"  # classification of the resource itself
    sink: str | None = None         # named sink (send_email, http_post ...)
    sink_kind: str | None = None    # network | file_write | db_export
    user: str = "agent"
    taint: TaintContext = field(default_factory=TaintContext)
    extra: dict = field(default_factory=dict)


@dataclass
class Finding:
    decision: str
    reason: str


@dataclass
class PolicyResult:
    decision: str = "ALLOW"
    matched: list[str] = field(default_factory=list)
    reasons: list[str] = field(default_factory=list)
    risk: str = "LOW"

    @property
    def primary(self) -> str | None:
        return self.matched[0] if self.matched else None


@dataclass(frozen=True)
class PolicyDef:
    id: str
    priority: int
    name: str
    category: str
    description: str
    rules: tuple[str, ...]
    check: Callable[["PolicyEngine", ActionContext], Finding | None]


def _is_network(a: ActionContext) -> bool:
    if a.sink_kind == "network":
        return True
    spec = TOOLS.get(a.tool_id or "")
    return bool(spec and spec.category in ("Network", "External"))


def _external_host(resource: str) -> bool:
    m = urlparse(resource if "://" in resource else f"//{resource}")
    host = m.hostname
    if not host:
        return False
    try:
        ipaddress.ip_address(host)
        return not is_loopback_host(host)
    except ValueError:
        return not is_loopback_host(host) and "." in host


def _pol001(e, a):
    if _is_network(a):
        return Finding("BLOCK", "Network access is forbidden by the air-gap policy.")
    if a.kind == "tool_call" and a.resource and re.search(r"https?://", a.resource) and _external_host(a.resource):
        return Finding("BLOCK", "External URL in tool arguments is forbidden by the air-gap policy.")
    return None


def _pol002(e, a):
    if a.kind == "tool_call" and a.tool_id in ("fs", "shell") and a.resource and SENSITIVE_PATH.search(a.resource.replace("\\", "/")):
        return Finding("BLOCK", "Path matches a credential store or system configuration location.")
    if a.sink_kind == "file_write" and re.search(r"(^|/)(audit|clarix\.db)", a.resource or "", re.I):
        return Finding("BLOCK", "Writes to audit storage are forbidden.")
    if a.kind in ("tool_call", "rag_read") and class_at_least(a.resource_class, "CONFIDENTIAL") and a.verb in ("READ", "EXECUTE"):
        if not (a.kind == "rag_read" and e.has_grant(a.resource)):
            return Finding("REQUIRE_APPROVAL", f"Resource is classified {a.resource_class}.")
    return None


_LEVEL_ALLOWS = {"READ": {"READ"}, "WRITE": {"READ", "WRITE"}, "EXECUTE": {"READ", "WRITE", "EXECUTE"}}


def _pol003(e, a):
    if a.kind != "tool_call" or not a.tool_id:
        return None
    level = e.tool_level(a.tool_id)
    if level in ("BLOCKED", "DISABLED"):
        return Finding("BLOCK", f"Tool permission is {level}.")
    if level == "RESTRICTED":
        return Finding("REQUIRE_APPROVAL", "Tool is RESTRICTED: each use needs operator approval.")
    if a.verb not in _LEVEL_ALLOWS.get(level, set()):
        return Finding("BLOCK", f"Tool permission {level} does not allow {a.verb}.")
    return None


def _pol004(e, a):
    risk = a.extra.get("risk", "LOW")
    if a.kind == "tool_call" and risk_at_least(risk, "HIGH"):
        return Finding("REQUIRE_APPROVAL", f"Action risk is {risk}.")
    if a.kind == "rag_read" and class_at_least(a.resource_class, "CONFIDENTIAL") and not e.has_grant(a.resource):
        return Finding("REQUIRE_APPROVAL", f"Reading {a.resource_class} material requires approval.")
    return None


def _pol005(e, a):
    if a.kind != "tool_call":
        return None
    if a.sink_kind == "network" or _is_network(a):
        if a.taint.tainted:
            return Finding("BLOCK", f"{a.taint.classification} data in context cannot reach a network sink.")
        return Finding("BLOCK", "External data transfer is forbidden.")
    if a.sink_kind == "db_export":
        return Finding("REQUIRE_APPROVAL", "Database export requires SOC authorization.")
    if a.sink_kind == "file_write" and a.taint.tainted and not re.match(r"^(?!/|\.\.)", a.resource or ""):
        return Finding("BLOCK", "Tainted data may only be written inside the sandbox workspace.")
    return None


POLICIES: tuple[PolicyDef, ...] = (
    PolicyDef("POL-001", 1, "No Internet Access", "Network",
              "Completely blocks all outbound and inbound socket connections to external WAN/Internet IPs and domain names. Enforces air-gapped isolation.",
              ("Deny all outbound TCP/UDP traffic to non-loopback addresses", "Drop DNS resolution queries directed to external recursive resolvers",
               "Block all HTTP/S requests initiated by agent or local tools", "Quarantine process if unauthorized socket attempt is detected"), _pol001),
    PolicyDef("POL-002", 2, "Sensitive File Protection", "Data",
              "Enforces strict read/write boundaries on the local file system. Restricts access to credential stores, keys, and confidential archives.",
              ("Disallow reading .env, credentials, /etc/, /root/ or system configurations", "Require Human Approval for accessing files marked CONFIDENTIAL or RESTRICTED",
               "Enforce read-only sandbox on user documents directory", "Prevent file overwrite or modification of audit log directories"), _pol002),
    PolicyDef("POL-003", 3, "Tool Least Privilege", "Tools",
              "Limits tool execution to strictly whitelisted commands, sandboxed memory spaces, and explicitly permitted local arguments.",
              ("Disable arbitrary shell execution and subprocess spawning", "Permit Calculator tool for mathematical expressions only with AST validation",
               "Restrict Database tool to pre-approved read-only SQL queries on local SQLite", "Deny any tool attempting to execute remote code or spawn child processes"), _pol003),
    PolicyDef("POL-004", 4, "Human Approval for High Risk Actions", "Approval",
              "Halts execution pipeline and requests explicit cryptographic human authorization for any action flagged HIGH or CRITICAL risk.",
              ("Trigger approval queue if action touches CONFIDENTIAL or RESTRICTED assets", "Suspend agent execution until SOC operator responds via UI modal",
               "Log operator ID, timestamp, and digital signature for approved actions", "Auto-terminate request if no approval is received within 300 seconds"), _pol004),
    PolicyDef("POL-005", 5, "Prevent External Data Transfer", "Network",
              "Prevents tainted or classified data from reaching any outbound sink such as email, HTTP clients, or raw sockets.",
              ("Block CONFIDENTIAL/RESTRICTED tainted tokens from entering network sinks", "Deny send_email, http_post and network_request tool calls",
               "Require SOC authorization for database exports", "Record every blocked transfer attempt to the audit ledger"), _pol005),
)
_BY_ID = {p.id: p for p in POLICIES}


class PolicyEngine:
    def __init__(self, db: Database, tool_level: Callable[[str], str], has_grant: Callable[[str], bool] | None = None):
        self.db, self.tool_level = db, tool_level
        self._has_grant = has_grant or (lambda doc: False)
        for p in POLICIES:
            db.x("INSERT OR IGNORE INTO policies(id, enabled, enforcements, last_modified) VALUES(?,1,0,?)", (p.id, utcstamp()))

    def has_grant(self, doc: str) -> bool:
        return self._has_grant(doc)

    def enabled(self) -> set[str]:
        return {r["id"] for r in self.db.q("SELECT id FROM policies WHERE enabled=1")}

    def evaluate(self, a: ActionContext) -> PolicyResult:
        res, on = PolicyResult(), self.enabled()
        res.risk = max_risk(a.extra.get("risk", "LOW"), "CRITICAL" if class_at_least(max_class(a.resource_class, a.taint.classification), "RESTRICTED") else "LOW")
        for p in POLICIES:
            if p.id not in on:
                continue
            f = p.check(self, a)
            if not f:
                continue
            res.matched.append(p.id)
            res.reasons.append(f"{p.id}: {f.reason}")
            if f.decision == "BLOCK" or (f.decision == "REQUIRE_APPROVAL" and res.decision == "ALLOW"):
                res.decision = f.decision
            self.db.x("UPDATE policies SET enforcements=enforcements+1 WHERE id=?", (p.id,))
        return res

    def set_enabled(self, pid: str, enabled: bool) -> None:
        self.db.x("UPDATE policies SET enabled=?, last_modified=? WHERE id=?", (1 if enabled else 0, utcstamp(), pid))

    def view(self) -> list[dict]:
        rows = {r["id"]: r for r in self.db.q("SELECT * FROM policies")}
        return [{"id": p.id, "priority": p.priority, "name": p.name, "category": p.category, "description": p.description,
                 "rules": list(p.rules), "enabled": bool(rows[p.id]["enabled"]), "enforcements": rows[p.id]["enforcements"],
                 "lastModified": rows[p.id]["last_modified"]} for p in POLICIES]


assert CLASS_RANK  # re-exported for convenience
