/**
 * SQLite as rebuildable secondary index using node:sqlite DatabaseSync with FTS5.
 * ADR-003 compliant.
 *
 * Phase 2 hardening:
 *  - C-02: indexRecord() wraps relational + FTS5 ops in one SQLite SAVEPOINT so
 *          both succeed or both roll back; dirty flag set on any failure.
 *  - X-01: rebuildIndex() uses a single BEGIN IMMEDIATE transaction that includes
 *          all relational, FTS5, and metadata writes via private _indexRecordStatements().
 *  - F-03: reconcileWithCanonical() accepts an optional canonicalFilePath and
 *          hashes the file bytes (SHA-256) to detect same-count/same-ID edits.
 *          canonical_records_sha256, canonical_records_size, index_schema_version,
 *          and last_reconciled_at are stored in index_metadata.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { MemoryRecord } from '../types.js';
import { extractCommandFamily } from '../core/match.js';
import { buildFts5Query } from '../core/diagnostics.js';
import type { DiagnosticSignals } from '../core/diagnostics.js';

/** Bump this when the schema changes incompatibly; triggers a forced rebuild. */
const INDEX_SCHEMA_VERSION = 2;

/** Compute SHA-256 hex + byte size of a file; returns null if the file is absent. */
function hashFile(filePath: string): { sha256: string; size: number } | null {
  try {
    const bytes = fs.readFileSync(filePath);
    return {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      size: bytes.byteLength,
    };
  } catch {
    return null;
  }
}

export class SqliteIndex {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.init();
  }

  private init(): void {
    // Enable WAL mode for high concurrency
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        command TEXT NOT NULL,
        command_family TEXT NOT NULL,
        exit_code INTEGER NOT NULL,
        repository_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        normalizer_version INTEGER NOT NULL,
        is_quarantined INTEGER NOT NULL DEFAULT 0,
        data TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_records_fingerprint ON records(fingerprint);
      CREATE INDEX IF NOT EXISTS idx_records_repo_family ON records(repository_id, command_family);

      CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
        id UNINDEXED,
        normalized_output
      );

      CREATE TABLE IF NOT EXISTS index_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Ensure schema-version metadata exists so we can detect version bumps.
    this._setMetaIfAbsent('index_schema_version', String(INDEX_SCHEMA_VERSION));
  }

  // ─── Metadata helpers ────────────────────────────────────────────────────────

  private _getMeta(key: string): string | undefined {
    try {
      const row = this.db
        .prepare('SELECT value FROM index_metadata WHERE key = ?')
        .get(key) as { value: string } | undefined;
      return row?.value;
    } catch {
      return undefined;
    }
  }

  private _setMeta(key: string, value: string): void {
    try {
      this.db
        .prepare(
          `INSERT INTO index_metadata (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        )
        .run(key, value);
    } catch {
      // Non-fatal metadata write; swallow so callers degrade gracefully.
    }
  }

  private _setMetaIfAbsent(key: string, value: string): void {
    try {
      this.db
        .prepare(`INSERT OR IGNORE INTO index_metadata (key, value) VALUES (?, ?)`)
        .run(key, value);
    } catch {
      // Non-fatal
    }
  }

  // ─── Public metadata API ─────────────────────────────────────────────────────

  /**
   * Checks whether the secondary SQLite index has been flagged as dirty.
   */
  isIndexDirty(): boolean {
    return this._getMeta('is_dirty') === 'true';
  }

  /**
   * Marks the secondary index dirty or clean in index_metadata.
   */
  markIndexDirty(isDirty: boolean): void {
    this._setMeta('is_dirty', isDirty ? 'true' : 'false');
  }

  /**
   * Retrieves the count of records recorded during last reconciliation.
   */
  getLastReconciledRecordCount(): number {
    const v = this._getMeta('reconciled_count');
    return v ? parseInt(v, 10) : 0;
  }

  /**
   * Persists the count of records recorded during last reconciliation.
   */
  setLastReconciledRecordCount(count: number): void {
    this._setMeta('reconciled_count', String(count));
  }

  // ─── Indexing ─────────────────────────────────────────────────────────────────

  /**
   * Raw SQL ops for one record — called both by indexRecord() (which wraps in a
   * SAVEPOINT) and by rebuildIndex() (which includes these inside its own
   * BEGIN IMMEDIATE transaction, avoiding nested transactions entirely).
   */
  private _indexRecordStatements(record: MemoryRecord): void {
    const commandFamily = extractCommandFamily(record.command);
    const isQuarantined = record.poisoningFlag !== null ? 1 : 0;

    this.db
      .prepare(
        `INSERT OR REPLACE INTO records (
           id, fingerprint, command, command_family, exit_code, repository_id,
           created_at, normalizer_version, is_quarantined, data
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.fingerprint,
        record.command,
        commandFamily,
        record.exitCode,
        record.repositoryId,
        record.createdAt,
        record.normalizerVersion,
        isQuarantined,
        JSON.stringify(record),
      );

    // FTS5 — must succeed or the whole unit rolls back (no silent swallow).
    this.db.prepare('DELETE FROM records_fts WHERE id = ?').run(record.id);
    this.db
      .prepare('INSERT INTO records_fts (id, normalized_output) VALUES (?, ?)')
      .run(record.id, record.normalizedOutput);
  }

  /**
   * Indexes a single record.
   * C-02 / X-01 FIX: Both the relational INSERT and the FTS5 DELETE+INSERT are
   * wrapped in a SAVEPOINT so they succeed or roll back together.
   * On any failure the dirty flag is set and the error is re-thrown.
   */
  indexRecord(record: MemoryRecord): void {
    this.db.exec('SAVEPOINT sp_index_record');
    try {
      this._indexRecordStatements(record);
      this.db.exec('RELEASE SAVEPOINT sp_index_record');
    } catch (e) {
      try { this.db.exec('ROLLBACK TO SAVEPOINT sp_index_record'); } catch { /* best-effort */ }
      try { this.db.exec('RELEASE SAVEPOINT sp_index_record'); } catch { /* best-effort */ }
      this.markIndexDirty(true);
      throw e;
    }
  }

  /**
   * Rebuilds the SQLite index transactionally from an array of MemoryRecords.
   * X-01 FIX: Every relational INSERT, FTS5 write, dirty-flag write, and
   * count write happen inside ONE BEGIN IMMEDIATE transaction by calling
   * _indexRecordStatements() directly (no nested SAVEPOINTs).
   */
  rebuildIndex(
    records: MemoryRecord[],
    fingerprint?: { sha256: string; size: number } | null,
  ): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec('DELETE FROM records; DELETE FROM records_fts;');
      for (const record of records) {
        this._indexRecordStatements(record);
      }
      // Write all metadata inside the same transaction.
      this.db
        .prepare(`INSERT INTO index_metadata (key, value) VALUES ('is_dirty', 'false')
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .run();
      this.db
        .prepare(`INSERT INTO index_metadata (key, value) VALUES ('reconciled_count', ?)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .run(String(records.length));
      this.db
        .prepare(`INSERT INTO index_metadata (key, value) VALUES ('index_schema_version', ?)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .run(String(INDEX_SCHEMA_VERSION));
      this.db
        .prepare(`INSERT INTO index_metadata (key, value) VALUES ('last_reconciled_at', ?)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .run(new Date().toISOString());
      if (fingerprint) {
        this.db
          .prepare(`INSERT INTO index_metadata (key, value) VALUES ('canonical_records_sha256', ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
          .run(fingerprint.sha256);
        this.db
          .prepare(`INSERT INTO index_metadata (key, value) VALUES ('canonical_records_size', ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
          .run(String(fingerprint.size));
      }
      this.db.exec('COMMIT');
    } catch (e) {
      try { this.db.exec('ROLLBACK'); } catch { /* best-effort */ }
      this.markIndexDirty(true);
      throw e;
    }
  }

  /**
   * Reconciles the secondary SQLite projection against canonical records from JSONL.
   *
   * F-03 FIX: When canonicalFilePath is provided the file bytes are SHA-256 hashed
   * and compared against the stored fingerprint. A rebuild is triggered even when
   * record count and IDs match (catches silent in-place edits).
   *
   * Rebuild triggers (in order):
   *  1. Dirty flag is set
   *  2. Schema version mismatch
   *  3. Count mismatch
   *  4. Canonical file fingerprint mismatch (requires canonicalFilePath)
   *  5. Any canonical ID missing from SQLite
   */
  reconcileWithCanonical(
    canonicalRecords: MemoryRecord[],
    canonicalFilePath?: string,
  ): { rebuilt: boolean; syncedCount: number } {
    const isDirty = this.isIndexDirty();

    // Schema version check — force rebuild on version bump.
    const storedSchemaVersion = parseInt(this._getMeta('index_schema_version') ?? '0', 10);
    if (isDirty || storedSchemaVersion !== INDEX_SCHEMA_VERSION) {
      const fp = canonicalFilePath ? hashFile(canonicalFilePath) : null;
      this.rebuildIndex(canonicalRecords, fp);
      return { rebuilt: true, syncedCount: canonicalRecords.length };
    }

    const countRow = this.db.prepare('SELECT COUNT(*) as count FROM records').get() as
      | { count: number }
      | undefined;
    const sqliteCount = countRow?.count ?? 0;

    if (sqliteCount !== canonicalRecords.length) {
      const fp = canonicalFilePath ? hashFile(canonicalFilePath) : null;
      this.rebuildIndex(canonicalRecords, fp);
      return { rebuilt: true, syncedCount: canonicalRecords.length };
    }

    // F-03: fingerprint check — detect same-count/same-ID in-place edits.
    if (canonicalFilePath) {
      const currentFp = hashFile(canonicalFilePath);
      const storedSha = this._getMeta('canonical_records_sha256');
      if (currentFp && storedSha && currentFp.sha256 !== storedSha) {
        this.rebuildIndex(canonicalRecords, currentFp);
        return { rebuilt: true, syncedCount: canonicalRecords.length };
      }
      // No stored fingerprint yet — store it now for future comparisons.
      if (currentFp && !storedSha) {
        this._setMeta('canonical_records_sha256', currentFp.sha256);
        this._setMeta('canonical_records_size', String(currentFp.size));
      }
    }

    // ID membership check.
    const existingIds = new Set(
      (this.db.prepare('SELECT id FROM records').all() as { id: string }[]).map((r) => r.id),
    );
    let missingFound = false;
    for (const rec of canonicalRecords) {
      if (!existingIds.has(rec.id)) {
        missingFound = true;
        break;
      }
    }

    if (missingFound) {
      const fp = canonicalFilePath ? hashFile(canonicalFilePath) : null;
      this.rebuildIndex(canonicalRecords, fp);
      return { rebuilt: true, syncedCount: canonicalRecords.length };
    }

    // Index is consistent — update lightweight metadata without a full rebuild.
    this._setMeta('is_dirty', 'false');
    this._setMeta('reconciled_count', String(canonicalRecords.length));
    this._setMeta('last_reconciled_at', new Date().toISOString());
    if (canonicalFilePath) {
      const fp = hashFile(canonicalFilePath);
      if (fp) {
        this._setMeta('canonical_records_sha256', fp.sha256);
        this._setMeta('canonical_records_size', String(fp.size));
      }
    }
    return { rebuilt: false, syncedCount: canonicalRecords.length };
  }

  // ─── Query API ────────────────────────────────────────────────────────────────

  findByFingerprint(
    fingerprint: string,
    repositoryId?: string,
    commandFamily?: string,
    includeQuarantined = false,
  ): MemoryRecord | null {
    let sql = 'SELECT data FROM records WHERE fingerprint = ?';
    const params: (string | number)[] = [fingerprint];

    if (repositoryId) {
      sql += ' AND repository_id = ?';
      params.push(repositoryId);
    }
    if (commandFamily) {
      sql += ' AND command_family = ?';
      params.push(commandFamily);
    }
    if (!includeQuarantined) {
      sql += ' AND is_quarantined = 0';
    }
    sql += ' ORDER BY created_at DESC LIMIT 1';

    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params) as { data: string } | undefined;
    if (!row) {
      return null;
    }
    return JSON.parse(row.data) as MemoryRecord;
  }

  findById(id: string): MemoryRecord | null {
    const row = this.db.prepare('SELECT data FROM records WHERE id = ?').get(id) as
      | { data: string }
      | undefined;
    return row ? (JSON.parse(row.data) as MemoryRecord) : null;
  }

  /**
   * Fast candidates search using FTS5 BM25 or candidate fetch filtered by repo and command family.
   *
   * Phase 3 — F-02 FIX: accepts pre-built DiagnosticSignals so the caller (memoryService)
   * can extract high-signal tokens from the whole log before querying. The old plain
   * searchQuery string is kept as a fallback for backward compatibility.
   */
  findCandidates(
    repositoryId: string,
    commandFamily: string,
    searchQuery?: string,
    limit = 20,
    includeQuarantined = false,
    diagnosticSignals?: DiagnosticSignals,
  ): { records: MemoryRecord[]; candidateSource: 'fts5_bm25' | 'relational_scan' } {
    // F-02 FIX: prefer pre-built DiagnosticSignals FTS query; fall back to legacy searchQuery
    const ftsQuery = diagnosticSignals
      ? buildFts5Query(diagnosticSignals)
      : buildLegacyFtsQuery(searchQuery);

    if (ftsQuery) {
      try {
        let ftsSql = `
          SELECT r.data
          FROM records_fts f
          JOIN records r ON f.id = r.id
          WHERE records_fts MATCH ?
            AND r.repository_id = ?
            AND r.command_family = ?
        `;
        if (!includeQuarantined) {
          ftsSql += ' AND r.is_quarantined = 0';
        }
        ftsSql += ' ORDER BY bm25(records_fts) LIMIT ?';

        const rows = this.db.prepare(ftsSql).all(ftsQuery, repositoryId, commandFamily, limit) as {
          data: string;
        }[];
        if (rows.length > 0) {
          return {
            records: rows.map((row) => JSON.parse(row.data) as MemoryRecord),
            candidateSource: 'fts5_bm25',
          };
        }
      } catch {
        // FTS query failed — fall through to relational scan
      }
    }

    // Relational fallback filtered by repo and command family
    let sql = 'SELECT data FROM records WHERE repository_id = ? AND command_family = ?';
    if (!includeQuarantined) {
      sql += ' AND is_quarantined = 0';
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';

    const rows = this.db.prepare(sql).all(repositoryId, commandFamily, limit) as { data: string }[];
    return {
      records: rows.map((row) => JSON.parse(row.data) as MemoryRecord),
      candidateSource: 'relational_scan',
    };
  }

  getStats(repositoryId?: string): {
    total: number;
    exactFingerprints: number;
    quarantined: number;
    verifiedCount: number;
    pendingApprovals: number;
  } {
    const whereClause = repositoryId ? 'WHERE repository_id = ?' : '';
    const params = repositoryId ? [repositoryId] : [];

    const countSql = `
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT fingerprint) as distinctFps,
        SUM(is_quarantined) as quarantined,
        SUM(CASE WHEN json_extract(data, '$.verification.status') IN ('passed','failed') THEN 1 ELSE 0 END) as verifiedCount
      FROM records ${whereClause}
    `;

    const row = (
      repositoryId ? this.db.prepare(countSql).get(...params) : this.db.prepare(countSql).get()
    ) as
      | {
          total: number;
          distinctFps: number;
          quarantined: number | null;
          verifiedCount: number | null;
        }
      | undefined;

    return {
      total: row?.total ?? 0,
      exactFingerprints: row?.distinctFps ?? 0,
      quarantined: row?.quarantined ?? 0,
      verifiedCount: row?.verifiedCount ?? 0,
      pendingApprovals: 0, // approvals live in JSONL; count is always 0 from SQLite
    };
  }

  listRecentIds(limit: number): string[] {
    const rows = this.db
      .prepare('SELECT id FROM records ORDER BY created_at DESC LIMIT ?')
      .all(limit) as { id: string }[];
    return rows.map((r) => r.id);
  }

  close(): void {
    this.db.close();
  }
}

/** Legacy FTS5 query builder from raw searchQuery string (first-10-token strategy). */
function buildLegacyFtsQuery(searchQuery?: string): string | null {
  if (!searchQuery) return null;
  const tokens = searchQuery
    .replace(/[^a-zA-Z0-9_\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .slice(0, 10);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t}"`).join(' OR ');
}
