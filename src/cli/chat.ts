import { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import type { ChatMessage } from '../providers/provider.js';
import { userMessage } from '../core/messages.js';
import { runAgent, type AgentOptions } from '../core/agent.js';
import { resolveProvider } from './shared.js';
import { getLogger } from '../util/logger.js';
import { formatError } from '../util/errors.js';
import { PermissionManager } from '../ui/permissions.js';
import {
  printBanner,
  USER_PROMPT,
  formatToolCallStart,
  formatToolResult,
  printHelp,
  printError,
  printDim,
} from '../ui/format.js';

export const chatCommand = new Command('chat')
  .description('Interactive chat session (default when no command given)')
  .action(async (_opts, cmd) => {
    const globals = cmd.optsWithGlobals();
    const log = getLogger();

    const provider = await resolveProvider(globals);
    const defaultModel = await getDefaultModel(globals, provider.name);
    let model = defaultModel;
    const stream: boolean = globals['stream'] ?? true;

    const rl = createInterface({ input: stdin, output: stdout });

    const permissions = new PermissionManager({
      allowWrite: globals['allowWrite'] ?? false,
      allowShell: globals['allowShell'] ?? false,
      readline: rl,
    });

    log.info({ provider: provider.name, model, stream }, 'Starting chat session');
    printBanner(provider.name, model);

    const history: ChatMessage[] = [];

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      console.log('\n');
      printDim('Goodbye!');
      process.exit(0);
    });

    try {
      while (true) {
        const input = await rl.question(USER_PROMPT);
        const trimmed = input.trim();

        if (!trimmed) continue;

        // ── Slash commands ──────────────────────────────────
        if (trimmed.startsWith('/')) {
          const [slashCmd, ...rest] = trimmed.split(/\s+/);
          const arg = rest.join(' ');

          switch (slashCmd) {
            case '/exit':
            case '/quit':
              console.log('');
              printDim('Goodbye!');
              return;

            case '/help':
              printHelp();
              continue;

            case '/clear':
              history.length = 0;
              printDim('Conversation cleared.');
              continue;

            case '/model':
              if (arg) {
                model = arg;
                printDim(`Model switched to ${model}`);
              } else {
                printDim(`Current model: ${model}`);
              }
              continue;

            case '/compact':
              if (history.length > 4) {
                const removed = history.splice(0, history.length - 4);
                printDim(`Compacted ${removed.length} messages from history.`);
              } else {
                printDim('History is already compact.');
              }
              continue;

            default:
              printError(`Unknown command: ${slashCmd}. Type /help for available commands.`);
              continue;
          }
        }

        // ── Normal message ─────────────────────────────────
        history.push(userMessage(trimmed));

        const agentOptions: AgentOptions = {
          provider,
          model,
          stream,
          onToken: (token) => process.stdout.write(token),
          onToolCall: (name, args) => {
            // End any streaming line before showing tool info
            console.log('');
            console.log(formatToolCallStart(name, args));
          },
          onToolResult: (name, result) => {
            console.log(formatToolResult(name, result));
          },
          onPermissionRequest: (name, args) => permissions.check(name, args),
        };

        // Start streaming output on a new line
        if (stream) {
          console.log('');
        }

        try {
          const result = await runAgent(history, agentOptions);

          if (!stream && result.finalContent) {
            console.log(`\n${result.finalContent}`);
          }

          // Ensure clean newline after response
          console.log('');

          // Sync conversation history (skip the system message at index 0)
          history.length = 0;
          history.push(...result.messages.slice(1));
        } catch (err) {
          printError(formatError(err));
        }
      }
    } finally {
      rl.close();
    }
  });

/**
 * Determine the default model from CLI flags or config.
 */
async function getDefaultModel(
  globals: Record<string, unknown>,
  providerName: string,
): Promise<string> {
  if (globals['model']) return globals['model'] as string;

  // Pick a reasonable default per provider
  switch (providerName) {
    case 'azure-anthropic':
      return 'claude-opus-4-6';
    case 'azure-foundry':
      return 'gpt-4.1';
    default:
      return 'gpt-4o';
  }
}
