# Phase 5 — Documentation Consistency Matrix & Audit Trail

> **Project:** CoMemor v1.1 Remediation  
> **Phase:** 5 (Console Alignment, Documentation Truth & Product Credibility)  
> **Date:** November 23, 2026  
> **Branch:** `feature/phase5-console-docs`  

---

## 1. Executive Summary

Phase 5 aligns all public documentation, user-facing UI copy in the Memory Console, and architectural specifications with the actual source code implemented across Phases 1 through 4. It eliminates false claims of server-side command execution or OS-level sandboxing, enforces truth in statistical and security boundaries, and documents the event-driven verification and environment-inference mechanisms.

---

## 2. Documentation Consistency Matrix

| Claim / Subsystem | Historical / Deprecated Statement | Current Architectural Reality | Source-Code Evidence | Synchronized Documentation / UI |
|---|---|---|---|---|
| **Command Execution Boundary** | "CoMemor verifies and executes remediation fixes in a sandbox" | **CoMemor NEVER executes commands.** `verify_fix` only performs policy validation and returns a structured proposal (`requiresHostConfirmation: true`, `executedByServer: false`). | `src/server.ts#L264`, `src/policy/commandPolicy.ts#L13-L17` | `README.md`, `docs/threat-model.md`, `dashboard/frontend/src/components/OverviewScreen.tsx`, `ApprovalQueueScreen.tsx` |
| **Sandbox Semantics** | "Allowlist acts as an OS execution sandbox" | **Allowlist is NOT an OS sandbox.** It restricts proposal syntax and binaries (`ALLOWED_BINARIES`) to avoid dangerous vectors, but does not isolate processes. | `src/policy/commandPolicy.ts#L25-L39`, `src/policy/commandPolicy.ts#L207-L211` | `docs/limitations.md`, `docs/threat-model.md`, `CHANGELOG.md` |
| **Verification & Confidence** | "Wilson score confidence is auto-calculated from internal dry-run counts" | **Wilson lower bound requires explicit external outcome events.** Stored in `verification-events.jsonl` via `record_outcome`. 5-minute idempotency window prevents duplicate skew. | `src/core/verificationEvents.ts`, `src/core/wilson.ts` | `README.md`, `CHANGELOG.md`, `docs/limitations.md` |
| **Retrieval Explainability** | "Fuzzy matching returns candidates based on semantic embedding similarity" | **Lexical retrieval only (exact fingerprint + FTS5 BM25).** Diagnostic signals extracted from logs. All matches provide `candidateSource`, matched tokens, and score factors in `explanation`. | `src/core/diagnostics.ts`, `src/storage/index.ts`, `src/types.ts` | `README.md`, `docs/limitations.md`, `CHANGELOG.md` |
| **Storage & Integrity** | "Index is healthy if SQLite file opens; JSONL is appended asynchronously" | **Canonical JSONL is primary; index rebuilds transactionally.** Malformed lines preserved as `{corruptedLineHash, raw}`. Reconciliation metadata recorded in `reconciliation.json`. | `src/storage/jsonl.ts`, `src/storage/index.ts` | `docs/limitations.md`, `CHANGELOG.md` |
| **Environment Snapshot** | "Package manager defaults to npm" | **Dynamic inference with explicit unknown.** Inferred from command binary > `package.json` `packageManager` field > lockfiles. Never defaults to `'npm'`. | `src/core/environment.ts` | `README.md`, `docs/limitations.md`, `CHANGELOG.md` |
| **Risk Assessment** | "Static risk labels without reasons" | **Context-aware `riskReasons` populated for all commands.** Elevated risk for `npx`/`bunx`, `npm install`, `npm run`, `python script.py`, `cargo build/run`, `go run`. | `src/policy/commandPolicy.ts#L97-L214` | `README.md`, `CHANGELOG.md`, `docs/limitations.md` |

---

## 3. Scope of Document Updates

1. **`CHANGELOG.md`**:
   - Added `[Unreleased]` section detailing all remediation from Phases 1–4.
   - Fixed deprecated `[0.4.0]` section title from "Sandboxed Verification" to "Policy Validation & Approval Queue".
2. **`README.md`**:
   - Updated capabilities table to include Verification Event Store, Retrieval Explainability, Environment Snapshots, and Honest Wilson Confidence.
   - Reflected policy assessment proposal behavior (`requiresHostConfirmation: true`, `executedByServer: false`).
3. **`docs/production-readiness-audit.md`**:
   - Marked as a historical document scoped to the v1.0.0 audit (2026-09-20).
   - Replaced "Sandbox Safety" heading with "Policy Validation Safety" in core production guarantees.
4. **`docs/threat-model.md`**:
   - Updated verification checklist to reference binary allowlists rather than whitelists, and reiterated the non-execution invariant.
5. **`docs/limitations.md`**:
   - Added Section 0 documenting Phase 1–4 resolved limitations (F-01 through F-05, C-01 through C-03, X-02).
   - Added Section 5 detailing remaining limitations (Host-reported evidence boundaries, lexical retrieval vs embeddings, static risk analysis).
6. **`dashboard/frontend/src/components/OverviewScreen.tsx`**:
   - Removed "dry-run sandbox execution" and "Sandbox-verified" phrasing; replaced with "Reported verified or operator-reviewed".
7. **`tests/integration/doc-consistency.test.ts`**:
   - Added 27 automated assertions ensuring documentation truth, absence of unnegated "safe to execute" or "sandboxed" claims, and accurate changelog/schema reflection.

---

## 4. Verification & Audit Sign-Off

- **Root Build (`tsc`):** Clean pass.
- **Root Test Suite (`vitest`):** 38 test files, 363 tests passed (100% passing).
- **Dashboard Bridge Build:** Clean pass.
- **Dashboard Frontend Build (`vite build`):** Clean pass.
- **Protected Files Integrity:** Verified 0 changes to `package.json`, `package-lock.json`, and `web/comemor-landing.html`.
