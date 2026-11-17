import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { demoFlags, overviewService, setSimulatedErrors } from '../services';
import type { SecurityEvent } from '../types';
import { useInterval } from '../hooks/useInterval';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { clock, uid } from '../utils/format';

export interface Settings {
  demoMode: boolean;
  heartbeat: boolean;
  notifications: boolean;
  auditLogging: boolean;
  webCrypto: boolean;
  simulateErrors: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  demoMode: true, heartbeat: true, notifications: true, auditLogging: true, webCrypto: true, simulateErrors: false,
};

export type ToastTone = 'green' | 'red' | 'blue' | 'amber';
interface Toast { id: string; tone: ToastTone; text: string }

interface Counts { pendingApprovals: number; threats: number }

interface ConsoleValue {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  resetSettings: () => void;
  counts: Counts;
  refreshCounts: () => void;
  liveEvents: SecurityEvent[];
  toasts: Toast[];
  toast: (text: string, tone?: ToastTone) => void;
  dismissToast: (id: string) => void;
}

const Ctx = createContext<ConsoleValue | null>(null);

const HEARTBEATS: Omit<SecurityEvent, 'id' | 'time'>[] = [
  { source: 'Ollama Core', message: 'Heartbeat response: llama3 standby (temp 0.2)', kind: 'SUCCESS' },
  { source: 'Air-Gap Monitor', message: 'NIC socket check: 0 outbound connections detected', kind: 'INFO' },
  { source: 'Policy Engine', message: 'Zero-trust perimeter verification: All rules active', kind: 'INFO' },
  { source: 'Integrity Daemon', message: 'SHA-256 chain integrity verified: 0 tampered blocks', kind: 'AUDIT' },
];

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useLocalStorage<Settings>('clarix.settings.v1', DEFAULT_SETTINGS);
  const [counts, setCounts] = useState<Counts>({ pendingApprovals: 0, threats: 0 });
  const [liveEvents, setLiveEvents] = useState<SecurityEvent[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((text: string, tone: ToastTone = 'blue') => {
    const id = uid('t');
    setToasts((t) => [...t.slice(-3), { id, tone, text }]);
    window.setTimeout(() => dismissToast(id), 4200);
  }, [dismissToast]);

  const refreshCounts = useCallback(() => {
    overviewService.get().then(
      (o) => setCounts({ pendingApprovals: o.pendingApprovals, threats: o.threats }),
      () => { /* keep previous counts; pages show their own error states */ },
    );
  }, []);

  useEffect(() => { refreshCounts(); }, [refreshCounts]);
  useEffect(() => { setSimulatedErrors(settings.simulateErrors); }, [settings.simulateErrors]);
  useEffect(() => { demoFlags.audit = settings.auditLogging; demoFlags.crypto = settings.webCrypto; }, [settings.auditLogging, settings.webCrypto]);

  // Simulated heartbeat: clearly mock events, not real telemetry.
  useInterval(() => {
    const h = HEARTBEATS[Math.floor(Date.now() / 18000) % HEARTBEATS.length];
    setLiveEvents((e) => [{ ...h, id: uid('hb'), time: clock() }, ...e].slice(0, 30));
  }, settings.heartbeat ? 18000 : null);

  const setSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings({ ...settings, [key]: value });
  }, [settings, setSettings]);

  const resetSettings = useCallback(() => setSettings(DEFAULT_SETTINGS), [setSettings]);

  const value = useMemo<ConsoleValue>(() => ({ settings, setSetting, resetSettings, counts, refreshCounts, liveEvents, toasts, toast, dismissToast }),
    [settings, setSetting, resetSettings, counts, refreshCounts, liveEvents, toasts, toast, dismissToast]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConsole(): ConsoleValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useConsole must be used inside <ConsoleProvider>');
  return v;
}
