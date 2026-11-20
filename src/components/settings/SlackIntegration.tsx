import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Ban,
  Bell,
  CheckCircle,
  Database,
  Eye,
  EyeOff,
  Flame,
  Radio,
  RefreshCw,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { Card, Pill, Spinner, Toggle } from '../common';
import { slackService } from '../../services';
import { useConsole } from '../../state/ConsoleContext';
import type {
  SlackConnectionState,
  SlackNotificationHistoryItem,
  SlackPreferences,
  SlackStatus,
} from '../../types';

interface PrefRow {
  key: keyof SlackPreferences;
  title: string;
  desc: string;
  icon: ReactNode;
  color: string;
}

const PREF_ROWS: PrefRow[] = [
  {
    key: 'prompt_injection',
    title: 'Prompt Injection Alerts',
    desc: 'Notifications when adversarial injections, instruction overrides, or jailbreak heuristics are detected or blocked.',
    icon: <Flame color="#ff5252" />,
    color: '#ff5252',
  },
  {
    key: 'blocked_actions',
    title: 'Blocked Tool & Sandbox Actions',
    desc: 'Alerts when the policy engine or local execution sandbox blocks unauthorized tool invocations.',
    icon: <Ban color="#e0245e" />,
    color: '#e0245e',
  },
  {
    key: 'approval_requests',
    title: 'Human Approval Requests',
    desc: 'Immediate notifications whenever the AI agent requires human operator authorization to proceed.',
    icon: <Bell color="#ff9f1a" />,
    color: '#ff9f1a',
  },
  {
    key: 'approval_decisions',
    title: 'Human Approval Decisions',
    desc: 'Audit alerts when pending approval requests are approved, denied, or auto-expired by the system.',
    icon: <CheckCircle color="#10c98f" />,
    color: '#10c98f',
  },
  {
    key: 'network_security',
    title: 'Network Security Events',
    desc: 'Critical alerts whenever outbound egress attempts are intercepted and blocked by the air-gap guard.',
    icon: <WifiOff color="#e0245e" />,
    color: '#e0245e',
  },
  {
    key: 'policy_changes',
    title: 'Security Policy Modifications',
    desc: 'Notifications when security policies (POL-001 through POL-005) are enabled or disabled by operators.',
    icon: <SlidersHorizontal color="#6a5cff" />,
    color: '#6a5cff',
  },
  {
    key: 'critical_audit',
    title: 'Critical Audit Ledger Events',
    desc: 'High-severity security events, integrity warnings, and critical tamper-evident ledger entries.',
    icon: <Database color="#2563ff" />,
    color: '#2563ff',
  },
];

function formatDate(iso: string | null): string {
  if (!iso) return 'Never';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function SlackIntegration() {
  const { toast } = useConsole();

  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [prefs, setPrefs] = useState<SlackPreferences | null>(null);
  const [history, setHistory] = useState<SlackNotificationHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [webhookUrlInput, setWebhookUrlInput] = useState('');
  const [channelInput, setChannelInput] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  // Busy states
  const [busySave, setBusySave] = useState(false);
  const [busyTest, setBusyTest] = useState(false);
  const [busyClear, setBusyClear] = useState(false);
  const [busyRefresh, setBusyRefresh] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<string>('ALL');

  async function loadData() {
    try {
      const [st, pr, hi] = await Promise.all([
        slackService.getStatus(),
        slackService.getPreferences(),
        slackService.getHistory(50),
      ]);
      setStatus(st);
      setPrefs(pr);
      setHistory(hi);
      if (st.channel) {
        setChannelInput(st.channel);
      }
    } catch (e) {
      console.error('Failed to load Slack integration data', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleToggleEnabled(nextEnabled: boolean) {
    if (!status?.configured && nextEnabled) {
      toast('Please configure a valid Slack webhook URL before enabling integration.', 'amber');
      return;
    }
    try {
      const updated = await slackService.updateConfig({ enabled: nextEnabled });
      setStatus(updated);
      toast(`Slack Integration ${nextEnabled ? 'enabled' : 'disabled'}.`, nextEnabled ? 'green' : 'blue');
    } catch (e: any) {
      toast(e.message || 'Failed to update Slack status', 'red');
    }
  }

  async function handleSaveConfig() {
    setBusySave(true);
    try {
      const updateData: { webhookUrl?: string; channel?: string; enabled?: boolean } = {
        channel: channelInput.trim() || undefined,
      };
      if (webhookUrlInput.trim()) {
        updateData.webhookUrl = webhookUrlInput.trim();
      }
      const updated = await slackService.updateConfig(updateData);
      setStatus(updated);
      setWebhookUrlInput(''); // Clear raw secret from input
      toast('Slack configuration saved securely on backend.', 'green');
    } catch (e: any) {
      toast(e.message || 'Failed to save Slack configuration', 'red');
    } finally {
      setBusySave(false);
    }
  }

  async function handleClearConfig() {
    if (!window.confirm('Clear Slack webhook configuration and disable external notifications?')) {
      return;
    }
    setBusyClear(true);
    try {
      const updated = await slackService.clearConfig();
      setStatus(updated);
      setWebhookUrlInput('');
      setChannelInput('');
      toast('Slack configuration cleared and integration disabled.', 'blue');
    } catch (e: any) {
      toast(e.message || 'Failed to clear Slack configuration', 'red');
    } finally {
      setBusyClear(false);
    }
  }

  async function handleTestConnection() {
    setBusyTest(true);
    try {
      const res = await slackService.testConnection();
      if (res.ok) {
        toast('✓ Test notification delivered successfully to Slack channel.', 'green');
      } else {
        toast(`✕ Test delivery failed: ${res.message}`, 'red');
      }
      // Refresh status and history
      const [st, hi] = await Promise.all([slackService.getStatus(), slackService.getHistory(50)]);
      setStatus(st);
      setHistory(hi);
    } catch (e: any) {
      toast(e.message || 'Failed to test Slack connection', 'red');
      try {
        const st = await slackService.getStatus();
        setStatus(st);
      } catch {}
    } finally {
      setBusyTest(false);
    }
  }

  async function handleTogglePref(key: keyof SlackPreferences, value: boolean) {
    if (!prefs) return;
    const nextPrefs = { ...prefs, [key]: value };
    setPrefs(nextPrefs);
    try {
      const saved = await slackService.updatePreferences({ [key]: value });
      setPrefs(saved);
      toast(`Preference updated.`, 'blue');
    } catch (e: any) {
      toast(e.message || 'Failed to save preference', 'red');
      // Revert on error
      setPrefs(prefs);
    }
  }

  async function handleRefreshHistory() {
    setBusyRefresh(true);
    try {
      const hi = await slackService.getHistory(50, historyFilter === 'ALL' ? undefined : historyFilter);
      setHistory(hi);
      toast('Notification history refreshed.', 'blue');
    } catch (e: any) {
      toast(e.message || 'Failed to refresh notification history', 'red');
    } finally {
      setBusyRefresh(false);
    }
  }

  const connState: SlackConnectionState = status?.connectionState || 'DISCONNECTED';
  const connTone = connState === 'CONNECTED' ? 'green' : connState === 'ERROR' ? 'red' : 'gray';

  const filteredHistory = historyFilter === 'ALL' ? history : history.filter((h) => h.status === historyFilter);

  return (
    <Card
      title="Slack Integration (Official Incoming Webhooks)"
      icon={<Radio color="#4a6bff" />}
      aside={
        <div className="cx-row">
          <Pill tone={connTone} dot>
            STATUS: {connState}
          </Pill>
          {status?.strictAirgap && !status?.relayEnabled ? (
            <Pill tone="amber" dot>
              AIR-GAP MODE: RELAY DISABLED
            </Pill>
          ) : (
            <Pill tone="green" dot>
              OUTBOUND RELAY: ACTIVE
            </Pill>
          )}
        </div>
      }
    >
      <p className="cx-sub">
        Automatically dispatch structured security alerts to your Slack channels using the official Slack Incoming Webhooks API.
        Protected by an isolated relay process and durable local SQLite queue to preserve air-gap security.
      </p>

      {/* Integration Overview & Metrics */}
      <div className="cx-grid cx-grid--4" style={{ marginBottom: '1.2rem' }}>
        <div className="cx-card cx-card--flat">
          <label className="cx-label cx-label--caps">Integration State</label>
          <div className="cx-row" style={{ marginTop: '.3rem', justifyContent: 'space-between' }}>
            <b className="cx-mono" style={{ fontSize: '.9rem' }}>
              {status?.enabled ? 'Active / Enabled' : 'Disabled'}
            </b>
            <Toggle
              checked={status?.enabled || false}
              onChange={handleToggleEnabled}
              label="Enable or disable Slack notifications"
              color="#10c98f"
              disabled={loading || !status?.configured}
            />
          </div>
          <small className="cx-muted" style={{ fontSize: '.68rem' }}>
            {status?.configured ? 'Webhook configured' : 'Webhook not configured'}
          </small>
        </div>

        <div className="cx-card cx-card--flat">
          <label className="cx-label cx-label--caps">Configured Channel</label>
          <div className="cx-mono" style={{ fontSize: '1rem', fontWeight: 800, marginTop: '.3rem' }}>
            {status?.channel ? status.channel : <span className="cx-muted">(default)</span>}
          </div>
          <small className="cx-muted" style={{ fontSize: '.68rem' }}>Slack channel target</small>
        </div>

        <div className="cx-card cx-card--flat">
          <label className="cx-label cx-label--caps">Last Successful Delivery</label>
          <div className="cx-mono tone-green" style={{ fontSize: '.84rem', fontWeight: 700, marginTop: '.3rem' }}>
            {formatDate(status?.lastSuccessAt || null)}
          </div>
          <small className="cx-muted" style={{ fontSize: '.68rem' }}>Verified delivery timestamp</small>
        </div>

        <div className="cx-card cx-card--flat">
          <label className="cx-label cx-label--caps">Durable Queue Posture</label>
          <div className="cx-row" style={{ marginTop: '.3rem', gap: '.4rem' }}>
            <Pill tone="blue">{status?.queue.sent ?? 0} Sent</Pill>
            <Pill tone="amber">{status?.queue.pending ?? 0} Queued</Pill>
            <Pill tone="red">{status?.queue.failed ?? 0} Failed</Pill>
          </div>
          <small className="cx-muted" style={{ fontSize: '.68rem' }}>Local SQLite queue stats</small>
        </div>
      </div>

      {/* Air-gap security restriction notice */}
      {status?.strictAirgap && !status?.relayEnabled && (
        <div
          className="cx-card cx-card--red"
          style={{ marginBottom: '1.2rem', display: 'flex', gap: '.9rem', alignItems: 'center' }}
        >
          <span className="cx-icon-box cx-icon-box--red" style={{ width: '2.5rem', height: '2.5rem' }}>
            <WifiOff />
          </span>
          <div style={{ flex: 1 }}>
            <b className="tone-red cx-mono" style={{ fontSize: '.82rem' }}>
              AIR-GAP RESTRICTION ACTIVE: OUTBOUND DELIVERIES LOCALLY HELD
            </b>
            <p className="cx-sub" style={{ margin: '.2rem 0 0' }}>
              The host is enforcing strict air-gap protection (<code>CLARIX_AIRGAP_ENFORCE=true</code>). External delivery is
              intentionally disabled. Security alerts will safely accumulate in the local durable SQLite queue until an authorized
              relay worker is explicitly activated (<code>CLARIX_SLACK_RELAY_ENABLED=true</code>).
            </p>
          </div>
        </div>
      )}

      {/* Last delivery error display (secrets redacted) */}
      {status?.lastError && (
        <div
          className="cx-card cx-card--red"
          style={{ marginBottom: '1.2rem', display: 'flex', gap: '.8rem', alignItems: 'center' }}
        >
          <AlertTriangle color="#e0245e" style={{ flexShrink: 0 }} />
          <div>
            <b className="tone-red cx-mono" style={{ fontSize: '.78rem' }}>Recent Delivery Issue Reported:</b>
            <p className="cx-sub" style={{ margin: '.2rem 0 0', color: 'var(--ink)' }}>{status.lastError}</p>
          </div>
        </div>
      )}

      {/* Webhook Configuration */}
      <div className="cx-card" style={{ marginBottom: '1.2rem', background: 'rgba(255,255,255,.65)' }}>
        <div className="cx-card__title">
          <Send color="#2563ff" />
          <span>Webhook Connection Configuration</span>
          {status?.configured && (
            <span className="cx-push">
              <Pill tone="green" dot>
                CONFIGURED
              </Pill>
            </span>
          )}
        </div>

        <div className="cx-grid cx-grid--2">
          <div>
            <label className="cx-label" htmlFor="slack-webhook-input">
              Slack Incoming Webhook URL:
            </label>
            <div className="st-url" style={{ position: 'relative' }}>
              <input
                id="slack-webhook-input"
                type={showSecret ? 'text' : 'password'}
                className="cx-input"
                placeholder={status?.configured ? status.webhookUrlMasked : 'https://hooks.slack.com/services/...'}
                value={webhookUrlInput}
                onChange={(e) => setWebhookUrlInput(e.target.value)}
                autoComplete="off"
                style={{ paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                className="cx-btn cx-btn--ghost cx-btn--icon"
                onClick={() => setShowSecret((v) => !v)}
                title={showSecret ? 'Hide URL' : 'Show URL'}
                style={{ position: 'absolute', right: '.5rem', top: '50%', transform: 'translateY(-50%)' }}
              >
                {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="cx-sub" style={{ margin: '.35rem 0 0', fontSize: '.68rem' }}>
              {status?.configured
                ? `Current active URL: ${status.webhookUrlMasked}. Enter a new URL above to replace it.`
                : 'Webhook secrets are stored securely on the backend only and never returned to the browser.'}
            </p>
          </div>

          <div>
            <label className="cx-label" htmlFor="slack-channel-input">
              Override Channel / Alias (Optional):
            </label>
            <input
              id="slack-channel-input"
              type="text"
              className="cx-input"
              placeholder="#security-alerts"
              value={channelInput}
              onChange={(e) => setChannelInput(e.target.value)}
            />
            <p className="cx-sub" style={{ margin: '.35rem 0 0', fontSize: '.68rem' }}>
              Optional channel override (e.g. <code>#security-ops</code> or <code>@admin</code>).
            </p>
          </div>
        </div>

        <div className="cx-row" style={{ marginTop: '1rem', justifyContent: 'space-between' }}>
          <div className="cx-row">
            <button
              type="button"
              className="cx-btn cx-btn--primary"
              disabled={busySave || (!webhookUrlInput.trim() && channelInput === (status?.channel || ''))}
              onClick={handleSaveConfig}
            >
              {busySave ? <Spinner label="Saving" /> : 'Save Configuration'}
            </button>
            <button
              type="button"
              className="cx-btn cx-btn--success"
              disabled={busyTest || !status?.configured}
              onClick={handleTestConnection}
            >
              {busyTest ? <Spinner label="Testing" /> : <><RefreshCw />Test Connection</>}
            </button>
          </div>

          {status?.configured && (
            <button
              type="button"
              className="cx-btn cx-btn--danger cx-btn--ghost"
              disabled={busyClear}
              onClick={handleClearConfig}
            >
              {busyClear ? <Spinner label="Clearing" /> : <><Trash2 />Clear Credentials</>}
            </button>
          )}
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="cx-card" style={{ marginBottom: '1.2rem', background: 'rgba(255,255,255,.65)' }}>
        <div className="cx-card__title">
          <SlidersHorizontal color="#6a5cff" />
          <span>Notification Preferences & Event Categories</span>
          <span className="cx-push cx-sub" style={{ margin: 0, fontSize: '.7rem' }}>
            Changes apply automatically
          </span>
        </div>
        <p className="cx-sub">
          Choose which security event categories generate outbound Slack notifications. Disabled categories remain
          in the local audit ledger but will not be enqueued for external delivery.
        </p>

        <ul className="st-list">
          {PREF_ROWS.map((r) => {
            const isChecked = prefs ? prefs[r.key] : true;
            return (
              <li key={r.key}>
                <span className="cx-icon-box" style={{ background: 'rgba(255,255,255,.8)', width: '2.5rem', height: '2.5rem' }}>
                  {r.icon}
                </span>
                <div>
                  <b>{r.title}</b>
                  <p>{r.desc}</p>
                </div>
                <Toggle
                  checked={isChecked}
                  onChange={(val) => handleTogglePref(r.key, val)}
                  label={r.title}
                  color={r.color}
                />
              </li>
            );
          })}
        </ul>
      </div>

      {/* Notification Delivery History */}
      <div className="cx-card" style={{ background: 'rgba(255,255,255,.65)' }}>
        <div className="cx-card__title">
          <Database color="#10c98f" />
          <span>Notification Delivery History & Audit Trail</span>
          <div className="cx-push cx-row" style={{ gap: '.5rem' }}>
            <div className="seg">
              {['ALL', 'SENT', 'PENDING', 'FAILED'].map((filt) => (
                <button
                  key={filt}
                  type="button"
                  className="cx-chip"
                  aria-pressed={historyFilter === filt}
                  onClick={() => setHistoryFilter(filt)}
                  style={{ fontSize: '.68rem', padding: '.2rem .65rem' }}
                >
                  {filt}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="cx-btn cx-btn--ghost cx-btn--sm"
              onClick={handleRefreshHistory}
              disabled={busyRefresh}
              title="Refresh notification history"
            >
              {busyRefresh ? <Spinner label="Refreshing" /> : <><RotateCcw size={14} />Refresh</>}
            </button>
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="cx-state">
            <Radio size={32} color="#a0aec0" />
            <p>No Slack notification events recorded for this view.</p>
            <small className="cx-muted">Events appear automatically as security alerts and approvals occur.</small>
          </div>
        ) : (
          <div className="cx-tbl-wrap">
            <table className="cx-tbl">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Event Type</th>
                  <th>Severity</th>
                  <th>Component</th>
                  <th>Decision</th>
                  <th>Delivery Status</th>
                  <th>Details / Error</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((item) => {
                  const sevTone =
                    item.severity === 'CRITICAL'
                      ? 'red'
                      : item.severity === 'HIGH'
                      ? 'orange'
                      : item.severity === 'MEDIUM'
                      ? 'amber'
                      : 'blue';

                  const statusTone =
                    item.status === 'SENT'
                      ? 'green'
                      : item.status === 'PENDING'
                      ? 'amber'
                      : item.status === 'FAILED'
                      ? 'red'
                      : 'violet';

                  return (
                    <tr key={item.id}>
                      <td className="cx-mono" style={{ fontSize: '.72rem', whiteSpace: 'nowrap' }}>
                        {formatDate(item.timestamp)}
                      </td>
                      <td>
                        <b className="cx-mono" style={{ fontSize: '.76rem' }}>{item.eventType}</b>
                        <div style={{ fontSize: '.7rem', color: 'var(--mute)' }}>{item.title}</div>
                      </td>
                      <td>
                        <Pill tone={sevTone}>{item.severity}</Pill>
                      </td>
                      <td className="cx-mono" style={{ fontSize: '.74rem' }}>{item.component}</td>
                      <td>
                        <span
                          className={`cx-code ${
                            item.decision === 'BLOCK' || item.decision === 'DENIED'
                              ? 'tone-red'
                              : item.decision === 'REQUIRE_APPROVAL'
                              ? 'tone-amber'
                              : 'tone-green'
                          }`}
                          style={{ fontSize: '.74rem' }}
                        >
                          {item.decision}
                        </span>
                      </td>
                      <td>
                        <Pill tone={statusTone} dot>
                          {item.status}
                          {item.attempts > 1 ? ` (${item.attempts})` : ''}
                        </Pill>
                      </td>
                      <td style={{ fontSize: '.72rem', maxWidth: '240px' }}>
                        {item.error ? (
                          <span className="tone-red cx-mono">{item.error}</span>
                        ) : (
                          <span className="cx-muted cx-mono">{item.description.slice(0, 90)}...</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
