import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAllTools } from '../src/tools/schema.js';
import { executeReadFile } from '../src/tools/readFile.js';
import { executeWriteFile } from '../src/tools/writeFile.js';
import { executeEditFile } from '../src/tools/editFile.js';
import { executeShell } from '../src/tools/execShell.js';
import { join } from 'node:path';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

describe('getAllTools', () => {
  it('returns all four tools', () => {
    const tools = getAllTools();
    expect(tools).toHaveLength(4);
    const names = tools.map((t) => t.function.name);
    expect(names).toContain('read_file');
    expect(names).toContain('write_file');
    expect(names).toContain('edit_file');
    expect(names).toContain('exec_shell');
  });
});

describe('executeReadFile', () => {
  it('reads an existing file', async () => {
    const content = await executeReadFile({ path: 'package.json' });
    expect(content).toContain('caretforge');
  });

  it('throws for missing file', async () => {
    await expect(executeReadFile({ path: '/nonexistent-file-xyz' })).rejects.toThrow(
      'Failed to read file',
    );
  });
});

describe('executeWriteFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'caretforge-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('writes a file and reports success', async () => {
    const target = join(tmpDir, 'hello.txt');
    const result = await executeWriteFile({ path: target, content: 'hello world' });
    expect(result).toContain('Wrote');
    expect(result).toContain(target);
  });

  it('creates parent directories', async () => {
    const target = join(tmpDir, 'a', 'b', 'c.txt');
    const result = await executeWriteFile({ path: target, content: 'nested' });
    expect(result).toContain('Wrote');
  });
});

describe('executeEditFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'caretforge-edit-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('replaces a single occurrence and reports success', async () => {
    const target = join(tmpDir, 'file.txt');
    await writeFile(target, 'hello world\nfoo bar\n', 'utf-8');
    const result = await executeEditFile({
      path: target,
      old_string: 'foo bar',
      new_string: 'baz qux',
    });
    expect(result).toContain('Edited');
    expect(result).toContain('replaced 1 occurrence');
    const content = await readFile(target, 'utf-8');
    expect(content).toBe('hello world\nbaz qux\n');
  });

  it('preserves the rest of the file unchanged', async () => {
    const target = join(tmpDir, 'preserve.txt');
    const original = 'line1\nline2\nTARGET\nline4\nline5\n';
    await writeFile(target, original, 'utf-8');
    await executeEditFile({
      path: target,
      old_string: 'TARGET',
      new_string: 'REPLACED',
    });
    const content = await readFile(target, 'utf-8');
    expect(content).toBe('line1\nline2\nREPLACED\nline4\nline5\n');
  });

  it('throws when old_string is not found', async () => {
    const target = join(tmpDir, 'notfound.txt');
    await writeFile(target, 'hello world\n', 'utf-8');
    await expect(
      executeEditFile({
        path: target,
        old_string: 'does not exist',
        new_string: 'replacement',
      }),
    ).rejects.toThrow('old_string not found');
  });

  it('throws when old_string matches multiple locations without replace_all', async () => {
    const target = join(tmpDir, 'multi.txt');
    await writeFile(target, 'aaa\nbbb\naaa\n', 'utf-8');
    await expect(
      executeEditFile({
        path: target,
        old_string: 'aaa',
        new_string: 'ccc',
      }),
    ).rejects.toThrow('matches 2 locations');
  });

  it('replaces all occurrences with replace_all: true', async () => {
    const target = join(tmpDir, 'replaceall.txt');
    await writeFile(target, 'aaa\nbbb\naaa\nccc\naaa\n', 'utf-8');
    const result = await executeEditFile({
      path: target,
      old_string: 'aaa',
      new_string: 'zzz',
      replace_all: true,
    });
    expect(result).toContain('replaced 3 occurrence');
    const content = await readFile(target, 'utf-8');
    expect(content).toBe('zzz\nbbb\nzzz\nccc\nzzz\n');
  });

  it('handles multi-line old_string', async () => {
    const target = join(tmpDir, 'multiline.txt');
    await writeFile(target, 'start\nfoo\nbar\nend\n', 'utf-8');
    await executeEditFile({
      path: target,
      old_string: 'foo\nbar',
      new_string: 'replaced',
    });
    const content = await readFile(target, 'utf-8');
    expect(content).toBe('start\nreplaced\nend\n');
  });

  it('throws for a nonexistent file', async () => {
    await expect(
      executeEditFile({
        path: join(tmpDir, 'nope.txt'),
        old_string: 'x',
        new_string: 'y',
      }),
    ).rejects.toThrow('Failed to read file');
  });

  it('reports line count changes', async () => {
    const target = join(tmpDir, 'lines.txt');
    await writeFile(target, 'one\ntwo\nthree\n', 'utf-8');
    const result = await executeEditFile({
      path: target,
      old_string: 'two',
      new_string: 'two-a\ntwo-b\ntwo-c',
    });
    expect(result).toContain('+2 lines');
  });
});

describe('executeShell', () => {
  it('captures stdout and exit code', async () => {
    const result = await executeShell({ command: 'echo hello' });
    const parsed = JSON.parse(result);
    expect(parsed.stdout).toBe('hello');
    expect(parsed.exitCode).toBe(0);
  });

  it('captures stderr', async () => {
    const result = await executeShell({ command: 'echo err >&2' });
    const parsed = JSON.parse(result);
    expect(parsed.stderr).toBe('err');
  });

  it('handles failing commands', async () => {
    const result = await executeShell({ command: 'exit 42' });
    const parsed = JSON.parse(result);
    expect(parsed.exitCode).toBe(42);
  });
});
