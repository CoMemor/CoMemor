/**
 * VerificationEventStore: Append-only event log for verification outcomes.
 *
 * Phase 1 (F-01 + C-01): Stores discrete verification outcome events in
 * verification-events.jsonl, decoupled from the MemoryRecord canonical log.
 *
 * Key design decisions (see ADR-010):
 * - Append-only: events are never modified or deleted
 * - Cross-process locking via proper-lockfile (same pattern as JsonlStorage)
 * - Idempotency by attemptId: first event per attemptId wins
 * - recordedAt is set by the server (authoritative); reportedAt is caller metadata only
 * - Malformed lines are skipped with a stderr log; the file is never deleted
 * - Wilson lower bound is computed from deduplicated attempts
 */

import fs from 'node:fs';
import path from 'node:path';
import { lock } from 'proper-lockfile';
import { v4 as uuidv4 } from 'uuid';
import type { VerificationEvent, VerificationSummary } from '../types.js';
import { calculateWilsonScoreLowerBound } from '../core/staleness.js';

const LOCK_RETRIES = 10;
const LOCK_STALE_MS = 10_000;
const LOCK_RETRY_WAIT_MS = 50;

/** In-process write queue to serialize concurrent writes to the events file */
const eventFileQueues = new Map<string, Promise<void>>();

function getEventFileQueue(resolvedPath: string): Promise<void> {
  return eventFileQueues.get(resolvedPath) ?? Promise.resolve();
}

function setEventFileQueue(resolvedPath: string, promise: Promise<void>): void {
  eventFileQueues.set(resolvedPath, promise);
}

export class VerificationEventStore {
  private eventsPath: string;

  constructor(eventsPath: string) {
    this.eventsPath = path.resolve(eventsPath);
    const dir = path.dirname(this.eventsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Ensure the file exists so proper-lockfile can lock it
    if (!fs.existsSync(this.eventsPath)) {
      fs.writeFileSync(this.eventsPath, '', { encoding: 'utf8' });
    }
  }

  /**
   * Append one event under proper-lockfile cross-process lock.
   * Uses an in-process queue to serialize concurrent callers within the same process.
   */
  async append(event: VerificationEvent): Promise<void> {
    const resolved = this.eventsPath;
    const line = JSON.stringify(event) + '\n';

    const operation = async () => {
      const release = await lock(resolved, {
        retries: {
          retries: LOCK_RETRIES,
          minTimeout: LOCK_RETRY_WAIT_MS,
          factor: 1.5,
        },
        stale: LOCK_STALE_MS,
        realpath: false,
      });
      try {
        await fs.promises.appendFile(resolved, line, { encoding: 'utf8' });
      } finally {
        await release();
      }
    };

    const queue = getEventFileQueue(resolved);
    const next = queue.then(operation, operation);
    setEventFileQueue(resolved, next);
    return next;
  }

  /**
   * Read all events synchronously (for startup reconciliation or summary computation).
   * Malformed lines are skipped with a stderr warning; the file is never deleted.
   */
  readAllSync(): VerificationEvent[] {
    if (!fs.existsSync(this.eventsPath)) {
      return [];
    }
    const content = fs.readFileSync(this.eventsPath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const events: VerificationEvent[] = [];
    for (let i = 0; i < lines.length; i++) {
      try {
        events.push(JSON.parse(lines[i] ?? '') as VerificationEvent);
      } catch {
        // Log to stderr; never expose raw content; never delete the file
        process.stderr.write(
          JSON.stringify({
            level: 'warn',
            event: 'verification_events_corrupted_line',
            file: this.eventsPath,
            lineNumber: i + 1,
            recovery: 'line skipped; remaining events still readable',
          }) + '\n',
        );
      }
    }
    return events;
  }

  /**
   * Read all events asynchronously.
   */
  async readAll(): Promise<VerificationEvent[]> {
    if (!fs.existsSync(this.eventsPath)) {
      return [];
    }
    const content = await fs.promises.readFile(this.eventsPath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const events: VerificationEvent[] = [];
    for (let i = 0; i < lines.length; i++) {
      try {
        events.push(JSON.parse(lines[i] ?? '') as VerificationEvent);
      } catch {
        process.stderr.write(
          JSON.stringify({
            level: 'warn',
            event: 'verification_events_corrupted_line',
            file: this.eventsPath,
            lineNumber: i + 1,
            recovery: 'line skipped; remaining events still readable',
          }) + '\n',
        );
      }
    }
    return events;
  }

  /**
   * Build a per-record VerificationSummary from the event history.
   * Returns null if no events exist for this recordId+repositoryId.
   * Deduplicates by attemptId: the first event per attemptId wins.
   * Uses calculateWilsonScoreLowerBound from staleness.ts.
   */
  getSummary(recordId: string, repositoryId: string): VerificationSummary | null {
    const allEvents = this.readAllSync();
    return computeSummary(allEvents, recordId, repositoryId);
  }

  /**
   * Check idempotency for an attempt:
   * - Returns 'new' if attemptId not seen for this recordId
   * - Returns 'duplicate' if same attemptId with same recordId/outcome/method
   * - Returns 'conflict' if same attemptId but different recordId/outcome/method
   */
  checkIdempotency(
    attemptId: string,
    recordId: string,
    outcome: 'passed' | 'failed',
    method: 'host_reported' | 'human_confirmed',
  ): 'new' | 'duplicate' | 'conflict' {
    const allEvents = this.readAllSync();
    // Find any prior event with this attemptId
    const prior = allEvents.find((e) => e.attemptId === attemptId);
    if (!prior) return 'new';
    if (prior.recordId === recordId && prior.outcome === outcome && prior.method === method) {
      return 'duplicate';
    }
    return 'conflict';
  }

  /**
   * Generate a new unique event ID (UUID v4).
   */
  generateEventId(): string {
    return uuidv4();
  }
}

/**
 * Exported helper: compute a VerificationSummary from a pre-loaded event array.
 * This is used by MemoryService.getStats() to avoid multiple file reads.
 */
export function computeSummary(
  allEvents: VerificationEvent[],
  recordId: string,
  repositoryId: string,
): VerificationSummary | null {
  // Filter to this record and repository
  const recordEvents = allEvents.filter(
    (e) => e.recordId === recordId && e.repositoryId === repositoryId,
  );
  if (recordEvents.length === 0) return null;

  // Deduplicate by attemptId: first event per attemptId wins
  const seenAttemptIds = new Set<string>();
  const uniqueEvents: VerificationEvent[] = [];
  for (const e of recordEvents) {
    if (!seenAttemptIds.has(e.attemptId)) {
      seenAttemptIds.add(e.attemptId);
      uniqueEvents.push(e);
    }
  }

  const attemptCount = uniqueEvents.length;
  const successCount = uniqueEvents.filter((e) => e.outcome === 'passed').length;
  const failureCount = uniqueEvents.filter((e) => e.outcome === 'failed').length;

  // Latest by recordedAt
  const sorted = [...uniqueEvents].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const latest = sorted[sorted.length - 1];

  const wilsonLowerBound =
    attemptCount > 0 ? calculateWilsonScoreLowerBound(successCount, attemptCount) : null;

  return {
    attemptCount,
    successCount,
    failureCount,
    latestOutcome: latest?.outcome ?? null,
    latestOutcomeAt: latest?.recordedAt ?? null,
    latestMethod: latest?.method ?? null,
    wilsonLowerBound,
  };
}
