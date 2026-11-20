import { config, mock, request } from './client';
import type {
  SlackConfigUpdate,
  SlackNotificationHistoryItem,
  SlackPreferences,
  SlackStatus,
} from '../types';

// Mock state for frontend-only demo mode
let mockStatus: SlackStatus = {
  enabled: false,
  connectionState: 'DISCONNECTED',
  configured: false,
  webhookUrlMasked: '',
  channel: '#security-alerts',
  lastSuccessAt: null,
  lastError: null,
  lastTestedAt: null,
  strictAirgap: true,
  relayEnabled: false,
  queue: {
    total: 3,
    pending: 1,
    sent: 2,
    failed: 0,
    blockedAirgap: 0,
  },
};

let mockPreferences: SlackPreferences = {
  prompt_injection: true,
  blocked_actions: true,
  approval_requests: true,
  approval_decisions: true,
  network_security: true,
  policy_changes: true,
  critical_audit: true,
};

let mockHistory: SlackNotificationHistoryItem[] = [
  {
    id: 'SLK-000003',
    eventType: 'Malicious Prompt Blocked',
    category: 'prompt_injection',
    severity: 'CRITICAL',
    title: 'Malicious Prompt Blocked (Jailbreak Attempt)',
    description: 'Prompt injection pattern matched instruction-override heuristic.',
    component: 'AI Agent',
    decision: 'BLOCKED',
    eventId: 'REQ-2026-00014',
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    status: 'PENDING',
    attempts: 0,
    sentAt: null,
    error: null,
  },
  {
    id: 'SLK-000002',
    eventType: 'Human Approval Granted',
    category: 'approval_decisions',
    severity: 'LOW',
    title: 'Approval AP-0004 Granted',
    description: 'Operator dev-operator approved tool execution.',
    component: 'Human Approval',
    decision: 'APPROVED',
    eventId: 'AP-0004',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    status: 'SENT',
    attempts: 1,
    sentAt: new Date(Date.now() - 1000 * 60 * 44).toISOString(),
    error: null,
  },
  {
    id: 'SLK-000001',
    eventType: 'Unauthorized Network Connection Attempt Blocked',
    category: 'network_security',
    severity: 'CRITICAL',
    title: 'Unauthorized Network Connection Blocked',
    description: 'Outbound TCP to 198.51.100.22:443 blocked by air-gap guard (POL-001).',
    component: 'Air-Gap Monitor',
    decision: 'BLOCKED',
    eventId: 'NET-1774001',
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    status: 'SENT',
    attempts: 1,
    sentAt: new Date(Date.now() - 1000 * 60 * 119).toISOString(),
    error: null,
  },
];

export const slackService = {
  async getStatus(): Promise<SlackStatus> {
    if (config.useMocks) {
      return mock(() => mockStatus);
    }
    return request<SlackStatus>('/api/slack/status');
  },

  async updateConfig(data: SlackConfigUpdate): Promise<SlackStatus> {
    if (config.useMocks) {
      return mock(() => {
        const url = data.webhookUrl !== undefined ? data.webhookUrl.trim() : (mockStatus.configured ? 'configured' : '');
        const configured = Boolean(url);
        const enabled = data.enabled !== undefined ? data.enabled : mockStatus.enabled;
        const channel = data.channel !== undefined ? data.channel.trim() : mockStatus.channel;

        mockStatus = {
          ...mockStatus,
          configured,
          enabled,
          channel,
          webhookUrlMasked: configured ? 'https://hooks.slack.com/services/T0000/B0000/*** [MASKED]' : '',
          connectionState: !enabled || !configured ? 'DISCONNECTED' : mockStatus.lastError ? 'ERROR' : 'CONNECTED',
        };
        return mockStatus;
      });
    }
    return request<SlackStatus>('/api/slack/config', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async clearConfig(): Promise<SlackStatus> {
    if (config.useMocks) {
      return mock(() => {
        mockStatus = {
          ...mockStatus,
          enabled: false,
          configured: false,
          webhookUrlMasked: '',
          channel: '',
          lastError: null,
          connectionState: 'DISCONNECTED',
        };
        return mockStatus;
      });
    }
    return request<SlackStatus>('/api/slack/config', {
      method: 'DELETE',
    });
  },

  async testConnection(): Promise<{ ok: boolean; message: string; connectionState: 'CONNECTED' | 'DISCONNECTED' | 'ERROR'; lastTestedAt?: string }> {
    if (config.useMocks) {
      return mock(() => {
        if (!mockStatus.configured) {
          throw new Error('No Slack webhook URL is configured.');
        }
        const now = new Date().toISOString();
        mockStatus = {
          ...mockStatus,
          connectionState: 'CONNECTED',
          lastSuccessAt: now,
          lastTestedAt: now,
          lastError: null,
        };
        return {
          ok: true,
          message: 'Test notification delivered successfully to Slack channel.',
          connectionState: 'CONNECTED',
          lastTestedAt: now,
        };
      }, 500);
    }
    return request<{ ok: boolean; message: string; connectionState: 'CONNECTED' | 'DISCONNECTED' | 'ERROR'; lastTestedAt?: string }>('/api/slack/test', {
      method: 'POST',
      body: '{}',
    });
  },

  async getPreferences(): Promise<SlackPreferences> {
    if (config.useMocks) {
      return mock(() => mockPreferences);
    }
    return request<SlackPreferences>('/api/slack/preferences');
  },

  async updatePreferences(prefs: Partial<SlackPreferences>): Promise<SlackPreferences> {
    if (config.useMocks) {
      return mock(() => {
        mockPreferences = { ...mockPreferences, ...prefs };
        return mockPreferences;
      });
    }
    return request<SlackPreferences>('/api/slack/preferences', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    });
  },

  async getHistory(limit = 50, status?: string): Promise<SlackNotificationHistoryItem[]> {
    if (config.useMocks) {
      return mock(() => {
        if (status) {
          return mockHistory.filter((item) => item.status === status).slice(0, limit);
        }
        return mockHistory.slice(0, limit);
      });
    }
    const statusQuery = status ? `&status=${encodeURIComponent(status)}` : '';
    return request<SlackNotificationHistoryItem[]>(`/api/slack/history?limit=${limit}${statusQuery}`);
  },
};
