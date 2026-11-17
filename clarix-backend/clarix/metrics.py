from __future__ import annotations

import time

from .db import Database


class Metrics:
    def __init__(self, db: Database):
        self.db = db

    def inc(self, name: str, by: float = 1) -> None:
        self.db.x("INSERT INTO counters(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=value+excluded.value", (name, by))

    def set(self, name: str, value: float) -> None:
        self.db.x("INSERT INTO counters(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value", (name, value))

    def get(self, name: str) -> float:
        r = self.db.one("SELECT value FROM counters WHERE name=?", (name,))
        return r["value"] if r else 0.0

    def log_request(self, component: str, decision: str, model: str | None = None, ms: int | None = None) -> None:
        self.db.x("INSERT INTO requests(ts,component,decision,model,ms) VALUES(?,?,?,?,?)", (time.time(), component, decision, model, ms))
        self.inc(f"requests.{component}")

    def avg_ms(self, component: str) -> float | None:
        r = self.db.one("SELECT AVG(ms) a FROM (SELECT ms FROM requests WHERE component=? AND ms IS NOT NULL ORDER BY id DESC LIMIT 50)", (component,))
        return r["a"] if r and r["a"] is not None else None
