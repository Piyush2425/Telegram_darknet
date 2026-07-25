export interface Channel {
  id: string;
  username: string;
  title: string;
  description?: string;
  member_count: number;
  is_monitored: boolean;
  last_scraped_at?: string;
  category: string;
}

export interface Message {
  id: string;
  channel_id: string;
  channel_username: string;
  sender: string;
  text: string;
  date: string;
  views: number;
  media_url?: string;
  threat_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  analyzed: boolean;
}

export interface ThreatIntelligence {
  id: string;
  message_id: string;
  channel_username: string;
  timestamp: string;
  urls: string[];
  suspicious_activities: string[];
  threat_actors: string[];
  malware_references: string[];
  cves: string[];
  iocs: string[];
  crypto_wallets: string[];
  emails: string[];
  domains_ips: string[];
  leaked_credentials: string[];
  summary: string;
  risk_score: number;
  threat_level: string;
}

export interface Report {
  id: string;
  title: string;
  created_at: string;
  period: string;
  channels_analyzed: string[];
  total_messages: number;
  total_threats: number;
  markdown_path: string;
  pdf_path?: string;
  summary: string;
}

export interface ScraperStatus {
  is_scraping: boolean;
  progress: number;
  current_channel: string;
  logs: string[];
}

export interface IntelligenceSummary {
  total_analyzed: number;
  total_cves: number;
  cves_list: string[];
  total_iocs: number;
  iocs_list: string[];
  total_wallets: number;
  crypto_wallets_list: string[];
  total_credentials: number;
  leaked_credentials_list: string[];
  malware_families: string[];
  threat_actors: string[];
  urls_list: string[];
}
