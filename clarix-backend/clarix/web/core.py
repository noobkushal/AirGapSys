"""Framework-neutral HTTP layer: route table, auth, rate limiting, error mapping, multipart parsing."""
from __future__ import annotations

import email
import email.policy
import hmac
import json
import logging
import re
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any, Callable

from ..errors import ApiError, bad_request

log = logging.getLogger("clarix.web")


@dataclass
class Request:
    method: str
    path: str
    headers: dict = field(default_factory=dict)   # lower-case keys
    query: dict = field(default_factory=dict)
    body: bytes = b""
    client: str = "unknown"
    params: dict = field(default_factory=dict)
    form: dict = field(default_factory=dict)
    files: dict = field(default_factory=dict)     # field -> (filename, bytes)
    operator: str = "dev-operator"

    def json(self) -> dict:
        try:
            v = json.loads(self.body or b"{}")
        except (ValueError, UnicodeDecodeError):
            raise bad_request("Request body must be valid JSON") from None
        if not isinstance(v, dict):
            raise bad_request("Request body must be a JSON object")
        return v


@dataclass
class Route:
    method: str
    path: str
    handler: Callable
    summary: str
    tag: str
    public: bool = False
    rate: str | None = None
    regex: re.Pattern = field(init=False)

    def __post_init__(self):
        self.regex = re.compile("^" + re.sub(r"\{(\w+)\}", r"(?P<\1>[^/]+)", self.path) + "$")


def parse_multipart(content_type: str, body: bytes) -> tuple[dict, dict]:
    msg = email.message_from_bytes(b"Content-Type: " + content_type.encode("latin-1", "ignore") + b"\r\nMIME-Version: 1.0\r\n\r\n" + body, policy=email.policy.HTTP)
    if not msg.is_multipart():
        raise bad_request("Malformed multipart body")
    form, files = {}, {}
    for part in msg.iter_parts():
        if part.get_content_disposition() != "form-data":
            continue
        name = part.get_param("name", header="content-disposition")
        if not name:
            continue
        payload = part.get_payload(decode=True) or b""
        fn = part.get_filename()
        if fn:
            files[name] = (fn, payload)
        else:
            form[name] = payload.decode("utf-8", "replace")
    return form, files


class RateLimiter:
    def __init__(self, per_min: int):
        self.per_min, self.hits, self.lock = per_min, defaultdict(deque), threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self.lock:
            q = self.hits[key]
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= self.per_min:
                return False
            q.append(now)
            return True


def _resolve(routes: list[Route], method: str, path: str) -> tuple[Route, dict]:
    allowed = []
    for r in routes:
        m = r.regex.match(path)
        if m:
            if r.method == method:
                return r, m.groupdict()
            allowed.append(r.method)
    if allowed:
        raise ApiError(405, "method_not_allowed", f"Allowed: {', '.join(sorted(set(allowed)))}")
    raise ApiError(404, "not_found", "No such endpoint")


def authenticate(ctx, req: Request, route: Route) -> str:
    tokens = ctx.settings.api_tokens
    if not tokens or route.public:
        return req.operator if not tokens else "anonymous"
    h = req.headers.get("authorization", "")
    given = h[7:].strip() if h.lower().startswith("bearer ") else ""
    found = None
    for tok, who in tokens.items():  # compare against all tokens: no early exit leaks which matched
        if hmac.compare_digest(given.encode(), tok.encode()):
            found = who
    if not found:
        raise ApiError(401, "unauthorized", "A valid bearer token is required")
    return found


class Dispatcher:
    def __init__(self, ctx, routes: list[Route]):
        self.ctx, self.routes = ctx, routes
        self.limiter = RateLimiter(ctx.settings.rate_limit_per_min)

    def __call__(self, req: Request) -> tuple[int, Any, dict]:
        try:
            route, params = _resolve(self.routes, req.method, req.path)
            req.params = params
            req.operator = authenticate(self.ctx, req, route)
            if route.rate and not self.limiter.allow(f"{route.rate}:{req.client}:{req.operator}"):
                raise ApiError(429, "rate_limited", "Too many requests. Slow down.")
            out = route.handler(self.ctx, req)
            return 200, out, {}
        except ApiError as e:
            hdr = {"WWW-Authenticate": "Bearer"} if e.status == 401 else {}
            return e.status, {"error": {"code": e.code, "message": e.message}}, hdr
        except Exception:  # never leak internals to the client
            log.exception("Unhandled error for %s %s", req.method, req.path)
            return 500, {"error": {"code": "internal", "message": "Internal server error"}}, {}
