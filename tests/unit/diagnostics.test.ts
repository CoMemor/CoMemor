/**
 * Phase 3 — Diagnostic signal extractor unit tests.
 *
 * Verifies that high-signal tokens (error codes, exception names, file paths)
 * are correctly extracted from real-world-shaped log strings.
 */

import { describe, it, expect } from 'vitest';
import { extractDiagnosticSignals, buildFts5Query } from '../../src/core/diagnostics.js';

describe('extractDiagnosticSignals', () => {
  it('extracts TypeScript error codes from compiler output', () => {
    const log = `
      npm ERR! code ELIFECYCLE
      npm ERR! command failed
      error TS2322: Type 'string' is not assignable to type 'number'
      error TS7006: Parameter 'x' implicitly has an 'any' type
    `;
    const signals = extractDiagnosticSignals(log);
    expect(signals.errorCodes).toContain('TS2322');
    expect(signals.errorCodes).toContain('TS7006');
    // Generic boilerplate (npm, error, failed) should NOT dominate ftsQueryTokens
    expect(signals.ftsQueryTokens.slice(0, 3)).toContain('TS2322');
  });

  it('extracts Node error codes (ERR_MODULE_NOT_FOUND, EADDRINUSE)', () => {
    const log = `
      Error [ERR_MODULE_NOT_FOUND]: Cannot find module './foo.js'
      events.js:377
      code: 'ERR_MODULE_NOT_FOUND'
    `;
    const signals = extractDiagnosticSignals(log);
    expect(signals.errorCodes.some((c) => c.includes('ERR_MODULE_NOT_FOUND'))).toBe(true);
  });

  it('extracts EADDRINUSE from port-conflict logs', () => {
    const log = `Error: listen EADDRINUSE: address already in use :::3000`;
    const signals = extractDiagnosticSignals(log);
    expect(signals.errorCodes).toContain('EADDRINUSE');
  });

  it('extracts exception names (TypeError, ReferenceError, ImportError)', () => {
    const log = `
      TypeError: Cannot read properties of undefined (reading 'map')
        at Object.<anonymous> (src/index.ts:42:12)
    `;
    const signals = extractDiagnosticSignals(log);
    expect(signals.exceptionNames).toContain('TypeError');
  });

  it('extracts file paths', () => {
    const log = `
      FAIL src/core/match.test.ts
      Error in ./src/storage/index.ts line 44
    `;
    const signals = extractDiagnosticSignals(log);
    // At least one file path with .ts extension captured
    expect(signals.filePaths.some((p) => p.endsWith('.ts'))).toBe(true);
  });

  it('places error codes before generic tokens in ftsQueryTokens', () => {
    const log = `
      npm run build
      npm ERR! error
      error TS2345: Argument of type 'null' is not assignable to parameter
    `;
    const signals = extractDiagnosticSignals(log);
    const idx2345 = signals.ftsQueryTokens.indexOf('TS2345');
    // TS2345 should appear in the first half of the list
    expect(idx2345).toBeGreaterThanOrEqual(0);
    expect(idx2345).toBeLessThan(signals.ftsQueryTokens.length / 2 + 2);
  });

  it('bounds ftsQueryTokens to MAX_FTS_TOKENS (20)', () => {
    // Create a very long log with many tokens
    const lines = Array.from({ length: 200 }, (_, i) => `uniquetoken_${i} ERR_CODE_${i}`);
    const signals = extractDiagnosticSignals(lines.join('\n'));
    expect(signals.ftsQueryTokens.length).toBeLessThanOrEqual(20);
  });

  it('returns empty signals for empty input', () => {
    const signals = extractDiagnosticSignals('');
    expect(signals.errorCodes).toHaveLength(0);
    expect(signals.exceptionNames).toHaveLength(0);
    expect(signals.ftsQueryTokens).toHaveLength(0);
  });
});

describe('buildFts5Query', () => {
  it('produces quoted OR-joined tokens', () => {
    const signals = extractDiagnosticSignals(`TypeError: bad TS2322 type`);
    const query = buildFts5Query(signals);
    expect(query).toBeTruthy();
    expect(query).toContain('"TS2322"');
    expect(query).toContain('"TypeError"');
    // Tokens joined by OR
    expect(query).toContain(' OR ');
  });

  it('returns null for empty signals', () => {
    const signals = extractDiagnosticSignals('');
    expect(buildFts5Query(signals)).toBeNull();
  });

  it('never includes raw double-quotes inside token strings (safe for FTS5)', () => {
    const signals = extractDiagnosticSignals('error TS2322 "some quoted string"');
    const query = buildFts5Query(signals);
    if (query) {
      // Ensure each token-quoted group is "token" not "to"k"en"
      const inner = query.replace(/"[^"]*"/g, '');
      expect(inner).not.toContain('"');
    }
  });
});
