import { useState, useEffect, type ReactNode } from 'react';
import type { ExplainabilityData } from '../types.js';

interface Props {
  onFetchExplainability: (queryId?: string) => Promise<ExplainabilityData | null>;
}

function IconBarChart(): ReactNode {
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
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function FactorChip({ label, ok }: { label: string; ok: boolean }): ReactNode {
  return (
    <div>
      {label}: <span className={ok ? 'factor-pass' : 'factor-fail'}>{ok ? 'Pass' : 'Fail'}</span>
    </div>
  );
}

export function ExplainabilityScreen({ onFetchExplainability }: Props): ReactNode {
  const [data, setData] = useState<ExplainabilityData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadFailed, setLoadFailed] = useState<boolean>(false);

  const loadData = async () => {
    setIsLoading(true);
    setLoadFailed(false);
    try {
      const res = await onFetchExplainability();
      if (res) setData(res);
      else setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const threshold = data?.threshold ?? 0.7;
  const candidates = data?.candidates ?? [];
  const acceptedCount = candidates.filter((c) => c.trustScore >= threshold).length;
  const rejectedCount = candidates.length - acceptedCount;

  if (isLoading && !data) {
    return (
      <div>
        <div className="screen-header">
          <div className="explainability-loading" role="status" aria-live="polite">
            <span className="explainability-loading-spinner" aria-hidden="true" />
            <span>Loading retrieval explanation…</span>
          </div>
          <div
            className="skeleton-box"
            style={{ width: '280px', height: '28px', marginBottom: '8px' }}
          />
          <div
            className="skeleton-box"
            style={{ width: '520px', maxWidth: '100%', height: '16px' }}
          />
        </div>
        <div className="panel" style={{ height: '120px' }}>
          <div className="skeleton-box" style={{ height: '100%' }} />
        </div>
        <div className="panel" style={{ height: '400px' }}>
          <div className="skeleton-box" style={{ height: '100%' }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="screen-header">
        <div className="screen-title-row">
          <div>
            <h1 className="screen-title">Retrieval Explainability</h1>
            <p className="screen-subtitle">
              Transparent multi-factor ranking, fuzzy fallback evaluation, and stale-penalty scoring
              against the acceptance threshold.
            </p>
          </div>
          <div className="screen-actions">
            <span
              className="badge gray"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
            >
              Deterministic Scoring Engine
            </span>
            <button
              className="btn btn-outline"
              onClick={() => void loadData()}
              disabled={isLoading}
              aria-label="Re-run retrieval explanation"
            >
              {isLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {loadFailed && (
        <div className="error-banner" role="alert">
          <div>
            <strong>Could not load the explanation.</strong> The bridge did not return
            explainability data
            {data ? ' — showing the last successful result.' : '.'}
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => void loadData()}>
            Retry
          </button>
        </div>
      )}

      {/* Diagnostic Query Banner */}
      <div className="panel" style={{ background: 'var(--bg-subtle)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="mini-label" style={{ marginBottom: '0.25rem' }}>
              Active Diagnostic Evaluation Query
            </div>
            <div
              className="mono"
              style={{
                fontSize: '1.1rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                overflowWrap: 'anywhere',
              }}
            >
              {data?.query ?? '—'}
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Normalized compiler & build script exit failure
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="mini-stats" style={{ marginBottom: 0 }}>
              <div className="mini-stat success">
                <span>Accepted</span>
                <strong>{acceptedCount}</strong>
              </div>
              <div className={`mini-stat ${rejectedCount > 0 ? 'danger' : ''}`}>
                <span>Rejected</span>
                <strong>{rejectedCount}</strong>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="mini-label" style={{ marginBottom: '0.1rem' }}>
                Acceptance Threshold (τ)
              </div>
              <div
                className="mono"
                style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)' }}
              >
                {(threshold * 100).toFixed(0)}% ({threshold.toFixed(2)})
              </div>
              <span className="badge gray" style={{ fontSize: '0.68rem' }}>
                CONSERVATIVE BOUND
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Candidate Score Bars vs Threshold Visualizations */}
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Candidate Fix Scoring vs. Acceptance Threshold</h2>
          </div>
          <span className="badge gray">Levenshtein + Wilson + Provenance</span>
        </div>

        <p
          style={{
            fontSize: '0.82rem',
            color: 'var(--text-secondary)',
            marginBottom: '1.1rem',
            lineHeight: 1.55,
          }}
        >
          Composite score formula:{' '}
          <code className="mono" style={{ color: 'var(--text-primary)' }}>
            S = Similarity × ProvenanceDecay(0.8x) × Quarantine(0.5x) × WilsonBound
          </code>
          . Candidates below τ = {threshold.toFixed(2)} are decisively rejected from prompt
          injection.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {candidates.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <IconBarChart />
              </div>
              <h2 className="empty-state-title">No Candidate Scores Available</h2>
              <p className="empty-state-desc">
                No diagnostic candidate matches were produced for the active query.
              </p>
            </div>
          ) : (
            candidates.map((cand, idx) => {
              const scorePercent = Math.min(100, Math.max(0, Math.round(cand.trustScore * 100)));
              const passes = cand.trustScore >= threshold;

              return (
                <div
                  key={`${cand.id}-${idx}`}
                  className={`candidate-card ${passes ? '' : 'rejected'}`}
                >
                  <div className="candidate-head">
                    <div style={{ minWidth: 0 }}>
                      <div className="candidate-badges">
                        <span
                          className="mono"
                          style={{ fontWeight: 700, color: 'var(--text-primary)' }}
                        >
                          {cand.id}
                        </span>
                        <span
                          className={`badge ${cand.matchType === 'exact' ? 'emerald' : 'gray'}`}
                        >
                          {cand.matchType.toUpperCase()} MATCH
                        </span>
                        {cand.isQuarantined && (
                          <span className="badge rose">QUARANTINED (0.5x PENALTY)</span>
                        )}
                        {cand.isStale && (
                          <span className="badge gray">STALE (LOCKFILE MISMATCH)</span>
                        )}
                      </div>
                      <code
                        style={{
                          fontSize: '0.8rem',
                          color: 'var(--text-primary)',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {cand.command}
                      </code>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div
                        className="mono"
                        style={{
                          fontSize: '1.2rem',
                          fontWeight: 700,
                          color: passes ? 'var(--status-success)' : 'var(--status-danger)',
                        }}
                      >
                        {(cand.trustScore * 100).toFixed(1)}%
                      </div>
                      <span
                        className={`badge ${passes ? 'emerald' : 'rose'}`}
                        style={{ fontSize: '0.68rem', fontWeight: 700 }}
                      >
                        {passes ? 'ACCEPTED' : 'REJECTED (BELOW THRESHOLD)'}
                      </span>
                    </div>
                  </div>

                  {/* Score bar with absolute threshold marker */}
                  <div className="explain-bar-track">
                    <div
                      className="explain-bar-fill"
                      style={{
                        width: `${scorePercent}%`,
                        background: passes ? 'var(--status-success)' : 'var(--status-danger)',
                      }}
                    />
                    <div
                      className="explain-threshold-line"
                      style={{ left: `${threshold * 100}%` }}
                      title={`Retrieval Threshold: ${(threshold * 100).toFixed(0)}%`}
                    />
                  </div>

                  {/* Multi-factor chips & filter checklist */}
                  <div className="candidate-factors">
                    <div>
                      Raw Similarity:{' '}
                      <strong className="mono" style={{ color: 'var(--text-primary)' }}>
                        {(cand.similarityScore * 100).toFixed(1)}%
                      </strong>
                    </div>
                    <FactorChip label="Repo Match" ok={cand.passedFilters.repository} />
                    <FactorChip label="Family Match" ok={cand.passedFilters.commandFamily} />
                    <FactorChip label="Exit Code" ok={cand.passedFilters.exitCode} />
                  </div>

                  {cand.staleReasons.length > 0 && (
                    <div className="candidate-factors" style={{ marginTop: '0.35rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Stale reasons:</span>
                      {cand.staleReasons.map((reason, i) => (
                        <span key={i} className="badge gray">
                          {reason}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Defensible Safety Invariant Callout */}
      <div className="callout">
        <h3>Defensible Safety Invariant: No Silent Promotion</h3>
        <p>
          Fuzzy matches are never silently promoted to verified fixes. Every retrieved record
          surfaces its exact matchType, raw similarity, provenance decay factor, and quarantine
          containment status directly into the prompt sanitization envelope.
        </p>
      </div>
    </div>
  );
}
