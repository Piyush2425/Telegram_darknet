export interface DashboardResponse {
  success?: boolean;
  telegram_status?: string;
  mongodb_status?: string;
  scheduler_status?: string;
  messages_collected_today?: number;
  total_messages?: number;
  total_channels?: number;
  total_groups?: number;
}

export interface DashboardStatusResponse {
  credentials_loaded?: boolean;
  client_connected?: boolean;
  channels_count?: number;
  messages_collected_today?: number;
  total_messages?: number;
  mongodb_status?: string;
}

export interface TelegramEntity {
  telegram_id: number;
  title: string;
  username?: string | null;
  type?: string | null;
  is_private?: boolean;
  participants_count?: number | null;
  enabled?: boolean;
  messages_stored?: number;
  new_messages?: number;
  last_message_id?: number | null;
  last_scraped?: string | null;
  last_scrape?: string | null;
  monitoring_status?: string | null;
  last_synced?: string | null;
  access_hash?: number | null;
  interval_minutes?: number | null;
  next_scrape_at?: string | null;
  last_analysis_at?: string | null;
  last_analysis_message_id?: number | null;
  last_error?: string | null;
  memory_path?: string | null;
  daily_report_path?: string | null;
  daily_pdf_path?: string | null;
}

export interface MonitoringGroup extends TelegramEntity {
  status?: string | null;
  next_scrape_at?: string | null;
  last_analysis_at?: string | null;
  last_analysis_message_id?: number | null;
  last_error?: string | null;
  memory_path?: string | null;
  daily_report_path?: string | null;
  daily_pdf_path?: string | null;
}

export interface ChannelRecord {
  id: number;
  title?: string;
  username?: string | null;
  link?: string;
  added_date?: string;
}

export interface ChannelScrapeResult {
  success?: boolean;
  count?: number;
  file?: string;
  error?: string;
}

export interface SchedulerStatus {
  running?: boolean;
  active?: boolean;
  configured?: boolean;
  run_at?: string | null;
  interval_hours?: number | null;
  queue?: Array<{ telegram_id?: number; title?: string; type?: string }>;
  active_entity?: { telegram_id?: number; title?: string; type?: string } | null;
  last_results?: Array<Record<string, unknown>>;
  run_count?: number;
  last_run_started_at?: string | null;
  last_run_finished_at?: string | null;
  next_run_at?: string | null;
}

export interface ScraperProgress {
  success?: boolean;
  running: boolean;
  active: boolean;
  active_entity?: { telegram_id?: number; title?: string; type?: string } | null;
  queue: Array<{ telegram_id?: number; title?: string; type?: string }>;
  queue_length: number;
  last_results: Array<{
    telegram_id?: number;
    title?: string;
    success?: boolean;
    messages_saved?: number;
    new_messages?: number;
    error?: string;
    scraped_at?: string;
  }>;
  run_count: number;
  last_run_started_at?: string | null;
  last_run_finished_at?: string | null;
  next_run_at?: string | null;
  interval_hours?: number | null;
}

export interface GroupMonitoringResponse {
  success?: boolean;
  group?: MonitoringGroup | null;
}

export interface GroupMonitoringListResponse {
  success?: boolean;
  groups: MonitoringGroup[];
}

export interface GroupMemoryResponse {
  success?: boolean;
  memory?: {
    path: string;
    modified_at?: string;
    content: string;
  };
}

export interface GroupReportsResponse {
  success?: boolean;
  reports: ReportFileRecord[];
}

export interface EntityScrapeStats {
  telegram_id: number;
  messages_stored: number;
  last_scraped_at?: string | null;
  last_message_id?: number | null;
  new_messages: number;
}

export interface CredentialsPayload {
  api_id: string;
  api_hash: string;
  phone: string;
}

export interface TelegramSelectionPayload {
  enabled_ids: number[];
  disabled_ids: number[];
}

export interface HealthResponse {
  status?: string;
  service?: string;
}

export interface MessagesQuery {
  page?: number;
  page_size?: number;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  chat_id?: number | string;
  level?: string;
}

export interface MessageRecord {
  message_id: number;
  chat_id: number;
  chat_name?: string | null;
  sender?: number | null;
  sender_id?: number | null;
  sender_username?: string | null;
  sender_name?: string | null;
  text?: string | null;
  message_text?: string | null;
  date?: string | null;
  message_date?: string | null;
  media_type?: string | null;
  created_at?: string | null;
}

export interface MessagesResponse {
  success?: boolean;
  items: MessageRecord[];
  page: number;
  page_size: number;
  total: number;
}

export interface MonitoringResponse {
  success?: boolean;
  running?: boolean;
  status?: string;
  last_message?: string | null;
  messages_today?: number;
  last_sync?: string | null;
}

export interface LogsResponse {
  success?: boolean;
  items: Array<{
    id: string;
    level: string;
    message: string;
    timestamp: string;
    details?: Record<string, unknown>;
  }>;
  total: number;
}

export interface SettingsRecord {
  dashboard_refresh_seconds: number;
  queue_refresh_seconds: number;
  messages_page_size: number;
  logs_page_size: number;
  theme: 'dark' | 'light';
  scheduler_run_at: string;
  scheduler_interval_hours: number;
  default_message_sort_by: string;
  default_message_sort_order: 'asc' | 'desc';
}

export interface SettingsResponse {
  success?: boolean;
  settings: SettingsRecord;
}

export interface ReportFileRecord {
  path: string;
  modified_at?: string;
  size?: number;
  kind?: 'markdown' | 'pdf' | string;
  group?: string | null;
  scope?: string | null;
}

export interface ReportsResponse {
  success?: boolean;
  reports: ReportFileRecord[];
  state?: {
    channels?: Record<string, unknown>;
    combined?: Record<string, unknown>;
  };
}

export interface ReportContentResponse {
  success?: boolean;
  report: {
    path: string;
    modified_at?: string;
    size?: number;
    content: string;
  };
}
