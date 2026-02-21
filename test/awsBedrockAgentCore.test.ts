import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AwsBedrockAgentCoreProvider,
  AwsBedrockAgentCoreConfig,
} from '../src/providers/awsBedrockAgentCore.js';
import {
  BedrockAgentRuntimeClient,
  InvokeAgentCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';


// ── Mocks ─────────────────────────────────────────────────────
vi.mock('@aws-sdk/client-bedrock-agent-runtime', () => {
  const BedrockAgentRuntimeClient = vi.fn();
  BedrockAgentRuntimeClient.prototype.send = vi.fn();
  return {
    BedrockAgentRuntimeClient,
    InvokeAgentCommand: vi.fn(),
  };
});

// ── Config ────────────────────────────────────────────────────

const mockConfig: AwsBedrockAgentCoreConfig = {
  region: 'us-east-1',
  agentRuntimeArn: 'arn:aws:bedrock:us-east-1:123456789012:agent-alias/AGENT_ID/ALIAS_ID',
  accessKeyId: 'test-key',
  secretAccessKey: 'test-secret',
};

// ── AWS Bedrock Agent Core Provider ──────────────────────────

describe('AwsBedrockAgentCoreProvider', () => {
  let provider: AwsBedrockAgentCoreProvider;
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AwsBedrockAgentCoreProvider(mockConfig);
    mockClient = (BedrockAgentRuntimeClient as any).mock.instances[0];
  });
  it('listModels returns the full Agent Runtime ARN', async () => {
    const models = await provider.listModels();
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe(mockConfig.agentRuntimeArn);
    expect(models[0].description).toBe('AWS Bedrock Agent (ALIAS_ID)');
  });
  it('initializes the client with correct config', () => {
    expect(BedrockAgentRuntimeClient).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret',
          sessionToken: undefined,
        },
      }),
    );
  });

  it('calls invokeAgent for non-streaming completion', async () => {
    const mockResponse = {
      completion: (async function* () {
        yield { chunk: { bytes: new TextEncoder().encode('Hello from Agent') } };
      })(),
    };
    mockClient.send.mockResolvedValue(mockResponse);

    const result = await provider.createChatCompletion([{ role: 'user', content: 'Hello' }], {
      model: 'agent',
    });

    expect(mockClient.send).toHaveBeenCalled();
    const commandCall = (InvokeAgentCommand as any).mock.calls[0][0];

    // Verify sessionId is a 32-char hex string (SHA-256 substring)
    expect(commandCall.sessionId).toMatch(/^[a-f0-9]{32}$/);

    expect(commandCall).toEqual(
      expect.objectContaining({
        agentId: 'AGENT_ID',
        agentAliasId: 'ALIAS_ID',
        inputText: 'Hello',
      }),
    );

    expect(result.message.content).toBe('Hello from Agent');
    expect(result.finishReason).toBe('stop');
  });

  it('calls invokeAgent for streaming completion', async () => {
    const mockResponse = {
      completion: (async function* () {
        yield { chunk: { bytes: new TextEncoder().encode('Hello ') } };
        yield { chunk: { bytes: new TextEncoder().encode('World') } };
      })(),
    };
    mockClient.send.mockResolvedValue(mockResponse);

    const stream = provider.createStreamingChatCompletion(
      [{ role: 'user', content: 'Stream me' }],
      { model: 'agent' },
    );

    const chunks = [];
    for await (const chunk of stream) {
      if (chunk.delta.content) {
        chunks.push(chunk.delta.content);
      }
    }

    expect(chunks).toEqual(['Hello ', 'World']);
    expect(mockClient.send).toHaveBeenCalled();
  });

  it('throws error if history does not end with user message', async () => {
    await expect(
      provider.createChatCompletion([{ role: 'assistant', content: 'Hi' }], { model: 'agent' }),
    ).rejects.toThrow('History must end with a user message');
  });
});
