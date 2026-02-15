/**
 * Azure OpenAI Responses API provider.
 *
 * Supports models that use the Responses API instead of Chat Completions
 * (e.g. gpt-5.2-codex, gpt-5.1-codex, codex-mini).
 *
 * Endpoint: POST https://<resource>.openai.azure.com/openai/v1/responses
 * Docs: https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/responses
 */
import type {
  Provider,
  ChatMessage,
  ChatCompletionOptions,
  ChatCompletionResult,
  StreamChunk,
  ModelInfo,
  ToolDefinition,
} from './provider.js';
import type { AzureResponsesConfig } from '../config/schema.js';
import { ProviderError } from '../util/errors.js';
import { getLogger } from '../util/logger.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Input conversion ─────────────────────────────────────────

interface ResponsesInputMessage {
  role: string;
  content: string | ResponsesContentPart[];
  type?: string;
}

interface ResponsesContentPart {
  type: string;
  text?: string;
}

interface FunctionCallOutputItem {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

type ResponsesInput = string | (ResponsesInputMessage | FunctionCallOutputItem)[];

/**
 * Convert CaretForge ChatMessage[] to Responses API input format.
 *
 * The Responses API uses:
 *  - `{role, content}` for user/system/assistant messages
 *  - `{type: "function_call_output", call_id, output}` for tool results
 *  - Instructions field for system prompts (preferred)
 */
function toResponsesInput(messages: ChatMessage[]): {
  instructions: string | undefined;
  input: ResponsesInput;
} {
  let instructions: string | undefined;
  const input: (ResponsesInputMessage | FunctionCallOutputItem)[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Responses API uses 'instructions' for system prompt
      instructions = msg.content ?? undefined;
      continue;
    }

    if (msg.role === 'tool') {
      // Tool result → function_call_output
      input.push({
        type: 'function_call_output',
        call_id: msg.toolCallId ?? '',
        output: msg.content ?? '',
      });
      continue;
    }

    if (msg.role === 'assistant') {
      // If the assistant message has tool calls, represent them as function_call items
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          input.push({
            type: 'function_call',
            role: 'assistant',
            content: JSON.stringify({
              id: tc.id,
              call_id: tc.id,
              name: tc.function.name,
              arguments: tc.function.arguments,
            }),
          });
        }
        // If there's also text content, add that too
        if (msg.content) {
          input.push({ role: 'assistant', content: msg.content });
        }
        continue;
      }
      input.push({ role: 'assistant', content: msg.content ?? '' });
      continue;
    }

    // User message
    input.push({ role: 'user', content: msg.content ?? '' });
  }

  return { instructions, input };
}

/**
 * Convert Responses API tools format to the expected structure.
 * The Responses API uses {type, name, description, parameters} at top level
 * (not nested under `function`).
 */
function toResponsesTools(tools?: ToolDefinition[]) {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: 'function' as const,
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters,
  }));
}

// ── Provider ─────────────────────────────────────────────────

export class AzureResponsesProvider implements Provider {
  readonly name = 'azure-responses';
  readonly supportsTools = true;

  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly models: ModelInfo[];
  private readonly log = getLogger();

  constructor(config: AzureResponsesConfig) {
    this.endpoint = config.endpoint.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.models = config.models.map((m) => ({ id: m.id, description: m.description }));
  }

  async listModels(): Promise<ModelInfo[]> {
    return this.models;
  }

  // ── Non-streaming completion ──────────────────────────────

  async createChatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    const body = this.buildRequestBody(messages, options, false);
    const response = await this.doFetch(body);

    if (!response.ok) {
      const text = await response.text();
      throw new ProviderError(
        `Azure Responses API returned ${response.status}: ${text}`,
        response.status,
      );
    }

    const json = (await response.json()) as Record<string, any>;
    return this.parseResponse(json);
  }

  // ── Streaming completion ──────────────────────────────────

  async *createStreamingChatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
  ): AsyncIterable<StreamChunk> {
    const body = this.buildRequestBody(messages, options, true);
    const response = await this.doFetch(body);

    if (!response.ok) {
      const text = await response.text();
      throw new ProviderError(
        `Azure Responses API returned ${response.status}: ${text}`,
        response.status,
      );
    }

    if (!response.body) {
      throw new ProviderError('No response body received for streaming request');
    }

    yield* this.parseEventStream(response.body);
  }

  // ── Internal helpers ──────────────────────────────────────

  private buildRequestBody(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
    stream: boolean,
  ): string {
    const { instructions, input } = toResponsesInput(messages);

    const body: Record<string, unknown> = {
      model: options.model,
      input,
      stream,
    };

    if (instructions) body['instructions'] = instructions;
    if (options.temperature !== undefined) body['temperature'] = options.temperature;
    if (options.maxTokens !== undefined) body['max_output_tokens'] = options.maxTokens;

    const tools = toResponsesTools(options.tools);
    if (tools) body['tools'] = tools;

    return JSON.stringify(body);
  }

  private async doFetch(body: string): Promise<Response> {
    const url = `${this.endpoint}/openai/v1/responses`;

    this.log.debug({ url }, 'Azure Responses API request');

    try {
      return await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey,
        },
        body,
      });
    } catch (err) {
      throw new ProviderError(
        `Network error calling Azure Responses API: ${(err as Error).message}`,
        undefined,
        err as Error,
      );
    }
  }

  /**
   * Parse a non-streaming Responses API response.
   *
   * The output array contains items of type:
   *  - "message" → text content in content[].text
   *  - "function_call" → tool call with name, arguments, call_id
   *  - "reasoning" → chain-of-thought (ignored for now)
   */
  private parseResponse(json: Record<string, any>): ChatCompletionResult {
    const output: any[] = json['output'] ?? [];
    let textContent = '';
    const toolCalls: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }> = [];

    for (const item of output) {
      switch (item['type']) {
        case 'message': {
          const contentParts: any[] = item['content'] ?? [];
          for (const part of contentParts) {
            if (part['type'] === 'output_text' && part['text']) {
              textContent += part['text'];
            }
          }
          break;
        }
        case 'function_call': {
          toolCalls.push({
            id: item['call_id'] ?? item['id'] ?? '',
            type: 'function' as const,
            function: {
              name: item['name'] ?? '',
              arguments: item['arguments'] ?? '{}',
            },
          });
          break;
        }
        // 'reasoning' items are ignored for now
      }
    }

    const usage = json['usage'];

    return {
      message: {
        role: 'assistant',
        content: textContent || null,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      },
      usage: usage
        ? {
            promptTokens: usage['input_tokens'] ?? 0,
            completionTokens: usage['output_tokens'] ?? 0,
            totalTokens: usage['total_tokens'] ?? 0,
          }
        : undefined,
      finishReason: json['status'] === 'completed' ? 'stop' : (json['status'] ?? 'stop'),
    };
  }

  /**
   * Parse the Responses API streaming event stream.
   *
   * Key event types:
   *  - response.output_text.delta → text token
   *  - response.function_call_arguments.delta → tool call argument chunk
   *  - response.output_item.added (type=function_call) → new tool call start
   *  - response.completed → done
   */
  private async *parseEventStream(body: ReadableStream<Uint8Array>): AsyncIterable<StreamChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Track function calls being built during streaming
    const pendingCalls = new Map<string, { id: string; name: string; arguments: string }>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let currentEvent = '';

        for (const line of lines) {
          const trimmed = line.trim();

          // Parse SSE event type
          if (trimmed.startsWith('event: ')) {
            currentEvent = trimmed.slice(7);
            continue;
          }

          if (!trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (!data || data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data) as Record<string, any>;

            switch (currentEvent) {
              case 'response.output_text.delta': {
                const delta = parsed['delta'];
                if (delta) {
                  yield { delta: { content: delta }, finishReason: null };
                }
                break;
              }

              case 'response.output_item.added': {
                const item = parsed['item'];
                if (item?.['type'] === 'function_call') {
                  // The item has call_id for the OpenAI tool call ID and id for the event item ID
                  const itemId = item['id'] ?? '';
                  const callId = item['call_id'] ?? itemId;
                  pendingCalls.set(itemId, {
                    id: callId,
                    name: item['name'] ?? '',
                    arguments: '',
                  });
                }
                break;
              }

              case 'response.function_call_arguments.delta': {
                // The delta events use item_id to reference the function_call item
                const itemId = parsed['item_id'] ?? '';
                const delta = parsed['delta'] ?? '';
                const pending = pendingCalls.get(itemId);
                if (pending) {
                  pending.arguments += delta;
                }
                break;
              }

              case 'response.function_call_arguments.done': {
                const itemId = parsed['item_id'] ?? '';
                const pending = pendingCalls.get(itemId);
                if (pending) {
                  // Use the final arguments from the done event if available
                  const finalArgs = parsed['arguments'] ?? pending.arguments;
                  yield {
                    delta: {
                      toolCalls: [
                        {
                          id: pending.id,
                          type: 'function' as const,
                          function: {
                            name: pending.name,
                            arguments: finalArgs,
                          },
                        },
                      ],
                    },
                    finishReason: null,
                  };
                  pendingCalls.delete(itemId);
                }
                break;
              }

              case 'response.completed': {
                yield { delta: {}, finishReason: 'stop' };
                return;
              }
            }
          } catch {
            this.log.warn({ data }, 'Failed to parse Responses API SSE event');
          }

          currentEvent = '';
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */
