import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type {
  MemoryStats,
  MemoryRecordSummary,
  FullMemoryRecord,
  PendingApproval,
  LogEvent,
  ExplainabilityData,
  BenchmarkData,
} from './types.js';

import { OverviewScreen } from './components/OverviewScreen.js';
import { LiveFeedScreen } from './components/LiveFeedScreen.js';
import { RecordBrowserScreen } from './components/RecordBrowserScreen.js';
import { ExplainabilityScreen } from './components/ExplainabilityScreen.js';
import { ApprovalQueueScreen } from './components/ApprovalQueueScreen.js';
import { SecurityAuditScreen } from './components/SecurityAuditScreen.js';
import { BenchmarkScreen } from './components/BenchmarkScreen.js';

/* ── Navigation model: grouped so the sidebar reads as a workflow ── */
type ScreenKey =
  | 'overview'
  | 'feed'
  | 'records'
  | 'explain'
  | 'approvals'
  | 'security'
  | 'benchmarks';

interface ScreenDef {
  key: ScreenKey;
  label: string;
  group: 'Monitor' | 'Investigate' | 'Govern';
  icon: ReactNode;
}

const svgProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const screens: ScreenDef[] = [
  {
    key: 'overview',
    label: 'Overview',
    group: 'Monitor',
    icon: (
      <svg {...svgProps}>
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    key: 'feed',
    label: 'Live Activity',
    group: 'Monitor',
    icon: (
      <svg {...svgProps}>
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    key: 'records',
    label: 'Records',
    group: 'Investigate',
    icon: (
      <svg {...svgProps}>
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5" />
        <path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3" />
      </svg>
    ),
  },
  {
    key: 'explain',
    label: 'Explainability',
    group: 'Investigate',
    icon: (
      <svg {...svgProps}>
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    key: 'approvals',
    label: 'Approval Queue',
    group: 'Govern',
    icon: (
      <svg {...svgProps}>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    key: 'security',
    label: 'Security Audit',
    group: 'Govern',
    icon: (
      <svg {...svgProps}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    key: 'benchmarks',
    label: 'Evaluation',
    group: 'Govern',
    icon: (
      <svg {...svgProps}>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
];

function IconMenu(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function IconSidebarClose(): ReactNode {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <polyline points="15 9 12 12 15 15" />
    </svg>
  );
}

function IconSidebarOpen(): ReactNode {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <polyline points="13 15 16 12 13 9" />
    </svg>
  );
}

function IconSun(): ReactNode {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function IconMoon(): ReactNode {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function IconRefresh({ spinning }: { spinning: boolean }): ReactNode {
  return (
    <svg
      className={spinning ? 'spin' : undefined}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function App(): ReactNode {
  return (
    <BrowserRouter>
      <DashboardShell />
    </BrowserRouter>
  );
}

function DashboardShell(): ReactNode {
  const navigate = useNavigate();
  const location = useLocation();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('agent-memory-theme') as 'dark' | 'light') || 'dark';
  });
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [records, setRecords] = useState<MemoryRecordSummary[]>([]);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('agent-memory-sidebar-open');
    return saved !== null ? saved === 'true' : true;
  });

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem('agent-memory-sidebar-open', String(next));
      return next;
    });
  }, []);

  const activeScreen = location.pathname.replace('/', '') || 'overview';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('agent-memory-theme', theme);
  }, [theme]);

  // Keyboard shortcut: Ctrl+B or Cmd+B to toggle sidebar
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleSidebar]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  /* ── Bridge fetchers (endpoints unchanged) ── */
  const fetchStats = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        setStats(await res.json());
        setLastSync(new Date());
        return true;
      }
    } catch (e) {
      console.warn('Failed to fetch stats from bridge:', e);
    }
    return false;
  }, []);

  const fetchRecords = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/records?limit=100');
      if (res.ok) {
        setRecords(await res.json());
        setLastSync(new Date());
        return true;
      }
    } catch (e) {
      console.warn('Failed to fetch records from bridge:', e);
    }
    return false;
  }, []);

  const fetchApprovals = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/approvals');
      if (res.ok) {
        setApprovals(await res.json());
        return;
      }
      const fallback = await fetch('/api/pending-approvals');
      if (fallback.ok) setApprovals(await fallback.json());
    } catch (e) {
      console.warn('Failed to fetch approvals from bridge:', e);
    }
  }, []);

  /* Initial load */
  useEffect(() => {
    let cancelled = false;
    const loadAll = async () => {
      setIsLoading(true);
      setFetchError(null);
      try {
        const [statsOk, recordsOk] = await Promise.all([
          fetchStats(),
          fetchRecords(),
          fetchApprovals(),
        ]);
        if (!cancelled && !statsOk && !recordsOk) {
          setFetchError('Failed to communicate with the local bridge server.');
        }
      } catch {
        if (!cancelled) setFetchError('Failed to communicate with the local bridge server.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void loadAll();
    return () => {
      cancelled = true;
    };
  }, [fetchStats, fetchRecords, fetchApprovals]);

  /* Live event stream */
  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events');
      eventSource.onopen = () => {
        setIsStreaming(true);
        setFetchError(null);
      };
      eventSource.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data) as LogEvent;
          setEvents((prev) => [...prev, parsed].slice(-200));
          if (parsed.event?.includes('record') || parsed.event?.includes('verify')) {
            void fetchStats();
            void fetchRecords();
            void fetchApprovals();
          }
        } catch {
          // ignore non-json ping or keepalive messages
        }
      };
      eventSource.onerror = () => setIsStreaming(false);
    } catch {
      setIsStreaming(false);
    }

    return () => {
      eventSource?.close();
    };
  }, [fetchStats, fetchRecords, fetchApprovals]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [statsOk, recordsOk] = await Promise.all([
        fetchStats(),
        fetchRecords(),
        fetchApprovals(),
      ]);
      setFetchError(
        !statsOk && !recordsOk ? 'Failed to communicate with the local bridge server.' : null,
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchStats, fetchRecords, fetchApprovals]);

  const handleFetchRecordDetail = async (id: string): Promise<FullMemoryRecord | null> => {
    try {
      const res = await fetch(`/api/records/${id}`);
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('Failed to fetch record detail:', e);
    }
    return null;
  };

  const handleDecision = async (
    id: string,
    decision: 'approve' | 'deny',
    notes?: string,
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/approvals/${id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, operatorNotes: notes }),
      });
      if (res.ok) {
        await fetchApprovals();
        await fetchStats();
        return true;
      }
    } catch (e) {
      console.warn('Failed to submit decision:', e);
    }
    return false;
  };

  const handleFetchExplainability = async (query?: string): Promise<ExplainabilityData | null> => {
    try {
      const url = query
        ? `/api/explainability?query=${encodeURIComponent(query)}`
        : '/api/explainability';
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('Failed to fetch explainability data:', e);
    }
    return null;
  };

  const handleFetchAudit = async () => {
    try {
      const res = await fetch('/api/security-audit');
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('Failed to fetch audit data:', e);
    }
    return null;
  };

  const handleFetchBenchmarks = async (): Promise<BenchmarkData | null> => {
    try {
      const res = await fetch('/api/benchmarks/latest');
      if (res.ok) return await res.json();
    } catch (e) {
      console.warn('Failed to fetch benchmark data:', e);
    }
    return null;
  };

  const routeTo = (screen: string) => {
    navigate(`/${screen}`);
  };

  /* CoMemor logo — single image for both themes */
  const mcpIconSrc = '/comemor-logo.png';

  const badgeFor = (key: ScreenKey): number => {
    switch (key) {
      case 'feed':
        return events.length;
      case 'records':
        return records.length;
      case 'approvals':
        return approvals.length;
      case 'security':
        return stats?.quarantinedCount ?? 0;
      default:
        return 0;
    }
  };

  const badgeTone = (key: ScreenKey): string => {
    switch (key) {
      case 'approvals':
        return 'warning';
      case 'security':
        return 'danger';
      case 'feed':
        return 'cyan';
      case 'records':
        return 'gray';
      default:
        return '';
    }
  };

  const currentLabel = screens.find((s) => s.key === activeScreen)?.label || 'Overview';
  const themeToggle = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return (
    <div className={`app-container ${sidebarOpen ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
      <button
        className="mobile-nav-toggle"
        type="button"
        aria-label="Toggle navigation"
        onClick={() => setMobileNavOpen((prev) => !prev)}
      >
        <IconMenu />
      </button>
      <div
        className={`nav-overlay ${mobileNavOpen ? 'open' : ''}`}
        onClick={() => setMobileNavOpen(false)}
      />

      <aside
        className={`side-nav ${sidebarOpen ? 'open' : 'collapsed'} ${mobileNavOpen ? 'mobile-open' : ''}`}
      >
        <div className="brand-section">
          <div className="brand-main">
            <div className="brand-icon-box" title="Agent Memory Observability Console">
              <img
                src={mcpIconSrc}
                alt="CoMemor"
                width={28}
                height={28}
                style={{ display: 'block', objectFit: 'contain', borderRadius: '6px' }}
              />
            </div>
            <div className="brand-meta">
              <span className="brand-title">Memory Console</span>
              <span className="brand-subtitle mono">CoMemor &bull; v0.1.0</span>
            </div>
          </div>
          <button
            type="button"
            className="sidebar-collapse-btn desktop-only"
            onClick={toggleSidebar}
            title="Collapse sidebar (Ctrl+B)"
            aria-label="Collapse sidebar"
          >
            <IconSidebarClose />
          </button>
        </div>

        <nav className="nav-links" role="tablist" aria-label="Dashboard views">
          {screens.map((item, idx) => {
            const isActive = activeScreen === item.key;
            const badgeCount = badgeFor(item.key);
            const showGroup = idx === 0 || screens[idx - 1].group !== item.group;

            return (
              <div key={item.key} style={{ display: 'contents' }}>
                {showGroup && (
                  <div className="nav-group-label" role="presentation">
                    {item.group}
                  </div>
                )}
                <button
                  id={`nav-tab-${item.key}`}
                  role="tab"
                  aria-selected={isActive}
                  className={`nav-tab ${isActive ? 'active' : ''}`}
                  onClick={() => routeTo(item.key)}
                >
                  <span className="nav-tab-main">
                    <span className="nav-tab-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    {item.label}
                  </span>
                  {badgeCount > 0 && (
                    <span className={`nav-badge ${badgeTone(item.key)}`}>{badgeCount}</span>
                  )}
                </button>
              </div>
            );
          })}
        </nav>

        <div className="nav-actions">
          <div className="status-badge" title="SSE Bridge Pipeline Status">
            <span
              className="pulse-dot"
              style={{
                background: isStreaming ? 'var(--status-success)' : 'var(--status-warning)',
              }}
            />
            <span>{isStreaming ? '127.0.0.1:4321' : 'Reconnecting...'}</span>
          </div>

          <button
            className="theme-toggle-btn"
            onClick={themeToggle}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            aria-label="Toggle visual theme"
          >
            {theme === 'dark' ? <IconSun /> : <IconMoon />}
            <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="top-header-bar">
          <div className="top-header-left">
            {!sidebarOpen && (
              <button
                type="button"
                className="sidebar-toggle-btn desktop-only"
                onClick={toggleSidebar}
                title="Expand sidebar (Ctrl+B)"
                aria-label="Expand sidebar"
              >
                <IconSidebarOpen />
              </button>
            )}
            <div className="breadcrumb-trail">
              <span className="breadcrumb-root">Memory Console</span>
              <span className="breadcrumb-separator">/</span>
              <span className="breadcrumb-current">{currentLabel}</span>
            </div>
          </div>

          <div className="top-header-right">
            {lastSync && (
              <span className="sync-label mono" title="Last successful data sync from the bridge">
                Synced {formatClock(lastSync)}
              </span>
            )}
            <div className="status-badge-inline" title="Bridge Status">
              <span
                className="pulse-dot"
                style={{
                  background: isStreaming ? 'var(--status-success)' : 'var(--status-warning)',
                }}
              />
              <span className="mono" style={{ fontSize: '0.74rem' }}>
                {isStreaming ? '127.0.0.1:4321' : 'Disconnected'}
              </span>
            </div>
            <button
              className="theme-toggle-btn-compact"
              onClick={() => void handleRefresh()}
              disabled={isRefreshing}
              title="Reload stats, records and approvals from the bridge"
              aria-label="Refresh data"
            >
              <IconRefresh spinning={isRefreshing} />
              <span className="desktop-only">Refresh</span>
            </button>
            <button
              className="theme-toggle-btn-compact"
              onClick={themeToggle}
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
              aria-label="Toggle visual theme"
            >
              {theme === 'dark' ? <IconSun /> : <IconMoon />}
            </button>
          </div>
        </header>

        {fetchError && (
          <div className="error-banner" role="alert">
            <div>
              <strong>Connection Warning:</strong> {fetchError}
            </div>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => void handleRefresh()}
              disabled={isRefreshing}
            >
              Retry
            </button>
          </div>
        )}

        <Routes>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route
            path="/overview"
            element={<OverviewScreen stats={stats} isLoading={isLoading} onNavigate={routeTo} />}
          />
          <Route
            path="/feed"
            element={
              <LiveFeedScreen
                events={events}
                isStreaming={isStreaming}
                onClear={() => setEvents([])}
              />
            }
          />
          <Route
            path="/records"
            element={
              <RecordBrowserScreen
                records={records}
                isLoading={isLoading}
                onFetchDetail={handleFetchRecordDetail}
              />
            }
          />
          <Route
            path="/explain"
            element={<ExplainabilityScreen onFetchExplainability={handleFetchExplainability} />}
          />
          <Route
            path="/approvals"
            element={
              <ApprovalQueueScreen
                approvals={approvals}
                isLoading={isLoading}
                onDecision={handleDecision}
                onRefresh={fetchApprovals}
              />
            }
          />
          <Route
            path="/security"
            element={<SecurityAuditScreen onFetchAudit={handleFetchAudit} />}
          />
          <Route
            path="/benchmarks"
            element={<BenchmarkScreen onFetchBenchmarks={handleFetchBenchmarks} />}
          />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </main>
    </div>
  );
}
