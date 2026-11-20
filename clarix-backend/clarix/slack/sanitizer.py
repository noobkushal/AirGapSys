"""Sanitization and redaction for Slack notification payloads.
Ensures secrets, tokens, internal paths, and sensitive data are never exfiltrated to external webhooks.
"""
from __future__ import annotations

import re

# Redaction patterns for sensitive data
_PATTERNS = [
    # API tokens and secrets
    (re.compile(r"Bearer\s+[A-Za-z0-9_\-\.]{16,}", re.I), "Bearer [REDACTED_TOKEN]"),
    (re.compile(r"sk-[A-Za-z0-9_\-]{16,}", re.I), "[REDACTED_API_KEY]"),
    (re.compile(r"(password|passwd|secret|api_key|token|access_key)\s*[:=]\s*['\"]?[^\s,'\"]+['\"]?", re.I), r"\1=[REDACTED]"),
    # Private keys
    (re.compile(r"-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----"), "[REDACTED_PRIVATE_KEY]"),
    # Sensitive file paths / keys
    (re.compile(r"(\.env[^\s,'\"]*|\.ssh|\.aws|\.gnupg|id_rsa[^\s,'\"]*|id_ed25519[^\s,'\"]*|shadow|sudoers|passwd)", re.I), "[REDACTED_PATH]"),
]

# Control characters filter
_CTRL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


def sanitize_text(text: str | None, maxlen: int = 500) -> str:
    """Sanitize and redact text before including in outgoing Slack notifications."""
    if not text:
        return ""
    s = str(text)
    s = _CTRL.sub("", s)
    for pattern, repl in _PATTERNS:
        s = pattern.sub(repl, s)
    s = s.strip()
    if len(s) > maxlen:
        s = s[:maxlen - 3] + "..."
    return s


def mask_webhook_url(url: str | None) -> str:
    """Mask a Slack webhook URL so that secrets are never sent to the frontend."""
    if not url or not isinstance(url, str):
        return ""
    u = url.strip()
    if not u.startswith("https://hooks.slack.com/services/"):
        return "https://hooks.slack.com/services/*** (masked)" if u else ""
    parts = u.split("/")
    # Slack webhook URL format: domain / services / team / bot / token
    if len(parts) >= 7:
        team = parts[4]
        bot = parts[5]
        return f"https://hooks.slack.com/services/{team}/{bot}/*** [MASKED]"
    return "https://hooks.slack.com/services/*** [MASKED]"
