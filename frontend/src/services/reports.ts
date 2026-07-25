import { BaseService } from './base-service';
import type { ReportContentResponse, ReportsResponse } from './types';

class ReportsService extends BaseService {
  fetchReports() {
    return this.get<ReportsResponse>('/api/reports');
  }

  fetchReportContent(path: string) {
    return this.get<ReportContentResponse>('/api/reports/content', {
      params: { path },
    });
  }
}

export const reportsService = new ReportsService();
