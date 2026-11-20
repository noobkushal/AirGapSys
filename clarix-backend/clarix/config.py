"""Settings come from environment variables (see .env.example). Defaults are the safe ones."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

from .netutil import is_loopback_host


class ConfigError(RuntimeError):
    pass


def load_dotenv(path: Path, env: dict) -> list[str]:
    """Minimal .env reader: KEY=VALUE lines, # comments, optional quotes/`export`. Never overrides real env vars."""
    loaded: list[str] = []
    if not path.is_file():
        return loaded
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip()
        if val[:1] in ("'", '"') and val.endswith(val[:1]) and len(val) >= 2:
            val = val[1:-1]
        else:
            val = val.split(" #", 1)[0].strip()
        if key and key not in env:
            env[key] = val
            loaded.append(key)
    return loaded


def _bool(v: str | None, default: bool) -> bool:
    return default if v is None else v.strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class Settings:
    host: str = "127.0.0.1"
    port: int = 8000
    data_dir: Path = Path("./data")
    ollama_url: str = "http://127.0.0.1:11434"
    default_model: str = "llama3"
    embed_model: str = "nomic-embed-text"
    embed_backend: str = "auto"  # auto | ollama | hash
    cors_origins: tuple[str, ...] = ("http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173")
    api_tokens: dict = field(default_factory=dict)  # token -> operator id; empty = dev mode (no auth)
    approval_timeout_s: int = 300
    airgap_enforce: bool = True
    demo_endpoints: bool = True
    max_upload_bytes: int = 20 * 1024 * 1024
    max_json_bytes: int = 1024 * 1024
    telemetry_interval_s: float = 30.0
    rate_limit_per_min: int = 60
    chat_timeout_s: float = 120.0
    rag_min_score_neural: float = 0.30   # cosine; drops clearly irrelevant passages. Tune for your embedding model
    rag_min_score_lexical: float = 0.10  # for the word-overlap fallback embedder
    slack_enabled: bool = False
    slack_webhook_url: str = ""
    slack_channel: str = ""
    slack_relay_enabled: bool = False
    slack_relay_interval_s: float = 3.0

    @property
    def workspace(self) -> Path:
        return self.data_dir / "workspace"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "clarix.db"

    @property
    def auth_enabled(self) -> bool:
        return bool(self.api_tokens)

    @classmethod
    def from_env(cls, env: dict | None = None) -> "Settings":
        if env is None:
            for candidate in (Path(os.environ.get("CLARIX_ENV_FILE", ".env")), Path(__file__).resolve().parents[1] / ".env"):
                load_dotenv(candidate, os.environ)
        e = os.environ if env is None else env
        tokens: dict[str, str] = {}
        if e.get("CLARIX_API_TOKEN"):
            tokens[e["CLARIX_API_TOKEN"]] = "operator"
        for pair in filter(None, (e.get("CLARIX_OPERATOR_TOKENS") or "").split(",")):
            name, _, tok = pair.partition(":")
            if not name.strip() or len(tok.strip()) < 16:
                raise ConfigError("CLARIX_OPERATOR_TOKENS entries must look like 'alice:<token of 16+ chars>'")
            tokens[tok.strip()] = name.strip()
        s = cls(
            host=e.get("CLARIX_HOST", "127.0.0.1"),
            port=int(e.get("CLARIX_PORT", "8000")),
            data_dir=Path(e.get("CLARIX_DATA_DIR", "./data")),
            ollama_url=e.get("CLARIX_OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/"),
            default_model=e.get("CLARIX_DEFAULT_MODEL", "llama3"),
            embed_model=e.get("CLARIX_EMBED_MODEL", "nomic-embed-text"),
            embed_backend=e.get("CLARIX_EMBED_BACKEND", "auto"),
            cors_origins=tuple(x.strip() for x in e.get("CLARIX_CORS_ORIGINS", ",".join(cls.cors_origins)).split(",") if x.strip()),
            api_tokens=tokens,
            approval_timeout_s=int(e.get("CLARIX_APPROVAL_TIMEOUT_S", "300")),
            airgap_enforce=_bool(e.get("CLARIX_AIRGAP_ENFORCE"), True),
            demo_endpoints=_bool(e.get("CLARIX_DEMO_ENDPOINTS"), True),
            max_upload_bytes=int(e.get("CLARIX_MAX_UPLOAD_MB", "20")) * 1024 * 1024,
            telemetry_interval_s=float(e.get("CLARIX_TELEMETRY_INTERVAL_S", "30")),
            rate_limit_per_min=int(e.get("CLARIX_RATE_LIMIT_PER_MIN", "60")),
            rag_min_score_neural=float(e.get("CLARIX_RAG_MIN_SCORE_NEURAL", "0.30")),
            rag_min_score_lexical=float(e.get("CLARIX_RAG_MIN_SCORE_LEXICAL", "0.10")),
            slack_enabled=_bool(e.get("CLARIX_SLACK_ENABLED"), False),
            slack_webhook_url=e.get("CLARIX_SLACK_WEBHOOK_URL", ""),
            slack_channel=e.get("CLARIX_SLACK_CHANNEL", ""),
            slack_relay_enabled=_bool(e.get("CLARIX_SLACK_RELAY_ENABLED"), False),
            slack_relay_interval_s=float(e.get("CLARIX_SLACK_RELAY_INTERVAL_S", "3.0")),
        )
        s.validate(allow_non_loopback=_bool(e.get("CLARIX_ALLOW_NON_LOOPBACK"), False))
        return s

    def validate(self, allow_non_loopback: bool = False) -> None:
        if not is_loopback_host(self.host) and not allow_non_loopback:
            raise ConfigError(
                f"CLARIX_HOST={self.host!r} is not loopback. This service is designed for an air-gapped host; "
                "set CLARIX_ALLOW_NON_LOOPBACK=1 only if you accept exposing it on a LAN."
            )
        parsed = urlparse(self.ollama_url)
        if parsed.scheme not in ("http", "https") or not is_loopback_host(parsed.hostname or ""):
            raise ConfigError("CLARIX_OLLAMA_URL must point at a loopback address (e.g. http://127.0.0.1:11434).")
        if self.embed_backend not in ("auto", "ollama", "hash"):
            raise ConfigError("CLARIX_EMBED_BACKEND must be auto, ollama or hash.")
        if self.approval_timeout_s < 10:
            raise ConfigError("CLARIX_APPROVAL_TIMEOUT_S must be at least 10.")
        for tok in self.api_tokens:
            if len(tok) < 16:
                raise ConfigError("API tokens must be at least 16 characters.")
