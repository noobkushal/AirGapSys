"""Minimal Ollama HTTP client (stdlib only). Refuses any non-loopback base URL."""
from __future__ import annotations

import json
import urllib.error
import urllib.request

from ..airgap.guard import subsystem
from ..netutil import is_loopback_host
from urllib.parse import urlparse


class OllamaUnavailable(Exception):
    """Ollama is not reachable on loopback."""


class OllamaError(Exception):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


class OllamaClient:
    def __init__(self, base_url: str):
        host = urlparse(base_url).hostname or ""
        if not is_loopback_host(host):
            raise ValueError("Ollama must be reached over loopback only")
        self.base = base_url.rstrip("/")

    def _req(self, method: str, path: str, body: dict | None = None, timeout: float = 10):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method, headers={"Content-Type": "application/json"})
        try:
            with subsystem("ollama-client"), urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read(64 * 1024 * 1024)
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = json.loads(e.read(4096) or b"{}").get("error", "")
            except (ValueError, OSError):
                pass
            raise OllamaError(detail or f"Ollama returned HTTP {e.code}", e.code) from None
        except (urllib.error.URLError, ConnectionError, TimeoutError, OSError) as e:
            raise OllamaUnavailable(str(getattr(e, "reason", e))) from None
        try:
            return json.loads(raw or b"{}")
        except ValueError:
            raise OllamaError("Ollama returned invalid JSON") from None

    def version(self) -> str:
        return str(self._req("GET", "/api/version", timeout=3).get("version", "unknown"))

    def tags(self) -> list[dict]:
        return list(self._req("GET", "/api/tags", timeout=5).get("models", []))

    def ps(self) -> list[dict]:
        return list(self._req("GET", "/api/ps", timeout=5).get("models", []))

    def show(self, model: str) -> dict:
        return self._req("POST", "/api/show", {"model": model}, timeout=10)

    def resolve_model(self, wanted: str) -> str:
        names = [m.get("name") or m.get("model") for m in self.tags()]
        for n in names:
            if n == wanted:
                return n
        for n in names:
            if n and n.split(":")[0] == wanted.split(":")[0]:
                return n
        raise OllamaError(f"Model '{wanted}' is not installed. Run `ollama pull {wanted}` (while connected) or copy it onto this host.", 404)

    def pick_chat_model(self, wanted: str | None, default: str) -> tuple[str, str | None]:
        """Return (installed chat model, note). Falls back to the configured default, then to any installed chat model."""
        chat_models = [n for n in (m.get("name") or m.get("model") for m in self.tags()) if n and "embed" not in n.lower()]
        for cand in dict.fromkeys(c for c in (wanted, default) if c):
            try:
                got = self.resolve_model(cand)
            except OllamaError:
                continue
            if "embed" in got.lower():
                continue
            return got, (None if cand == wanted else f"Requested model '{wanted}' is not installed; used '{got}' instead.")
        if chat_models:
            return chat_models[0], f"Requested model '{wanted or default}' is not installed; used '{chat_models[0]}' instead."
        raise OllamaError("No chat model is installed in Ollama. Run `ollama pull qwen3:4b` (or copy a model onto this host).", 404)

    def chat(self, model: str, messages: list[dict], *, temperature: float = 0.2, top_p: float = 0.9, num_predict: int = 768, timeout: float = 120) -> dict:
        body = {"model": model, "messages": messages, "stream": False, "think": False,  # skip long hidden reasoning (Qwen3 etc.)
                "options": {"temperature": temperature, "top_p": top_p, "num_predict": num_predict}}
        try:
            return self._req("POST", "/api/chat", body, timeout=timeout)
        except OllamaError as e:
            if e.status == 400 and "think" in str(e).lower():  # older/other models reject the flag: retry without it
                body.pop("think")
                return self._req("POST", "/api/chat", body, timeout=timeout)
            raise

    def embed(self, model: str, texts: list[str]) -> list[list[float]]:
        try:
            out = self._req("POST", "/api/embed", {"model": model, "input": texts}, timeout=120).get("embeddings")
            if out and len(out) == len(texts):
                return out
        except OllamaError as e:
            if e.status not in (404, 405):
                raise
        return [self._req("POST", "/api/embeddings", {"model": model, "prompt": t}, timeout=120)["embedding"] for t in texts]
