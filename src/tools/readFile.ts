import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ToolError } from '../util/errors.js';

export interface ReadFileArgs {
  path: string;
}

/**
 * Read the contents of a file. Always enabled.
 */
export async function executeReadFile(args: ReadFileArgs): Promise<string> {
  const target = resolve(args.path);
  try {
    return await readFile(target, 'utf-8');
  } catch (err) {
    throw new ToolError(`Failed to read file "${target}": ${(err as Error).message}`, err as Error);
  }
}
