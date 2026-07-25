import { BaseService } from './base-service';
import type { SettingsRecord, SettingsResponse } from './types';

class SettingsService extends BaseService {
  fetchSettings() {
    return this.get<SettingsResponse>('/api/settings');
  }

  saveSettings(settings: SettingsRecord) {
    return this.put<SettingsResponse>('/api/settings', { settings });
  }
}

export const settingsService = new SettingsService();

