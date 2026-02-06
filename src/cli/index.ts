import { Command } from 'commander';
import { chatCommand } from './chat.js';
import { runCommand } from './run.js';
import { modelCommand } from './model.js';
import { configCommand } from './configCmd.js';
import { doctorCommand } from './doctor.js';
import { enableTrace } from '../util/logger.js';

export function createProgram(): Command {
  const program = new Command('caretforge')
    .description('CaretForge — BYOM coding-agent CLI with pluggable providers')
    .version('0.1.0')
    .option('--provider <name>', 'Provider to use (default: azure-foundry)')
    .option('--model <id>', 'Model ID to use')
    .option('--stream', 'Enable streaming output (default)', true)
    .option('--no-stream', 'Disable streaming output')
    .option('--json', 'Emit structured JSON output')
    .option('--trace', 'Enable verbose debug logging')
    .option('--allow-shell', 'Enable the shell execution tool', false)
    .option('--allow-write', 'Enable the file write tool', false)
    .hook('preAction', (_thisCommand, actionCommand) => {
      const opts = actionCommand.optsWithGlobals();
      if (opts['trace']) {
        enableTrace();
      }
    });

  program.addCommand(chatCommand);
  program.addCommand(runCommand);
  program.addCommand(modelCommand);
  program.addCommand(configCommand);
  program.addCommand(doctorCommand);

  return program;
}
