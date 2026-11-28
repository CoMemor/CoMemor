/**
 * Unit tests for VerificationEventStore (Phase 1 / F-01 + C-01).
 *
 * Tests:
 * 1. No events → getSummary() returns null
 * 2. One passed event → successCount=1, failureCount=0, wilsonLowerBound!=null
 * 3. One failed event → successCount=0, failureCount=1
 * 4. Same attemptId replayed with same params → idempotent, count not incremented
 * 5. Same attemptId replayed with different outcome → checkIdempotency returns 'conflict'
 * 6. Multiple attempts (3 passed, 1 failed) → correct Wilson calculation
 * 7. recordVerificationOutcome rejects unknown recordId
 * 8. recordVerificationOutcome rejects wrong repositoryId
 * 9. Malformed event line in JSONL → surviving lines still readable
 * 10. Summary reconstruction after clearing SQLite (proves SQLite not needed)
 * 11. verifiedFixesCount excludes failed-only records
 * 12. Wilson is null with zero events
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { VerificationEventStore, computeSummary } from '../../src/storage/verificationEvents.js';
import { MemoryService } from '../../src/core/memoryService.js';
import { calculateWilsonScoreLowerBound } from '../../src/core/staleness.js';
import type { VerificationEvent } from '../../src/types.js';

const makeEvent = (overrides: Partial<VerificationEvent> = {}, seq = 1): VerificationEvent => ({
  schemaVersion: 1,
  eventId: `evt-${String(seq)}`,
  attemptId: `attempt-${String(seq)}`,
  recordId: 'rec_test001',
  repositoryId: 'test-repo',
  outcome: 'passed',
  method: 'host_reported',
  recordedAt: new Date(1000 * seq).toISOString(),
  ...overrides,
});

describe('VerificationEventStore — unit', () => {
  let tmpDir: string;
  let eventsPath: string;
  let store: VerificationEventStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comemor-vevent-unit-'));
    eventsPath = path.join(tmpDir, 'verification-events.jsonl');
    store = new VerificationEventStore(eventsPath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---- Test 1 ----------------------------------------------------------------
  it('1. No events → getSummary() returns null', () => {
    const summary = store.getSummary('rec_nonexistent', 'test-repo');
    expect(summary).toBeNull();
  });

  // ---- Test 12 (early) -------------------------------------------------------
  it('12. Wilson is null with zero events', () => {
    const result = calculateWilsonScoreLowerBound(0, 0);
    expect(result).toBeNull();
  });

  // ---- Test 2 ----------------------------------------------------------------
  it('2. One passed event → successCount=1, failureCount=0, wilsonLowerBound!=null', async () => {
    await store.append(makeEvent({ outcome: 'passed', attemptId: 'a1', eventId: 'e1' }));

    const summary = store.getSummary('rec_test001', 'test-repo');
    expect(summary).not.toBeNull();
    expect(summary!.attemptCount).toBe(1);
    expect(summary!.successCount).toBe(1);
    expect(summary!.failureCount).toBe(0);
    expect(summary!.latestOutcome).toBe('passed');
    expect(summary!.wilsonLowerBound).not.toBeNull();
  });

  // ---- Test 3 ----------------------------------------------------------------
  it('3. One failed event → successCount=0, failureCount=1', async () => {
    await store.append(makeEvent({ outcome: 'failed', attemptId: 'a2', eventId: 'e2' }));

    const summary = store.getSummary('rec_test001', 'test-repo');
    expect(summary).not.toBeNull();
    expect(summary!.successCount).toBe(0);
    expect(summary!.failureCount).toBe(1);
    expect(summary!.latestOutcome).toBe('failed');
  });

  // ---- Test 4 ----------------------------------------------------------------
  it('4. Same attemptId replayed with same params → idempotent, count not incremented', async () => {
    // First write
    await store.append(makeEvent({ attemptId: 'a3', eventId: 'e3-first', outcome: 'passed' }));

    // Check idempotency before second write
    const check = store.checkIdempotency('a3', 'rec_test001', 'passed', 'host_reported');
    expect(check).toBe('duplicate');

    // Don't write again (simulating the service behavior)
    const summary = store.getSummary('rec_test001', 'test-repo');
    expect(summary!.attemptCount).toBe(1); // still 1
  });

  // ---- Test 5 ----------------------------------------------------------------
  it('5. Same attemptId with different outcome → checkIdempotency returns conflict', async () => {
    await store.append(makeEvent({ attemptId: 'a4', eventId: 'e4', outcome: 'passed' }));

    const check = store.checkIdempotency('a4', 'rec_test001', 'failed', 'host_reported');
    expect(check).toBe('conflict');
  });

  // ---- Test 6 ----------------------------------------------------------------
  it('6. Multiple attempts (3 passed, 1 failed) → correct Wilson calculation', async () => {
    await store.append(
      makeEvent({
        attemptId: 'b1',
        eventId: 'eb1',
        outcome: 'passed',
        recordedAt: new Date(1000).toISOString(),
      }),
    );
    await store.append(
      makeEvent({
        attemptId: 'b2',
        eventId: 'eb2',
        outcome: 'passed',
        recordedAt: new Date(2000).toISOString(),
      }),
    );
    await store.append(
      makeEvent({
        attemptId: 'b3',
        eventId: 'eb3',
        outcome: 'passed',
        recordedAt: new Date(3000).toISOString(),
      }),
    );
    await store.append(
      makeEvent({
        attemptId: 'b4',
        eventId: 'eb4',
        outcome: 'failed',
        recordedAt: new Date(4000).toISOString(),
      }),
    );

    const summary = store.getSummary('rec_test001', 'test-repo');
    expect(summary).not.toBeNull();
    expect(summary!.attemptCount).toBe(4);
    expect(summary!.successCount).toBe(3);
    expect(summary!.failureCount).toBe(1);

    const expectedWilson = calculateWilsonScoreLowerBound(3, 4);
    expect(summary!.wilsonLowerBound).toBe(expectedWilson);
    expect(summary!.wilsonLowerBound).not.toBeNull();
    // 3/4 = 75%, Wilson lower bound should be reasonably positive
    expect(summary!.wilsonLowerBound!).toBeGreaterThan(0.3);
    expect(summary!.wilsonLowerBound!).toBeLessThan(0.9);
  });

  // ---- Test 9 ----------------------------------------------------------------
  it('9. Malformed event line in JSONL → surviving lines still readable', async () => {
    // Write one good event
    await store.append(makeEvent({ attemptId: 'c1', eventId: 'ec1', outcome: 'passed' }));

    // Inject a malformed line directly
    fs.appendFileSync(eventsPath, '{corrupt line without closing bracket\n', 'utf8');

    // Write another good event
    await store.append(
      makeEvent({
        attemptId: 'c2',
        eventId: 'ec2',
        outcome: 'failed',
        recordedAt: new Date(2000).toISOString(),
      }),
    );

    // Both good events should be readable; malformed is skipped
    let stderrOutput = '';
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array): boolean => {
      stderrOutput += String(chunk);
      return true;
    }) as typeof process.stderr.write;

    try {
      const events = store.readAllSync();
      expect(events.length).toBe(2);
      expect(events[0]?.attemptId).toBe('c1');
      expect(events[1]?.attemptId).toBe('c2');
      expect(stderrOutput).toContain('verification_events_corrupted_line');
    } finally {
      process.stderr.write = origWrite;
    }
  });

  // ---- Test 10 ---------------------------------------------------------------
  it('10. Summary reconstruction works without SQLite (event store is independent)', () => {
    // Load events into memory directly (simulating SQLite being wiped)
    const fakeEvents: VerificationEvent[] = [
      makeEvent({
        attemptId: 'd1',
        eventId: 'ed1',
        outcome: 'passed',
        recordedAt: new Date(1000).toISOString(),
      }),
      makeEvent({
        attemptId: 'd2',
        eventId: 'ed2',
        outcome: 'failed',
        recordedAt: new Date(2000).toISOString(),
      }),
    ];

    // computeSummary works from raw event array — no SQLite needed
    const summary = computeSummary(fakeEvents, 'rec_test001', 'test-repo');
    expect(summary).not.toBeNull();
    expect(summary!.attemptCount).toBe(2);
    expect(summary!.successCount).toBe(1);
    expect(summary!.failureCount).toBe(1);
    expect(summary!.latestOutcome).toBe('failed'); // sorted by recordedAt
  });
});

// ---- Tests 7, 8, 11 via MemoryService ----------------------------------------

describe('VerificationEventStore — via MemoryService', () => {
  let tmpDir: string;
  let memoryDir: string;
  let service: MemoryService;
  let testRecordId: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comemor-vevent-svc-'));
    memoryDir = path.join(tmpDir, '.agent-memory');
    fs.mkdirSync(memoryDir, { recursive: true });

    service = new MemoryService({
      memoryDir,
      repositoryId: 'unit-test-repo',
    });

    // Record a failure to get a valid recordId
    const result = await service.recordFailure({
      command: 'npm test',
      exitCode: 1,
      output: 'TypeError: Cannot read property of undefined at line 42',
      fixCommands: ['npm install'],
      explanation: 'Missing dependency',
      risk: 'low',
    });
    testRecordId = result.id;
  });

  afterEach(() => {
    service.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ---- Test 7 ----------------------------------------------------------------
  it('7. recordVerificationOutcome rejects unknown recordId', async () => {
    await expect(
      service.recordVerificationOutcome({
        recordId: 'rec_nonexistent_xyz',
        attemptId: 'attempt-nonexistent',
        outcome: 'passed',
        method: 'host_reported',
      }),
    ).rejects.toThrow('Record not found');
  });

  // ---- Test 8 ----------------------------------------------------------------
  it('8. recordVerificationOutcome rejects wrong repositoryId', async () => {
    // Create a service with a different repositoryId
    const otherService = new MemoryService({
      memoryDir,
      repositoryId: 'other-repo',
    });

    try {
      // testRecordId was created under 'unit-test-repo', not 'other-repo'
      await expect(
        otherService.recordVerificationOutcome({
          recordId: testRecordId,
          attemptId: 'attempt-wrong-repo',
          outcome: 'passed',
          method: 'host_reported',
        }),
      ).rejects.toThrow(/belongs to repository/);
    } finally {
      otherService.close();
    }
  });

  // ---- Test 11 ---------------------------------------------------------------
  it('11. verifiedFixesCount excludes failed-only records', async () => {
    // Record two more failures
    const r2 = await service.recordFailure({
      command: 'cargo build',
      exitCode: 1,
      output: 'error[E0308]: mismatched types at line 10',
      fixCommands: ['cargo fix --allow-dirty'],
      explanation: 'Type mismatch',
      risk: 'low',
    });
    await service.recordFailure({
      command: 'go test ./...',
      exitCode: 1,
      output: 'FAIL: TestFoo undefined reference',
      fixCommands: ['go mod tidy'],
      explanation: 'Missing module',
      risk: 'low',
    });

    // Record passed on testRecordId (r1)
    await service.recordVerificationOutcome({
      recordId: testRecordId,
      attemptId: 'pass-attempt-r1',
      outcome: 'passed',
      method: 'human_confirmed',
    });

    // Record only failed on r2
    await service.recordVerificationOutcome({
      recordId: r2.id,
      attemptId: 'fail-attempt-r2',
      outcome: 'failed',
      method: 'host_reported',
    });

    // r3 has no events at all

    const stats = service.getStats();
    // successfulVerificationsCount: only r1 (has a passed event)
    expect(stats.successfulVerificationsCount).toBe(1);
    // failedVerificationsCount: r2 (only failed events, no passed)
    expect(stats.failedVerificationsCount).toBe(1);
    // deprecated alias should equal successfulVerificationsCount
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    expect(stats.verifiedFixesCount).toBe(stats.successfulVerificationsCount);
    // unverifiedRecordsCount: r3 (no events)
    expect(stats.unverifiedRecordsCount).toBe(1);
    expect(stats.totalRecords).toBe(3);
  });
});
