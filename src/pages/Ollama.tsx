import { useEffect, useState } from 'react';
import { Cpu, HardDrive, Play, SlidersHorizontal } from 'lucide-react';
import { Card, ErrorState, Loading, Page, PageHeader, Pill, Spinner, splitStyle } from '../components/common';
import { useAsync } from '../hooks/useAsync';
import { ollamaService } from '../services';
import { useConsole } from '../state/ConsoleContext';
import { cx } from '../utils/format';

export default function Ollama() {
  const { toast } = useConsole();
  const { data, loading, error, reload } = useAsync(() => ollamaService.status());
  const [model, setModel] = useState('llama3');
  const [temp, setTemp] = useState(0.2);
  const [topP, setTopP] = useState(0.9);
  useEffect(() => {
    // pick an installed chat model if the default ("llama3") is not on this machine
    if (data && !data.models.some((m) => m.id === model)) {
      const first = data.models.find((m) => !m.id.toLowerCase().includes('embed'));
      if (first) setModel(first.id);
    }
  }, [data, model]);
  const [bench, setBench] = useState<{ tokensPerSec: number; ttftMs: number; note: string } | null>(null);
  const [running, setRunning] = useState(false);

  async function runBench() {
    setRunning(true); setBench(null);
    try { setBench(await ollamaService.benchmark(model, temp, topP)); }
    catch (e) { toast(e instanceof Error ? e.message : 'Benchmark failed', 'red'); }
    finally { setRunning(false); }
  }

  return (
    <Page>
      <PageHeader icon={<Cpu color="#0a9f73" />} title="Ollama Local Inference Engine" subtitle="Local open-weights LLM intended to run offline on localhost:11434 with zero network telemetry."
        aside={<Pill tone="green" dot large>LOCALHOST ONLY (127.0.0.1:11434)</Pill>} />
      {loading && <Loading rows={3} height={140} />}
      {error && <Card><ErrorState message={error} onRetry={reload} /></Card>}
      {data && (
        <div className="cx-stack">
          <Card className="ol-hero">
            <div className="ol-hero__top"><span className="cx-icon-box cx-icon-box--green" style={{ width: '4rem', height: '4rem' }}><Cpu /></span>
              <div><div className="cx-row"><h2>OLLAMA</h2><Pill tone={data.online ? 'green' : 'red'} dot>{data.online ? 'ONLINE' : 'OFFLINE'}</Pill></div>
                <p className="cx-mono">Endpoint: <b>http://localhost:11434</b> · Version: {data.version}</p><p className="cx-mono tone-green"><b>Active Model: {model}</b></p></div></div>
            <div className="cx-grid cx-grid--3" style={{ marginTop: '1rem' }}>
              <div className="cx-card cx-card--flat"><small>Inference Speed</small><div className="cx-kpi__value tone-green">{data.speed} t/s</div></div>
              <div className="cx-card cx-card--flat"><small>Total Inferences</small><div className="cx-kpi__value">{data.total}</div></div>
              <div className="cx-card cx-card--flat"><small>Acceleration</small><div className="cx-kpi__value tone-blue" style={{ fontSize: '1.15rem' }}>{data.accel}</div></div>
            </div>
            <p className="cx-sub" style={{ margin: '.8rem 0 0', fontSize: '.68rem' }}>Sample values. Real status will be reported by the backend, which talks to Ollama on loopback.</p>
          </Card>

          <div className="cx-grid cx-split" style={splitStyle('minmax(0,1fr) minmax(0,1.3fr)', 'start')}>
            <Card title="Model selection & hyperparameters" icon={<SlidersHorizontal color="#2563ff" />}>
              <span className="cx-label">Current Model:</span>
              <div className="ol-models" role="radiogroup" aria-label="Model">
                {data.models.map((m) => (
                  <button key={m.id} type="button" role="radio" aria-checked={model === m.id} className={cx('ol-model', model === m.id && 'on')} onClick={() => setModel(m.id)}><b>{m.label}</b><small>{m.params}</small></button>
                ))}
              </div>
              <label className="cx-label" htmlFor="temp" style={{ marginTop: '1rem' }}>Temperature (Creativity vs Determinism): <b className="tone-green" style={{ float: 'right' }}>{temp.toFixed(1)}</b></label>
              <input id="temp" className="cx-range" type="range" min={0} max={1} step={0.1} value={temp} onChange={(e) => setTemp(+e.target.value)} />
              <p className="cx-sub" style={{ fontSize: '.68rem' }}>Lower temperatures (0.1 – 0.2) are recommended for deterministic security auditing.</p>
              <label className="cx-label" htmlFor="topp">Top-P (Nucleus Sampling): <b className="tone-green" style={{ float: 'right' }}>{topP.toFixed(1)}</b></label>
              <input id="topp" className="cx-range" type="range" min={0.1} max={1} step={0.1} value={topP} onChange={(e) => setTopP(+e.target.value)} />
              <button type="button" className="cx-btn cx-btn--violet" style={{ width: '100%', marginTop: '1rem', padding: '.85rem' }} disabled={running} onClick={() => void runBench()}>{running ? <Spinner label="Benchmarking (simulated)…" /> : <><Play />Run Local Inference Benchmark</>}</button>
              {bench && <div className="lt-out" role="status" style={{ marginTop: '.8rem' }}><b>RESULT (SIMULATED)</b><p>{bench.tokensPerSec} t/s · first token {bench.ttftMs}ms. {bench.note}</p></div>}
            </Card>
            <Card title="Installed offline models (Ollama store)" icon={<HardDrive color="#0a9f73" />} aside={<span className="cx-muted cx-mono" style={{ fontSize: '.7rem', fontWeight: 400, textTransform: 'none' }}>{data.models.length} models ready on disk</span>}>
              <div className="cx-tbl-wrap"><table className="cx-tbl">
                <thead><tr><th>Model</th><th>Status</th><th>Context size</th><th>Requests</th><th>Avg response</th><th>Size</th></tr></thead>
                <tbody>{data.models.map((m) => (
                  <tr key={m.id}><td className="cx-code"><span className="dot" data-on={model === m.id} />{m.id}{model === m.id && <> <Pill tone="green">ACTIVE</Pill></>}</td>
                    <td><Pill tone={m.status === 'ONLINE' ? 'green' : 'amber'} dot>{m.status}</Pill></td><td>{m.context.toLocaleString()} tokens</td><td><b>{m.requests}</b></td><td className="tone-green"><b>{m.avgResponse}</b></td><td>{m.sizeGb} GB</td></tr>
                ))}</tbody>
              </table></div>
            </Card>
          </div>
        </div>
      )}
    </Page>
  );
}
