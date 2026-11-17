"""Embeddings: Ollama (semantic, local) with a clearly-labelled lexical fallback."""
from __future__ import annotations

import hashlib
import math
import re
from array import array

from ..llm.ollama import OllamaClient, OllamaError, OllamaUnavailable

HASH_MODEL, HASH_DIM = "hash-lexical-v1", 384
_TOK = re.compile(r"[a-z0-9]{2,}")


def pack(vec: list[float]) -> bytes:
    return array("f", vec).tobytes()


def unpack(blob: bytes) -> list[float]:
    a = array("f")
    a.frombytes(blob)
    return list(a)


def normalise(v: list[float]) -> list[float]:
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def hash_embed(text: str) -> list[float]:
    """Signed feature hashing of word unigrams+bigrams. Lexical overlap only: NOT semantic."""
    toks = _TOK.findall(text.lower())
    v = [0.0] * HASH_DIM
    for t in toks + [f"{a}_{b}" for a, b in zip(toks, toks[1:])]:
        h = int.from_bytes(hashlib.blake2b(t.encode(), digest_size=8).digest(), "big")
        v[h % HASH_DIM] += 1.0 if (h >> 63) & 1 else -1.0
    return normalise(v)


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b)) if len(a) == len(b) else 0.0


class Embedder:
    def __init__(self, client: OllamaClient, model: str, backend: str):
        self.client, self.model, self.backend = client, model, backend

    def embed_documents(self, texts: list[str]) -> tuple[list[list[float]], str]:
        if self.backend in ("auto", "ollama"):
            try:
                installed = self.client.resolve_model(self.model)
                return [normalise(v) for v in self.client.embed(installed, texts)], self.model
            except (OllamaUnavailable, OllamaError):
                if self.backend == "ollama":
                    raise
        return [hash_embed(t) for t in texts], HASH_MODEL

    def embed_query(self, text: str, model: str) -> list[float]:
        if model == HASH_MODEL:
            return hash_embed(text)
        return normalise(self.client.embed(self.client.resolve_model(model), [text])[0])
