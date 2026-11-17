"""Append-only, hash-chained audit ledger.

hash = SHA-256( prev_hash + canonical_record ), genesis prev_hash = 64 zeros.
`canonical` is a compact, key-sorted JSON of EVERY field, so editing any field breaks the chain.
Append-only is enforced by SQLite triggers; tamper-EVIDENCE (not prevention) comes from the chain,
and is only as strong as an externally anchored head hash (see GET /api/audit/head and the README).
"""
from __future__ import annotations

import hashlib
import json
import re
import threading

from .classification import CLASSES, RISKS
from .db import Database
from .util import utcstamp

GENESIS = "0" * 64
DECISIONS = ("ALLOW", "BLOCK", "REQUIRE_APPROVAL")
_CTRL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
FIELDS = ("id", "timestamp", "user", "action", "component", "risk", "decision", "classification", "payload")


def canonical_of(rec: dict) -> str:
    return json.dumps({k: rec[k] for k in FIELDS}, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def chain_hash(prev_hash: str, canonical: str) -> str:
    return hashlib.sha256((prev_hash + canonical).encode("utf-8")).hexdigest()


def _clean(s: str, n: int) -> str:
    return _CTRL.sub("", str(s))[:n]


class AuditLog:
    def __init__(self, db: Database):
        self.db = db
        self._lock = threading.Lock()  # in-process; BEGIN IMMEDIATE covers other processes

    def append(self, *, user: str, action: str, component: str, risk: str, decision: str,
               classification: str, payload: str = "") -> dict:
        if risk not in RISKS or decision not in DECISIONS or classification not in CLASSES:
            raise ValueError("invalid risk/decision/classification for audit event")
        with self._lock, self.db.tx() as c:
            last = c.execute("SELECT seq, hash FROM audit_events ORDER BY seq DESC LIMIT 1").fetchone()
            seq = (last["seq"] if last else 0) + 1
            prev = last["hash"] if last else GENESIS
            rec = {"id": f"EVT-{seq:06d}", "timestamp": utcstamp(), "user": _clean(user, 80), "action": _clean(action, 300),
                   "component": _clean(component, 60), "risk": risk, "decision": decision,
                   "classification": classification, "payload": _clean(payload, 2000)}
            canon = canonical_of(rec)
            h = chain_hash(prev, canon)
            c.execute(
                "INSERT INTO audit_events(seq,id,timestamp,user,action,component,risk,decision,classification,payload,canonical,prev_hash,hash)"
                " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (seq, rec["id"], rec["timestamp"], rec["user"], rec["action"], rec["component"], risk, decision,
                 classification, rec["payload"], canon, prev, h))
        return {**rec, "canonical": canon, "hash": h, "prevHash": prev}

    @staticmethod
    def _row(r) -> dict:
        return {"id": r["id"], "timestamp": r["timestamp"], "user": r["user"], "action": r["action"],
                "component": r["component"], "risk": r["risk"], "decision": r["decision"],
                "classification": r["classification"], "payload": r["payload"], "canonical": r["canonical"],
                "hash": r["hash"], "prevHash": r["prev_hash"]}

    def list(self, limit: int = 1000) -> list[dict]:
        rows = self.db.q("SELECT * FROM (SELECT * FROM audit_events ORDER BY seq DESC LIMIT ?) ORDER BY seq ASC", (limit,))
        return [self._row(r) for r in rows]

    def count(self) -> int:
        return self.db.one("SELECT COUNT(*) n FROM audit_events")["n"]

    def head(self) -> dict:
        r = self.db.one("SELECT seq, id, hash FROM audit_events ORDER BY seq DESC LIMIT 1")
        return {"count": self.count(), "id": r["id"] if r else None, "hash": r["hash"] if r else GENESIS}

    def verify(self) -> dict:
        """Recompute every hash from the stored FIELDS (never trusting stored canonical/hash)."""
        problems: list[dict] = []
        prev, expected_seq, n = GENESIS, 1, 0
        for r in self.db.q("SELECT * FROM audit_events ORDER BY seq ASC"):
            n += 1
            rec = {k: r[k] for k in FIELDS}
            if r["seq"] != expected_seq or r["id"] != f"EVT-{r['seq']:06d}":
                problems.append({"id": r["id"], "reason": "Sequence gap or id mismatch (event removed or inserted)"})
            if r["prev_hash"] != prev:
                problems.append({"id": r["id"], "reason": "Parent hash does not match previous block"})
            canon = canonical_of(rec)
            if canon != r["canonical"] or chain_hash(r["prev_hash"], canon) != r["hash"]:
                problems.append({"id": r["id"], "reason": "Record contents no longer match the stored hash"})
            prev, expected_seq = r["hash"], r["seq"] + 1
        return {"ok": not problems, "count": n, "problems": problems, "head": prev}
