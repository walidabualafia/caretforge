import { spawn } from 'node:child_process';
import { ToolError } from '../util/errors.js';

export interface ExecShellArgs {
  command: string;
  cwd?: string;
  timeout?: number;
}

export interface ExecShellResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Execute a shell command. Permission checking is handled by the agent loop
 * before this function is called.
 */
export async function executeShell(args: ExecShellArgs): Promise<string> {
  const timeout = args.timeout ?? DEFAULT_TIMEOUT_MS;

  return new Promise<string>((resolve, reject) => {
    const child = spawn(args.command, {
      shell: true,
      cwd: args.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      reject(new ToolError(`Shell command failed: ${err.message}`, err));
    });

    child.on('close', (code) => {
      const result: ExecShellResult = {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code,
      };
      resolve(JSON.stringify(result, null, 2));
    });
  });
}
