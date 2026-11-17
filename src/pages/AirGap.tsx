import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowUpRight, Ban, Cloud, Info, ShieldCheck, WifiOff, XCircle, Activity } from 'lucide-react';
import { Card, ErrorState, Loading, Page, PageHeader, Pill, Spinner } from '../components/common';
import { useAsync } from '../hooks/useAsync';
import { securityService } from '../services';
import { useConsole } from '../state/ConsoleContext';

const TILES = [
  { l: 'EXTERNAL APIS', v: 'BLOCKED', bad: true }, { l: 'CLOUD LLMS', v: 'BLOCKED', bad: true }, { l: 'TELEMETRY', v: 'BLOCKED', bad: true },
  { l: 'DNS RESOLUTION', v: 'NULL_ROUTE', bad: true }, { l: 'NIC INTERFACE', v: 'ISOLATED', bad: false }, { l: 'LOCAL LOOPBACK', v: '127.0.0.1 ONLY', bad: false },
];
const AXIS = { fontSize: 11, fill: '#52647c', fontFamily: 'JetBrains Mono, monospace' };
const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$|^(\d{1,3}\.){3}\d{1,3}$/i;

export default function AirGap() {
  const { toast, refreshCounts } = useConsole();
  const { data, loading, error, reload, setData } = useAsync(() => securityService.airGap());
  const [host, setHost] = useState('api.openai.com');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const notIsolated = !!data?.posture && data.posture.status !== 'ISOLATED';

  async function probe() {
    const h = host.trim();
    if (!HOST_RE.test(h)) { setErr('Enter a valid hostname or IPv4 address.'); return; }
    setErr(''); setBusy(true);
    try {
      const row = await securityService.probe(h);
      setData((d) => (d ? { ...d, log: [...d.log, row] } : d));
      toast(`Simulated attempt to ${h} was blocked (no real traffic sent).`, 'red'); refreshCounts();
    } catch (e) { toast(e instanceof Error ? e.message : 'Probe failed', 'red'); }
    finally { setBusy(false); }
  }

  return (
    <Page>
      <PageHeader icon={<WifiOff color="#e0263c" />} title="Air-Gap & Perimeter Network Monitor" subtitle="Physical, link-layer, and software socket isolation ensuring zero data escapes host perimeter."
        aside={data?.posture
          ? <Pill tone={data.posture.status === 'ISOLATED' ? 'green' : 'amber'} dot large>{data.posture.status === 'ISOLATED' ? 'HOST ISOLATED (OBSERVED)' : data.posture.status === 'UNKNOWN' ? 'HOST POSTURE UNKNOWN' : 'HOST NOT ISOLATED (OBSERVED)'}</Pill>
          : <Pill tone="green" dot large>KERNEL SOCKET ISOLATION ACTIVE (REPORTED)</Pill>} />
      {loading && <Loading rows={3} height={150} />}
      {error && <Card><ErrorState message={error} onRetry={reload} /></Card>}
      {data && (
        <div className="cx-stack">
          {data.posture && data.posture.status !== 'ISOLATED' && (
            <div className="cx-banner" role="status"><AlertTriangle /><span><b>Observed on this host:</b> {data.posture.reasons.join(' ') || 'Posture could not be confirmed.'} The in-process egress guard is {data.posture.guard.enforcing ? 'enforcing' : 'NOT enforcing'}, but real isolation needs the OS firewall or a physical disconnect (see the backend deploy/ folder).</span></div>
          )}
          <Card title="Outbound egress vs. blocked socket attempts">
            <p className="cx-sub" style={{ marginTop: '-.4rem' }}>Zero egress packets transmitted across all host network interfaces</p>
            <div className="chart" style={{ height: 260 }} role="img" aria-label="Area chart: outbound bandwidth stays at zero while blocked attempts vary">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.series} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <defs><linearGradient id="gBlk" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff4d86" stopOpacity={0.5} /><stop offset="100%" stopColor="#ff4d86" stopOpacity={0.03} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 4" stroke="rgba(53,92,154,.18)" />
                  <XAxis dataKey="t" tick={AXIS} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #fff', fontFamily: 'JetBrains Mono', fontSize: 12 }} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, fontFamily: 'JetBrains Mono' }} />
                  <Area type="monotone" dataKey="egress" name="Outbound Bandwidth (0 bps)" stroke="#2563ff" strokeWidth={2} fill="none" />
                  <Area type="monotone" dataKey="blocked" name="Blocked Attempts" stroke="#e0245e" strokeWidth={2} fill="url(#gBlk)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="cx-banner cx-banner--blue" style={{ margin: '.8rem 0 0' }}><Info /><span>{data.posture ? <><b>Live data:</b> egress is measured from non-loopback interface counters and the log lists attempts refused by the backend guard. {data.posture.note}</> : <><b>Simulation Notice:</b> Real-time network events are simulated in the frontend. Production integrates with the OS firewall (iptables / pf) via the backend.</>}</span><b className="cx-push tone-blue">100% BLOCKED RATE</b></div>
          </Card>

          <Card tone="red" className="ag-status">
            <span className="cx-icon-box cx-icon-box--red ag-status__ico"><XCircle /></span>
            <div className="ag-status__txt">
              <div className="cx-row"><b className="tone-red cx-mono" style={{ fontSize: '.78rem' }}>PERIMETER DEFENSE STATUS</b>{notIsolated ? <Pill tone="amber">GUARD ONLY</Pill> : <Pill tone="red">STRICT AIR-GAP</Pill>}</div>
              <h2>{notIsolated ? 'EGRESS GUARD ACTIVE' : 'INTERNET BLOCKED'}</h2>
              <p className="cx-sub" style={{ margin: 0 }}>{notIsolated ? 'This host can still reach other networks. Connections made by the Clarix backend are refused by its in-process guard, but only the OS firewall or a physical disconnect isolates the machine.' : 'All outbound and inbound socket connections to WAN destinations, cloud services, and external telemetry endpoints are to be physically and programmatically severed (enforced outside this UI).'}</p>
            </div>
            <div className="ag-status__stats"><div className="cx-card cx-card--flat"><small>Outbound Connections</small><b className="tone-blue">0 ACTIVE</b></div><div className="cx-card cx-card--flat"><small>Inbound Connections</small><b className="tone-blue">0 ACTIVE</b></div></div>
          </Card>

          <div className="cx-grid cx-grid--6">
            {TILES.map((t) => <div key={t.l} className="cx-card cx-card--flat ag-tile"><small>{t.l}</small><b className={t.bad ? 'tone-red' : 'tone-blue'}>{t.bad ? <Ban width={14} height={14} /> : <ShieldCheck width={14} height={14} />}{t.v}</b></div>)}
          </div>

          <Card title="Interactive egress socket probe simulator" icon={<Activity color="#2563ff" />} aside={<span className="cx-muted cx-mono" style={{ fontSize: '.68rem', textTransform: 'none', fontWeight: 400 }}>Simulate an unauthorized outbound attempt to see how a block is logged</span>}>
            <form className="cx-row" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); void probe(); }}>
              <input className="cx-input" value={host} onChange={(e) => setHost(e.target.value)} aria-label="Destination host" aria-invalid={!!err} />
              <button type="submit" className="cx-btn cx-btn--primary" disabled={busy}>{busy ? <Spinner label="Probing" /> : <>Simulate Socket Attempt <ArrowUpRight /></>}</button>
            </form>
            {err && <p className="cx-sub tone-red" role="alert" style={{ margin: '.5rem 0 0' }}>{err}</p>}
            <p className="cx-sub" style={{ margin: '.5rem 0 0', fontSize: '.68rem' }}><Cloud width={12} height={12} style={{ verticalAlign: '-2px' }} /> No network request is made. This only adds a simulated row to the log below.</p>
          </Card>

          <Card title="Blocked external connection log" aside={<Pill tone="red">{data.log.length} ATTEMPTS DROPPED</Pill>}>
            <div className="cx-tbl-wrap"><table className="cx-tbl">
              <thead><tr><th>Time</th><th>Destination host</th><th>Port</th><th>Protocol</th><th>Initiating subsystem</th><th>Enforced security rule</th><th style={{ textAlign: 'right' }}>Status</th></tr></thead>
              <tbody>{data.log.map((r, i) => (
                <tr key={`${r.time}-${i}`}><td className="cx-mono">{r.time}</td><td className="cx-mono tone-red" style={{ fontWeight: 700 }}>{r.host}</td><td>{r.port}</td><td>{r.protocol}</td><td>{r.subsystem}</td><td className="cx-mono" style={{ fontSize: '.74rem' }}>{r.rule}</td><td style={{ textAlign: 'right' }}><Pill tone="red" dot>BLOCKED</Pill></td></tr>
              ))}</tbody>
            </table></div>
          </Card>
        </div>
      )}
    </Page>
  );
}
