import { useEffect, useState, type ReactNode } from 'react';
import type { FullMemoryRecord } from '../types.js';

interface Props {
  record: FullMemoryRecord | null;
  onClose: () => void;
}

export function RecordDetailDrawer({ record, onClose }: Props): ReactNode {
  const [outputTab, setOutputTab] = useState<'normalized' | 'raw'>('normalized');
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!record) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [record, onClose]);

  // Reset per-record UI state when a different record is opened.
  const recordId = record?.id;
  useEffect(() => {
    setOutputTab('normalized');
    setCopied(false);
  }, [recordId]);

  if (!record) return null;

  const wilsonScore = record.verification?.wilsonLowerBound ?? record.wilsonLowerBound ?? null;
  const wilson =
    wilsonScore !== null && wilsonScore !== undefined
      ? `${(wilsonScore * 100).toFixed(1)}%`
      : 'N/A (unverified)';
  const verificationStatus = record.verification?.status ?? record.verificationStatus ?? 'unknown';
  const isVerified = verificationStatus === 'verified_success' || verificationStatus === 'passed';
  const fixCommands = record.fix?.commands || record.fixCommands || [];
  const gitCommit = record.provenance?.commit ?? record.provenance?.gitCommit ?? null;
  const gitBranch = record.provenance?.branch ?? record.provenance?.gitBranch ?? null;
  const capturedBy = record.provenance?.author ?? record.provenance?.gitAuthor ?? null;

  const copyFingerprint = async () => {
    try {
      await navigator.clipboard.writeText(record.fingerprint);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard may be unavailable on non-secure origins; fail silently.
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Record detail view"
      >
        <div className="drawer-header">
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.55rem',
                marginBottom: '0.25rem',
                flexWrap: 'wrap',
              }}
            >
              <span
                className="mono"
                style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}
              >
                {record.id}
              </span>
              {record.isQuarantined && <span className="badge rose">QUARANTINED</span>}
              {isVerified && <span className="badge emerald">VERIFIED</span>}
              <span className="badge gray">{record.commandFamily}</span>
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
              Captured: {new Date(record.createdAt).toLocaleString()} • Normalizer v
              {record.normalizerVersion}
            </div>
          </div>

          <button
            className="btn btn-outline"
            onClick={onClose}
            aria-label="Close record detail drawer"
          >
            Close
          </button>
        </div>

        <div className="drawer-body">
          {record.poisoningFlag && (
            <div
              className="callout"
              style={{
                borderLeftColor: 'var(--status-danger)',
                background: 'var(--status-danger-bg)',
              }}
            >
              <h3 style={{ color: 'var(--status-danger)' }}>
                Security & Adversarial Injection Quarantine Flag
              </h3>
              <p style={{ color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                Reason: {record.poisoningFlag.reason}
              </p>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Flagged at: {new Date(record.poisoningFlag.raisedAt).toLocaleString()} • Status:{' '}
                <span className="badge rose" style={{ fontSize: '0.68rem' }}>
                  {record.poisoningFlag.status.toUpperCase()}
                </span>
              </div>
            </div>
          )}

          {/* Key facts first: status, confidence, provenance in one compact grid */}
          <div className="drawer-section">
            <h3>Verification & Provenance</h3>
            <div className="tile-grid">
              <div className="tile">
                <div className="tile-label">Verification Status</div>
                <div
                  className="tile-value"
                  style={{ color: isVerified ? 'var(--status-success)' : 'var(--text-primary)' }}
                >
                  {verificationStatus}
                </div>
              </div>
              <div className="tile">
                <div className="tile-label">Wilson Lower Bound (95% CI)</div>
                <div className="tile-value mono">{wilson}</div>
              </div>
              <div className="tile">
                <div className="tile-label">Git Commit</div>
                <div
                  className="tile-value mono"
                  style={{ fontSize: '0.82rem' }}
                  title={gitCommit ?? undefined}
                >
                  {gitCommit ? gitCommit.slice(0, 12) : 'N/A'}
                </div>
              </div>
              <div className="tile">
                <div className="tile-label">Branch</div>
                <div className="tile-value mono" style={{ fontSize: '0.82rem' }}>
                  {gitBranch || 'N/A'}
                </div>
              </div>
              <div className="tile">
                <div className="tile-label">Captured By</div>
                <div className="tile-value" style={{ fontSize: '0.84rem' }}>
                  {capturedBy || 'CoMemor'}
                </div>
              </div>
            </div>
          </div>

          <div className="drawer-section">
            <h3>Proposed Fix Rationale</h3>
            <div className="kv-list" style={{ padding: '0.85rem' }}>
              <p
                style={{
                  fontSize: '0.84rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '0.65rem',
                  lineHeight: 1.45,
                }}
              >
                {record.fix?.explanation || record.fixExplanation}
              </p>
              <div className="mini-label">Proposed Fix Commands</div>
              {fixCommands.length === 0 ? (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  No commands recorded.
                </div>
              ) : (
                fixCommands.map((cmd, i) => (
                  <div
                    key={i}
                    className="code-block mono"
                    style={{ margin: '0.25rem 0', fontSize: '0.8rem' }}
                  >
                    $ {cmd}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="drawer-section">
            <h3>Supersedes Chain & Historical Evolution</h3>
            <div className="supersedes-timeline">
              {record.supersedes ? (
                <>
                  <div className="timeline-node">
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      PREDECESSOR
                    </span>
                    <span
                      className="mono"
                      style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.82rem' }}
                    >
                      {record.supersedes}
                    </span>
                    <span className="badge gray" style={{ fontSize: '0.65rem' }}>
                      STALE LOCKFILE
                    </span>
                  </div>
                  <div className="timeline-arrow">
                    <span>replaces ──▶</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      lockfile drift
                    </span>
                  </div>
                  <div
                    className="timeline-node"
                    style={{ borderColor: 'var(--border-strong)', background: 'var(--bg-card)' }}
                  >
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      ACTIVE FIX
                    </span>
                    <span
                      className="mono"
                      style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.82rem' }}
                    >
                      {record.id}
                    </span>
                    <span className="badge emerald" style={{ fontSize: '0.65rem' }}>
                      CURRENT REVISION
                    </span>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div
                    className="timeline-node"
                    style={{ borderColor: 'var(--status-success-bd)' }}
                  >
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      ORIGIN MEMORY
                    </span>
                    <span
                      className="mono"
                      style={{
                        color: 'var(--status-success)',
                        fontWeight: 600,
                        fontSize: '0.82rem',
                      }}
                    >
                      {record.id}
                    </span>
                    <span className="badge emerald" style={{ fontSize: '0.65rem' }}>
                      GENESIS RECORD
                    </span>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Root memory record (no predecessor in supersedes chain).
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="drawer-section">
            <h3 style={{ justifyContent: 'space-between' }}>
              <span>Deterministic SHA-256 Fingerprint</span>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => void copyFingerprint()}
                aria-label="Copy fingerprint"
              >
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </h3>
            <div className="code-block mono fingerprint-value">{record.fingerprint}</div>
          </div>

          <div className="drawer-section" style={{ marginBottom: 0 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <h3 style={{ marginBottom: 0 }}>Error Output Comparison</h3>
              <div className="seg">
                <button
                  className={outputTab === 'normalized' ? 'active' : ''}
                  aria-pressed={outputTab === 'normalized'}
                  onClick={() => setOutputTab('normalized')}
                >
                  Normalized Output
                </button>
                <button
                  className={outputTab === 'raw' ? 'active' : ''}
                  aria-pressed={outputTab === 'raw'}
                  onClick={() => setOutputTab('raw')}
                >
                  Raw (Redacted)
                </button>
              </div>
            </div>
            <pre className="code-block" style={{ maxHeight: '220px', fontSize: '0.76rem' }}>
              {outputTab === 'normalized'
                ? record.normalizedOutput || 'Normalized output unavailable in summary'
                : record.rawOutputRedacted || 'Raw redacted output unavailable in summary'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
