"""HTTP client for Slack Incoming Webhooks.
Executes outbound HTTP requests to Slack with strict timeout, validation, and error redaction.
"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

log = logging.getLogger("clarix.slack")


class SlackClient:
    """Delivers Block Kit payloads to Slack Incoming Webhooks."""

    def __init__(self, timeout_s: float = 6.0):
        self.timeout_s = timeout_s

    @staticmethod
    def validate_url(url: str | None) -> tuple[bool, str]:
        if not url or not isinstance(url, str) or not url.strip():
            return False, "Webhook URL cannot be empty."
        u = url.strip()
        parsed = urllib.parse.urlparse(u)
        if parsed.scheme not in ("http", "https"):
            return False, "Webhook URL must use HTTPS."
        if not parsed.netloc:
            return False, "Webhook URL is missing hostname."
        return True, ""

    def send_webhook(self, webhook_url: str, payload: dict[str, Any]) -> tuple[bool, str | None]:
        """Send a payload to the Slack webhook. Returns (success, error_message).
        Never exposes the webhook URL in logs, errors, or exceptions.
        """
        valid, msg = self.validate_url(webhook_url)
        if not valid:
            return False, msg

        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            webhook_url.strip(),
            data=data,
            headers={
                "Content-Type": "application/json; charset=utf-8",
                "User-Agent": "Clarix-AI-Relay/1.0",
                "Accept": "application/json, text/plain",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                status = resp.status
                body = resp.read().decode("utf-8", errors="replace").strip()
                if status == 200 and body.lower() == "ok":
                    return True, None
                # Sometimes Slack returns 200 with JSON or other response
                if status == 200:
                    return True, None
                return False, f"Slack rejected delivery with status {status}: {body[:150]}"
        except urllib.error.HTTPError as e:
            err_body = ""
            try:
                err_body = e.read().decode("utf-8", errors="replace").strip()
            except Exception:
                pass
            log.warning("Slack delivery HTTP error %s: %s", e.code, err_body[:100])
            return False, f"Slack HTTP {e.code}: {err_body[:150] or e.reason}"
        except urllib.error.URLError as e:
            reason = str(getattr(e, "reason", e))
            log.warning("Slack connection error: %s", reason[:100])
            return False, f"Connection failed: {reason[:120]}"
        except TimeoutError:
            log.warning("Slack delivery timed out after %s s", self.timeout_s)
            return False, f"Delivery timed out after {self.timeout_s}s"
        except Exception as e:
            log.exception("Unexpected error delivering to Slack")
            return False, f"Unexpected delivery failure: {type(e).__name__}"
