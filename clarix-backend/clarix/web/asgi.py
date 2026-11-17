"""FastAPI adapter (production). It owns no business logic: every route funnels into Dispatcher,
the same code path exercised by the stdlib-server test-suite. Request bodies (including multipart) are
read with a hard size cap and parsed by our own tested parser, so python-multipart/pydantic are not used."""
import json
from contextlib import asynccontextmanager

from .core import Dispatcher, Request
from .routes import ROUTES
from .stdlib_server import build_request


def create_fastapi_app(ctx):
    from fastapi import FastAPI, Request as FRequest
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import Response
    from starlette.concurrency import run_in_threadpool

    from .. import __version__

    dispatch = Dispatcher(ctx, ROUTES)

    @asynccontextmanager
    async def lifespan(app):
        ctx.start()
        try:
            yield
        finally:
            ctx.close()

    app = FastAPI(title="Clarix AI Backend", version=__version__, lifespan=lifespan,
                  description="Air-gapped, policy-enforced local AI agent harness. All routes are served by a framework-neutral dispatcher.",
                  docs_url="/docs" if not ctx.settings.auth_enabled else None, redoc_url=None, openapi_url="/openapi.json" if not ctx.settings.auth_enabled else None)
    app.add_middleware(CORSMiddleware, allow_origins=list(ctx.settings.cors_origins), allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                       allow_headers=["Authorization", "Content-Type"], allow_credentials=False, max_age=600)

    def make_endpoint():
        async def endpoint(request: FRequest):
            ct = request.headers.get("content-type", "")
            cap = ctx.settings.max_upload_bytes if ct.lower().startswith("multipart/") else ctx.settings.max_json_bytes
            body = b""
            async for chunk in request.stream():
                body += chunk
                if len(body) > cap:
                    return Response(json.dumps({"error": {"code": "too_large", "message": f"Body exceeds {cap} bytes"}}), 413, media_type="application/json")
            client = request.client.host if request.client else "unknown"
            qs = request.url.query
            target = request.url.path + (f"?{qs}" if qs else "")
            try:
                req: Request = build_request(request.method, target, {k.lower(): v for k, v in request.headers.items()}, body, client)
            except Exception as e:  # ApiError from malformed multipart
                status = getattr(e, "status", 400)
                return Response(json.dumps({"error": {"code": getattr(e, "code", "bad_request"), "message": getattr(e, "message", "Bad request")}}), status, media_type="application/json")
            status, payload, extra = await run_in_threadpool(dispatch, req)
            return Response(json.dumps(payload, ensure_ascii=False), status, media_type="application/json",
                            headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", **extra})
        return endpoint

    for r in ROUTES:
        app.add_api_route(r.path, make_endpoint(), methods=[r.method], summary=r.summary, tags=[r.tag], response_model=None)
    return app
