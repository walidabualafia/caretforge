/**
 * Terminal formatting utilities — colors, tool display, banners.
 */
import chalk from 'chalk';

// ── Version ──────────────────────────────────────────────────

const VERSION = '0.1.0';

// ── Banner ───────────────────────────────────────────────────

export function printBanner(provider: string, model: string): void {
  console.log('');
  console.log(`  ${chalk.bold.cyan('CaretForge')} ${chalk.dim(`v${VERSION}`)}`);
  console.log(`  ${chalk.dim(`${provider} · ${model}`)}`);
  console.log(`  ${chalk.dim('Type /help for commands · Ctrl+C to exit')}`);
  console.log('');
}

// ── Prompt ───────────────────────────────────────────────────

export const USER_PROMPT = chalk.bold.blue('> ');

// ── Tool call display ────────────────────────────────────────

export function formatToolCallStart(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'read_file':
      return `  ${chalk.cyan('▶')} ${chalk.bold('Read')} ${chalk.yellow(String(args['path']))}`;
    case 'write_file':
      return `  ${chalk.cyan('▶')} ${chalk.bold('Write')} ${chalk.yellow(String(args['path']))}`;
    case 'exec_shell':
      return `  ${chalk.cyan('▶')} ${chalk.bold('$')} ${chalk.dim(String(args['command']))}`;
    default:
      return `  ${chalk.cyan('▶')} ${chalk.bold(name)}(${JSON.stringify(args)})`;
  }
}

export function formatToolResult(name: string, result: string): string {
  switch (name) {
    case 'read_file': {
      const lines = result.split('\n').length;
      return chalk.dim(`    ${lines} line${lines !== 1 ? 's' : ''}`);
    }
    case 'write_file':
      return `    ${chalk.green('✓')} ${chalk.dim(result)}`;
    case 'exec_shell': {
      try {
        const parsed = JSON.parse(result) as {
          stdout?: string;
          stderr?: string;
          exitCode?: number | null;
        };
        const exitCode = parsed.exitCode ?? 0;
        const icon = exitCode === 0 ? chalk.green('✓') : chalk.red('✗');
        const parts: string[] = [`    ${icon} ${chalk.dim(`exit ${exitCode}`)}`];

        if (parsed.stdout) {
          const lines = parsed.stdout.split('\n');
          const preview = lines.slice(0, 8);
          parts.push(
            ...preview.map((l) => chalk.dim(`    ${l}`)),
            ...(lines.length > 8 ? [chalk.dim(`    … ${lines.length - 8} more lines`)] : []),
          );
        }
        if (parsed.stderr) {
          parts.push(...parsed.stderr.split('\n').map((l) => chalk.red(`    ${l}`)));
        }
        return parts.join('\n');
      } catch {
        return chalk.dim(`    ${result.slice(0, 200)}`);
      }
    }
    default:
      return chalk.dim(`    ${result.slice(0, 200)}`);
  }
}

// ── Permission prompt formatting ─────────────────────────────

export function formatPermissionRequest(toolName: string, args: Record<string, unknown>): string {
  let description: string;
  if (toolName === 'write_file') {
    description = `Write to ${chalk.yellow(String(args['path']))}`;
  } else if (toolName === 'exec_shell') {
    description = `Run ${chalk.yellow(String(args['command']))}`;
  } else {
    description = `Use ${toolName}`;
  }
  return `  ${chalk.bold.yellow('⚡')} ${description}`;
}

export function formatPermissionPrompt(): string {
  return `  ${chalk.dim('Allow?')} [${chalk.green('y')}]${chalk.dim('es')} / [${chalk.red('n')}]${chalk.dim('o')} / [${chalk.cyan('a')}]${chalk.dim('lways')} `;
}

// ── Slash command help ───────────────────────────────────────

export function printHelp(): void {
  console.log('');
  console.log(chalk.bold('  Commands'));
  console.log(`    ${chalk.cyan('/help')}              Show this help`);
  console.log(`    ${chalk.cyan('/clear')}             Clear conversation history`);
  console.log(`    ${chalk.cyan('/model')}             List available models`);
  console.log(`    ${chalk.cyan('/model <id>')}        Switch model`);
  console.log(`    ${chalk.cyan('/compact')}           Summarise and compact history`);
  console.log(`    ${chalk.cyan('/exit')}              Exit CaretForge`);
  console.log('');
  console.log(chalk.bold('  Permissions'));
  console.log(`    When the agent wants to write a file or run a command, you'll be prompted.`);
  console.log(
    `    Choose ${chalk.green('[y]es')}, ${chalk.red('[n]o')}, or ${chalk.cyan('[a]lways')} to remember for the session.`,
  );
  console.log(
    `    Use ${chalk.dim('--allow-write')} / ${chalk.dim('--allow-shell')} to auto-approve.`,
  );
  console.log('');
}

// ── Misc ─────────────────────────────────────────────────────

export function printError(msg: string): void {
  console.error(`  ${chalk.red('✗')} ${msg}`);
}

export function printDim(msg: string): void {
  console.log(chalk.dim(`  ${msg}`));
}
