/**
 * @file context system — index files in cwd, tab-complete @paths,
 * and expand @references into file content for the model.
 *
 * Governance (modeled after Claude Code):
 *  1. File size limits — skip large files, cap expansion
 *  2. .gitignore respect — use git ls-files when available
 *  3. Binary detection — text extension whitelist
 *  4. Symlink safety — cycle detection, skip special files
 *  5. Timeout guard — abort indexing after deadline
 *  6. Configurable ignore — .caretforgeignore support
 *  7. File size display — show sizes in browse output
 */
import { readdir, readFile, stat, lstat, realpath, access } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { execFile } from 'node:child_process';

// ── Constants ───────────────────────────────────────────────

/** Max file size (bytes) to include in the index. Files larger are skipped. */
export const MAX_INDEX_FILE_SIZE = 1_048_576; // 1 MB

/** Max content size (bytes) when expanding an @file reference. */
export const MAX_EXPANSION_SIZE = 262_144; // 256 KB

/** Max line length (chars) before truncation during expansion. */
export const MAX_LINE_LENGTH = 2_000;

/** Max lines returned per @file expansion. */
export const MAX_EXPANSION_LINES = 2_000;

const MAX_DEPTH = 4;
const MAX_FILES = 5_000;

/** Indexing timeout in milliseconds. */
export const INDEX_TIMEOUT_MS = 10_000;

// ── Ignored directories (fallback when not using git) ───────

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

// ── Text extension whitelist (Point 3: binary detection) ────

export const TEXT_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.text',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.xml',
  '.csv',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
  '.py',
  '.pyi',
  '.pyw',
  '.rb',
  '.erb',
  '.rake',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.kts',
  '.scala',
  '.c',
  '.cpp',
  '.cc',
  '.cxx',
  '.h',
  '.hpp',
  '.hxx',
  '.cs',
  '.swift',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.ps1',
  '.bat',
  '.cmd',
  '.env',
  '.ini',
  '.cfg',
  '.conf',
  '.config',
  '.properties',
  '.sql',
  '.graphql',
  '.gql',
  '.proto',
  '.vue',
  '.svelte',
  '.astro',
  '.ejs',
  '.hbs',
  '.pug',
  '.jade',
  '.php',
  '.pl',
  '.pm',
  '.lua',
  '.r',
  '.dart',
  '.ex',
  '.exs',
  '.erl',
  '.hrl',
  '.clj',
  '.cljs',
  '.cljc',
  '.edn',
  '.hs',
  '.lhs',
  '.elm',
  '.ml',
  '.mli',
  '.f',
  '.f90',
  '.f95',
  '.for',
  '.cmake',
  '.make',
  '.makefile',
  '.gradle',
  '.sbt',
  '.rst',
  '.adoc',
  '.asciidoc',
  '.org',
  '.tex',
  '.latex',
  '.lock',
  '.log',
  '.diff',
  '.patch',
  '.dockerfile',
  '.dockerignore',
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
  '.prettierrc',
  '.eslintrc',
  '.babelrc',
  '.npmrc',
  '.nvmrc',
  '.env.example',
  '.tf',
  '.tfvars',
  '.hcl',
  '.prisma',
  '.mdx',
]);

/** Files with no extension that are known text files. */
const TEXT_FILENAMES = new Set([
  'Makefile',
  'Dockerfile',
  'Vagrantfile',
  'Gemfile',
  'Rakefile',
  'Procfile',
  'LICENSE',
  'LICENCE',
  'CHANGELOG',
  'CONTRIBUTING',
  'AUTHORS',
  'CODEOWNERS',
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
  '.dockerignore',
  '.prettierignore',
  '.eslintignore',
  '.npmignore',
]);

/**
 * Check if a filename looks like a text file based on its extension
 * or known filename.
 */
export function isTextFile(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  if (ext && TEXT_EXTENSIONS.has(ext)) return true;
  // Check bare filename (e.g. Makefile, LICENSE)
  const base = filename.split('/').pop() ?? filename;
  return TEXT_FILENAMES.has(base);
}

// ── .caretforgeignore support (Point 6) ─────────────────────

/**
 * Load ignore patterns from .caretforgeignore in the given directory.
 * Returns a list of gitignore-style patterns, or empty if no file.
 */
export function loadIgnorePatterns(root: string): string[] {
  const ignorePath = join(root, '.caretforgeignore');
  if (!existsSync(ignorePath)) return [];
  try {
    const content = readFileSync(ignorePath, 'utf-8');
    return content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch {
    return [];
  }
}

/**
 * Simple gitignore-style pattern matcher. Supports:
 *  - exact filenames: "secret.key"
 *  - directory patterns: "logs/" (matches any path containing /logs/)
 *  - glob prefix: "*.log" (matches files ending in .log)
 *  - path prefix: "dist/" (matches paths starting with dist/)
 */
export function matchesIgnorePattern(relPath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Directory pattern: "logs/" matches any segment
    if (pattern.endsWith('/')) {
      const dir = pattern.slice(0, -1);
      if (relPath.startsWith(dir + '/') || relPath.includes('/' + dir + '/')) return true;
      continue;
    }
    // Glob: "*.ext"
    if (pattern.startsWith('*.')) {
      const ext = pattern.slice(1); // ".ext"
      if (relPath.endsWith(ext)) return true;
      continue;
    }
    // Exact match or path prefix
    if (relPath === pattern || relPath.startsWith(pattern + '/')) return true;
    // Match basename
    const base = relPath.split('/').pop() ?? relPath;
    if (base === pattern) return true;
  }
  return false;
}

// ── File metadata for browse display (Point 7) ─────────────

export interface IndexedFile {
  path: string;
  size: number;
}

// ── Git-based file discovery (Point 2) ──────────────────────

/**
 * Check if a directory is inside a git repository.
 */
async function isGitRepo(dir: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir, timeout: 3000 }, (err) => {
      resolve(!err);
    });
  });
}

/**
 * Use `git ls-files` to get tracked files (respects .gitignore).
 * Returns relative paths or null if git is unavailable.
 */
async function gitListFiles(root: string, timeoutMs: number): Promise<string[] | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard'],
      { cwd: root, timeout: timeoutMs, maxBuffer: 20_000_000 },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const files = stdout
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        resolve(files);
      },
    );
  });
}

// ── Core indexing (all 7 points integrated) ─────────────────

export interface IndexResult {
  files: IndexedFile[];
  timedOut: boolean;
  method: 'git' | 'walk';
  skippedLarge: number;
  skippedBinary: number;
  skippedIgnored: number;
}

/**
 * Index files under `root` with full governance:
 *  1. File size limits
 *  2. .gitignore respect (git ls-files)
 *  3. Binary detection (text extension whitelist)
 *  4. Symlink safety (cycle detection)
 *  5. Timeout guard
 *  6. .caretforgeignore patterns
 *  7. Collects file sizes for display
 */
export async function indexFiles(root: string, maxDepth = MAX_DEPTH): Promise<IndexedFile[]> {
  const result = await indexFilesWithMeta(root, maxDepth);
  return result.files;
}

export async function indexFilesWithMeta(root: string, maxDepth = MAX_DEPTH): Promise<IndexResult> {
  const deadline = Date.now() + INDEX_TIMEOUT_MS;
  const ignorePatterns = loadIgnorePatterns(root);
  let skippedLarge = 0;
  let skippedBinary = 0;
  let skippedIgnored = 0;

  // Try git ls-files first (Point 2)
  const inGit = await isGitRepo(root);
  if (inGit) {
    const remainingMs = Math.max(1000, deadline - Date.now());
    const gitFiles = await gitListFiles(root, remainingMs);
    if (gitFiles) {
      const files: IndexedFile[] = [];
      for (const relPath of gitFiles) {
        if (Date.now() > deadline) {
          return {
            files,
            timedOut: true,
            method: 'git',
            skippedLarge,
            skippedBinary,
            skippedIgnored,
          };
        }
        if (files.length >= MAX_FILES) break;

        // Point 6: .caretforgeignore
        if (ignorePatterns.length > 0 && matchesIgnorePattern(relPath, ignorePatterns)) {
          skippedIgnored++;
          continue;
        }

        // Point 3: binary detection
        if (!isTextFile(relPath)) {
          skippedBinary++;
          continue;
        }

        // Point 1: file size check
        try {
          const s = await stat(join(root, relPath));
          if (s.size > MAX_INDEX_FILE_SIZE) {
            skippedLarge++;
            continue;
          }
          files.push({ path: relPath, size: s.size });
        } catch {
          // Skip unreadable
        }
      }
      files.sort((a, b) => a.path.localeCompare(b.path));
      return {
        files,
        timedOut: false,
        method: 'git',
        skippedLarge,
        skippedBinary,
        skippedIgnored,
      };
    }
  }

  // Fallback: recursive readdir walk with all governance
  const files: IndexedFile[] = [];
  const visitedRealPaths = new Set<string>(); // Point 4: symlink cycle detection

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth || files.length >= MAX_FILES) return;
    if (Date.now() > deadline) return; // Point 5: timeout

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // permission denied
    }

    for (const entry of entries) {
      if (files.length >= MAX_FILES || Date.now() > deadline) break;

      const fullPath = join(dir, entry.name);

      // Point 4: symlink safety — detect cycles and special files
      if (entry.isSymbolicLink()) {
        try {
          const real = await realpath(fullPath);
          if (visitedRealPaths.has(real)) continue; // cycle
          visitedRealPaths.add(real);
          const ls = await lstat(real);
          if (ls.isFIFO() || ls.isSocket() || ls.isCharacterDevice() || ls.isBlockDevice()) {
            continue; // skip special files
          }
        } catch {
          continue; // broken symlink
        }
      }

      if (entry.name.startsWith('.') && entry.isDirectory()) continue;

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        await walk(fullPath, depth + 1);
      } else {
        const relPath = relative(root, fullPath);

        // Point 6: .caretforgeignore
        if (ignorePatterns.length > 0 && matchesIgnorePattern(relPath, ignorePatterns)) {
          skippedIgnored++;
          continue;
        }

        // Point 3: binary detection
        if (!isTextFile(relPath)) {
          skippedBinary++;
          continue;
        }

        // Point 1: file size limit
        try {
          const s = await stat(fullPath);
          if (s.size > MAX_INDEX_FILE_SIZE) {
            skippedLarge++;
            continue;
          }
          files.push({ path: relPath, size: s.size });
        } catch {
          // skip
        }
      }
    }
  }

  await walk(root, 0);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return {
    files,
    timedOut: Date.now() > deadline,
    method: 'walk',
    skippedLarge,
    skippedBinary,
    skippedIgnored,
  };
}

// ── Tab completion ──────────────────────────────────────────

export function createFileCompleter(files: IndexedFile[]): (line: string) => [string[], string] {
  return function completer(line: string): [string[], string] {
    const match = line.match(/@([^\s]*)$/);
    if (!match) return [[], line];

    const partial = match[1] ?? '';
    const hits = files.filter((f) => f.path.startsWith(partial));

    if (hits.length === 0) return [[], line];

    return [hits.map((h) => '@' + h.path), match[0]];
  };
}

// ── Interactive file browsing (Point 7: size display) ───────

const MAX_BROWSE_RESULTS = 50;

export function parseBrowseQuery(input: string): string | null {
  const match = input.match(/^@([^\s]*)$/);
  if (!match) return null;
  return match[1] ?? '';
}

/** Format bytes into human-readable size. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function matchFiles(
  files: IndexedFile[],
  prefix: string,
): { matches: IndexedFile[]; total: number; truncated: boolean } {
  const matches = files.filter((f) => f.path.startsWith(prefix));
  const total = matches.length;
  const truncated = total > MAX_BROWSE_RESULTS;
  return {
    matches: truncated ? matches.slice(0, MAX_BROWSE_RESULTS) : matches,
    total,
    truncated,
  };
}

// ── Reference expansion (Point 1: size/line caps) ───────────

export interface FileReference {
  path: string;
  content: string;
  truncated: boolean;
  originalSize: number;
}

/**
 * Expand @file references with governance:
 *  - Cap content at MAX_EXPANSION_SIZE (256 KB)
 *  - Cap at MAX_EXPANSION_LINES (2,000 lines)
 *  - Truncate lines over MAX_LINE_LENGTH (2,000 chars)
 *  - Skip binary files
 */
export async function expandFileReferences(
  message: string,
  knownFiles: IndexedFile[],
): Promise<{ expandedMessage: string; refs: FileReference[] }> {
  const tokenRegex = /@([^\s]+)/g;
  const refs: FileReference[] = [];
  const seenPaths = new Set<string>();
  const knownPaths = new Set(knownFiles.map((f) => f.path));

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(message)) !== null) {
    const filePath = match[1];
    if (!filePath) continue;
    if (seenPaths.has(filePath)) continue;

    // Check if known or exists on disk
    const isKnown = knownPaths.has(filePath);
    let exists = isKnown;

    if (!isKnown) {
      try {
        await access(filePath);
        exists = true;
      } catch {
        exists = false;
      }
    }

    if (!exists) continue;

    // Point 3: skip binary files
    if (!isTextFile(filePath)) continue;

    try {
      const fileStat = await stat(filePath);
      const originalSize = fileStat.size;
      let truncated = false;

      // Point 1: cap at MAX_EXPANSION_SIZE
      let raw: string;
      if (originalSize > MAX_EXPANSION_SIZE) {
        // Read only the first MAX_EXPANSION_SIZE bytes
        const fullContent = await readFile(filePath, 'utf-8');
        raw = fullContent.slice(0, MAX_EXPANSION_SIZE);
        truncated = true;
      } else {
        raw = await readFile(filePath, 'utf-8');
      }

      // Point 1: truncate lines and cap line count
      let lines = raw.split('\n');
      if (lines.length > MAX_EXPANSION_LINES) {
        lines = lines.slice(0, MAX_EXPANSION_LINES);
        truncated = true;
      }
      lines = lines.map((l) =>
        l.length > MAX_LINE_LENGTH ? l.slice(0, MAX_LINE_LENGTH) + '…' : l,
      );
      const content = lines.join('\n');

      refs.push({ path: filePath, content, truncated, originalSize });
      seenPaths.add(filePath);
    } catch {
      // Can't read — skip
    }
  }

  if (refs.length === 0) {
    return { expandedMessage: message, refs: [] };
  }

  const contextParts = refs.map((r) => {
    const header = r.truncated
      ? `[File: ${r.path} (truncated from ${formatSize(r.originalSize)})]`
      : `[File: ${r.path}]`;
    return `${header}\n${r.content}`;
  });
  const context = contextParts.join('\n\n');

  const cleanMessage = message.replace(/@([^\s]+)/g, (full, path: string) => {
    return seenPaths.has(path) ? path : full;
  });

  const expandedMessage = `${context}\n\n${cleanMessage}`;
  return { expandedMessage, refs };
}
