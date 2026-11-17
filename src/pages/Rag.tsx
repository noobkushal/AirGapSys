import { useRef, useState } from 'react';
import { Database, FileText, Search, Upload } from 'lucide-react';
import { Card, ClassPill, EmptyState, ErrorState, Loading, Page, PageHeader, Pill, Spinner, TrustPill } from '../components/common';
import { useAsync } from '../hooks/useAsync';
import { config, ragService } from '../services';
import { useConsole } from '../state/ConsoleContext';
import type { Classification, RagChunk } from '../types';
import { formatSize } from '../utils/format';

const CLASSES: Classification[] = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'];
const ALLOWED_EXT = /\.(pdf|txt|md|docx)$/i;

export default function Rag() {
  const { toast, refreshCounts } = useConsole();
  const docs = useAsync(() => ragService.documents());
  const [fileName, setFileName] = useState('');
  const [size, setSize] = useState(512);
  const [cls, setCls] = useState<Classification>('INTERNAL');
  const [ingesting, setIngesting] = useState(false);
  const [fileErr, setFileErr] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('What is the security policy?');
  const [results, setResults] = useState<RagChunk[] | null>(null);
  const [searching, setSearching] = useState(false);

  const total = (docs.data ?? []).reduce((n, d) => n + d.chunks, 0);

  function onPick(f?: File) {
    if (!f) return;
    if (!ALLOWED_EXT.test(f.name)) { setFileErr('Supported types: .pdf, .txt, .md, .docx'); return; }
    setFileErr(''); setFile(f); setFileName(f.name); setSize(Math.max(1, Math.round(f.size / 1024)));
  }
  async function ingest() {
    const name = fileName.trim();
    if (!name) { setFileErr('Choose a file or type a file name first.'); return; }
    setFileErr(''); setIngesting(true);
    try {
      const d = await ragService.ingest(name, size, cls, file);
      docs.setData((p) => [d, ...(p ?? []).filter((x) => x.name !== d.name)]); setFileName(''); setFile(null); refreshCounts();
      toast(config.useMocks ? `${name} added to the simulated index (${d.chunks} chunks). File contents were not read.` : `${name} indexed: ${d.chunks} chunks${d.flaggedChunks ? `, ${d.flaggedChunks} quarantined for suspected injected instructions` : ''}.`, 'green');
    } catch (e) { toast(e instanceof Error ? e.message : 'Ingestion failed', 'red'); }
    finally { setIngesting(false); }
  }
  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    try { setResults(await ragService.query(query)); } catch (e) { toast(e instanceof Error ? e.message : 'Search failed', 'red'); }
    finally { setSearching(false); }
  }

  return (
    <Page>
      <PageHeader icon={<Database color="#2563ff" />} title="Local Vector RAG & Embedding Vault" subtitle="Air-gapped semantic search using local dense vector embeddings (nomic-embed-text) with source-level taint tagging."
        aside={<Pill tone="green" dot large>{total} Vector Chunks Indexed Locally</Pill>} />
      <div className="cx-grid cx-grid--2" style={{ alignItems: 'start' }}>
        <Card title="Simulate document ingestion & embeddings" icon={<Upload color="#2563ff" />}>
          <label className="cx-label" htmlFor="fname">Document File Name:</label>
          <div className="cx-row" style={{ flexWrap: 'nowrap', marginBottom: '.9rem' }}>
            <input id="fname" className="cx-input" value={fileName} onChange={(e) => { setFileName(e.target.value); setFile(null); }} placeholder="e.g. incident_response_runbook.pdf" />
            <input ref={picker} type="file" accept=".pdf,.txt,.md,.docx" hidden onChange={(e) => onPick(e.target.files?.[0])} />
            <button type="button" className="cx-btn cx-btn--ghost" onClick={() => picker.current?.click()}><FileText />Choose file</button>
          </div>
          <label className="cx-label" htmlFor="cls">Classification Tag (Taint Origin):</label>
          <select id="cls" className="cx-select" value={cls} onChange={(e) => setCls(e.target.value as Classification)} style={{ marginBottom: '.9rem' }}>{CLASSES.map((c) => <option key={c}>{c}</option>)}</select>
          {fileErr && <p className="cx-sub tone-red" role="alert">{fileErr}</p>}
          <button type="button" className="cx-btn cx-btn--primary" style={{ width: '100%', padding: '.85rem' }} disabled={ingesting} onClick={() => void ingest()}>{ingesting ? <Spinner label="Embedding (simulated)…" /> : <><Upload />Simulate Local Ingestion</>}</button>
          <p className="cx-sub" style={{ margin: '.8rem 0 0', fontSize: '.68rem' }}>Simulation: file contents are neither read nor embedded. In production the backend would embed locally with Ollama nomic-embed-text (768 dimensions); no cloud API calls.</p>
        </Card>

        <Card title="Interactive local retrieval query tester" icon={<Search color="#2563ff" />}>
          <form className="cx-row" style={{ flexWrap: 'nowrap', marginBottom: '.8rem' }} onSubmit={(e) => { e.preventDefault(); void search(); }}>
            <input className="cx-input" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Retrieval query" />
            <button type="submit" className="cx-btn cx-btn--primary" disabled={searching || !query.trim()}>{searching ? <Spinner /> : 'Search'}</button>
          </form>
          <div className="rag-results" aria-live="polite">
            {!results && <EmptyState title="Run a query" hint="Results are ranked by keyword overlap over sample chunks (not real embeddings)." />}
            {results?.map((c) => (
              <article key={c.id} className="rag-chunk">
                <div><b className="tone-blue cx-mono">Chunk #{c.id}</b> <span className="cx-mono">• {c.doc} (p. {c.page})</span></div>
                <div className="cx-row" style={{ margin: '.4rem 0' }}><span className="cx-mono" style={{ fontSize: '.78rem' }}>Score: {(c.score * 100).toFixed(1)}%</span><Pill tone="green">RETRIEVED_DATA</Pill><ClassPill value={c.classification} /></div>
                <p>“{c.text}”</p>
              </article>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Indexed local documents" icon={<FileText color="#2563ff" />} aside={<span className="cx-muted cx-mono" style={{ fontSize: '.72rem', fontWeight: 400, textTransform: 'none' }}>{docs.data?.length ?? 0} documents loaded (sample data)</span>} className="rag-docs">
        {docs.loading && <Loading rows={3} height={44} />}
        {docs.error && <ErrorState message={docs.error} onRetry={docs.reload} />}
        {docs.data && (
          <div className="cx-tbl-wrap"><table className="cx-tbl">
            <thead><tr><th>Document name</th><th>Size</th><th>Chunks</th><th>Embedding status</th><th>Trust level</th><th>Classification</th><th>Last indexed</th></tr></thead>
            <tbody>{docs.data.map((d) => (
              <tr key={d.name + d.lastIndexed}><td className="cx-code"><FileText width={14} height={14} color="#2563ff" style={{ verticalAlign: '-2px', marginRight: 6 }} />{d.name}</td><td>{formatSize(d.sizeKb)}</td><td><b>{d.chunks}</b></td>
                <td><Pill dot>{d.status}</Pill></td><td><TrustPill value={d.trust} /></td><td><ClassPill value={d.classification} /></td><td className="cx-mono" style={{ fontSize: '.74rem' }}>{d.lastIndexed}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </Page>
  );
}
