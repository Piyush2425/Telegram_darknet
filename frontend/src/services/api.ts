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

export const addCustomChannel = async (username: string, title?: string): Promise<Channel> => {
  const res = await api.post('/channels/add', { username, title });
  return res.data;
};

export const toggleChannelMonitoring = async (channelId: string): Promise<{ channel_id: string; is_monitored: boolean }> => {
  const res = await api.post(`/channels/${channelId}/toggle-monitoring`);
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

export default api;
