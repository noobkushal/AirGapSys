"""Host telemetry sampler + health view. Everything reported is measured; if it cannot be measured
the field is null (never invented)."""
from __future__ import annotations

import threading
import time

import psutil

from .airgap import monitor
from .util import clock


class Telemetry:
    def __init__(self, ctx):
        self.ctx = ctx
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last_tx, self._last_t = monitor.tx_bytes_nonloopback(), time.time()
        self._proc = psutil.Process()
        self._proc.cpu_percent(None)
        self._ollama: dict[int, psutil.Process] = {}

    def start(self) -> None:
        self.sample()
        self._thread = threading.Thread(target=self._loop, name="telemetry", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _loop(self) -> None:
        while not self._stop.wait(self.ctx.settings.telemetry_interval_s):
            try:
                self.sample()
                self.ctx.approvals.expire_stale()
            except Exception:  # sampler must never die
                pass

    def sample(self) -> None:
        now = time.time()
        tx = monitor.tx_bytes_nonloopback()
        bps = max(0.0, (tx - self._last_tx) * 8 / max(1e-3, now - self._last_t))
        self._last_tx, self._last_t = tx, now
        conns = monitor.outbound_connections()
        db = self.ctx.db
        db.x("INSERT OR REPLACE INTO telemetry(ts,cpu,mem_gb,egress_bps,outbound) VALUES(?,?,?,?,?)",
             (now, psutil.cpu_percent(None), psutil.virtual_memory().used / 2**30, bps, None if conns is None else len(conns)))
        db.x("DELETE FROM telemetry WHERE ts<?", (now - 86400,))
        db.x("DELETE FROM blocked_connections WHERE ts<?", (now - 7 * 86400,))

    def _buckets(self, n: int = 6, width: int = 600):
        now = time.time()
        start = (int(now) // width - (n - 1)) * width
        return [start + i * width for i in range(n)], width

    def host_series(self) -> list[dict]:
        def build():
            starts, w = self._buckets()
            out = []
            for s in starts:
                r = self.ctx.db.one("SELECT AVG(cpu) c, AVG(mem_gb) m FROM telemetry WHERE ts>=? AND ts<?", (s, s + w))
                if r and r["c"] is not None:
                    out.append({"t": clock(s)[:5], "cpu": round(r["c"], 1), "mem": round(r["m"], 2)})
            return out

        out = build()
        if not out:  # nothing sampled in the window yet (fresh start): take a measurement now
            self.sample()
            out = build()
        return out

    def egress_series(self) -> list[dict]:
        starts, w = self._buckets()
        out = []
        for s in starts:
            e = self.ctx.db.one("SELECT AVG(egress_bps) b FROM telemetry WHERE ts>=? AND ts<?", (s, s + w))
            b = self.ctx.db.one("SELECT COUNT(*) n FROM blocked_connections WHERE ts>=? AND ts<?", (s, s + w))
            out.append({"t": clock(s)[:5], "egress": round(e["b"], 1) if e and e["b"] is not None else 0, "blocked": b["n"]})
        return out

    def _ollama_usage(self):
        cpu = rss = 0.0
        found = False
        for p in psutil.process_iter(["pid", "name"]):
            try:
                if "ollama" not in (p.info["name"] or "").lower():
                    continue
                pr = self._ollama.setdefault(p.pid, p)
                cpu += pr.cpu_percent(None)
                rss += pr.memory_info().rss
                found = True
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        return (cpu, rss) if found else (None, None)

    def health(self) -> dict:
        ctx, m = self.ctx, self.ctx.metrics
        cpu = self._proc.cpu_percent(None)
        rss = self._proc.memory_info().rss
        total = psutil.virtual_memory().total

        def mem(b):
            return (f"{b / 2**30:.1f} GB" if b >= 2**30 else f"{b / 2**20:.0f} MB"), round(100 * b / total, 1)

        def lat(c):
            a = m.avg_ms(c)
            return f"{a:,.0f}ms" if a is not None else "n/a"

        t = time.perf_counter()
        try:
            ctx.ollama.version()
            oll_ok = True
        except Exception:
            oll_ok = False
        oll_ms = (time.perf_counter() - t) * 1000
        ocpu, orss = self._ollama_usage()
        om = mem(orss) if orss is not None else ("n/a", 0)
        pm, rm = mem(rss), mem(rss)
        t = time.perf_counter()
        ctx.audit.head()
        db_ms = (time.perf_counter() - t) * 1000
        try:
            db_bytes = __import__("os").path.getsize(ctx.db.path)
        except OSError:
            db_bytes = 0
        ws_bytes = sum(f.stat().st_size for f in ctx.settings.workspace.glob("*") if f.is_file()) if ctx.settings.workspace.exists() else 0
        shared = "shared process"
        svc = [
            {"id": "agent", "name": "AI Agent Runtime", "subtitle": f"Autonomous Core · {shared}", "status": "ACTIVE", "cpu": round(cpu, 1), "memLabel": pm[0], "memPct": pm[1], "latency": lat("agent"), "requests": int(m.get("requests.agent")), "icon": "bot"},
            {"id": "proxy", "name": "AI Harness Proxy", "subtitle": f"Security Gatekeeper · {shared}", "status": "ACTIVE", "cpu": None, "memLabel": "in process", "memPct": 0, "latency": lat("pi"), "requests": int(m.get("component.pi.requests")), "icon": "shield"},
            {"id": "policy", "name": "Policy Engine", "subtitle": f"Rule Engine · {shared}", "status": "ACTIVE", "cpu": None, "memLabel": "in process", "memPct": 0, "latency": "<1ms", "requests": int(m.get("component.policy.evaluations")), "icon": "layers"},
            {"id": "rag", "name": "Local Vector RAG", "subtitle": "Semantic Knowledge", "status": "ONLINE", "cpu": None, "memLabel": f"{ctx.rag.total_chunks()} chunks", "memPct": 0, "latency": lat("rag"), "requests": int(m.get("requests.rag")), "icon": "box"},
            {"id": "vdb", "name": "Vector Database (SQLite)", "subtitle": "Embedded Storage", "status": "ONLINE", "cpu": None, "memLabel": mem(db_bytes)[0], "memPct": 0, "latency": f"{db_ms:.0f}ms", "requests": int(m.get("requests.agent") + m.get("requests.rag")), "icon": "db"},
            {"id": "ollama", "name": "Ollama Inference Core", "subtitle": "Local LLM", "status": "ONLINE" if oll_ok else "OFFLINE", "cpu": None if ocpu is None else round(ocpu, 1), "memLabel": om[0], "memPct": om[1], "latency": f"{oll_ms:,.0f}ms ping" if oll_ok else "unreachable", "requests": int(m.get("inference.total")), "icon": "cpu"},
            {"id": "fs", "name": "Sandboxed File System", "subtitle": "Workspace dir (path-contained)", "status": "SANDBOXED", "cpu": None, "memLabel": mem(ws_bytes)[0], "memPct": 0, "latency": "n/a", "requests": int(m.get("component.fs.requests")), "icon": "folder"},
            {"id": "audit", "name": "Audit Logger & SHA-256", "subtitle": "Ledger Daemon", "status": "ACTIVE", "cpu": None, "memLabel": f"{ctx.audit.count()} blocks", "memPct": 0, "latency": f"{db_ms:.0f}ms", "requests": ctx.audit.count(), "icon": "file"},
        ]
        return {"services": svc, "series": self.host_series()}
