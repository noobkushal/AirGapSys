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
from .slack import SlackService
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
        self.slack = SlackService(self.db, self.settings, self.audit)
        self.approvals = Approvals(self.db, self.audit, settings.approval_timeout_s, self.grants)
        self.approvals.slack = self.slack
        self.audit.slack = self.slack
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
        self._relay_running = False
        self._relay_thread = None
        if settings.slack_relay_enabled:
            self._start_relay_worker()

    def _start_relay_worker(self) -> None:
        self._relay_running = True
        def _loop():
            while self._relay_running:
                try:
                    self.slack.relay.process_pending_once(
                        strict_airgap=self.settings.airgap_enforce,
                        relay_enabled=self.settings.slack_relay_enabled,
                    )
                except Exception:
                    pass
                time.sleep(self.settings.slack_relay_interval_s)
        self._relay_thread = threading.Thread(target=_loop, daemon=True, name="clarix-slack-relay")
        self._relay_thread.start()

    def _on_blocked(self, rec: dict) -> None:
        self.db.x("INSERT INTO blocked_connections(ts,host,port,protocol,subsystem,rule) VALUES(?,?,?,?,?,?)",
                  (rec["ts"], rec["host"], rec["port"], rec["protocol"], rec["subsystem"], rec["rule"]))
        self.audit.append(user="system", action=f"Blocked outbound {rec['protocol']} to {rec['host']}:{rec['port']}", component="Air-Gap Monitor",
                          risk="HIGH", decision="BLOCK", classification="INTERNAL", payload=f"airgap:{rec['subsystem']}:{rec['host']}:{rec['port']}")
        self.slack.on_event(
            event_type="Unauthorized Network Connection Attempt Blocked",
            category="network_security",
            severity="CRITICAL",
            title="Unauthorized Network Connection Blocked",
            description=f"Outbound {rec['protocol']} to {rec['host']}:{rec['port']} blocked by air-gap rule {rec['rule']} in subsystem '{rec['subsystem']}'.",
            component="Air-Gap Monitor",
            decision="BLOCK",
            event_id=f"NET-{int(rec['ts'])}",
        )

    def start(self) -> None:
        self.telemetry.start()

    def close(self) -> None:
        self._relay_running = False
        self.telemetry.stop()
        guard.set_sink(None)
