"""SQLite access. One connection per thread, WAL mode, explicit write transactions."""
from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS audit_events(
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, timestamp TEXT NOT NULL,
  user TEXT NOT NULL, action TEXT NOT NULL, component TEXT NOT NULL, risk TEXT NOT NULL,
  decision TEXT NOT NULL, classification TEXT NOT NULL, payload TEXT NOT NULL,
  canonical TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_events
  BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_events
  BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
CREATE TABLE IF NOT EXISTS policies(id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1,
  enforcements INTEGER NOT NULL DEFAULT 0, last_modified TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tools(id TEXT PRIMARY KEY, level TEXT NOT NULL,
  executions INTEGER NOT NULL DEFAULT 0, last_run TEXT);
CREATE TABLE IF NOT EXISTS approvals(
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL, expires_at REAL NOT NULL,
  risk TEXT NOT NULL, classification TEXT NOT NULL, action TEXT NOT NULL, tool TEXT NOT NULL, resource TEXT NOT NULL,
  requester TEXT NOT NULL, status TEXT NOT NULL, resolved_at TEXT, resolved_by TEXT, note TEXT,
  pending_json TEXT, result TEXT);
CREATE TABLE IF NOT EXISTS threats(
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, category TEXT NOT NULL, timestamp TEXT NOT NULL,
  input TEXT NOT NULL, reason TEXT NOT NULL, risk INTEGER NOT NULL, status TEXT NOT NULL,
  timeline_json TEXT NOT NULL, source TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rag_documents(
  name TEXT PRIMARY KEY, size_kb INTEGER NOT NULL, chunks INTEGER NOT NULL, status TEXT NOT NULL, trust TEXT NOT NULL,
  classification TEXT NOT NULL, last_indexed TEXT NOT NULL, embedding_model TEXT NOT NULL, sha256 TEXT NOT NULL,
  flagged_chunks INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS rag_chunks(
  id INTEGER PRIMARY KEY AUTOINCREMENT, doc_name TEXT NOT NULL REFERENCES rag_documents(name) ON DELETE CASCADE,
  page INTEGER NOT NULL, text TEXT NOT NULL, embedding BLOB NOT NULL, dim INTEGER NOT NULL, flagged INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON rag_chunks(doc_name);
CREATE TABLE IF NOT EXISTS requests(id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL, component TEXT NOT NULL,
  decision TEXT NOT NULL, model TEXT, ms INTEGER);
CREATE INDEX IF NOT EXISTS idx_requests_ts ON requests(ts);
CREATE TABLE IF NOT EXISTS counters(name TEXT PRIMARY KEY, value REAL NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS blocked_connections(id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL, host TEXT NOT NULL,
  port INTEGER NOT NULL, protocol TEXT NOT NULL, subsystem TEXT NOT NULL, rule TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS telemetry(ts REAL PRIMARY KEY, cpu REAL, mem_gb REAL, egress_bps REAL, outbound INTEGER);
CREATE TABLE IF NOT EXISTS agent_sessions(session_key TEXT PRIMARY KEY, actor TEXT NOT NULL, kind TEXT NOT NULL,
  sources_json TEXT NOT NULL, updated REAL NOT NULL);
CREATE TABLE IF NOT EXISTS grants(doc_name TEXT NOT NULL, granted_by TEXT NOT NULL, expires REAL NOT NULL);
"""


class Database:
    def __init__(self, path: Path | str):
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._local = threading.local()
        self._all: list[sqlite3.Connection] = []
        self._lock = threading.Lock()
        self.conn().executescript(SCHEMA)

    def conn(self) -> sqlite3.Connection:
        c = getattr(self._local, "c", None)
        if c is None:
            uri = self.path if self.path != ":memory:" else "file:clarix_mem?mode=memory&cache=shared"
            c = sqlite3.connect(uri, uri=self.path == ":memory:", isolation_level=None, timeout=15, check_same_thread=False)
            c.row_factory = sqlite3.Row
            if self.path != ":memory:":
                c.execute("PRAGMA journal_mode=WAL")
            c.execute("PRAGMA foreign_keys=ON")
            c.execute("PRAGMA synchronous=FULL")
            self._local.c = c
            with self._lock:
                self._all.append(c)
        return c

    def q(self, sql: str, params: tuple | list = ()) -> list[sqlite3.Row]:
        return self.conn().execute(sql, params).fetchall()

    def one(self, sql: str, params: tuple | list = ()):
        return self.conn().execute(sql, params).fetchone()

    def x(self, sql: str, params: tuple | list = ()) -> sqlite3.Cursor:
        return self.conn().execute(sql, params)

    @contextmanager
    def tx(self):
        """BEGIN IMMEDIATE so concurrent writers (threads or processes) serialise."""
        c = self.conn()
        c.execute("BEGIN IMMEDIATE")
        try:
            yield c
            c.execute("COMMIT")
        except BaseException:
            c.execute("ROLLBACK")
            raise

    def close(self) -> None:
        with self._lock:
            for c in self._all:
                try:
                    c.close()
                except sqlite3.Error:
                    pass
            self._all.clear()
        self._local = threading.local()
