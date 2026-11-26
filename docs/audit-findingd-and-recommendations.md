Your seven findings: independent assessment
F-01 — Wilson score and verification status
High priority — confirmed
Your finding is correct.

In src/core/memoryService.ts, recordFailure() initializes records with:
verification: {
  status: 'unknown',
  verifiedAt: null,
  method: 'dry_run',
  wilsonLowerBound: null,
}


More importantly, verifyFix() delegates to commandPolicy.verifyFix() and returns its result. It does not update the historical record's verification status.

The code comment still says that verification metadata is updated when dryRun passes, but the implementation does not do that.

There is also a subtle issue: a policy check passing is not equivalent to a fix passing verification. Since CoMemor no longer executes commands, it cannot independently establish that a proposed fix actually solved the original failure.

Recommended implementation

Introduce a separate feedback operation, such as:

record_verification_outcome

It should accept a record ID, an outcome, a verification method, timestamp, and optional evidence reference. The outcome must distinguish:
- passed: the consuming host or operator confirmed the fix worked.
- failed: the attempted fix did not resolve the failure.
- unknown: no outcome has been reported.
Store verification events rather than silently overwriting history. Derive the Wilson lower bound from the actual success and failure counts.

Do not count a successful policy assessment or dry-run as a successful repair.

Acceptance criteria
- A record with no outcomes has a null Wilson lower bound.
- Recording a successful external outcome updates the success count.
- Recording a failed outcome updates the failure count.
- Multiple outcomes are retained and associated with the correct record.
- Repeated or duplicate feedback events are handled deterministically.
- verifiedFixesCount reflects real verification evidence.
- The API clearly identifies the source of verification: host-reported, human-confirmed, or another supported method.
For the landing page, describe Wilson scoring as an evidence-based confidence mechanism, not automatic verification, until this functionality is implemented.
F-02 — FTS5 first-ten-token limitation
High priority — confirmed
Your finding is correct.

The current findCandidates() implementation uses:
const cleanTokens = searchQuery
  .replace(/[^a-zA-Z0-9_\s]/g, ' ')
  .trim()
  .split(/\s+/)
  .filter((t) => t.length > 2)
  .slice(0, 10);


This can discard important tokens near the end of compiler logs or test output.

For example, the initial log might contain:
npm ERR! code ELIFECYCLE
npm ERR! command failed
...
error TS2322: Type 'string' is not assignable to type 'number'


The search can prioritize the generic npm output and miss the TypeScript error code entirely.

Recommended implementation

Do not simply replace slice(0, 10) with the last ten tokens. That would fix some cases while breaking others.

Implement a weighted query-token extraction strategy.

Suggested signals:
Token category	Priority
Error codes (TS2322, EADDRINUSE, ERR_MODULE_NOT_FOUND)	Very high
Exception names (TypeError, ReferenceError)	Very high
Compiler and test identifiers	High
File paths and extensions	High
Rare technical identifiers	High
General diagnostic words	Medium
Generic runner boilerplate (npm, error, failed)	Low

Use a bounded candidate set containing high-signal tokens from the beginning, middle, and end of the output.

A more robust architecture is:
1. Extract structured error signals.
2. Remove known repetitive runner boilerplate.
3. Rank remaining terms using discriminative value, such as inverse document frequency.
4. Include error codes and rare identifiers explicitly.
5. Build a bounded FTS5 query.
6. Preserve the existing similarity-ranking stage.
Acceptance criteria

Test cases should include identical failures with different runner prefixes, error codes appearing only near the end, paths appearing in the middle, and logs containing multiple unrelated errors.

Measure retrieval quality using Recall@K, Precision@K, and MRR, rather than latency alone.
F-03 — SQLite reconciliation does not detect modified records
High priority — confirmed
Your finding is correct.

reconcileWithCanonical() currently checks:
- Whether the SQLite index is dirty.
- Whether record counts differ.
- Whether canonical record IDs are missing from SQLite.
It does not compare existing record contents.

Consequently, changing an existing JSONL record while retaining its ID and record count can leave the SQLite projection stale.

Recommended implementation

Store a canonical-file fingerprint in index_metadata.

I recommend:
canonical_records_sha256
canonical_records_size
index_schema_version
last_reconciled_at


The SHA-256 value should be calculated over the canonical file bytes, not reconstructed parsed JSON objects. That way, changes to whitespace, ordering, line endings, or record contents are also detected.

At startup:
1. Read the canonical file.
2. Calculate its fingerprint.
3. Compare it against the stored fingerprint.
4. Rebuild SQLite when they differ.
5. Update metadata only after a successful rebuild.
There is an important concurrent-write consideration: calculate and record the fingerprint against a stable snapshot. Coordinate reconciliation with the same locking strategy as JSONL writes, or otherwise detect whether the file changed during the read/rebuild process.

Acceptance criteria
- Editing an existing JSONL record triggers rebuilding.
- Reordering records triggers rebuilding.
- Truncation triggers rebuilding.
- A failed rebuild leaves the index marked dirty.
- A process crash during rebuilding does not mark an incomplete index as clean.
- SQLite can still be completely regenerated from JSONL.
F-04 — Command-policy interpretation
Medium priority — partly superseded
The original observation about potentially dangerous allowlisted commands remains relevant to the policy code.

However, the key architectural improvement is already visible: verifyFix() no longer executes commands. This substantially reduces the importance of classifying every interpreter invocation as safe or unsafe for server-side execution.

Your next step should be to distinguish two different questions:
- Is a command acceptable to propose to the host?
- Is a command safe for the host to execute?
CoMemor can answer the first. It cannot guarantee the second when the host controls execution.

Recommended implementation

Make command assessment more descriptive.

For example:
Command	Recommended assessment
npm test	Lower-risk proposal
npm run build	Lower-risk proposal, subject to project scripts
npx some-package	Elevated risk; remote package execution
python malicious_script.py	Elevated risk; arbitrary script execution
python -m http.server	Elevated risk; opens a network listener
cargo check	Lower-risk proposal
npm install	Elevated risk; dependency and lifecycle-script implications

The important distinction is that an allowlisted executable does not imply every possible argument or subcommand is safe.

I would also remove any remaining wording such as "sandboxed execution", "sandbox safety", or "approval prevents command execution" unless those properties are actually provided by an external execution environment.

Acceptance criteria
- Every assessment returns a risk classification and reason.
- Remote package execution and arbitrary script invocation are explicitly identified.
- Shell metacharacter and path-containment checks remain covered.
- Documentation makes the host execution boundary unambiguous.
- No code path in CoMemor executes the proposed remediation command.
F-05 — Hardcoded package manager
Medium priority — confirmed
recordFailure() currently assigns:
packageManager: 'npm'


This is misleading in repositories using pnpm, Yarn, Bun, Cargo, or other ecosystems.

Recommended implementation

Infer the package manager in this order:
1. Command that produced the failure.
2. Lockfiles present in the project.
3. Relevant project configuration, such as package.json's packageManager field.
4. unknown if the result is ambiguous.
Do not assume that the presence of package-lock.json means every command in the workspace used npm.

Also consider broadening the environment model. A package manager is only one part of the execution environment. Include relevant runtime and toolchain context where available, without collecting unnecessary personal or machine-specific data.
F-06 — Documentation and version drift
High priority — confirmed
This is more significant than a cosmetic documentation issue.

The current public main branch has a mismatch between the current implementation and older technical documentation.

Examples include:
- CHANGELOG.md currently stops at 1.0.5, while the package is 1.1.0.
- docs/limitations.md retains older version framing.
- docs/dashboard-spec.md describes the old approval execution architecture and older storage assumptions.
- docs/production-readiness-audit.md contains old claims about a command execution sandbox and approval verification.
- The threat model still describes arbitrary command execution through verify_fix, despite the new policy-only implementation.
- The threat model describes some provenance fields that I could not confirm in the current record implementation.
One particularly important issue: the README says CoMemor never executes commands, but older documents still describe the approval process as a route to command execution.

Recommended implementation

Create one authoritative architecture and capability reference, then align the rest of the documentation against it.

I recommend the following document hierarchy:
Document	Purpose
README	Current product capabilities and limitations
Architecture	Actual data flow and component boundaries
Threat model	Current security boundaries and mitigations
Limitations	Known functional and operational limitations
Changelog	Released changes only
Production-readiness audit	Historical audit evidence, with dated scope
ADRs	Decisions and trade-offs

Do not simply change every old document header to 1.1.0. A historical audit should retain the version and date it actually evaluated. Mark it as historical and publish a new audit for the current release.

Also, the current public branch is internally presenting 1.1.0 while its changelog ends at 1.0.5. That needs to be resolved before the next release.
F-07 — Benchmark transparency
Medium priority — confirmed, with an important qualification
Your latency figures are useful, but they need to be presented with the right context.

The benchmark-results document reports:
Records	Exact lookup	Fuzzy fallback
100	5.14 ms	4.63 ms
1,000	7.26 ms	6.86 ms
10,000	75.90 ms	75.42 ms

These are reported averages from a particular environment, not universal performance guarantees.

There are also limitations in the benchmark script:
- It measures only 20 iterations per lookup type.
- It reports averages, not p50/p95/p99.
- It uses five synthetic error templates.
- The fuzzy query changes a line number, but this alone does not establish that the benchmark represents realistic retrieval difficulty.
- It imports the compiled service from dist, so the benchmark must be run against a fresh build.
- The benchmark does not establish retrieval correctness or whether the returned fix is actually useful.
Recommended implementation

Keep the current latency benchmark, but expand the evaluation harness.

Add:
1. Warm-up iterations.
2. At least several hundred measured queries per scale.
3. p50, p95, and p99 latency.
4. Multiple query categories.
5. Realistic log-prefix noise.
6. Error codes near the beginning and end.
7. Candidate ranking accuracy metrics.
8. A reproducibility manifest containing runtime version, OS, CPU, dataset size, iteration count, and benchmark commit SHA.
The reported security numbers should also be scoped accurately. The 44/44 poisoning corpus result means all 44 supplied fixtures were detected in that test corpus. It does not mean all prompt-injection attacks can be detected. Likewise, 100% standard-secret recall is a result on that test set, not a general guarantee.

Landing-page recommendation: You can show the exact measured figures with links to the benchmark methodology, environment, and scripts. Label them as measured on the stated test environment.

3. Additional gaps found in CoMemor
The seven findings are valid, but I found several other issues that deserve attention.
C-01 — Verification data model is incomplete
High priority
This extends F-01.

The code has a Wilson lower-bound calculation in src/core/staleness.ts, but the current getStats() reads verification status directly from SQLite:
SUM(
  CASE
    WHEN json_extract(data, '$.verification.status')
    IN ('passed','failed')
    THEN 1 ELSE 0
  END
)


This means a record can be considered "verified" even when its outcome is failed. The metric is currently counting records with a known verification status, not necessarily successful fixes.

That distinction matters because the public-facing phrase verifiedFixesCount implies successful fixes.

Fix: Separate these metrics:
- verificationAttempts
- successfulVerifications
- failedVerifications
- unverifiedRecords
- successRate
- wilsonLowerBound
Use actual verification outcomes, not merely a non-unknown status.
C-02 — JSONL locking does not make the JSONL and SQLite updates atomic
High priority
You have improved concurrent JSONL writes through proper-lockfile. However, there is still a consistency window between:
1. Appending a record to JSONL.
2. Updating SQLite.
3. Updating the FTS5 table.
The JSONL file is canonical, which is the right architecture. But a process crash between these steps can leave the secondary index stale until reconciliation.

There is a further detail in the code: indexRecord() writes to the relational SQLite table and updates the FTS5 table in separate operations. The FTS5 update is inside a catch block that silently ignores failures. This can produce a state where the relational record exists but full-text retrieval cannot find it.

Fix:
- Wrap relational and FTS5 updates in one SQLite transaction.
- On any failure, mark the entire index dirty.
- Ensure startup recovery rebuilds from JSONL.
- Add fault-injection tests that simulate failures between the different persistence stages.
The canonical-file hash proposed in F-03 will make this recovery more dependable.
C-03 — Corrupt JSONL records are skipped without a complete recovery strategy
Medium priority
JsonlStorage.readAll() and readAllSync() skip malformed lines and write a warning to stderr.

That is a reasonable resilience strategy for loading surviving records, but it creates a data-integrity problem if malformed lines are silently omitted from all future rebuilt indexes.

The original line remains in the canonical file, so repeated rebuilds will continue to skip it. There is no visible quarantine or recovery artifact that allows an operator to repair the data.

Fix:

Introduce a recovery report that records:
- Original file path.
- Corrupted line numbers.
- A SHA-256 hash of each corrupted line.
- Recovery timestamp.
- Number of valid records recovered.
- Whether recovery was complete or partial.
Do not silently rewrite or delete the canonical file. Preserve the corrupted bytes for manual recovery.
C-04 — Package-manager metadata is only the visible symptom of a wider environment-model problem
Medium priority
CoMemor currently collects:
- OS.
- Node.js version.
- Package manager.
- Lockfile hashes.
This is a useful start, but it is insufficient to distinguish some common failure environments.

Consider two failures with identical TypeScript error output but different TypeScript compiler versions. The old fix may not be applicable.

Potential environment additions:
Field	Reason
Runtime and runtime version	Node.js, Python, Go, Java, etc.
Package-manager version	Distinguishes toolchain changes
Compiler/test-runner version	Important for reproducibility
Relevant framework version	Helps identify incompatible fixes
Lockfile fingerprints	Detect dependency changes
OS and architecture	Helps isolate platform-specific problems

Do not run large sets of shell commands every time a record is written. Prefer low-cost discovery and capture only information that can be reliably established.
C-05 — Retrieval does not yet explain enough about its own decisions
Medium priority
The code returns matchType, similarityScore, confidence, staleness reasons, and quarantine state. That is useful.

However, an engineering team needs more than a final score to decide whether a retrieved fix is trustworthy.

The next improvement should make the retrieval result explainable.

For each candidate, retain or expose:
- Exact-fingerprint or fuzzy match.
- Important matching diagnostic tokens.
- Repository and command-family matching.
- Similarity components.
- Staleness penalties.
- Verification evidence.
- Poisoning status.
- Environment compatibility.
- Why a candidate was rejected, when practical.
This will be a major differentiator for CoMemor. Many memory systems can return relevant text. Fewer provide an auditable explanation of why a particular historical fix was considered relevant and trustworthy.
C-06 — Repository identity and memory sharing need stronger semantics
Medium priority
The product describes itself as repository-scoped, but repository identity is currently configurable through AGENT_MEMORY_REPO, with a fallback based on the working directory.

That is convenient, but it raises questions when projects are:
- Renamed.
- Cloned into multiple directories.
- Forked.
- Moved between organizations.
- Shared across multiple worktrees.
Fix: Define repository identity independently from the working-directory path.

A sensible model is:
repository identity
    ├── canonical repository URL or stable ID
    ├── local workspace identity
    ├── current worktree
    └── branch / commit provenance


Do not assume that two directories with the same repository name are necessarily the same repository.
C-07 — Local dashboard capabilities are not fully aligned with the new architecture
Medium priority
The README now describes the dashboard's approval queue as an audit mechanism. That is correct directionally.

But docs/dashboard-spec.md still describes a human approval that the MCP server polls before executing a verified fix. That is no longer the product architecture.

The dashboard also needs to distinguish:
- A proposed remediation.
- A policy assessment.
- A host-execution decision.
- An externally reported verification outcome.
The UI should not imply that CoMemor approved or executed a fix when it only recorded a proposal.

Fix: Rework the dashboard's terminology and screens to reflect the policy-only architecture.
C-08 — Benchmark scale is not equivalent to real-world memory quality
Medium priority
The benchmark currently generates repeated synthetic failure templates with different values.

That can test storage and indexing performance, but it does not establish that the retrieval system works well across diverse engineering incidents.

Build a separate quality benchmark dataset containing:
- TypeScript/compiler failures.
- Python dependency and import failures.
- Build-tool failures.
- Test-runner failures.
- Port and network failures.
- Configuration/environment failures.
- Dependency conflicts.
- Platform-specific failures.
Create hard negatives: similar-looking errors that require different fixes.

This is important because a memory system that returns a wrong fix confidently can be more harmful than a memory system that returns no fix.