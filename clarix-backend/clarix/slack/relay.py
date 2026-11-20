"""Isolated Slack Notification Relay Worker.
Runs as a separate worker process with dedicated egress permissions.
Does NOT install the in-process airgap guard, allowing outbound delivery to Slack when authorized.
Strict air-gap mode or disconnected networks keep items queued safely in the local database.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any

from ..db import Database
from ..util import utcstamp
from .client import SlackClient
from .formatter import format_slack_message
from .queue import SlackQueue
from .sanitizer import sanitize_text

log = logging.getLogger("clarix.slack.relay")


class SlackRelay:
    """Delivers queued security alerts to Slack from an isolated process."""

    def __init__(self, db: Database, client: SlackClient | None = None):
        self.db = db
        self.queue = SlackQueue(db)
        self.client = client or SlackClient(timeout_s=6.0)

    def get_config(self) -> dict[str, Any]:
        row = self.db.one("SELECT * FROM slack_config WHERE id=1")
        if not row:
            return {"enabled": 0, "webhook_url": "", "channel": "", "last_success_at": None, "last_error": None}
        return dict(row)

    def test_webhook_isolated(
        self,
        webhook_url: str,
        channel: str | None = None,
    ) -> tuple[bool, str]:
        """Send a test notification from the isolated process."""
        valid, msg = self.client.validate_url(webhook_url)
        if not valid:
            return False, msg

        payload = format_slack_message(
            event_type="Slack Connection Test",
            category="test",
            severity="INFO",
            title="Clarix AI Slack Integration Connected",
            description="Verification test successfully delivered from the Clarix AI Outbound Notification Relay.",
            component="Slack Relay",
            decision="ALLOWED",
            event_id=f"TEST-{int(time.time())}",
            timestamp=utcstamp(),
            channel=channel,
        )

        ok, err = self.client.send_webhook(webhook_url, payload)
        if ok:
            return True, "Test notification delivered successfully to Slack."
        return False, err or "Delivery failed."

    def process_pending_once(
        self,
        strict_airgap: bool = True,
        relay_enabled: bool = False,
    ) -> dict[str, Any]:
        """Process one batch of pending items in the durable queue.
        Enforces strict air-gap invariants.
        """
        cfg = self.get_config()
        webhook_url = (cfg.get("webhook_url") or "").strip()
        enabled = bool(cfg.get("enabled", 0))

        if not enabled or not webhook_url:
            return {"processed": 0, "sent": 0, "failed": 0, "status": "disabled"}

        # Strict Air-Gap Check:
        # If strict air-gap is active and external relay is not explicitly authorized,
        # outbound delivery is strictly prohibited. Items stay queued locally.
        if strict_airgap and not relay_enabled:
            reason = "External delivery unavailable: strict air-gap mode is active. Notifications held in local queue."
            self.db.x(
                "UPDATE slack_config SET last_error=?, updated_at=? WHERE id=1",
                (reason, utcstamp()),
            )
            log.info("Relay delivery suppressed by strict air-gap policy.")
            return {"processed": 0, "sent": 0, "failed": 0, "status": "airgap_restricted", "message": reason}

        pending = self.queue.get_pending(limit=25, now=time.time())
        if not pending:
            return {"processed": 0, "sent": 0, "failed": 0, "status": "idle"}

        sent_count = 0
        failed_count = 0

        for item in pending:
            nid = item["id"]
            try:
                payload = json.loads(item["payload_json"])
            except Exception as e:
                self.queue.mark_failed(nid, f"Corrupted payload JSON: {e}", is_final=True)
                failed_count += 1
                continue

            # Override channel if configured
            configured_channel = cfg.get("channel")
            if configured_channel and configured_channel.strip() and "channel" not in payload:
                payload["channel"] = configured_channel.strip()

            ok, err = self.client.send_webhook(webhook_url, payload)
            now_iso = utcstamp()

            if ok:
                self.queue.mark_sent(nid, now_iso)
                self.db.x(
                    "UPDATE slack_config SET last_success_at=?, last_error=NULL, updated_at=? WHERE id=1",
                    (now_iso, now_iso),
                )
                sent_count += 1
                log.info("Delivered Slack notification %s (%s)", nid, item["event_type"])
            else:
                attempts = item["attempts"] + 1
                max_att = item.get("max_attempts", 3)
                is_final = attempts >= max_att
                safe_err = sanitize_text(err or "Delivery failed", 200)

                if is_final:
                    self.queue.mark_failed(nid, safe_err, is_final=True)
                    log.warning("Notification %s failed permanently after %d attempts: %s", nid, attempts, safe_err)
                else:
                    backoff_delay = (2 ** attempts) * 3  # 6s, 12s, 24s
                    next_retry = time.time() + backoff_delay
                    self.queue.mark_failed(nid, safe_err, next_retry_at=next_retry, is_final=False)
                    log.info("Notification %s delivery failed (%d/%d); retrying in %ds", nid, attempts, max_att, backoff_delay)

                self.db.x(
                    "UPDATE slack_config SET last_error=?, updated_at=? WHERE id=1",
                    (safe_err, now_iso),
                )
                failed_count += 1

        return {
            "processed": len(pending),
            "sent": sent_count,
            "failed": failed_count,
            "status": "active",
        }


def run_relay_cli(argv: list[str] | None = None) -> int:
    """CLI runner for standalone relay process."""
    parser = argparse.ArgumentParser(prog="clarix-slack-relay", description="Clarix AI Outbound Slack Notification Relay")
    parser.add_argument("--db", default=os.environ.get("CLARIX_DB_PATH", "./data/clarix.db"), help="Path to SQLite database")
    parser.add_argument("--once", action="store_true", help="Process pending notifications once and exit")
    parser.add_argument("--daemon", action="store_true", help="Run in continuous loop")
    parser.add_argument("--interval", type=float, default=float(os.environ.get("CLARIX_SLACK_RELAY_INTERVAL_S", "3.0")), help="Poll interval in seconds")
    parser.add_argument("--test", action="store_true", help="Perform a connectivity test to the webhook URL")
    parser.add_argument("--webhook-url", default=None, help="Explicit webhook URL for testing")
    parser.add_argument("--relay-enabled", action="store_true", default=os.environ.get("CLARIX_SLACK_RELAY_ENABLED", "").lower() in ("1", "true", "yes"), help="Authorize outbound relay")
    parser.add_argument("--strict-airgap", action="store_true", default=os.environ.get("CLARIX_AIRGAP_ENFORCE", "true").lower() in ("1", "true", "yes"), help="Enforce strict airgap")

    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [Relay] %(message)s")

    db_path = Path(args.db)
    if not db_path.exists() and not args.test:
        print(f"Error: Database file '{db_path}' does not exist.", file=sys.stderr)
        return 1

    db = Database(db_path)
    relay = SlackRelay(db)

    if args.test:
        url = args.webhook_url
        if not url:
            cfg = relay.get_config()
            url = cfg.get("webhook_url")
        if not url:
            out = {"ok": False, "message": "No webhook URL provided or configured in database."}
            print(json.dumps(out))
            return 1
        ok, msg = relay.test_webhook_isolated(url)
        now_iso = utcstamp()
        if ok:
            db.x("UPDATE slack_config SET last_success_at=?, last_tested_at=?, last_error=NULL, updated_at=? WHERE id=1", (now_iso, now_iso, now_iso))
        else:
            db.x("UPDATE slack_config SET last_tested_at=?, last_error=?, updated_at=? WHERE id=1", (now_iso, msg, now_iso))
        print(json.dumps({"ok": ok, "message": msg}))
        return 0 if ok else 1

    if args.once:
        res = relay.process_pending_once(strict_airgap=args.strict_airgap, relay_enabled=args.relay_enabled)
        print(json.dumps(res))
        return 0

    log.info("Starting Clarix AI Slack Notification Relay (interval=%.1fs, relay_enabled=%s, strict_airgap=%s)",
             args.interval, args.relay_enabled, args.strict_airgap)

    try:
        while True:
            try:
                res = relay.process_pending_once(strict_airgap=args.strict_airgap, relay_enabled=args.relay_enabled)
                if res["sent"] > 0 or res["failed"] > 0:
                    log.info("Relay batch finished: %s", res)
            except Exception as e:
                log.exception("Error in relay processing loop: %s", e)
            time.sleep(args.interval)
    except KeyboardInterrupt:
        log.info("Relay process terminated by operator.")
        return 0


if __name__ == "__main__":
    sys.exit(run_relay_cli())
