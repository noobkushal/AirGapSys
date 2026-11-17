import { config, mock, request } from './client';
import * as db from './mock/db';
import type { OllamaModel } from '../types';

export interface OllamaStatus { online: boolean; version: string; accel: string; speed: number; total: number; models: OllamaModel[] }

export const ollamaService = {
  /** BACKEND: GET /api/ollama/status (backend talks to 127.0.0.1:11434; the browser never does) */
  status(): Promise<OllamaStatus> {
    if (!config.useMocks) return request('/api/ollama/status');
    return mock(() => ({ online: true, version: '0.4.1 (Air-Gapped Build)', accel: 'Apple Silicon Metal', speed: 42.6, total: 730, models: db.ollamaModels }));
  },
  /** BACKEND: POST /api/ollama/benchmark */
  benchmark(model: string, temperature: number, topP: number): Promise<{ tokensPerSec: number; ttftMs: number; note: string }> {
    if (!config.useMocks) return request('/api/ollama/benchmark', { method: 'POST', body: JSON.stringify({ model, temperature, topP }) }, 130000);
    return mock(() => ({ tokensPerSec: model === 'llama3' ? 42.6 : 31.2, ttftMs: 410, note: 'Simulated figures. Connect the backend for a real benchmark.' }), 1600);
  },
};
