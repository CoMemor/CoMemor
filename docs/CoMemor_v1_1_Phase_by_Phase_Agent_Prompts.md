# CoMemor v1.1 — Phase-by-Phase Agent Prompt Pack

**Objective:** Remediate the verified engineering gaps in CoMemor and prepare a technically credible v1.1 release without expanding into unrelated product upgrades.

**Repository:** https://github.com/PrasannaSaiS/CoMemor  
**Reference audit:** The attached conversation/reference containing findings F-01 through F-07 and C-01 through C-08, together with the Aulite comparison.  
**Audit baseline examined:** Public `main` at approximately 2026-11-12; the agent must re-check the live working tree before relying on this baseline.

---

## How to use this prompt pack

1. Give the agent the attached audit/reference and the **Global Operating Contract** below.
2. Run **Phase 0** first. It is an audit and execution-plan phase; it must not modify the repository.
3. Run Phases **1–5 sequentially**, one phase per agent task. Do not ask the agent to implement all phases in one run.
4. Run **Phase 6** as an independent release-readiness audit after implementation is complete.
5. Do not publish, tag, or release v1.1 merely because the agent reports that the phases passed. Review the final evidence and approve release actions separately.

The phases are deliberately ordered by dependency. Verification must have a trustworthy data model; retrieval quality depends on reliable storage; benchmark claims depend on the retrieval implementation; dashboard and documentation must describe the final implementation, not an intended design.

---

# PHASE 0 — CURRENT-STATE RE-AUDIT & IMPLEMENTATION PLAN

## AGENT PERSONA & ROLE DEFINITION

Act as an independent senior reviewer. Your task is to establish the current state of CoMemor and decide which audit findings still apply. This phase is strictly read-only.

## STRICT OPERATIONAL CONSTRAINTS & SECURITY BOUNDARIES

- Do not modify, format, generate, delete, rename, or move any repository file.
- Do not install or update dependencies.
- Do not run commands that modify the working tree or persisted `.agent-memory` data.
- Preserve all pre-existing staged, unstaged, and untracked changes.
- Do not assume that the public `main` branch is identical to the user's local checkout.

## STEP-BY-STEP EXECUTION SCAFFOLDING

1. Record branch, HEAD SHA, and `git status --short`.
2. Read repository instructions, `package.json`, lockfile metadata, TypeScript/lint/test configuration, README, changelog, architecture docs, threat model, limitations, dashboard spec, and relevant ADRs.
3. Trace each finding from its source entry point to its callers, persistence path, response schema, dashboard consumer, and tests.
4. Revalidate the following findings individually:
   - **F-01 / C-01:** verification status, event history, Wilson score calculation, stats semantics, and whether a successful policy check is incorrectly counted as a successful fix.
   - **F-02:** FTS5 token extraction, error-code preservation, boilerplate handling, candidate fallback, and actual retrieval ranking.
   - **F-03:** startup reconciliation, canonical JSONL comparison, index metadata, and detection of modified records with unchanged count/IDs.
   - **F-04:** command policy classifications, interpreter/runner behavior, host execution boundary, and any remaining execution path.
   - **F-05 / C-04:** package-manager inference and environment metadata.
   - **F-06:** documentation claims versus the current implementation, including old approval/execution descriptions.
   - **F-07 / C-08:** benchmark methodology, iteration count, percentile metrics, dataset diversity, and retrieval-quality measurement.
   - **C-02:** JSONL locking, relational SQLite writes, FTS5 writes, transaction boundaries, crash recovery, and dirty-index behavior.
   - **C-03:** malformed JSONL handling, recovery evidence, and preservation of the original canonical file.
   - **C-05:** retrieval explainability and exposed scoring signals.
   - **C-06:** repository identity across clones, forks, renamed repositories, and worktrees.
   - **C-07:** dashboard semantics after removing server-side command execution.
5. Inspect tests for false confidence: assertions that only test a helper but not the live MCP call path; tests that verify counts without validating semantic correctness; and tests that depend on platform-specific behavior.
6. Run only non-mutating baseline checks that are safe in the current working tree. If a test/build creates generated files, establish that behavior first and avoid overwriting user data.
7. Produce a phase dependency plan. Identify which findings are already fixed, which need additional tests, and which are genuinely unresolved.

## TOOL/FUNCTION CALLING SPECS & SCHEMA

No new MCP tools or persisted schemas may be introduced in this phase. Use source inspection, existing tests, and safe read-only commands only.

Create a report in your response or a new, clearly named audit document only if creating that document does not modify any pre-existing user file. Do not modify project files in this phase.

## EDGE-CASE HANDLING & SELF-CORRECTION

- If a finding is already fixed, verify the live call path and tests before marking it resolved.
- If a test claims coverage but does not exercise the actual tool handler, label it insufficient.
- If source code and documentation disagree, describe both and identify which reflects runtime behavior.
- If any test cannot run due to environment limitations, do not infer its result.

## ACCEPTANCE CRITERIA & FINAL REPORT

Deliver:

1. A matrix for F-01–F-07 and C-01–C-08: RESOLVED / PARTIALLY RESOLVED / OPEN / REGRESSED / NOT VERIFIED.
2. Exact source locations and call-path evidence for every OPEN or REGRESSED finding.
3. Current architecture summary for record creation, retrieval, verification, index reconciliation, and dashboard operations.
4. A dependency-ordered implementation plan for Phases 1–5 below, adjusted to skip already-resolved work.
5. Regression tests required for each remaining gap.
6. A list of files that must not be touched because they contain user changes.

**Stop after the report. Do not implement anything in Phase 0.**

---

# PHASE 1 — VERIFICATION EVENT MODEL & HONEST WILSON CONFIDENCE

## AGENT PERSONA & ROLE DEFINITION

Act as a senior data-model and MCP protocol engineer. Implement trustworthy, auditable feedback about whether a proposed historical fix actually resolved a failure. Do not conflate command-policy validation with remediation success.

## STRICT OPERATIONAL CONSTRAINTS & SECURITY BOUNDARIES

- `verify_fix` remains policy-assessment-only and must never update a record to passed merely because a command passed policy checks or a dry-run.
- CoMemor does not execute commands and cannot independently observe the host's test result. Any reported outcome must be labelled as a host/operator assertion unless independently verifiable evidence is actually integrated.
- Never call a host-reported or human-reported outcome cryptographically verified.
- Preserve existing memory records. Do not rewrite `records.jsonl` to insert verification history.
- Keep verification feedback idempotent and protected by the project's cross-process locking strategy.
- Do not expose raw test logs, command output, environment values, or secrets as evidence payloads.

## STEP-BY-STEP EXECUTION SCAFFOLDING

1. Inspect current `MemoryRecord` and verification types, `calculateWilsonScoreLowerBound` / any Wilson interval helpers, `verifyFix`, MCP tool registration, input/output schemas, SQLite projections, stats response, dashboard consumers, and relevant tests.
2. Write a small ADR describing the chosen data model and the trust limitation before implementation.
3. Implement an append-only verification event source of truth. Preferred design: a dedicated `.agent-memory/verification-events.jsonl`, unless the existing architecture has a demonstrably better append-only event mechanism.
4. Each event should capture at least:
   - schema version;
   - unique event ID;
   - unique attempt/idempotency ID;
   - referenced memory record ID;
   - outcome: `passed` or `failed`;
   - report source/method, such as `host_reported` or `human_confirmed`;
   - server-recorded timestamp;
   - optional reported timestamp;
   - optional bounded evidence reference/metadata, never raw logs or secrets.
5. Define semantics explicitly:
   - `unknown` is the absence of an outcome, not a success/failure event.
   - Each distinct attempt ID represents one actual attempt.
   - Replaying the same attempt ID must not increment counts twice.
   - A retry must use a new attempt ID.
   - Outcomes must reference an existing record in the same repository scope.
   - Reporter/method metadata is caller-reported unless authenticated evidence exists; do not claim identity verification.
6. Add an MCP tool named `record_verification_outcome` (or follow the repository's naming convention if it has a clearer existing equivalent). Wire it through the actual server tool registration and response validation.
7. Build a derived per-record verification summary from the append-only event history. At minimum, it must expose attempt count, successes, failures, latest outcome, latest verification time/method, and Wilson lower bound.
8. Compute Wilson confidence from actual unique passed/failed attempts. Reuse and test the existing Wilson implementation if mathematically correct. Return `null` when no outcome exists. Validate boundary cases: zero successes, all successes, all failures, one attempt, and many attempts.
9. Correct statistics semantics. Do not call a record with a failed outcome a successful verified fix. Provide unambiguous metrics such as successful verification attempts, failed attempts, records with a successful outcome, records with no outcome, and aggregate success rate. Preserve old fields only as deprecated compatibility aliases with explicit documented meaning, if required by existing clients.
10. Update retrieval confidence/staleness logic to use the correct derived verification evidence. A failed latest outcome can mark a record stale; a policy check alone cannot increase confidence.
11. Add cross-process locking for verification event appends and ensure the SQLite projection can be rebuilt from canonical records plus verification events.
12. Add tests covering duplicate event IDs/attempt IDs, non-existent record IDs, conflicting duplicates, out-of-order timestamps, malformed event lines, concurrent writers, failed index projection, and summary reconstruction after deleting SQLite.

## TOOL/FUNCTION CALLING SPECS & SCHEMA

Proposed MCP input contract (adapt to repository schema conventions and enforce strict size limits):

```ts
{
  recordId: string;                 // required, bounded
  attemptId: string;                // required idempotency key, bounded
  outcome: 'passed' | 'failed';
  method: 'host_reported' | 'human_confirmed';
  reportedAt?: string;              // optional ISO-8601, validated
  evidenceRef?: string;             // optional bounded reference, no raw log content
  note?: string;                    // optional, redacted and size-limited
}
```

Expected behavior:

- First submission for an attempt ID creates one event and returns the updated summary.
- Exact replay of the same attempt is idempotent and returns the existing event/summary without incrementing counts.
- Reuse of an attempt ID with different record/outcome/method is rejected as an idempotency conflict.
- Invalid or unknown record IDs are rejected without writing an event.
- The tool must never execute a command or infer success from a command-policy result.

Expected per-record summary (field names may follow existing type conventions):

```ts
{
  attemptCount: number;
  successCount: number;
  failureCount: number;
  latestOutcome: 'passed' | 'failed' | null;
  latestOutcomeAt: string | null;
  latestMethod: 'host_reported' | 'human_confirmed' | null;
  wilsonLowerBound: number | null;
}
```

## EDGE-CASE HANDLING & SELF-CORRECTION

- Treat multiple reports for the same execution attempt as duplicates, not independent trials.
- Do not trust client timestamps to define event ordering; use a server-recorded sequence/time for canonical ordering and retain reported time only as metadata.
- Malformed event lines must be reported and preserved; never silently discard the original event file.
- If the same record is superseded, preserve its verification history but ensure retrieval can identify that it has been superseded.
- Do not aggregate outcomes from different fixes or different repository identities into one Wilson score.
- If event authenticity cannot be established, expose the evidence source honestly and document the trust limitation.

## ACCEPTANCE CRITERIA & FINAL REPORT

- `verify_fix` remains policy-only and never sets remediation status to passed.
- The new feedback tool is registered, schema-validated, documented, and tested end-to-end through its live MCP handler.
- Verification history is append-only and idempotent.
- Wilson values are derived from unique real outcome events; no events means `null`.
- Stats distinguish successful attempts, failed attempts, and unverified records correctly.
- SQLite can reconstruct all verification projections from canonical files.
- Existing records and existing MCP consumers remain compatible or have a documented migration.
- Report the exact tests and resulting data-model/ADR changes.

---

# PHASE 2 — CANONICAL STORAGE INTEGRITY, SQLITE/FTS TRANSACTIONS & RECOVERY

## AGENT PERSONA & ROLE DEFINITION

Act as a senior persistence engineer. Make the canonical JSONL store and its SQLite/FTS5 projection recoverable under concurrent processes, external edits, partial failures, and process crashes. JSONL remains the source of truth; SQLite remains rebuildable.

## STRICT OPERATIONAL CONSTRAINTS & SECURITY BOUNDARIES

- Never silently rewrite, truncate, reorder, or delete canonical JSONL data.
- Never promote SQLite to the authoritative store.
- Do not mark an index clean unless the relational and FTS projections correspond to a stable canonical snapshot.
- Do not log corrupt line contents or raw sensitive values.
- Preserve the existing cross-platform `proper-lockfile` strategy unless tests prove it insufficient; do not replace it with an untested platform-specific lock.
- Coordinate this phase with Phase 1's additional canonical verification-event file if Phase 1 has been implemented.

## STEP-BY-STEP EXECUTION SCAFFOLDING

1. Inspect `JsonlStorage`, lock helpers, `MemoryService` write paths, `SqliteIndex.indexRecord`, FTS5 operations, rebuild/reconcile methods, SQLite metadata, startup flow, and multi-process tests.
2. Document the current write order and crash windows. Include record writes, verification-event writes if present, FTS updates, metadata writes, and index rebuilds.
3. Design a single explicit storage consistency protocol. It must coordinate canonical JSONL mutations, index projection updates, and reconciliation under a compatible cross-process lock. Avoid nested acquisition/deadlock when an already-locked helper calls another helper.
4. Add canonical-file fingerprints to `index_metadata`. At minimum track SHA-256 of each canonical JSONL file that contributes to the index, byte size, index schema version, and last successful reconciliation timestamp.
5. Hash the exact canonical file bytes, not re-serialized parsed JSON. This detects same-count/same-ID edits, whitespace changes, line-ending changes, reorderings, and truncation.
6. Ensure the fingerprint and index state are published together. The index must not record a new canonical fingerprint if the corresponding SQLite projection transaction did not commit.
7. Coordinate all write paths. A safe protocol should make an interrupted write detectable (for example, mark projection dirty before canonical mutation, perform append and index update under the shared store lock, then commit the stable canonical fingerprint and clean state). Validate the protocol against crash points rather than adopting this sequence blindly.
8. Make `indexRecord` transactional across both the relational `records` table and the FTS5 table. Remove silent swallowing of FTS5 failures. An FTS failure must roll back the relational change or mark the entire projection dirty in a way that guarantees recovery before stale results are served.
9. Make `rebuildIndex` transactional and include the metadata update in the same transaction. On rollback, the index must remain dirty.
10. Reconciliation should rebuild when any canonical fingerprint differs, schema version differs, dirty marker is set, record counts differ, or required IDs are missing. Also detect stale/extra SQLite IDs, not just missing ones.
11. Define when reconciliation occurs: at startup and whenever a dirty or externally changed canonical snapshot is detected before retrieval. Consider a safe, measurable strategy for long-running processes; do not rely on mtime/size alone for correctness. If full hashing every lookup is too expensive, combine file-watch/metadata fast paths with explicit hash verification and document the consistency guarantees.
12. Handle concurrent processes sharing the same workspace. Test two or more independent MCP processes that append records while another process is reconciling or querying.
13. Improve corrupt-line recovery:
    - Preserve the original canonical file byte-for-byte.
    - Report line number and byte offset where practical, SHA-256 of the malformed line, file hash, recovery time, valid-record count, malformed-line count, and partial-recovery status.
    - Do not log raw corrupted line contents.
    - If a separate raw recovery artifact is necessary, keep it local, permission-restricted, gitignored, and explicitly marked as potentially secret-bearing. Do not silently create a public/shareable artifact.
14. Add failure-injection tests for crash/failure after dirty marking, after JSONL append, during relational insert, during FTS insert, during metadata update, and during rebuild commit.
15. Add tests for same-count/same-ID edits, record reordering, byte-only edits, truncation, extra stale SQLite rows, schema-version change, malformed JSONL, concurrent processes, and recovery after deleting `index.db`.

## TOOL/FUNCTION CALLING SPECS & SCHEMA

No new public MCP tool is required unless an explicit operator-facing resync/recovery action is necessary. If one is added, make it read-only or safely repair only the SQLite projection from canonical data; it must never rewrite canonical JSONL.

Suggested metadata keys:

```text
canonical_records_sha256
canonical_records_size
canonical_verification_events_sha256   # only if Phase 1 adds this file
canonical_verification_events_size
index_schema_version
last_reconciled_at
is_dirty
```

Use a documented schema version constant and explicit migration/rebuild logic.

## EDGE-CASE HANDLING & SELF-CORRECTION

- Treat JSONL as potentially modified externally through Git merges, branch switches, manual edits, or synchronization tools.
- Handle empty files, files without a trailing newline, CRLF/LF differences, duplicate record IDs, malformed lines between valid lines, and permission failures.
- If a stable snapshot cannot be obtained, do not declare reconciliation successful.
- If hashing/rebuilding fails, fail safely: retain the dirty marker and prevent the application from silently treating a stale index as current.
- Ensure lock stale-timeout behavior cannot cause two writers to believe they own the store concurrently.
- Do not claim JSONL+SQLite are one atomic database transaction. Explain the recovery protocol and its remaining crash boundaries accurately.

## ACCEPTANCE CRITERIA & FINAL REPORT

- Existing-record edits with unchanged record count and IDs are detected.
- Relational and FTS5 projections update transactionally.
- FTS5 failures are visible and recoverable, not swallowed.
- Interrupted writes leave a detectable dirty/inconsistent state and recover from canonical JSONL.
- Reconciliation never updates the clean fingerprint for a partial/unstable projection.
- Corrupt input is reported without losing or exposing original bytes.
- Multi-process and failure-injection tests pass on the available OS; report OS coverage honestly.
- Existing valid `.agent-memory` directories remain usable without destructive migration.

---

# PHASE 3 — HIGH-SIGNAL RETRIEVAL, EXPLAINABILITY & QUALITY BENCHMARKS

## AGENT PERSONA & ROLE DEFINITION

Act as a retrieval/search engineer with responsibility for ranking correctness, not merely search speed. Improve the quality of FTS5 candidate generation while preserving exact fingerprint matching and conservative fuzzy scoring.

Use the layered-analysis principle observed in Aulite as inspiration: inexpensive deterministic extraction first, more expensive scoring later, with clear explanations at each stage. Do not copy Aulite's HTTP proxy, compliance rules, or unrelated product architecture.

## STRICT OPERATIONAL CONSTRAINTS & SECURITY BOUNDARIES

- Preserve exact SHA-256 fingerprint matching behavior and repository isolation.
- Do not label lexical matching as semantic or embedding-based retrieval.
- Do not lower similarity thresholds simply to increase match counts.
- Do not return quarantined records unless the existing explicit include-quarantined behavior permits it.
- Do not let generic runner boilerplate dominate diagnostic similarity.
- Keep query token counts, query length, candidate count, and FTS work bounded to prevent denial of service.
- A high similarity score must never be represented as proof that a fix is safe or applicable.

## STEP-BY-STEP EXECUTION SCAFFOLDING

1. Inspect normalizer, fingerprint generator, command-family extraction, token/trigram similarity, `findCandidates`, FTS5 schema/tokenizer, query construction, thresholds, output types, and current benchmark scripts/fixtures.
2. Reproduce the first-ten-token failure using a realistic long log where the decisive diagnostic appears after generic package-runner output.
3. Build a deterministic diagnostic-signal extractor that preserves high-value tokens from the whole log, not just its prefix.
4. Prioritize signals such as:
   - compiler/error codes (`TS2322`, `EADDRINUSE`, `ERR_MODULE_NOT_FOUND`);
   - exception names (`TypeError`, `ReferenceError`, `ModuleNotFoundError`);
   - package/dependency names and version constraints;
   - test names and assertion identifiers;
   - file paths, extensions, and relevant line context;
   - rare technical identifiers.
5. Downweight or remove generic boilerplate (`npm`, generic `error`, `failed`, repeated runner banners) only when evidence supports doing so. Avoid deleting diagnostic terms that are meaningful in a particular toolchain.
6. Build a bounded weighted candidate-token set using beginning, middle, and end regions plus extracted signals. Do not merely switch from the first ten tokens to the last ten.
7. Preserve token forms needed for error codes and identifiers. Confirm how the configured FTS5 tokenizer treats underscores, dots, colons, hyphens, and mixed case. Escape/quote generated FTS expressions safely.
8. Preserve FTS5 BM25 candidate selection followed by the existing similarity scorer unless evaluation demonstrates a better bounded approach. If multiple query tokens are used, ensure important tokens can contribute without requiring every token to match.
9. Retain a safe fallback when FTS5 returns no candidates or a query is invalid. The fallback must not accidentally return arbitrary unrelated records as confident matches.
10. Add retrieval diagnostics to each candidate or a separate explainability structure:
    - match type (exact/fuzzy);
    - extracted diagnostic signals;
    - matched/high-value tokens where practical;
    - token/Jaccard and trigram components;
    - command-family and repository filters;
    - environment compatibility signals where available;
    - verification/staleness/quarantine effects;
    - concise acceptance/rejection reasons.
11. Keep the explanation data bounded and redact it as appropriate. Do not return entire indexed corpora or sensitive raw logs merely for explainability.
12. Build a labelled retrieval-quality fixture set with expected relevant record IDs and hard negatives. Include TypeScript/compiler, Python dependency/import, Node/build, test-runner, port/network, configuration, dependency-conflict, and platform-specific failures. Fixtures must be synthetic or sanitized and must not contain real credentials or copyrighted/private customer logs.
13. Measure Recall@K, Precision@K, MRR, and preferably nDCG@K over the labelled fixture set. Include false-reuse cases where superficially similar errors require different fixes.
14. Separate retrieval-quality benchmarking from latency benchmarking. Expand latency measurement with warm-up, sufficient measured iterations (target at least 300 per query/scale unless resource limits are documented), p50/p95/p99, and a reproducibility manifest.
15. Measure 100, 1,000, and 10,000 record scales at minimum. Add 100,000 only if the local environment can run it reliably without destabilizing development. Rebuild the project before invoking compiled benchmark entry points.
16. Compare baseline and modified retrieval on the same dataset and queries. Report regressions as well as improvements. Do not publish new numbers unless the run is reproducible.

## TOOL/FUNCTION CALLING SPECS & SCHEMA

No new MCP tool is required for this phase. If explainability metadata changes `find_fix` response types, update input/output Zod schemas, TypeScript types, MCP registration, documentation, dashboard API/client, and compatibility tests together.

Keep the existing public `find_fix` defaults and exact-match semantics unless a measured and documented reason justifies a behavior change.

## EDGE-CASE HANDLING & SELF-CORRECTION

- Logs may contain multiple unrelated errors. Avoid treating every token from the entire output as one diagnostic identity.
- Error codes can appear only near the end, inside stack traces, or after ANSI/control characters.
- File paths can be Windows or POSIX paths.
- FTS5 tokenization can split technical identifiers unexpectedly; test actual retrieval, not only the extractor helper.
- A query with only generic tokens should return no confident fuzzy match rather than noisy candidates.
- Hard negatives must test that similar package-manager boilerplate does not cause a wrong fix to rank highly.
- Keep exact matching independent from improvements to fuzzy token extraction.

## ACCEPTANCE CRITERIA & FINAL REPORT

- The decisive error code/exception/path remains searchable even when it appears after the first ten tokens.
- FTS5 candidate generation is bounded, safely quoted, and has a tested fallback.
- Retrieval quality improves or is at least not regressed on the labelled evaluation set; report per-metric before/after results.
- Hard negatives do not produce unsafe high-confidence false reuse.
- Candidate explanations match the actual scoring path and do not invent reasons.
- Latency results include warm-up, p50/p95/p99, environment manifest, and reproducible commands.
- All public response/schema/dashboard changes remain compatible or are versioned/documented.

---

# PHASE 4 — COMMAND POLICY CLARITY, ENVIRONMENT FINGERPRINTS & REPOSITORY IDENTITY

## AGENT PERSONA & ROLE DEFINITION

Act as a security-minded platform engineer. Improve the context surrounding historical fixes so CoMemor can tell developers when a memory was created under a materially different toolchain or repository context. Keep policy assessment separate from execution safety.

## STRICT OPERATIONAL CONSTRAINTS & SECURITY BOUNDARIES

- CoMemor must remain non-executing. Do not use `exec`, `spawn`, shell scripts, or package-manager invocations to test proposed commands.
- A command allowlist is not a sandbox and cannot guarantee that a project script, package lifecycle hook, compiler plugin, or interpreter script is safe.
- Do not label arbitrary project-defined commands as intrinsically safe merely because the executable is allowlisted.
- Do not collect secrets, Git credentials, raw remote URLs containing credentials, personal home-directory paths, or unnecessary host identity.
- Do not change repository IDs in a way that strands existing records. Preserve explicit `AGENT_MEMORY_REPO` overrides and define legacy compatibility.

## STEP-BY-STEP EXECUTION SCAFFOLDING

### A. Command proposal risk semantics

1. Inspect `commandPolicy.ts`, parser/tokenizer, allowlist/denylist, path containment, MCP `verify_fix` handler, pending/resolved approval artifacts, and tests.
2. Ensure every response is described as a **policy assessment/proposal**, not proof of execution safety.
3. Review commands whose executable can invoke arbitrary code or network access: `npx`, `bunx`, `npm install`, `npm run`, `python <script>`, `python -m`, `go run`, Cargo build scripts/proc macros, and equivalent patterns.
4. Use context-aware risk reasons. For example, `npm test` may execute repository-controlled scripts; it must not be described as universally safe. `cargo check` can execute build scripts or procedural macros. Remote package runners deserve an elevated warning.
5. Retain strict rejection of shell metacharacter injection, destructive command forms, and workspace path escapes. Review argument parsing against quoting, whitespace, `--flag=value`, absolute paths, `..`, and Windows drive/UNC paths.
6. Return the assessed command, risk level, policy decision, and concrete reasons. Do not use “sandboxed”, “safe to execute”, or similar absolute labels.
7. Add tests for allowed binary + dangerous argument combinations and for the absence of any command execution path.

### B. Package-manager and toolchain metadata

8. Replace hardcoded `packageManager: 'npm'` with evidence-based inference.
9. Infer the command's actual tool first (for example, `pnpm test` means pnpm for that invocation; `cargo check` means Cargo). Use package metadata such as `package.json`'s `packageManager` field and lockfiles as secondary context. If the repository has conflicting lockfiles or the source is ambiguous, record `unknown`/`ambiguous`, not a guess.
10. Support relevant ecosystems already implied by the codebase and lockfile detector, including npm, pnpm, Yarn, Bun, Cargo, Go, Poetry, pip/requirements, and any others only if a clear implementation need exists.
11. Capture low-cost environment facts that are directly available: OS, architecture, current Node runtime, detected package manager, lockfile fingerprints, and relevant project-declared tool versions. Do not execute compilers or package managers merely to collect versions by default.
12. If optional toolchain probing is introduced, make it opt-in, bounded by timeout/output size, `shell: false`, and non-fatal. Never invoke project scripts during environment collection.
13. Keep environment metadata bounded and schema-versioned. Avoid storing machine-specific absolute paths or personal identifiers.

### C. Repository/workspace identity

14. Inspect the current `AGENT_MEMORY_REPO` behavior, default repository identifier, Git provenance, worktree support, repository filtering, record schema, and existing user-data migration assumptions.
15. Define separate concepts for:
    - stable repository identity;
    - local workspace/clone identity;
    - Git worktree identity;
    - branch and commit provenance.
16. Use a normalized origin remote as one possible stable repository identifier, but never persist embedded credentials or query strings. Consider storing a deterministic hash of a normalized remote identifier rather than the raw URL by default. Handle HTTPS and SSH remote syntax, nested Git hosting groups, trailing `.git`, and case normalization safely.
17. Preserve the explicit `AGENT_MEMORY_REPO` override. For no-remote/non-Git workspaces, use a documented deterministic local fallback without conflating unrelated repositories that share a folder name.
18. Define fork behavior: forks should not silently share a repository identity with their upstream unless the user explicitly configures shared memory.
19. Support multiple worktrees for one repository without assuming each worktree is a separate repository. Keep workspace identity separate so worktree-specific context can still be distinguished.
20. Introduce the new identity model additively. Existing records must remain retrievable. If migrations or alias lookups are necessary, implement and test them; do not bulk-rewrite `records.jsonl` without a documented, reversible migration.
21. Document how users can explicitly set or override repository identity and how shared/forked repositories behave.

## TOOL/FUNCTION CALLING SPECS & SCHEMA

No new MCP tool is required. Any expanded environment/repository metadata must be reflected in persisted schemas, type definitions, Zod validation, index columns or JSON projection, migration/rebuild logic, and resource responses.

Keep optional metadata optional when Git or project metadata is unavailable. Unknown is a valid state, not an error.

## EDGE-CASE HANDLING & SELF-CORRECTION

- Missing Git, detached HEAD, shallow clone, no `origin`, multiple remotes, remote URL credential syntax, SSH aliases, Windows paths, Git worktrees, forks, renamed remotes, and monorepos must be considered.
- Multiple lockfiles can coexist legitimately in a monorepo; do not make a global assumption from one root-level file.
- Project scripts are untrusted executable content even when named `test` or `build`.
- A policy score is a proposal-review signal, not execution authorization.
- If repository identity cannot be calculated safely, preserve a stable fallback and clearly expose its lower confidence.

## ACCEPTANCE CRITERIA & FINAL REPORT

- No server-side command execution is introduced.
- Risk assessment accurately warns about arbitrary scripts, remote package execution, lifecycle hooks, and interpreter invocation.
- Shell/path-containment protections remain intact and have expanded tests.
- Package-manager inference uses the actual command when possible and never silently defaults to npm when ambiguous.
- Environment metadata is bounded, low-cost, and secret-free.
- Repository, workspace, and worktree identity are distinct and documented.
- Existing records and explicit repository overrides remain compatible.
- Include tests for package-manager precedence, conflicting lockfiles, non-Git folders, remote URL normalization, forks, clones, and worktrees.

---

# PHASE 5 — MEMORY CONSOLE ALIGNMENT, DOCUMENTATION TRUTH & PRODUCT CREDIBILITY

## AGENT PERSONA & ROLE DEFINITION

Act as a technical product engineer and documentation owner. Make the Memory Console and all project documentation tell the truth about the implemented CoMemor architecture. Use Aulite only as design inspiration for layered analysis, operational observability, and evidence-oriented reporting.

## STRICT OPERATIONAL CONSTRAINTS & SECURITY BOUNDARIES

- Do not implement Aulite's HTTP AI-provider proxy, EU AI Act rules, provider routing, compliance features, or unrelated business model.
- Do not implement Sigstore/Rekor anchoring or a new cryptographic lifecycle event chain in this phase. Those are later roadmap candidates and require separate threat modelling.
- Do not fabricate metrics, benchmark results, verification outcomes, or production-readiness statements.
- Do not delete historical audit reports or rewrite their original dates/version scope. Mark historical documents clearly and add current documentation separately.
- Do not imply that CoMemor executes commands, approves host execution, or independently verifies fixes.
- Keep dashboard access within its existing local trust boundary; do not add remote exposure or weaken authentication/binding constraints.

## STEP-BY-STEP EXECUTION SCAFFOLDING

### A. Dashboard behavior and terminology

1. Inspect the dashboard bridge APIs, frontend pages, data contracts, SSE/log feed, record browser, retrieval diagnostics, approval queue, and all current references to `verify_fix`.
2. Remove or rewrite outdated approval-to-server-execution interactions. The dashboard must represent a policy proposal and its audit status only; it must not claim that approving an item causes CoMemor to execute it.
3. Add verification-history presentation from Phase 1: attempts, outcomes, source/method, timestamps, and Wilson lower-bound evidence. Visibly label host-reported or human-reported outcomes as reported evidence.
4. Update retrieval explainability to show actual matching signals, score components, environment compatibility, staleness, quarantine, and verification evidence from Phase 3. Do not invent explanations when the backend does not supply them.
5. Show storage/index status from real reconciliation metadata, including dirty/rebuilding/error states. Do not label the index healthy just because SQLite opens.
6. Update the activity feed to distinguish record creation, candidate retrieval, policy assessment, externally reported verification, quarantine, and reconciliation.
7. Ensure empty, malformed, stale, and partial states are visible and understandable. Do not crash the dashboard when optional fields from older records are absent.
8. Add a lightweight evidence-oriented metrics section only if the corresponding backend data exists. Useful examples: records stored, retrieval requests, exact/fuzzy match distribution, reported successful/failed outcomes, unverified records, stale records, quarantined records, and benchmark version. Do not estimate time saved without a validated measurement method.

### B. Documentation source-of-truth alignment

9. Treat current source, runtime behavior, tests, and current schemas as authoritative. Inspect every linked documentation page before editing.
10. Update `README.md`, architecture docs, threat model, limitations, dashboard spec, user guide, operations docs, tool reference, and ADR index so they describe the same architecture.
11. Specifically remove outdated statements claiming:
    - CoMemor executes remediation commands;
    - approval files authorize server-side execution;
    - a command allowlist is an OS sandbox;
    - a dry-run passing means a fix succeeded;
    - Wilson scores are populated automatically without outcome feedback;
    - old database/library or approval-file names that are no longer used.
12. Explain the trust boundary: CoMemor validates a proposed command and records reported outcomes; the host IDE/agent executes only through its own user-confirmation flow.
13. Describe verification outcomes as host/operator-reported unless another evidence source is actually authenticated and validated.
14. Make retrieval terminology precise: exact fingerprint matching and fuzzy lexical/FTS5 retrieval are distinct from semantic embedding retrieval.
15. Update the limitations page to include any remaining redaction evasion, heuristic poisoning limitations, repository identity fallbacks, malformed JSONL recovery limits, environment metadata gaps, and benchmark dataset limitations.
16. Keep `docs/production-readiness-audit.md` as historical evidence for the version/date it audited. Add a new dated audit or status note for the current code. Never change a historical result to make it appear that the current release was tested at that earlier date.
17. Update `CHANGELOG.md` with an `Unreleased` section for implemented work. Do not create a released `1.1.0` section or bump package version until a release is approved.
18. Confirm current license and package metadata from the live repository. Do not alter the GPL license. Ensure README badge, `package.json`, LICENSE file, and any published metadata agree.
19. Align README runtime requirement, MCP SDK/spec compatibility description, storage implementation (`node:sqlite` if still used), file names, dashboard start commands, tool names, and environment variables with actual code.

### C. Benchmark and landing-page credibility

20. Publish exact metrics only when supported by a reproducible run and the current script/dataset. Include test environment and distinguish mean from p50/p95/p99.
21. Scope the poisoning and redaction results to their exact supplied test corpus. State that 44/44 fixture detection does not demonstrate comprehensive prompt-injection detection and that corpus-specific secret recall is not a guarantee.
22. Link to benchmark scripts, methodology, and result files. Do not show old numbers as freshly measured.
23. Make the Memory Console demonstrate why a memory was returned and what evidence supports it, not just show stored records.

### D. Documentation quality validation

24. Search the repository for stale phrases such as `sandbox`, `execute`, `approval`, old filenames, old package versions, old MCP specification dates, old SQLite packages, and outdated API field names. Inspect every match in context; do not blindly replace legitimate historical references.
25. Run link checks or equivalent repository-local checks where available. Verify code snippets and MCP configuration examples against actual supported hosts and current tool names.
26. Review screenshots and dashboard descriptions for stale UI labels. If screenshots are obsolete, either replace them with current screenshots or label them as historical; do not fabricate them.

## TOOL/FUNCTION CALLING SPECS & SCHEMA

No new public tool is required in this phase. Keep dashboard and docs in sync with the actual MCP and HTTP response contracts implemented in earlier phases.

The dashboard must not write any artifact that can authorize or execute a command. If it records an operator decision, that decision is explicitly an audit annotation only.

## EDGE-CASE HANDLING & SELF-CORRECTION

- Older persisted records may lack new verification or environment fields. Render them as unknown/legacy rather than failing.
- If the frontend cannot display a metric because the backend does not provide evidence, omit the metric instead of calculating an unsupported substitute.
- Historical audit docs may legitimately mention older behavior; label their historical scope rather than deleting useful provenance.
- Do not change protocol/spec claims based only on a dependency version. Verify the actual SDK and implemented protocol baseline.
- Keep local-only dashboard security boundaries intact.

## ACCEPTANCE CRITERIA & FINAL REPORT

- Dashboard terminology matches the policy-only execution architecture.
- Verification data and retrieval explanations come from real backend fields.
- Storage health represents actual reconciliation state.
- README and current docs contain no materially false implementation claims.
- Historical audit reports retain their original scope and date.
- Changelog has an accurate Unreleased section, not an invented release.
- Security, benchmark, and performance metrics include scope and methodology.
- Existing dashboard pages continue to function with older records.
- Provide a documentation consistency matrix listing important claims, their source-code evidence, and the docs updated.

---

# PHASE 6 — INDEPENDENT REGRESSION AUDIT & v1.1 RELEASE GATE

## AGENT PERSONA & ROLE DEFINITION

Act as an independent release auditor who did not implement the changes. Your purpose is to challenge the work, detect regressions, and decide whether the candidate is ready for human release approval.

## STRICT OPERATIONAL CONSTRAINTS & SECURITY BOUNDARIES

- Start by recording `git status --short`, branch, and HEAD. Do not erase or overwrite user changes.
- Do not modify code during the initial audit. If a defect is found, report it and produce a separate minimal remediation prompt; do not silently patch it while acting as the independent auditor.
- Do not publish, tag, push, or create a GitHub release.
- Do not describe the package as production-ready solely because unit tests pass.

## STEP-BY-STEP EXECUTION SCAFFOLDING

1. Verify that Phases 1–5 have corresponding implementation, tests, documentation, and final reports.
2. Independently inspect the live call path for:
   - verification outcome tool registration and persistence;
   - duplicate attempt handling and Wilson math;
   - `verify_fix` non-execution invariant;
   - JSONL locking and recovery;
   - canonical hash/fingerprint metadata and reconciliation;
   - transactional relational/FTS5 updates;
   - FTS token extraction and ranking;
   - retrieval-quality metrics and hard negatives;
   - package-manager/environment inference;
   - repository/workspace identity compatibility;
   - dashboard and documentation accuracy.
3. Run the full project validation command(s), including build, typecheck, lint, format, unit, integration, security, e2e, and dashboard checks where scripts exist. Use the project's actual script names.
4. Run targeted regression suites for every previously reported finding.
5. Run cross-process tests and benchmark scripts if supported by the current environment. Report platform coverage honestly.
6. Inspect package contents with `npm pack --dry-run` or the package manager equivalent. Do not publish the package.
7. Search for accidental `console.log`/stdout writes in the MCP process, server-side command execution, stale file names, old approval semantics, secrets in fixtures, unbounded inputs, and weakened security assertions.
8. Inspect git diff for unrelated changes, generated artifacts, accidental data files, dependency drift, or modified historical evidence.
9. Produce a release-readiness matrix with PASS / FAIL / NOT RUN / NOT APPLICABLE, and evidence for each result.

## TOOL/FUNCTION CALLING SPECS & SCHEMA

No new tools or features should be implemented in this phase. This is a verification-only phase.

## EDGE-CASE HANDLING & SELF-CORRECTION

- Do not infer cross-platform correctness from one operating system.
- Do not infer benchmark improvements from a single run.
- Do not treat a high retrieval score as a correct fix without labelled relevance evidence.
- Do not treat host-reported outcomes as authenticated execution evidence.
- Do not treat a clean `npm audit` result as proof of application security.
- Report tests that were skipped due to environment limitations as NOT RUN.

## ACCEPTANCE CRITERIA & FINAL REPORT

Deliver:

1. A complete phase-by-phase completion matrix.
2. Full validation commands and exact test counts/results.
3. Regression matrix for F-01–F-07 and C-01–C-08.
4. Security boundary review, including confirmation that CoMemor has no server-side remediation execution path.
5. Storage integrity and recovery test evidence.
6. Retrieval quality and latency results, with reproducibility manifest.
7. Documentation consistency results.
8. Packaging inspection results.
9. All remaining risks and unrun checks.
10. Final verdict: READY FOR HUMAN RELEASE REVIEW / NOT READY.

**Do not release. A READY verdict only authorizes the user to review and decide whether to release.**

---

# DEFERRED IDEAS — explicitly out of scope for v1.1

The following ideas were identified from the Aulite comparison and the broader CoMemor roadmap. Do not implement them in these phases unless the user creates a separate scope:

1. Semantic embedding/vector retrieval or LLM reranking. First establish lexical retrieval quality and identify its failure cases.
2. Pluggable language/tool diagnostic analyzers or YAML rule packs. Consider after a generic diagnostic-signal interface is proven.
3. A cryptographically hash-chained memory lifecycle audit log.
4. Sigstore Rekor or other external transparency-log anchoring.
5. PDF engineering-memory reports and team analytics.
6. Cloud synchronization, multi-tenancy, RBAC, hosted SaaS, or a managed memory service.
7. Aulite-style HTTP provider proxying, AI compliance checks, or provider routing.

These may be valuable later, but mixing them into the reliability release would dilute the v1.1 objective and make regressions harder to isolate.

---

# DEFINITION OF DONE FOR CoMemor v1.1

The release candidate is eligible for human review only when:

- Verification confidence is based on explicit, deduplicated, source-labelled outcome events.
- Policy validation is never mistaken for remediation success.
- Canonical JSONL modifications are detected and SQLite/FTS5 can be rebuilt reliably.
- Corrupt JSONL data is preserved and recovery is observable.
- FTS5 candidate retrieval preserves high-signal diagnostics from long logs.
- Retrieval quality is measured against labelled relevant records and hard negatives.
- Benchmark results include reproducible methodology and percentiles.
- Command policy communicates proposal risk without claiming to sandbox execution.
- Environment and repository identity metadata are accurate, bounded, and backward-compatible.
- Dashboard and documentation match the implemented architecture.
- Full checks and targeted regression tests pass, or every remaining exception is clearly documented.
- No user data, uncommitted work, release tags, or package versions were changed without authorization.
