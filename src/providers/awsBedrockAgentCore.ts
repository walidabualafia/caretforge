import {
    BedrockAgentRuntimeClient,
    InvokeAgentCommand,
    InvokeAgentCommandOutput,
} from '@aws-sdk/client-bedrock-agent-runtime';
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

// ── Config ────────────────────────────────────────────────────

export interface AwsBedrockAgentCoreConfig {
    region: string;
    agentRuntimeArn: string; // e.g. arn:aws:bedrock:us-east-1:123456789012:agent-alias/AGENT_ID/ALIAS_ID
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
    profile?: string;
}

// ── AWS Bedrock Agent Core Provider ──────────────────────────

export class AwsBedrockAgentCoreProvider implements Provider {
    readonly name = 'aws-bedrock-agent-core';
    readonly supportsTools = false; // Agent handles tools

    private readonly client: BedrockAgentRuntimeClient;
    private readonly agentId: string;
    private readonly agentAliasId: string;
    private readonly log = getLogger();

    constructor(config: AwsBedrockAgentCoreConfig) {
        // ARN: arn:aws:bedrock:region:account-id:agent-alias/agent-id/alias-id
        const parts = config.agentRuntimeArn.split('/');
        if (parts.length < 3) {
            throw new Error(`Invalid Agent Runtime ARN: ${config.agentRuntimeArn}`);
        }
        this.agentId = parts[1]!;
        this.agentAliasId = parts[2]!;

        const clientConfig: any = {
            region: config.region,
        };

        if (config.accessKeyId && config.secretAccessKey) {
            clientConfig.credentials = {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
                sessionToken: config.sessionToken,
            };
        } else if (config.profile) {
            // Set AWS_PROFILE to rely on standard credential chain
            process.env.AWS_PROFILE = config.profile;
        }

        this.client = new BedrockAgentRuntimeClient(clientConfig);
    }

    // ── listModels ────────────────────────────────────────────

    async listModels(): Promise<ModelInfo[]> {
        return [
            {
                id: this.agentId,
                description: `AWS Bedrock Agent (${this.agentAliasId})`,
            },
        ];
    }

    // ── Non-streaming completion ──────────────────────────────

    async createChatCompletion(
        messages: ChatMessage[],
        _options: ChatCompletionOptions,
    ): Promise<ChatCompletionResult> {
        const { inputText, sessionId } = this.prepareRequest(messages);

        try {
            this.log.debug({ agentId: this.agentId, sessionId }, 'Invoking Bedrock Agent');

            const command = new InvokeAgentCommand({
                agentId: this.agentId,
                agentAliasId: this.agentAliasId,
                sessionId,
                inputText,
            });

            const response = await this.client.send(command);
            const content = await this.processResponse(response);

            return {
                message: { role: 'assistant', content },
                finishReason: 'stop',
            };
        } catch (err: any) {
            throw new ProviderError(
                `Bedrock Agent invocation failed: ${err.message}`,
                undefined,
                err,
            );
        }
    }

    // ── Streaming completion ──────────────────────────────────

    async *createStreamingChatCompletion(
        messages: ChatMessage[],
        _options: ChatCompletionOptions,
    ): AsyncIterable<StreamChunk> {
        const { inputText, sessionId } = this.prepareRequest(messages);

        try {
            this.log.debug(
                { agentId: this.agentId, sessionId },
                'Invoking Bedrock Agent (streaming)',
            );

            const command = new InvokeAgentCommand({
                agentId: this.agentId,
                agentAliasId: this.agentAliasId,
                sessionId,
                inputText,
                enableTrace: false,
            });

            const response = await this.client.send(command);

            if (!response.completion) {
                throw new ProviderError('No completion stream in Bedrock Agent response');
            }

            for await (const event of response.completion) {
                if (event.chunk && event.chunk.bytes) {
                    const chunkText = new TextDecoder().decode(event.chunk.bytes);
                    yield {
                        delta: { content: chunkText },
                        finishReason: null,
                    };
                }
            }

            yield { delta: {}, finishReason: 'stop' };
        } catch (err: any) {
            if (err instanceof ProviderError) throw err;
            throw new ProviderError(
                `Bedrock Agent streaming failed: ${err.message}`,
                undefined,
                err
            );
        }
    }

    // ── Internal helpers ──────────────────────────────────────

    private prepareRequest(messages: ChatMessage[]): {
        inputText: string;
        sessionId: string;
    } {
        // Send the last user message as input (Agent manages its own memory)
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role !== 'user' || !lastMsg.content) {
            throw new ProviderError('History must end with a user message for Agents.');
        }

        // Generate a new session ID for each request
        const sessionId = `session-${Date.now()}`;

        return {
            inputText: lastMsg.content,
            sessionId,
        };
    }

    private async processResponse(
        response: InvokeAgentCommandOutput,
    ): Promise<string> {
        const chunks: string[] = [];

        if (!response.completion) {
            return '';
        }

        for await (const event of response.completion) {
            if (event.chunk && event.chunk.bytes) {
                const text = new TextDecoder().decode(event.chunk.bytes);
                chunks.push(text);
            }
        }

        return chunks.join('');
    }
}
