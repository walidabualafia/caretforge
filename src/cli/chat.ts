import { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import chalk from 'chalk';
import type { ChatMessage } from '../providers/provider.js';
import { userMessage } from '../core/messages.js';
import { runAgent, type AgentOptions } from '../core/agent.js';
import { resolveProvider } from './shared.js';
import { getLogger } from '../util/logger.js';
import { formatError } from '../util/errors.js';
import { PermissionManager } from '../ui/permissions.js';
import { ensureDisclaimer } from '../ui/disclaimer.js';
import {
  indexFiles,
  createFileCompleter,
  expandFileReferences,
  parseBrowseQuery,
  matchFiles,
} from '../ui/fileContext.js';
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

    // ── Disclaimer ──────────────────────────────────────────
    const accepted = await ensureDisclaimer();
    if (!accepted) process.exit(0);

    const provider = await resolveProvider(globals);
    const defaultModel = await getDefaultModel(globals, provider.name);
    let model = defaultModel;
    const stream: boolean = globals['stream'] ?? true;

    // ── Index files for @-completion ────────────────────────
    const cwd = process.cwd();
    printDim('Indexing files...');
    const fileIndex = await indexFiles(cwd);
    const completer = createFileCompleter(fileIndex);

    const rl = createInterface({
      input: stdin,
      output: stdout,
      completer,
    });

    const permissions = new PermissionManager({
      allowWrite: globals['allowWrite'] ?? false,
      allowShell: globals['allowShell'] ?? false,
      readline: rl,
    });

    log.info({ provider: provider.name, model, stream }, 'Starting chat session');
    printBanner(provider.name, model);
    printDim(`${fileIndex.length} files indexed · use @filename to add context`);
    console.log('');

    // Fetch available models for /model listing
    let availableModels: Array<{ id: string; description?: string }> = [];
    try {
      availableModels = await provider.listModels();
    } catch {
      /* non-critical */
    }

    const history: ChatMessage[] = [];

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      console.log('\n');
      printDim('Goodbye!');
      process.exit(0);
    });

    // Ensure stdin is flowing before readline takes over
    if (stdin.isPaused()) stdin.resume();

    try {
      while (true) {
        const input = await rl.question(USER_PROMPT);
        const trimmed = input.trim();

        if (!trimmed) continue;

        // ── Exit keywords (with or without slash) ───────────
        const lower = trimmed.toLowerCase();
        if (lower === 'exit' || lower === 'quit' || lower === 'q') {
          console.log('');
          printDim('Goodbye!');
          rl.close();
          process.exit(0);
        }

        // ── Slash commands ──────────────────────────────────
        if (trimmed.startsWith('/')) {
          const [slashCmd, ...rest] = trimmed.split(/\s+/);
          const arg = rest.join(' ');

          switch (slashCmd) {
            case '/exit':
            case '/quit':
              console.log('');
              printDim('Goodbye!');
              rl.close();
              process.exit(0);
              return; // unreachable, but keeps TS happy

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
                if (availableModels.length > 0) {
                  printDim('Available models:');
                  for (const m of availableModels) {
                    const active = m.id === model ? ' (active)' : '';
                    const desc = m.description ? ` — ${m.description}` : '';
                    printDim(`  • ${m.id}${desc}${active}`);
                  }
                  printDim('Switch with: /model <id>');
                }
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

        // ── Browse files with bare @ ─────────────────────────
        const browsePrefix = parseBrowseQuery(trimmed);
        if (browsePrefix !== null) {
          const { matches, total, truncated } = matchFiles(fileIndex, browsePrefix);
          if (matches.length === 0) {
            printDim(`No files matching @${browsePrefix}`);
          } else {
            printDim(
              browsePrefix
                ? `Files matching @${browsePrefix} (${total} total):`
                : `Indexed files (${total} total):`,
            );
            for (const f of matches) {
              console.log(`  ${chalk.cyan('@')}${chalk.dim(f)}`);
            }
            if (truncated) {
              printDim(`  … and ${total - matches.length} more. Narrow with @path/prefix`);
            }
          }
          continue;
        }

        // ── Expand @file references ────────────────────────
        const { expandedMessage, refs } = await expandFileReferences(trimmed, fileIndex);
        if (refs.length > 0) {
          for (const ref of refs) {
            const lines = ref.content.split('\n').length;
            console.log(
              `  ${chalk.cyan('+')} ${chalk.dim(`${ref.path}`)} ${chalk.dim(`(${lines} lines)`)}`,
            );
          }
        }

        history.push(userMessage(expandedMessage));

        const agentOptions: AgentOptions = {
          provider,
          model,
          stream,
          onToken: (token) => process.stdout.write(token),
          onToolCall: (name, args) => {
            console.log('');
            console.log(formatToolCallStart(name, args));
          },
          onToolResult: (name, result) => {
            console.log(formatToolResult(name, result));
          },
          onPermissionRequest: (name, args) => permissions.check(name, args),
        };

        if (stream) {
          console.log('');
        }

        try {
          const result = await runAgent(history, agentOptions);

          if (!stream && result.finalContent) {
            console.log(`\n${result.finalContent}`);
          }

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
      stdin.pause();
      stdin.unref();
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

  switch (providerName) {
    case 'azure-anthropic':
      return 'claude-opus-4-6';
    case 'azure-foundry':
      return 'gpt-4.1';
    default:
      return 'gpt-4o';
  }
}
