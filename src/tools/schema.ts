import type { ToolDefinition } from '../providers/provider.js';

/**
 * Tool definitions that can be sent to the model so it knows
 * which tools are available for function-calling.
 */

export const READ_FILE_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read_file',
    description: 'Read the contents of a file at the given path. Returns the file text.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative file path to read.',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
};

export const WRITE_FILE_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'write_file',
    description:
      'Write content to a file at the given path. Creates the file if it does not exist, overwrites if it does. Creates parent directories as needed.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative file path to write.',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file.',
        },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
  },
};

export const EXEC_SHELL_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'exec_shell',
    description:
      'Execute a shell command and return its stdout, stderr, and exit code. Runs in the current working directory by default.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute.',
        },
        cwd: {
          type: 'string',
          description: 'Working directory for the command (optional).',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default 30000).',
        },
      },
      required: ['command'],
      additionalProperties: false,
    },
  },
};

/**
 * All available tools. The model always knows about every tool;
 * permission checking happens at execution time, not at selection time.
 */
export function getAllTools(): ToolDefinition[] {
  return [READ_FILE_TOOL, WRITE_FILE_TOOL, EXEC_SHELL_TOOL];
}

/**
 * @deprecated Use getAllTools() — tools are always available; permission is checked at runtime.
 */
export function getEnabledTools(_options?: {
  allowWrite: boolean;
  allowShell: boolean;
}): ToolDefinition[] {
  return getAllTools();
}
