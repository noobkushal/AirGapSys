"""Zero-dependency HTTP server over the same route table (dev fallback and the test harness)."""
from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qsl, urlsplit

from ..errors import ApiError
from .core import Dispatcher, Request, parse_multipart
from .routes import ROUTES


def cors_headers(origin: str | None, allowed: tuple[str, ...]) -> dict:
    if origin and origin in allowed:
        return {"Access-Control-Allow-Origin": origin, "Vary": "Origin", "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "600"}
    return {"Vary": "Origin"}


def build_request(method: str, target: str, headers: dict, body: bytes, client: str) -> Request:
    u = urlsplit(target)
    req = Request(method=method, path=u.path, headers=headers, query=dict(parse_qsl(u.query)), body=body, client=client)
    ct = headers.get("content-type", "")
    if ct.lower().startswith("multipart/form-data") and body:
        req.form, req.files = parse_multipart(ct, body)
    return req


def make_server(ctx, host: str | None = None, port: int | None = None) -> ThreadingHTTPServer:
    dispatch = Dispatcher(ctx, ROUTES)
    allowed = ctx.settings.cors_origins

    class H(BaseHTTPRequestHandler):
        server_version = "Clarix"
        sys_version = ""
        protocol_version = "HTTP/1.1"

        def log_message(self, *a):
            pass

        def _send(self, status: int, payload, extra: dict | None = None):
            raw = json.dumps(payload, ensure_ascii=False).encode()
            self.send_response(status)
            for k, v in {"Content-Type": "application/json; charset=utf-8", "Content-Length": str(len(raw)), "Cache-Control": "no-store",
                         "X-Content-Type-Options": "nosniff", **cors_headers(self.headers.get("Origin"), allowed), **(extra or {})}.items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(raw)

        def _handle(self):
            if self.command == "OPTIONS":
                self.send_response(204)
                for k, v in cors_headers(self.headers.get("Origin"), allowed).items():
                    self.send_header(k, v)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            headers = {k.lower(): v for k, v in self.headers.items()}
            try:
                n = int(headers.get("content-length", "0") or 0)
            except ValueError:
                return self._send(400, {"error": {"code": "bad_request", "message": "Bad Content-Length"}})
            cap = ctx.settings.max_upload_bytes if headers.get("content-type", "").lower().startswith("multipart/") else ctx.settings.max_json_bytes
            if n > cap:
                drained = 0  # read (and discard) a bounded amount so the client sees our 413, not a broken pipe
                while drained < min(n, 4 * cap):
                    chunk = self.rfile.read(min(65536, min(n, 4 * cap) - drained))
                    if not chunk:
                        break
                    drained += len(chunk)
                self.close_connection = True
                return self._send(413, {"error": {"code": "too_large", "message": f"Body exceeds {cap} bytes"}})
            body = self.rfile.read(n) if n else b""
            try:
                req = build_request(self.command, self.path, headers, body, self.client_address[0])
            except ApiError as e:
                return self._send(e.status, {"error": {"code": e.code, "message": e.message}})
            status, payload, extra = dispatch(req)
            self._send(status, payload, extra)

        do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = _handle

    srv = ThreadingHTTPServer((host or ctx.settings.host, ctx.settings.port if port is None else port), H)
    srv.daemon_threads = True
    return srv
