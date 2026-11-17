/**
 * API client + mock switch.
 *
 * BACKEND: when the FastAPI service is running, set VITE_USE_MOCKS=false and every
 * service below calls `request()` against VITE_API_URL instead of the mock database.
 * Security decisions (policy, taint, approval, air-gap) are enforced server-side; this
 * UI only displays and requests them.
 */
import type { BackendStatus } from '../types';

export const config = {
  useMocks: import.meta.env.VITE_USE_MOCKS !== 'false',
  apiUrl: (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, ''),
  // Optional bearer token for the loopback operator console. VITE_ variables are bundled into the page, so
  // only use a token that is acceptable to expose to anyone who can open this UI.
  apiToken: import.meta.env.VITE_API_TOKEN ?? '',
  ollamaUrl: (import.meta.env.VITE_OLLAMA_URL ?? 'http://localhost:11434').replace(/\/$/, ''),
};

export function setEndpoints(apiUrl: string, ollamaUrl: string): void {
  config.apiUrl = apiUrl.replace(/\/$/, '');
  config.ollamaUrl = ollamaUrl.replace(/\/$/, '');
}

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let simulateErrors = false;
export const setSimulatedErrors = (v: boolean): void => { simulateErrors = v; };
export const getSimulatedErrors = (): boolean => simulateErrors;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Resolves mock data after a short delay; honours the "simulate errors" demo control. */
export async function mock<T>(produce: () => T, ms = 260): Promise<T> {
  await sleep(ms);
  if (simulateErrors) throw new ApiError('Simulated service failure (demo control in Settings).', 503);
  return JSON.parse(JSON.stringify(produce())) as T;
}

export async function request<T>(path: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const isForm = typeof FormData !== 'undefined' && init?.body instanceof FormData;
    const res = await fetch(`${config.apiUrl}${path}`, {
      ...init,
      headers: {
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        ...(config.apiToken ? { Authorization: `Bearer ${config.apiToken}` } : {}),
        ...(init?.headers ?? {}),
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let msg = `Backend returned ${res.status} for ${path}`;
      try {
        const j = (await res.json()) as { error?: { message?: string } };
        if (j.error?.message) msg = j.error.message;
      } catch { /* non-JSON error body */ }
      throw new ApiError(msg, res.status);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(`Cannot reach backend at ${config.apiUrl}. Is the FastAPI service running?`);
  } finally {
    clearTimeout(t);
  }
}

/** Real connectivity probe used by Settings. Only loopback/LAN targets make sense in an air-gap. */
export async function probe(url: string, path = ''): Promise<BackendStatus> {
  const started = performance.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(url.replace(/\/$/, '') + path, { signal: ctrl.signal });
    return { ok: res.ok, message: res.ok ? `Responded ${res.status}` : `Responded with HTTP ${res.status}`, latencyMs: Math.round(performance.now() - started) };
  } catch {
    return { ok: false, message: 'No response. The service is not running, or the browser blocked the request (CORS).' };
  } finally {
    clearTimeout(t);
  }
}
