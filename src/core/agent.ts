import type {
  Provider,
  ChatMessage,
  ChatCompletionOptions,
  ToolCall,
} from '../providers/provider.js';
import { systemMessage, assistantMessage, toolResultMessage } from './messages.js';
import { SYSTEM_PROMPT } from './prompts.js';
import { executeTool, getAllTools } from '../tools/index.js';
import { getLogger } from '../util/logger.js';
import { ToolError } from '../util/errors.js';

// ── Types ─────────────────────────────────────────────────────

export interface AgentOptions {
  provider: Provider;
  model: string;
  stream: boolean;

  /** Called for each text token during streaming. */
  onToken?: (token: string) => void;

  /** Called when the agent begins a tool call (before permission check). */
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;

  /** Called after a tool executes with its result string. */
  onToolResult?: (toolName: string, result: string) => void;

  /**
   * Called before executing a tool that needs permission (write_file, exec_shell).
   * Return `true` to allow, `false` to deny.
   * If not provided, dangerous tools are denied by default.
   */
  onPermissionRequest?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;

  /** Max agent loop iterations to prevent runaway tool calls. */
  maxIterations?: number;
}

export interface AgentResult {
  messages: ChatMessage[];
  finalContent: string;
  toolCallCount: number;
  durationMs: number;
}

const DEFAULT_MAX_ITERATIONS = 20;

// Tools that require explicit permission
const DANGEROUS_TOOLS = new Set(['write_file', 'edit_file', 'exec_shell']);

// ── Agent loop ────────────────────────────────────────────────

/**
 * Run the agent loop: send messages to the provider, execute any tool calls,
 * feed results back, and repeat until the model produces a final text response.
 */
export async function runAgent(
  history: ChatMessage[],
  options: AgentOptions,
): Promise<AgentResult> {
  const log = getLogger();
  const startTime = Date.now();
  const maxIter = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  // Always send all tools — permission is checked at execution time
  const tools = options.provider.supportsTools ? getAllTools() : [];

  // Ensure system prompt is first
  const messages: ChatMessage[] = [systemMessage(SYSTEM_PROMPT), ...history];

  let toolCallCount = 0;

  for (let iteration = 0; iteration < maxIter; iteration++) {
    log.debug({ iteration, messageCount: messages.length }, 'Agent loop iteration');

    const completionOptions: ChatCompletionOptions = {
      model: options.model,
      stream: options.stream,
      tools: tools.length > 0 ? tools : undefined,
    };

    let responseMessage: ChatMessage;

    if (options.stream) {
      responseMessage = await handleStreaming(messages, completionOptions, options);
    } else {
      const result = await options.provider.createChatCompletion(messages, completionOptions);
      responseMessage = result.message;
    }

    messages.push(responseMessage);

    // If no tool calls, we're done
    if (!responseMessage.toolCalls || responseMessage.toolCalls.length === 0) {
      return {
        messages,
        finalContent: responseMessage.content ?? '',
        toolCallCount,
        durationMs: Date.now() - startTime,
      };
    }

    // Execute each tool call
    for (const tc of responseMessage.toolCalls) {
      toolCallCount++;

      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        args = {};
      }

      // Notify about tool call
      options.onToolCall?.(tc.function.name, args);
      log.debug({ tool: tc.function.name, id: tc.id }, 'Tool call requested');

      // Permission check for dangerous tools
      if (DANGEROUS_TOOLS.has(tc.function.name)) {
        const allowed = options.onPermissionRequest
          ? await options.onPermissionRequest(tc.function.name, args)
          : false;

        if (!allowed) {
          const deniedMsg = `Permission denied by user. The user did not allow ${tc.function.name}.`;
          messages.push(toolResultMessage(tc.id, deniedMsg));
          options.onToolResult?.(tc.function.name, deniedMsg);
          continue;
        }
      }

      // Execute the tool
      let result: string;
      try {
        result = await executeTool(tc);
      } catch (err) {
        result =
          err instanceof ToolError ? `Error: ${err.message}` : `Error: ${(err as Error).message}`;
      }

      messages.push(toolResultMessage(tc.id, result));
      options.onToolResult?.(tc.function.name, result);
    }
  }

  // If we ran out of iterations
  log.warn('Agent loop hit max iterations');
  return {
    messages,
    finalContent: '[Agent reached maximum iteration limit]',
    toolCallCount,
    durationMs: Date.now() - startTime,
  };
}

// ── Streaming handler ─────────────────────────────────────────

async function handleStreaming(
  messages: ChatMessage[],
  options: ChatCompletionOptions,
  agentOpts: AgentOptions,
): Promise<ChatMessage> {
  let content = '';
  const toolCallsMap = new Map<
    number,
    { id: string; type: 'function'; function: { name: string; arguments: string } }
  >();

  const stream = agentOpts.provider.createStreamingChatCompletion(messages, options);

  for await (const chunk of stream) {
    if (chunk.delta.content) {
      content += chunk.delta.content;
      agentOpts.onToken?.(chunk.delta.content);
    }

    // Accumulate tool call deltas
    if (chunk.delta.toolCalls) {
      for (const tc of chunk.delta.toolCalls) {
        const idx = toolCallsMap.size; // simplified: assume sequential
        const existing = toolCallsMap.get(idx);
        if (!existing && tc.id) {
          toolCallsMap.set(idx, {
            id: tc.id,
            type: 'function',
            function: {
              name: tc.function?.name ?? '',
              arguments: tc.function?.arguments ?? '',
            },
          });
        } else if (existing) {
          if (tc.function?.arguments) {
            existing.function.arguments += tc.function.arguments;
          }
          if (tc.function?.name) {
            existing.function.name += tc.function.name;
          }
        }
      }
    }
  }

  const toolCalls: ToolCall[] = Array.from(toolCallsMap.values());

  return assistantMessage(
    content || (null as unknown as string),
    toolCalls.length > 0 ? toolCalls : undefined,
  );
}
