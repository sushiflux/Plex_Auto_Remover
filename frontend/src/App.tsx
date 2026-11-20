import { useEffect, useState, useCallback, useRef } from 'react';
import {
  LayoutDashboard,
  Trash2,
  ShieldCheck,
  History,
  Settings as SettingsIcon,
  Info,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  RefreshCw,
  Film,
  Tv,
  Plus,
  X,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  List,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { strings, detectInitialLanguage } from './i18n';
import { useConfirm } from './components/ConfirmDialog';
import { ErrorBanner } from './components/ErrorBanner';
import type {
  AppMeta,
  AppSettingsDto,
  DashboardStats,
  DeletionLog,
  Lang,
  MediaCandidate,
  PlexLibrarySection,
  TabId,
  Theme,
  WhitelistEntry,
} from './types';

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / Math.pow(1024, idx);
  return `${val.toFixed(idx >= 2 ? 2 : 0)} ${units[idx]}`;
}

function formatDate(iso: string | null, lang: Lang, fallback: string): string {
  if (!iso) return fallback;
  return new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function getInitialTheme(): Theme {
  const urlTheme = new URLSearchParams(window.location.search).get('theme');
  if (urlTheme === 'light' || urlTheme === 'dark') return urlTheme;
  const saved = localStorage.getItem('par-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readTabFromUrl(): TabId {
  const p = new URLSearchParams(window.location.search).get('tab');
  if (p === 'candidates' || p === 'whitelist' || p === 'logs' || p === 'settings') return p;
  return 'dashboard';
}

function readAboutFromUrl(): boolean {
  return new URLSearchParams(window.location.search).get('about') === '1';
}

function readLibFilterFromUrl(): string {
  return new URLSearchParams(window.location.search).get('lib') ?? 'all';
}

function readCandidateViewFromUrl(): 'list' | 'grid' {
  const v = new URLSearchParams(window.location.search).get('view');
  if (v === 'list' || v === 'grid') return v;
  const saved = localStorage.getItem('par-candidate-view');
  return saved === 'grid' ? 'grid' : 'list';
}

type SortKey = 'size' | 'title' | 'days';
type SortDir = 'asc' | 'desc';

function readSortKeyFromUrl(): SortKey {
  const s = new URLSearchParams(window.location.search).get('sort');
  if (s === 'title' || s === 'days' || s === 'size') return s;
  const saved = localStorage.getItem('par-sort-key');
  return saved === 'title' || saved === 'days' ? saved : 'size';
}

function readSortDirFromUrl(): SortDir {
  const d = new URLSearchParams(window.location.search).get('dir');
  if (d === 'asc' || d === 'desc') return d;
  const saved = localStorage.getItem('par-sort-dir');
  return saved === 'asc' ? 'asc' : 'desc';
}

export function App() {
  const [tab, setTab] = useState<TabId>(readTabFromUrl);
  const [aboutOpen, setAboutOpen] = useState<boolean>(readAboutFromUrl);
  const [libFilter, setLibFilter] = useState<string>(readLibFilterFromUrl);
  const [candidateView, setCandidateView] = useState<'list' | 'grid'>(readCandidateViewFromUrl);
  const [sortKey, setSortKey] = useState<SortKey>(readSortKeyFromUrl);
  const [sortDir, setSortDir] = useState<SortDir>(readSortDirFromUrl);
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem('par-sidebar') === '1');
  const [lang, setLang] = useState<Lang>(detectInitialLanguage);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  const [meta, setMeta] = useState<AppMeta | null>(null);
  const metaRef = useRef<AppMeta | null>(null);
  metaRef.current = meta;
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [candidates, setCandidates] = useState<MediaCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [logs, setLogs] = useState<DeletionLog[]>([]);
  const [settings, setSettings] = useState<AppSettingsDto | null>(null);
  const [plexTokenInput, setPlexTokenInput] = useState('');
  const [libraries, setLibraries] = useState<PlexLibrarySection[]>([]);

  const [scanning, setScanning] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<{ headline: string; details: string } | null>(null);

  const { confirm, dialog } = useConfirm();
  const t = strings[lang];

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('par-theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('par-lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    const onPop = () => {
      setTab(readTabFromUrl());
      setAboutOpen(readAboutFromUrl());
      setLibFilter(readLibFilterFromUrl());
      setCandidateView(readCandidateViewFromUrl());
      setSortKey(readSortKeyFromUrl());
      setSortDir(readSortDirFromUrl());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigateTab = (next: TabId, nextLib?: string) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    if (next === 'candidates') {
      const targetLib = nextLib ?? libFilter;
      setLibFilter(targetLib);
      if (targetLib === 'all') url.searchParams.delete('lib');
      else url.searchParams.set('lib', targetLib);
    } else {
      url.searchParams.delete('lib');
    }
    window.history.pushState({}, '', url);
  };

  const changeCandidateView = (next: 'list' | 'grid') => {
    setCandidateView(next);
    localStorage.setItem('par-candidate-view', next);
    const url = new URL(window.location.href);
    url.searchParams.set('view', next);
    window.history.pushState({}, '', url);
  };

  const changeSort = (key: SortKey) => {
    const nextDir: SortDir = sortKey === key ? (sortDir === 'desc' ? 'asc' : 'desc') : key === 'title' ? 'asc' : 'desc';
    setSortKey(key);
    setSortDir(nextDir);
    localStorage.setItem('par-sort-key', key);
    localStorage.setItem('par-sort-dir', nextDir);
    const url = new URL(window.location.href);
    url.searchParams.set('sort', key);
    url.searchParams.set('dir', nextDir);
    window.history.pushState({}, '', url);
  };

  const toggleAbout = (open: boolean) => {
    setAboutOpen(open);
    const url = new URL(window.location.href);
    if (open) url.searchParams.set('about', '1');
    else url.searchParams.delete('about');
    window.history.pushState({}, '', url);
  };

  const reportError = useCallback(
    (headline: string, err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorState({
        headline,
        details: `${msg}\nVersion: ${metaRef.current?.displayVersion ?? 'unknown'}\nTime: ${new Date().toISOString()}`,
      });
    },
    [],
  );

  const apiFetch = useCallback(
    async <T,>(url: string, init?: RequestInit): Promise<T> => {
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
        ...init,
      });
      if (!res.ok) {
        let detail = `${res.status} ${res.statusText}`;
        try {
          const body = await res.json();
          if (body?.error) detail = body.error;
          else if (body?.detail) detail = body.detail;
        } catch {
          // ignore non-JSON error body
        }
        throw new Error(detail);
      }
      return res.json() as Promise<T>;
    },
    [],
  );

  const loadAll = useCallback(async () => {
    try {
      const [m, d, c, w, l, s] = await Promise.all([
        apiFetch<AppMeta>('/api/meta'),
        apiFetch<DashboardStats>('/api/dashboard'),
        apiFetch<MediaCandidate[]>('/api/candidates'),
        apiFetch<WhitelistEntry[]>('/api/whitelist'),
        apiFetch<DeletionLog[]>('/api/logs'),
        apiFetch<AppSettingsDto>('/api/settings'),
      ]);
      setMeta(m);
      setStats(d);
      setCandidates(c);
      setWhitelist(w);
      setLogs(l);
      setSettings(s);
      if (d.plexConfigured) {
        apiFetch<PlexLibrarySection[]>('/api/settings/libraries')
          .then(setLibraries)
          .catch(() => setLibraries([]));
      }
    } catch (err) {
      reportError('Failed to load application data from backend', err);
    }
  }, [apiFetch, reportError]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleScan = async () => {
    setScanning(true);
    setNotice(null);
    setErrorState(null);
    try {
      const summary = await apiFetch<{ candidateCount: number; totalBytes: number }>('/api/scan', {
        method: 'POST',
        body: JSON.stringify({ sendNotification: false }),
      });
      await loadAll();
      setNotice(
        t.dashboard.scanDone
          .replace('{count}', String(summary.candidateCount))
          .replace('{size}', formatBytes(summary.totalBytes)),
      );
      if (summary.candidateCount > 0 && tab === 'dashboard') {
        navigateTab('candidates');
      }
    } catch (err) {
      reportError(lang === 'de' ? 'Plex-Scan fehlgeschlagen' : 'Plex scan failed', err);
    } finally {
      setScanning(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0 || !stats) return;
    const chosen = candidates.filter((c) => selectedIds.has(c.id));
    const totalSize = chosen.reduce((acc, c) => acc + c.fileSizeBytes, 0);
    const isDry = stats.dryRun;

    const ok = await confirm({
      title: t.candidates.confirmDeleteTitle,
      message: (isDry ? t.candidates.confirmDeleteDryRun : t.candidates.confirmDeleteLive)
        .replace('{count}', String(chosen.length))
        .replace('{size}', formatBytes(totalSize)),
      confirmLabel: isDry ? t.candidates.confirmDryRunAction : t.candidates.confirmDeleteAction,
      cancelLabel: t.candidates.cancel,
      destructive: !isDry,
    });

    if (!ok) return;

    try {
      const res = await apiFetch<{ succeededCount: number; freedBytes: number; wasDryRun: boolean; errors: string[] }>(
        '/api/candidates/delete',
        {
          method: 'POST',
          body: JSON.stringify({ candidateIds: Array.from(selectedIds) }),
        },
      );
      setSelectedIds(new Set());
      await loadAll();
      if (res.errors.length > 0) {
        reportError(
          lang === 'de' ? 'Einige Dateien konnten nicht gelöscht werden' : 'Some files could not be deleted',
          res.errors.join('\n'),
        );
      } else {
        setNotice(
          (res.wasDryRun ? t.candidates.deleteDoneDry : t.candidates.deleteDoneLive)
            .replace('{count}', String(res.succeededCount))
            .replace('{size}', formatBytes(res.freedBytes)),
        );
      }
    } catch (err) {
      reportError(lang === 'de' ? 'Löschvorgang fehlgeschlagen' : 'Deletion failed', err);
    }
  };

  const handleKeepCandidate = async (candidate: MediaCandidate) => {
    try {
      await apiFetch(`/api/candidates/${candidate.id}/keep`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Web UI' }),
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(candidate.id);
        return next;
      });
      await loadAll();
    } catch (err) {
      reportError(lang === 'de' ? 'Konnte nicht geschützt werden' : 'Failed to protect item', err);
    }
  };

  const handleRemoveWhitelist = async (entry: WhitelistEntry) => {
    const ok = await confirm({
      title: t.whitelist.confirmRemoveTitle,
      message: t.whitelist.confirmRemoveMsg.replace('{title}', entry.title),
      confirmLabel: t.whitelist.remove,
      cancelLabel: t.candidates.cancel,
      destructive: true,
    });
    if (!ok) return;

    try {
      await apiFetch(`/api/whitelist/${entry.id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) {
      reportError(lang === 'de' ? 'Schutz konnte nicht entfernt werden' : 'Failed to remove protection', err);
    }
  };

  // Live validation for settings
  const settingsErrors = (() => {
    if (!settings) return {};
    const errs: Record<string, string> = {};
    if (settings.plexUrl && !/^https?:\/\/.+/.test(settings.plexUrl.trim())) {
      errs.plexUrl = t.common.validationUrl;
    }
    if (settings.inactivityDays < 1 || settings.inactivityDays > 3650 || Number.isNaN(settings.inactivityDays)) {
      errs.inactivityDays = t.common.validationRange.replace('{min}', '1').replace('{max}', '3650');
    }
    if (settings.scanIntervalDays < 1 || settings.scanIntervalDays > 365 || Number.isNaN(settings.scanIntervalDays)) {
      errs.scanIntervalDays = t.common.validationRange.replace('{min}', '1').replace('{max}', '365');
    }
    if (
      settings.discordWebhookUrl &&
      !/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/.+/.test(settings.discordWebhookUrl.trim())
    ) {
      errs.discordWebhookUrl = t.common.validationWebhook;
    }
    return errs;
  })();

  const handleSaveSettings = async () => {
    if (!settings || Object.keys(settingsErrors).length > 0) return;
    setSavingSettings(true);
    setNotice(null);
    setErrorState(null);
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          plexUrl: settings.plexUrl,
          plexToken: plexTokenInput || undefined,
          inactivityDays: settings.inactivityDays,
          scanIntervalDays: settings.scanIntervalDays,
          dryRun: settings.dryRun,
          deleteEmptyFolders: settings.deleteEmptyFolders,
          discordWebhookUrl: settings.discordWebhookUrl,
          appPublicUrl: settings.appPublicUrl,
          pathMappings: settings.pathMappings,
          excludedLibraries: settings.excludedLibraries,
        }),
      });
      setPlexTokenInput('');
      await loadAll();
      setNotice(t.settings.saved);
    } catch (err) {
      reportError(lang === 'de' ? 'Einstellungen konnten nicht gespeichert werden' : 'Failed to save settings', err);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTestPlex = async () => {
    if (!settings) return;
    setNotice(null);
    setErrorState(null);
    try {
      const res = await apiFetch<{ serverName: string; version: string }>('/api/settings/test-plex', {
        method: 'POST',
        body: JSON.stringify({ plexUrl: settings.plexUrl, plexToken: plexTokenInput || undefined }),
      });
      setNotice(
        t.settings.plexConnected
          .replace('{name}', res.serverName ?? 'Plex')
          .replace('{version}', res.version ?? '-'),
      );
    } catch (err) {
      reportError(lang === 'de' ? 'Plex-Verbindungstest fehlgeschlagen' : 'Plex connection test failed', err);
    }
  };

  const handleTestWebhook = async () => {
    if (!settings) return;
    setNotice(null);
    setErrorState(null);
    try {
      await apiFetch('/api/settings/test-webhook', {
        method: 'POST',
        body: JSON.stringify({ discordWebhookUrl: settings.discordWebhookUrl }),
      });
      setNotice(t.settings.webhookSent);
    } catch (err) {
      reportError(lang === 'de' ? 'Discord-Test fehlgeschlagen' : 'Discord webhook test failed', err);
    }
  };

  const candidateLibraries = (() => {
    const counts = new Map<string, number>();
    for (const c of candidates) {
      if (c.libraryTitle) counts.set(c.libraryTitle, (counts.get(c.libraryTitle) ?? 0) + 1);
    }
    for (const lib of libraries) {
      if (!counts.has(lib.title)) counts.set(lib.title, 0);
    }
    return Array.from(counts.entries()).map(([title, count]) => ({ title, count }));
  })();

  const visibleCandidates = candidates
    .filter((c) => libFilter === 'all' || c.libraryTitle === libFilter)
    .slice()
    .sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'title') return a.title.localeCompare(b.title) * mul;
      if (sortKey === 'days') return (a.daysSinceTouched - b.daysSinceTouched) * mul;
      return (a.fileSizeBytes - b.fileSizeBytes) * mul;
    });

  const visibleBytes = visibleCandidates.reduce((acc, c) => acc + c.fileSizeBytes, 0);
  const selectedBytes = candidates.reduce((acc, c) => (selectedIds.has(c.id) ? acc + c.fileSizeBytes : acc), 0);

  const navItems: { id: TabId; label: string; icon: typeof LayoutDashboard; badge?: number }[] = [
    { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { id: 'candidates', label: t.nav.candidates, icon: Trash2, badge: stats?.pendingCount },
    { id: 'whitelist', label: t.nav.whitelist, icon: ShieldCheck, badge: stats?.whitelistCount },
    { id: 'logs', label: t.nav.logs, icon: History },
    { id: 'settings', label: t.nav.settings, icon: SettingsIcon },
  ];

  return (
    <div className="h-screen overflow-hidden flex bg-[var(--c-bg)] text-[var(--c-text)]">
      {/* Sidebar */}
      <aside
        className={`h-full shrink-0 border-r border-[var(--c-border)] bg-[var(--c-surface)] flex flex-col justify-between transition-[width] duration-150 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="h-14 px-3 flex items-center justify-between border-b border-[var(--c-border)]">
            {!collapsed && (
              <span className="font-semibold text-sm tracking-tight truncate">Plex Auto Remover</span>
            )}
            <button
              type="button"
              onClick={() => {
                const next = !collapsed;
                setCollapsed(next);
                localStorage.setItem('par-sidebar', next ? '1' : '0');
              }}
              className="p-2 rounded-[6px] text-[var(--c-text-muted)] hover:text-[var(--c-text)] cursor-pointer"
              title={collapsed ? t.nav.expand : t.nav.collapse}
              aria-label={collapsed ? t.nav.expand : t.nav.collapse}
            >
              {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto py-2 space-y-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              const hasTree = item.id === 'candidates';
              const treeOpen = hasTree && active && !collapsed;
              return (
                <div key={item.id}>
                  <button
                    type="button"
                    onClick={() => navigateTab(item.id)}
                    title={collapsed ? item.label : undefined}
                    className={`relative w-full h-12 px-4 flex items-center gap-3 text-sm cursor-pointer transition-colors ${
                      active
                        ? 'font-semibold text-[var(--c-accent)]'
                        : 'font-medium text-[var(--c-text-muted)] hover:text-[var(--c-text)]'
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-[var(--c-accent)]" />
                    )}
                    <Icon className="w-4 h-4 shrink-0" />
                    {!collapsed && (
                      <span className="flex-1 text-left truncate">{item.label}</span>
                    )}
                    {!collapsed && typeof item.badge === 'number' && item.badge > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--c-surface-alt)] text-[var(--c-text-muted)]">
                        {item.badge}
                      </span>
                    )}
                    {!collapsed && hasTree && (
                      treeOpen ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                    )}
                  </button>

                  {treeOpen && (
                    <div className="ml-6 pl-3 border-l border-[var(--c-border)] space-y-0.5 py-1">
                      <button
                        type="button"
                        onClick={() => navigateTab('candidates', 'all')}
                        className={`relative w-full h-9 px-2.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                          libFilter === 'all'
                            ? 'font-semibold text-[var(--c-accent)]'
                            : 'font-medium text-[var(--c-text-muted)] hover:text-[var(--c-text)]'
                        }`}
                      >
                        {libFilter === 'all' && (
                          <span className="absolute -left-[13px] top-1.5 bottom-1.5 w-[2px] bg-[var(--c-accent)]" />
                        )}
                        <span className="truncate">{t.candidates.allLibraries}</span>
                        <span className="text-[11px] opacity-75">{candidates.length}</span>
                      </button>

                      {candidateLibraries.map((lib) => {
                        const libActive = libFilter === lib.title;
                        return (
                          <button
                            key={lib.title}
                            type="button"
                            onClick={() => navigateTab('candidates', lib.title)}
                            className={`relative w-full h-9 px-2.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                              libActive
                                ? 'font-semibold text-[var(--c-accent)]'
                                : 'font-medium text-[var(--c-text-muted)] hover:text-[var(--c-text)]'
                            }`}
                          >
                            {libActive && (
                              <span className="absolute -left-[13px] top-1.5 bottom-1.5 w-[2px] bg-[var(--c-accent)]" />
                            )}
                            <span className="truncate">{lib.title}</span>
                            {lib.count > 0 && (
                              <span className="text-[11px] opacity-75">{lib.count}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-[var(--c-border)] p-2 flex flex-col gap-1">
          <div className={`flex ${collapsed ? 'flex-col items-center gap-1' : 'items-center justify-between px-2'}`}>
            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              className="p-2 text-[var(--c-text-muted)] hover:text-[var(--c-text)] cursor-pointer"
              title={theme === 'dark' ? t.common.themeLight : t.common.themeDark}
              aria-label={theme === 'dark' ? t.common.themeLight : t.common.themeDark}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setLang((prev) => (prev === 'de' ? 'en' : 'de'))}
              className="px-2 py-1 text-xs font-medium text-[var(--c-text-muted)] hover:text-[var(--c-text)] cursor-pointer"
              title={t.common.language}
            >
              {lang.toUpperCase()}
            </button>

            <button
              type="button"
              onClick={() => toggleAbout(true)}
              className="p-2 text-[var(--c-text-muted)] hover:text-[var(--c-text)] cursor-pointer"
              title={t.nav.about}
              aria-label={t.nav.about}
            >
              <Info className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content - full width */}
      <main className="flex-1 min-w-0 h-full p-6 md:p-8 space-y-6 overflow-y-auto">
        {errorState && (
          <ErrorBanner
            headline={errorState.headline}
            details={errorState.details}
            copyLabel={t.common.copy}
            copiedLabel={t.common.copied}
            detailsLabel={t.common.details}
            onDismiss={() => setErrorState(null)}
          />
        )}

        {notice && (
          <div className="rounded-[10px] border border-[var(--c-success)] bg-[var(--c-success-soft)] px-4 py-3 text-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[var(--c-success)] shrink-0" />
              <span>{notice}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-[var(--c-text-muted)] hover:text-[var(--c-text)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* DASHBOARD */}
        {tab === 'dashboard' && stats && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">{t.dashboard.title}</h1>
                <p className="text-sm text-[var(--c-text-muted)] mt-1">{t.dashboard.subtitle}</p>
              </div>
              <button
                type="button"
                disabled={scanning || !stats.plexConfigured}
                onClick={handleScan}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[6px] bg-[var(--c-accent)] text-white text-sm font-medium disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
                {scanning ? t.dashboard.scanning : t.dashboard.scanNow}
              </button>
            </div>

            {!stats.plexConfigured && (
              <div className="rounded-[10px] border border-[var(--c-accent)] bg-[var(--c-accent-soft)] p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-sm">
                  <AlertTriangle className="w-4 h-4 text-[var(--c-accent)] shrink-0" />
                  <span>{t.dashboard.setupHint}</span>
                </div>
                <button
                  type="button"
                  onClick={() => navigateTab('settings')}
                  className="px-3 py-1.5 rounded-[6px] bg-[var(--c-accent)] text-white text-xs font-medium cursor-pointer"
                >
                  {t.dashboard.goToSettings}
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <button
                type="button"
                onClick={() => navigateTab('candidates')}
                className="text-left rounded-[10px] border border-[var(--c-border)] bg-[var(--c-surface)] p-5 hover:border-[var(--c-accent)] transition-colors cursor-pointer"
              >
                <div className="text-xs font-medium text-[var(--c-text-muted)]">{t.dashboard.potentialSavings}</div>
                <div className="text-2xl font-semibold mt-2">{formatBytes(stats.pendingBytes)}</div>
                <div className="text-xs text-[var(--c-text-muted)] mt-1">
                  {stats.pendingCount} {t.dashboard.pendingItems}
                </div>
              </button>

              <button
                type="button"
                onClick={() => navigateTab('logs')}
                className="text-left rounded-[10px] border border-[var(--c-border)] bg-[var(--c-surface)] p-5 hover:border-[var(--c-accent)] transition-colors cursor-pointer"
              >
                <div className="text-xs font-medium text-[var(--c-text-muted)]">{t.dashboard.freedTotal}</div>
                <div className="text-2xl font-semibold mt-2">{formatBytes(stats.freedBytes)}</div>
                <div className="text-xs text-[var(--c-text-muted)] mt-1">
                  {stats.deletedCount} {t.dashboard.deletedItems}
                </div>
              </button>

              <button
                type="button"
                onClick={() => navigateTab('whitelist')}
                className="text-left rounded-[10px] border border-[var(--c-border)] bg-[var(--c-surface)] p-5 hover:border-[var(--c-accent)] transition-colors cursor-pointer"
              >
                <div className="text-xs font-medium text-[var(--c-text-muted)]">{t.dashboard.protectedItems}</div>
                <div className="text-2xl font-semibold mt-2">{stats.whitelistCount}</div>
                <div className="text-xs text-[var(--c-text-muted)] mt-1">Whitelist</div>
              </button>

              <button
                type="button"
                onClick={() => navigateTab('settings')}
                className="text-left rounded-[10px] border border-[var(--c-border)] bg-[var(--c-surface)] p-5 hover:border-[var(--c-accent)] transition-colors cursor-pointer"
              >
                <div className="text-xs font-medium text-[var(--c-text-muted)]">{t.dashboard.nextScan}</div>
                <div className="text-base font-semibold mt-2">
                  {formatDate(stats.nextScanAt, lang, t.dashboard.never)}
                </div>
                <div className="text-xs text-[var(--c-text-muted)] mt-1">
                  {t.dashboard.lastScan}: {formatDate(stats.lastScanAt, lang, t.dashboard.never)}
                </div>
              </button>
            </div>

            <div className="rounded-[10px] border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-3 text-sm flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: stats.dryRun ? 'var(--c-toggle-on)' : 'var(--c-danger)' }}
              />
              <span>{stats.dryRun ? t.dashboard.dryRunActive : t.dashboard.liveModeActive}</span>
            </div>
          </div>
        )}

        {/* CANDIDATES */}
        {tab === 'candidates' && (
          <div className="space-y-5">
            <div className="sticky -top-6 md:-top-8 z-20 -mx-6 md:-mx-8 px-6 md:px-8 pt-6 md:pt-8 pb-4 -mt-6 md:-mt-8 bg-[var(--c-bg)] border-b border-[var(--c-border)] flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">
                  {t.candidates.title}
                  {libFilter !== 'all' && (
                    <span className="text-base font-normal text-[var(--c-text-muted)]"> · {libFilter}</span>
                  )}
                </h1>
                <p className="text-sm text-[var(--c-text-muted)] mt-1">
                  {selectedIds.size > 0 ? (
                    <span className="font-medium text-[var(--c-accent)]">
                      {t.candidates.selectedSummary
                        .replace('{count}', String(selectedIds.size))
                        .replace('{size}', formatBytes(selectedBytes))}
                    </span>
                  ) : (
                    <span>
                      {t.candidates.visibleSummary
                        .replace('{count}', String(visibleCandidates.length))
                        .replace('{size}', formatBytes(visibleBytes))}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Sort segmented bar */}
                <div className="inline-flex rounded-[6px] border border-[var(--c-border)] bg-[var(--c-surface)] overflow-hidden">
                  {(
                    [
                      { key: 'size', label: t.candidates.sortSize },
                      { key: 'title', label: t.candidates.sortTitle },
                      { key: 'days', label: t.candidates.sortDays },
                    ] as const
                  ).map((opt) => {
                    const active = sortKey === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => changeSort(opt.key)}
                        className={`relative px-3 py-2 text-xs font-medium inline-flex items-center gap-1 cursor-pointer border-r last:border-r-0 border-[var(--c-border)] ${
                          active ? 'text-[var(--c-accent)] bg-[var(--c-surface-alt)]' : 'text-[var(--c-text-muted)] hover:text-[var(--c-text)]'
                        }`}
                      >
                        {opt.label}
                        {active && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                      </button>
                    );
                  })}
                </div>

                {/* View mode segmented bar */}
                <div className="inline-flex rounded-[6px] border border-[var(--c-border)] bg-[var(--c-surface)] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => changeCandidateView('list')}
                    title={t.candidates.viewList}
                    aria-label={t.candidates.viewList}
                    className={`p-2 cursor-pointer border-r border-[var(--c-border)] ${
                      candidateView === 'list' ? 'text-[var(--c-accent)] bg-[var(--c-surface-alt)]' : 'text-[var(--c-text-muted)] hover:text-[var(--c-text)]'
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => changeCandidateView('grid')}
                    title={t.candidates.viewGrid}
                    aria-label={t.candidates.viewGrid}
                    className={`p-2 cursor-pointer ${
                      candidateView === 'grid' ? 'text-[var(--c-accent)] bg-[var(--c-surface-alt)]' : 'text-[var(--c-text-muted)] hover:text-[var(--c-text)]'
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                </div>

                {visibleCandidates.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const allVisibleSelected = visibleCandidates.every((c) => selectedIds.has(c.id));
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (allVisibleSelected) {
                            visibleCandidates.forEach((c) => next.delete(c.id));
                          } else {
                            visibleCandidates.forEach((c) => next.add(c.id));
                          }
                          return next;
                        });
                      }}
                      className="px-3 py-2 rounded-[6px] border border-[var(--c-border)] bg-[var(--c-surface)] text-sm font-medium cursor-pointer"
                    >
                      {visibleCandidates.every((c) => selectedIds.has(c.id))
                        ? t.candidates.deselectAll
                        : t.candidates.selectAll}
                    </button>
                    <button
                      type="button"
                      disabled={selectedIds.size === 0}
                      onClick={handleDeleteSelected}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-[6px] bg-[var(--c-danger)] text-white text-sm font-medium disabled:opacity-40 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      {t.candidates.deleteSelected} ({selectedIds.size})
                    </button>
                  </>
                )}
              </div>
            </div>

            {visibleCandidates.length === 0 ? (
              <div className="rounded-[10px] border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center text-sm text-[var(--c-text-muted)]">
                {t.candidates.empty}
              </div>
            ) : candidateView === 'list' ? (
              <div className="rounded-[10px] border border-[var(--c-border)] bg-[var(--c-surface)] divide-y divide-[var(--c-border)]">
                {visibleCandidates.map((item) => {
                  const checked = selectedIds.has(item.id);
                  return (
                    <div key={item.id} className="p-4 flex flex-wrap items-center gap-4">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            return next;
                          })
                        }
                        className="w-4 h-4 accent-[var(--c-accent)] cursor-pointer shrink-0"
                      />

                      {item.thumbPath ? (
                        <img
                          src={`/api/plex/thumb?path=${encodeURIComponent(item.thumbPath)}`}
                          alt={item.title}
                          className="w-11 h-16 object-cover rounded-[4px] bg-[var(--c-surface-alt)] shrink-0"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-11 h-16 rounded-[4px] bg-[var(--c-surface-alt)] flex items-center justify-center shrink-0">
                          {item.mediaType === 'show' ? <Tv className="w-5 h-5" /> : <Film className="w-5 h-5" />}
                        </div>
                      )}

                      <div className="flex-1 min-w-[220px] space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm">
                            {item.title} {item.year ? `(${item.year})` : ''}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-[var(--c-surface-alt)] text-[var(--c-text-muted)]">
                            {item.mediaType === 'show' ? t.candidates.show : t.candidates.movie} · {item.libraryTitle}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--c-text-muted)]">
                          {item.lastViewedAt
                            ? `${t.candidates.lastWatched}: ${formatDate(item.lastViewedAt, lang, '-')}`
                            : t.candidates.neverWatched}{' '}
                          · {t.candidates.daysUntouched.replace('{days}', String(item.daysSinceTouched))}
                        </div>
                        <div className="text-xs font-mono text-[var(--c-text-muted)] break-all">
                          {item.mappedLocalPath}
                        </div>
                      </div>

                      <div className="text-right shrink-0 space-y-1">
                        <div className="font-semibold text-sm">{formatBytes(item.fileSizeBytes)}</div>
                        <button
                          type="button"
                          onClick={() => handleKeepCandidate(item)}
                          className="text-xs font-medium text-[var(--c-accent)] hover:underline cursor-pointer"
                        >
                          {t.candidates.keep}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {visibleCandidates.map((item) => {
                  const checked = selectedIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`rounded-[10px] border bg-[var(--c-surface)] overflow-hidden flex flex-col transition-colors ${
                        checked ? 'border-[var(--c-accent)]' : 'border-[var(--c-border)]'
                      }`}
                    >
                      <div className="relative aspect-[2/3] bg-[var(--c-surface-alt)]">
                        {item.thumbPath ? (
                          <img
                            src={`/api/plex/thumb?path=${encodeURIComponent(item.thumbPath)}`}
                            alt={item.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[var(--c-text-muted)]">
                            {item.mediaType === 'show' ? <Tv className="w-10 h-10" /> : <Film className="w-10 h-10" />}
                          </div>
                        )}
                        <label className="absolute top-2.5 left-2.5 p-1.5 rounded-[6px] bg-black/65 flex items-center justify-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(item.id)) next.delete(item.id);
                                else next.add(item.id);
                                return next;
                              })
                            }
                            className="w-4 h-4 accent-[var(--c-accent)] cursor-pointer"
                          />
                        </label>
                        <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded bg-black/75 text-white text-xs font-semibold">
                          {formatBytes(item.fileSizeBytes)}
                        </span>
                      </div>

                      <div className="p-3.5 flex-1 flex flex-col justify-between gap-2">
                        <div className="space-y-1">
                          <div className="font-semibold text-sm leading-snug">
                            {item.title} {item.year ? `(${item.year})` : ''}
                          </div>
                          <div className="text-xs text-[var(--c-text-muted)]">{item.libraryTitle}</div>
                          <div className="text-xs text-[var(--c-text-muted)]">
                            {t.candidates.daysUntouched.replace('{days}', String(item.daysSinceTouched))}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleKeepCandidate(item)}
                          className="text-left text-xs font-medium text-[var(--c-accent)] hover:underline cursor-pointer pt-1"
                        >
                          {t.candidates.keep}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* WHITELIST */}
        {tab === 'whitelist' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold">{t.whitelist.title}</h1>
              <p className="text-sm text-[var(--c-text-muted)] mt-1">{t.whitelist.subtitle}</p>
            </div>

            {whitelist.length === 0 ? (
              <div className="rounded-[10px] border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center text-sm text-[var(--c-text-muted)]">
                {t.whitelist.empty}
              </div>
            ) : (
              <div className="rounded-[10px] border border-[var(--c-border)] bg-[var(--c-surface)] divide-y divide-[var(--c-border)]">
                {whitelist.map((entry) => (
                  <div key={entry.id} className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium text-sm">{entry.title}</div>
                      <div className="text-xs text-[var(--c-text-muted)]">
                        {entry.mediaType} · {entry.reason} · {formatDate(entry.createdAt, lang, '-')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveWhitelist(entry)}
                      className="text-xs font-medium text-[var(--c-danger)] hover:underline cursor-pointer"
                    >
                      {t.whitelist.remove}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* LOGS */}
        {tab === 'logs' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold">{t.logs.title}</h1>
              <p className="text-sm text-[var(--c-text-muted)] mt-1">{t.logs.subtitle}</p>
            </div>

            {logs.length === 0 ? (
              <div className="rounded-[10px] border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center text-sm text-[var(--c-text-muted)]">
                {t.logs.empty}
              </div>
            ) : (
              <div className="rounded-[10px] border border-[var(--c-border)] bg-[var(--c-surface)] divide-y divide-[var(--c-border)]">
                {logs.map((entry) => (
                  <div key={entry.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{entry.title}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-medium ${
                            !entry.succeeded
                              ? 'bg-[var(--c-danger-soft)] text-[var(--c-danger)]'
                              : entry.wasDryRun
                              ? 'bg-[var(--c-accent-soft)] text-[var(--c-accent)]'
                              : 'bg-[var(--c-success-soft)] text-[var(--c-success)]'
                          }`}
                        >
                          {!entry.succeeded
                            ? t.logs.failedBadge
                            : entry.wasDryRun
                            ? t.logs.dryRunBadge
                            : t.logs.liveBadge}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-[var(--c-text-muted)] break-all">{entry.filePath}</div>
                      {entry.errorMessage && (
                        <div className="text-xs text-[var(--c-danger)]">{entry.errorMessage}</div>
                      )}
                    </div>
                    <div className="text-right text-xs text-[var(--c-text-muted)] shrink-0">
                      <div className="font-semibold text-[var(--c-text)]">{formatBytes(entry.fileSizeBytes)}</div>
                      <div>{formatDate(entry.executedAt, lang, '-')}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SETTINGS */}
        {tab === 'settings' && settings && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold">{t.settings.title}</h1>
                <p className="text-sm text-[var(--c-text-muted)] mt-1">
                  {t.settings.subtitle}
                  {meta && (
                    <span className="ml-2 font-mono text-xs opacity-75">· {meta.displayVersion}</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                disabled={savingSettings || Object.keys(settingsErrors).length > 0}
                onClick={handleSaveSettings}
                className="px-4 py-2 rounded-[6px] bg-[var(--c-accent)] text-white text-sm font-medium disabled:opacity-50 cursor-pointer"
              >
                {savingSettings ? t.settings.saving : t.settings.save}
              </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Plex */}
              <section className="rounded-[10px] border border-[var(--c-border)] bg-[var(--c-surface)] p-5 space-y-4">
                <h2 className="text-base font-semibold">{t.settings.plexSection}</h2>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[var(--c-text-muted)]">
                    {t.settings.plexUrl}
                  </label>
                  <input
                    type="url"
                    value={settings.plexUrl}
                    placeholder={t.settings.plexUrlPlaceholder}
                    aria-invalid={Boolean(settingsErrors.plexUrl)}
                    onChange={(e) => setSettings({ ...settings, plexUrl: e.target.value })}
                    className="w-full px-3 py-2 rounded-[6px] border border-[var(--c-border)] bg-[var(--c-bg)] text-sm"
                  />
                  {settingsErrors.plexUrl && (
                    <p className="text-xs text-[var(--c-danger)]">{settingsErrors.plexUrl}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[var(--c-text-muted)]">
                    {t.settings.plexToken}
                  </label>
                  <input
                    type="password"
                    value={plexTokenInput}
                    placeholder={
                      settings.hasPlexToken
                        ? t.settings.plexTokenPlaceholderSaved
                        : t.settings.plexTokenPlaceholderNew
                    }
                    onChange={(e) => setPlexTokenInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-[6px] border border-[var(--c-border)] bg-[var(--c-bg)] text-sm"
                  />
                  <p className="text-xs text-[var(--c-text-muted)] pt-1 leading-relaxed">
                    {t.settings.plexTokenHelp}{' '}
                    <a
                      href="https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--c-accent)] hover:underline font-medium"
                    >
                      {t.settings.plexTokenGuideLink} ↗
                    </a>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleTestPlex}
                  className="px-3 py-2 rounded-[6px] border border-[var(--c-border)] bg-[var(--c-surface-alt)] text-xs font-medium cursor-pointer"
                >
                  {t.settings.testPlex}
                </button>
              </section>

              {/* Rules */}
              <section className="rounded-[10px] border border-[var(--c-border)] bg-[var(--c-surface)] p-5 space-y-4">
                <h2 className="text-base font-semibold">{t.settings.rulesSection}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[var(--c-text-muted)]">
                      {t.settings.inactivityDays}
                    </label>
                    <input
                      type="number"
                      value={settings.inactivityDays}
                      aria-invalid={Boolean(settingsErrors.inactivityDays)}
                      onChange={(e) => setSettings({ ...settings, inactivityDays: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-[6px] border border-[var(--c-border)] bg-[var(--c-bg)] text-sm"
                    />
                    {settingsErrors.inactivityDays && (
                      <p className="text-xs text-[var(--c-danger)]">{settingsErrors.inactivityDays}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[var(--c-text-muted)]">
                      {t.settings.scanIntervalDays}
                    </label>
                    <input
                      type="number"
                      value={settings.scanIntervalDays}
                      aria-invalid={Boolean(settingsErrors.scanIntervalDays)}
                      onChange={(e) => setSettings({ ...settings, scanIntervalDays: Number(e.target.value) })}
                      className="w-full px-3 py-2 rounded-[6px] border border-[var(--c-border)] bg-[var(--c-bg)] text-sm"
                    />
                    {settingsErrors.scanIntervalDays && (
                      <p className="text-xs text-[var(--c-danger)]">{settingsErrors.scanIntervalDays}</p>
                    )}
                  </div>
                </div>

                <label className="flex items-center gap-3 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.dryRun}
                    onChange={(e) => setSettings({ ...settings, dryRun: e.target.checked })}
                    className="w-4 h-4 accent-[var(--c-toggle-on)]"
                  />
                  <span>{t.settings.dryRun}</span>
                </label>

                <label className="flex items-center gap-3 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.deleteEmptyFolders}
                    onChange={(e) => setSettings({ ...settings, deleteEmptyFolders: e.target.checked })}
                    className="w-4 h-4 accent-[var(--c-toggle-on)]"
                  />
                  <span>{t.settings.deleteEmptyFolders}</span>
                </label>
              </section>

              {/* Path Mapping */}
              <section className="rounded-[10px] border border-[var(--c-border)] bg-[var(--c-surface)] p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold">{t.settings.mappingSection}</h2>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({
                        ...settings,
                        pathMappings: [...settings.pathMappings, { plexPrefix: '', localPrefix: '' }],
                      })
                    }
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--c-accent)] cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t.settings.addMapping}
                  </button>
                </div>
                <p className="text-xs text-[var(--c-text-muted)]">{t.settings.mappingHint}</p>

                <div className="space-y-2">
                  {settings.pathMappings.map((rule, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={rule.plexPrefix}
                        placeholder={t.settings.plexPrefix}
                        onChange={(e) => {
                          const next = [...settings.pathMappings];
                          next[idx] = { ...next[idx], plexPrefix: e.target.value };
                          setSettings({ ...settings, pathMappings: next });
                        }}
                        className="flex-1 px-3 py-2 rounded-[6px] border border-[var(--c-border)] bg-[var(--c-bg)] text-xs font-mono"
                      />
                      <span className="text-xs text-[var(--c-text-muted)]">→</span>
                      <input
                        type="text"
                        value={rule.localPrefix}
                        placeholder={t.settings.localPrefix}
                        onChange={(e) => {
                          const next = [...settings.pathMappings];
                          next[idx] = { ...next[idx], localPrefix: e.target.value };
                          setSettings({ ...settings, pathMappings: next });
                        }}
                        className="flex-1 px-3 py-2 rounded-[6px] border border-[var(--c-border)] bg-[var(--c-bg)] text-xs font-mono"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setSettings({
                            ...settings,
                            pathMappings: settings.pathMappings.filter((_, i) => i !== idx),
                          })
                        }
                        className="p-2 text-[var(--c-danger)] cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              {/* Discord & Libraries */}
              <section className="rounded-[10px] border border-[var(--c-border)] bg-[var(--c-surface)] p-5 space-y-4">
                <h2 className="text-base font-semibold">{t.settings.discordSection}</h2>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[var(--c-text-muted)]">
                    {t.settings.discordWebhookUrl}
                  </label>
                  <input
                    type="url"
                    value={settings.discordWebhookUrl}
                    placeholder="https://discord.com/api/webhooks/..."
                    aria-invalid={Boolean(settingsErrors.discordWebhookUrl)}
                    onChange={(e) => setSettings({ ...settings, discordWebhookUrl: e.target.value })}
                    className="w-full px-3 py-2 rounded-[6px] border border-[var(--c-border)] bg-[var(--c-bg)] text-sm"
                  />
                  {settingsErrors.discordWebhookUrl && (
                    <p className="text-xs text-[var(--c-danger)]">{settingsErrors.discordWebhookUrl}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-medium text-[var(--c-text-muted)]">
                    {t.settings.appPublicUrl}
                  </label>
                  <input
                    type="url"
                    value={settings.appPublicUrl}
                    placeholder="http://192.168.1.10:5281"
                    onChange={(e) => setSettings({ ...settings, appPublicUrl: e.target.value })}
                    className="w-full px-3 py-2 rounded-[6px] border border-[var(--c-border)] bg-[var(--c-bg)] text-sm"
                  />
                </div>

                <button
                  type="button"
                  disabled={!settings.discordWebhookUrl || Boolean(settingsErrors.discordWebhookUrl)}
                  onClick={handleTestWebhook}
                  className="px-3 py-2 rounded-[6px] border border-[var(--c-border)] bg-[var(--c-surface-alt)] text-xs font-medium disabled:opacity-40 cursor-pointer"
                >
                  {t.settings.testWebhook}
                </button>

                <div className="pt-2 border-t border-[var(--c-border)] space-y-2">
                  <h3 className="text-xs font-semibold text-[var(--c-text-muted)]">{t.settings.librariesSection}</h3>
                  {libraries.length === 0 ? (
                    <p className="text-xs text-[var(--c-text-muted)]">{t.settings.librariesEmpty}</p>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {libraries.map((lib) => {
                        const excluded = settings.excludedLibraries.includes(lib.key);
                        return (
                          <label key={lib.key} className="inline-flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={excluded}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...settings.excludedLibraries, lib.key]
                                  : settings.excludedLibraries.filter((k) => k !== lib.key);
                                setSettings({ ...settings, excludedLibraries: next });
                              }}
                              className="accent-[var(--c-accent)]"
                            />
                            <span>{lib.title}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        )}
      </main>

      {/* About modal */}
      {aboutOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
          onClick={() => toggleAbout(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-[10px] border border-[var(--c-border)] bg-[var(--c-surface)] p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">{t.nav.about}</h2>
            <div className="text-sm text-[var(--c-text-muted)] space-y-1">
              <div>
                {t.common.version}: <span className="font-mono text-[var(--c-text)]">{meta?.displayVersion ?? '0.1.0'}</span>
              </div>
              <div className="pt-2">
                {lang === 'de' ? 'Mit ' : 'Made with '}
                <span className="text-[#4ade80]">♥</span>
                {lang === 'de' ? ' gemacht' : ''}
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => toggleAbout(false)}
                className="px-4 py-2 rounded-[6px] border border-[var(--c-border)] text-sm font-medium cursor-pointer"
              >
                {t.common.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog}
    </div>
  );
}

export default App;
