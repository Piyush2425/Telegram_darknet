import {
  type LucideIcon,
  LayoutDashboard,
  LogIn,
  Mail,
  FileText,
  Shield,
  Compass,
  ScrollText,
  Settings2,
  CalendarClock,
  Download,
  BarChart3,
  FolderDown,
} from 'lucide-react';

export interface NavigationItem {
  label: string;
  path: string;
  icon: LucideIcon;
  section?: string;
}

export const navigationItems: NavigationItem[] = [
  // — Intelligence —
  { label: 'Dashboard', path: '/', icon: LayoutDashboard, section: 'Intelligence' },
  { label: 'Telegram Explorer', path: '/explorer', icon: Compass, section: 'Intelligence' },
  { label: 'Monitoring', path: '/monitoring', icon: Shield, section: 'Intelligence' },
  { label: 'Messages', path: '/messages', icon: Mail, section: 'Intelligence' },
  { label: 'Analytics', path: '/analytics', icon: BarChart3, section: 'Intelligence' },

  // — Operations —
  { label: 'Scraper', path: '/scraper', icon: Download, section: 'Operations' },
  { label: 'Scheduler', path: '/scheduler', icon: CalendarClock, section: 'Operations' },
  { label: 'Reports', path: '/reports', icon: FileText, section: 'Operations' },
  { label: 'Exports', path: '/exports', icon: FolderDown, section: 'Operations' },

  // — System —
  { label: 'Logs', path: '/logs', icon: ScrollText, section: 'System' },
  { label: 'Settings', path: '/settings', icon: Settings2, section: 'System' },
  { label: 'Credentials', path: '/credentials', icon: LogIn, section: 'System' },
];
