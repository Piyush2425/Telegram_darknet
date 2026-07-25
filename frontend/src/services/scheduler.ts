import { BaseService } from './base-service';
import type { ScraperProgress, EntityScrapeStats, SchedulerStatus } from './types';

class SchedulerService extends BaseService {
  fetchSchedulerStatus() {
    return this.get<{ success?: boolean; scheduler: SchedulerStatus }>('/api/scheduler');
  }

  saveScheduler(payload: { run_at: string; interval_hours: number }) {
    return this.post<{ success?: boolean; scheduler: SchedulerStatus }>('/api/scheduler', payload);
  }

  runSchedulerNow() {
    return this.post<{ success?: boolean; scheduler: SchedulerStatus }>('/api/scheduler/run');
  }

  startSelectedScraping(payload: { selected_ids: number[] }) {
    return this.post<{ success?: boolean; started?: boolean; count?: number; scheduler?: SchedulerStatus }>('/api/scheduler/start', payload);
  }

  fetchScraperProgress() {
    return this.get<ScraperProgress>('/api/scraper/progress');
  }

  fetchEntityStats() {
    return this.get<{ success?: boolean; stats: EntityScrapeStats[] }>('/api/scraper/entity-stats');
  }
}

export const schedulerService = new SchedulerService();
