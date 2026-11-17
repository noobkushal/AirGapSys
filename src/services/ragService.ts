import { config, mock, request } from './client';
import * as db from './mock/db';
import type { Classification, RagChunk, RagDocument } from '../types';
import { stamp } from '../utils/format';

export const ragService = {
  /** BACKEND: GET /api/rag/documents */
  documents(): Promise<RagDocument[]> {
    if (!config.useMocks) return request('/api/rag/documents');
    return mock(() => db.ragDocuments);
  },
  /** BACKEND: POST /api/rag/ingest  (multipart file + classification) -> local nomic-embed-text embeddings */
  async ingest(name: string, sizeKb: number, classification: Classification, file?: File | null): Promise<RagDocument> {
    if (!config.useMocks) {
      if (!file) throw new Error('Choose a file to upload: the backend needs the file contents.');
      const fd = new FormData();
      fd.append('classification', classification);
      fd.append('file', file, name);
      return request<RagDocument>('/api/rag/ingest', { method: 'POST', body: fd }, 300000);
    }
    const doc: RagDocument = { name, sizeKb, chunks: Math.max(8, Math.round(sizeKb / 11)), status: 'INDEXED', trust: 'LOCAL_DOCUMENT', classification, lastIndexed: stamp() };
    db.ragDocuments.unshift(doc);
    db.addAudit({ user: 'operator', action: 'Document Ingestion (simulated)', component: 'Local RAG', risk: 'LOW', decision: 'ALLOW', classification, payload: `rag:ingest:${name}` });
    return mock(() => doc, 900);
  },
  /** BACKEND: POST /api/rag/query { q }. Mock mode ranks canned chunks by keyword overlap. */
  async query(q: string): Promise<RagChunk[]> {
    if (!config.useMocks) return request('/api/rag/query', { method: 'POST', body: JSON.stringify({ q }) }, 60000);
    const words = q.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
    const scored = db.ragChunks.map((c) => {
      const hay = c.text.toLowerCase();
      const hits = words.filter((w) => hay.includes(w)).length;
      return { ...c, score: words.length ? Math.min(0.97, c.score * (0.55 + 0.45 * (hits / words.length))) : c.score };
    });
    scored.sort((a, b) => b.score - a.score);
    return mock(() => scored, 450);
  },
};
