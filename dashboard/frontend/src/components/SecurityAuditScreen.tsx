import { useState, useEffect, type ReactNode, type KeyboardEvent } from 'react';

interface AuditData {
  redactionLayers: Array<{
    layer: string;
    status: string;
    recall?: number;
    threshold?: number;
    patterns?: string[];
    highEntropyCaptured?: boolean;
  }>;
  poisoningAudit: {
    totalInspected: number;
    quarantinedCount: number;
    quarantinedRecords: Array<{
      id: string;
      command: string;
      createdAt: string;
      flagReason: string;
      status: string;
    }>;
    detectors: Array<{
      id: string;
      name: string;
      status: string;
    }>;
  };
}

interface Props {
  onFetchAudit: () => Promise<AuditData | null>;
}

/* ── SVG Icons (Strictly Zero Emojis) ────────────────────────────── */

const iconProps = {
  width: 28,
  height: 28,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function IconLightning(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function IconTerminal(): ReactNode {
  return (
    <svg {...iconProps}>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function IconKey(): ReactNode {
  return (
    <svg {...iconProps}>
      <path d="M21 2l-2 2m-1.5 1.5L16 7l-2 2m-2-2l2-2 1.5-1.5M7 13a5 5 0 1 0 7 7 5 5 0 0 0-7-7z" />
    </svg>
  );
}

function IconWaveform(): ReactNode {
  return (
    <svg {...iconProps}>
      <path d="M2 12h3l3-9 4 18 3-9h3l2-3 2 3h2" />
    </svg>
  );
}

function IconRadar(): ReactNode {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a10 10 0 0 1 10 10" />
      <path d="M12 12l5-5" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function IconDatabase(): ReactNode {
  return (
    <svg {...iconProps}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function IconShield({ size = 22 }: { size?: number }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconCheck(): ReactNode {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <polyline points="2 6 5 9 10 3" />
    </svg>
  );
}

/* ── Stage Specifications for the Deep-Dive Inspector ────────────── */

interface RuleItem {
  name: string;
  pattern: string;
}

interface StageDetail {
  id: string;
  stageName: string;
  sub: string;
  title: string;
  layerBadge: string;
  statusBadge: string;
  description: string;
  rulesHeading: string;
  rules: RuleItem[];
  icon: ReactNode;
  ariaLabel: string;
}

const STAGES: StageDetail[] = [
  {
    id: 'stage-1',
    stageName: 'Raw Ingress',
    sub: 'interceptor: stdio',
    title: 'Stage 1: Raw Ingress Interceptor & Stream Gate',
    layerBadge: 'Layer: Stdio Transport',
    statusBadge: 'ACTIVE',
    description:
      'Synchronous standard stream interceptor executing at the MCP protocol boundary over loopback (127.0.0.1:4321). Ensures raw command stdout and stderr traces are quarantined and analyzed before touching disk or the persistent SQLite database.',
    rulesHeading: 'Transport Guards & Invariants',
    rules: [
      { name: 'Loopback RPC Boundary', pattern: '127.0.0.1:4321' },
      { name: 'Stdio Protocol Interceptor', pattern: 'stdout & stderr' },
      { name: 'Zero Plaintext Disk Leak Invariant', pattern: 'in-memory only' },
      { name: 'Pre-Hash Fingerprint Gate', pattern: 'sha256:pre-write' },
      { name: 'Synchronous Pipeline Execution', pattern: 'blocking RPC' },
    ],
    icon: <IconTerminal />,
    ariaLabel: 'Inspect Raw Ingress node',
  },
  {
    id: 'stage-2',
    stageName: 'Pattern Redactor',
    sub: 'regex: ADR-005',
    title: 'Stage 2: Deterministic Secret Redactor (ADR-005)',
    layerBadge: 'Layer: 100% Recall Regex',
    statusBadge: 'ACTIVE',
    description:
      'High-precision regular expressions targeting credential prefixes, authorization headers, and format signatures with 100% historical test recall. Sanitizes all matching substrings into cryptographic placeholders before memory persistence:',
    rulesHeading: 'Active Signatures & Detection Patterns',
    rules: [
      { name: 'GitHub Personal Access Token', pattern: 'ghp_*' },
      { name: 'AWS Access Key ID', pattern: 'AKIA*' },
      { name: 'OpenAI Secret Key', pattern: 'sk-*' },
      { name: 'Anthropic Secret Key', pattern: 'sk-ant-*' },
      { name: 'Bearer JWT Authentication', pattern: 'RFC 6750' },
      { name: 'PEM Private Cryptographic Keys', pattern: 'BEGIN PRIVATE KEY' },
      { name: 'Database Connection URIs', pattern: 'protocol://user:pass' },
    ],
    icon: <IconKey />,
    ariaLabel: 'Inspect Pattern Redactor node',
  },
  {
    id: 'stage-3',
    stageName: 'Entropy Gate',
    sub: 'entropy: H > 4.5',
    title: 'Stage 3: Shannon Entropy Token Gate (H > 4.5)',
    layerBadge: 'Layer: Statistical Entropy',
    statusBadge: 'ACTIVE',
    description:
      'Calculates Shannon character distribution entropy H = -∑ p_i log₂(p_i) on contiguous tokens of 24+ characters. Automatically suppresses non-standard, custom-generated, or encrypted tokens exceeding 4.5 bits/char:',
    rulesHeading: 'Statistical Thresholds & Bounds',
    rules: [
      { name: 'Shannon Uniform Estimator', pattern: 'H = -∑ p_i log₂(p_i)' },
      { name: 'Entropy Sensitivity Threshold', pattern: 'H > 4.5 bits/char' },
      { name: 'Minimum Contiguous Token Length', pattern: '≥ 24 characters' },
      { name: 'Base64 / Hex Hash Sanitization', pattern: 'radix-aware' },
      { name: 'Pre-Persistence Substitution', pattern: '[REDACTED_ENTROPY]' },
    ],
    icon: <IconWaveform />,
    ariaLabel: 'Inspect Entropy Gate node',
  },
  {
    id: 'stage-4',
    stageName: 'Poisoning Defense',
    sub: '7: detectors',
    title: 'Stage 4: 7-Layer Poisoning Heuristics Engine',
    layerBadge: 'Layer: Adversarial Defense',
    statusBadge: 'ACTIVE',
    description:
      'Heuristic detection layers inspect memory records for indirect prompt injection, instruction overrides, and malicious system evasion techniques prior to storage:',
    rulesHeading: 'Adversarial Detection Vectors',
    rules: [
      { name: 'Imperative Instruction Injection', pattern: '"ignore previous instructions"' },
      { name: 'Fake System Boundary Markers', pattern: '[INST], <<SYS>>, <|im_start|>' },
      { name: 'Out-of-Band Data Exfiltration', pattern: 'curl -X POST, webhook' },
      { name: 'Nested Obfuscation Wrappers', pattern: 'atob(...) decode' },
      { name: 'Zero-Width Character Evasion', pattern: 'U+200B, soft hyphen' },
      { name: 'Unicode Homoglyph Spoofing', pattern: 'Cyrillic confusables' },
      { name: 'Imperative Verb Density Spike', pattern: '> 8% verbs (20+ words)' },
    ],
    icon: <IconRadar />,
    ariaLabel: 'Inspect Poisoning Defense node',
  },
  {
    id: 'stage-5',
    stageName: 'Storage & Gate',
    sub: 'sqlite: fts5',
    title: 'Stage 5: Dual-Path Storage & Quarantine Gate',
    layerBadge: 'Layer: Containment Invariant',
    statusBadge: 'ACTIVE',
    description:
      'Dual-path persistence routing. Clean records are indexed into SQLite FTS5 for default retrieval, while flagged records are isolated in the Quarantine Vault:',
    rulesHeading: 'Persistence Routing & Guarantees',
    rules: [
      { name: 'Clean Route: Rebuildable SQLite Index', pattern: 'FTS5 full-text' },
      { name: 'Clean Route: Append-Only Event Store', pattern: 'source-of-truth .jsonl' },
      { name: 'Clean Route: Wilson Confidence Scoring', pattern: 'z = 1.96 lower bound' },
      { name: 'Quarantine Route: Default Prompt Exclusion', pattern: 'strict isolation' },
      { name: 'Quarantine Route: Retrieval Penalty', pattern: '0.5x composite weight' },
      { name: 'Quarantine Route: Tamper-Evident Audit Log', pattern: 'forensic telemetry' },
    ],
    icon: <IconDatabase />,
    ariaLabel: 'Inspect Storage and Gate destination',
  },
];

export function SecurityAuditScreen({ onFetchAudit }: Props): ReactNode {
  const [data, setData] = useState<AuditData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadFailed, setLoadFailed] = useState<boolean>(false);
  const [selectedStageId, setSelectedStageId] = useState<string>('stage-2');
  const [filterQuery, setFilterQuery] = useState<string>('');

  const loadAudit = async () => {
    setIsLoading(true);
    setLoadFailed(false);
    try {
      const res = await onFetchAudit();
      if (res) setData(res);
      else setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadAudit();
  }, []);

  if (isLoading && !data) {
    return (
      <div>
        <div className="screen-header">
          <div
            className="skeleton-box"
            style={{ width: '320px', height: '28px', marginBottom: '8px' }}
          />
          <div
            className="skeleton-box"
            style={{ width: '520px', maxWidth: '100%', height: '16px' }}
          />
        </div>
        <div className="panel" style={{ height: '240px', marginBottom: '16px' }}>
          <div className="skeleton-box" style={{ height: '100%' }} />
        </div>
        <div className="panel" style={{ height: '240px' }}>
          <div className="skeleton-box" style={{ height: '100%' }} />
        </div>
      </div>
    );
  }

  const currentStage = STAGES.find((s) => s.id === selectedStageId) ?? STAGES[1];
  const quarantinedRecords = data?.poisoningAudit?.quarantinedRecords ?? [];
  const totalInspected = data?.poisoningAudit?.totalInspected ?? 0;
  const quarantinedCount = data?.poisoningAudit?.quarantinedCount ?? quarantinedRecords.length;
  const detectors = data?.poisoningAudit?.detectors ?? [];
  const redactionLayers = data?.redactionLayers ?? [];
  const filteredRecords = quarantinedRecords.filter((r) => {
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase();
    return (
      r.id.toLowerCase().includes(q) ||
      r.command.toLowerCase().includes(q) ||
      r.flagReason.toLowerCase().includes(q)
    );
  });

  const nodeKeyDown = (id: string) => (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelectedStageId(id);
    }
  };

  return (
    <div>
      <div className="screen-header">
        <div className="screen-title-row">
          <div>
            <h1 className="screen-title">Security & Redaction Architecture</h1>
            <p className="screen-subtitle">
              Verification of multi-layer secret redaction (deterministic regex + Shannon entropy)
              and persisted-retrieval poisoning heuristic defenses.
            </p>
          </div>
          <div className="screen-actions">
            <span
              className="badge emerald"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
            >
              <IconCheck /> Zero Plaintext Leak Invariant Active
            </span>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => void loadAudit()}
              disabled={isLoading}
              aria-label="Refresh security audit"
            >
              {isLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {loadFailed && (
        <div className="error-banner" role="alert">
          <div>
            <strong>Could not load audit data.</strong> The bridge did not return a security audit
            {data ? ' — showing the last successful result.' : '.'}
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => void loadAudit()}>
            Retry
          </button>
        </div>
      )}

      {/* ── Key numbers first ── */}
      <div className="stat-grid">
        <div className={`stat-card ${quarantinedCount > 0 ? 'tone-danger' : 'tone-success'}`}>
          <div className="stat-label">Quarantined Records</div>
          <div
            className="stat-value"
            style={{
              color: quarantinedCount > 0 ? 'var(--status-danger)' : 'var(--status-success)',
            }}
          >
            {quarantinedCount}
          </div>
          <div className="stat-subtext">
            {quarantinedCount > 0
              ? 'Excluded from default prompt retrieval.'
              : 'No adversarial memories detected.'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Records Inspected</div>
          <div className="stat-value">{totalInspected}</div>
          <div className="stat-subtext">Passed through the poisoning heuristics engine.</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Detectors</div>
          <div className="stat-value">{detectors.length > 0 ? detectors.length : 7}</div>
          <div className="stat-subtext">
            {detectors.length > 0
              ? `${detectors.filter((d) => d.status === 'active').length} reporting active.`
              : 'Heuristic layers guarding retrieval.'}
          </div>
        </div>
      </div>

      {/* ── QUARANTINED RECORDS CATALOG TABLE ── */}
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="audit-table-header">
          <div>
            <h2 className="panel-title" style={{ display: 'inline' }}>
              Quarantined Records Catalog
            </h2>
            <span
              style={{ marginLeft: '0.65rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}
            >
              ({quarantinedRecords.length} {quarantinedRecords.length === 1 ? 'record' : 'records'}{' '}
              quarantined)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="input"
              style={{ width: '240px', maxWidth: '100%' }}
              placeholder="Filter quarantined records..."
              aria-label="Filter quarantined records"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
            />
            <span className="badge rose">Excluded from Default Prompt Retrieval</span>
          </div>
        </div>

        <div className="table-container table-scroll" style={{ maxHeight: '420px' }}>
          <table>
            <thead>
              <tr>
                <th>Record ID</th>
                <th>Command</th>
                <th>Detection Reason</th>
                <th>Quarantined At</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '2.5rem 1.5rem' }}>
                    <div className="empty-state">
                      <div className="empty-state-icon">
                        <IconShield />
                      </div>
                      <h2 className="empty-state-title">Quarantine Log Clean</h2>
                      <p className="empty-state-desc">
                        {quarantinedRecords.length === 0
                          ? 'No records are currently quarantined. All active memory records passed through the 7-layer heuristic detection pipeline without triggering flags.'
                          : 'No quarantined records match your search filter.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => (
                  <tr key={r.id}>
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
                      <span
                        style={{
                          color: 'var(--status-danger)',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                        }}
                      >
                        {r.flagReason}
                      </span>
                    </td>
                    <td
                      style={{
                        fontSize: '0.76rem',
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <span className="badge rose">{r.status.toUpperCase()}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── PIPELINE CANVAS ── */}
      <div className="n8n-canvas-container">
        <div className="n8n-canvas-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span className="mini-label" style={{ margin: 0 }}>
              Pipeline Topology
            </span>
            <span className="badge gray" style={{ fontSize: '0.7rem' }}>
              5 Defense Stages
            </span>
            <span className="badge emerald" style={{ fontSize: '0.7rem' }}>
              <IconCheck /> Synchronous Execution
            </span>
          </div>

          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Click any node to inspect rules & telemetry
          </span>
        </div>

        <div className="n8n-canvas-flow">
          <div className="n8n-canvas-flow-inner">
            {STAGES.map((stage, idx) => (
              <div key={stage.id} style={{ display: 'contents' }}>
                {idx > 0 && (
                  <div className="n8n-connector-line">
                    <svg width="44" height="76" viewBox="0 0 44 76" fill="none">
                      {idx === 1 && (
                        <defs>
                          <marker
                            id="arrowHead"
                            markerWidth="6"
                            markerHeight="6"
                            refX="5"
                            refY="3"
                            orient="auto"
                          >
                            <path d="M0,0 L6,3 L0,6" fill="var(--border-strong)" />
                          </marker>
                        </defs>
                      )}
                      <line
                        x1="0"
                        y1="38"
                        x2="38"
                        y2="38"
                        stroke="var(--border-strong)"
                        strokeWidth="1.5"
                        markerEnd="url(#arrowHead)"
                      />
                    </svg>
                  </div>
                )}

                <div
                  className="n8n-node-wrapper"
                  onClick={() => setSelectedStageId(stage.id)}
                  tabIndex={0}
                  role="button"
                  aria-label={stage.ariaLabel}
                  aria-pressed={selectedStageId === stage.id}
                  onKeyDown={nodeKeyDown(stage.id)}
                >
                  <div
                    className={`n8n-node-box ${idx === 0 ? 'trigger-node' : ''} ${selectedStageId === stage.id ? 'selected' : ''}`}
                  >
                    {idx === 0 ? (
                      <div className="n8n-trigger-icon" title="Pipeline Trigger Event">
                        <IconLightning />
                      </div>
                    ) : (
                      <div className="n8n-port-in" />
                    )}
                    {stage.icon}
                    <div className="n8n-port-out" />
                  </div>
                  <div className="n8n-node-label">{stage.stageName}</div>
                  <div className="n8n-node-sub">{stage.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── STAGE DEEP-DIVE INSPECTOR ── */}
        <div className="n8n-inspector">
          <div className="n8n-inspector-header">
            <div>
              <div className="n8n-inspector-eyebrow">
                <IconShield size={14} />
                <span>Stage Deep-Dive Inspector</span>
              </div>
              <h3 className="n8n-inspector-title">{currentStage.title}</h3>
            </div>

            <div className="n8n-inspector-badges">
              <span className="badge gray">{currentStage.layerBadge}</span>
              <span className="badge emerald">
                <IconCheck /> {currentStage.statusBadge}
              </span>
            </div>
          </div>

          <p className="n8n-inspector-desc">{currentStage.description}</p>

          <div className="n8n-rules-section">
            <div className="n8n-rules-heading">
              <span className="n8n-rules-heading-title">{currentStage.rulesHeading}</span>
              <span className="badge gray" style={{ fontSize: '0.7rem' }}>
                {currentStage.rules.length} Active Rules
              </span>
            </div>

            <div className="n8n-rules-grid">
              {currentStage.rules.map((rule, idx) => (
                <div key={idx} className="n8n-rule-card">
                  <div className="n8n-rule-card-left">
                    <span className="n8n-rule-card-dot" />
                    <span className="n8n-rule-card-name" title={rule.name}>
                      {rule.name}
                    </span>
                  </div>
                  <code className="n8n-rule-card-tag" title={rule.pattern}>
                    {rule.pattern}
                  </code>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── LIVE LAYER STATUS REPORTED BY THE BRIDGE ── */}
      {(redactionLayers.length > 0 || detectors.length > 0) && (
        <div className="redaction-layers-grid">
          {redactionLayers.length > 0 && (
            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Redaction Layers (reported)</h2>
                <span className="badge gray">{redactionLayers.length} layers</span>
              </div>
              <div className="subsystem-rows">
                {redactionLayers.map((l) => (
                  <div key={l.layer} className="subsystem-row">
                    <div className="subsystem-row-header">
                      <span className="subsystem-row-title">{l.layer}</span>
                      <span className={`badge ${l.status === 'active' ? 'emerald' : 'gray'}`}>
                        {l.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="subsystem-row-desc">
                      {l.recall !== undefined && <>Recall {(l.recall * 100).toFixed(0)}% </>}
                      {l.threshold !== undefined && <>· Threshold {l.threshold} </>}
                      {l.patterns && l.patterns.length > 0 && <>· {l.patterns.length} patterns </>}
                      {l.highEntropyCaptured !== undefined && (
                        <>· High-entropy {l.highEntropyCaptured ? 'captured' : 'not captured'}</>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {detectors.length > 0 && (
            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Poisoning Detectors (reported)</h2>
                <span className="badge gray">{detectors.length} detectors</span>
              </div>
              <div className="subsystem-rows">
                {detectors.map((d) => (
                  <div key={d.id} className="subsystem-row">
                    <div className="subsystem-row-header">
                      <span className="subsystem-row-title">{d.name}</span>
                      <span className={`badge ${d.status === 'active' ? 'emerald' : 'gray'}`}>
                        {d.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
