import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAllTools } from '../src/tools/schema.js';
import { executeReadFile } from '../src/tools/readFile.js';
import { executeWriteFile } from '../src/tools/writeFile.js';
import { executeShell } from '../src/tools/execShell.js';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

describe('getAllTools', () => {
  it('always returns all three tools', () => {
    const tools = getAllTools();
    expect(tools).toHaveLength(3);
    const names = tools.map((t) => t.function.name);
    expect(names).toContain('read_file');
    expect(names).toContain('write_file');
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
