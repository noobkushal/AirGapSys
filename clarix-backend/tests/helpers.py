import json
import shutil
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from clarix.airgap import guard
from clarix.config import Settings
from clarix.context import Context
from clarix.rag.embedder import hash_embed


class FakeOllama:
    """Speaks the Ollama HTTP API shape (version/tags/ps/show/chat/embed) on a loopback port."""

    def __init__(self):
        self.calls: list[tuple[str, dict]] = []
        self.chat_script: list[str] = []          # queued model replies
        self.reject_think = False                 # emulate models that 400 on the `think` flag
        self.models = [{"name": "llama3:latest", "size": 4_700_000_000, "details": {"parameter_size": "8.0B"}},
                       {"name": "nomic-embed-text:latest", "size": 274_000_000, "details": {"parameter_size": "137M"}}]
        outer = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a): pass

            def _json(self, obj, code=200):
                raw = json.dumps(obj).encode()
                self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(raw))); self.end_headers(); self.wfile.write(raw)

            def do_GET(self):
                outer.calls.append((self.path, {}))
                if self.path == "/api/version": return self._json({"version": "0.4.1-fake"})
                if self.path == "/api/tags": return self._json({"models": outer.models})
                if self.path == "/api/ps": return self._json({"models": [{"name": "llama3:latest", "size": 5_000_000_000, "size_vram": 2_500_000_000}]})
                self._json({"error": "not found"}, 404)

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
                outer.calls.append((self.path, body))
                if self.path == "/api/show": return self._json({"model_info": {"llama.context_length": 8192}})
                if self.path == "/api/embed": return self._json({"embeddings": [hash_embed(t) for t in body["input"]]})
                if self.path == "/api/chat":
                    if outer.reject_think and "think" in body:
                        return self._json({"error": f"\"{body['model']}\" does not support thinking"}, 400)
                    reply = outer.chat_script.pop(0) if outer.chat_script else "OK: " + body["messages"][-1]["content"][:40]
                    return self._json({"message": {"role": "assistant", "content": reply}, "eval_count": 40, "eval_duration": 1_000_000_000,
                                       "total_duration": 1_500_000_000, "load_duration": 100_000_000, "prompt_eval_duration": 50_000_000})
                self._json({"error": "not found"}, 404)

        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.port = self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    @property
    def url(self): return f"http://127.0.0.1:{self.port}"

    def chat_calls(self): return [c for c in self.calls if c[0] == "/api/chat"]
    def stop(self): self.srv.shutdown(); self.srv.server_close()


class Env(unittest.TestCase):
    """Fresh data dir + Context + fake Ollama per test."""
    tokens: dict = {}

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="clarix_t_"))
        self.fake = FakeOllama()
        self.settings = Settings(data_dir=self.tmp, ollama_url=self.fake.url, api_tokens=dict(self.tokens), approval_timeout_s=30, rate_limit_per_min=1000,
                                 rag_min_score_neural=0.08, rag_min_score_lexical=0.08)  # the fake's word-hash vectors score lower than real embeddings
        self.ctx = Context(self.settings, install_guard=True)
        self.addCleanup(self._clean)

    def _clean(self):
        self.ctx.close(); self.ctx.db.close(); self.fake.stop(); shutil.rmtree(self.tmp, ignore_errors=True)

    def audit_actions(self): return [e["action"] for e in self.ctx.audit.list()]
