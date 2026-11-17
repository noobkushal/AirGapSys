"""Data / taint tracking.

Every piece of data entering an agent run carries a trust label and a classification. A TaintContext
is the running union for one request: once CONFIDENTIAL+ data is in the context, the whole context is
tainted, and sink rules (policy.py) refuse to let it flow to network sinks.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ..classification import CLASS_RANK, TRUST_LABELS, class_at_least, max_class

# sink tool names the model may propose -> (tool id, kind)
SINKS: dict[str, tuple[str, str]] = {
    "send_email": ("mail", "network"),
    "http_post": ("http", "network"),
    "http_get": ("http", "network"),
    "fetch": ("http", "network"),
    "network_request": ("sock", "network"),
    "write_file": ("fs", "file_write"),
    "database_export": ("db", "db_export"),
}


@dataclass
class TaintSource:
    label: str
    source: str
    classification: str


@dataclass
class TaintContext:
    sources: list[TaintSource] = field(default_factory=list)

    def absorb(self, label: str, source: str, classification: str = "INTERNAL") -> None:
        if label not in TRUST_LABELS or classification not in CLASS_RANK:
            raise ValueError("unknown trust label or classification")
        self.sources.append(TaintSource(label, source, classification))

    @property
    def classification(self) -> str:
        return max_class("PUBLIC", *(s.classification for s in self.sources))

    @property
    def tainted(self) -> bool:
        return class_at_least(self.classification, "CONFIDENTIAL")

    @property
    def untrusted(self) -> bool:
        return any(s.label == "UNTRUSTED" for s in self.sources)

    def lineage(self) -> list[dict]:
        return [{"label": s.label, "source": s.source, "classification": s.classification} for s in self.sources]
