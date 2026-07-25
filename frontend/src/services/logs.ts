import { BaseService } from './base-service';
import type { LogsResponse } from './types';

class LogsService extends BaseService {
  fetchLogs(params: { search?: string; level?: string; limit?: number; offset?: number } = {}) {
    return this.get<LogsResponse>('/api/logs', { params });
  }
}

export const logsService = new LogsService();

