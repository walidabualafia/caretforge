import type { ToolCall } from '../providers/provider.js';
import { executeReadFile } from './readFile.js';
import { executeWriteFile } from './writeFile.js';
import { executeShell } from './execShell.js';
import { ToolError } from '../util/errors.js';
import { getLogger } from '../util/logger.js';

export { getEnabledTools } from './schema.js';

export interface ToolExecutionContext {
  allowWrite: boolean;
  allowShell: boolean;
}

/**
 * Dispatch a tool call to the appropriate handler.
 * Returns a string result to feed back to the model.
 */
export async function executeTool(
  toolCall: ToolCall,
  context: ToolExecutionContext,
): Promise<string> {
  const log = getLogger();
  const { name } = toolCall.function;

  let args: Record<string, unknown>;
  try {
    args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
  } catch {
    throw new ToolError(`Failed to parse arguments for tool "${name}"`);
  }

  log.debug({ tool: name, args }, 'Executing tool');

  switch (name) {
    case 'read_file':
      return executeReadFile({ path: args['path'] as string });

    case 'write_file':
      return executeWriteFile(
        { path: args['path'] as string, content: args['content'] as string },
        context.allowWrite,
      );

    case 'exec_shell':
      return executeShell(
        {
          command: args['command'] as string,
          cwd: args['cwd'] as string | undefined,
          timeout: args['timeout'] as number | undefined,
        },
        context.allowShell,
      );

    default:
      throw new ToolError(`Unknown tool: ${name}`);
  }
}
