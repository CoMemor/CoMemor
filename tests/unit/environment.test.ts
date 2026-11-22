/**
 * Unit tests for environment.ts — Phase 4 (F-05).
 * Covers: package manager inference from command, package.json field, lockfiles,
 * ambiguity detection, priority order, and lockfile hashing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  inferPackageManagerFromCommand,
  inferPackageManagerFromPackageJson,
  inferPackageManagerFromLockfiles,
  getLockfileHashes,
  buildEnvironmentSnapshot,
} from '../../src/core/environment.js';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
}

// ─── inferPackageManagerFromCommand ──────────────────────────────────────────

describe('inferPackageManagerFromCommand', () => {
  it.each([
    ['npm test', 'npm'],
    ['npm run build', 'npm'],
    ['npx some-pkg', 'npm'],
    ['pnpm test', 'pnpm'],
    ['pnpm add lodash', 'pnpm'],
    ['yarn install', 'yarn'],
    ['bun run dev', 'bun'],
    ['bunx some-pkg', 'bun'],
    ['cargo check', 'cargo'],
    ['cargo build --release', 'cargo'],
    ['go run main.go', 'go'],
    ['poetry install', 'poetry'],
    ['pip install flask', 'pip'],
    ['pip3 install flask', 'pip'],
    ['python script.py', 'pip'],
    ['python3 manage.py migrate', 'pip'],
    ['pytest tests/', 'pip'],
  ])('"%s" → %s', (cmd, expected) => {
    expect(inferPackageManagerFromCommand(cmd)).toBe(expected);
  });

  it('returns null for unknown binaries', () => {
    expect(inferPackageManagerFromCommand('bash script.sh')).toBeNull();
    expect(inferPackageManagerFromCommand('make all')).toBeNull();
    expect(inferPackageManagerFromCommand('')).toBeNull();
  });

  it('strips .exe/.cmd suffixes on Windows-style paths', () => {
    expect(inferPackageManagerFromCommand('npm.cmd test')).toBe('npm');
    expect(inferPackageManagerFromCommand('pnpm.exe run dev')).toBe('pnpm');
  });

  it('command takes priority — pnpm command in npm-lockfile workspace', () => {
    // This is a pure command test; priority is enforced in buildEnvironmentSnapshot
    expect(inferPackageManagerFromCommand('pnpm test')).toBe('pnpm');
  });
});

// ─── inferPackageManagerFromPackageJson ──────────────────────────────────────

describe('inferPackageManagerFromPackageJson', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('reads corepack packageManager field (yarn)', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ packageManager: 'yarn@3.6.0' }));
    expect(inferPackageManagerFromPackageJson(tmpDir)).toBe('yarn');
  });

  it('reads packageManager field without version', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ packageManager: 'pnpm' }));
    expect(inferPackageManagerFromPackageJson(tmpDir)).toBe('pnpm');
  });

  it('returns null when packageManager field is absent', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'my-pkg' }));
    expect(inferPackageManagerFromPackageJson(tmpDir)).toBeNull();
  });

  it('returns null for unknown package manager in field', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ packageManager: 'rush@5.0.0' }));
    expect(inferPackageManagerFromPackageJson(tmpDir)).toBeNull();
  });

  it('returns null when package.json absent', () => {
    expect(inferPackageManagerFromPackageJson(tmpDir)).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), 'NOT JSON {{{');
    expect(inferPackageManagerFromPackageJson(tmpDir)).toBeNull();
  });
});

// ─── inferPackageManagerFromLockfiles ────────────────────────────────────────

describe('inferPackageManagerFromLockfiles', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('detects npm from package-lock.json', () => {
    fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}');
    expect(inferPackageManagerFromLockfiles(tmpDir)).toBe('npm');
  });

  it('detects pnpm from pnpm-lock.yaml', () => {
    fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');
    expect(inferPackageManagerFromLockfiles(tmpDir)).toBe('pnpm');
  });

  it('detects yarn from yarn.lock', () => {
    fs.writeFileSync(path.join(tmpDir, 'yarn.lock'), '');
    expect(inferPackageManagerFromLockfiles(tmpDir)).toBe('yarn');
  });

  it('detects bun from bun.lockb', () => {
    fs.writeFileSync(path.join(tmpDir, 'bun.lockb'), '');
    expect(inferPackageManagerFromLockfiles(tmpDir)).toBe('bun');
  });

  it('detects cargo from Cargo.lock', () => {
    fs.writeFileSync(path.join(tmpDir, 'Cargo.lock'), '');
    expect(inferPackageManagerFromLockfiles(tmpDir)).toBe('cargo');
  });

  it('detects go from go.sum', () => {
    fs.writeFileSync(path.join(tmpDir, 'go.sum'), '');
    expect(inferPackageManagerFromLockfiles(tmpDir)).toBe('go');
  });

  it('returns null with no lockfiles', () => {
    expect(inferPackageManagerFromLockfiles(tmpDir)).toBeNull();
  });

  it('returns ambiguous when npm + pnpm lockfiles both present', () => {
    fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');
    expect(inferPackageManagerFromLockfiles(tmpDir)).toBe('ambiguous');
  });

  it('npm + pip co-existing resolves to npm (not ambiguous)', () => {
    fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), '');
    // JS ecosystem wins; pip is different ecosystem
    expect(inferPackageManagerFromLockfiles(tmpDir)).toBe('npm');
  });
});

// ─── getLockfileHashes ───────────────────────────────────────────────────────

describe('getLockfileHashes', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns sha256 hex for existing lockfiles', () => {
    fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}');
    const hashes = getLockfileHashes(tmpDir);
    expect(hashes['package-lock.json']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('omits absent lockfiles', () => {
    const hashes = getLockfileHashes(tmpDir);
    expect(Object.keys(hashes)).toHaveLength(0);
  });

  it('two lockfiles produce two distinct hashes', () => {
    fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{"a":1}');
    fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), 'lockfileVersion: 6');
    const hashes = getLockfileHashes(tmpDir);
    expect(Object.keys(hashes)).toHaveLength(2);
    const vals = Object.values(hashes);
    expect(vals[0]).not.toBe(vals[1]);
  });
});

// ─── buildEnvironmentSnapshot — priority order ────────────────────────────────

describe('buildEnvironmentSnapshot — priority', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('command beats package.json field and lockfile', () => {
    // npm lockfile + yarn packageManager field, but command is pnpm
    fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ packageManager: 'yarn@3.0.0' }));
    const snap = buildEnvironmentSnapshot('pnpm test', tmpDir);
    expect(snap.packageManager).toBe('pnpm');
    expect(snap.packageManagerSource).toBe('command');
  });

  it('package.json field beats lockfile when no command match', () => {
    fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ packageManager: 'yarn@3.0.0' }));
    const snap = buildEnvironmentSnapshot('vitest run', tmpDir);
    // vitest is not in COMMAND_PM_MAP, so falls through to package.json
    expect(snap.packageManager).toBe('yarn');
    expect(snap.packageManagerSource).toBe('package_json_field');
  });

  it('lockfile wins when no command and no package.json field', () => {
    fs.writeFileSync(path.join(tmpDir, 'pnpm-lock.yaml'), '');
    const snap = buildEnvironmentSnapshot('vitest run', tmpDir);
    expect(snap.packageManager).toBe('pnpm');
    expect(snap.packageManagerSource).toBe('lockfile');
  });

  it('falls back to unknown — never defaults to npm', () => {
    // No lockfiles, no package.json, unknown command
    const snap = buildEnvironmentSnapshot('bash script.sh', tmpDir);
    expect(snap.packageManager).toBe('unknown');
    expect(snap.packageManagerSource).toBe('unknown');
  });

  it('snapshot always has envSchemaVersion 1', () => {
    const snap = buildEnvironmentSnapshot('npm test', tmpDir);
    expect(snap.envSchemaVersion).toBe(1);
  });

  it('snapshot always has os, arch, node fields', () => {
    const snap = buildEnvironmentSnapshot('npm test', tmpDir);
    expect(typeof snap.os).toBe('string');
    expect(typeof snap.arch).toBe('string');
    expect(snap.node).toMatch(/^v\d+\.\d+\.\d+/);
  });
});
