"""Human-in-the-loop approval queue.

A REQUIRE_APPROVAL decision suspends the action: the exact pending action is stored with the request.
Approving resumes THAT action (re-checked against policy, so a BLOCK still blocks); denying or letting
it expire (default 300 s) cancels it. Resolution is an atomic compare-and-set on status='PENDING'.
"""
from __future__ import annotations

import json
import time
from typing import Callable

from .audit import AuditLog
from .db import Database
from .errors import ApiError, conflict, not_found
from .util import utcstamp


class Grants:
    """Time-boxed permission to read a classified document in RAG, created by an approved request."""

    def __init__(self, db: Database, ttl_s: int = 3600):
        self.db, self.ttl = db, ttl_s

    def grant(self, doc: str, by: str) -> None:
        self.db.x("INSERT INTO grants(doc_name, granted_by, expires) VALUES(?,?,?)", (doc, by, time.time() + self.ttl))

    def expiry(self, doc: str) -> float | None:
        r = self.db.one("SELECT MAX(expires) e FROM grants WHERE doc_name=? AND expires>?", (doc, time.time()))
        return r["e"] if r and r["e"] else None

    def has(self, doc: str) -> bool:
        return self.db.one("SELECT 1 FROM grants WHERE doc_name=? AND expires>?", (doc, time.time())) is not None


class Approvals:
    def __init__(self, db: Database, audit: AuditLog, timeout_s: int, grants: Grants):
        self.db, self.audit, self.timeout, self.grants = db, audit, timeout_s, grants
        self.resume_tool: Callable[..., object] | None = None  # set by Context

    def create(self, *, action: str, tool: str, resource: str, risk: str, classification: str, requester: str,
               pending: dict | None = None) -> dict:
        with self.db.tx() as c:
            last = c.execute("SELECT MAX(seq) m FROM approvals").fetchone()["m"] or 0
            seq = last + 1
            aid = f"AP-{seq:04d}"
            now = time.time()
            c.execute(
                "INSERT INTO approvals(seq,id,created_at,expires_at,risk,classification,action,tool,resource,requester,status,pending_json)"
                " VALUES(?,?,?,?,?,?,?,?,?,?,'PENDING',?)",
                (seq, aid, utcstamp(now), now + self.timeout, risk, classification, action[:300], tool, resource[:300], requester, json.dumps(pending) if pending else None))
        self.audit.append(user=requester, action=f"Approval requested: {action[:200]}", component="Human Approval", risk=risk,
                          decision="REQUIRE_APPROVAL", classification=classification, payload=f"approval:{aid}:pending")
        if hasattr(self, "slack") and self.slack:
            self.slack.on_event(
                event_type="Human Approval Requested",
                category="approval_requests",
                severity="HIGH" if risk in ("HIGH", "CRITICAL") else "MEDIUM",
                title=f"Approval Requested: {tool}",
                description=f"Action '{action[:160]}' on resource '{resource[:100]}' requested by {requester}. Decision pending.",
                component="Human Approval",
                decision="REQUIRE_APPROVAL",
                event_id=aid,
            )
        return self.get(aid)

    @staticmethod
    def _view(r) -> dict:
        v = {"id": r["id"], "createdAt": r["created_at"], "risk": r["risk"], "classification": r["classification"], "action": r["action"],
             "tool": r["tool"], "resource": r["resource"], "requester": r["requester"], "status": r["status"], "expiresAt": r["expires_at"]}
        for k, col in (("resolvedAt", "resolved_at"), ("resolvedBy", "resolved_by"), ("note", "note"), ("result", "result")):
            if r[col]:
                v[k] = r[col]
        return v

    def get(self, aid: str) -> dict:
        r = self.db.one("SELECT * FROM approvals WHERE id=?", (aid,))
        if not r:
            raise not_found(f"Approval {aid} not found")
        return self._view(r)

    def expire_stale(self) -> int:
        now = time.time()
        stale = self.db.q("SELECT id, risk, classification, requester FROM approvals WHERE status='PENDING' AND expires_at<?", (now,))
        n = 0
        for r in stale:
            cur = self.db.x("UPDATE approvals SET status='DENIED', resolved_at=?, resolved_by='system', note=? WHERE id=? AND status='PENDING'",
                            (utcstamp(now), f"Auto-terminated: no decision within {self.timeout} s", r["id"]))
            if cur.rowcount:
                n += 1
                self.audit.append(user="system", action=f"Approval {r['id']} expired", component="Human Approval", risk=r["risk"],
                                  decision="BLOCK", classification=r["classification"], payload=f"approval:{r['id']}:expired")
                if hasattr(self, "slack") and self.slack:
                    self.slack.on_event(
                        event_type="Human Approval Denied",
                        category="approval_decisions",
                        severity="HIGH",
                        title=f"Approval Expired: {r['id']}",
                        description=f"Approval request {r['id']} auto-denied after timing out ({self.timeout} s).",
                        component="Human Approval",
                        decision="DENIED",
                        event_id=r["id"],
                    )
        return n

    def list(self) -> list[dict]:
        self.expire_stale()
        return [self._view(r) for r in self.db.q("SELECT * FROM approvals ORDER BY seq DESC LIMIT 500")]

    def pending_count(self) -> int:
        self.expire_stale()
        return self.db.one("SELECT COUNT(*) n FROM approvals WHERE status='PENDING'")["n"]

    def resolve(self, aid: str, decision: str, operator: str, note: str | None = None) -> dict:
        if decision not in ("APPROVED", "DENIED"):
            raise ApiError(400, "bad_request", "decision must be APPROVED or DENIED")
        if not operator:
            raise ApiError(403, "forbidden", "An operator identity is required to resolve approvals")
        self.expire_stale()
        row = self.db.one("SELECT * FROM approvals WHERE id=?", (aid,))
        if not row:
            raise not_found(f"Approval {aid} not found")
        cur = self.db.x("UPDATE approvals SET status=?, resolved_at=?, resolved_by=?, note=? WHERE id=? AND status='PENDING'",
                        (decision, utcstamp(), operator, (note or "")[:300] or None, aid))
        if cur.rowcount == 0:
            raise conflict(f"{aid} is already {self.get(aid)['status']}")
        self.audit.append(user=operator, action=f"{'Approved' if decision == 'APPROVED' else 'Denied'} {aid}", component="Human Approval",
                          risk=row["risk"], decision="ALLOW" if decision == "APPROVED" else "BLOCK", classification=row["classification"],
                          payload=f"approval:{aid}:{decision}")
        if hasattr(self, "slack") and self.slack:
            is_approved = decision == "APPROVED"
            self.slack.on_event(
                event_type=f"Human Approval {'Granted' if is_approved else 'Denied'}",
                category="approval_decisions",
                severity="LOW" if is_approved else "HIGH",
                title=f"Approval {aid} {'Granted' if is_approved else 'Denied'}",
                description=f"Operator {operator} {decision.lower()} request {aid} ({row['action'][:100]}). Note: {note or 'None'}",
                component="Human Approval",
                decision=decision,
                event_id=aid,
            )
        if decision == "APPROVED" and row["pending_json"]:
            self._resume(aid, json.loads(row["pending_json"]), operator)
        return self.get(aid)

    def _resume(self, aid: str, pending: dict, operator: str) -> None:
        kind = pending.get("kind")
        result = None
        if kind == "rag_read":
            self.grants.grant(pending["doc"], operator)
            result = f"Read access to {pending['doc']} granted for {self.grants.ttl // 60} minutes."
        elif kind == "tool" and self.resume_tool:
            r = self.resume_tool(pending["tool"], pending["input"], pending.get("actor", "agent"), pending.get("taint_class", "PUBLIC"))
            result = f"{'OK' if r.ok else 'FAILED'}: {r.output}"[:2000]
        if result:
            self.db.x("UPDATE approvals SET result=? WHERE id=?", (result, aid))
