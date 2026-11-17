"""python -m clarix [--server fastapi|stdlib] [--check]"""
from __future__ import annotations

import argparse
import json
import logging
import sys

from .airgap import guard, monitor
from .app import create_app, create_context
from .config import ConfigError, Settings


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="clarix")
    ap.add_argument("--server", choices=["fastapi", "stdlib"], default="fastapi")
    ap.add_argument("--check", action="store_true", help="print configuration, host air-gap posture and Ollama reachability, then exit")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    try:
        settings = Settings.from_env()
    except ConfigError as e:
        print(f"Configuration error: {e}", file=sys.stderr)
        return 2
    if a.check:
        ctx = create_context(settings)
        try:
            ollama = {"reachable": True, "version": ctx.ollama.version()}
        except Exception as e:
            ollama = {"reachable": False, "error": str(e)}
        print(json.dumps({"host": settings.host, "port": settings.port, "dataDir": str(settings.data_dir), "authEnabled": settings.auth_enabled,
                          "guard": guard.status(), "posture": monitor.posture(guard.status()), "ollama": ollama,
                          "auditChain": ctx.audit.verify()}, indent=2, default=str))
        return 0
    if a.server == "fastapi":
        try:
            import uvicorn
            app = create_app(settings)
        except ImportError as e:
            print(f"FastAPI/uvicorn not installed ({e}). Run `pip install -r requirements.txt`, or use --server stdlib for the dependency-free server.", file=sys.stderr)
            return 3
        uvicorn.run(app, host=settings.host, port=settings.port, log_level="info", server_header=False)
        return 0
    from .web.stdlib_server import make_server
    ctx = create_context(settings)
    ctx.start()
    srv = make_server(ctx)
    logging.getLogger("clarix").info("stdlib server on http://%s:%s (development fallback)", *srv.server_address[:2])
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        ctx.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
