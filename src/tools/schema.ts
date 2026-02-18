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

export const EDIT_FILE_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'edit_file',
    description:
      'Edit a file by replacing an exact string match with new content. More efficient than write_file for small changes — avoids rewriting the entire file.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative file path to edit.',
        },
        old_string: {
          type: 'string',
          description:
            'The exact text to find in the file. Must match exactly, including whitespace and indentation.',
        },
        new_string: {
          type: 'string',
          description: 'The text to replace old_string with.',
        },
        replace_all: {
          type: 'boolean',
          description:
            'If true, replace all occurrences of old_string. Defaults to false (single replacement).',
        },
      },
      required: ['path', 'old_string', 'new_string'],
      additionalProperties: false,
    },
  },
};

export const GREP_SEARCH_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'grep_search',
    description:
      'Search file contents using regex. Uses ripgrep for speed. Returns matching lines with file paths and line numbers. Output is capped to prevent token explosion.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Regex pattern to search for.',
        },
        path: {
          type: 'string',
          description: 'Directory to search in. Defaults to the current working directory.',
        },
        include: {
          type: 'string',
          description: 'Glob pattern to filter files (e.g. "*.ts", "*.{js,jsx}").',
        },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
  },
};

export const GLOB_FIND_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'glob_find',
    description:
      'Find files matching a glob pattern. Returns matching file paths sorted by modification time (newest first). Results are capped to prevent token explosion.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern to match files (e.g. "**/*.ts", "src/**/*.test.ts").',
        },
        path: {
          type: 'string',
          description: 'Root directory to search from. Defaults to the current working directory.',
        },
      },
      required: ['pattern'],
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
  return [
    READ_FILE_TOOL,
    WRITE_FILE_TOOL,
    EDIT_FILE_TOOL,
    GREP_SEARCH_TOOL,
    GLOB_FIND_TOOL,
    EXEC_SHELL_TOOL,
  ];
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
