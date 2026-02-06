import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AzureFoundryProvider } from '../src/providers/azureFoundry.js';
import type { AzureFoundryConfig } from '../src/config/schema.js';

const mockConfig: AzureFoundryConfig = {
  endpoint: 'https://test-resource.openai.azure.com',
  apiKey: 'test-api-key',
  authMode: 'apiKey',
  models: [{ id: 'gpt-4o', description: 'Test GPT-4o' }, { id: 'gpt-35-turbo' }],
  chatCompletionPath: '/chat/completions',
  apiVersion: '2024-08-01-preview',
};

describe('AzureFoundryProvider', () => {
  let provider: AzureFoundryProvider;

  beforeEach(() => {
    provider = new AzureFoundryProvider(mockConfig);
  });

  it('has correct name and supports tools', () => {
    expect(provider.name).toBe('azure-foundry');
    expect(provider.supportsTools).toBe(true);
  });

  it('lists configured models', async () => {
    const models = await provider.listModels();
    expect(models).toHaveLength(2);
    expect(models[0]).toEqual({ id: 'gpt-4o', description: 'Test GPT-4o' });
    expect(models[1]).toEqual({ id: 'gpt-35-turbo', description: undefined });
  });

  it('calls the correct URL for non-streaming completion', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      }),
    };

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse as unknown as Response);

    const result = await provider.createChatCompletion([{ role: 'user', content: 'Hi' }], {
      model: 'gpt-4o',
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const callUrl = fetchSpy.mock.calls[0]?.[0] as string;
    expect(callUrl).toContain('test-resource.openai.azure.com');
    expect(callUrl).toContain('/openai/deployments/gpt-4o/chat/completions');
    expect(callUrl).toContain('api-version=2024-08-01-preview');

    const callOpts = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect((callOpts.headers as Record<string, string>)['api-key']).toBe('test-api-key');

    expect(result.message.role).toBe('assistant');
    expect(result.message.content).toBe('Hello!');
    expect(result.finishReason).toBe('stop');
    expect(result.usage?.totalTokens).toBe(15);

    fetchSpy.mockRestore();
  });

  it('throws ProviderError on non-ok response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as unknown as Response);

    await expect(
      provider.createChatCompletion([{ role: 'user', content: 'Hi' }], { model: 'gpt-4o' }),
    ).rejects.toThrow('Azure API returned 401');

    fetchSpy.mockRestore();
  });

  it('throws ProviderError on network error', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      provider.createChatCompletion([{ role: 'user', content: 'Hi' }], { model: 'gpt-4o' }),
    ).rejects.toThrow('Network error');

    fetchSpy.mockRestore();
  });

  it('parses tool calls from response', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: '{"path": "package.json"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
    };

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(mockResponse as unknown as Response);

    const result = await provider.createChatCompletion(
      [{ role: 'user', content: 'Read package.json' }],
      { model: 'gpt-4o' },
    );

    expect(result.message.toolCalls).toHaveLength(1);
    expect(result.message.toolCalls?.[0]?.function.name).toBe('read_file');
    expect(result.finishReason).toBe('tool_calls');

    fetchSpy.mockRestore();
  });
});
