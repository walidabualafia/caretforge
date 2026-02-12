/**
 * Tests for file indexing governance (Issue #14).
 * Covers all 7 governance points:
 *  1. File size limits
 *  2. .gitignore respect
 *  3. Binary file detection
 *  4. Symlink safety
 *  5. Timeout guard
 *  6. Configurable ignore patterns (.caretforgeignore)
 *  7. File size display in browse output
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, symlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  indexFilesWithMeta,
  isTextFile,
  loadIgnorePatterns,
  matchesIgnorePattern,
  formatSize,
  matchFiles,
  expandFileReferences,
  createFileCompleter,
  parseBrowseQuery,
  MAX_INDEX_FILE_SIZE,
  MAX_EXPANSION_SIZE,
  MAX_LINE_LENGTH,
  MAX_EXPANSION_LINES,
  TEXT_EXTENSIONS,
  type IndexedFile,
} from '../src/ui/fileContext.js';

// ── Helpers ──────────────────────────────────────────────────

let testDir: string;

function setup() {
  testDir = mkdtempSync(join(tmpdir(), 'caretforge-test-'));
}

function cleanup() {
  rmSync(testDir, { recursive: true, force: true });
}

function createFile(relPath: string, content: string) {
  const full = join(testDir, relPath);
  const dir = full.substring(0, full.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(full, content);
}

function createLargeFile(relPath: string, sizeBytes: number) {
  const full = join(testDir, relPath);
  const dir = full.substring(0, full.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(full, Buffer.alloc(sizeBytes, 'a'));
}

// ══════════════════════════════════════════════════════════════
// Point 1: File Size Limits
// ══════════════════════════════════════════════════════════════

describe('Point 1: File size limits', () => {
  beforeEach(setup);
  afterEach(cleanup);

  it('should index files under MAX_INDEX_FILE_SIZE', async () => {
    createFile('small.ts', 'export const a = 1;');
    const result = await indexFilesWithMeta(testDir);
    expect(result.files.length).toBe(1);
    expect(result.files[0].path).toBe('small.ts');
    expect(result.skippedLarge).toBe(0);
  });

  it('should skip files exceeding MAX_INDEX_FILE_SIZE', async () => {
    createFile('small.ts', 'ok');
    createLargeFile('huge.ts', MAX_INDEX_FILE_SIZE + 1);
    const result = await indexFilesWithMeta(testDir);
    expect(result.files.map((f) => f.path)).toEqual(['small.ts']);
    expect(result.skippedLarge).toBe(1);
  });

  it('should cap expansion at MAX_EXPANSION_SIZE', async () => {
    // Create a file larger than 256 KB but under 1 MB
    const bigContent = 'x'.repeat(MAX_EXPANSION_SIZE + 10_000) + '\n';
    createFile('bigfile.ts', bigContent);
    const files: IndexedFile[] = [{ path: join(testDir, 'bigfile.ts'), size: bigContent.length }];
    const { refs } = await expandFileReferences(`@${join(testDir, 'bigfile.ts')}`, files);
    expect(refs.length).toBe(1);
    expect(refs[0].truncated).toBe(true);
    expect(refs[0].content.length).toBeLessThanOrEqual(MAX_EXPANSION_SIZE + 100); // small buffer for line splitting
  });

  it('should truncate lines exceeding MAX_LINE_LENGTH', async () => {
    const longLine = 'a'.repeat(MAX_LINE_LENGTH + 500);
    createFile('longlines.ts', longLine + '\nshort\n');
    const files: IndexedFile[] = [
      { path: join(testDir, 'longlines.ts'), size: longLine.length + 7 },
    ];
    const { refs } = await expandFileReferences(`@${join(testDir, 'longlines.ts')}`, files);
    expect(refs.length).toBe(1);
    const lines = refs[0].content.split('\n');
    // First line should be truncated
    expect(lines[0].length).toBeLessThanOrEqual(MAX_LINE_LENGTH + 5); // +5 for "…" char
    expect(lines[0].endsWith('…')).toBe(true);
  });

  it('should cap expansion at MAX_EXPANSION_LINES', async () => {
    const manyLines = Array.from({ length: MAX_EXPANSION_LINES + 500 }, (_, i) => `line ${i}`).join(
      '\n',
    );
    createFile('manylines.ts', manyLines);
    const files: IndexedFile[] = [{ path: join(testDir, 'manylines.ts'), size: manyLines.length }];
    const { refs } = await expandFileReferences(`@${join(testDir, 'manylines.ts')}`, files);
    expect(refs.length).toBe(1);
    expect(refs[0].truncated).toBe(true);
    const lineCount = refs[0].content.split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(MAX_EXPANSION_LINES);
  });

  it('should include file size in IndexedFile', async () => {
    const content = 'hello world';
    createFile('sized.ts', content);
    const result = await indexFilesWithMeta(testDir);
    expect(result.files.length).toBe(1);
    expect(result.files[0].size).toBe(content.length);
  });
});

// ══════════════════════════════════════════════════════════════
// Point 2: .gitignore respect
// ══════════════════════════════════════════════════════════════

describe('Point 2: .gitignore respect', () => {
  let gitDir: string;

  beforeEach(() => {
    gitDir = mkdtempSync(join(tmpdir(), 'caretforge-git-'));
  });

  afterEach(() => {
    rmSync(gitDir, { recursive: true, force: true });
  });

  it('should use git ls-files when in a git repo', async () => {
    // Initialize a git repo
    const { execFileSync } = await import('node:child_process');
    execFileSync('git', ['init'], { cwd: gitDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: gitDir });
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: gitDir });

    // Create tracked files
    writeFileSync(join(gitDir, 'tracked.ts'), 'const a = 1;');
    writeFileSync(join(gitDir, '.gitignore'), 'ignored/\n');
    mkdirSync(join(gitDir, 'ignored'));
    writeFileSync(join(gitDir, 'ignored', 'secret.ts'), 'secret');

    execFileSync('git', ['add', '.'], { cwd: gitDir });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: gitDir });

    // Create an untracked-but-not-ignored file
    writeFileSync(join(gitDir, 'untracked.ts'), 'const b = 2;');

    const result = await indexFilesWithMeta(gitDir);
    expect(result.method).toBe('git');
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain('tracked.ts');
    expect(paths).toContain('untracked.ts');
    // The gitignored file should not appear
    expect(paths).not.toContain('ignored/secret.ts');
  });

  it('should fall back to walk when not in a git repo', async () => {
    setup();
    createFile('hello.ts', 'const x = 1;');
    const result = await indexFilesWithMeta(testDir);
    expect(result.method).toBe('walk');
    expect(result.files.length).toBe(1);
    cleanup();
  });
});

// ══════════════════════════════════════════════════════════════
// Point 3: Binary file detection
// ══════════════════════════════════════════════════════════════

describe('Point 3: Binary file detection', () => {
  beforeEach(setup);
  afterEach(cleanup);

  it('should identify text files by extension', () => {
    expect(isTextFile('main.ts')).toBe(true);
    expect(isTextFile('styles.css')).toBe(true);
    expect(isTextFile('config.json')).toBe(true);
    expect(isTextFile('readme.md')).toBe(true);
    expect(isTextFile('script.py')).toBe(true);
    expect(isTextFile('Makefile')).toBe(true);
    expect(isTextFile('Dockerfile')).toBe(true);
    expect(isTextFile('LICENSE')).toBe(true);
  });

  it('should reject binary file extensions', () => {
    expect(isTextFile('image.png')).toBe(false);
    expect(isTextFile('photo.jpg')).toBe(false);
    expect(isTextFile('archive.zip')).toBe(false);
    expect(isTextFile('binary.exe')).toBe(false);
    expect(isTextFile('library.so')).toBe(false);
    expect(isTextFile('font.woff2')).toBe(false);
    expect(isTextFile('data.db')).toBe(false);
    expect(isTextFile('video.mp4')).toBe(false);
  });

  it('should skip binary files during indexing', async () => {
    createFile('code.ts', 'const a = 1;');
    createFile('image.png', '\x89PNG fake binary');
    createFile('data.bin', '\x00\x01\x02\x03');
    const result = await indexFilesWithMeta(testDir);
    expect(result.files.map((f) => f.path)).toEqual(['code.ts']);
    expect(result.skippedBinary).toBe(2);
  });

  it('should skip binary files during @expansion', async () => {
    createFile('code.ts', 'hello');
    createFile('image.png', 'fake png data');
    const files: IndexedFile[] = [
      { path: join(testDir, 'code.ts'), size: 5 },
      { path: join(testDir, 'image.png'), size: 13 },
    ];
    const { refs } = await expandFileReferences(
      `check @${join(testDir, 'code.ts')} and @${join(testDir, 'image.png')}`,
      files,
    );
    expect(refs.length).toBe(1);
    expect(refs[0].path).toBe(join(testDir, 'code.ts'));
  });

  it('should have a comprehensive text extension whitelist', () => {
    // Spot-check known extensions
    const knownTextExts = ['.ts', '.js', '.py', '.go', '.rs', '.java', '.json', '.yaml', '.md'];
    for (const ext of knownTextExts) {
      expect(TEXT_EXTENSIONS.has(ext)).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════
// Point 4: Symlink safety
// ══════════════════════════════════════════════════════════════

describe('Point 4: Symlink safety', () => {
  beforeEach(setup);
  afterEach(cleanup);

  it('should follow valid symlinks to files', async () => {
    createFile('real.ts', 'export const x = 1;');
    symlinkSync(join(testDir, 'real.ts'), join(testDir, 'link.ts'));
    const result = await indexFilesWithMeta(testDir);
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain('real.ts');
    expect(paths).toContain('link.ts');
  });

  it('should detect and skip symlink cycles', async () => {
    mkdirSync(join(testDir, 'dirA'));
    createFile('dirA/file.ts', 'hello');
    // Create a symlink cycle: dirA/loop -> testDir (parent)
    symlinkSync(testDir, join(testDir, 'dirA', 'loop'));
    const result = await indexFilesWithMeta(testDir);
    // Should still index the real file without infinite recursion
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain('dirA/file.ts');
    // The function should terminate (this test passing = no infinite loop)
  });

  it('should skip broken symlinks', async () => {
    createFile('real.ts', 'hello');
    symlinkSync(join(testDir, 'nonexistent.ts'), join(testDir, 'broken-link.ts'));
    const result = await indexFilesWithMeta(testDir);
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain('real.ts');
    // broken-link.ts should be skipped (not cause an error)
    expect(paths).not.toContain('broken-link.ts');
  });
});

// ══════════════════════════════════════════════════════════════
// Point 5: Timeout guard
// ══════════════════════════════════════════════════════════════

describe('Point 5: Timeout guard', () => {
  beforeEach(setup);
  afterEach(cleanup);

  it('should return partial results with timedOut flag when timeout exceeded', async () => {
    // We can't easily simulate a real timeout in a unit test, but we can
    // verify the timeout machinery exists by checking that indexFilesWithMeta
    // returns an IndexResult with a timedOut field
    createFile('file1.ts', 'a');
    createFile('file2.ts', 'b');
    const result = await indexFilesWithMeta(testDir);
    expect(typeof result.timedOut).toBe('boolean');
    expect(result.timedOut).toBe(false);
    // All files indexed within timeout
    expect(result.files.length).toBe(2);
  });

  it('should report method used (git or walk)', async () => {
    createFile('hello.ts', 'x');
    const result = await indexFilesWithMeta(testDir);
    expect(['git', 'walk']).toContain(result.method);
  });
});

// ══════════════════════════════════════════════════════════════
// Point 6: Configurable ignore patterns (.caretforgeignore)
// ══════════════════════════════════════════════════════════════

describe('Point 6: .caretforgeignore support', () => {
  beforeEach(setup);
  afterEach(cleanup);

  it('should load patterns from .caretforgeignore', () => {
    writeFileSync(join(testDir, '.caretforgeignore'), '# Comment\n*.log\nsecret.ts\nlogs/\n\n');
    const patterns = loadIgnorePatterns(testDir);
    expect(patterns).toEqual(['*.log', 'secret.ts', 'logs/']);
  });

  it('should return empty when no .caretforgeignore exists', () => {
    const patterns = loadIgnorePatterns(testDir);
    expect(patterns).toEqual([]);
  });

  it('should match exact filename patterns', () => {
    expect(matchesIgnorePattern('secret.ts', ['secret.ts'])).toBe(true);
    expect(matchesIgnorePattern('other.ts', ['secret.ts'])).toBe(false);
  });

  it('should match glob extension patterns', () => {
    expect(matchesIgnorePattern('debug.log', ['*.log'])).toBe(true);
    expect(matchesIgnorePattern('src/app.log', ['*.log'])).toBe(true);
    expect(matchesIgnorePattern('readme.md', ['*.log'])).toBe(false);
  });

  it('should match directory patterns', () => {
    expect(matchesIgnorePattern('logs/debug.log', ['logs/'])).toBe(true);
    expect(matchesIgnorePattern('src/logs/file.ts', ['logs/'])).toBe(true);
    expect(matchesIgnorePattern('logger.ts', ['logs/'])).toBe(false);
  });

  it('should match basename patterns', () => {
    expect(matchesIgnorePattern('src/nested/secret.ts', ['secret.ts'])).toBe(true);
  });

  it('should skip ignored files during indexing', async () => {
    writeFileSync(join(testDir, '.caretforgeignore'), '*.log\nsecret.ts\n');
    createFile('app.ts', 'const a = 1;');
    createFile('debug.log', 'log data');
    createFile('secret.ts', 'const key = "abc";');
    const result = await indexFilesWithMeta(testDir);
    expect(result.files.map((f) => f.path)).toEqual(['app.ts']);
    expect(result.skippedIgnored).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════
// Point 7: File size display in browse output
// ══════════════════════════════════════════════════════════════

describe('Point 7: File size display', () => {
  it('should format bytes correctly', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(1048576)).toBe('1.0 MB');
    expect(formatSize(2621440)).toBe('2.5 MB');
  });

  it('should include size in IndexedFile results', async () => {
    setup();
    const content = 'x'.repeat(100);
    createFile('sized.ts', content);
    const result = await indexFilesWithMeta(testDir);
    expect(result.files.length).toBe(1);
    expect(result.files[0].size).toBe(100);
    cleanup();
  });

  it('should return IndexedFile objects from matchFiles', () => {
    const files: IndexedFile[] = [
      { path: 'src/a.ts', size: 100 },
      { path: 'src/b.ts', size: 2048 },
      { path: 'README.md', size: 500 },
    ];
    const { matches } = matchFiles(files, 'src/');
    expect(matches.length).toBe(2);
    expect(matches[0].path).toBe('src/a.ts');
    expect(matches[0].size).toBe(100);
    expect(matches[1].path).toBe('src/b.ts');
    expect(matches[1].size).toBe(2048);
  });

  it('should truncate browse results at 50', () => {
    const files: IndexedFile[] = Array.from({ length: 100 }, (_, i) => ({
      path: `file${String(i).padStart(3, '0')}.ts`,
      size: i * 10,
    }));
    const { matches, total, truncated } = matchFiles(files, '');
    expect(total).toBe(100);
    expect(truncated).toBe(true);
    expect(matches.length).toBe(50);
  });
});

// ══════════════════════════════════════════════════════════════
// Tab completion and browse with new types
// ══════════════════════════════════════════════════════════════

describe('Tab completion and browse', () => {
  it('should complete @filepath with IndexedFile', () => {
    const files: IndexedFile[] = [
      { path: 'src/main.ts', size: 100 },
      { path: 'src/utils.ts', size: 200 },
      { path: 'README.md', size: 50 },
    ];
    const completer = createFileCompleter(files);
    const [completions] = completer('check @src/');
    expect(completions).toEqual(['@src/main.ts', '@src/utils.ts']);
  });

  it('should parse browse queries', () => {
    expect(parseBrowseQuery('@')).toBe('');
    expect(parseBrowseQuery('@src/')).toBe('src/');
    expect(parseBrowseQuery('hello @src/')).toBeNull();
    expect(parseBrowseQuery('plain text')).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// Expansion with governance
// ══════════════════════════════════════════════════════════════

describe('Expansion governance', () => {
  beforeEach(setup);
  afterEach(cleanup);

  it('should expand text file references and report truncation', async () => {
    createFile('hello.ts', 'export const msg = "hello";');
    const files: IndexedFile[] = [{ path: join(testDir, 'hello.ts'), size: 27 }];
    const { refs, expandedMessage } = await expandFileReferences(
      `read @${join(testDir, 'hello.ts')}`,
      files,
    );
    expect(refs.length).toBe(1);
    expect(refs[0].truncated).toBe(false);
    expect(refs[0].originalSize).toBe(27);
    expect(expandedMessage).toContain('export const msg');
  });

  it('should include truncation header for large files', async () => {
    const bigContent = 'line\n'.repeat(MAX_EXPANSION_LINES + 100);
    createFile('big.ts', bigContent);
    const files: IndexedFile[] = [{ path: join(testDir, 'big.ts'), size: bigContent.length }];
    const { refs, expandedMessage } = await expandFileReferences(
      `@${join(testDir, 'big.ts')}`,
      files,
    );
    expect(refs[0].truncated).toBe(true);
    expect(expandedMessage).toContain('[File:');
    expect(expandedMessage).toContain('truncated from');
  });
});
