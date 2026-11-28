/**
 * Read-only SQLite database and JSONL storage reader for Dashboard Bridge.
 * Hard invariant: Opened in readOnly mode. No commands or shell executions.
 *
 * Design note: getDb() reopens the connection on every call-group so that
 * WAL checkpoints written by the MCP server process are immediately visible.
 * SQLite read-only connections do not block writers and are cheap to open.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export interface RecordSummary {
  id: string;
  fingerprint: string;
  command: string;
  commandFamily: string;
  exitCode: number;
  repositoryId: string;
  createdAt: string;
  normalizerVersion: number;
  isQuarantined: boolean;
  wilsonLowerBound: number | null;
  verificationStatus: string;
  fixExplanation: string;
}

export interface PendingApproval {
  approvalId: string;
  createdAt: string;
  requestedCommand: string;
  recordId: string | null;
  risk: {
    level: string;
    reasons: string[];
  };
  reason: string;
  status: string;
}

export interface ResolvedApproval {
  approvalId: string;
  command?: string | undefined;
  decision: 'approve' | 'deny';
  operatorNotes?: string | undefined;
  resolvedAt: string;
}

interface VerificationEventRaw {
  attemptId?: string;
  recordId?: string;
  repositoryId?: string;
  outcome?: 'passed' | 'failed';
  method?: string;
  recordedAt?: string;
}

interface VerificationEventSummary {
  attemptCount: number;
  successCount: number;
  failureCount: number;
  latestOutcome: 'passed' | 'failed' | null;
  latestOutcomeAt: string | null;
  latestMethod: string | null;
  wilsonLowerBound: number | null;
  status: string;
}

/**
 * Computes 95% Wilson-score lower bound matching src/core/staleness.ts.
 * Returns null when total trials is 0.
 */
function calculateWilsonScoreLowerBound(successes: number, total: number, z = 1.96): number | null {
  if (total <= 0 || successes < 0 || successes > total) {
    return null;
  }
  const p = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = p + z2 / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  const lowerBound = Math.max(0, (center - spread) / denominator);
  return Number(lowerBound.toFixed(4));
}

export class BridgeStorage {
  private memoryDir: string;
  private dbPath: string;

  constructor(memoryDir: string) {
    this.memoryDir = memoryDir;
    this.dbPath = path.join(memoryDir, 'index.db');
  }

  /**
   * Open a read-only database connection.
   * Exposed as public/internal helper so security tests can verify read-only invariants.
   */
  public getDb(): DatabaseSync | null {
    if (!fs.existsSync(this.dbPath)) return null;
    try {
      return new DatabaseSync(this.dbPath, { readOnly: true });
    } catch (err) {
      console.error('[bridge] Failed to open SQLite read-only:', err);
      return null;
    }
  }

  /**
   * Execute query with an automatically managed connection that is closed immediately after,
   * guaranteeing zero locks and immediate visibility of newly flushed WAL records.
   */
  private withDb<T>(fn: (db: DatabaseSync) => T, fallback: T): T {
    const db = this.getDb();
    if (!db) return fallback;
    try {
      return fn(db);
    } finally {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Safe close helper retained for interface compatibility.
   */
  public close(): void {
    // Stateless per-query connection management; no-op
  }

  /**
   * Read-only aggregation of verification-events.jsonl grouped by repositoryId::recordId.
   * Deduplicates by attemptId (first event wins), matching VerificationEventStore semantics.
   */
  private loadVerificationSummaries(): Map<string, VerificationEventSummary> {
    const summaries = new Map<string, VerificationEventSummary>();
    const eventsPath = path.join(this.memoryDir, 'verification-events.jsonl');
    if (!fs.existsSync(eventsPath)) return summaries;

    let content = '';
    try {
      content = fs.readFileSync(eventsPath, 'utf8');
    } catch {
      return summaries;
    }

    const grouped = new Map<string, VerificationEventRaw[]>();
    const seenAttemptsByRecord = new Map<string, Set<string>>();

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const ev = JSON.parse(trimmed) as VerificationEventRaw;
        if (!ev.recordId || !ev.repositoryId || !ev.attemptId) continue;
        if (ev.outcome !== 'passed' && ev.outcome !== 'failed') continue;

        const key = `${ev.repositoryId}::${ev.recordId}`;
        let seen = seenAttemptsByRecord.get(key);
        if (!seen) {
          seen = new Set<string>();
          seenAttemptsByRecord.set(key, seen);
        }
        if (seen.has(ev.attemptId)) continue;
        seen.add(ev.attemptId);

        const list = grouped.get(key) ?? [];
        list.push(ev);
        grouped.set(key, list);
      } catch {
        // Skip malformed lines gracefully without altering files
      }
    }

    for (const [key, events] of grouped.entries()) {
      const attemptCount = events.length;
      const successCount = events.filter((e) => e.outcome === 'passed').length;
      const failureCount = events.filter((e) => e.outcome === 'failed').length;

      const sorted = [...events].sort((a, b) =>
        (a.recordedAt ?? '').localeCompare(b.recordedAt ?? ''),
      );
      const latest = sorted[sorted.length - 1];
      const latestOutcome = latest?.outcome ?? null;
      const wilsonLowerBound =
        attemptCount > 0 ? calculateWilsonScoreLowerBound(successCount, attemptCount) : null;

      let status = 'unknown';
      if (latestOutcome === 'passed') {
        status = 'verified_success';
      } else if (latestOutcome === 'failed') {
        status = 'failed';
      } else if (successCount > 0) {
        status = 'verified_success';
      }

      summaries.set(key, {
        attemptCount,
        successCount,
        failureCount,
        latestOutcome,
        latestOutcomeAt: latest?.recordedAt ?? null,
        latestMethod: latest?.method ?? null,
        wilsonLowerBound,
        status,
      });
    }

    return summaries;
  }

  getStats(repoId?: string) {
    const verificationSummaries = this.loadVerificationSummaries();

    return this.withDb(
      (db) => {
        const whereClause = repoId ? 'WHERE repository_id = ?' : '';
        const params: (string | number)[] = repoId ? [repoId] : [];

        const totalRow = db
          .prepare(`SELECT COUNT(*) as count FROM records ${whereClause}`)
          .get(...params) as { count: number } | undefined;
        const total = totalRow?.count ?? 0;

        const fpRow = db
          .prepare(`SELECT COUNT(DISTINCT fingerprint) as count FROM records ${whereClause}`)
          .get(...params) as { count: number } | undefined;
        const exactFingerprints = fpRow?.count ?? 0;

        const quarRow = db
          .prepare(
            `SELECT COUNT(*) as count FROM records ${repoId ? 'WHERE repository_id = ? AND is_quarantined = 1' : 'WHERE is_quarantined = 1'}`,
          )
          .get(...params) as { count: number } | undefined;
        const quarantinedCount = quarRow?.count ?? 0;

        const allRecordsRows = db
          .prepare(`SELECT id, repository_id, created_at, data FROM records ${whereClause}`)
          .all(...params) as Array<{
          id: string;
          repository_id: string;
          created_at: string;
          data: string;
        }>;

        let verifiedCount = 0;
        let staleCount = 0;
        let wilsonSum = 0;
        let recordsWithWilson = 0;
        const now = Date.now();
        const ageDist = { under1h: 0, under24h: 0, under7d: 0, over7d: 0 };

        for (const r of allRecordsRows) {
          const ageMs = now - new Date(r.created_at).getTime();
          if (ageMs < 3600 * 1000) ageDist.under1h++;
          else if (ageMs < 86400 * 1000) ageDist.under24h++;
          else if (ageMs < 7 * 86400 * 1000) ageDist.under7d++;
          else ageDist.over7d++;

          const summary = verificationSummaries.get(`${r.repository_id}::${r.id}`);

          try {
            const parsed = JSON.parse(r.data);
            const isVerified = summary
              ? summary.successCount > 0
              : parsed.verification?.status === 'verified_success' ||
                parsed.verification?.status === 'passed';
            if (isVerified) verifiedCount++;

            if (parsed.staleness?.isStale === true) staleCount++;

            const wilson =
              summary?.wilsonLowerBound ?? parsed.verification?.wilsonLowerBound ?? null;
            if (wilson !== null && wilson !== undefined) {
              wilsonSum += wilson;
              recordsWithWilson++;
            }
          } catch {
            // ignore parse error
          }
        }

        const avgWilson =
          recordsWithWilson > 0
            ? Number((wilsonSum / recordsWithWilson).toFixed(4))
            : verifiedCount > 0 && total > 0
              ? Number((verifiedCount / total).toFixed(4))
              : 0;

        return {
          totalRecords: total,
          exactFingerprints,
          quarantinedCount,
          verifiedCount,
          staleCount,
          successRate: avgWilson,
          ageDistribution: ageDist,
        };
      },
      {
        totalRecords: 0,
        exactFingerprints: 0,
        quarantinedCount: 0,
        verifiedCount: 0,
        staleCount: 0,
        successRate: 0,
        ageDistribution: { under1h: 0, under24h: 0, under7d: 0, over7d: 0 },
      },
    );
  }

  getRecords(filters: {
    repositoryId?: string | undefined;
    commandFamily?: string | undefined;
    isQuarantined?: boolean | undefined;
    query?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }) {
    const verificationSummaries = this.loadVerificationSummaries();

    return this.withDb((db) => {
      const conditions: string[] = [];
      const params: (string | number)[] = [];

      if (filters.repositoryId) {
        conditions.push('repository_id = ?');
        params.push(filters.repositoryId);
      }
      if (filters.commandFamily) {
        conditions.push('command_family = ?');
        params.push(filters.commandFamily);
      }
      if (filters.isQuarantined !== undefined) {
        conditions.push('is_quarantined = ?');
        params.push(filters.isQuarantined ? 1 : 0);
      }
      if (filters.query) {
        conditions.push('(command LIKE ? OR data LIKE ?)');
        params.push(`%${filters.query}%`, `%${filters.query}%`);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = filters.limit ?? 100;
      const offset = filters.offset ?? 0;

      const sql = `SELECT id, fingerprint, command, command_family, exit_code, repository_id, created_at, normalizer_version, is_quarantined, data FROM records ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const rows = db.prepare(sql).all(...params) as Array<{
        id: string;
        fingerprint: string;
        command: string;
        command_family: string;
        exit_code: number;
        repository_id: string;
        created_at: string;
        normalizer_version: number;
        is_quarantined: number;
        data: string;
      }>;

      return rows.map((row) => {
        let parsedData: {
          verification?: { wilsonLowerBound?: number | null; status?: string };
          fix?: { explanation?: string; commands?: string[] };
          poisoningFlag?: {
            raisedAt: string;
            reason: string;
            status: 'reviewed' | 'dismissed' | 'confirmed';
          } | null;
          provenance?: unknown;
        } = {};
        try {
          parsedData = JSON.parse(row.data) as typeof parsedData;
        } catch {}

        const summary = verificationSummaries.get(`${row.repository_id}::${row.id}`);
        const wilsonLowerBound =
          summary?.wilsonLowerBound ?? parsedData.verification?.wilsonLowerBound ?? null;
        const verificationStatus =
          summary?.status ?? parsedData.verification?.status ?? 'unverified';

        return {
          id: row.id,
          fingerprint: row.fingerprint,
          command: row.command,
          commandFamily: row.command_family,
          exitCode: row.exit_code,
          repositoryId: row.repository_id,
          createdAt: row.created_at,
          normalizerVersion: row.normalizer_version,
          isQuarantined: row.is_quarantined === 1,
          wilsonLowerBound,
          verificationStatus,
          fixExplanation: parsedData.fix?.explanation ?? '',
          fixCommands: parsedData.fix?.commands ?? [],
          poisoningFlag: parsedData.poisoningFlag ?? null,
          provenance: parsedData.provenance ?? {},
        };
      });
    }, []);
  }

  getRecordById(id: string): (Record<string, unknown> & { command?: string }) | null {
    const verificationSummaries = this.loadVerificationSummaries();

    return this.withDb((db) => {
      const row = db
        .prepare(
          'SELECT command_family, repository_id, is_quarantined, data FROM records WHERE id = ?',
        )
        .get(id) as
        | { command_family: string; repository_id: string; is_quarantined: number; data: string }
        | undefined;
      if (!row) return null;
      try {
        const parsed = JSON.parse(row.data) as Record<string, unknown>;
        const summary = verificationSummaries.get(`${row.repository_id}::${id}`);
        const legacyVerification = parsed.verification as
          | {
              status?: string;
              verifiedAt?: string | null;
              method?: string;
              wilsonLowerBound?: number | null;
            }
          | undefined;

        const verificationStatus = summary?.status ?? legacyVerification?.status ?? 'unknown';
        const wilsonLowerBound =
          summary?.wilsonLowerBound ?? legacyVerification?.wilsonLowerBound ?? null;

        return {
          ...parsed,
          commandFamily: row.command_family,
          isQuarantined: row.is_quarantined === 1,
          wilsonLowerBound,
          verificationStatus,
          verification: {
            status: verificationStatus,
            verifiedAt: summary?.latestOutcomeAt ?? legacyVerification?.verifiedAt ?? null,
            method: summary?.latestMethod ?? legacyVerification?.method ?? 'unverified',
            wilsonLowerBound,
            attemptCount: summary?.attemptCount ?? 0,
            successCount: summary?.successCount ?? 0,
            failureCount: summary?.failureCount ?? 0,
          },
        };
      } catch {
        return null;
      }
    }, null);
  }

  getPendingApprovals(): PendingApproval[] {
    const pendingPath = path.join(this.memoryDir, 'approvals-pending.jsonl');
    const resolvedPath = path.join(this.memoryDir, 'approvals-resolved.jsonl');

    const resolvedIds = new Set<string>();
    if (fs.existsSync(resolvedPath)) {
      const resolvedContent = fs.readFileSync(resolvedPath, 'utf8');
      for (const line of resolvedContent.split('\n')) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          if (item.approvalId) resolvedIds.add(item.approvalId);
        } catch {}
      }
    }

    if (!fs.existsSync(pendingPath)) return [];

    const results: PendingApproval[] = [];
    const pendingContent = fs.readFileSync(pendingPath, 'utf8');
    for (const line of pendingContent.split('\n')) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line) as PendingApproval;
        if (item.approvalId && !resolvedIds.has(item.approvalId)) {
          results.push(item);
        }
      } catch {}
    }

    return results;
  }

  resolveApproval(
    approvalId: string,
    decision: 'approve' | 'deny',
    operatorNotes?: string,
  ): { success: boolean; resolvedAt: string } {
    const resolvedPath = path.join(this.memoryDir, 'approvals-resolved.jsonl');
    const pending = this.getPendingApprovals().find((a) => a.approvalId === approvalId);

    const record: ResolvedApproval = {
      approvalId,
      command: pending?.requestedCommand,
      decision,
      operatorNotes: operatorNotes ?? '',
      resolvedAt: new Date().toISOString(),
    };

    fs.appendFileSync(resolvedPath, JSON.stringify(record) + '\n', 'utf8');
    return { success: true, resolvedAt: record.resolvedAt };
  }
}
