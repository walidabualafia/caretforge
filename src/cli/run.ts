import { Command } from 'commander';
import ora from 'ora';
import { userMessage } from '../core/messages.js';
import { buildRunPrompt } from '../core/prompts.js';
import { runAgent, type AgentOptions } from '../core/agent.js';
import { resolveProvider } from './shared.js';
import { getLogger } from '../util/logger.js';
import { formatError } from '../util/errors.js';

export const runCommand = new Command('run')
  .description('Run a task non-interactively (reads from args or stdin)')
  .argument('[task...]', 'The task description')
  .action(async (taskParts: string[], _opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    const log = getLogger();

    let task = taskParts.join(' ').trim();

    // If no task provided, try reading from stdin
    if (!task) {
      if (!process.stdin.isTTY) {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk as Buffer);
        }
        task = Buffer.concat(chunks).toString('utf-8').trim();
      }
    }

    if (!task) {
      console.error('Error: No task provided. Pass a task as arguments or pipe via stdin.');
      process.exit(1);
    }

    const provider = await resolveProvider(globals);
    const model: string = globals['model'] ?? 'gpt-4o';
    const stream: boolean = globals['stream'] ?? true;
    const allowWrite: boolean = globals['allowWrite'] ?? false;
    const allowShell: boolean = globals['allowShell'] ?? false;
    const jsonOutput: boolean = globals['json'] ?? false;

    log.debug({ task: task.slice(0, 100), model }, 'Running task');

    const agentOptions: AgentOptions = {
      provider,
      model,
      stream: !jsonOutput && stream,
      allowWrite,
      allowShell,
      onToken: jsonOutput ? undefined : (token) => process.stdout.write(token),
      onToolCall: jsonOutput
        ? undefined
        : (tc) => {
            console.log(`\n  [tool] ${tc.function.name}(${tc.function.arguments})`);
          },
    };

    const spinner = jsonOutput || stream ? undefined : ora('Working...').start();

    try {
      const history = [userMessage(buildRunPrompt(task))];
      const result = await runAgent(history, agentOptions);

      spinner?.stop();

      if (jsonOutput) {
        const output = {
          task,
          model,
          provider: provider.name,
          finalContent: result.finalContent,
          toolCallCount: result.toolCallCount,
          durationMs: result.durationMs,
          messages: result.messages.slice(1), // skip system
        };
        console.log(JSON.stringify(output, null, 2));
      } else if (!stream) {
        console.log(result.finalContent);
      } else {
        // Streaming already printed; just ensure newline
        console.log('');
      }
    } catch (err) {
      spinner?.stop();
      if (jsonOutput) {
        console.log(JSON.stringify({ error: formatError(err) }));
      } else {
        console.error(`Error: ${formatError(err)}`);
      }
      process.exit(1);
    }
  });
