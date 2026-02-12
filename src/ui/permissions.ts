/**
 * Interactive permission manager for tool calls.
 *
 * Instead of requiring --allow-write / --allow-shell up-front,
 * the agent prompts the user when the model requests a dangerous tool.
 * The user can approve once, deny, or approve all future calls of that type.
 *
 * The safety layer classifies commands by risk:
 *  - safe: auto-approve when --allow-shell or session "always"
 *  - mutating: normal permission prompt
 *  - destructive: always prompt, even with --allow-shell, with red warning
 *  - blocked: deny outright with explanation
 */
import type { Interface as ReadlineInterface } from 'node:readline/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import chalk from 'chalk';
import {
  formatPermissionRequest,
  formatPermissionPrompt,
  formatBlockedWarning,
  formatDestructiveWarning,
} from './format.js';
import { analyseCommand, analyseWritePath } from '../safety/commandSafety.js';

export interface PermissionState {
  alwaysWrite: boolean;
  alwaysShell: boolean;
}

export interface PermissionManagerOptions {
  /** Pre-approve all writes (--allow-write flag). */
  allowWrite?: boolean;
  /** Pre-approve all shell executions (--allow-shell flag). */
  allowShell?: boolean;
  /**
   * Existing readline interface to reuse for prompting.
   * If not provided, a temporary one is created per prompt.
   */
  readline?: ReadlineInterface;
}

export class PermissionManager {
  private state: PermissionState;
  private rl: ReadlineInterface | undefined;

  constructor(opts: PermissionManagerOptions = {}) {
    this.state = {
      alwaysWrite: opts.allowWrite ?? false,
      alwaysShell: opts.allowShell ?? false,
    };
    this.rl = opts.readline;
  }

  /**
   * Check permission for a tool call. Returns true if allowed.
   * read_file is always allowed. write_file and exec_shell go through
   * the safety analysis layer before prompting.
   */
  async check(toolName: string, args: Record<string, unknown>): Promise<boolean> {
    // read_file is always safe
    if (toolName === 'read_file') return true;

    // ── exec_shell safety analysis ────────────────────────
    if (toolName === 'exec_shell') {
      const command = String(args['command'] ?? '');
      const verdict = analyseCommand(command);

      // Blocked — deny outright, no prompt
      if (verdict.level === 'blocked') {
        console.log(formatBlockedWarning(command, verdict.reason));
        return false;
      }

      // Safe — auto-approve if flag or session "always"
      if (verdict.level === 'safe' && this.state.alwaysShell) {
        return true;
      }

      // Destructive — always prompt, even with --allow-shell
      if (verdict.level === 'destructive') {
        if (!process.stdin.isTTY) return false;
        return this.promptUser(toolName, args, verdict.reason);
      }

      // Mutating — normal flow: check pre-approval, then prompt
      if (this.state.alwaysShell) return true;
      if (!process.stdin.isTTY) return false;
      return this.promptUser(toolName, args);
    }

    // ── write_file safety analysis ────────────────────────
    if (toolName === 'write_file') {
      const filePath = String(args['path'] ?? '');
      const verdict = analyseWritePath(filePath);

      // Blocked — deny outright
      if (verdict.level === 'blocked') {
        console.log(formatBlockedWarning(filePath, verdict.reason));
        return false;
      }

      // Destructive — always prompt, even with --allow-write
      if (verdict.level === 'destructive') {
        if (!process.stdin.isTTY) return false;
        return this.promptUser(toolName, args, verdict.reason);
      }

      // Normal — check pre-approval, then prompt
      if (this.state.alwaysWrite) return true;
      if (!process.stdin.isTTY) return false;
      return this.promptUser(toolName, args);
    }

    // Unknown tool — deny by default
    return false;
  }

  private async promptUser(
    toolName: string,
    args: Record<string, unknown>,
    escalationReason?: string,
  ): Promise<boolean> {
    const ownRl = !this.rl;
    const rl = this.rl ?? createInterface({ input: stdin, output: stdout });

    try {
      // Show escalation warning for destructive actions
      if (escalationReason) {
        console.log(formatDestructiveWarning(escalationReason));
      }

      console.log(formatPermissionRequest(toolName, args));

      // Destructive actions don't offer "always" — only y/n
      const prompt = escalationReason
        ? `  ${chalk.dim('Allow?')} [${chalk.green('y')}]${chalk.dim('es')} / [${chalk.red('n')}]${chalk.dim('o')} `
        : formatPermissionPrompt();

      const answer = await rl.question(prompt);
      const normalised = answer.trim().toLowerCase();

      // "always" only available for non-destructive actions
      if (!escalationReason && (normalised === 'a' || normalised === 'always')) {
        if (toolName === 'write_file') this.state.alwaysWrite = true;
        if (toolName === 'exec_shell') this.state.alwaysShell = true;
        return true;
      }

      // Empty answer or 'y' / 'yes' → allow once
      return normalised === '' || normalised === 'y' || normalised === 'yes';
    } finally {
      if (ownRl) rl.close();
    }
  }
}
