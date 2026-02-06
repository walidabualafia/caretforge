// ── Message types ─────────────────────────────────────────────

export interface ToolCallFunction {
  name: string;
  arguments: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: ToolCallFunction;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

// ── Tool definitions ──────────────────────────────────────────

export interface ToolFunctionDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolDefinition {
  type: 'function';
  function: ToolFunctionDefinition;
}

// ── Completion options ────────────────────────────────────────

export interface ChatCompletionOptions {
  model: string;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
}

// ── Completion results ────────────────────────────────────────

export interface ChatCompletionResult {
  message: ChatMessage;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

export interface StreamChunk {
  delta: {
    content?: string;
    role?: string;
    toolCalls?: Partial<ToolCall>[];
  };
  finishReason?: string | null;
}

// ── Model info ────────────────────────────────────────────────

export interface ModelInfo {
  id: string;
  description?: string;
}

// ── Provider interface ────────────────────────────────────────

/**
 * Every model provider must implement this interface.
 *
 * To add a new provider:
 * 1. Create a file in src/providers/ that exports a class implementing Provider.
 * 2. Register it in the provider registry (src/providers/registry.ts or similar).
 */
export interface Provider {
  /** Human-readable provider name. */
  readonly name: string;

  /** Whether the provider supports tool / function calling. */
  readonly supportsTools: boolean;

  /** Return the list of models available through this provider. */
  listModels(): Promise<ModelInfo[]>;

  /**
   * Non-streaming completion: send messages, get a single result back.
   */
  createChatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
  ): Promise<ChatCompletionResult>;

  /**
   * Streaming completion: yields chunks as they arrive via SSE.
   */
  createStreamingChatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
  ): AsyncIterable<StreamChunk>;
}
