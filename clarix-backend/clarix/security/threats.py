from __future__ import annotations

import json

from ..db import Database
from ..util import utcstamp


class ThreatStore:
    def __init__(self, db: Database):
        self.db = db

    def record(self, *, category: str, input_text: str, reason: str, risk: int, status: str, timeline: list[dict], source: str) -> dict:
        with self.db.tx() as c:
            seq = (c.execute("SELECT MAX(seq) m FROM threats").fetchone()["m"] or 0) + 1
            tid = f"PI-{seq:03d}"
            c.execute("INSERT INTO threats(seq,id,category,timestamp,input,reason,risk,status,timeline_json,source) VALUES(?,?,?,?,?,?,?,?,?,?)",
                      (seq, tid, category, utcstamp(), input_text[:2000], reason, int(risk), status, json.dumps(timeline), source))
        return {"id": tid}

    def list(self, limit: int = 500) -> list[dict]:
        return [{"id": r["id"], "category": r["category"], "timestamp": r["timestamp"], "input": r["input"], "reason": r["reason"],
                 "risk": r["risk"], "status": r["status"], "timeline": json.loads(r["timeline_json"])}
                for r in self.db.q("SELECT * FROM threats ORDER BY seq DESC LIMIT ?", (limit,))]

    def count(self) -> int:
        return self.db.one("SELECT COUNT(*) n FROM threats")["n"]

    def categories(self) -> list[dict]:
        return [{"name": r["category"], "count": r["n"]} for r in self.db.q("SELECT category, COUNT(*) n FROM threats GROUP BY category ORDER BY n DESC")]
