import { BaseService } from './base-service';
import type { DashboardResponse, DashboardStatusResponse, HealthResponse } from './types';

class DashboardService extends BaseService {
  fetchDashboard() {
    return this.get<DashboardResponse>('/api/dashboard');
  }

  fetchStatus() {
    return this.get<DashboardStatusResponse>('/api/status');
  }

  fetchHealth() {
    return this.get<HealthResponse>('/api/health');
  }
}

export const dashboardService = new DashboardService();

