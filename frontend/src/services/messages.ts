import { BaseService } from './base-service';
import type { MessagesQuery, MessagesResponse } from './types';

class MessagesService extends BaseService {
  fetchMessages(query: MessagesQuery = {}) {
    return this.get<MessagesResponse>('/api/messages', {
      params: query,
    });
  }

  deleteMessage(messageId: number) {
    return this.delete<{ success?: boolean; message?: string }>(`/api/messages/${messageId}`);
  }
}

export const messagesService = new MessagesService();
