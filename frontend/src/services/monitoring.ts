import { BaseService } from './base-service';
import type { MonitoringResponse } from './types';

class MonitoringService extends BaseService {
  fetchMonitoring() {
    return this.get<MonitoringResponse>('/api/monitoring');
  }

  pauseMonitoring() {
    return this.post<{ success?: boolean; status?: string }>('/api/monitoring/pause');
  }

  resumeMonitoring() {
    return this.post<{ success?: boolean; status?: string }>('/api/monitoring/resume');
  }

  stopMonitoring() {
    return this.post<{ success?: boolean; status?: string }>('/api/monitoring/stop');
  }
}

export const monitoringService = new MonitoringService();

