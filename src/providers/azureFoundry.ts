import type {
  Provider,
  ChatMessage,
  ChatCompletionOptions,
  ChatCompletionResult,
  StreamChunk,
  ModelInfo,
  ToolDefinition,
} from './provider.js';
import type { AzureFoundryConfig } from '../config/schema.js';
import { ProviderError } from '../util/errors.js';
import { getLogger } from '../util/logger.js';

// ── Helpers ───────────────────────────────────────────────────

interface AzureRequestMessage {
  role: string;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
}

function toWireMessages(messages: ChatMessage[]): AzureRequestMessage[] {
  return messages.map((m) => {
    const wire: AzureRequestMessage = {
      role: m.role,
      content: m.content,
    };
    if (m.name) wire.name = m.name;
    if (m.toolCallId) wire.tool_call_id = m.toolCallId;
    if (m.toolCalls && m.toolCalls.length > 0) {
      wire.tool_calls = m.toolCalls.map((tc) => ({
        id: tc.id,
        type: tc.type,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));
    }
    return wire;
  });
}

function toWireTools(tools?: ToolDefinition[]) {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: t.type,
    function: {
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    },
  }));
}

// ── Azure AI Foundry Provider ─────────────────────────────────

export class AzureFoundryProvider implements Provider {
  readonly name = 'azure-foundry';
  readonly supportsTools = true;

  private readonly endpoint: string;
  private readonly apiKey: string | undefined;
  private readonly chatPath: string;
  private readonly apiVersion: string;
  private readonly models: ModelInfo[];
  private readonly log = getLogger();

  constructor(config: AzureFoundryConfig) {
    this.endpoint = config.endpoint.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.chatPath = config.chatCompletionPath;
    this.apiVersion = config.apiVersion;
    this.models = config.models.map((m) => ({ id: m.id, description: m.description }));

    if (config.authMode === 'apiKey' && !this.apiKey) {
      this.log.warn(
        'Azure Foundry configured with authMode=apiKey but no apiKey provided. ' +
          'Set CARETFORGE_AZURE_API_KEY or add apiKey to config.',
      );
    }
  }

  // ── listModels ────────────────────────────────────────────

  async listModels(): Promise<ModelInfo[]> {
    return this.models;
  }

  // ── Non-streaming completion ──────────────────────────────

  async createChatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    const body = this.buildRequestBody(messages, options, false);
    const response = await this.doFetch(body, options.model);

    if (!response.ok) {
      const text = await response.text();
      throw new ProviderError(`Azure API returned ${response.status}: ${text}`, response.status);
    }

    const json = (await response.json()) as Record<string, unknown>;
    return this.parseCompletionResponse(json);
  }

  // ── Streaming completion ──────────────────────────────────

  async *createStreamingChatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
  ): AsyncIterable<StreamChunk> {
    const body = this.buildRequestBody(messages, options, true);
    const response = await this.doFetch(body, options.model);

    if (!response.ok) {
      const text = await response.text();
      throw new ProviderError(`Azure API returned ${response.status}: ${text}`, response.status);
    }

    if (!response.body) {
      throw new ProviderError('No response body received for streaming request');
    }

    yield* this.parseSSEStream(response.body);
  }

  // ── Internal helpers ──────────────────────────────────────

  private buildRequestBody(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
    stream: boolean,
  ): string {
    const body: Record<string, unknown> = {
      messages: toWireMessages(messages),
      stream,
    };

    if (options.temperature !== undefined) body['temperature'] = options.temperature;
    if (options.maxTokens !== undefined) body['max_tokens'] = options.maxTokens;

    const wireTools = toWireTools(options.tools);
    if (wireTools) body['tools'] = wireTools;

    return JSON.stringify(body);
  }

  private async doFetch(body: string, model: string): Promise<Response> {
    // Build URL: {endpoint}/openai/deployments/{model}{chatPath}?api-version={ver}
    // This format works for Azure OpenAI. If your endpoint already includes the
    // full path, set chatCompletionPath to the complete suffix you need.
    const url = `${this.endpoint}/openai/deployments/${encodeURIComponent(model)}${this.chatPath}?api-version=${this.apiVersion}`;

    this.log.debug({ url }, 'Azure Foundry request');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['api-key'] = this.apiKey;
    }

    try {
      return await fetch(url, {
        method: 'POST',
        headers,
        body,
      });
    } catch (err) {
      throw new ProviderError(
        `Network error calling Azure endpoint: ${(err as Error).message}`,
        undefined,
        err as Error,
      );
    }
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */

  private parseCompletionResponse(json: Record<string, any>): ChatCompletionResult {
    const choice = json['choices']?.[0];
    if (!choice) {
      throw new ProviderError('Azure API returned no choices');
    }

    const msg = choice['message'] ?? {};
    const toolCalls = msg['tool_calls']?.map((tc: any) => ({
      id: tc['id'],
      type: 'function' as const,
      function: {
        name: tc['function']['name'],
        arguments: tc['function']['arguments'],
      },
    }));

    return {
      message: {
        role: msg['role'] ?? 'assistant',
        content: msg['content'] ?? null,
        ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
      },
      usage: json['usage']
        ? {
            promptTokens: json['usage']['prompt_tokens'] ?? 0,
            completionTokens: json['usage']['completion_tokens'] ?? 0,
            totalTokens: json['usage']['total_tokens'] ?? 0,
          }
        : undefined,
      finishReason: choice['finish_reason'] ?? 'stop',
    };
  }

  private async *parseSSEStream(body: ReadableStream<Uint8Array>): AsyncIterable<StreamChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue; // skip comments / empty

          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data) as Record<string, any>;
              const choice = parsed['choices']?.[0];
              if (!choice) continue;

              const delta = choice['delta'] ?? {};
              const toolCalls = delta['tool_calls']?.map((tc: any) => ({
                ...(tc['id'] ? { id: tc['id'] } : {}),
                ...(tc['type'] ? { type: tc['type'] } : {}),
                ...(tc['function']
                  ? {
                      function: {
                        ...(tc['function']['name'] ? { name: tc['function']['name'] } : {}),
                        ...(tc['function']['arguments']
                          ? { arguments: tc['function']['arguments'] }
                          : {}),
                      },
                    }
                  : {}),
              }));

              yield {
                delta: {
                  content: delta['content'] ?? undefined,
                  role: delta['role'] ?? undefined,
                  ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
                },
                finishReason: choice['finish_reason'] ?? null,
              };
            } catch {
              this.log.warn({ data }, 'Failed to parse SSE data chunk');
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /* eslint-enable @typescript-eslint/no-explicit-any */
}
