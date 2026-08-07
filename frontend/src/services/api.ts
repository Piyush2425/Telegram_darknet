import axios from 'axios';
import { Channel, Message, ThreatIntelligence, Report, ScraperStatus, IntelligenceSummary, TelegramUser } from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Axios Retry Interceptor with Exponential Backoff
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config } = error;
    
    if (!config) {
      return Promise.reject(error);
    }
    
    // Initialize retry configuration
    config.retryConfig = config.retryConfig || {
      retryCount: 0,
      maxRetries: 3,
      delay: 1000,
    };
    
    const isNetworkError = !error.response;
    const isServerError = error.response && error.response.status >= 500;
    
    if ((isNetworkError || isServerError) && config.retryConfig.retryCount < config.retryConfig.maxRetries) {
      config.retryConfig.retryCount += 1;
      const backoffDelay = config.retryConfig.delay * Math.pow(2, config.retryConfig.retryCount - 1);
      
      console.warn(`[API Proxy] Connection failed. Retrying ${config.url} (${config.retryConfig.retryCount}/${config.retryConfig.maxRetries}) in ${backoffDelay}ms...`);
      
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      return api(config);
    }
    
    return Promise.reject(error);
  }
);

export const getChannels = async (): Promise<Channel[]> => {
  const res = await api.get('/channels');
  return res.data;
};

export const syncTelegramChannels = async (): Promise<{ imported_count: number; channels: Channel[] }> => {
  const res = await api.post('/channels/sync-telegram');
  return res.data;
};

export const addCustomChannel = async (username: string, title?: string): Promise<Channel> => {
  const res = await api.post('/channels/add', { username, title });
  return res.data;
};

export const toggleChannelMonitoring = async (channelId: string): Promise<{ channel_id: string; is_monitored: boolean }> => {
  const res = await api.post(`/channels/${channelId}/toggle-monitoring`);
  return res.data;
};

export const scheduleChannel = async (
  channelId: string, 
  isAutoMonitoring: boolean, 
  intervalValue: number, 
  intervalUnit: string,
  isAutoAi?: boolean,
  aiIntervalValue?: number,
  aiIntervalUnit?: string,
  isAutoReport?: boolean,
  reportIntervalValue?: number,
  reportIntervalUnit?: string
): Promise<Channel> => {
  const res = await api.post(`/channels/${channelId}/schedule`, {
    is_auto_monitoring: isAutoMonitoring,
    interval_value: intervalValue,
    interval_unit: intervalUnit,
    is_auto_ai: isAutoAi || false,
    ai_interval_value: aiIntervalValue || 60,
    ai_interval_unit: aiIntervalUnit || "minutes",
    is_auto_report: isAutoReport || false,
    report_interval_value: reportIntervalValue || 24,
    report_interval_unit: reportIntervalUnit || "hours"
  });
  return res.data;
};

export const deleteChannel = async (channelId: string): Promise<{ status: string }> => {
  const res = await api.delete(`/channels/${channelId}`);
  return res.data;
};

export const generateAiReport = async (
  channelId: string, 
  startDate?: string, 
  endDate?: string
): Promise<{ report: string; channel_title: string; count: number; report_id: string }> => {
  const res = await api.post(`/channels/${channelId}/ai-report`, {
    start_date: startDate || undefined,
    end_date: endDate || undefined
  });
  return res.data;
};

export const getLiveReport = async (channelId: string, date?: string): Promise<{ report: string; channel_title: string; date: string }> => {
  const params = date ? { date } : {};
  const res = await api.get(`/channels/${channelId}/live-report`, { params });
  return res.data;
};


export const scrapeSingleChannel = async (channelId: string): Promise<{ status: string }> => {
  const res = await api.post(`/channels/${channelId}/scrape`);
  return res.data;
};


export const getMessages = async (params?: { channel_id?: string; threat_level?: string; search?: string; fuzzy?: boolean }): Promise<Message[]> => {
  const res = await api.get('/messages', { params });
  return res.data;
};

export const globalSearch = async (
  q: string, 
  threatLevel?: string, 
  fuzzy?: boolean,
  page: number = 1,
  limit: number = 50
): Promise<{ results: Message[]; has_more: boolean }> => {
  const params: Record<string, any> = { q, page, limit };
  if (threatLevel) params.threat_level = threatLevel;
  if (fuzzy) params.fuzzy = true;
  const res = await api.get('/messages/global-search', { params });
  return res.data;
};

export const getMessageCount = async (): Promise<{ total: number; total_on_disk: number; per_channel_on_disk: Record<string, number> }> => {
  const res = await api.get('/messages/count');
  return res.data;
};

export const startScraping = async (): Promise<{ status: string }> => {
  const res = await api.post('/scraper/start');
  return res.data;
};

export const stopScraping = async (): Promise<{ status: string }> => {
  const res = await api.post('/scraper/stop');
  return res.data;
};

export const getScraperStatus = async (): Promise<ScraperStatus> => {
  const res = await api.get('/scraper/status');
  return res.data;
};

export const getIntelligenceSummary = async (): Promise<IntelligenceSummary> => {
  const res = await api.get('/intelligence/summary');
  return res.data;
};

export const getReports = async (): Promise<Report[]> => {
  const res = await api.get('/reports');
  return res.data;
};

// Telegram Auth & OTP API
export const getTelegramAuthStatus = async (): Promise<{ is_authorized: boolean; user?: TelegramUser; reason?: string }> => {
  const res = await api.get('/telegram/auth/status');
  return res.data;
};

export const sendTelegramOtpCode = async (phoneNumber: string, apiId?: number, apiHash?: string): Promise<{ status: string; phone_code_hash?: string; error?: string }> => {
  const res = await api.post('/telegram/auth/send-code', { 
    phone_number: phoneNumber,
    api_id: apiId || 0,
    api_hash: apiHash || ""
  });
  return res.data;
};

export const verifyTelegramOtpCode = async (
  phoneNumber: string, 
  code: string, 
  phoneCodeHash?: string, 
  password?: string
): Promise<{ status: string; user?: TelegramUser; error?: string; message?: string }> => {
  const res = await api.post('/telegram/auth/verify-code', {
    phone_number: phoneNumber,
    code,
    phone_code_hash: phoneCodeHash,
    password
  });
  return res.data;
};

export const getNotifications = async (): Promise<any[]> => {
  const res = await api.get('/notifications');
  return res.data;
};

export const markNotificationsRead = async (): Promise<{ status: string }> => {
  const res = await api.post('/notifications/read-all');
  return res.data;
};

export default api;
