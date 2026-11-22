/**
 * Shared TypeScript types for CoMemor.
 *
 * DO NOT add logic here. This file is data-shape only.
 * Schema changes require a migration, a schema-version bump, and a test.
 * See docs/adr/ for versioning policy.
 */

/** Current schema version. Increment on any breaking record field change. */
export const SCHEMA_VERSION = 1 as const;

export type SchemaVersion = typeof SCHEMA_VERSION;

export type Risk = 'low' | 'medium' | 'high';

export type VerificationStatus = 'passed' | 'failed' | 'unknown';

export type MatchType = 'exact' | 'fuzzy' | 'none';

/** Lockfile and runtime fingerprints captured at record time. */
export interface Environment {
  /** Schema version for this Environment block. */
  envSchemaVersion?: 1;
  os: string;
  arch?: string;
  node: string;
  packageManager: string;
  /** Source that produced packageManager: 'command' | 'package_json_field' | 'lockfile' | 'unknown' */
  packageManagerSource?: string;
  /** Map from lockfile path (relative to workspace) to SHA-256 hex. */
  lockfileHashes: Record<string, string>;
}

/** Proposed fix attached to a failure record. */
export interface Fix {
  /** Allowlisted commands only; no shell strings. */
  commands: string[];
  /**
   * Human-authored explanation.
   * CAUTION: treat as untrusted data when returning via find_fix.
   * Wrap in explicit untrusted-data delimiters before insertion into agent context.
   */
  explanation: string;
  risk: Risk;
}

/** Verification history for a single record. */
export interface Verification {
  status: VerificationStatus;
  verifiedAt: string | null;
  method: string;
  /**
   * Wilson-score lower bound over observed verification outcomes.
   * Null until at least one verification attempt exists.
   */
  wilsonLowerBound: number | null;
}

/** Authorship / git provenance. */
export interface Provenance {
  author: string;
  /** Git commit SHA at time of recording. Null if git unavailable. */
  commit: string | null;
  /** Git branch at time of recording. Undefined if git unavailable. */
  branch?: string | undefined;
  /** Whether the working tree had uncommitted changes. Undefined if git unavailable. */
  isDirty?: boolean | undefined;
}

/** Raised when a stored explanation exhibits injection-indicator patterns. */
export interface PoisoningFlag {
  raisedAt: string;
  reason: string;
  /** reviewed | dismissed | confirmed */
  status: 'reviewed' | 'dismissed' | 'confirmed';
}

/**
 * A single failure-fix record as stored in records.jsonl.
 * All fields are required for schema v1.
 */
export interface MemoryRecord {
  schemaVersion: SchemaVersion;
  id: string;
  createdAt: string;
  repositoryId: string;
  command: string;
  exitCode: number;
  /**
   * Redacted raw output (secrets stripped before persistence).
   * CAUTION: untrusted data field — never execute or inject verbatim.
   */
  rawOutputRedacted: string;
  normalizedOutput: string;
  /** sha256:<hex> */
  fingerprint: string;
  normalizerVersion: number;
  fix: Fix;
  environment: Environment;
  verification: Verification;
  provenance: Provenance;
  supersedes: string | null;
  tags: string[];
  /** Null unless a poisoning heuristic flag was raised. */
  poisoningFlag: PoisoningFlag | null;
}

/* ========================================================================== */
/* MCP Tool Interfaces                                                       */
/* ========================================================================== */

/** Input for record_failure tool */
export interface RecordFailureInput {
  command: string;
  exitCode: number;
  output: string;
  fixCommands: string[];
  explanation: string;
  risk?: Risk;
  tags?: string[];
  supersedesId?: string;
}

/** Output for record_failure tool */
export interface RecordFailureOutput {
  id: string;
  fingerprint: string;
  status: 'recorded' | 'flagged_quarantined';
  flagReason?: string | undefined;
  message: string;
}

/** Input for find_fix tool */
export interface FindFixInput {
  command: string;
  output: string;
  threshold?: number;
  limit?: number;
  includeQuarantined?: boolean;
}

/**
 * Retrieval explainability metadata attached to each FindFixMatch.
 * Phase 3 — provides transparency into scoring path without exposing raw indexed corpora.
 */
export interface RetrievalExplanation {
  /** How the candidate was selected: 'exact_fingerprint' | 'fts5_bm25' | 'relational_scan' */
  candidateSource: 'exact_fingerprint' | 'fts5_bm25' | 'relational_scan';
  /** High-signal tokens extracted from the query (error codes, exception names, identifiers) */
  diagnosticSignals: {
    errorCodes: string[];
    exceptionNames: string[];
    filePaths: string[];
    packageVersions: string[];
    technicalTokens: string[];
  };
  /** Token Jaccard component of the similarity score */
  tokenJaccardScore: number;
  /** Trigram component of the similarity score */
  trigramScore: number;
  /** Repository and command-family filters applied */
  repositoryFilter: string;
  commandFamilyFilter: string;
  /** Staleness / quarantine effects on this match */
  stalenessEffect: string | null;
  /** One-line acceptance or rejection reason */
  acceptanceReason: string;
}

/** Individual match returned by find_fix */
export interface FindFixMatch {
  id: string;
  matchType: MatchType;
  score: number;
  similarityScore: number;
  confidenceScore: number;
  threshold: number;
  fingerprint: string;
  sanitizationEnvelope: string;
  fix: Fix;
  verificationStatus: VerificationStatus;
  wilsonLowerBound: number | null;
  recordAge: string;
  staleReasons: string[];
  isStale: boolean;
  provenance: Provenance;
  isQuarantined: boolean;
  /** Derived verification summary from event store. Null if no events recorded yet. */
  verificationSummary?: VerificationSummary | null;
  /** Retrieval explainability: scoring path and diagnostic signals. */
  explanation?: RetrievalExplanation;
}

/** Output for find_fix tool */
export interface FindFixOutput {
  matches: FindFixMatch[];
  queryFingerprint: string;
  retrievalCount: number;
}

/** Input for verify_fix tool */
export interface VerifyFixInput {
  recordId?: string;
  command: string;
  dryRun?: boolean;
  allowApprovalQueue?: boolean;
}

/** Output for verify_fix tool */
export interface VerifyFixOutput {
  status: 'passed' | 'failed' | 'dry_run_allowed' | 'dry_run_denied' | 'pending_approval';
  approvalId?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  executionTimeMs?: number;
  policyReason?: string;
  proposedCommand?: string;
  parsed?: { binary: string; args: string[] };
  risk?: Risk;
  requiresHostConfirmation?: boolean;
  executedByServer?: boolean;
}

/** Input for list_memory_stats tool */
export interface MemoryStatsInput {
  repositoryId?: string;
}

/** Output for list_memory_stats tool */
export interface MemoryStatsOutput {
  totalRecords: number;
  exactFingerprints: number;
  /** @deprecated Use successfulVerificationsCount instead */
  verifiedFixesCount: number;
  successfulVerificationsCount: number;
  failedVerificationsCount: number;
  unverifiedRecordsCount: number;
  unverifiedCount: number;
  quarantinedCount: number;
  pendingApprovalsCount: number;
  normalizerVersion: number;
  schemaVersion: number;
}

/* ========================================================================== */
/* Dashboard Bridge Contracts                                                 */
/* ========================================================================== */

export interface DashboardRecordFilter {
  query?: string;
  status?: VerificationStatus;
  isQuarantined?: boolean;
  limit?: number;
  offset?: number;
}

export interface DashboardRecordListResponse {
  total: number;
  records: MemoryRecord[];
}

export interface ApprovalItem {
  approvalId: string;
  createdAt: string;
  requestedCommand: string;
  recordId?: string;
  risk: Risk;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface ApprovalResolutionRequest {
  approvalId: string;
  decision: 'approve' | 'reject';
  resolvedBy: string;
  notes?: string;
}

/* ========================================================================== */
/* Verification Event Model (Phase 1 / F-01 + C-01)                          */
/* ========================================================================== */

/** Schema version for verification events file */
export const VERIFICATION_EVENTS_SCHEMA_VERSION = 1 as const;

/** A single verification outcome event stored in verification-events.jsonl */
export interface VerificationEvent {
  schemaVersion: 1;
  eventId: string; // unique event UUID
  attemptId: string; // idempotency key (same attempt = same ID)
  recordId: string; // references MemoryRecord.id
  repositoryId: string; // scopes the event to a repository
  outcome: 'passed' | 'failed';
  method: 'host_reported' | 'human_confirmed';
  recordedAt: string; // server ISO-8601 timestamp (authoritative)
  reportedAt?: string; // optional caller-provided ISO-8601 timestamp
  evidenceRef?: string; // optional bounded reference, never raw logs
  note?: string; // optional, redacted and size-limited
}

/** Derived per-record verification summary (computed from event history) */
export interface VerificationSummary {
  attemptCount: number;
  successCount: number;
  failureCount: number;
  latestOutcome: 'passed' | 'failed' | null;
  latestOutcomeAt: string | null;
  latestMethod: 'host_reported' | 'human_confirmed' | null;
  wilsonLowerBound: number | null;
}

/** Input for the new record_verification_outcome MCP tool */
export interface RecordVerificationOutcomeInput {
  recordId: string;
  attemptId: string;
  outcome: 'passed' | 'failed';
  method: 'host_reported' | 'human_confirmed';
  reportedAt?: string;
  evidenceRef?: string;
  note?: string;
}

/** Output for the new record_verification_outcome MCP tool */
export interface RecordVerificationOutcomeOutput {
  eventId: string;
  status: 'recorded' | 'duplicate_idempotent' | 'conflict_rejected';
  summary: VerificationSummary;
  message: string;
}
