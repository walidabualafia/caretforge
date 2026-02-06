import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { ToolError } from '../util/errors.js';

export interface WriteFileArgs {
  path: string;
  content: string;
}

/**
 * Write content to a file. Guarded by --allow-write flag.
 */
export async function executeWriteFile(args: WriteFileArgs, allowed: boolean): Promise<string> {
  if (!allowed) {
    throw new ToolError('File writing is disabled. Pass --allow-write to enable this tool.');
  }

  const target = resolve(args.path);
  try {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, args.content, 'utf-8');
    return `Successfully wrote ${args.content.length} characters to ${target}`;
  } catch (err) {
    throw new ToolError(
      `Failed to write file "${target}": ${(err as Error).message}`,
      err as Error,
    );
  }
}
