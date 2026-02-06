import type { ChatMessage, ToolCall } from '../providers/provider.js';

/**
 * Convenience factories for building ChatMessage objects.
 */

export function systemMessage(content: string): ChatMessage {
  return { role: 'system', content };
}

export function userMessage(content: string): ChatMessage {
  return { role: 'user', content };
}

export function assistantMessage(content: string, toolCalls?: ToolCall[]): ChatMessage {
  return {
    role: 'assistant',
    content,
    ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
  };
}

export function toolResultMessage(toolCallId: string, content: string): ChatMessage {
  return { role: 'tool', content, toolCallId };
}

/**
 * Serialise a conversation to a plain JSON-safe array.
 */
export function serialiseConversation(messages: ChatMessage[]): Array<Record<string, unknown>> {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
    ...(m.toolCallId ? { toolCallId: m.toolCallId } : {}),
    ...(m.toolCalls ? { toolCalls: m.toolCalls } : {}),
  }));
}
