import {
  Bot, Cpu, Database, FileCheck, FileText, Fingerprint, GitFork, HeartPulse, Layers, LayoutGrid,
  Settings, Shield, ShieldAlert, Terminal, UserCheck, WifiOff, Wrench, type LucideIcon,
} from 'lucide-react';

export type NavBadge = { kind: 'count'; source: 'threats'; tone: 'red' } | { kind: 'count'; source: 'approvals'; tone: 'amber' } | { kind: 'text'; text: string; tone: 'red' | 'green' };

export interface NavItem { path: string; label: string; icon: LucideIcon; badge?: NavBadge }
export interface NavGroup { label: string; items: NavItem[] }

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { path: '/overview', label: 'Overview', icon: LayoutGrid },
      { path: '/agent', label: 'AI Agent', icon: Bot },
      { path: '/security-monitor', label: 'Security Harness', icon: Shield },
      { path: '/prompt-injection', label: 'Prompt Injection', icon: ShieldAlert, badge: { kind: 'count', source: 'threats', tone: 'red' } },
      { path: '/taint', label: 'Data Taint', icon: GitFork },
      { path: '/policies', label: 'Policy Engine', icon: FileCheck },
      { path: '/tool-permissions', label: 'Tool Permissions', icon: Wrench },
      { path: '/approvals', label: 'Human Approval', icon: UserCheck, badge: { kind: 'count', source: 'approvals', tone: 'amber' } },
      { path: '/air-gap', label: 'Air-Gap Monitor', icon: WifiOff, badge: { kind: 'text', text: 'ISOLATED', tone: 'red' } },
      { path: '/rag', label: 'Local RAG', icon: Database },
      { path: '/ollama', label: 'Ollama Engine', icon: Cpu, badge: { kind: 'text', text: 'ONLINE', tone: 'green' } },
    ],
  },
  {
    label: 'Runtime & evidence',
    items: [
      { path: '/local-tools', label: 'Local Tools', icon: Terminal },
      { path: '/audit', label: 'Audit Logs', icon: FileText },
      { path: '/integrity', label: 'SHA-256 Integrity', icon: Fingerprint },
    ],
  },
  {
    label: 'System',
    items: [
      { path: '/architecture', label: 'Architecture', icon: Layers },
      { path: '/health', label: 'System Health', icon: HeartPulse },
      { path: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export const ALL_NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
