import { spawn } from 'node:child_process';
import type {
  Provider,
  ChatMessage,
  ChatCompletionOptions,
  ChatCompletionResult,
  StreamChunk,
  ModelInfo,
} from './provider.js';
import { ProviderError } from '../util/errors.js';
import { getLogger } from '../util/logger.js';

// ── Config type ───────────────────────────────────────────────

export interface AzureAgentsConfig {
  /** AI Foundry project endpoint, e.g. https://RESOURCE.services.ai.azure.com/api/projects/PROJECT */
  endpoint: string;
  /** The agent (assistant) ID to invoke. */
  agentId: string;
  /** Optional API key; if omitted, Azure CLI auth is used. */
  apiKey?: string;
  /** API version query parameter. */
  apiVersion: string;
}

// ── Provider ──────────────────────────────────────────────────

export class AzureAgentsProvider implements Provider {
  readonly name = 'azure-agents';
  /** Server-side agent handles its own tools; our client loop won't inject tool schemas. */
  readonly supportsTools = false;

  private readonly endpoint: string;
  private readonly agentId: string;
  private readonly apiKey?: string;
  private readonly apiVersion: string;
  private readonly log = getLogger();

  private cachedToken?: { value: string; expiresAt: number };

  constructor(config: AzureAgentsConfig) {
    this.endpoint = config.endpoint.replace(/\/+$/, '');
    this.agentId = config.agentId;
    this.apiKey = config.apiKey;
    this.apiVersion = config.apiVersion;
  }

  // ── listModels ────────────────────────────────────────────

  async listModels(): Promise<ModelInfo[]> {
    return [{ id: this.agentId, description: 'Azure AI Foundry Agent' }];
  }

  // ── Non-streaming completion ──────────────────────────────

  async createChatCompletion(
    messages: ChatMessage[],
    _options: ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    const headers = await this.getHeaders();

    // Only send user/assistant messages (agent has its own system prompt)
    const threadMessages = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content ?? '' }));

    // Create thread + run in one call
    const url = `${this.endpoint}/threads/runs?api-version=${this.apiVersion}`;
    const body = {
      assistant_id: this.agentId,
      thread: { messages: threadMessages },
    };

    this.log.debug({ url, agentId: this.agentId }, 'Creating thread and run');

    const response = await this.doFetch(url, 'POST', headers, body);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const run = (await response.json()) as any;

    const threadId: string = run['thread_id'];
    const runId: string = run['id'];

    if (!threadId || !runId) {
      throw new ProviderError(
        `Unexpected response from threads/runs: ${JSON.stringify(run).slice(0, 500)}`,
      );
    }

    // Poll until terminal state
    const completedRun = await this.pollRun(threadId, runId, headers);

    if (completedRun['status'] !== 'completed') {
      const errMsg = completedRun['last_error']?.['message'] ?? completedRun['status'];
      throw new ProviderError(`Agent run ended with status "${completedRun['status']}": ${errMsg}`);
    }

    // Retrieve the latest assistant message
    const content = await this.getLatestAssistantMessage(threadId, headers);

    return {
      message: { role: 'assistant', content },
      finishReason: 'stop',
    };
  }

  // ── Streaming completion ──────────────────────────────────

  async *createStreamingChatCompletion(
    messages: ChatMessage[],
    _options: ChatCompletionOptions,
  ): AsyncIterable<StreamChunk> {
    const headers = await this.getHeaders();

    const threadMessages = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content ?? '' }));

    const url = `${this.endpoint}/threads/runs?api-version=${this.apiVersion}`;
    const body = {
      assistant_id: this.agentId,
      thread: { messages: threadMessages },
      stream: true,
    };

    this.log.debug({ url, agentId: this.agentId }, 'Creating streaming thread and run');

    const response = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ProviderError(
        `Azure Agents API returned ${response.status}: ${text}`,
        response.status,
      );
    }

    if (!response.body) {
      throw new ProviderError('No response body for streaming request');
    }

    yield* this.parseAgentSSE(response.body);
  }

  // ── Auth ──────────────────────────────────────────────────

  private async getHeaders(): Promise<Record<string, string>> {
    if (this.apiKey) {
      return { 'api-key': this.apiKey };
    }
    const token = await this.getAzureCliToken();
    return { Authorization: `Bearer ${token}` };
  }

  private async getAzureCliToken(): Promise<string> {
    // Return cached token if still valid (with 60s safety margin)
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - 60_000) {
      return this.cachedToken.value;
    }

    this.log.debug('Acquiring Azure CLI token for ai.azure.com');

    return new Promise<string>((resolve, reject) => {
      const child = spawn(
        'az',
        [
          'account',
          'get-access-token',
          '--resource',
          'https://ai.azure.com',
          '--query',
          'accessToken',
          '-o',
          'tsv',
        ],
        { shell: true, stdio: ['ignore', 'pipe', 'pipe'] },
      );

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d: Buffer) => {
        stdout += d.toString();
      });
      child.stderr.on('data', (d: Buffer) => {
        stderr += d.toString();
      });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(
            new ProviderError(
              `Failed to get Azure CLI token (exit ${code}). Are you logged in? Run "az login".\n${stderr.trim()}`,
            ),
          );
          return;
        }
        const token = stdout.trim();
        // Cache for 1 hour (tokens typically last ~1h)
        this.cachedToken = { value: token, expiresAt: Date.now() + 3_600_000 };
        resolve(token);
      });
    });
  }

  // ── HTTP helpers ──────────────────────────────────────────

  private async doFetch(
    url: string,
    method: string,
    authHeaders: Record<string, string>,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      ...authHeaders,
      'Content-Type': 'application/json',
    };

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new ProviderError(
          `Azure Agents API returned ${response.status}: ${text}`,
          response.status,
        );
      }

      return response;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        `Network error calling Azure Agents: ${(err as Error).message}`,
        undefined,
        err as Error,
      );
    }
  }

  // ── Run polling ───────────────────────────────────────────

  private async pollRun(
    threadId: string,
    runId: string,
    headers: Record<string, string>,
  ): Promise<Record<string, any>> {
    const maxWaitMs = 120_000;
    const start = Date.now();
    let interval = 500;

    while (Date.now() - start < maxWaitMs) {
      const url = `${this.endpoint}/threads/${threadId}/runs/${runId}?api-version=${this.apiVersion}`;
      const response = await this.doFetch(url, 'GET', headers);
      const run = (await response.json()) as Record<string, any>;

      this.log.debug({ status: run['status'], runId }, 'Polling run');

      const status = run['status'] as string;

      if (['completed', 'failed', 'cancelled', 'expired', 'incomplete'].includes(status)) {
        return run;
      }

      if (status === 'requires_action') {
        throw new ProviderError(
          'Agent requires client-side function calling (requires_action), ' +
            'which is not yet supported. Configure tools server-side in Azure AI Foundry.',
        );
      }

      await new Promise((r) => setTimeout(r, interval));
      interval = Math.min(interval * 1.5, 5_000);
    }

    throw new ProviderError('Run polling timed out after 2 minutes');
  }

  // ── Message retrieval ─────────────────────────────────────

  private async getLatestAssistantMessage(
    threadId: string,
    headers: Record<string, string>,
  ): Promise<string> {
    const url = `${this.endpoint}/threads/${threadId}/messages?api-version=${this.apiVersion}&order=desc&limit=10`;
    const response = await this.doFetch(url, 'GET', headers);
    const data = (await response.json()) as any;

    const assistantMsg = data['data']?.find((m: any) => m['role'] === 'assistant');

    if (!assistantMsg) {
      throw new ProviderError('No assistant message found in thread after run completed');
    }

    return (
      assistantMsg['content']
        ?.filter((c: any) => c['type'] === 'text')
        ?.map((c: any) => c['text']?.['value'] ?? '')
        ?.join('') ?? ''
    );
  }

  // ── SSE parsing ───────────────────────────────────────────

  private async *parseAgentSSE(body: ReadableStream<Uint8Array>): AsyncIterable<StreamChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();

          if (trimmed.startsWith('event: ')) {
            currentEvent = trimmed.slice(7);
            continue;
          }

          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') return;

            if (currentEvent === 'thread.message.delta') {
              try {
                const parsed = JSON.parse(data) as any;
                const textDeltas: string[] =
                  parsed['delta']?.['content']
                    ?.filter((c: any) => c['type'] === 'text')
                    ?.map((c: any) => c['text']?.['value'] ?? '') ?? [];

                for (const text of textDeltas) {
                  if (text) {
                    yield { delta: { content: text }, finishReason: null };
                  }
                }
              } catch {
                this.log.warn({ data }, 'Failed to parse SSE data chunk');
              }
            }

            if (currentEvent === 'thread.run.completed') {
              yield { delta: {}, finishReason: 'stop' };
            }

            if (currentEvent === 'thread.run.failed') {
              try {
                const parsed = JSON.parse(data) as any;
                const errMsg = parsed['last_error']?.['message'] ?? 'Unknown error';
                throw new ProviderError(`Agent run failed: ${errMsg}`);
              } catch (e) {
                if (e instanceof ProviderError) throw e;
                throw new ProviderError('Agent run failed');
              }
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
