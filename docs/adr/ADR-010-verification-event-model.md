# ADR-010: Verification Event Model & Honest Wilson Confidence

**Status:** Accepted  
**Date:** 2026-11-18  
**Authors:** CoMemor Phase 1 Remediation Team  
**Supersedes:** Parts of verification behaviour implicit in ADR-002, ADR-003  
**Addresses:** F-01 (Dishonest Wilson confidence), C-01 (Structural confidence gap)

---

## Context

The original CoMemor design stored verification state (`status`, `verifiedAt`, `wilsonLowerBound`) directly on the `MemoryRecord` struct, which lives in the JSONL canonical log. This created several problems:

1. **Dishonest Wilson confidence (F-01):** `verify_fix` was the only path to update verification metadata on a record. Because `verify_fix` is a *policy-only* tool that never executes commands, it could never actually observe a real pass/fail outcome. Any Wilson score computed from `verify_fix` outcomes was meaningless: it reflected policy compliance, not real-world success rates.

2. **Structural confidence gap (C-01):** Agents had no approved mechanism to report that they had run a fix and observed an outcome. The only feedback loop was the agent re-recording a whole new failure (`record_failure`), which loses the connection to the original record.

3. **Immutable record corruption risk:** Rewriting `MemoryRecord.verification` on every outcome would require a mutable-update model on the JSONL log, violating ADR-002's append-only guarantee, or require SQLite as the authoritative store (violating ADR-003).

4. **Caller trust problem:** A CoMemor MCP server cannot independently verify that an outcome occurred. Any outcome must ultimately be a *caller assertion*. The model must be honest about this.

---

## Decision

Introduce a **separate append-only event log** (`verification-events.jsonl`) to record discrete verification outcome events. The `MemoryRecord` struct is NOT modified to store outcomes; instead, outcomes are derived on-demand from the event log.

### Why `verification-events.jsonl` (append-only event log)?

- **ADR-002 compliance:** Maintains the append-only constraint. The canonical record log remains immutable; events are additive facts about records.
- **Audit trail:** Every outcome attempt is preserved, enabling analysis of reliability trends over time.
- **Idempotency:** Each event carries an `attemptId` (caller-provided idempotency key). Duplicate submissions are detected and silently ignored rather than double-counted, preventing replay-attack inflation.
- **Decoupling:** The record store and the verification store can be recovered, rebuilt, and reasoned about independently. Test case 10 (summary survives SQLite wipe) validates this.
- **No schema migration required on `MemoryRecord`:** Adding a new side-car file is fully backward-compatible with the existing JSONL log format.

### Why `verify_fix` stays policy-only?

`verify_fix` validates a proposed command against the safety allowlist and returns a structured proposal. It has no execution capability and therefore cannot observe real outcomes. Per ADR-006, CoMemor never executes commands. Therefore, `verify_fix` MUST NOT set verification outcomes. The new `record_verification_outcome` tool is the designated, clearly-scoped mechanism for reporting observed outcomes.

### Trust model for outcomes

**All outcomes recorded via `record_verification_outcome` are caller assertions.** The server:
- Accepts the outcome as reported
- Records the `recordedAt` timestamp authoritatively (server clock, not caller-provided)
- Accepts an optional `reportedAt` from the caller as metadata only
- Never independently verifies that the outcome occurred
- Labels all methods as either `host_reported` or `human_confirmed` — both are caller-originated claims

Consumers of `VerificationSummary.wilsonLowerBound` MUST understand that this score reflects the *stated* success rate of a fix across *reported* attempts, not independently audited outcomes.

### Idempotency semantics

The `attemptId` field provides caller-controlled idempotency:

- **Same `attemptId` + same `{recordId, outcome, method}`:** Idempotent — no new event written, existing summary returned. Status: `duplicate_idempotent`.
- **Same `attemptId` + different `{recordId, outcome, method}`:** Conflict — rejected. Status: `conflict_rejected`. This prevents an adversary from changing the meaning of a past attempt ID by submitting a different outcome.
- **New `attemptId`:** A new event is written. Status: `recorded`.

Callers MUST generate a fresh UUID for each genuinely new verification attempt. Reusing an `attemptId` for a different attempt is a bug in the caller.

### Wilson score computation

The `wilsonLowerBound` is computed from unique attempts (deduplicated by `attemptId`, first event wins) using the existing `calculateWilsonScoreLowerBound` function from `staleness.ts`. The confidence interval uses `z = 1.96` (95% confidence). The lower bound is returned as `null` when `attemptCount === 0`.

### Staleness integration

`checkRecordStaleness` is updated to accept an optional `VerificationSummary` parameter. When provided:
- `summary.latestOutcome === 'failed'` → stale reason added
- `summary.wilsonLowerBound !== null && summary.wilsonLowerBound < 0.4` → low-confidence stale reason added

The original `record.verification.*` fields remain on the struct for backward compatibility with existing persisted records but are no longer used for staleness decisions when a summary is available.

---

## Data Model

### `VerificationEvent` (one line per event in `verification-events.jsonl`)

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | `1` | Fixed for this ADR |
| `eventId` | `string` (UUID v4) | Server-generated, globally unique |
| `attemptId` | `string` (≤128 chars) | Caller-provided idempotency key |
| `recordId` | `string` | References `MemoryRecord.id` |
| `repositoryId` | `string` | Scopes the event; must match record's repo |
| `outcome` | `'passed' \| 'failed'` | Caller assertion |
| `method` | `'host_reported' \| 'human_confirmed'` | Caller assertion |
| `recordedAt` | ISO-8601 | Server clock — authoritative for ordering |
| `reportedAt` | ISO-8601? | Optional caller-provided timestamp |
| `evidenceRef` | `string?` (≤512 chars) | Bounded reference; never raw logs |
| `note` | `string?` (≤1024 chars) | Optional; redacted before storage |

### `VerificationSummary` (derived, never stored)

Computed from the event log on demand. Deduplicates by `attemptId` (first event per `attemptId` wins).

---

## Consequences

### Positive
- Wilson scores are now honest: they reflect real caller-reported outcomes, not policy checks.
- Full outcome history is preserved and auditable.
- Idempotency prevents double-counting from retries.
- `MemoryRecord` schema remains unchanged (no migration required).
- Event store is independently recoverable (survives SQLite wipe).

### Negative / Trade-offs
- A second JSONL file must be managed (backed up, included in recovery procedures).
- Summaries require scanning the event log on each call (acceptable at current scale; can be cached later).
- Outcomes remain caller assertions — the server cannot verify them independently. This is an inherent limitation of the trust model, not a defect.

### Neutral
- `verifiedFixesCount` in `MemoryStatsOutput` becomes a deprecated alias for `successfulVerificationsCount`. Callers should migrate to the new fields.

---

## Alternatives Considered

1. **Mutate `MemoryRecord.verification` in-place in SQLite:** Rejected — SQLite is a secondary rebuildable index. Making it authoritative for verification outcomes violates ADR-003.
2. **Append a new `MemoryRecord` with updated verification:** Rejected — inflates the record count, makes provenance ambiguous, and creates multiple records with the same failure fingerprint.
3. **Store outcomes in a relational SQLite table:** Rejected — SQLite is rebuilt from JSONL on startup. A separate SQLite table would not survive a rebuild unless the event log existed as the canonical source anyway.

---

## References

- ADR-002: JSONL as canonical source of truth (append-only)
- ADR-003: SQLite as rebuildable secondary index
- ADR-006: Command execution policy (CoMemor never executes)
- F-01: Dishonest Wilson confidence audit finding
- C-01: Structural confidence gap audit finding
