#!/usr/bin/env node

/**
 * CaretForge entry point with smart routing:
 *
 *   caretforge                     → interactive chat
 *   caretforge "fix the bug"       → one-shot run
 *   caretforge chat                → interactive chat (explicit)
 *   caretforge run "fix the bug"   → one-shot run (explicit)
 *   caretforge model list          → list models
 *   caretforge config show         → show config
 *   caretforge doctor              → run diagnostics
 */

import { createProgram } from './cli/index.js';

const KNOWN_COMMANDS = new Set(['model', 'config', 'doctor', 'chat', 'run', 'help']);

// Flags that consume the next argument as a value
const FLAGS_WITH_VALUE = new Set(['--provider', '--model']);

function getEffectiveArgs(raw: string[]): string[] {
  // Separate flags from positional arguments
  const flags: string[] = [];
  const positional: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const arg = raw[i]!;
    if (arg.startsWith('-')) {
      flags.push(arg);
      if (FLAGS_WITH_VALUE.has(arg) && i + 1 < raw.length) {
        i++;
        flags.push(raw[i]!);
      }
    } else {
      positional.push(arg);
    }
  }

  const firstPositional = positional[0];

  // If first positional is a known subcommand → pass through as-is
  if (firstPositional && KNOWN_COMMANDS.has(firstPositional)) {
    return raw;
  }

  // If there are positional args that aren't subcommands → run as task
  if (positional.length > 0) {
    return ['run', ...flags, ...positional];
  }

  // Only flags or nothing → interactive chat
  return ['chat', ...flags];
}

const program = createProgram();
const userArgs = process.argv.slice(2);
const effectiveArgs = getEffectiveArgs(userArgs);

program.parseAsync(['node', 'caretforge', ...effectiveArgs]).catch((err: Error) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
