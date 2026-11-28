/**
 * Phase 5 — Documentation consistency tests.
 * Verifies that key source files do not contain forbidden language,
 * and that documentation includes required truthful statements.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');

function readDoc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ─── Forbidden language ───────────────────────────────────────────────────────

describe('Documentation — no forbidden language', () => {
  const docFiles = [
    'README.md',
    'CHANGELOG.md',
    'docs/threat-model.md',
    'docs/limitations.md',
    'docs/dashboard-spec.md',
    'docs/user-guide.md',
  ];

  it.each(docFiles)('%s — no "safe to execute" language', (file) => {
    const content = readDoc(file);
    // Reject only positive claims like "is safe to execute" or "safely executed"
    // Allow negation contexts like "never 'safe to execute'" or "phrases permanently removed"
    const matches = [...content.matchAll(/safe\s+to\s+execute/gi)];
    for (const match of matches) {
      const context = content.slice(Math.max(0, match.index - 100), match.index + 100);
      const hasNegation =
        /\bnever\b|\bnot\b|\bdoes not\b|\bpermanently removed\b|\bno\b|\bwithout\b/i.test(context);
      expect(
        hasNegation,
        `"safe to execute" used without negation in ${file}: ...${context}...`,
      ).toBe(true);
    }
  });

  it.each(docFiles)('%s — no "sandboxed execution" claim', (file) => {
    const content = readDoc(file);
    // "sandboxed" is allowed ONLY in negation context (e.g. "is NOT sandboxed")
    // We test that it does not appear in a positive claim
    const sandboxedMatches = [...content.matchAll(/sandboxed/gi)];
    for (const match of sandboxedMatches) {
      const context = content.slice(Math.max(0, match.index - 160), match.index + 160);
      // If "sandboxed" appears, it must be in a negation context
      const hasNegation =
        /\bnot\b|\bnever\b|\bdoes not\b|\bno\b|\bcannot\b|\bpermanently removed\b|\bremoved from\b|\bforbidden\b/i.test(
          context,
        );
      expect(hasNegation, `"sandboxed" used without negation in ${file}: ...${context}...`).toBe(
        true,
      );
    }
  });

  it('CHANGELOG — has [Unreleased] section for v1.1 work', () => {
    const content = readDoc('CHANGELOG.md');
    expect(content).toMatch(/\[Unreleased\]/);
    expect(content).toMatch(/Phase 1/);
    expect(content).toMatch(/Phase 4/);
  });

  it('CHANGELOG — [0.4.0] does not say "Sandboxed Verification"', () => {
    const content = readDoc('CHANGELOG.md');
    expect(content).not.toMatch(/\[0\.4\.0\].*Sandboxed Verification/i);
  });

  it('README — capabilities table includes verification event store', () => {
    const content = readDoc('README.md');
    expect(content).toMatch(/verification.event/i);
  });

  it('README — capabilities table includes retrieval explainability', () => {
    const content = readDoc('README.md');
    expect(content).toMatch(/explainabilit/i);
  });

  it('README — policy assessment row does not positively claim sandboxing', () => {
    const content = readDoc('README.md');
    // Find the policy assessment row
    const match = /Policy assessment.*\n?/i.exec(content);
    expect(match).not.toBeNull();
    if (match) {
      // The row may mention "sandboxed" to deny it, but must not positively claim it
      const row = match[0];
      // A positive claim would be "sandboxes", "is sandboxed", etc. — not "no 'sandboxed' claims"
      const positiveSandboxClaim =
        /(?<!\bno\b\s+['"]?)\bsandbox(?:ed|ing|es)(?!\s*['"]?\s+claims?)/i.test(
          row.replace(/no ['"]sandboxed['"]/, ''),
        );
      expect(positiveSandboxClaim).toBe(false);
    }
  });

  it('threat-model — verification checklist uses allowlist not whitelist', () => {
    const content = readDoc('docs/threat-model.md');
    // The old phrase "Commands restricted to whitelist" should be replaced
    expect(content).not.toMatch(/restricted to whitelist/i);
  });

  it('production-readiness-audit — has historical document note', () => {
    const content = readDoc('docs/production-readiness-audit.md');
    expect(content).toMatch(/Historical Document/i);
    expect(content).toMatch(/v1\.0\.0.*audited/i);
  });

  it('production-readiness-audit — no "Sandbox Safety" in core guarantees', () => {
    const content = readDoc('docs/production-readiness-audit.md');
    // "Sandbox Safety" as a section title/guarantee is forbidden; replaced by "Policy Validation Safety"
    expect(content).not.toMatch(/\*\*Sandbox Safety:\*\*/);
  });

  it('limitations — has v1.1 improvements table', () => {
    const content = readDoc('docs/limitations.md');
    expect(content).toMatch(/Improvements in v1\.1/i);
    expect(content).toMatch(/F-01/);
    expect(content).toMatch(/F-05/);
  });

  it('limitations — has remaining limitations section', () => {
    const content = readDoc('docs/limitations.md');
    expect(content).toMatch(/Remaining Limitations After v1\.1/i);
  });
});

// ─── Source code — no forbidden language in MCP responses ────────────────────

describe('Source code — no forbidden language in user-visible responses', () => {
  it('server.ts — no "safe to execute" in tool descriptions or response text', () => {
    const content = readDoc('src/server.ts');
    expect(content).not.toMatch(/safe\s+to\s+execute/i);
  });

  it('commandPolicy.ts — no "sandboxed" in runtime response strings (not comments)', () => {
    const content = readDoc('src/policy/commandPolicy.ts');
    // We only care about template literals or string values that would reach users,
    // specifically reason strings pushed with reasons.push(). Check those directly.
    // The word "sandboxed" should not appear in any reasons.push() call.
    const pushMatches = [...content.matchAll(/reasons\.push\([^)]+\)/gs)];
    for (const match of pushMatches) {
      expect(match[0], 'reasons.push() contains "sandboxed"').not.toMatch(/sandboxed/i);
    }
    // Also check policyReason strings in verifyFix
    const policyReasonMatches = [...content.matchAll(/policyReason:\s*[`'"][^`'"]+[`'"]/g)];
    for (const match of policyReasonMatches) {
      expect(match[0], 'policyReason contains "sandboxed"').not.toMatch(/sandboxed/i);
    }
  });

  it('commandPolicy.ts — riskReasons are always populated for allowed commands', () => {
    // Structural check: the default reasons push() must exist in the file
    const content = readDoc('src/policy/commandPolicy.ts');
    expect(content).toMatch(/reasons\.push/);
    // And the "passes static policy" fallback message must be present
    expect(content).toMatch(/passes static policy checks/i);
  });

  it('memoryService.ts — uses buildEnvironmentSnapshot not hardcoded packageManager', () => {
    const content = readDoc('src/core/memoryService.ts');
    expect(content).toMatch(/buildEnvironmentSnapshot/);
    // Must NOT have the old hardcoded block
    expect(content).not.toMatch(/packageManager:\s*['"]npm['"]/);
  });

  it('environment.ts — unknown fallback, never defaults to npm', () => {
    const content = readDoc('src/core/environment.ts');
    expect(content).toMatch(/packageManager:\s*'unknown'/);
    // Should NOT have a fallback that returns 'npm'
    expect(content).not.toMatch(/return\s+['"]npm['"]/);
  });
});
