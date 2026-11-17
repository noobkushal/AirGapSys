"""Static tool metadata + persisted permission levels."""
from __future__ import annotations

from dataclasses import dataclass

from ..db import Database
from ..util import utcstamp

LEVELS = ("READ", "WRITE", "EXECUTE", "RESTRICTED", "BLOCKED", "DISABLED")


@dataclass(frozen=True)
class ToolSpec:
    id: str
    name: str
    category: str
    risk: str
    description: str
    blurb: str
    default_level: str
    verb: str  # READ | WRITE | EXECUTE (what a normal invocation does)
    air_gap_locked: bool = False
    hidden: bool = False


TOOLS: dict[str, ToolSpec] = {t.id: t for t in (
    ToolSpec("fs", "File System", "System", "MEDIUM", "Sandboxed access to read pre-approved local project directories and documents.", "Sandboxed file reader restricted to the workspace directory.", "READ", "READ"),
    ToolSpec("db", "Local Database", "Data", "MEDIUM", "Read-only access to local SQLite vector database metadata and security indices.", "Single read-only SELECT over allow-listed tables.", "READ", "READ"),
    ToolSpec("calc", "Calculator", "Compute", "LOW", "Local deterministic arithmetic evaluation via abstract syntax tree parsing.", "AST parser; no eval().", "EXECUTE", "EXECUTE"),
    ToolSpec("rag", "Local RAG Search", "Knowledge", "LOW", "Vector similarity search over local air-gapped document embeddings.", "Vector similarity search over local embeddings.", "READ", "READ"),
    ToolSpec("shell", "Terminal / Shell", "System", "HIGH", "Local CLI commands restricted to non-destructive whitelisted inspection binaries.", "Allow-listed inspection commands only; no shell.", "RESTRICTED", "EXECUTE"),
    ToolSpec("sock", "Network Socket", "Network", "CRITICAL", "Raw TCP/UDP socket creation. Prohibited by Air-Gap Policy #001.", "Blocked by air-gap policy.", "BLOCKED", "EXECUTE", air_gap_locked=True),
    ToolSpec("mail", "Email Dispatcher", "External", "CRITICAL", "Outbound SMTP/IMAP messaging. Prohibited by Air-Gap Policy #001 and #005.", "Blocked by air-gap policy.", "BLOCKED", "EXECUTE", air_gap_locked=True),
    ToolSpec("http", "HTTP / REST Client", "Network", "CRITICAL", "Outbound fetch/curl HTTP requests. Strictly blocked to preserve air-gap perimeter.", "Blocked by air-gap policy.", "BLOCKED", "EXECUTE", air_gap_locked=True),
    ToolSpec("sysinfo", "System Information", "System", "LOW", "Static host sandbox telemetry.", "Static host telemetry.", "READ", "READ", hidden=True),
)}

# names the model may use -> tool ids
ALIASES = {"calculator": "calc", "calc": "calc", "file_reader": "fs", "read_file": "fs", "fs": "fs", "db_query": "db", "database": "db",
           "rag_search": "rag", "rag": "rag", "shell": "shell", "terminal": "shell", "system_info": "sysinfo", "sysinfo": "sysinfo"}


class ToolRegistry:
    def __init__(self, db: Database):
        self.db = db
        for t in TOOLS.values():
            db.x("INSERT OR IGNORE INTO tools(id, level, executions, last_run) VALUES(?,?,0,NULL)", (t.id, t.default_level))

    def level(self, tool_id: str) -> str:
        return self.db.one("SELECT level FROM tools WHERE id=?", (tool_id,))["level"]

    def set_level(self, tool_id: str, level: str) -> None:
        spec = TOOLS[tool_id]
        if level not in LEVELS:
            raise ValueError(f"level must be one of {', '.join(LEVELS)}")
        if spec.air_gap_locked and level not in ("BLOCKED", "DISABLED"):
            raise PermissionError(f"{spec.name} is locked by the air-gap policy and cannot be enabled")
        self.db.x("UPDATE tools SET level=? WHERE id=?", (level, tool_id))

    def record_run(self, tool_id: str) -> None:
        self.db.x("UPDATE tools SET executions=executions+1, last_run=? WHERE id=?", (utcstamp(), tool_id))

    def view(self, include_hidden: bool = False) -> list[dict]:
        rows = {r["id"]: r for r in self.db.q("SELECT * FROM tools")}
        out = []
        for t in TOOLS.values():
            if t.hidden and not include_hidden:
                continue
            r = rows[t.id]
            blocked_never = t.air_gap_locked and r["executions"] == 0
            out.append({"id": t.id, "name": t.name, "category": t.category, "risk": t.risk, "description": t.description,
                        "level": r["level"], "executions": r["executions"],
                        "lastRun": r["last_run"] or ("Never (Blocked)" if blocked_never else "Never"),
                        "airGapLocked": t.air_gap_locked, "runtimeVerb": t.verb, "blurb": t.blurb})
        return out
