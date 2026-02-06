import { describe, it, expect } from 'vitest';
import { getEnabledTools } from '../src/tools/schema.js';
import { executeWriteFile } from '../src/tools/writeFile.js';
import { executeShell } from '../src/tools/execShell.js';

describe('getEnabledTools', () => {
  it('always includes read_file', () => {
    const tools = getEnabledTools({ allowWrite: false, allowShell: false });
    expect(tools).toHaveLength(1);
    expect(tools[0]?.function.name).toBe('read_file');
  });

  it('includes write_file when allowed', () => {
    const tools = getEnabledTools({ allowWrite: true, allowShell: false });
    expect(tools).toHaveLength(2);
    expect(tools.some((t) => t.function.name === 'write_file')).toBe(true);
  });

  it('includes exec_shell when allowed', () => {
    const tools = getEnabledTools({ allowWrite: false, allowShell: true });
    expect(tools).toHaveLength(2);
    expect(tools.some((t) => t.function.name === 'exec_shell')).toBe(true);
  });

  it('includes all tools when both flags are set', () => {
    const tools = getEnabledTools({ allowWrite: true, allowShell: true });
    expect(tools).toHaveLength(3);
  });
});

describe('executeWriteFile guard', () => {
  it('throws when writing is not allowed', async () => {
    await expect(
      executeWriteFile({ path: '/tmp/test.txt', content: 'hello' }, false),
    ).rejects.toThrow('File writing is disabled');
  });
});

describe('executeShell guard', () => {
  it('throws when shell is not allowed', async () => {
    await expect(executeShell({ command: 'echo hello' }, false)).rejects.toThrow(
      'Shell execution is disabled',
    );
  });
});
