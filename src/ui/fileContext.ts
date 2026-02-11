/**
 * @file context system — index files in cwd, tab-complete @paths,
 * and expand @references into file content for the model.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

// ── Ignore patterns ─────────────────────────────────────────

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.output',
  '.vitepress',
  'coverage',
  '__pycache__',
  '.mypy_cache',
  '.pytest_cache',
  '.tox',
  'venv',
  '.venv',
  '.env',
  'target',
  'vendor',
]);

const MAX_DEPTH = 4;
const MAX_FILES = 5000;

// ── File indexing ───────────────────────────────────────────

/**
 * Recursively index files under `root`, returning relative paths.
 * Skips common ignored directories and respects depth/count limits.
 */
export async function indexFiles(root: string, maxDepth = MAX_DEPTH): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth || files.length >= MAX_FILES) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // permission denied, etc.
    }

    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;

      if (entry.name.startsWith('.') && entry.isDirectory()) continue;

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await walk(join(dir, entry.name), depth + 1);
      } else {
        files.push(relative(root, join(dir, entry.name)));
      }
    }
  }

  await walk(root, 0);
  files.sort();
  return files;
}

// ── Tab completion ──────────────────────────────────────────

/**
 * Create a readline completer that handles @filepath tab-completion.
 * Returns a standard Node.js readline completer function.
 */
export function createFileCompleter(files: string[]): (line: string) => [string[], string] {
  return function completer(line: string): [string[], string] {
    // Find the last @token in the line
    const match = line.match(/@([^\s]*)$/);
    if (!match) return [[], line];

    const partial = match[1] ?? '';
    const hits = files.filter((f) => f.startsWith(partial));

    if (hits.length === 0) return [[], line];

    // Return completions: readline replaces the matched substring
    return [hits.map((h) => '@' + h), match[0]];
  };
}

// ── Interactive file browsing ────────────────────────────────

const MAX_BROWSE_RESULTS = 50;

/**
 * Check if the input is a bare @-browse query (just "@" or "@prefix"
 * with no other text). Returns the prefix if so, or null otherwise.
 */
export function parseBrowseQuery(input: string): string | null {
  const match = input.match(/^@([^\s]*)$/);
  if (!match) return null;
  return match[1] ?? '';
}

/**
 * Find indexed files matching a prefix and return them grouped by
 * top-level directory for readable display.
 */
export function matchFiles(
  files: string[],
  prefix: string,
): { matches: string[]; total: number; truncated: boolean } {
  const matches = files.filter((f) => f.startsWith(prefix));
  const total = matches.length;
  const truncated = total > MAX_BROWSE_RESULTS;
  return {
    matches: truncated ? matches.slice(0, MAX_BROWSE_RESULTS) : matches,
    total,
    truncated,
  };
}

// ── Reference expansion ─────────────────────────────────────

/** A resolved @file reference. */
export interface FileReference {
  path: string;
  content: string;
}

/**
 * Find all @filepath tokens in a message, read each file,
 * and return the enriched prompt with file context prepended.
 */
export async function expandFileReferences(
  message: string,
  knownFiles: string[],
): Promise<{ expandedMessage: string; refs: FileReference[] }> {
  // Match @filepath tokens (not preceded by another word char)
  const tokenRegex = /@([^\s]+)/g;
  const refs: FileReference[] = [];
  const seenPaths = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(message)) !== null) {
    const filePath = match[1];
    if (!filePath) continue;

    // Only expand if it looks like a known file or actually exists
    if (seenPaths.has(filePath)) continue;

    const isKnown = knownFiles.includes(filePath);
    let exists = isKnown;

    if (!isKnown) {
      try {
        await stat(filePath);
        exists = true;
      } catch {
        exists = false;
      }
    }

    if (!exists) continue;

    try {
      const content = await readFile(filePath, 'utf-8');
      refs.push({ path: filePath, content });
      seenPaths.add(filePath);
    } catch {
      // Can't read — skip silently
    }
  }

  if (refs.length === 0) {
    return { expandedMessage: message, refs: [] };
  }

  // Build context block
  const contextParts = refs.map((r) => `[File: ${r.path}]\n${r.content}`);
  const context = contextParts.join('\n\n');

  // Strip the @ prefixes from the original message for cleaner reading
  const cleanMessage = message.replace(/@([^\s]+)/g, (full, path: string) => {
    return seenPaths.has(path) ? path : full;
  });

  const expandedMessage = `${context}\n\n${cleanMessage}`;
  return { expandedMessage, refs };
}
