/**
 * Interactive permission manager for tool calls.
 *
 * Instead of requiring --allow-write / --allow-shell up-front,
 * the agent prompts the user when the model requests a dangerous tool.
 * The user can approve once, deny, or approve all future calls of that type.
 */
import type { Interface as ReadlineInterface } from 'node:readline/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { formatPermissionRequest, formatPermissionPrompt } from './format.js';

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
   * read_file is always allowed. write_file and exec_shell prompt
   * unless already auto-approved.
   */
  async check(toolName: string, args: Record<string, unknown>): Promise<boolean> {
    // read_file is always safe
    if (toolName === 'read_file') return true;

    // Check pre-approvals
    if (toolName === 'write_file' && this.state.alwaysWrite) return true;
    if (toolName === 'exec_shell' && this.state.alwaysShell) return true;

    // Not a TTY → can't prompt, deny
    if (!process.stdin.isTTY) return false;

    return this.promptUser(toolName, args);
  }

  private async promptUser(toolName: string, args: Record<string, unknown>): Promise<boolean> {
    const ownRl = !this.rl;
    const rl = this.rl ?? createInterface({ input: stdin, output: stdout });

    try {
      console.log(formatPermissionRequest(toolName, args));
      const answer = await rl.question(formatPermissionPrompt());
      const normalised = answer.trim().toLowerCase();

      if (normalised === 'a' || normalised === 'always') {
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
