import re
import time
from datetime import datetime, timezone

_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def utcstamp(ts: float | None = None) -> str:
    """'YYYY-MM-DD HH:MM:SS' in UTC (all stored/displayed timestamps are UTC)."""
    return datetime.fromtimestamp(time.time() if ts is None else ts, timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def clock(ts: float | None = None) -> str:
    return utcstamp(ts)[11:]


def valid_identifier(s: str) -> bool:
    return bool(_ID_RE.match(s or ""))


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))
