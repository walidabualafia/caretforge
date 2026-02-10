# Adding a New Provider

CaretForge is designed to support multiple model providers. This guide walks you through adding one.

## Overview

Every provider implements the `Provider` interface defined in `src/providers/provider.ts`. The interface requires:

```typescript
interface Provider {
  readonly name: string;
  readonly supportsTools: boolean;

  listModels(): Promise<ModelInfo[]>;

  createChatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
  ): Promise<ChatCompletionResult>;

  createStreamingChatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
  ): AsyncIterable<StreamChunk>;
}
```

## Step-by-Step

### 1. Create the Provider File

Create `src/providers/myProvider.ts`:

```typescript
import type {
  Provider,
  ChatMessage,
  ChatCompletionOptions,
  ChatCompletionResult,
  StreamChunk,
  ModelInfo,
} from './provider.js';

export interface MyProviderConfig {
  apiKey: string;
  baseUrl: string;
}

export class MyProvider implements Provider {
  readonly name = 'my-provider';
  readonly supportsTools = true;

  constructor(private config: MyProviderConfig) {}

  async listModels(): Promise<ModelInfo[]> {
    // Return available models
    return [{ id: 'my-model', description: 'My Model' }];
  }

  async createChatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    // Make API call, return result
  }

  async *createStreamingChatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions,
  ): AsyncIterable<StreamChunk> {
    // Make streaming API call, yield chunks
  }
}
```

### 2. Add the Config Schema

In `src/config/schema.ts`, add a Zod schema:

```typescript
export const myProviderConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().url(),
});
```

Add it to the `providersSchema`:

```typescript
export const providersSchema = z.object({
  azureFoundry: azureFoundryConfigSchema.optional(),
  azureAgents: azureAgentsConfigSchema.optional(),
  myProvider: myProviderConfigSchema.optional(), // Add this
});
```

### 3. Register the Provider

In `src/cli/shared.ts`, add a case to the `resolveProvider` switch:

```typescript
case 'my-provider': {
  const config = appConfig.providers.myProvider;
  if (!config) {
    throw new ConfigError('My Provider is not configured.');
  }
  return new MyProvider(config);
}
```

### 4. Add Environment Variable Support (Optional)

In `src/config/index.ts`, add env var mappings in `getEnvOverrides()`:

```typescript
const myApiKey = process.env['CARETFORGE_MY_API_KEY'];
if (myApiKey) {
  overrides['providers'] = {
    ...overrides['providers'],
    myProvider: { apiKey: myApiKey },
  };
}
```

### 5. Test It

```bash
caretforge run "Hello" --provider my-provider --model my-model
```

## Key Types

### `ChatMessage`

```typescript
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}
```

### `StreamChunk`

```typescript
interface StreamChunk {
  delta: {
    content?: string;
    role?: string;
    toolCalls?: Partial<ToolCall>[];
  };
  finishReason?: string | null;
}
```

### `ChatCompletionResult`

```typescript
interface ChatCompletionResult {
  message: ChatMessage;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}
```

## Tips

- If your provider doesn't support tool/function calling, set `supportsTools = false`
- For streaming, parse SSE or chunked responses and `yield` a `StreamChunk` for each token
- Use the `ProviderError` class from `src/util/errors.js` for consistent error handling
- Look at `azureFoundry.ts` as a reference implementation
