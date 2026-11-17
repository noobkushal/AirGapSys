"""Builds and wires every component. The single object handed to request handlers."""
from __future__ import annotations

import logging
import time

from .agent import Agent
from .airgap import guard
from .approvals import Approvals, Grants
from .audit import AuditLog
from .config import Settings
from .db import Database
from .llm.ollama import OllamaClient
from .metrics import Metrics
from .rag.commands import RagCommands
from .rag.embedder import Embedder
from .rag.gate import RagGate
from .rag.store import RagStore
from .security.policy import PolicyEngine
from .security.threats import ThreatStore
from .telemetry import Telemetry
from .tools.registry import ToolRegistry
from .tools.runtime import ToolRuntime

log = logging.getLogger("clarix")


class Context:
    def __init__(self, settings: Settings, install_guard: bool = True, db: Database | None = None):
        self.settings = settings
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        settings.workspace.mkdir(parents=True, exist_ok=True)
        self.db = db or Database(settings.db_path)
        self.audit = AuditLog(self.db)
        self.metrics = Metrics(self.db)
        self.tools = ToolRegistry(self.db)
        self.grants = Grants(self.db)
        self.policy = PolicyEngine(self.db, self.tools.level, self.grants.has)
        self.approvals = Approvals(self.db, self.audit, settings.approval_timeout_s, self.grants)
        self.threats = ThreatStore(self.db)
        self.ollama = OllamaClient(settings.ollama_url)
        self.embedder = Embedder(self.ollama, settings.embed_model, settings.embed_backend)
        self.rag = RagStore(self.db, self.audit, self.embedder, settings.workspace, settings.max_upload_bytes)
        self.rag_gate = RagGate(self)
        self.runtime = ToolRuntime(self)
        self.approvals.resume_tool = self.runtime.resume
        self.agent = Agent(self)
        self.rag_commands = RagCommands(self)
        self.telemetry = Telemetry(self)
        self.started = time.time()
        guard.set_sink(self._on_blocked)
        if install_guard:
            guard.install(settings.airgap_enforce)
        if not settings.airgap_enforce:
            log.warning("CLARIX_AIRGAP_ENFORCE=false: the in-process egress guard is DISABLED (development only).")
        if not settings.auth_enabled:
            log.warning("No API token configured: running in DEV MODE without authentication (loopback only).")

    def _on_blocked(self, rec: dict) -> None:
        self.db.x("INSERT INTO blocked_connections(ts,host,port,protocol,subsystem,rule) VALUES(?,?,?,?,?,?)",
                  (rec["ts"], rec["host"], rec["port"], rec["protocol"], rec["subsystem"], rec["rule"]))
        self.audit.append(user="system", action=f"Blocked outbound {rec['protocol']} to {rec['host']}:{rec['port']}", component="Air-Gap Monitor",
                          risk="HIGH", decision="BLOCK", classification="INTERNAL", payload=f"airgap:{rec['subsystem']}:{rec['host']}:{rec['port']}")

    def start(self) -> None:
        self.telemetry.start()

    def close(self) -> None:
        self.telemetry.stop()
        guard.set_sink(None)
