"""Output sanitiser applied to model text before it is returned. Redacts obvious secrets and strips
tool-call control lines so the UI never shows raw protocol text."""
from __future__ import annotations

import re

_PATTERNS = [
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S), "[REDACTED PRIVATE KEY]"),
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), "[REDACTED AWS KEY]"),
    (re.compile(r"\b(ghp|gho|ghs)_[A-Za-z0-9]{30,}\b"), "[REDACTED TOKEN]"),
    (re.compile(r"\bsk-[A-Za-z0-9]{20,}\b"), "[REDACTED API KEY]"),
    (re.compile(r"(?i)\b(password|passwd|secret|token)\s*[:=]\s*\S{6,}"), r"\1: [REDACTED]"),
]
_TOOL_LINE = re.compile(r"^\s*TOOL_CALL\b.*$", re.M)


_THINK = re.compile(r"<think>.*?</think>", re.S | re.I)
_THINK_OPEN = re.compile(r"<think>.*\Z", re.S | re.I)


def strip_thinking(text: str) -> str:
    """Remove <think>…</think> blocks (and an unterminated trailing one). Applied BEFORE tool-call parsing so
    a TOOL_CALL written inside hidden reasoning can never execute, and reasoning is never shown to the user."""
    return _THINK_OPEN.sub("", _THINK.sub("", text)).strip()


def sanitize(text: str) -> tuple[str, list[str]]:
    notes: list[str] = []
    out = _TOOL_LINE.sub("", text)
    for pat, repl in _PATTERNS:
        out, n = pat.subn(repl, out)
        if n:
            notes.append(f"redacted {n} secret-like value(s)")
    return out.strip(), notes
