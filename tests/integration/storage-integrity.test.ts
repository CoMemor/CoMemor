/**
 * Phase 2 storage integrity tests.
 *
 * Covers:
 *  - F-03: fingerprint-based reconciliation (same count/IDs, mutated content → rebuild)
 *  - C-02: indexRecord() atomicity (relational + FTS5 together)
 *  - X-01: rebuildIndex() single-transaction boundary
 *  - C-03: corrupt JSONL recovery report (no raw content in log)
 *  - X-04: no raw secret exposure in corrupt-line log
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { SqliteIndex } from '../../src/storage/index.js';
import { JsonlStorage } from '../../src/storage/jsonl.js';
import type { MemoryRecord } from '../../src/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'comemor-ph2-'));
}

function makeRecord(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: `rec-${Math.random().toString(36).slice(2)}`,
    fingerprint: `fp-${Math.random().toString(36).slice(2)}`,
    command: 'npm test',
    normalizedOutput: 'all tests pass',
    exitCode: 0,
    repositoryId: 'test-repo',
    createdAt: new Date().toISOString(),
    normalizerVersion: 1,
    poisoningFlag: null,
    verification: { status: 'unverified', attempts: 0 },
    fix: null,
    ...overrides,
  } as MemoryRecord;
}

/** Capture stderr writes produced during the callback. */
async function captureStderr(fn: () => Promise<void> | void): Promise<string[]> {
  const lines: string[] = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  };
  try {
    await fn();
  } finally {
    process.stderr.write = orig;
  }
  return lines;
}

// ─── F-03: fingerprint-based reconciliation ───────────────────────────────────

describe('F-03 — fingerprint-based reconciliation', () => {
  let dir: string;
  let dbPath: string;
  let jsonlPath: string;

  beforeEach(() => {
    dir = tmpDir();
    dbPath = path.join(dir, 'index.db');
    jsonlPath = path.join(dir, 'records.jsonl');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does NOT rebuild when file content is unchanged', () => {
    const rec = makeRecord();
    fs.writeFileSync(jsonlPath, JSON.stringify(rec) + '\n', 'utf8');

    const idx = new SqliteIndex(dbPath);
    // First reconcile — will rebuild because schema version not stored yet
    const r1 = idx.reconcileWithCanonical([rec], jsonlPath);
    expect(r1.rebuilt).toBe(true);

    // Second reconcile — same file bytes, should NOT rebuild
    const r2 = idx.reconcileWithCanonical([rec], jsonlPath);
    expect(r2.rebuilt).toBe(false);
    idx.close();
  });

  it('rebuilds when file content changes even if count and IDs are the same', () => {
    const rec = makeRecord({ id: 'stable-id', normalizedOutput: 'original output' });
    fs.writeFileSync(jsonlPath, JSON.stringify(rec) + '\n', 'utf8');

    const idx = new SqliteIndex(dbPath);
    // Seed the fingerprint
    idx.reconcileWithCanonical([rec], jsonlPath);

    // Mutate the file in-place (same record ID, different content)
    const mutated = { ...rec, normalizedOutput: 'MUTATED output' };
    fs.writeFileSync(jsonlPath, JSON.stringify(mutated) + '\n', 'utf8');

    const r2 = idx.reconcileWithCanonical([mutated], jsonlPath);
    expect(r2.rebuilt).toBe(true);
    idx.close();
  });

  it('rebuilds when record is reordered (file bytes differ)', () => {
    const r1 = makeRecord({ id: 'id-aaa' });
    const r2 = makeRecord({ id: 'id-bbb' });

    fs.writeFileSync(jsonlPath, JSON.stringify(r1) + '\n' + JSON.stringify(r2) + '\n', 'utf8');
    const idx = new SqliteIndex(dbPath);
    idx.reconcileWithCanonical([r1, r2], jsonlPath);

    // Reorder
    fs.writeFileSync(jsonlPath, JSON.stringify(r2) + '\n' + JSON.stringify(r1) + '\n', 'utf8');
    const result = idx.reconcileWithCanonical([r2, r1], jsonlPath);
    expect(result.rebuilt).toBe(true);
    idx.close();
  });

  it('forces rebuild when schema version stored is old', () => {
    const rec = makeRecord();
    const idx = new SqliteIndex(dbPath);
    // Manually downgrade schema version in metadata
    (idx as unknown as { _setMeta: (k: string, v: string) => void })._setMeta(
      'index_schema_version',
      '1',
    );
    const result = idx.reconcileWithCanonical([rec]);
    expect(result.rebuilt).toBe(true);
    idx.close();
  });
});

// ─── C-02 / X-01: indexRecord atomicity ──────────────────────────────────────

describe('C-02 / X-01 — indexRecord atomicity via SAVEPOINT', () => {
  let dir: string;
  let idx: SqliteIndex;

  beforeEach(() => {
    dir = tmpDir();
    idx = new SqliteIndex(path.join(dir, 'index.db'));
  });

  afterEach(() => {
    try { idx.close(); } catch { /* already closed */ }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('indexes a valid record with both relational and FTS5 rows', () => {
    const rec = makeRecord({ id: 'atomic-rec', normalizedOutput: 'hello world test' });
    idx.indexRecord(rec);

    const found = idx.findById('atomic-rec');
    expect(found?.id).toBe('atomic-rec');

    // FTS5 — verify via findCandidates (Phase 3: returns { records, candidateSource })
    const { records: candidates } = idx.findCandidates('test-repo', 'npm', 'hello');
    expect(candidates.some((c) => c.id === 'atomic-rec')).toBe(true);
  });

  it('marks index dirty when indexRecord fails', () => {
    // Corrupt the FTS5 table by closing and re-opening without initializing properly
    // Simplest way: drop the FTS table inside the same connection to force failure
    const db = (idx as unknown as { db: { exec: (s: string) => void } }).db;
    db.exec('DROP TABLE records_fts');

    const rec = makeRecord({ id: 'fail-rec' });
    expect(() => idx.indexRecord(rec)).toThrow();
    expect(idx.isIndexDirty()).toBe(true);
  });
});

// ─── X-01: rebuildIndex single-transaction ────────────────────────────────────

describe('X-01 — rebuildIndex single-transaction metadata write', () => {
  let dir: string;

  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('writes is_dirty=false and reconciled_count inside the same transaction as records', () => {
    const recs = [makeRecord(), makeRecord()];
    const idx = new SqliteIndex(path.join(dir, 'index.db'));
    idx.rebuildIndex(recs);

    expect(idx.isIndexDirty()).toBe(false);
    expect(idx.getLastReconciledRecordCount()).toBe(2);
    idx.close();
  });

  it('leaves index dirty if rebuild throws mid-way', () => {
    const idx = new SqliteIndex(path.join(dir, 'index.db'));
    // Drop FTS table to force failure during rebuild
    const db = (idx as unknown as { db: { exec: (s: string) => void } }).db;
    db.exec('DROP TABLE records_fts');

    expect(() => idx.rebuildIndex([makeRecord()])).toThrow();
    expect(idx.isIndexDirty()).toBe(true);
    idx.close();
  });
});

// ─── C-03 / X-04: corrupt JSONL — no raw content in log ─────────────────────

describe('C-03 / X-04 — corrupt JSONL recovery: no raw content in stderr log', () => {
  let dir: string;

  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('skips corrupted line, parses valid lines, logs hash not raw content', async () => {
    const filePath = path.join(dir, 'records.jsonl');
    const SECRET = 'SECRET_API_KEY=abc123xyz';
    const goodRec = makeRecord({ id: 'good-rec' });

    // Write: valid, corrupted (with secret), valid
    fs.writeFileSync(
      filePath,
      JSON.stringify(goodRec) + '\n' + SECRET + '\n' + JSON.stringify(makeRecord({ id: 'good-rec-2' })) + '\n',
      'utf8',
    );

    const storage = new JsonlStorage(filePath);
    const stderrLines: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: unknown) => {
      stderrLines.push(String(chunk));
      return true;
    };

    let records: MemoryRecord[] = [];
    try {
      records = storage.readAllSync();
    } finally {
      process.stderr.write = origWrite;
    }

    // Two valid records returned
    expect(records).toHaveLength(2);
    expect(records[0]?.id).toBe('good-rec');

    // One warning logged
    expect(stderrLines).toHaveLength(1);
    const warn = JSON.parse(stderrLines[0]!);
    expect(warn.event).toBe('jsonl_corrupted_line');
    expect(warn.lineNumber).toBe(2);

    // Must have hash, must NOT have raw content
    expect(warn.corruptedLineHash).toBeDefined();
    expect(typeof warn.corruptedLineHash).toBe('string');
    expect(warn.corruptedLineHash).toHaveLength(64); // SHA-256 hex
    expect(warn).not.toHaveProperty('preview');
    expect(JSON.stringify(warn)).not.toContain(SECRET);

    // Verify hash is correct
    const expectedHash = createHash('sha256').update(SECRET).digest('hex');
    expect(warn.corruptedLineHash).toBe(expectedHash);

    // Original file is byte-for-byte preserved
    const afterContent = fs.readFileSync(filePath, 'utf8');
    expect(afterContent).toContain(SECRET);
  });

  it('async readAll also logs hash not raw content', async () => {
    const filePath = path.join(dir, 'records.jsonl');
    const BAD_LINE = 'not-valid-json { corrupted';

    fs.writeFileSync(filePath, BAD_LINE + '\n', 'utf8');
    const storage = new JsonlStorage(filePath);

    const lines = await captureStderr(async () => {
      await storage.readAll();
    });

    expect(lines).toHaveLength(1);
    const warn = JSON.parse(lines[0]!);
    expect(warn.corruptedLineHash).toBeDefined();
    expect(warn).not.toHaveProperty('preview');
    expect(JSON.stringify(warn)).not.toContain(BAD_LINE);
  });
});
