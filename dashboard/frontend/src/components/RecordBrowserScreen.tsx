import { useEffect, useState, type ReactNode } from 'react';
import type { MemoryRecordSummary, FullMemoryRecord } from '../types.js';
import { RecordDetailDrawer } from './RecordDetailDrawer.js';

interface Props {
  records: MemoryRecordSummary[];
  isLoading?: boolean;
  onFetchDetail: (id: string) => Promise<FullMemoryRecord | null>;
}

function IconSearch(): ReactNode {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

const RECORD_LIMIT = 100; // the bridge call in App.tsx requests /api/records?limit=100

export function RecordBrowserScreen({ records, isLoading, onFetchDetail }: Props): ReactNode {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [familyFilter, setFamilyFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedRecord, setSelectedRecord] = useState<FullMemoryRecord | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Press "/" anywhere (outside an input) to jump to the search box.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable)
        return;
      e.preventDefault();
      document.getElementById('record-search-input')?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const commandFamilies = ['all', ...Array.from(new Set(records.map((r) => r.commandFamily)))];

  const isRecordVerified = (status: string) => status === 'verified_success' || status === 'passed';

  const filtered = records.filter((r) => {
    if (familyFilter !== 'all' && r.commandFamily !== familyFilter) return false;
    if (statusFilter === 'quarantined' && !r.isQuarantined) return false;
    if (statusFilter === 'clean' && r.isQuarantined) return false;
    if (statusFilter === 'verified' && !isRecordVerified(r.verificationStatus)) return false;

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        r.command.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.fingerprint.toLowerCase().includes(q) ||
        r.fixExplanation.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const verifiedTotal = records.filter((r) => isRecordVerified(r.verificationStatus)).length;
  const quarantinedTotal = records.filter((r) => r.isQuarantined).length;
  const hasActiveFilters = Boolean(searchTerm) || familyFilter !== 'all' || statusFilter !== 'all';

  const handleRowClick = async (id: string) => {
    if (openingId) return;
    setOpeningId(id);
    setDetailError(null);
    try {
      const full = await onFetchDetail(id);
      if (full) setSelectedRecord(full);
      else
        setDetailError(
          `Could not load record ${id}. Check that the bridge is running and try again.`,
        );
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div>
      <div className="screen-header">
        <div className="screen-title-row">
          <div>
            <h1 className="screen-title">Record Browser & Detail</h1>
            <p className="screen-subtitle">
              Searchable catalog of error-fix memories, deterministic fingerprints, provenance
              metadata, and supersedes history.
            </p>
          </div>
        </div>
      </div>

      {/* Quick-filter summary strip */}
      <div className="mini-stats">
        <button
          type="button"
          className="mini-stat"
          onClick={() => setStatusFilter('all')}
          title="Show every record"
        >
          <span>Total</span>
          <strong>{records.length}</strong>
        </button>
        <button
          type="button"
          className="mini-stat success"
          onClick={() => setStatusFilter('verified')}
          title="Show only verified records"
        >
          <span>Verified</span>
          <strong>{verifiedTotal}</strong>
        </button>
        <button
          type="button"
          className={`mini-stat ${quarantinedTotal > 0 ? 'danger' : ''}`}
          onClick={() => setStatusFilter('quarantined')}
          title="Show only quarantined records"
        >
          <span>Quarantined</span>
          <strong>{quarantinedTotal}</strong>
        </button>
        <div className="mini-stat" aria-live="polite">
          <span>Showing</span>
          <strong>{filtered.length}</strong>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="panel toolbar">
        <div className="toolbar-group toolbar-search">
          <input
            id="record-search-input"
            type="text"
            className="input"
            placeholder="Search commands, fingerprints, or explanations... (Press '/' to focus)"
            aria-label="Search records"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        <div className="toolbar-group">
          <select
            id="family-filter-select"
            className="input"
            value={familyFilter}
            onChange={(e) => setFamilyFilter(e.target.value)}
            aria-label="Filter by command family"
          >
            <option value="all">All Command Families</option>
            {commandFamilies
              .filter((f) => f !== 'all')
              .map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
          </select>

          <select
            id="status-filter-select"
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by record status"
          >
            <option value="all">All Verification Statuses</option>
            <option value="clean">Clean (Unquarantined)</option>
            <option value="quarantined">Quarantined (Flagged)</option>
            <option value="verified">Verified Only (Passing)</option>
          </select>

          {hasActiveFilters && (
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                setSearchTerm('');
                setFamilyFilter('all');
                setStatusFilter('all');
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {detailError && (
        <div className="error-banner" role="alert">
          <div>{detailError}</div>
          <button className="btn btn-outline btn-sm" onClick={() => setDetailError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Tabular Data Catalog */}
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container table-scroll">
          <table>
            <thead>
              <tr>
                <th>Record ID</th>
                <th>Target Command</th>
                <th>Family</th>
                <th>Fingerprint (SHA-256)</th>
                <th>Wilson Lower Bound</th>
                <th>Integrity Status</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx}>
                    <td>
                      <div className="skeleton-box" style={{ width: '80px', height: '18px' }} />
                    </td>
                    <td>
                      <div className="skeleton-box" style={{ width: '180px', height: '18px' }} />
                    </td>
                    <td>
                      <div className="skeleton-box" style={{ width: '60px', height: '18px' }} />
                    </td>
                    <td>
                      <div className="skeleton-box" style={{ width: '120px', height: '18px' }} />
                    </td>
                    <td>
                      <div className="skeleton-box" style={{ width: '70px', height: '18px' }} />
                    </td>
                    <td>
                      <div className="skeleton-box" style={{ width: '85px', height: '18px' }} />
                    </td>
                    <td>
                      <div className="skeleton-box" style={{ width: '80px', height: '18px' }} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div
                        className="skeleton-box"
                        style={{ width: '60px', height: '24px', marginLeft: 'auto' }}
                      />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '3rem 1.5rem' }}>
                    <div className="empty-state">
                      <div className="empty-state-icon">
                        <IconSearch />
                      </div>
                      <h2 className="empty-state-title">No Matching Memory Records</h2>
                      <p className="empty-state-desc">
                        {records.length === 0
                          ? 'The memory database is currently empty. Run test executions or benchmarks to seed records.'
                          : 'No records match your active search terms or filter selection.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="row-clickable"
                    onClick={() => void handleRowClick(r.id)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleRowClick(r.id);
                    }}
                  >
                    <td>
                      <span
                        className="mono"
                        style={{ fontWeight: 600, color: 'var(--text-primary)' }}
                      >
                        {r.id}
                      </span>
                    </td>
                    <td>
                      <code
                        className="cell-clip"
                        style={{
                          display: 'block',
                          fontSize: '0.8rem',
                          color: 'var(--text-primary)',
                        }}
                        title={r.command}
                      >
                        {r.command}
                      </code>
                    </td>
                    <td>
                      <span className="badge gray">{r.commandFamily}</span>
                    </td>
                    <td>
                      <span
                        className="mono"
                        style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}
                        title={r.fingerprint}
                      >
                        {r.fingerprint.slice(0, 16)}…
                      </span>
                    </td>
                    <td>
                      {r.wilsonLowerBound !== null ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span
                            className="mono"
                            style={{ fontWeight: 600, color: 'var(--status-success)' }}
                          >
                            {(r.wilsonLowerBound * 100).toFixed(1)}%
                          </span>
                          <div className="metric-bar" style={{ width: '45px', margin: 0 }}>
                            <div
                              style={{
                                width: `${Math.min(100, Math.max(0, r.wilsonLowerBound * 100))}%`,
                                background: 'var(--status-success)',
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      {r.isQuarantined ? (
                        <span className="badge rose">QUARANTINED</span>
                      ) : isRecordVerified(r.verificationStatus) ? (
                        <span className="badge emerald">VERIFIED</span>
                      ) : r.verificationStatus === 'failed' ? (
                        <span className="badge amber">FAILED</span>
                      ) : (
                        <span className="badge gray">RECORDED</span>
                      )}
                    </td>
                    <td
                      style={{
                        fontSize: '0.76rem',
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-outline btn-sm"
                        disabled={openingId !== null}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleRowClick(r.id);
                        }}
                        aria-label={`Inspect record ${r.id}`}
                      >
                        {openingId === r.id ? 'Opening…' : 'Inspect →'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && records.length > 0 && (
          <div className="table-footer">
            Showing {filtered.length} of {records.length} loaded records
            {records.length >= RECORD_LIMIT ? ` (latest ${RECORD_LIMIT} from the bridge)` : ''}
          </div>
        )}
      </div>

      {/* Slide-Out Detail Drawer */}
      <RecordDetailDrawer record={selectedRecord} onClose={() => setSelectedRecord(null)} />
    </div>
  );
}
