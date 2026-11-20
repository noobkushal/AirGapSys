"""High-level Slack Integration service for Clarix AI.
Coordinates configuration, preferences, event filtering, durable queuing, and isolated delivery.
"""
from __future__ import annotations

import logging
import threading
from typing import Any

from ..audit import AuditLog
from ..config import Settings
from ..db import Database
from ..errors import bad_request
from ..util import utcstamp
from .client import SlackClient
from .formatter import format_slack_message
from .queue import SlackQueue
from .relay import SlackRelay
from .sanitizer import mask_webhook_url, sanitize_text

log = logging.getLogger("clarix.slack.service")

# Map of supported event categories
VALID_CATEGORIES = {
    "prompt_injection",
    "blocked_actions",
    "approval_requests",
    "approval_decisions",
    "network_security",
    "policy_changes",
    "critical_audit",
}


class SlackService:
    """Core service for managing the Slack integration, event filtering, and delivery."""

    def __init__(self, db: Database, settings: Settings, audit: AuditLog):
        self.db = db
        self.settings = settings
        self.audit = audit
        self.queue = SlackQueue(db)
        self.relay = SlackRelay(db)
        self._lock = threading.Lock()
        self._init_db()

    def _init_db(self) -> None:
        """Seed default config and preferences if not yet existing."""
        now = utcstamp()
        row_cfg = self.db.one("SELECT id FROM slack_config WHERE id=1")
        if not row_cfg:
            self.db.x(
                """INSERT INTO slack_config (
                     id, enabled, webhook_url, channel, last_success_at,
                     last_error, last_tested_at, created_at, updated_at
                   ) VALUES (1, ?, ?, ?, NULL, NULL, NULL, ?, ?)""",
                (
                    1 if self.settings.slack_enabled else 0,
                    self.settings.slack_webhook_url or "",
                    self.settings.slack_channel or "",
                    now,
                    now,
                ),
            )

        row_pref = self.db.one("SELECT id FROM slack_preferences WHERE id=1")
        if not row_pref:
            self.db.x(
                """INSERT INTO slack_preferences (
                     id, prompt_injection, blocked_actions, approval_requests,
                     approval_decisions, network_security, policy_changes,
                     critical_audit, updated_at
                   ) VALUES (1, 1, 1, 1, 1, 1, 1, 1, ?)""",
                (now,),
            )

    # --------------------------------------------------------------------------- Config
    def get_config(self, include_secret: bool = False) -> dict[str, Any]:
        """Fetch Slack configuration. Never exposes the unmasked secret to frontend responses."""
        r = self.db.one("SELECT * FROM slack_config WHERE id=1")
        if not r:
            return {
                "enabled": False,
                "configured": False,
                "webhookUrlMasked": "",
                "channel": "",
                "lastSuccessAt": None,
                "lastError": None,
                "lastTestedAt": None,
            }

        url = r["webhook_url"] or ""
        out = {
            "enabled": bool(r["enabled"]),
            "configured": bool(url.strip()),
            "webhookUrlMasked": mask_webhook_url(url),
            "channel": r["channel"] or "",
            "lastSuccessAt": r["last_success_at"],
            "lastError": r["last_error"],
            "lastTestedAt": r["last_tested_at"],
        }
        if include_secret:
            out["webhookUrl"] = url
        return out

    def save_config(
        self,
        *,
        webhook_url: str | None = None,
        channel: str | None = None,
        enabled: bool | None = None,
        operator: str = "operator",
    ) -> dict[str, Any]:
        """Update Slack configuration."""
        cur = self.db.one("SELECT * FROM slack_config WHERE id=1")
        now = utcstamp()

        new_url = cur["webhook_url"] if cur else ""
        if webhook_url is not None:
            w = webhook_url.strip()
            if w:
                valid, msg = SlackClient.validate_url(w)
                if not valid:
                    raise bad_request(msg)
                new_url = w
            else:
                new_url = ""

        new_chan = cur["channel"] if cur else ""
        if channel is not None:
            new_chan = channel.strip()[:80]

        new_enabled = bool(cur["enabled"]) if cur else False
        if enabled is not None:
            new_enabled = bool(enabled)

        self.db.x(
            """UPDATE slack_config
               SET enabled=?, webhook_url=?, channel=?, updated_at=?
               WHERE id=1""",
            (1 if new_enabled else 0, new_url, new_chan, now),
        )

        self.audit.append(
            user=operator,
            action=f"Updated Slack configuration (enabled={new_enabled}, channel={new_chan or '(default)'})",
            component="Slack Integration",
            risk="LOW",
            decision="ALLOW",
            classification="INTERNAL",
            payload="slack:config:update",
        )

        return self.get_config()

    def clear_config(self, operator: str = "operator") -> dict[str, Any]:
        """Clear webhook URL and disable Slack integration."""
        now = utcstamp()
        self.db.x(
            """UPDATE slack_config
               SET enabled=0, webhook_url='', channel='', last_error=NULL, updated_at=?
               WHERE id=1""",
            (now,),
        )
        self.audit.append(
            user=operator,
            action="Cleared Slack webhook configuration and disabled integration",
            component="Slack Integration",
            risk="LOW",
            decision="ALLOW",
            classification="INTERNAL",
            payload="slack:config:clear",
        )
        return self.get_config()

    # --------------------------------------------------------------------------- Preferences
    def get_preferences(self) -> dict[str, bool]:
        """Get notification category toggles."""
        r = self.db.one("SELECT * FROM slack_preferences WHERE id=1")
        if not r:
            return {c: True for c in VALID_CATEGORIES}
        return {
            "prompt_injection": bool(r["prompt_injection"]),
            "blocked_actions": bool(r["blocked_actions"]),
            "approval_requests": bool(r["approval_requests"]),
            "approval_decisions": bool(r["approval_decisions"]),
            "network_security": bool(r["network_security"]),
            "policy_changes": bool(r["policy_changes"]),
            "critical_audit": bool(r["critical_audit"]),
        }

    def save_preferences(self, prefs: dict[str, Any], operator: str = "operator") -> dict[str, bool]:
        """Update notification preferences."""
        cur = self.get_preferences()
        updated = {}
        for k in VALID_CATEGORIES:
            if k in prefs:
                if not isinstance(prefs[k], bool):
                    raise bad_request(f"Preference '{k}' must be a boolean")
                updated[k] = 1 if prefs[k] else 0
            else:
                updated[k] = 1 if cur.get(k, True) else 0

        now = utcstamp()
        self.db.x(
            """UPDATE slack_preferences SET
                 prompt_injection=?, blocked_actions=?, approval_requests=?,
                 approval_decisions=?, network_security=?, policy_changes=?,
                 critical_audit=?, updated_at=?
               WHERE id=1""",
            (
                updated["prompt_injection"],
                updated["blocked_actions"],
                updated["approval_requests"],
                updated["approval_decisions"],
                updated["network_security"],
                updated["policy_changes"],
                updated["critical_audit"],
                now,
            ),
        )

        self.audit.append(
            user=operator,
            action="Updated Slack notification preferences",
            component="Slack Integration",
            risk="LOW",
            decision="ALLOW",
            classification="INTERNAL",
            payload="slack:preferences:update",
        )

        return self.get_preferences()

    # --------------------------------------------------------------------------- Status
    def get_status(self) -> dict[str, Any]:
        """Return integration overview and operational status."""
        cfg = self.get_config()
        enabled = cfg["enabled"]
        configured = cfg["configured"]
        last_error = cfg["lastError"]
        last_success = cfg["lastSuccessAt"]

        if not enabled or not configured:
            state = "DISCONNECTED"
        elif last_error:
            state = "ERROR"
        else:
            state = "CONNECTED"

        queue_stats = self.queue.get_stats()
        strict_airgap = self.settings.airgap_enforce
        relay_enabled = self.settings.slack_relay_enabled

        return {
            "enabled": enabled,
            "connectionState": state,
            "configured": configured,
            "webhookUrlMasked": cfg["webhookUrlMasked"],
            "channel": cfg["channel"],
            "lastSuccessAt": last_success,
            "lastError": last_error,
            "lastTestedAt": cfg["lastTestedAt"],
            "strictAirgap": strict_airgap,
            "relayEnabled": relay_enabled,
            "queue": queue_stats,
        }

    # --------------------------------------------------------------------------- Event Ingestion
    def on_event(
        self,
        *,
        event_type: str,
        category: str,
        severity: str,
        title: str,
        description: str,
        component: str,
        decision: str,
        event_id: str,
        channel: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> str | None:
        """Process an application event and enqueue for Slack delivery if enabled.
        Guarantees isolation: this method NEVER calls outbound network directly and NEVER crashes the caller.
        """
        try:
            # 1. Loop protection
            if component in ("Slack Relay", "Slack Service", "Slack Integration"):
                return None

            # 2. Check enabled state
            cfg = self.get_config(include_secret=True)
            if not cfg["enabled"] or not cfg.get("webhookUrl"):
                return None

            # 3. Check preferences
            prefs = self.get_preferences()
            if category in prefs and not prefs[category]:
                log.debug("Event %s dropped: category '%s' is disabled in Slack preferences", event_id, category)
                return None

            # 4. Format payload (sanitizes all text)
            configured_channel = channel or cfg.get("channel")
            payload = format_slack_message(
                event_type=event_type,
                category=category,
                severity=severity,
                title=title,
                description=description,
                component=component,
                decision=decision,
                event_id=event_id,
                timestamp=utcstamp(),
                channel=configured_channel,
            )

            # 5. Enqueue in local durable queue
            nid = self.queue.enqueue(
                event_type=event_type,
                category=category,
                severity=severity,
                title=title,
                description=description,
                component=component,
                decision=decision,
                event_id=event_id,
                payload=payload,
            )
            return nid
        except Exception:
            # Outbound alert failures must NEVER interrupt security operations
            log.exception("Error enqueuing Slack alert for %s", event_id)
            return None

    # --------------------------------------------------------------------------- Test Connection
    def test_connection(self, operator: str = "operator") -> dict[str, Any]:
        """Execute a connection test to the configured Slack webhook.
        Runs in an isolated manner. In strict air-gap mode without relay authorization,
        reports clearly that external delivery is unavailable.
        """
        cfg = self.get_config(include_secret=True)
        webhook_url = (cfg.get("webhookUrl") or "").strip()
        if not webhook_url:
            raise bad_request("No Slack webhook URL is configured.")

        # Check strict air-gap invariants
        if self.settings.airgap_enforce and not self.settings.slack_relay_enabled:
            reason = "External delivery unavailable: strict air-gap mode is active and outbound relay is disabled."
            now = utcstamp()
            self.db.x("UPDATE slack_config SET last_tested_at=?, last_error=?, updated_at=? WHERE id=1", (now, reason, now))
            self.audit.append(
                user=operator,
                action="Tested Slack connection (blocked by strict air-gap)",
                component="Slack Integration",
                risk="MEDIUM",
                decision="BLOCK",
                classification="INTERNAL",
                payload="slack:test:airgap_blocked",
            )
            return {"ok": False, "message": reason, "connectionState": "ERROR"}

        # Perform test via relay
        ok, msg = self.relay.test_webhook_isolated(webhook_url, cfg.get("channel"))
        now = utcstamp()
        if ok:
            self.db.x(
                "UPDATE slack_config SET last_success_at=?, last_tested_at=?, last_error=NULL, updated_at=? WHERE id=1",
                (now, now, now),
            )
            self.audit.append(
                user=operator,
                action="Tested Slack connection: success",
                component="Slack Integration",
                risk="LOW",
                decision="ALLOW",
                classification="INTERNAL",
                payload="slack:test:success",
            )
        else:
            safe_err = sanitize_text(msg, 200)
            self.db.x(
                "UPDATE slack_config SET last_tested_at=?, last_error=?, updated_at=? WHERE id=1",
                (now, safe_err, now),
            )
            self.audit.append(
                user=operator,
                action=f"Tested Slack connection: failed ({safe_err})",
                component="Slack Integration",
                risk="MEDIUM",
                decision="BLOCK",
                classification="INTERNAL",
                payload="slack:test:failed",
            )

        return {
            "ok": ok,
            "message": msg,
            "connectionState": "CONNECTED" if ok else "ERROR",
            "lastTestedAt": now,
        }

    # --------------------------------------------------------------------------- History
    def get_history(self, limit: int = 50, status: str | None = None) -> list[dict[str, Any]]:
        """Return history of dispatched and queued notifications."""
        return self.queue.get_history(limit=limit, status=status)
