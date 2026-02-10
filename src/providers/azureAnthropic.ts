import type {
  Provider,
  ChatMessage,
  ChatCompletionOptions,
  ChatCompletionResult,
  StreamChunk,
  ModelInfo,
  ToolCall,
} from './provider.js';
import { ProviderError } from '../util/errors.js';
import { getLogger } from '../util/logger.js';

// ── Config ────────────────────────────────────────────────────

export interface AzureAnthropicConfig {
  /** Base URL, e.g. https://RESOURCE.openai.azure.com/anthropic */
  endpoint: string;
  apiKey: string;
  /** Anthropic API version header. */
  apiVersion: string;
  models: Array<{ id: string; description?: string }>;
}

// ── Wire types ────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: string;
  [key: string]: unknown;
}

// ── Provider ──────────────────────────────────────────────────

export class AzureAnthropicProvider implements Provider {
  readonly name = 'azure-anthropic';
  readonly supportsTools = true;

  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly apiVersion: string;
  private readonly models: ModelInfo[];
  private readonly log = getLogger();

  constructor(config: AzureAnthropicConfig) {
    this.endpoint = config.endpoint.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.apiVersion = config.apiVersion;
    this.models = config.models.map((m) => ({ id: m.id, description: m.description }));
  }

  async listModels(): Promise<ModelInfo[]> {
    return this.models;
  }

  // ── Non-streaming ─────────────────────────────────────────

  async createChatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    const { systemPrompt, anthropicMessages } = this.convertMessages(messages);
    const body = this.buildBody(systemPrompt, anthropicMessages, options, false);

    const response = await this.doFetch(body, options.model);
    const json = (await response.json()) as Record<string, any>;

    return this.parseResponse(json);
  }

  // ── Streaming ─────────────────────────────────────────────

  async *createStreamingChatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
  ): AsyncIterable<StreamChunk> {
    const { systemPrompt, anthropicMessages } = this.convertMessages(messages);
    const body = this.buildBody(systemPrompt, anthropicMessages, options, true);

    const response = await this.doFetch(body, options.model);

    if (!response.body) {
      throw new ProviderError('No response body for streaming request');
    }

    yield* this.parseSSE(response.body);
  }

  // ── Message conversion ────────────────────────────────────

  private convertMessages(messages: ChatMessage[]): {
    systemPrompt: string | undefined;
    anthropicMessages: AnthropicMessage[];
  } {
    let systemPrompt: string | undefined;
    const anthropicMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        // Anthropic uses a top-level system field
        systemPrompt = (systemPrompt ? systemPrompt + '\n' : '') + (msg.content ?? '');
        continue;
      }

      if (msg.role === 'assistant') {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          // Assistant with tool calls → content blocks
          const blocks: AnthropicContentBlock[] = [];
          if (msg.content) {
            blocks.push({ type: 'text', text: msg.content });
          }
          for (const tc of msg.toolCalls) {
            let input: unknown = {};
            try {
              input = JSON.parse(tc.function.arguments);
            } catch {
              /* keep empty */
            }
            blocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input,
            });
          }
          anthropicMessages.push({ role: 'assistant', content: blocks });
        } else {
          anthropicMessages.push({ role: 'assistant', content: msg.content ?? '' });
        }
        continue;
      }

      if (msg.role === 'tool') {
        // Tool results → merge into a user message with tool_result blocks
        const last = anthropicMessages[anthropicMessages.length - 1];
        const block: AnthropicContentBlock = {
          type: 'tool_result',
          tool_use_id: msg.toolCallId,
          content: msg.content ?? '',
        };

        if (last && last.role === 'user' && Array.isArray(last.content)) {
          // Append to existing user message with tool_result blocks
          (last.content as AnthropicContentBlock[]).push(block);
        } else {
          anthropicMessages.push({ role: 'user', content: [block] });
        }
        continue;
      }

      // Regular user message
      anthropicMessages.push({ role: 'user', content: msg.content ?? '' });
    }

    return { systemPrompt, anthropicMessages };
  }

  // ── Request building ──────────────────────────────────────

  private buildBody(
    systemPrompt: string | undefined,
    messages: AnthropicMessage[],
    options: ChatCompletionOptions,
    stream: boolean,
  ): string {
    const body: Record<string, unknown> = {
      model: options.model,
      messages,
      max_tokens: options.maxTokens ?? 4096,
      stream,
    };

    if (systemPrompt) {
      body['system'] = systemPrompt;
    }
    if (options.temperature !== undefined) {
      body['temperature'] = options.temperature;
    }

    // Convert OpenAI-style tool defs to Anthropic format
    if (options.tools && options.tools.length > 0) {
      body['tools'] = options.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }

    return JSON.stringify(body);
  }

  // ── HTTP ──────────────────────────────────────────────────

  private async doFetch(body: string, model: string): Promise<Response> {
    const url = `${this.endpoint}/v1/messages`;
    this.log.debug({ url, model }, 'Azure Anthropic request');

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': this.apiVersion,
        },
        body,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new ProviderError(
          `Azure Anthropic API returned ${response.status}: ${text}`,
          response.status,
        );
      }

      return response;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        `Network error calling Azure Anthropic: ${(err as Error).message}`,
        undefined,
        err as Error,
      );
    }
  }

  // ── Response parsing ──────────────────────────────────────

  private parseResponse(json: Record<string, any>): ChatCompletionResult {
    const contentBlocks: any[] = json['content'] ?? [];
    let textContent = '';
    const toolCalls: ToolCall[] = [];

    for (const block of contentBlocks) {
      if (block['type'] === 'text') {
        textContent += block['text'] ?? '';
      } else if (block['type'] === 'tool_use') {
        toolCalls.push({
          id: block['id'],
          type: 'function',
          function: {
            name: block['name'],
            arguments: JSON.stringify(block['input'] ?? {}),
          },
        });
      }
    }

    const stopReason = json['stop_reason'] ?? 'end_turn';

    return {
      message: {
        role: 'assistant',
        content: textContent || null,
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
      },
      usage: json['usage']
        ? {
            promptTokens: json['usage']['input_tokens'] ?? 0,
            completionTokens: json['usage']['output_tokens'] ?? 0,
            totalTokens:
              (json['usage']['input_tokens'] ?? 0) + (json['usage']['output_tokens'] ?? 0),
          }
        : undefined,
      finishReason: stopReason === 'tool_use' ? 'tool_calls' : 'stop',
    };
  }

  // ── SSE parsing ───────────────────────────────────────────

  private async *parseSSE(body: ReadableStream<Uint8Array>): AsyncIterable<StreamChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Accumulate tool use blocks during streaming
    const toolUseBlocks = new Map<number, { id: string; name: string; jsonBuf: string }>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data) as Record<string, any>;
            const type = parsed['type'] as string;

            if (type === 'content_block_start') {
              const block = parsed['content_block'];
              if (block?.['type'] === 'tool_use') {
                toolUseBlocks.set(parsed['index'] as number, {
                  id: block['id'],
                  name: block['name'],
                  jsonBuf: '',
                });
              }
            }

            if (type === 'content_block_delta') {
              const delta = parsed['delta'];
              if (delta?.['type'] === 'text_delta') {
                yield { delta: { content: delta['text'] ?? '' }, finishReason: null };
              } else if (delta?.['type'] === 'input_json_delta') {
                const idx = parsed['index'] as number;
                const block = toolUseBlocks.get(idx);
                if (block) {
                  block.jsonBuf += delta['partial_json'] ?? '';
                }
              }
            }

            if (type === 'message_delta') {
              const stopReason = parsed['delta']?.['stop_reason'];

              // If we have accumulated tool calls, emit them
              if (stopReason === 'tool_use' && toolUseBlocks.size > 0) {
                const toolCalls: Partial<ToolCall>[] = [];
                for (const [, block] of toolUseBlocks) {
                  toolCalls.push({
                    id: block.id,
                    type: 'function',
                    function: { name: block.name, arguments: block.jsonBuf },
                  });
                }
                yield {
                  delta: { toolCalls },
                  finishReason: 'tool_calls',
                };
              } else {
                yield { delta: {}, finishReason: 'stop' };
              }
            }
          } catch {
            this.log.warn({ data }, 'Failed to parse Anthropic SSE chunk');
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /* eslint-enable @typescript-eslint/no-explicit-any */
}
