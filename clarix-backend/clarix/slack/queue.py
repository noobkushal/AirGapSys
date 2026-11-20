"""Durable SQLite queue for Slack notifications.
Stores pending events, guarantees deduplication, handles retries with backoff, and tracks history.
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from typing import Any

from ..db import Database
from ..util import utcstamp

log = logging.getLogger("clarix.slack.queue")


class SlackQueue:
    """Manages the local durable queue in SQLite for outbound Slack alerts."""

    def __init__(self, db: Database):
        self.db = db
        self._lock = threading.Lock()

    def enqueue(
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
        payload: dict[str, Any],
        max_attempts: int = 3,
    ) -> str | None:
        """Enqueue an event into the durable SQLite queue.
        Guarantees deduplication. Returns notification ID if queued, None if duplicate.
        """
        # Deduplication key across event type, event ID, and decision
        dedup_src = f"{category}:{event_type}:{event_id}:{decision}"
        dedup_hash = hashlib.sha256(dedup_src.encode("utf-8")).hexdigest()

        with self._lock, self.db.tx() as c:
            existing = c.execute(
                "SELECT id, status, timestamp, attempts FROM slack_notifications WHERE dedup_hash=?",
                (dedup_hash,),
            ).fetchone()

            if existing:
                # If already pending or sent, suppress duplicate
                if existing["status"] in ("PENDING", "SENT"):
                    log.info("Duplicate Slack notification suppressed for %s (id: %s)", dedup_src, existing["id"])
                    return None
                # If failed recently, avoid storming Slack
                log.info("Slack notification %s was previously %s; re-queueing", existing["id"], existing["status"])

            count_row = c.execute("SELECT COUNT(*) n FROM slack_notifications").fetchone()
            seq = (count_row["n"] if count_row else 0) + 1
            nid = f"SLK-{seq:06d}"
            now_iso = utcstamp()
            payload_json = json.dumps(payload, ensure_ascii=False)

            if existing:
                # Update existing row to re-queue
                c.execute(
                    """UPDATE slack_notifications SET
                       title=?, description=?, component=?, decision=?, timestamp=?,
                       payload_json=?, status='PENDING', attempts=0, next_retry_at=0, error=NULL
                       WHERE dedup_hash=?""",
                    (title, description, component, decision, now_iso, payload_json, dedup_hash),
                )
                return existing["id"]

            c.execute(
                """INSERT INTO slack_notifications(
                     id, event_type, category, severity, title, description,
                     component, decision, event_id, timestamp, payload_json,
                     status, attempts, max_attempts, next_retry_at, dedup_hash
                   ) VALUES (?,?,?,?,?,?,?,?,?,?,?,'PENDING',0,?,0,?)""",
                (
                    nid,
                    event_type,
                    category,
                    severity,
                    title,
                    description,
                    component,
                    decision,
                    event_id,
                    now_iso,
                    payload_json,
                    max_attempts,
                    dedup_hash,
                ),
            )
            log.info("Enqueued Slack notification %s for event %s", nid, event_id)
            return nid

    def get_pending(self, limit: int = 20, now: float | None = None) -> list[dict[str, Any]]:
        """Fetch pending notifications eligible for delivery (next_retry_at <= now)."""
        ts = time.time() if now is None else now
        rows = self.db.q(
            """SELECT * FROM slack_notifications
               WHERE status='PENDING' AND next_retry_at <= ?
               ORDER BY timestamp ASC LIMIT ?""",
            (ts, limit),
        )
        return [dict(r) for r in rows]

    def mark_sent(self, nid: str, sent_at: str | None = None) -> None:
        """Mark a notification as successfully delivered."""
        now_iso = sent_at or utcstamp()
        self.db.x(
            """UPDATE slack_notifications
               SET status='SENT', sent_at=?, error=NULL, attempts=attempts+1
               WHERE id=?""",
            (now_iso, nid),
        )

    def mark_failed(
        self,
        nid: str,
        error: str,
        next_retry_at: float | None = None,
        is_final: bool = False,
    ) -> None:
        """Record a delivery failure and either schedule retry or mark FAILED."""
        new_status = "FAILED" if is_final else "PENDING"
        retry_time = 0.0 if is_final else (next_retry_at or 0.0)
        self.db.x(
            """UPDATE slack_notifications
               SET status=?, error=?, next_retry_at=?, attempts=attempts+1
               WHERE id=?""",
            (new_status, str(error)[:300], retry_time, nid),
        )

    def mark_blocked_airgap(self, nid: str, reason: str) -> None:
        """Mark notification as held locally due to air-gap restrictions."""
        self.db.x(
            """UPDATE slack_notifications
               SET status='BLOCKED_AIRGAP', error=?
               WHERE id=?""",
            (str(reason)[:300], nid),
        )

    def get_history(self, limit: int = 50, status: str | None = None) -> list[dict[str, Any]]:
        """Return notification history formatted for the frontend."""
        sql = "SELECT * FROM slack_notifications"
        params: list[Any] = []
        if status:
            sql += " WHERE status=?"
            params.append(status)
        sql += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)

        rows = self.db.q(sql, params)
        out = []
        for r in rows:
            out.append({
                "id": r["id"],
                "eventType": r["event_type"],
                "category": r["category"],
                "severity": r["severity"],
                "title": r["title"],
                "description": r["description"],
                "component": r["component"],
                "decision": r["decision"],
                "eventId": r["event_id"],
                "timestamp": r["timestamp"],
                "status": r["status"],
                "attempts": r["attempts"],
                "sentAt": r["sent_at"],
                "error": r["error"],
            })
        return out

    def get_stats(self) -> dict[str, int]:
        """Return counts by status."""
        r = self.db.one(
            """SELECT
                 COUNT(*) total,
                 SUM(status='PENDING') pending,
                 SUM(status='SENT') sent,
                 SUM(status='FAILED') failed,
                 SUM(status='BLOCKED_AIRGAP') blocked_airgap
               FROM slack_notifications"""
        )
        return {
            "total": r["total"] or 0,
            "pending": r["pending"] or 0,
            "sent": r["sent"] or 0,
            "failed": r["failed"] or 0,
            "blockedAirgap": r["blocked_airgap"] or 0,
        }
