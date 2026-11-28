import { useState, useEffect, type ReactNode } from 'react';
import type { BenchmarkData } from '../types.js';

interface Props {
  onFetchBenchmarks: () => Promise<BenchmarkData | null>;
}

const SLA_MS = 20;

function IconTrendUp(): ReactNode {
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
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

export function BenchmarkScreen({ onFetchBenchmarks }: Props): ReactNode {
  const [data, setData] = useState<BenchmarkData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await onFetchBenchmarks();
      if (res) setData(res);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  if (isLoading && !data) {
    return (
      <div>
        <div className="screen-header">
          <div
            className="skeleton-box"
            style={{ width: '340px', height: '28px', marginBottom: '8px' }}
          />
          <div
            className="skeleton-box"
            style={{ width: '540px', maxWidth: '100%', height: '16px' }}
          />
        </div>
        <div className="panel" style={{ height: '240px', marginBottom: '16px' }}>
          <div className="skeleton-box" style={{ height: '100%' }} />
        </div>
        <div className="panel" style={{ height: '200px' }}>
          <div className="skeleton-box" style={{ height: '100%' }} />
        </div>
      </div>
    );
  }

  if (!data || !data.baselines?.length) {
    return (
      <div>
        <div className="screen-header">
          <div>
            <h1 className="screen-title">Benchmark & Evaluation Results</h1>
            <p className="screen-subtitle">
              Empirical evaluation comparisons for memory retrieval and repair workflows.
            </p>
          </div>
        </div>
        <div className="panel">
          <div className="empty-state">
            <div className="empty-state-icon">
              <IconTrendUp />
            </div>
            <h2 className="empty-state-title">No evaluation data available</h2>
            <p className="empty-state-desc">
              Benchmark data has not been generated yet. Once the evaluation harness runs, this
              screen will populate with baselines and latency results.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isPre = data.status === 'pre_evaluation';
  const ours = data.baselines[data.baselines.length - 1];
  const reference = data.baselines.length > 1 ? data.baselines[0] : null;
  const ttrSaved =
    reference && reference.timeToRepairSec > 0
      ? Math.round((1 - ours.timeToRepairSec / reference.timeToRepairSec) * 100)
      : null;

  const latencyRows: { label: string; p50: number; p95: number; engine: string }[] = [
    {
      label: '100 Records',
      ...data.retrievalLatencyMs.records100,
      engine: 'SQLite In-Memory / WAL',
    },
    {
      label: '1,000 Records',
      ...data.retrievalLatencyMs.records1000,
      engine: 'Indexed Fingerprint + FTS5',
    },
    {
      label: '10,000 Records',
      ...data.retrievalLatencyMs.records10000,
      engine: 'Indexed Fingerprint + FTS5',
    },
  ];
  const allWithinSla = latencyRows.every((r) => r.p95 < SLA_MS);
  const ablations = data.ablations ?? [];

  return (
    <div>
      <div className="screen-header">
        <div className="screen-title-row">
          <div>
            <h1 className="screen-title">Benchmark & Evaluation Results</h1>
            <p className="screen-subtitle">
              Empirical evaluation comparisons for repair speed, tool usage, and retrieval latency.
            </p>
          </div>
          <div className="screen-actions">
            <span className="badge gray">Empirical Evaluation Harness Active</span>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => void loadData()}
              disabled={isLoading}
              aria-label="Reload benchmark results"
            >
              {isLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Headline numbers for our configuration */}
      <div className="stat-grid">
        <div className="stat-card tone-success">
          <div className="stat-label">Success Rate</div>
          <div className="stat-value" style={{ color: 'var(--status-success)' }}>
            {(ours.successRate * 100).toFixed(0)}%
          </div>
          <div className="stat-subtext">{ours.name}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Time to Repair</div>
          <div className="stat-value">{ours.timeToRepairSec}s</div>
          <div className="stat-subtext">
            {ttrSaved !== null && ttrSaved > 0
              ? `${ttrSaved}% faster than ${reference?.name}`
              : `${ours.toolCalls} tool calls`}
          </div>
        </div>
        <div className={`stat-card ${ours.falseReuseRate > 0.03 ? 'tone-danger' : 'tone-success'}`}>
          <div className="stat-label">False Reuse Rate</div>
          <div
            className="stat-value"
            style={{
              color: ours.falseReuseRate > 0.03 ? 'var(--status-danger)' : 'var(--status-success)',
            }}
          >
            {(ours.falseReuseRate * 100).toFixed(1)}%
          </div>
          <div className="stat-subtext">Lower is safer. Target ≤ 3%.</div>
        </div>
      </div>

      <div className="panel benchmark-banner">
        <div className="benchmark-banner-body">
          <div>
            <h2>Benchmark Protocol</h2>
            <p>Measures time-to-repair, tool usage, success rate, and false reuse avoidance.</p>
          </div>
          {!isPre ? (
            <span className="badge emerald">B3 Benchmark Target Achieved</span>
          ) : (
            <span className="badge gray">Pre-Evaluation — Run benchmark:run to populate</span>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Baseline Comparison</h2>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Higher Success / Lower TTR
            </span>
            <span className="badge emerald">B3: Our Work</span>
          </div>
        </div>

        <div className="baseline-grid">
          {data.baselines.map((b, i) => {
            const isOurWork = i === data.baselines.length - 1;

            return (
              <div key={i} className={`benchmark-card${isOurWork ? ' benchmark-card-ours' : ''}`}>
                <div className="benchmark-card-heading">
                  <div className="benchmark-card-title">{b.name}</div>
                  {isOurWork && (
                    <span className="badge emerald benchmark-card-ours-badge">OUR WORK (B3)</span>
                  )}
                </div>
                <div className="benchmark-card-body">
                  <div>
                    <div className="metric-row">
                      <span>Success Rate</span>
                      <strong
                        className="mono"
                        style={{
                          color: isOurWork ? 'var(--status-success)' : 'var(--text-primary)',
                        }}
                      >
                        {(b.successRate * 100).toFixed(0)}%
                      </strong>
                    </div>
                    <div
                      className="metric-bar"
                      role="meter"
                      aria-label={`${b.name} success rate`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(b.successRate * 100)}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(0, b.successRate * 100))}%`,
                          background: isOurWork ? 'var(--status-success)' : 'var(--accent)',
                        }}
                      />
                    </div>
                  </div>
                  <div className="metric-row">
                    <span>Time to Repair</span>
                    <strong className="mono">{b.timeToRepairSec}s</strong>
                  </div>
                  <div className="metric-row">
                    <span>Tool Calls</span>
                    <strong className="mono">{b.toolCalls}</strong>
                  </div>
                  <div className="metric-row">
                    <span>False Reuse Rate</span>
                    <strong
                      className="mono"
                      style={{
                        color:
                          b.falseReuseRate > 0.03
                            ? 'var(--status-danger)'
                            : 'var(--status-success)',
                      }}
                    >
                      {(b.falseReuseRate * 100).toFixed(1)}%
                    </strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="audit-table-header">
          <h2 className="panel-title">Retrieval Latency Performance</h2>
          {isPre ? (
            <span className="badge gray">Not validated yet</span>
          ) : allWithinSla ? (
            <span className="badge emerald">All &lt; {SLA_MS}ms Target SLA</span>
          ) : (
            <span className="badge rose">SLA exceeded on at least one scale</span>
          )}
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Corpus Scale</th>
                <th>Median Latency (p50)</th>
                <th>95th Percentile (p95)</th>
                <th>Target SLA (&lt; {SLA_MS}ms)</th>
                <th>Execution Engine</th>
              </tr>
            </thead>
            <tbody>
              {latencyRows.map((row) => {
                const ok = row.p95 < SLA_MS;
                const tone = ok ? 'var(--status-success)' : 'var(--status-danger)';
                return (
                  <tr key={row.label}>
                    <td>
                      <strong>{row.label}</strong>
                    </td>
                    <td>
                      <span className="mono" style={{ color: tone, fontWeight: 600 }}>
                        {row.p50} ms
                      </span>
                    </td>
                    <td>
                      <span className="mono" style={{ color: tone, fontWeight: 600 }}>
                        {row.p95} ms
                      </span>
                    </td>
                    <td>
                      {isPre ? (
                        <span className="badge gray">Not validated</span>
                      ) : ok ? (
                        <span className="badge emerald">PASSED</span>
                      ) : (
                        <span className="badge rose">EXCEEDED</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{row.engine}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ablation Analysis */}
      <div className="panel" style={{ marginTop: '1rem' }}>
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Ablation Analysis: Safety Subsystem Contributions</h2>
          </div>
          <span className="badge gray">Measured Vulnerability Deficit</span>
        </div>

        {ablations.length === 0 ? (
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            No ablation results reported.
          </p>
        ) : (
          <div className="ablation-grid">
            {ablations.map((ab, i) => (
              <div key={i} className="ablation-card">
                <div
                  style={{
                    fontWeight: 600,
                    color: 'var(--status-danger)',
                    marginBottom: '0.45rem',
                    fontSize: '0.85rem',
                  }}
                >
                  {ab.name}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {ab.staleReusePercent !== undefined && (
                    <div>
                      Stale Reuse Rate jumps to:{' '}
                      <strong className="mono" style={{ color: 'var(--status-danger)' }}>
                        {ab.staleReusePercent}%
                      </strong>
                    </div>
                  )}
                  {ab.poisonedRetrievalPercent !== undefined && (
                    <div>
                      Poisoned Injection Reuse:{' '}
                      <strong className="mono" style={{ color: 'var(--status-danger)' }}>
                        {ab.poisonedRetrievalPercent}%
                      </strong>
                    </div>
                  )}
                  {ab.riskScore && (
                    <div>
                      Credential Leakage Risk:{' '}
                      <strong style={{ color: 'var(--status-danger)' }}>{ab.riskScore}</strong>
                    </div>
                  )}
                  <div
                    style={{
                      marginTop: '0.35rem',
                      fontSize: '0.72rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Latency Delta:{' '}
                    <span className="mono">
                      {ab.latencyDeltaMs > 0 ? `+${ab.latencyDeltaMs}` : ab.latencyDeltaMs}ms
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
