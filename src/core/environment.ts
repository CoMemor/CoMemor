/**
 * Package-manager and environment inference.
 * Phase 4 — F-05 fix.
 *
 * Infers the package manager from:
 *  1. The command itself (highest priority — `pnpm test` → pnpm)
 *  2. package.json `packageManager` field
 *  3. Lockfile presence
 *  4. Falls back to 'unknown' — never silently defaults to 'npm'
 *
 * Does NOT execute any commands or shell scripts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PackageManager =
  | 'npm'
  | 'pnpm'
  | 'yarn'
  | 'bun'
  | 'cargo'
  | 'go'
  | 'poetry'
  | 'pip'
  | 'unknown'
  | 'ambiguous';

export interface EnvironmentSnapshot {
  /** Schema version for this snapshot. Bump on incompatible changes. */
  envSchemaVersion: 1;
  os: string;
  arch: string;
  node: string;
  /**
   * Package manager inferred from the command invocation (highest confidence).
   * Falls back to lockfile/packageManager field evidence.
   * 'unknown' when undetectable; 'ambiguous' when multiple lockfiles conflict.
   */
  packageManager: PackageManager;
  /** Source that produced the packageManager value */
  packageManagerSource: 'command' | 'package_json_field' | 'lockfile' | 'unknown';
  /** Map from lockfile path (relative to workspace) to SHA-256 hex. */
  lockfileHashes: Record<string, string>;
}

// ─── Lockfile → package manager mapping ──────────────────────────────────────

const LOCKFILE_PM_MAP: Record<string, PackageManager> = {
  'package-lock.json': 'npm',
  'npm-shrinkwrap.json': 'npm',
  'pnpm-lock.yaml': 'pnpm',
  'yarn.lock': 'yarn',
  'bun.lockb': 'bun',
  'Cargo.lock': 'cargo',
  'go.sum': 'go',
  'poetry.lock': 'poetry',
  'requirements.txt': 'pip',
  'Pipfile.lock': 'pip',
};

// ─── Command → package manager mapping ───────────────────────────────────────

const COMMAND_PM_MAP: Record<string, PackageManager> = {
  npm: 'npm',
  npx: 'npm',
  pnpm: 'pnpm',
  yarn: 'yarn',
  bun: 'bun',
  bunx: 'bun',
  cargo: 'cargo',
  go: 'go',
  poetry: 'poetry',
  pip: 'pip',
  pip3: 'pip',
  python: 'pip',   // approximation for python-based tools
  python3: 'pip',
  pytest: 'pip',
};

// ─── Inference ────────────────────────────────────────────────────────────────

/**
 * Infers the package manager from the command string (highest confidence).
 * Returns null if the command binary is not a known package manager.
 */
export function inferPackageManagerFromCommand(command: string): PackageManager | null {
  if (!command) return null;
  const binary = path
    .basename(command.trim().split(/\s+/)[0] ?? '')
    .toLowerCase()
    .replace(/\.(exe|cmd|bat|sh)$/i, '');
  return COMMAND_PM_MAP[binary] ?? null;
}

/**
 * Reads package.json `packageManager` field (corepack format: "npm@9.0.0").
 * Returns null if the file is absent, malformed, or the field is missing.
 * Never throws.
 */
export function inferPackageManagerFromPackageJson(workspaceRoot: string): PackageManager | null {
  try {
    const pkgPath = path.join(workspaceRoot, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
    const field = typeof pkg.packageManager === 'string' ? pkg.packageManager : null;
    if (!field) return null;
    // Format: "pnpm@8.6.0" or just "pnpm"
    const name = field.split('@')[0]?.toLowerCase() as PackageManager | undefined;
    if (!name) return null;
    const known: PackageManager[] = ['npm', 'pnpm', 'yarn', 'bun'];
    return known.includes(name) ? name : null;
  } catch {
    return null;
  }
}

/**
 * Infers from lockfiles present in workspaceRoot.
 * Returns 'ambiguous' when multiple conflicting lockfiles exist.
 * Returns null if no lockfiles found.
 */
export function inferPackageManagerFromLockfiles(workspaceRoot: string): PackageManager | 'ambiguous' | null {
  const detected = new Set<PackageManager>();
  for (const [file, pm] of Object.entries(LOCKFILE_PM_MAP)) {
    if (fs.existsSync(path.join(workspaceRoot, file))) {
      detected.add(pm);
    }
  }
  if (detected.size === 0) return null;
  if (detected.size === 1) return [...detected][0]!;
  // Multiple different package managers detected — ambiguous
  // However, npm+pip co-existing is not ambiguous for JS commands
  // Strip pip from the ambiguity check since it's a different ecosystem
  const jsManagers = [...detected].filter((pm) => ['npm', 'pnpm', 'yarn', 'bun'].includes(pm));
  if (jsManagers.length === 1) return jsManagers[0]!;
  if (jsManagers.length > 1) return 'ambiguous';
  // Only non-JS managers remain
  if (detected.size === 1) return [...detected][0]!;
  return 'ambiguous';
}

/**
 * Hashes lockfiles relative to workspaceRoot. Returns a map of relative path → SHA-256.
 * Skips unreadable files gracefully.
 */
export function getLockfileHashes(workspaceRoot: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const file of Object.keys(LOCKFILE_PM_MAP)) {
    const filePath = path.join(workspaceRoot, file);
    try {
      if (fs.existsSync(filePath)) {
        const bytes = fs.readFileSync(filePath);
        result[file] = createHash('sha256').update(bytes).digest('hex');
      }
    } catch {
      // Skip unreadable lockfile
    }
  }
  return result;
}

/**
 * Builds a full environment snapshot for a record.
 * Priority: command → package.json field → lockfile → unknown.
 * Never executes any external process.
 */
export function buildEnvironmentSnapshot(
  command: string,
  workspaceRoot: string,
): EnvironmentSnapshot {
  // 1. Command takes highest priority
  const fromCommand = inferPackageManagerFromCommand(command);
  if (fromCommand) {
    return {
      envSchemaVersion: 1,
      os: process.platform,
      arch: process.arch,
      node: process.version,
      packageManager: fromCommand,
      packageManagerSource: 'command',
      lockfileHashes: getLockfileHashes(workspaceRoot),
    };
  }

  // 2. package.json `packageManager` field
  const fromPkgJson = inferPackageManagerFromPackageJson(workspaceRoot);
  if (fromPkgJson) {
    return {
      envSchemaVersion: 1,
      os: process.platform,
      arch: process.arch,
      node: process.version,
      packageManager: fromPkgJson,
      packageManagerSource: 'package_json_field',
      lockfileHashes: getLockfileHashes(workspaceRoot),
    };
  }

  // 3. Lockfile evidence
  const fromLockfile = inferPackageManagerFromLockfiles(workspaceRoot);
  if (fromLockfile) {
    return {
      envSchemaVersion: 1,
      os: process.platform,
      arch: process.arch,
      node: process.version,
      packageManager: fromLockfile,
      packageManagerSource: 'lockfile',
      lockfileHashes: getLockfileHashes(workspaceRoot),
    };
  }

  // 4. Unknown — never defaults to npm
  return {
    envSchemaVersion: 1,
    os: process.platform,
    arch: process.arch,
    node: process.version,
    packageManager: 'unknown',
    packageManagerSource: 'unknown',
    lockfileHashes: getLockfileHashes(workspaceRoot),
  };
}
