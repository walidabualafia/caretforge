import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { ToolError } from '../util/errors.js';

export interface GrepSearchArgs {
  pattern: string;
  path?: string;
  include?: string;
}

const MAX_OUTPUT_LINES = 200;
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Search file contents using ripgrep, falling back to grep.
 * Returns matching lines with file paths and line numbers,
 * capped at MAX_OUTPUT_LINES to prevent token explosion.
 */
export async function executeGrepSearch(args: GrepSearchArgs): Promise<string> {
  const searchDir = args.path ? resolve(args.path) : process.cwd();
  const { pattern, include } = args;

  if (!pattern) {
    throw new ToolError('grep_search requires a non-empty "pattern" argument.');
  }

  const rgArgs = buildRipgrepArgs(pattern, include);
  const grepArgs = buildGrepArgs(pattern, include);

  let result: string;
  try {
    result = await runCommand('rg', rgArgs, searchDir);
  } catch {
    result = await runCommand('grep', grepArgs, searchDir);
  }

  const lines = result.split('\n').filter(Boolean);
  if (lines.length === 0) {
    return `No matches found for pattern "${pattern}" in ${searchDir}`;
  }

  const truncated = lines.length > MAX_OUTPUT_LINES;
  const displayed = truncated ? lines.slice(0, MAX_OUTPUT_LINES) : lines;
  const summary = truncated
    ? `Showing ${MAX_OUTPUT_LINES} of ${lines.length} matches (output truncated):\n\n`
    : `Found ${lines.length} match${lines.length !== 1 ? 'es' : ''}:\n\n`;

  return summary + displayed.join('\n');
}

function buildRipgrepArgs(pattern: string, include?: string): string[] {
  const args = ['--line-number', '--no-heading', '--color=never', '--max-count=500'];
  if (include) {
    args.push('--glob', include);
  }
  args.push('--', pattern);
  return args;
}

function buildGrepArgs(pattern: string, include?: string): string[] {
  const args = ['-rn', '--color=never'];
  if (include) {
    args.push('--include', include);
  }
  args.push('--', pattern, '.');
  return args;
}

function runCommand(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: DEFAULT_TIMEOUT_MS,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('error', () => {
      reject(new ToolError(`${cmd} is not available on this system.`));
    });

    child.on('close', (code) => {
      // rg/grep exit 1 = no matches, exit 2+ = error
      if (code !== null && code >= 2) {
        reject(new ToolError(`${cmd} failed (exit ${code}): ${stderr.trim()}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}
