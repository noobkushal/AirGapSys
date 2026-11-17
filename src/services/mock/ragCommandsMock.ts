/**
 * MOCK-MODE ONLY. Simulates /rag commands over the sample documents so the UI can be demonstrated without a
 * backend. There is no language model here: the "answer" is stitched from the top passages and labelled as simulated.
 * The real implementation (policy gating, taint, injection scan, citations check, audit) lives in the backend.
 */
import type { ChatMessage, Classification, SourceRef } from '../../types';
import { clock } from '../../utils/format';
import * as db from './db';

const USAGE = 'Commands:\n• /rag list — documents indexed locally\n• /rag search <query> — find passages in your documents\n• /rag ask <question> — answer from your documents, with sources\n• /rag sources — sources behind the last /rag search or /rag ask';
const STOP = new Set('this that with from have been were will would could should their there which about into than then them they what when where while also such only each other more most some these those your does done over under between because using used uses make made explain tell show'.split(' '));
const RANK: Record<Classification, number> = { PUBLIC: 0, INTERNAL: 1, CONFIDENTIAL: 2, RESTRICTED: 3 };
let seq = 700;
let last: { kind: 'ask' | 'search'; sources: SourceRef[] } | null = null;

export function isCommand(text: string): boolean {
  const first = text.trim().split(/\s+/)[0] ?? '';
  return /^\/[A-Za-z][\w-]*$/.test(first);
}

const words = (s: string) => (s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !STOP.has(w));

function msg(text: string, command: string, extra: Partial<NonNullable<ChatMessage['meta']>> = {}, cls: Classification = 'INTERNAL'): ChatMessage {
  const reqId = `REQ-MOCK-${String(seq++).padStart(5, '0')}`;
  return { id: `m-${reqId}`, role: 'agent', text, time: clock(), meta: { reqId, trust: 'USER', risk: 'LOW', classification: cls, decision: 'ALLOW', command, reasons: [],
    trace: [{ step: `Command parsed (${command})`, ms: 1, ok: true }, { step: 'Simulated in the browser (mock mode)', ms: 1, ok: true }], ...extra } };
}

function retrieve(q: string) {
  const qw = words(q);
  const scored = db.ragChunks.map((c) => {
    const cw = new Set(words(c.text));
    return { c, score: qw.length ? qw.filter((w) => cw.has(w)).length / qw.length : 0 };
  }).filter((x) => x.score >= 0.34).sort((a, b) => b.score - a.score).slice(0, 5);
  const allowed: typeof scored = [];
  const withheld: Record<string, string> = {};
  for (const x of scored) {
    if (RANK[x.c.classification] >= RANK.CONFIDENTIAL) {
      if (!withheld[x.c.doc]) {
        const pending = db.approvals.find((a) => a.status === 'PENDING' && a.tool === 'Local RAG' && a.resource === x.c.doc);
        const id = pending?.id ?? db.nextApprovalId();
        if (!pending) db.approvals.unshift({ id, createdAt: new Date().toISOString().slice(0, 19).replace('T', ' '), risk: 'HIGH', classification: x.c.classification, action: `Read ${x.c.classification} document ${x.c.doc} for retrieval`, tool: 'Local RAG', resource: x.c.doc, requester: 'Agent Reasoning Core (mock)', status: 'PENDING' });
        withheld[x.c.doc] = id;
      }
      continue;
    }
    allowed.push(x);
  }
  const sources: SourceRef[] = allowed.map((x, i) => ({ n: i + 1, doc: x.c.doc, locator: `p. ${x.c.page}`, page: x.c.page, classification: x.c.classification, score: Math.round(x.score * 100) / 100, snippet: x.c.text.slice(0, 280), cited: false }));
  const notes = Object.keys(withheld).length ? [`Withheld pending operator approval: ${Object.entries(withheld).map(([d, a]) => `${d} (${a})`).join(', ')}. Approve on the Human Approval page, then repeat the command.`] : [];
  return { sources, notes, withheld };
}

export function mockRagCommand(text: string): ChatMessage {
  const t = text.trim();
  const [first, sub = '', ...rest] = t.split(/\s+/);
  const arg = rest.join(' ');
  if (first.toLowerCase() !== '/rag') return msg(`Unknown command ${first.slice(0, 30)}.\n\n${USAGE}`, 'unknown', {}, 'PUBLIC');
  switch (sub.toLowerCase()) {
    case '': case 'help': return msg(USAGE, 'rag help', {}, 'PUBLIC');
    case 'list': {
      const docs = db.ragDocuments;
      const lines = [`${docs.length} document(s), ${docs.reduce((n, d) => n + d.chunks, 0)} chunk(s) indexed locally (sample data):`,
        ...docs.map((d) => `• ${d.name} · ${d.classification} · ${d.chunks} chunks · ${d.sizeKb >= 1024 ? `${(d.sizeKb / 1024).toFixed(1)} MB` : `${d.sizeKb} KB`} · access: ${RANK[d.classification] >= 2 ? 'needs approval' : 'open'}`),
        '\nTry: /rag ask <question>   or   /rag search <query>'];
      return msg(lines.join('\n'), 'rag list');
    }
    case 'sources': {
      if (!last) return msg('No sources yet. Run /rag ask <question> or /rag search <query> first.', 'rag sources', {}, 'PUBLIC');
      const lines = [`Sources from your last /rag ${last.kind} (${last.sources.length}):`, ...last.sources.map((s) => `[${s.n}] ${s.doc}, ${s.locator} · ${s.classification} · ${s.cited ? 'cited' : 'retrieved'}\n    ${s.snippet}`)];
      return msg(lines.join('\n'), 'rag sources', { sources: last.sources });
    }
    case 'search': case 'ask': {
      if (!arg) return msg(`Usage: /rag ${sub} <${sub === 'search' ? 'query' : 'question'}>`, `rag ${sub}`, {}, 'PUBLIC');
      const { sources, notes, withheld } = retrieve(arg);
      const decision = Object.keys(withheld).length ? 'REQUIRE_APPROVAL' as const : 'ALLOW' as const;
      const cls = sources.reduce<Classification>((m, s) => (RANK[s.classification] > RANK[m] ? s.classification : m), 'INTERNAL');
      if (sub.toLowerCase() === 'search') {
        last = sources.length ? { kind: 'search', sources } : last;
        const body = sources.length ? [`Found ${sources.length} passage(s):`, ...sources.map((s) => `[${s.n}] ${s.doc}, ${s.locator} · ${s.classification} · score ${s.score.toFixed(2)}\n    ${s.snippet}`)].join('\n') : 'No passages in your documents matched that query.';
        return msg(body + (notes.length ? `\n\nNotes:\n• ${notes.join('\n• ')}` : ''), 'rag search', { sources, reasons: notes, decision }, cls);
      }
      if (!sources.length) return msg('Insufficient evidence: I found no passage in your uploaded documents that is relevant to this question, so I will not answer from memory.' + (notes.length ? `\n\nNotes:\n• ${notes.join('\n• ')}` : ''), 'rag ask', { sources: [], reasons: notes, decision }, cls);
      const top = sources.slice(0, 2);
      top.forEach((s) => { s.cited = true; });
      last = { kind: 'ask', sources };
      const answer = top.map((s) => `${s.snippet.split(/(?<=[.!?])\s/)[0].replace(/[.]*$/, '')}. [${s.n}]`).join(' ');
      const text2 = `(Simulated answer: mock mode has no language model; this is stitched from the top passages.)\n${answer}\n\nSources used:\n${top.map((s) => `[${s.n}] ${s.doc}, ${s.locator} · ${s.classification}`).join('\n')}`;
      return msg(text2 + (notes.length ? `\n\nNotes:\n• ${notes.join('\n• ')}` : ''), 'rag ask', { sources, reasons: notes, decision, attribution: { sentences: top.length, cited: top.length, weaklySupported: 0, method: 'simulated' } }, cls);
    }
    default: return msg(`Unknown /rag command '${sub.slice(0, 30)}'.\n\n${USAGE}`, 'rag help', {}, 'PUBLIC');
  }
}
