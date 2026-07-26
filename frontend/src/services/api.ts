import axios from 'axios';
import { Channel, Message, ThreatIntelligence, Report, ScraperStatus, IntelligenceSummary } from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

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

export const getUrlLedger = async (channelId: string): Promise<{ report: string; channel_title: string }> => {
  const res = await api.get(`/channels/${channelId}/url-ledger`);
  return res.data;
};


export const scrapeSingleChannel = async (channelId: string): Promise<{ status: string }> => {
  const res = await api.post(`/channels/${channelId}/scrape`);
  return res.data;
};


export const getMessages = async (params?: { channel_id?: string; threat_level?: string; search?: string }): Promise<Message[]> => {
  const res = await api.get('/messages', { params });
  return res.data;
};

export const startScraping = async (): Promise<{ status: string }> => {
  const res = await api.post('/scraper/start');
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
export const getTelegramAuthStatus = async (): Promise<{ is_authorized: boolean; user?: any; reason?: string }> => {
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
): Promise<{ status: string; user?: any; error?: string; message?: string }> => {
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
