import { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { userMessage } from '../core/messages.js';
import { buildRunPrompt } from '../core/prompts.js';
import { runAgent, type AgentOptions } from '../core/agent.js';
import { resolveProvider } from './shared.js';
import { getLogger } from '../util/logger.js';
import { formatError } from '../util/errors.js';
import { PermissionManager } from '../ui/permissions.js';
import { ensureDisclaimer } from '../ui/disclaimer.js';
import { indexFiles, expandFileReferences } from '../ui/fileContext.js';
import { formatToolCallStart, formatToolResult, printError } from '../ui/format.js';

export const runCommand = new Command('run')
  .description('Run a task non-interactively (reads from args or stdin)')
  .argument('[task...]', 'The task description')
  .action(async (taskParts: string[], _opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    const log = getLogger();

    // ── Disclaimer ──────────────────────────────────────────
    const accepted = await ensureDisclaimer();
    if (!accepted) process.exit(0);

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
    const model: string = globals['model'] ?? getDefaultModel(provider.name);
    const stream: boolean = globals['stream'] ?? true;
    const jsonOutput: boolean = globals['json'] ?? false;

    log.debug({ task: task.slice(0, 100), model }, 'Running task');

    // ── Expand @file references ─────────────────────────────
    const fileIndex = await indexFiles(process.cwd());
    const { expandedMessage } = await expandFileReferences(task, fileIndex);

    // Set up permission manager
    let rl: ReturnType<typeof createInterface> | undefined;
    if (process.stdin.isTTY && !jsonOutput) {
      rl = createInterface({ input: stdin, output: stdout });
    }

    const permissions = new PermissionManager({
      allowWrite: globals['allowWrite'] ?? false,
      allowShell: globals['allowShell'] ?? false,
      readline: rl,
    });

    const agentOptions: AgentOptions = {
      provider,
      model,
      stream: !jsonOutput && stream,
      onToken: jsonOutput ? undefined : (token) => process.stdout.write(token),
      onToolCall: jsonOutput
        ? undefined
        : (name, args) => {
            console.log('');
            console.log(formatToolCallStart(name, args));
          },
      onToolResult: jsonOutput
        ? undefined
        : (name, result) => {
            console.log(formatToolResult(name, result));
          },
      onPermissionRequest: (name, args) => permissions.check(name, args),
    };

    try {
      const history = [userMessage(buildRunPrompt(expandedMessage))];
      const result = await runAgent(history, agentOptions);

      if (jsonOutput) {
        const output = {
          task,
          model,
          provider: provider.name,
          finalContent: result.finalContent,
          toolCallCount: result.toolCallCount,
          durationMs: result.durationMs,
          messages: result.messages.slice(1),
        };
        console.log(JSON.stringify(output, null, 2));
      } else if (!stream && result.finalContent) {
        console.log(result.finalContent);
      } else {
        console.log('');
      }
    } catch (err) {
      if (jsonOutput) {
        console.log(JSON.stringify({ error: formatError(err) }));
      } else {
        printError(formatError(err));
      }
      process.exit(1);
    } finally {
      rl?.close();
    }
  });

function getDefaultModel(providerName: string): string {
  switch (providerName) {
    case 'azure-anthropic':
      return 'claude-opus-4-6';
    case 'azure-foundry':
      return 'gpt-4.1';
    default:
      return 'gpt-4o';
  }
}
