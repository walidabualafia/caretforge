/**
 * Session disclaimer — prompts the user to accept that CaretForge
 * can read, write, and execute in their working directory.
 * Displayed every time a session starts (never cached).
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import chalk from 'chalk';

/**
 * Show the disclaimer and prompt the user to accept.
 * Returns true if accepted, false if declined.
 * This runs every session — acceptance is never persisted.
 */
export async function ensureDisclaimer(): Promise<boolean> {
  // Non-TTY (piped) — can't prompt, refuse
  if (!process.stdin.isTTY) {
    console.error(
      chalk.red(
        'CaretForge requires an interactive terminal to accept the disclaimer. Run it directly.',
      ),
    );
    return false;
  }

  console.log('');
  console.log(chalk.bold.yellow('  ⚠  Disclaimer'));
  console.log('');
  console.log(
    `  CaretForge is an AI-powered coding agent that operates in ${chalk.bold('your current directory')}.`,
  );
  console.log('  It can:');
  console.log(`    • ${chalk.cyan('Read')} any file in your working directory`);
  console.log(`    • ${chalk.yellow('Write')} files (with your permission per action)`);
  console.log(`    • ${chalk.red('Execute')} shell commands (with your permission per action)`);
  console.log('');
  console.log(chalk.dim('  Write and shell actions always require explicit approval unless'));
  console.log(chalk.dim('  you pass --allow-write or --allow-shell.'));
  console.log('');
  console.log(
    `  ${chalk.bold('By continuing, you accept that you use this tool at your own risk.')}`,
  );
  console.log('');

  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const answer = await rl.question(
      `  ${chalk.bold('Accept?')} [${chalk.green('y')}]${chalk.dim('es')} / [${chalk.red('n')}]${chalk.dim('o')} `,
    );
    const normalised = answer.trim().toLowerCase();

    if (normalised === 'y' || normalised === 'yes' || normalised === '') {
      console.log('');
      return true;
    }

    console.log('');
    console.log(chalk.dim('  Declined. Exiting.'));
    return false;
  } finally {
    rl.close();
  }
}
