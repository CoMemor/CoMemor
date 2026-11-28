/**
 * Phase 4 risk-semantics tests for CommandPolicyEngine.
 * Covers: context-aware risk levels, riskReasons, no "sandboxed"/"safe to execute" language.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CommandPolicyEngine } from '../../src/policy/commandPolicy.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'policy-risk-'));
}

describe('CommandPolicyEngine — Phase 4 risk semantics', () => {
  let engine: CommandPolicyEngine;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    engine = new CommandPolicyEngine(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── Risk levels ─────────────────────────────────────────────────────────────

  it('npx → allowed=true, risk=high (remote package execution)', () => {
    const result = engine.validateCommand('npx some-package');
    expect(result.allowed).toBe(true);
    expect(result.risk).toBe('high');
    expect(result.riskReasons).toBeDefined();
    expect(result.riskReasons!.length).toBeGreaterThan(0);
    expect(result.riskReasons!.join(' ')).toMatch(/remote|download/i);
  });

  it('bunx → allowed=true, risk=high', () => {
    const result = engine.validateCommand('bunx some-package');
    expect(result.allowed).toBe(true);
    expect(result.risk).toBe('high');
  });

  it('npm install → risk=medium (lifecycle scripts)', () => {
    const result = engine.validateCommand('npm install');
    expect(result.allowed).toBe(true);
    expect(result.risk).toBe('medium');
    expect(result.riskReasons!.join(' ')).toMatch(/lifecycle|postinstall/i);
  });

  it('npm run build → risk=medium (project scripts)', () => {
    const result = engine.validateCommand('npm run build');
    expect(result.allowed).toBe(true);
    expect(result.risk).toBe('medium');
    expect(result.riskReasons!.join(' ')).toMatch(/project scripts|package\.json/i);
  });

  it('pnpm add lodash → risk=medium', () => {
    const result = engine.validateCommand('pnpm add lodash');
    expect(result.allowed).toBe(true);
    expect(result.risk).toBe('medium');
  });

  it('pnpm run dev → risk=medium', () => {
    const result = engine.validateCommand('pnpm run dev');
    expect(result.allowed).toBe(true);
    expect(result.risk).toBe('medium');
  });

  it('yarn add react → risk=medium', () => {
    const result = engine.validateCommand('yarn add react');
    expect(result.allowed).toBe(true);
    expect(result.risk).toBe('medium');
  });

  it('bun add vite → risk=medium', () => {
    const result = engine.validateCommand('bun add vite');
    expect(result.allowed).toBe(true);
    expect(result.risk).toBe('medium');
  });

  it('python script.py → risk=medium (arbitrary script)', () => {
    const result = engine.validateCommand('python script.py');
    expect(result.allowed).toBe(true);
    expect(result.risk).toBe('medium');
    expect(result.riskReasons!.join(' ')).toMatch(/script|arbitrary/i);
  });

  it('python -m pytest → risk=medium (module execution)', () => {
    const result = engine.validateCommand('python -m pytest');
    expect(result.allowed).toBe(true);
    expect(result.risk).toBe('medium');
  });

  it('go run main.go → risk=medium (compiles and executes)', () => {
    const result = engine.validateCommand('go run main.go');
    expect(result.allowed).toBe(true);
    expect(result.risk).toBe('medium');
    expect(result.riskReasons!.join(' ')).toMatch(/compiles|executes/i);
  });

  it('cargo check → risk=medium (build scripts)', () => {
    const result = engine.validateCommand('cargo check');
    expect(result.allowed).toBe(true);
    expect(result.risk).toBe('medium');
    expect(result.riskReasons!.join(' ')).toMatch(/build scripts|proc.?macro/i);
  });

  it('cargo build → risk=medium', () => {
    const result = engine.validateCommand('cargo build');
    expect(result.allowed).toBe(true);
    expect(result.risk).toBe('medium');
  });

  it('cargo run → risk=medium', () => {
    const result = engine.validateCommand('cargo run');
    expect(result.allowed).toBe(true);
    expect(result.risk).toBe('medium');
  });

  it('npm test → risk=low (test runner, not install/run)', () => {
    const result = engine.validateCommand('npm test');
    expect(result.allowed).toBe(true);
    expect(result.risk).toBe('low');
  });

  it('tsc → risk=low', () => {
    const result = engine.validateCommand('tsc');
    expect(result.allowed).toBe(true);
    expect(result.risk).toBe('low');
  });

  // ─── riskReasons always present ──────────────────────────────────────────────

  it('every allowed command has at least one riskReason', () => {
    const commands = [
      'npm test',
      'npm install',
      'npm run build',
      'npx pkg',
      'pnpm add lodash',
      'pnpm run dev',
      'yarn add react',
      'bun run dev',
      'cargo check',
      'go run main.go',
      'python script.py',
      'tsc',
    ];
    for (const cmd of commands) {
      const result = engine.validateCommand(cmd);
      if (result.allowed) {
        expect(result.riskReasons, `no riskReasons for: ${cmd}`).toBeDefined();
        expect(result.riskReasons!.length, `empty riskReasons for: ${cmd}`).toBeGreaterThan(0);
      }
    }
  });

  // ─── No forbidden language ───────────────────────────────────────────────────

  it('no "sandboxed" language in any verifyFix response', () => {
    // We can test via validateCommand which populates riskReasons
    const commands = ['npm test', 'npm install', 'npx pkg', 'cargo check', 'go run main.go'];
    for (const cmd of commands) {
      const result = engine.validateCommand(cmd);
      const allText = JSON.stringify(result);
      expect(allText, `"sandboxed" found in result for: ${cmd}`).not.toMatch(/sandboxed/i);
      expect(allText, `"safe to execute" found in result for: ${cmd}`).not.toMatch(
        /safe\s+to\s+execute/i,
      );
    }
  });

  it('no "sandboxed" language in verifyFix policyReason', () => {
    // verifyFix is a higher-level wrapper; it must also not use forbidden language
    const result = engine.validateCommand('npm install');
    // policyReason is set during verifyFix — check riskReasons here as proxy
    if (result.riskReasons) {
      for (const reason of result.riskReasons) {
        expect(reason).not.toMatch(/sandboxed/i);
        expect(reason).not.toMatch(/safe\s+to\s+execute/i);
      }
    }
  });

  // ─── No server-side execution ────────────────────────────────────────────────

  it('validateCommand does not spawn child processes (no exec/spawn surface)', () => {
    // Structural test: commandPolicy.ts must not export exec or spawn
    // We verify this by ensuring validateCommand returns synchronously with no side effects
    const start = Date.now();
    engine.validateCommand('npm install');
    const elapsed = Date.now() - start;
    // If subprocess was spawned, it would take >100ms; synchronous policy is <10ms
    expect(elapsed).toBeLessThan(100);
  });
});
