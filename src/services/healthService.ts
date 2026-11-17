import { config, mock, request } from './client';
import * as db from './mock/db';
import type { HealthService } from '../types';

export const healthService = {
  /** BACKEND: GET /api/health */
  get(): Promise<{ services: HealthService[]; series: typeof db.telemetrySeries }> {
    if (!config.useMocks) return request('/api/health');
    return mock(() => ({ services: db.healthServices, series: db.telemetrySeries }));
  },
};
