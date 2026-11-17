import { config, probe } from './client';
import type { BackendStatus } from '../types';

export const settingsService = {
  /** Real browser-side probe of the FastAPI health route. */
  testBackend(url: string): Promise<BackendStatus> { return probe(url, '/health'); },
  /** Real browser-side probe of Ollama's version route (needs OLLAMA_ORIGINS to allow this page). */
  testOllama(url: string): Promise<BackendStatus> { return probe(url, '/api/version'); },
  defaults: { apiUrl: config.apiUrl, ollamaUrl: config.ollamaUrl },
};
