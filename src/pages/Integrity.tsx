import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, FileText, Hash, Link2, Lock, RefreshCw, RotateCcw, ShieldCheck, ArrowDown } from 'lucide-react';
import { Card, CopyButton, ErrorState, Loading, Page, PageHeader, Pill, Spinner } from '../components/common';
import { useAsync } from '../hooks/useAsync';
import { auditService } from '../services';
import { useConsole } from '../state/ConsoleContext';
import type { AuditEvent } from '../types';
import { cx } from '../utils/format';
import { isCryptoAvailable, sha256Hex, verifyChain, type ChainLink, type VerifyResult } from '../utils/sha256';

export default function Integrity() {
  const { settings, toast } = useConsole();
  const cryptoOk = settings.webCrypto && isCryptoAvailable();
  const { data, loading, error, reload } = useAsync(() => auditService.chain());
  const [links, setLinks] = useState<ChainLink[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [results, setResults] = useState<Record<string, VerifyResult>>({});
  const [verifying, setVerifying] = useState(false);
  const [tampered, setTampered] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [digest, setDigest] = useState('');
  const [genErr, setGenErr] = useState('');

  const verify = useCallback(async (l: ChainLink[]) => {
    if (!cryptoOk || !l.length) return;
    setVerifying(true);
    try { const r = await verifyChain(l); setResults(Object.fromEntries(r.map((x) => [x.id, x]))); }
    catch (e) { toast(e instanceof Error ? e.message : 'Verification failed', 'red'); }
    finally { setVerifying(false); }
  }, [cryptoOk, toast]);

  useEffect(() => {
    if (!data) return;
    const l = data.map((d) => d.link).filter((x) => x.hash);
    setEvents(data.map((d) => d.event)); setLinks(l); setTampered(null);
    void verify(l);
  }, [data, verify]);

  const broken = Object.values(results).filter((r) => !r.ok);
  const status = !cryptoOk ? 'UNAVAILABLE' : !Object.keys(results).length ? 'PENDING' : broken.length ? 'BROKEN' : 'VERIFIED';

  function tamper() {
    if (links.length < 3) return;
    const i = Math.floor(links.length / 2);
    const next = links.map((l, k) => (k === i ? { ...l, payload: `${l.payload}#edited` } : l));
    setLinks(next); setTampered(next[i].id); void verify(next);
    toast(`Demo: edited the payload of ${next[i].id} in memory. Re-verification should flag it.`, 'amber');
  }
  function restore() { reload(); toast('Original chain restored.', 'green'); }

  async function generate() {
    setGenErr('');
    try { setDigest(await sha256Hex(text)); } catch (e) { setDigest(''); setGenErr(e instanceof Error ? e.message : 'Hashing failed'); }
  }

  return (
    <Page>
      <PageHeader icon={<FileText color="#2563ff" />} title="SHA-256 Integrity & Merkle Chain Verification" subtitle="Backward-linked SHA-256 digests make retroactive edits to an audit ledger detectable."
        aside={<Pill tone={cryptoOk ? 'green' : 'amber'} large><ShieldCheck />Web Crypto API (SubtleCrypto)</Pill>} />
      {!settings.webCrypto && <div className="cx-banner"><AlertTriangle />Web Crypto verification is switched off in Settings.</div>}
      {settings.webCrypto && !isCryptoAvailable() && <div className="cx-banner cx-banner--red"><AlertTriangle />Web Crypto is unavailable. Open this app from localhost or HTTPS.</div>}

      <Card className="ig-top">
        <span className="cx-icon-box cx-icon-box--blue" style={{ width: '4rem', height: '4rem' }}><ShieldCheck /></span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="cx-row"><h2 className="ig-top__h">Cryptographic SHA-256 ledger integrity</h2>
            <Pill tone={status === 'VERIFIED' ? 'green' : status === 'BROKEN' ? 'red' : 'gray'}>{status === 'VERIFIED' ? '✓ VERIFIED' : status}</Pill></div>
          <p className="cx-sub" style={{ margin: '.3rem 0 0' }}>Each transaction is sealed into a backward-linked chain. Any retroactive modification breaks downstream hash continuity. This page recomputes hashes in your browser over the <b>demo ledger</b>, not a production store.</p>
        </div>
        <div className="cx-row">
          <button type="button" className="cx-btn cx-btn--primary" disabled={!cryptoOk || verifying} onClick={() => void verify(links)}>{verifying ? <Spinner label="Verifying" /> : <><RefreshCw />Verify Entire Ledger Chain</>}</button>
          <button type="button" className="cx-btn cx-btn--ghost" disabled={!cryptoOk || !!tampered} onClick={tamper}>Tamper demo</button>
          {tampered && <button type="button" className="cx-btn cx-btn--success" onClick={restore}><RotateCcw />Restore</button>}
        </div>
      </Card>
      {broken.length > 0 && <div className="cx-banner cx-banner--red" role="alert"><AlertTriangle />Chain broken at {broken.map((b) => b.id).join(', ')}: {broken[0].reason}.</div>}

      <Card title="Visual cryptographic chain linkage" icon={<Link2 color="#2563ff" />} aside={<span className="cx-muted cx-mono" style={{ fontSize: '.7rem', fontWeight: 400, textTransform: 'none' }}>Genesis → Block N (Merkle root)</span>} className="ig-chain">
        {loading && <Loading rows={3} height={110} />}
        {error && <ErrorState message={error} onRetry={reload} />}
        {data && !links.length && <p className="cx-sub">No hashed events available (Web Crypto disabled or unavailable).</p>}
        <ol className="chain">
          {links.map((l, i) => {
            const ev = events.find((e) => e.id === l.id);
            const r = results[l.id];
            const bad = r && !r.ok;
            return (
              <li key={l.id}>
                {i > 0 && <div className="chain__link"><ArrowDown width={12} height={12} /><span>LINK: hash(prevHash + payload)</span></div>}
                <div className={cx('chain__block', bad && 'is-bad')}>
                  <i className="chain__dot" />
                  <div className="chain__head"><b className="cx-id">{l.id}</b><span className="cx-mono">[{ev?.component}]</span><span className="cx-mono cx-muted chain__ts">{ev?.timestamp}</span>
                    {r ? <Pill tone={r.ok ? 'green' : 'red'}>{r.ok ? '✓ VERIFIED' : '✕ BROKEN'}</Pill> : <Pill tone="gray">UNVERIFIED</Pill>}</div>
                  <p className="chain__act"><b>Action:</b> {ev?.action} • <b>Classification:</b> {ev?.classification} • <b>Payload:</b> <code>{l.payload}</code></p>
                  {bad && <p className="cx-sub tone-red" style={{ margin: '.2rem 0' }}>{r.reason}</p>}
                  <div className="chain__hash"><span>SHA-256 Current Hash:</span><code className="tone-green">{l.hash}</code><CopyButton text={l.hash} label={`Copy hash of ${l.id}`} /></div>
                  <div className="chain__hash"><span>Previous Parent Hash:</span><code>{l.prevHash}</code><CopyButton text={l.prevHash} label={`Copy parent hash of ${l.id}`} /></div>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      <Card title="Interactive Web Crypto SHA-256 generator" icon={<Lock color="#2563ff" />}>
        <p className="cx-sub">Type any string to compute its SHA-256 digest locally with the browser’s SubtleCrypto API (real hashing).</p>
        <form className="cx-row" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); void generate(); }}>
          <input className="cx-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type payload or audit text to test…" aria-label="Text to hash" />
          <button type="submit" className="cx-btn cx-btn--primary" disabled={!cryptoOk}><Hash />Generate SHA-256</button>
        </form>
        {genErr && <p className="cx-sub tone-red" role="alert">{genErr}</p>}
        {digest && <div className="chain__hash" style={{ marginTop: '.8rem' }} role="status"><span>Digest:</span><code className="tone-green">{digest}</code><CopyButton text={digest} label="Copy digest" /></div>}
      </Card>
    </Page>
  );
}
