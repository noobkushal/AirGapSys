from __future__ import annotations

from .config import Settings
from .context import Context


def create_context(settings: Settings | None = None, **kw) -> Context:
    return Context(settings or Settings.from_env(), **kw)


def create_app(settings: Settings | None = None):
    """ASGI app for `uvicorn clarix.app:create_app --factory`."""
    from .web.asgi import create_fastapi_app
    return create_fastapi_app(create_context(settings))
