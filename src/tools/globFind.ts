import { readdir, stat } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { ToolError } from '../util/errors.js';

export interface GlobFindArgs {
  pattern: string;
  path?: string;
}

const MAX_RESULTS = 200;

/**
 * Find files matching a glob pattern, sorted by modification time (newest first).
 * Uses Node.js recursive readdir with a glob-to-regex conversion.
 * Results are capped at MAX_RESULTS to prevent token explosion.
 */
export async function executeGlobFind(args: GlobFindArgs): Promise<string> {
  const searchDir = args.path ? resolve(args.path) : process.cwd();
  const { pattern } = args;

  if (!pattern) {
    throw new ToolError('glob_find requires a non-empty "pattern" argument.');
  }

  let entries: string[];
  try {
    entries = await readdir(searchDir, { recursive: true, encoding: 'utf-8' });
  } catch (err) {
    throw new ToolError(
      `Failed to read directory "${searchDir}": ${(err as Error).message}`,
      err as Error,
    );
  }

  const regex = globToRegex(pattern);
  const matched = entries.filter((entry) => regex.test(entry));

  if (matched.length === 0) {
    return `No files found matching "${pattern}" in ${searchDir}`;
  }

  const withMtime = await Promise.all(
    matched.map(async (entry) => {
      const fullPath = join(searchDir, entry);
      try {
        const s = await stat(fullPath);
        return { path: entry, mtime: s.mtimeMs, isFile: s.isFile() };
      } catch {
        return null;
      }
    }),
  );

  const files = withMtime
    .filter((item): item is NonNullable<typeof item> => item !== null && item.isFile)
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) {
    return `No files found matching "${pattern}" in ${searchDir}`;
  }

  const truncated = files.length > MAX_RESULTS;
  const displayed = truncated ? files.slice(0, MAX_RESULTS) : files;

  const header = truncated
    ? `Showing ${MAX_RESULTS} of ${files.length} files (results truncated):\n`
    : `Found ${files.length} file${files.length !== 1 ? 's' : ''}:\n`;

  const listing = displayed.map((f) => relative(searchDir, join(searchDir, f.path))).join('\n');

  return header + listing;
}

/**
 * Convert a glob pattern to a RegExp.
 * Supports *, **, and ? wildcards.
 */
function globToRegex(pattern: string): RegExp {
  let regex = '';
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i]!;
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          regex += '(?:.+/)?';
          i += 3;
        } else {
          regex += '.*';
          i += 2;
        }
      } else {
        regex += '[^/]*';
        i++;
      }
    } else if (ch === '?') {
      regex += '[^/]';
      i++;
    } else if ('.+^${}()|[]\\'.includes(ch)) {
      regex += '\\' + ch;
      i++;
    } else {
      regex += ch;
      i++;
    }
  }
  return new RegExp(`^${regex}$`);
}
