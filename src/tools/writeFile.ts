import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { ToolError } from '../util/errors.js';

export interface WriteFileArgs {
  path: string;
  content: string;
}

/**
 * Write content to a file. Permission checking is handled by the agent loop
 * before this function is called.
 */
export async function executeWriteFile(args: WriteFileArgs): Promise<string> {
  const target = resolve(args.path);
  try {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, args.content, 'utf-8');
    const lines = args.content.split('\n').length;
    return `Wrote ${lines} line${lines !== 1 ? 's' : ''} to ${target}`;
  } catch (err) {
    throw new ToolError(
      `Failed to write file "${target}": ${(err as Error).message}`,
      err as Error,
    );
  }
}
