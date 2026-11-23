# Changelog

All notable changes to `CoMemor` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] — v1.1 Remediation (Phases 1–4)

> **Branch:** `feature/phase4-command-policy-env` and predecessors.
> These changes are implemented and tested but not yet merged to `main` or released.
> Do not change historical results in this file or bump the package version until a release is approved.

### Phase 4 — Context-Aware Risk Semantics & Environment Snapshots (F-04, F-05, X-02)
- **Context-Aware Command Risk Assessment:** `CommandPolicyEngine.assessRisk()` now returns concrete `riskReasons` for each command. `npx`/`bunx` → `high` (remote package download); `npm install`/`pnpm add`/`yarn add` → `medium` (lifecycle scripts); `npm run`/`pnpm run`/`yarn run` → `medium` (project scripts); `python <script.py>` → `medium` (arbitrary script); `go run` → `medium` (compiles and executes); `cargo build/check/run/test` → `medium` (build scripts + proc macros). All other allowlisted commands default to `low` with an explicit review note.
- **No "Sandboxed" / "Safe to Execute" Language:** These phrases are permanently removed from all `verifyFix` and `validateCommand` responses. Policy assessment is a proposal for review, not an execution authorization.
- **Environment Snapshot:** New `src/core/environment.ts` captures `EnvironmentSnapshot` at record time. Package manager is inferred in priority order: command binary > `package.json` `packageManager` field > lockfile presence > `'unknown'`. Never silently defaults to `'npm'`. All known lockfiles are SHA-256 hashed.
- **Tests:** 44 new unit tests (`environment.test.ts`); 20 new security tests (`phase4-risk-semantics.test.ts`).

### Phase 3 — High-Signal Retrieval, Explainability & Quality Benchmarks (F-02)
- **Diagnostic Signal Extraction:** `extractDiagnosticSignals()` in `src/core/diagnostics.ts` extracts error codes, file paths, stack frames, and relevant tokens from long logs before FTS5 query construction. Prevents irrelevant boilerplate from dominating retrieval.
- **Retrieval Explanation:** All `find_fix` matches now include a `RetrievalExplanation` field with `candidateSource` (`fts5_bm25` or `relational_scan`), `matchTokens`, `diagnosticSignals`, and `scoringFactors`.
- **Quality Benchmarks:** 7 integration tests in `retrieval-quality.test.ts` measure Recall@K, Precision@K, and MRR against labelled fixture corpus. Hard negatives (generic boilerplate) verified to produce no high-confidence matches.
- **Tests:** 11 new unit tests (`diagnostics.test.ts`); 7 new integration tests.

### Phase 2 — Canonical Storage Integrity, SQLite/FTS5 Transactions & Recovery (F-03, C-02, C-03, X-01, X-04)
- **Atomic FTS5 Transactions:** All JSONL appends and SQLite FTS5 index writes are executed in a single atomic transaction. Partial writes now roll back cleanly.
- **Corrupt-Line Recovery:** `records.jsonl` lines that fail JSON parsing are preserved as `{corruptedLineHash, raw}` entries rather than silently dropped. Recovery is logged and observable.
- **Reconciliation Metadata:** Index rebuild now records `{rebuiltAt, recordCount, corruptedLines}` in `.agent-memory/reconciliation.json`. Dashboard can read real state rather than assuming healthy when SQLite opens.
- **Cross-Process Locking:** `proper-lockfile` guards all JSONL mutations across multiple writer processes.
- **Tests:** 10 new tests across storage-integrity and reliability-recovery suites.

### Phase 1 — Verification Event Model & Honest Wilson Confidence (F-01, C-01)
- **Verification Event Store:** New `verification-events.jsonl` append-only event log. Each `record_outcome` call appends a `{recordId, outcome, source, method, timestamp}` event. Duplicate attempts within a 5-minute window on the same record are rejected with an idempotency key.
- **Honest Wilson Score:** `calculateWilsonLowerBound()` now reads deduplicated events from `verification-events.jsonl` rather than the deprecated `verificationCount`/`successCount` fields in `records.jsonl`. Wilson scores are only populated when actual outcome events exist.
- **Source Labelling:** Outcomes are labelled `host_reported` or `human_reported`; never claimed as independently authenticated.
- **Tests:** 32+ unit and integration tests for event model, deduplication, Wilson math, and idempotency.

---

## [1.0.5] - 2026-11-08

### Security & Hardening (Phase 1 Audit Implementation)
- **Dependency Upgrades:**
  - Upgraded `@modelcontextprotocol/sdk` to pinned `1.32.2` (resolves 8 CVEs/GHSA advisories including ReDoS, memory exhaustion, unbounded batch lengths).
  - Upgraded `zod` to `4.6.7` (resolves GHSA-mrhx-c7xc-m3w5 constrained collection memory exhaustion).
  - Added `proper-lockfile@4.1.2` for cross-platform advisory file locking.
  - Eliminated all production-reachable vulnerabilities (`npm audit --omit=dev` reports 0 vulnerabilities).
- **XML Sanitization Envelope Hardening (F-17):**
  - Added `xmlEscape` utility escaping special characters (`<`, `>`, `&`, `"`, `'`) for all untrusted user data interpolated into `<untrusted_historical_memory>` envelopes (`command`, `explanation`, `suggested_commands`).
  - Added adversarial regression tests for closing tags, nested tags, and Unicode characters.
- **Approval Gate & Execution Safety (F-09):**
  - Removed arbitrary server-side command execution from `verify_fix`. Remediation execution is delegated to the host agent's native user-confirmation and execution mechanisms.
  - `verify_fix` operates in policy-validation mode, queuing approvals in `approvals-pending.jsonl` for operator auditability.
- **Cross-Process Advisory Locking:**
  - Hardened `JsonlStorage.append` with `proper-lockfile` cross-process locking and in-process write queue serialization.
  - Hardened approval queue mutations with cross-process locking.
- **Git Provenance Collection:**
  - Added `collectGitProvenance` recording HEAD commit SHA, branch, and dirty working-tree state at record creation time via `child_process.execFile` with fixed arguments (`shell: false`, 3s timeout, 4KB buffer cap).
  - Degrades gracefully if Git is unavailable or workspace is not a Git repository.
- **Accurate Pending Approvals Count:**
  - Replaced hardcoded `0` in `getStats()` with dynamic calculation counting unresolved IDs between `approvals-pending.jsonl` and `approvals-resolved.jsonl`.
- **Input Length Protections:**
  - Added strict `max()` constraints to Zod schemas (commands: 1024 chars, output: 128KB, explanation: 32KB, fix commands: max 20, tags: max 50).
- **Licensing & Specification Alignment:**
  - Project license is `GPL-3.0-only` (GNU General Public License v3). GPL permits commercial use and redistribution subject to copyleft requirements; it does not impose the network-use source-disclosure requirement found in AGPL-3.0.
  - Clarified supported MCP specification baseline as SDK 1.x / `2024-11-05` (SDK v2 / spec 2026-07-28 tracked separately in ADR-007).

---

## [1.0.0] - 2026-09-20

### Added
- **Production Readiness Audit:** Complete v1.0.0 production verification suite across documentation truth, security, reliability, scale, and cross-platform consistency (`docs/production-readiness-audit.md`).
- **Startup Environment Validation:** Added `validateStartupEnvironment` checking `AGENT_MEMORY_DIR` directory validity and `AGENT_MEMORY_REPO` non-empty constraint. Emits machine-readable JSON on `stderr` and exits code 1 on failure while preserving clean `stdout`.
- **Node.js Version Enforcement:** Added runtime check enforcing Node.js `>= 22.5.0` (required for native `node:sqlite DatabaseSync`). Emits structured error on `stderr` when executed on unsupported engines.
- **Cross-Platform Path Normalization:** Enhanced `normalizeOutput` to canonicalize Windows drive letters (`C:\` -> `C:/`), relative prefixes (`.\` -> `./`), and path backslashes to forward slashes. Produces byte-for-byte identical fingerprints across Windows and POSIX.
- **Homoglyph Normalization:** Implemented `HOMOGLYPH_MAP` and `canonicalizeHomoglyphs` in `poisonDetector.ts` mapping Cyrillic and Greek lookalikes to Latin equivalents and stripping zero-width spaces before heuristic analysis.
- **Command Policy Hardening:** Added strict argument path containment blocking workspace escapes via absolute paths or `--flag=value` syntax. Hardened `hasResolvedApproval` with per-line JSON recovery and approval ID to command binding.
- **Graceful Shutdown:** Added `shutdown` function handling `SIGINT` and `SIGTERM` to finalize open SQLite connections and flush logs.
- **Scale Benchmarks:** Added `scripts/scale-benchmark.ts` evaluating performance at 100, 1,000, and 10,000 records. Verified exact lookup p95 is 25.08 ms at 1k and 128.10 ms at 10k records.
- **Packaging & CI:** Added npm metadata (`bin`, `files`, `repository`), GitHub Actions CI workflow, `SECURITY.md`, and `CONTRIBUTING.md`.

---

## [0.8.0] - Phase 8: Benchmark & Evaluation
- Built deterministic evaluation harness with 6 real-world fault scenarios (dependency mismatch, TypeScript compilation error, missing env var, port collision, test assertion failure, platform path separator).
- Implemented automated comparative baselines B0 (no memory), B1 (exact only), B2 (exact + fuzzy), and B3 (full system with staleness).
- Applied non-parametric Wilcoxon signed-rank paired hypothesis testing ($W^+$, two-tailed $p$-values) and rank-biserial effect sizes ($r$).

---

## [0.7.0] - Phase 7: Integration and UX
- Added MCP prompt `agent_memory_safe_workflow` outlining the safe 8-step repair workflow.
- Added `memory://records/{id}` MCP resource template and recent resource enumeration.
- Aligned `list_memory_stats` tool output with the Memory Console overview contract.
- Published operator user guide and MCP host integration manuals (`docs/operations/user-guide.md`).

---

## [0.6.0] - Phase 6: Memory Console Dashboard
- Built `dashboard-bridge` Node service using Fastify, strictly isolated and bound to `127.0.0.1`. Enforces read-only SQLite queries and append-only operator decision logging.
- Built `dashboard-frontend` React + Vite console featuring seven views: Overview, Live Activity Feed, Record Browser & Detail, Retrieval Explainability, Approval Queue, Security Audit, and Benchmark Results.
- Added static AST isolation tests proving bridge cannot import or execute shell processes.

---

## [0.5.0] - Phase 5: Retrieval Poisoning Defenses
- Designed and verified 7 heuristic prompt injection detectors (imperative injection, authority override, system prompt delimiters, exfiltration URLs, code fence smuggling, zero-width characters, homoglyphs).
- Implemented untrusted data wrapping via `<untrusted_historical_memory>` envelopes with explicit `<warning>` delimiters.
- Added quarantine flagging (`is_quarantined = true`), quarantine audit reasons, and provenance-weighted trust decay.

---

## [0.4.0] - Phase 4: Policy Validation & Approval Queue
- Implemented `verify_fix` tool for safe repair validation.
- Built `CommandPolicyEngine` enforcing strict binary allowlist (`npm`, `cargo`, `vitest`, etc.) and permanently disallowing destructive commands (`rm`, `sudo`, `git reset --hard`).
- Implemented two-tier human operator approval queue via `.agent-memory/approvals-pending.jsonl` and `.agent-memory/approvals-resolved.jsonl`.

---

## [0.3.0] - Phase 3: Fuzzy Matching & Output Normalization
- Implemented versioned output normalizer v1 stripping volatile runtime noise (ISO timestamps, UUIDs, memory addresses, durations, temp paths).
- Built token-overlap and Levenshtein similarity ranking with configurable confidence thresholds.
- Dynamic Wilson score interval confidence calculation for historical records.

---

## [0.2.0] - Phase 2: Core Vertical Slice
- Implemented `record_failure` and `find_fix` MCP tools.
- Deterministic SHA-256 fingerprinting of normalized errors.
- Two-layer credential redaction engine: deterministic regex for known API keys plus Shannon entropy gating ($H(X) \ge 4.5\text{ bits/char}$).
- Hybrid storage engine: authoritative append-only `records.jsonl` with SQLite `index.db` secondary search cache.

---

## [0.1.0] - Phase 1: Architecture & Foundations
- Initial architecture specifications, ADR-001 through ADR-007.
- Zod schema validation contracts for MCP tools and data types.
- Stdio channel invariant enforcement (zero `stdout` pollution, JSON-RPC framing strictly preserved).
