import { BaseService } from './base-service';
import type {
  ChannelRecord,
  ChannelScrapeResult,
  CredentialsPayload,
  TelegramEntity,
  TelegramSelectionPayload,
} from './types';

class TelegramService extends BaseService {
  fetchChannels() {
    return this.get<{ channels: ChannelRecord[] }>('/api/channels');
  }

  addChannel(link: string) {
    return this.post<{ success: boolean; channel: ChannelRecord }>('/api/channels', { link });
  }

  removeChannel(channelId: number) {
    return this.delete<{ success: boolean }>(`/api/channels/${channelId}`);
  }

  scrapeChannelMessages(channelId: number) {
    return this.post<ChannelScrapeResult>(`/api/channels/${channelId}/scrape/messages`);
  }

  scrapeChannelMembers(channelId: number) {
    return this.post<ChannelScrapeResult>(`/api/channels/${channelId}/scrape/members`);
  }

  fetchEntities(search = '') {
    return this.get<{ success?: boolean; entities: TelegramEntity[] }>('/api/telegram-entities', {
      params: { search },
    });
  }

  refreshEntities() {
    return this.post<{ success?: boolean; count?: number; entities: TelegramEntity[] }>('/api/telegram-entities/refresh');
  }

  saveEntitySelection(payload: TelegramSelectionPayload) {
    return this.put<{ success?: boolean; modified_count?: number }>('/api/telegram-entities/selection', payload);
  }

  scrapeEntity(telegramId: number) {
    return this.post<Record<string, unknown>>(`/api/telegram-entities/${telegramId}/scrape`);
  }

  deleteTelegramEntity(telegramId: number) {
    return this.delete<{ success?: boolean; message?: string }>(`/api/telegram-entities/${telegramId}`);
  }

  fetchCredentialsStatus() {
    return this.get<{ loaded?: boolean }>('/api/credentials');
  }

  saveCredentials(payload: CredentialsPayload) {
    return this.post<{ success?: boolean; message?: string }>('/api/credentials', payload);
  }

  initializeClient() {
    return this.post<{ success?: boolean; message?: string }>('/api/initialize');
  }
}

export const telegramService = new TelegramService();
