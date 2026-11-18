/**
 * Integration tests for the record_verification_outcome MCP tool (Phase 1 / F-01 + C-01).
 *
 * Tests the full path: MemoryService → VerificationEventStore → stats output
 *
 * 1. Record a failure → get recordId
 * 2. Call recordVerificationOutcome with passed → verify summary
 * 3. Replay same attemptId → idempotent response
 * 4. Replay with conflicting outcome → conflict_rejected
 * 5. Call list_memory_stats → successfulVerificationsCount=1, failedVerificationsCount=0
 * 6. Call find_fix on same failure → verificationSummary populated
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MemoryService } from '../../src/core/memoryService.js';

describe('record_verification_outcome — integration', () => {
  let tmpDir: string;
  let memoryDir: string;
  let service: MemoryService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comemor-vevent-int-'));
    memoryDir = path.join(tmpDir, '.agent-memory');
    fs.mkdirSync(memoryDir, { recursive: true });

    service = new MemoryService({
      memoryDir,
      repositoryId: 'integration-test-repo',
    });
  });

  afterEach(() => {
    try {
      service.close();
    } catch {
      // already closed in some tests
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('1-6: full end-to-end verification outcome flow', async () => {
    // Step 1: Record a failure
    const failure = await service.recordFailure({
      command: 'npm test',
      exitCode: 1,
      output: 'TypeError: Cannot read property "foo" of undefined\n  at index.ts:42',
      fixCommands: ['npm install', 'npm test'],
      explanation: 'Missing dependency — install first',
      risk: 'low',
      tags: ['typescript'],
    });

    expect(failure.id).toMatch(/^rec_/);
    const recordId = failure.id;

    // ---- Step 2: Record a passed verification outcome ----
    const result1 = await service.recordVerificationOutcome({
      recordId,
      attemptId: 'attempt-001',
      outcome: 'passed',
      method: 'human_confirmed',
      evidenceRef: 'ci-run-12345',
      note: 'User confirmed fix worked on first try',
    });

    expect(result1.status).toBe('recorded');
    expect(result1.eventId).toBeTruthy();
    expect(result1.summary.attemptCount).toBe(1);
    expect(result1.summary.successCount).toBe(1);
    expect(result1.summary.failureCount).toBe(0);
    expect(result1.summary.latestOutcome).toBe('passed');
    expect(result1.summary.latestMethod).toBe('human_confirmed');
    expect(result1.summary.wilsonLowerBound).not.toBeNull();

    // ---- Step 3: Replay same attemptId (idempotent) ----
    const result2 = await service.recordVerificationOutcome({
      recordId,
      attemptId: 'attempt-001', // same attemptId
      outcome: 'passed',
      method: 'human_confirmed',
    });

    expect(result2.status).toBe('duplicate_idempotent');
    // Count must NOT have been incremented
    expect(result2.summary.attemptCount).toBe(1);
    expect(result2.summary.successCount).toBe(1);

    // ---- Step 4: Conflicting replay → rejected ----
    const result3 = await service.recordVerificationOutcome({
      recordId,
      attemptId: 'attempt-001', // same attemptId
      outcome: 'failed', // different outcome → conflict
      method: 'host_reported',
    });

    expect(result3.status).toBe('conflict_rejected');
    // Summary should still reflect only the original passed event
    expect(result3.summary.successCount).toBe(1);
    expect(result3.summary.failureCount).toBe(0);

    // ---- Step 5: list_memory_stats ----
    const stats = service.getStats();
    expect(stats.totalRecords).toBe(1);
    expect(stats.successfulVerificationsCount).toBe(1);
    expect(stats.failedVerificationsCount).toBe(0);
    expect(stats.unverifiedRecordsCount).toBe(0);
    // Deprecated alias must equal successfulVerificationsCount
    expect(stats.verifiedFixesCount).toBe(stats.successfulVerificationsCount);

    // ---- Step 6: find_fix → verificationSummary populated ----
    const findResult = await service.findFix({
      command: 'npm test',
      output: 'TypeError: Cannot read property "foo" of undefined\n  at index.ts:42',
    });

    expect(findResult.matches.length).toBeGreaterThan(0);
    const match = findResult.matches[0]!;
    expect(match.id).toBe(recordId);
    // verificationSummary should be populated from the event store
    expect(match.verificationSummary).not.toBeNull();
    expect(match.verificationSummary!.successCount).toBe(1);
    expect(match.verificationSummary!.wilsonLowerBound).not.toBeNull();
  });

  it('verify_fix does NOT set verification status to passed (stays policy-only)', async () => {
    const failure = await service.recordFailure({
      command: 'npm test',
      exitCode: 1,
      output: 'Error: ECONNREFUSED at port 3000',
      fixCommands: ['npm run dev'],
      explanation: 'Start the server first',
      risk: 'low',
    });

    // Calling verify_fix with dryRun (policy check only)
    const verifyResult = await service.verifyFix({
      command: 'npm run dev',
      dryRun: true,
    });

    // verify_fix returns policy result only — never 'passed' as a verification outcome
    expect(['dry_run_allowed', 'dry_run_denied', 'pending_approval']).toContain(verifyResult.status);

    // The record should still have zero verification events
    const stats = service.getStats();
    expect(stats.successfulVerificationsCount).toBe(0);
    expect(stats.unverifiedRecordsCount).toBe(1);

    // verify_fix does not update the record verification status
    const findResult = await service.findFix({
      command: 'npm test',
      output: 'Error: ECONNREFUSED at port 3000',
    });
    expect(findResult.matches.length).toBeGreaterThan(0);
    const match = findResult.matches[0]!;
    // No events recorded — summary must be null
    expect(match.verificationSummary).toBeNull();
    // Legacy field still 'unknown' (not modified by verify_fix)
    expect(match.verificationStatus).toBe('unknown');

    void failure.id;
  });

  it('records with only failed events do not count as successfulVerifications', async () => {
    const r1 = await service.recordFailure({
      command: 'cargo build',
      exitCode: 1,
      output: 'error[E0308]: mismatched types at lib.rs:10',
      fixCommands: ['cargo fix --allow-dirty'],
      explanation: 'Type mismatch',
      risk: 'low',
    });

    // Record only a failed outcome
    await service.recordVerificationOutcome({
      recordId: r1.id,
      attemptId: 'fail-only-attempt',
      outcome: 'failed',
      method: 'host_reported',
    });

    const stats = service.getStats();
    expect(stats.successfulVerificationsCount).toBe(0);
    expect(stats.failedVerificationsCount).toBe(1);
    // deprecated alias must NOT count failed-only
    expect(stats.verifiedFixesCount).toBe(0);
  });

  it('verification events file survives service restart', async () => {
    // Use a dedicated tmpDir so this test owns its own lifecycle
    const restartTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comemor-restart-'));
    const restartMemoryDir = path.join(restartTmpDir, '.agent-memory');
    fs.mkdirSync(restartMemoryDir, { recursive: true });

    // First service instance
    const svc1 = new MemoryService({
      memoryDir: restartMemoryDir,
      repositoryId: 'restart-test-repo',
    });

    try {
      const failure = await svc1.recordFailure({
        command: 'go test ./...',
        exitCode: 1,
        output: 'FAIL: TestBar undefined: bar',
        fixCommands: ['go mod tidy'],
        explanation: 'Missing module dependency',
        risk: 'low',
      });

      await svc1.recordVerificationOutcome({
        recordId: failure.id,
        attemptId: 'persist-attempt',
        outcome: 'passed',
        method: 'human_confirmed',
      });
    } finally {
      svc1.close();
    }

    // Restart with fresh service instance reading same files
    const svc2 = new MemoryService({
      memoryDir: restartMemoryDir,
      repositoryId: 'restart-test-repo',
    });

    try {
      const stats = svc2.getStats();
      // Events should survive restart — the JSONL file is the source of truth
      expect(stats.successfulVerificationsCount).toBe(1);
    } finally {
      svc2.close();
      fs.rmSync(restartTmpDir, { recursive: true, force: true });
    }
  });

  it('verification-events.jsonl is created in memoryDir', () => {
    const eventsPath = path.join(memoryDir, 'verification-events.jsonl');
    expect(fs.existsSync(eventsPath)).toBe(true);
  });
});
