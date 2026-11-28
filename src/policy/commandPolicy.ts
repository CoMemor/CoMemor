/**
 * Command Policy Engine.
 * ADR-006 compliant.
 *
 * Phase 4 hardening:
 *  - Context-aware risk semantics: npx/bunx (remote execution), npm install
 *    (lifecycle hooks), npm run (project scripts), python <script> (arbitrary
 *    script), go run (arbitrary code) are explicitly elevated to 'medium' or
 *    'high' risk with concrete explanatory reasons.
 *  - Risk levels are PROPOSALS only — not proof of execution safety.
 *  - "sandboxed", "safe to execute" language permanently removed from responses.
 *
 * Server-side command execution has been permanently removed.
 * verifyFix() performs policy assessment only and returns a structured proposal.
 * Actual execution remains strictly with the host agent or IDE.
 */

import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { redactSensitiveData } from '../core/redact.js';
import { appendLockedJsonlSync } from '../storage/jsonl.js';
import type { Risk, VerifyFixOutput } from '../types.js';

export const ALLOWED_BINARIES = new Set([
  'npm',
  'npx',
  'pnpm',
  'yarn',
  'bun',
  'bunx',
  'cargo',
  'pytest',
  'python',
  'python3',
  'go',
  'vitest',
  'tsc',
]);

const FORBIDDEN_SHELL_PATTERNS = [
  /[;&|]/, // Chaining, background, pipes
  /[><]/, // Redirection
  /\$\(/, // Command substitution $(...)
  /`/, // Backticks
  /[\r\n]/, // Newlines
];

const DESTRUCTIVE_COMMAND_PATTERNS = [
  /\brm\b/i,
  /\bsudo\b/i,
  /\bsu\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\b/i,
  /\bnpm\s+publish\b/i,
];

export interface ParsedCommand {
  binary: string;
  args: string[];
}

export interface ApprovalRecord {
  approvalId: string;
  createdAt: string;
  command: string;
  decision: 'approve' | 'reject';
  resolvedBy?: string;
  resolvedAt?: string;
}

/**
 * Context-aware risk assessment result.
 * riskReasons lists concrete, specific reasons — not generic labels.
 * This is a PROPOSAL for review by the host agent, not an execution authorization.
 */
export interface RiskAssessment {
  risk: Risk;
  riskReasons: string[];
}

/**
 * Assess the risk level of a parsed command with context-aware reasons.
 *
 * Phase 4: elevates specific dangerous patterns:
 *  - npx/bunx: remote package execution without prior install
 *  - npm install / yarn add / pnpm add: lifecycle scripts, arbitrary package code
 *  - npm run / yarn run: executes repository-controlled project scripts (untrusted)
 *  - python <script.py>: arbitrary script execution
 *  - python -m <module>: module invocation may execute arbitrary code
 *  - go run: compiles and executes arbitrary Go source
 *  - cargo build / cargo run: build scripts and proc macros may execute code
 *  - cargo check: may execute build scripts
 */
function assessRisk(binary: string, args: string[]): RiskAssessment {
  const reasons: string[] = [];
  let risk: Risk = 'low';

  const sub = args[0]?.toLowerCase();

  switch (binary) {
    case 'npx':
    case 'bunx':
      // Remote package runners: may download and execute arbitrary code
      risk = 'high';
      reasons.push(
        `'${binary}' downloads and executes remote packages without prior install verification. ` +
          `The package author controls the executed code. Review the package source before running.`,
      );
      break;

    case 'npm':
      if (sub === 'install' || sub === 'i' || sub === 'ci') {
        risk = 'medium';
        reasons.push(
          `'npm install' executes package lifecycle scripts (preinstall, install, postinstall) ` +
            `controlled by package authors. These scripts run with the same privileges as the shell.`,
        );
      } else if (sub === 'run' || sub === 'exec') {
        risk = 'medium';
        reasons.push(
          `'npm run' executes repository-controlled project scripts defined in package.json. ` +
            `The script content is not inspected by this policy engine.`,
        );
      }
      break;

    case 'pnpm':
      if (sub === 'install' || sub === 'i' || sub === 'add') {
        risk = 'medium';
        reasons.push(
          `'pnpm install/add' executes package lifecycle scripts controlled by package authors.`,
        );
      } else if (sub === 'run' || sub === 'exec') {
        risk = 'medium';
        reasons.push(`'pnpm run' executes repository-controlled project scripts.`);
      }
      break;

    case 'yarn':
      if (sub === 'add' || sub === 'install') {
        risk = 'medium';
        reasons.push(
          `'yarn add/install' executes package lifecycle scripts controlled by package authors.`,
        );
      } else if (sub === 'run') {
        risk = 'medium';
        reasons.push(`'yarn run' executes repository-controlled project scripts.`);
      }
      break;

    case 'bun':
      if (sub === 'add' || sub === 'install') {
        risk = 'medium';
        reasons.push(
          `'bun add/install' executes package lifecycle scripts controlled by package authors.`,
        );
      } else if (sub === 'run') {
        risk = 'medium';
        reasons.push(`'bun run' executes repository-controlled project scripts.`);
      }
      break;

    case 'python':
    case 'python3':
      // Check for script argument (not -m flag)
      if (args.some((a) => !a.startsWith('-') && (a.endsWith('.py') || a.includes('/')))) {
        risk = 'medium';
        reasons.push(
          `Invoking a Python script file executes arbitrary code at the discretion of that script's author.`,
        );
      } else if (args.includes('-m')) {
        risk = 'medium';
        reasons.push(
          `'python -m <module>' executes a Python module that may perform arbitrary operations.`,
        );
      }
      break;

    case 'go':
      if (sub === 'run') {
        risk = 'medium';
        reasons.push(
          `'go run' compiles and immediately executes Go source files. ` +
            `The compiled program may perform arbitrary operations.`,
        );
      }
      break;

    case 'cargo':
      if (sub === 'build' || sub === 'check' || sub === 'run' || sub === 'test') {
        risk = 'medium';
        reasons.push(
          `'cargo ${sub}' may execute Cargo build scripts (build.rs) and procedural macros ` +
            `during compilation. These run arbitrary Rust code with the build system's privileges.`,
        );
      }
      break;

    default:
      break;
  }

  if (reasons.length === 0) {
    reasons.push(
      `Command passes static policy checks. ` +
        `This is a proposal for review — not proof that execution is safe.`,
    );
  }

  return { risk, riskReasons: reasons };
}

export class CommandPolicyEngine {
  private workspaceRoot: string;
  private memoryDir: string;

  constructor(workspaceRoot: string, memoryDir?: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.memoryDir = memoryDir ?? path.join(this.workspaceRoot, '.agent-memory');
  }

  /**
   * Validates command against metacharacters, destructive commands, allowlisted binaries,
   * and path traversal outside workspace.
   *
   * Phase 4: returns context-aware riskReasons instead of a single generic risk label.
   */
  validateCommand(commandString: string): {
    allowed: boolean;
    reason?: string;
    parsed?: ParsedCommand;
    risk: Risk;
    riskReasons?: string[];
  } {
    if (!commandString || commandString.trim().length === 0) {
      return {
        allowed: false,
        reason: 'Empty command string',
        risk: 'high',
        riskReasons: ['Empty command string'],
      };
    }

    const trimmed = commandString.trim();

    // 1. Check for forbidden shell metacharacters
    for (const pattern of FORBIDDEN_SHELL_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          allowed: false,
          reason: 'Shell metacharacters and chaining (; & | > < ` $) are strictly prohibited',
          risk: 'high',
          riskReasons: ['Shell metacharacter injection vector detected. Strictly prohibited.'],
        };
      }
    }

    // 2. Check for destructive commands
    for (const pattern of DESTRUCTIVE_COMMAND_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          allowed: false,
          reason: 'Destructive commands are permanently disallowed',
          risk: 'high',
          riskReasons: ['Destructive command pattern matched. Permanently disallowed.'],
        };
      }
    }

    // 3. Parse binary and arguments without shell evaluation
    const parts = trimmed.split(/\s+/);
    const rawBinary = parts[0] ?? '';
    const binary = path
      .basename(rawBinary)
      .toLowerCase()
      .replace(/\.(exe|cmd|bat|sh)$/i, '');
    const args = parts.slice(1);

    if (!ALLOWED_BINARIES.has(binary)) {
      return {
        allowed: false,
        reason: `Binary '${binary}' is not in the allowed proposal list (${Array.from(ALLOWED_BINARIES).join(', ')})`,
        risk: 'high',
        riskReasons: [`Binary '${binary}' is not in the allowed proposal list.`],
      };
    }

    // 4. Reject inline code execution flags (-c, -e, --eval)
    if (['python', 'python3', 'python2'].includes(binary)) {
      if (args.some((arg) => arg === '-c' || arg.startsWith('-c='))) {
        return {
          allowed: false,
          reason: `Inline code execution flag (-c) is prohibited for ${binary}`,
          risk: 'high',
          riskReasons: [`'${binary} -c' executes arbitrary inline code. Strictly prohibited.`],
        };
      }
    }
    if (['node', 'bun', 'bunx'].includes(binary)) {
      if (
        args.some(
          (arg) =>
            arg === '-e' || arg === '--eval' || arg.startsWith('-e=') || arg.startsWith('--eval='),
        )
      ) {
        return {
          allowed: false,
          reason: `Inline code evaluation flag (-e/--eval) is prohibited for ${binary}`,
          risk: 'high',
          riskReasons: [
            `'${binary} -e/--eval' executes arbitrary inline code. Strictly prohibited.`,
          ],
        };
      }
    }

    // 5. Reject unvetted remote downloads and URLs
    for (const arg of args) {
      if (
        /^(?:https?|ftp|git|ssh):\/\//i.test(arg) ||
        arg.includes('://') ||
        /\b(?:https?|ftp):\/\//i.test(arg)
      ) {
        return {
          allowed: false,
          reason: `Unvetted remote downloads and URLs are not permitted in fix commands: '${arg}'`,
          risk: 'high',
          riskReasons: [`Remote URL in argument '${arg}' may trigger unvetted network download.`],
        };
      }
    }

    // 6. Path containment checks on all arguments
    for (const arg of args) {
      const candidates = arg.includes('=') ? [arg.slice(arg.indexOf('=') + 1)] : [arg];
      for (const cand of candidates) {
        if (cand.startsWith('-') && !cand.includes('/') && !cand.includes('\\')) continue;

        const isPathLike =
          cand.includes('/') ||
          cand.includes('\\') ||
          cand.includes('..') ||
          path.isAbsolute(cand) ||
          /^[a-zA-Z]:[\\/]/.test(cand);

        if (isPathLike) {
          const resolved = path.resolve(this.workspaceRoot, cand);
          const relative = path.relative(this.workspaceRoot, resolved);
          if (relative.startsWith('..') || path.isAbsolute(relative)) {
            return {
              allowed: false,
              reason: `Workspace escape attempt detected in argument: '${arg}' (resolves outside workspace root)`,
              risk: 'high',
              riskReasons: [
                `Argument '${arg}' resolves outside the workspace root. Path traversal is prohibited.`,
              ],
            };
          }
        }
      }
    }

    // 7. Context-aware risk assessment (Phase 4)
    const { risk, riskReasons } = assessRisk(binary, args);

    return {
      allowed: true,
      parsed: { binary, args },
      risk,
      riskReasons,
    };
  }

  /**
   * Reads approvals-resolved.jsonl and checks if a command has a matching resolved entry.
   * This is used only as an audit-trail check; it does NOT authorize CoMemor to execute anything.
   * Hardened against malformed JSON lines and approval ID hijacking.
   */
  hasResolvedApproval(commandString: string, approvalId?: string): boolean {
    const resolvedPath = path.join(this.memoryDir, 'approvals-resolved.jsonl');
    if (!fs.existsSync(resolvedPath)) {
      return false;
    }

    try {
      const content = fs.readFileSync(resolvedPath, 'utf8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      for (const line of lines) {
        try {
          const parsed: unknown = JSON.parse(line);
          if (typeof parsed !== 'object' || parsed === null) {
            continue;
          }
          const record = parsed as Record<string, unknown>;
          if (
            typeof record.command !== 'string' ||
            typeof record.approvalId !== 'string' ||
            (record.decision !== 'approve' && record.decision !== 'reject')
          ) {
            continue; // Skip malformed lines
          }

          if (record.decision === 'approve') {
            const commandMatches = record.command.trim() === commandString.trim();
            if (approvalId) {
              if (record.approvalId === approvalId && commandMatches) {
                return true;
              }
            } else if (commandMatches) {
              return true;
            }
          }
        } catch {
          // Skip corrupted line and continue evaluating
          continue;
        }
      }
    } catch {
      return false;
    }

    return false;
  }

  /**
   * Queues an approval request in .agent-memory/approvals-pending.jsonl.
   * Redacts sensitive data before writing.
   */
  queueApproval(commandString: string, risk: Risk, recordId?: string): string {
    const pendingPath = path.join(this.memoryDir, 'approvals-pending.jsonl');
    const dir = path.dirname(pendingPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const approvalId = `appr_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    const entry = {
      approvalId,
      createdAt: new Date().toISOString(),
      requestedCommand: redactSensitiveData(commandString),
      recordId: recordId ?? null,
      risk,
      reason: 'Requires human operator review before execution by host agent/IDE',
      status: 'pending',
    };

    appendLockedJsonlSync(pendingPath, entry);
    return approvalId;
  }

  /**
   * Evaluates verify_fix under policy.
   * Server-side in-process live execution has been completely removed.
   * Returns a structured command proposal and policy assessment.
   * Actual execution remains strictly with the host agent or IDE.
   *
   * Phase 4: response includes riskReasons for transparency.
   * Language like "sandboxed" or "safe to execute" is never used.
   */
  async verifyFix(
    commandString: string,
    dryRun = true,
    recordId?: string,
  ): Promise<VerifyFixOutput> {
    await Promise.resolve();
    const policy = this.validateCommand(commandString);

    if (!policy.allowed || !policy.parsed) {
      return {
        status: 'dry_run_denied',
        proposedCommand: redactSensitiveData(commandString),
        risk: policy.risk,
        policyReason: policy.reason ?? 'Command violates safety policy',
        requiresHostConfirmation: true,
        executedByServer: false,
      };
    }

    if (dryRun) {
      const riskSummary = policy.riskReasons?.join(' ') ?? `Risk level: ${policy.risk}`;
      return {
        status: 'dry_run_allowed',
        proposedCommand: redactSensitiveData(commandString),
        parsed: policy.parsed,
        risk: policy.risk,
        policyReason: `Policy assessment: ${riskSummary} This is a proposal for host-agent review — not proof that execution is safe.`,
        requiresHostConfirmation: true,
        executedByServer: false,
      };
    }

    // Live execution requested: Server-side execution is removed.
    const approvalId = this.queueApproval(commandString, policy.risk, recordId);
    return {
      status: 'pending_approval',
      approvalId,
      proposedCommand: redactSensitiveData(commandString),
      parsed: policy.parsed,
      risk: policy.risk,
      policyReason:
        'Live server-side execution has been removed. Proposal logged to approvals-pending.jsonl for operator review. Execute via host agent/IDE under its own approval flow.',
      requiresHostConfirmation: true,
      executedByServer: false,
    };
  }
}
