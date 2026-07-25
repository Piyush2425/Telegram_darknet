export { apiErrorToMessage, normalizeApiError } from '@/utils/errors';
import { http as api } from './http';
import { dashboardService } from './dashboard';
import { logsService } from './logs';
import { messagesService } from './messages';
import { monitoringService } from './monitoring';
import { reportsService } from './reports';
import { schedulerService } from './scheduler';
import { settingsService } from './settings';
import { telegramService } from './telegram';
import type {
  GroupMemoryResponse,
  GroupMonitoringListResponse,
  GroupMonitoringResponse,
  GroupReportsResponse,
} from './types';
export type {
  ChannelRecord,
  ChannelScrapeResult,
  CredentialsPayload,
  GroupMemoryResponse,
  GroupMonitoringListResponse,
  GroupMonitoringResponse,
  GroupReportsResponse,
  DashboardResponse,
  DashboardStatusResponse,
  HealthResponse,
  LogsResponse,
  MessageRecord,
  MessagesQuery,
  MessagesResponse,
  MonitoringResponse,
  ReportContentResponse,
  ReportFileRecord,
  ReportsResponse,
  SchedulerStatus,
  SettingsRecord,
  SettingsResponse,
  MonitoringGroup,
  TelegramEntity,
  TelegramSelectionPayload,
  DashboardStatusResponse as StatusResponse,
  ScraperProgress,
} from './types';
export { ApiError, http as api } from './http';
export { dashboardService } from './dashboard';
export { logsService } from './logs';
export { messagesService } from './messages';
export { monitoringService } from './monitoring';
export { reportsService } from './reports';
export { schedulerService } from './scheduler';
export { settingsService } from './settings';
export { telegramService } from './telegram';

export async function fetchDashboard() {
  return dashboardService.fetchDashboard();
}

export async function fetchStatus() {
  return dashboardService.fetchStatus();
}

export async function fetchHealth() {
  return dashboardService.fetchHealth();
}

export async function fetchChannels() {
  const response = await telegramService.fetchChannels();
  return response.channels ?? [];
}

export async function addChannel(link: string) {
  return telegramService.addChannel(link);
}

export async function removeChannel(channelId: number) {
  return telegramService.removeChannel(channelId);
}

export async function scrapeChannelMessages(channelId: number) {
  return telegramService.scrapeChannelMessages(channelId);
}

export async function scrapeChannelMembers(channelId: number) {
  return telegramService.scrapeChannelMembers(channelId);
}

export async function fetchTelegramEntities(search = '') {
  const response = await telegramService.fetchEntities(search);
  return response.entities ?? [];
}

export async function refreshTelegramEntities() {
  return telegramService.refreshEntities();
}

export async function saveTelegramEntitySelection(payload: { enabled_ids: number[]; disabled_ids: number[] }) {
  return telegramService.saveEntitySelection(payload);
}

export async function scrapeTelegramEntity(telegramId: number) {
  return telegramService.scrapeEntity(telegramId);
}

export async function deleteTelegramEntity(telegramId: number) {
  return telegramService.deleteTelegramEntity(telegramId);
}

export async function fetchSchedulerStatus() {
  const response = await schedulerService.fetchSchedulerStatus();
  return response.scheduler;
}

export async function saveScheduler(payload: { run_at: string; interval_hours: number }) {
  const response = await schedulerService.saveScheduler(payload);
  return response.scheduler;
}

export async function runSchedulerNow() {
  const response = await schedulerService.runSchedulerNow();
  return response.scheduler;
}

export async function startSelectedScraping(payload: { selected_ids: number[] }) {
  return schedulerService.startSelectedScraping(payload);
}

export async function fetchScraperProgress() {
  const response = await schedulerService.fetchScraperProgress();
  return response;
}

export async function fetchEntityStats() {
  const response = await schedulerService.fetchEntityStats();
  return response.stats ?? [];
}

export async function fetchCredentialsStatus() {
  const response = await telegramService.fetchCredentialsStatus();
  return response.loaded ?? false;
}

export async function saveCredentials(payload: { api_id: string; api_hash: string; phone: string }) {
  return telegramService.saveCredentials(payload);
}

export async function initializeClient() {
  return telegramService.initializeClient();
}

export async function fetchMessages(query: { page?: number; page_size?: number; search?: string; sort_by?: string; sort_order?: 'asc' | 'desc'; chat_id?: number | string; level?: string } = {}) {
  return messagesService.fetchMessages(query);
}

export async function deleteMessage(messageId: number) {
  return messagesService.deleteMessage(messageId);
}

export async function fetchMonitoring() {
  return monitoringService.fetchMonitoring();
}

export async function pauseMonitoring() {
  return monitoringService.pauseMonitoring();
}

export async function resumeMonitoring() {
  return monitoringService.resumeMonitoring();
}

export async function stopMonitoring() {
  return monitoringService.stopMonitoring();
}

export async function fetchLogs(query: { search?: string; level?: string; limit?: number; offset?: number } = {}) {
  return logsService.fetchLogs(query);
}

export async function fetchSettings() {
  return settingsService.fetchSettings();
}

export async function saveSettings(settings: import('./types').SettingsRecord) {
  return settingsService.saveSettings(settings);
}

export async function fetchReports() {
  return reportsService.fetchReports();
}

export async function fetchReportContent(path: string) {
  return reportsService.fetchReportContent(path);
}

export async function fetchMonitoringGroups() {
  const response = await api.get<GroupMonitoringListResponse>('/api/telegram-entities/monitoring');
  const data = response.data;
  return data.groups ?? [];
}

export async function fetchGroupStatus(telegramId: number) {
  const response = await api.get<GroupMonitoringResponse>(`/api/telegram-entities/${telegramId}/status`);
  return response.data.group ?? null;
}

export async function updateGroupInterval(telegramId: number, intervalMinutes: number) {
  return api.put(`/api/telegram-entities/${telegramId}/interval`, { interval_minutes: intervalMinutes });
}

export async function startGroupMonitoring(telegramId: number) {
  return api.post(`/api/telegram-entities/${telegramId}/monitor/start`);
}

export async function stopGroupMonitoring(telegramId: number) {
  return api.post(`/api/telegram-entities/${telegramId}/monitor/stop`);
}

export async function fetchGroupMemory(telegramId: number) {
  const response = await api.get<GroupMemoryResponse>(`/api/telegram-entities/${telegramId}/memory`);
  return response.data.memory ?? null;
}

export async function fetchGroupReports(telegramId: number) {
  const response = await api.get<GroupReportsResponse>(`/api/telegram-entities/${telegramId}/reports`);
  return response.data.reports ?? [];
}

export async function generateGroupReport(telegramId: number) {
  return api.post(`/api/telegram-entities/${telegramId}/reports/generate`);
}

export async function downloadGroupReport(telegramId: number, path: string) {
  return api.get(`/api/telegram-entities/${telegramId}/reports/download`, {
    params: { path },
    responseType: 'blob',
  });
}
