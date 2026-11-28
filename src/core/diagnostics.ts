/**
 * Diagnostic signal extractor for high-signal FTS5 query construction.
 *
 * Phase 3 — F-02 fix.
 *
 * Replaces the naive first-10-token slice with a weighted extraction strategy:
 *  - Very-high priority: error codes (TS2322, EADDRINUSE, ERR_MODULE_NOT_FOUND),
 *    exception names (TypeError, ReferenceError, ModuleNotFoundError).
 *  - High priority: compiler/test identifiers, file paths, rare technical terms.
 *  - Medium priority: general diagnostic words.
 *  - Low/excluded: generic runner boilerplate (npm, error, failed, warning …).
 *
 * The output is a bounded token list safe for FTS5 queries.
 */

// ─── Boilerplate to downweight ────────────────────────────────────────────────

const BOILERPLATE_TOKENS = new Set([
  'npm',
  'npx',
  'yarn',
  'pnpm',
  'bun',
  'node',
  'run',
  'script',
  'error',
  'err',
  'warn',
  'warning',
  'info',
  'debug',
  'failed',
  'failure',
  'fail',
  'exit',
  'exited',
  'code',
  'at',
  'in',
  'of',
  'the',
  'and',
  'with',
  'from',
  'to',
  'for',
  'running',
  'run',
  'stderr',
  'stdout',
  'process',
]);

// ─── Error-code / exception patterns ─────────────────────────────────────────

/** TypeScript/tsc: TS2322, TS2345, TS7006 … */
const TS_ERROR_RE = /\bTS\d{3,5}\b/gi;

/** Node error codes: ERR_MODULE_NOT_FOUND, EADDRINUSE, ENOENT … */
const NODE_ERR_RE = /\b(?:ERR_[A-Z_]{3,}|E[A-Z]{3,})\b/g;

/** Errno codes via code = X, (code: X): */
const CODE_KV_RE = /code[=:\s]+['"]?([A-Z_]{3,})['"]?/g;

/** Exception class names: TypeError, ReferenceError, ModuleNotFoundError, ImportError … */
const EXCEPTION_RE = /\b[A-Z][a-zA-Z]*(?:Error|Exception|Warning|Fault|Panic)\b/g;

/** File paths (Windows or POSIX) ending with a known code extension */
const FILE_PATH_RE =
  /(?:[./\\][\w./\\-]*\.(?:ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|kt|rb|sh|toml|json|yaml|yml|lock|txt))/gi;

/** Package names with version constraints: lodash@4.17, some-pkg@^2 */
const PKG_VERSION_RE = /\b([\w-]{2,}@[\^~>=<]?\d[\w.,-]*)/g;

// ─── Extracted signal ─────────────────────────────────────────────────────────

export interface DiagnosticSignals {
  /** Error codes extracted (TS2322, ERR_MODULE_NOT_FOUND, EADDRINUSE …) */
  errorCodes: string[];
  /** Exception class names (TypeError, ReferenceError …) */
  exceptionNames: string[];
  /** File paths (src/foo.ts, ./bar.js …) */
  filePaths: string[];
  /** Package names with version constraints */
  packageVersions: string[];
  /** Rare technical identifiers not in boilerplate list */
  technicalTokens: string[];
  /** Ordered FTS query tokens (high-signal first, bounded to MAX_FTS_TOKENS) */
  ftsQueryTokens: string[];
}

const MAX_FTS_TOKENS = 20;
const REGION_TOKENS = 6; // tokens from start, middle, end

/**
 * Extracts diagnostic signals from a (normalized) error output string.
 *
 * The output is deterministic and bounded — safe to pass directly into FTS5.
 */
export function extractDiagnosticSignals(normalizedOutput: string): DiagnosticSignals {
  const text = normalizedOutput;

  // --- Very-high priority: regex-based signal extraction ---

  const errorCodes: string[] = dedup([
    ...(text.match(TS_ERROR_RE) ?? []).map((s) => s.toUpperCase()),
    ...(text.match(NODE_ERR_RE) ?? []),
    ...extractCaptureGroups(text, CODE_KV_RE, 1),
  ]);

  const exceptionNames: string[] = dedup(text.match(EXCEPTION_RE) ?? []);

  const filePaths: string[] = dedup(
    (text.match(FILE_PATH_RE) ?? [])
      .map((p) => p.replace(/\\/g, '/').toLowerCase())
      .filter((p) => p.length > 3),
  ).slice(0, 5);

  const packageVersions: string[] = dedup(extractCaptureGroups(text, PKG_VERSION_RE, 1)).slice(
    0,
    5,
  );

  // --- High priority: region-sampled tokens (start + middle + end) ---

  const rawTokens = text
    .replace(/[^a-zA-Z0-9_.:@/-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !/^\d+$/.test(t));

  const regionTokens = sampleRegions(rawTokens, REGION_TOKENS);

  // --- Technical tokens: not in boilerplate, not numeric ---

  const technicalTokens: string[] = dedup(
    regionTokens.filter((t) => !BOILERPLATE_TOKENS.has(t.toLowerCase()) && t.length >= 3),
  ).slice(0, 10);

  // --- Build bounded FTS query token list (high-signal first) ---

  const ordered: string[] = dedup([
    ...errorCodes,
    ...exceptionNames,
    ...packageVersions.map((p) => p.split('@')[0] ?? p),
    ...filePaths.map(baseName),
    ...technicalTokens,
  ]).slice(0, MAX_FTS_TOKENS);

  return {
    errorCodes,
    exceptionNames,
    filePaths,
    packageVersions,
    technicalTokens,
    ftsQueryTokens: ordered,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dedup(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter((s) => {
    const k = s.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function extractCaptureGroups(text: string, re: RegExp, group: number): string[] {
  const results: string[] = [];
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags);
  while ((m = r.exec(text)) !== null) {
    const g = m[group];
    if (g) results.push(g);
  }
  return results;
}

function sampleRegions(tokens: string[], n: number): string[] {
  if (tokens.length <= n * 3) return tokens;
  const start = tokens.slice(0, n);
  const mid = tokens.slice(
    Math.floor(tokens.length / 2) - Math.floor(n / 2),
    Math.floor(tokens.length / 2) + Math.ceil(n / 2),
  );
  const end = tokens.slice(tokens.length - n);
  return [...start, ...mid, ...end];
}

function baseName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] ?? filePath;
}

/**
 * Builds a safe FTS5 MATCH expression from diagnostic signals.
 * Uses OR so that any important token can contribute a match.
 * Quotes each token to avoid FTS5 syntax errors from special chars.
 */
export function buildFts5Query(signals: DiagnosticSignals): string | null {
  const tokens = signals.ftsQueryTokens
    .map((t) => t.replace(/"/g, '').trim())
    .filter((t) => t.length > 1);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `"${t}"`).join(' OR ');
}
