import { Command } from 'commander';
import { chatCommand } from './chat.js';
import { runCommand } from './run.js';
import { modelCommand } from './model.js';
import { configCommand } from './configCmd.js';
import { doctorCommand } from './doctor.js';
import { enableTrace } from '../util/logger.js';

export function createProgram(): Command {
  const program = new Command('caretforge')
    .description('CaretForge — BYOM coding-agent CLI')
    .version('0.1.0')
    .option('--provider <name>', 'Provider to use')
    .option('--model <id>', 'Model ID to use')
    .option('--stream', 'Enable streaming output (default)', true)
    .option('--no-stream', 'Disable streaming output')
    .option('--json', 'Emit structured JSON output')
    .option('--trace', 'Enable verbose debug logging')
    .option('--allow-shell', 'Auto-approve shell execution (skip prompts)', false)
    .option('--allow-write', 'Auto-approve file writes (skip prompts)', false)
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
