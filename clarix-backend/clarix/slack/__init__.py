"""Slack Integration Package for Clarix AI.
Provides Slack Incoming Webhook notification capability with durable queuing,
air-gap isolation, content sanitization, and Block Kit formatting.
"""
from __future__ import annotations

from .client import SlackClient
from .formatter import format_slack_message
from .queue import SlackQueue
from .relay import SlackRelay
from .sanitizer import mask_webhook_url, sanitize_text
from .service import SlackService

__all__ = [
    "SlackClient",
    "SlackService",
    "SlackQueue",
    "SlackRelay",
    "format_slack_message",
    "sanitize_text",
    "mask_webhook_url",
]
