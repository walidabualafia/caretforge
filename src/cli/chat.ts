import { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import ora from 'ora';
import type { ChatMessage } from '../providers/provider.js';
import { userMessage } from '../core/messages.js';
import { runAgent, type AgentOptions } from '../core/agent.js';
import { resolveProvider } from './shared.js';
import { getLogger } from '../util/logger.js';
import { formatError } from '../util/errors.js';

export const chatCommand = new Command('chat')
  .description('Interactive chat session with streaming')
  .action(async (_opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    const log = getLogger();

    const provider = await resolveProvider(globals);
    const model: string = globals['model'] ?? 'gpt-4o';
    const stream: boolean = globals['stream'] ?? true;
    const allowWrite: boolean = globals['allowWrite'] ?? false;
    const allowShell: boolean = globals['allowShell'] ?? false;

    log.info({ provider: provider.name, model, stream }, 'Starting chat session');
    console.log(`\n  CaretForge chat  |  provider: ${provider.name}  |  model: ${model}`);
    console.log('  Type "exit" or Ctrl+C to quit.\n');

    const rl = createInterface({ input: stdin, output: stdout });
    const history: ChatMessage[] = [];

    try {
      while (true) {
        const input = await rl.question('you > ');
        const trimmed = input.trim();

        if (!trimmed) continue;
        if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
          break;
        }

        history.push(userMessage(trimmed));

        const agentOptions: AgentOptions = {
          provider,
          model,
          stream,
          allowWrite,
          allowShell,
          onToken: (token) => process.stdout.write(token),
          onToolCall: (tc) => {
            console.log(`\n  [tool] ${tc.function.name}(${tc.function.arguments})`);
          },
        };

        let spinner: ReturnType<typeof ora> | undefined;
        if (!stream) {
          spinner = ora('Thinking...').start();
        } else {
          process.stdout.write('\nassistant > ');
        }

        try {
          const result = await runAgent(history, agentOptions);

          if (spinner) {
            spinner.stop();
            console.log(`\nassistant > ${result.finalContent}`);
          } else {
            // Streaming already printed tokens; just add newline
            console.log('');
          }

          // Keep conversation in sync
          history.length = 0;
          // Skip system message (index 0) from result.messages
          history.push(...result.messages.slice(1));
        } catch (err) {
          spinner?.stop();
          console.error(`\n  Error: ${formatError(err)}`);
        }
      }
    } finally {
      rl.close();
    }

    console.log('\nGoodbye!');
  });
