export type TabId = 'dashboard' | 'candidates' | 'whitelist' | 'logs' | 'settings';
export type Lang = 'de' | 'en';
export type Theme = 'light' | 'dark';

export interface AppMeta {
  productName: string;
  version: string;
  displayVersion: string;
  channelSymbol: string;
}

export interface DashboardStats {
  plexConfigured: boolean;
  dryRun: boolean;
  inactivityDays: number;
  scanIntervalDays: number;
  lastScanAt: string | null;
  nextScanAt: string | null;
  pendingCount: number;
  pendingBytes: number;
  deletedCount: number;
  freedBytes: number;
  whitelistCount: number;
}

export interface MediaCandidate {
  id: number;
  plexRatingKey: string;
  librarySectionId: string;
  libraryTitle: string;
  mediaType: 'movie' | 'show';
  title: string;
  year: number | null;
  filePath: string;
  mappedLocalPath: string;
  fileSizeBytes: number;
  addedAt: string;
  lastViewedAt: string | null;
  viewCount: number;
  daysSinceTouched: number;
  status: string;
  thumbPath: string;
  detectedAt: string;
}

export interface WhitelistEntry {
  id: number;
  plexRatingKey: string;
  title: string;
  mediaType: string;
  reason: string;
  createdAt: string;
}

export interface DeletionLog {
  id: number;
  plexRatingKey: string;
  title: string;
  mediaType: string;
  filePath: string;
  fileSizeBytes: number;
  wasDryRun: boolean;
  succeeded: boolean;
  errorMessage: string | null;
  executedAt: string;
}

export interface PathMappingRule {
  plexPrefix: string;
  localPrefix: string;
}

export interface PlexLibrarySection {
  key: string;
  title: string;
  type: string;
}

export interface AppSettingsDto {
  plexUrl: string;
  hasPlexToken: boolean;
  inactivityDays: number;
  scanIntervalDays: number;
  dryRun: boolean;
  deleteEmptyFolders: boolean;
  discordWebhookUrl: string;
  appPublicUrl: string;
  pathMappings: PathMappingRule[];
  excludedLibraries: string[];
  lastScanAt: string | null;
  nextScanAt: string | null;
}
