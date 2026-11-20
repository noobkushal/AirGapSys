"""Slack Block Kit formatting for Clarix AI security notifications."""
from __future__ import annotations

from typing import Any
from .sanitizer import sanitize_text

SEVERITY_META = {
    "CRITICAL": {"emoji": "🚨", "color": "#e0245e", "label": "CRITICAL"},
    "HIGH": {"emoji": "⚠️", "color": "#ff5252", "label": "HIGH"},
    "MEDIUM": {"emoji": "⚡", "color": "#ff9f1a", "label": "MEDIUM"},
    "LOW": {"emoji": "ℹ️", "color": "#12b5ff", "label": "LOW"},
    "INFO": {"emoji": "ℹ️", "color": "#12b5ff", "label": "INFO"},
}

DECISION_META = {
    "BLOCK": {"label": "BLOCKED", "emoji": "🛑"},
    "BLOCKED": {"label": "BLOCKED", "emoji": "🛑"},
    "REQUIRE_APPROVAL": {"label": "APPROVAL REQUIRED", "emoji": "⏳"},
    "ALLOW": {"label": "ALLOWED", "emoji": "✅"},
    "ALLOWED": {"label": "ALLOWED", "emoji": "✅"},
    "APPROVED": {"label": "APPROVED", "emoji": "✅"},
    "DENIED": {"label": "DENIED", "emoji": "❌"},
}


def format_slack_message(
    *,
    event_type: str,
    category: str,
    severity: str,
    title: str,
    description: str,
    component: str,
    decision: str,
    event_id: str,
    timestamp: str,
    channel: str | None = None,
) -> dict[str, Any]:
    """Format a Clarix AI security event using Slack Block Kit."""
    sev = severity.upper()
    sev_info = SEVERITY_META.get(sev, SEVERITY_META["HIGH"])
    dec_info = DECISION_META.get(decision.upper(), {"label": decision.upper(), "emoji": "🔒"})

    clean_title = sanitize_text(title, 120)
    clean_desc = sanitize_text(description, 1000)
    clean_comp = sanitize_text(component, 80)
    clean_id = sanitize_text(event_id, 50)
    clean_time = sanitize_text(timestamp, 50)

    # Fallback text for notification popups and accessibility
    fallback_text = f"CLARIX AI SECURITY ALERT [{sev_info['label']}]: {clean_title} - {dec_info['label']}"

    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "🛡️ CLARIX AI SECURITY ALERT",
                "emoji": True,
            },
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"{sev_info['emoji']} *{clean_title}*\n*Severity:* `{sev_info['label']}`  |  *Decision:* `{dec_info['label']}` {dec_info['emoji']}",
            },
        },
        {
            "type": "section",
            "fields": [
                {"type": "mrkdwn", "text": f"*Event Type:*\n{event_type}"},
                {"type": "mrkdwn", "text": f"*Component:*\n{clean_comp}"},
                {"type": "mrkdwn", "text": f"*Decision:*\n`{dec_info['label']}`"},
                {"type": "mrkdwn", "text": f"*Severity:*\n`{sev_info['label']}`"},
                {"type": "mrkdwn", "text": f"*Event ID:*\n`{clean_id}`"},
                {"type": "mrkdwn", "text": f"*Timestamp:*\n{clean_time}"},
            ],
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*Description:*\n{clean_desc}",
            },
        },
        {"type": "divider"},
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": "🔒 *Clarix AI Security Core* | Outbound Relay | Air-Gap Protected Node",
                }
            ],
        },
    ]

    payload: dict[str, Any] = {
        "text": fallback_text,
        "blocks": blocks,
        "attachments": [
            {
                "color": sev_info["color"],
                "blocks": blocks,
            }
        ],
    }

    if channel and channel.strip():
        payload["channel"] = channel.strip()

    return payload
