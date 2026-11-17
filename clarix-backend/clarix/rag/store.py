from __future__ import annotations

import hashlib
import re
from pathlib import Path

from ..audit import AuditLog
from ..classification import norm_class
from ..db import Database
from ..errors import ApiError, bad_request, unavailable
from ..llm.ollama import OllamaError, OllamaUnavailable
from ..security import injection
from ..util import utcstamp
from .embedder import Embedder, cosine, pack, unpack
from .loaders import chunk_text, extract_pages

_NAME_OK = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]{0,119}$")
MAX_CHUNKS = 3000


def safe_name(name: str) -> str:
    base = Path((name or "").replace("\\", "/")).name.strip()
    if not _NAME_OK.match(base) or ".." in base:
        raise bad_request("File name may use letters, digits, space, dot, dash and underscore only (max 120 characters)")
    return base


class RagStore:
    def __init__(self, db: Database, audit: AuditLog, embedder: Embedder, workspace: Path, max_bytes: int):
        self.db, self.audit, self.embedder, self.workspace, self.max_bytes = db, audit, embedder, workspace, max_bytes

    def documents(self) -> list[dict]:
        pages = {r["doc_name"]: r["mp"] for r in self.db.q("SELECT doc_name, MAX(page) mp FROM rag_chunks GROUP BY doc_name")}
        return [{"name": r["name"], "sizeKb": r["size_kb"], "chunks": r["chunks"], "status": r["status"], "trust": r["trust"],
                 "classification": r["classification"], "lastIndexed": r["last_indexed"], "embeddingModel": r["embedding_model"],
                 "flaggedChunks": r["flagged_chunks"], "pages": pages.get(r["name"], 1)}
                for r in self.db.q("SELECT * FROM rag_documents ORDER BY last_indexed DESC")]

    def locator(self, doc: str, page: int, chunk_id: int) -> dict:
        """Human-readable position. Page numbers are only real for PDFs (and text with form-feed pages); other
        formats have no pages, so they are located by section instead of inventing a page number."""
        r = self.db.one("SELECT COUNT(*) n, MAX(page) mp FROM rag_chunks WHERE doc_name=?", (doc,))
        idx = self.db.one("SELECT COUNT(*) n FROM rag_chunks WHERE doc_name=? AND id<=?", (doc, chunk_id))["n"]
        paginated = doc.lower().endswith(".pdf") or (r["mp"] or 1) > 1
        return {"paginated": paginated, "chunkIndex": idx, "chunkTotal": r["n"], "locator": f"p. {page}" if paginated else f"section {idx}/{r['n']}"}

    def classification_of(self, name: str) -> str | None:
        r = self.db.one("SELECT classification FROM rag_documents WHERE name=?", (name,))
        return r["classification"] if r else None

    def ingest(self, filename: str, data: bytes, classification: str, actor: str) -> dict:
        name = safe_name(filename)
        try:
            cls = norm_class(classification)
        except ValueError as e:
            raise bad_request(str(e)) from None
        if not data:
            raise bad_request("The file is empty")
        if len(data) > self.max_bytes:
            raise ApiError(413, "too_large", f"File exceeds the {self.max_bytes // (1024 * 1024)} MB limit")
        pages = extract_pages(name, data)
        pieces: list[tuple[int, str]] = [(pg, c) for pg, txt in pages for c in chunk_text(txt)]
        if not pieces:
            raise bad_request("No extractable text was found in this file")
        if len(pieces) > MAX_CHUNKS:
            raise ApiError(413, "too_large", f"Document produces more than {MAX_CHUNKS} chunks")
        flags = [injection.scan(t, "RETRIEVED_DATA").decision == "BLOCK" for _, t in pieces]
        try:
            vectors, model = self.embedder.embed_documents([t for _, t in pieces])
        except (OllamaUnavailable, OllamaError) as e:
            raise unavailable(f"Embedding model unavailable: {e}", "embedding_unavailable") from None
        self.workspace.mkdir(parents=True, exist_ok=True)
        (self.workspace / name).write_bytes(data)  # lets the sandboxed file reader see ingested documents
        with self.db.tx() as c:
            c.execute("DELETE FROM rag_documents WHERE name=?", (name,))  # cascades to chunks
            c.execute("INSERT INTO rag_documents(name,size_kb,chunks,status,trust,classification,last_indexed,embedding_model,sha256,flagged_chunks)"
                      " VALUES(?,?,?,?,?,?,?,?,?,?)",
                      (name, max(1, round(len(data) / 1024)), len(pieces), "INDEXED", "LOCAL_DOCUMENT", cls, utcstamp(), model,
                       hashlib.sha256(data).hexdigest(), sum(flags)))
            c.executemany("INSERT INTO rag_chunks(doc_name,page,text,embedding,dim,flagged) VALUES(?,?,?,?,?,?)",
                          [(name, pg, t, pack(v), len(v), 1 if f else 0) for (pg, t), v, f in zip(pieces, vectors, flags)])
        self.audit.append(user=actor, action=f"Document ingested: {name} ({len(pieces)} chunks, {sum(flags)} quarantined)", component="Local RAG",
                          risk="MEDIUM" if any(flags) else "LOW", decision="ALLOW", classification=cls, payload=f"rag:ingest:{name}:{hashlib.sha256(data).hexdigest()[:16]}")
        return next(d for d in self.documents() if d["name"] == name)

    def search(self, query: str, k: int = 5) -> list[dict]:
        q = (query or "").strip()
        if not q:
            raise bad_request("Query is empty")
        models = [r["embedding_model"] for r in self.db.q("SELECT DISTINCT embedding_model FROM rag_documents")]
        scored: list[dict] = []
        for model in models:
            try:
                qv = self.embedder.embed_query(q[:2000], model)
            except (OllamaUnavailable, OllamaError):
                continue
            rows = self.db.q("SELECT c.id, c.doc_name, c.page, c.text, c.embedding, d.classification FROM rag_chunks c JOIN rag_documents d ON d.name=c.doc_name"
                             " WHERE c.flagged=0 AND d.embedding_model=?", (model,))
            for r in rows:
                s = cosine(qv, unpack(r["embedding"]))
                scored.append({"id": r["id"], "doc": r["doc_name"], "page": r["page"], "score": round(max(0.0, min(1.0, s)), 4),
                               "classification": r["classification"], "text": r["text"], "model": model})
        scored.sort(key=lambda x: x["score"], reverse=True)
        top = scored[:k]
        for c in top:
            c.update(self.locator(c["doc"], c["page"], c["id"]))
        return top

    def total_chunks(self) -> int:
        return self.db.one("SELECT COALESCE(SUM(chunks),0) n FROM rag_documents")["n"]
