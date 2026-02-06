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
      'Write content to a file at the given path. Creates the file if it does not exist, overwrites if it does.',
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
    description: 'Execute a shell command and return its stdout and stderr. Use with caution.',
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
 * Build the list of enabled tool definitions based on flags.
 */
export function getEnabledTools(options: {
  allowWrite: boolean;
  allowShell: boolean;
}): ToolDefinition[] {
  const tools: ToolDefinition[] = [READ_FILE_TOOL];

  if (options.allowWrite) {
    tools.push(WRITE_FILE_TOOL);
  }
  if (options.allowShell) {
    tools.push(EXEC_SHELL_TOOL);
  }

  return tools;
}
