import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ToolError } from '../util/errors.js';

export interface EditFileArgs {
  path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

/**
 * Count non-overlapping occurrences of `needle` in `haystack`.
 */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

/**
 * Build a short context snippet around the first replacement site.
 * Shows up to 3 lines before and after the change.
 */
function buildDiffPreview(
  original: string,
  newContent: string,
  oldString: string,
  newString: string,
): string {
  const CONTEXT_LINES = 3;

  // Find which line the first replacement starts on
  const pos = original.indexOf(oldString);
  if (pos === -1) return '';

  const beforeReplace = original.slice(0, pos);
  const startLine = beforeReplace.split('\n').length - 1;

  const oldLines = oldString.split('\n');
  const newLines = newString.split('\n');

  const allNewLines = newContent.split('\n');
  const contextStart = Math.max(0, startLine - CONTEXT_LINES);
  const contextEnd = Math.min(allNewLines.length, startLine + newLines.length + CONTEXT_LINES);

  const parts: string[] = [];

  // Show removed lines
  const origAllLines = original.split('\n');
  const oldEnd = Math.min(origAllLines.length, startLine + oldLines.length + CONTEXT_LINES);
  const oldContextStart = Math.max(0, startLine - CONTEXT_LINES);

  parts.push('  --- before');
  for (let i = oldContextStart; i < oldEnd; i++) {
    const prefix =
      i >= startLine && i < startLine + oldLines.length ? chalk_red_prefix : chalk_dim_prefix;
    parts.push(`  ${prefix}${origAllLines[i]}`);
  }

  parts.push('  +++ after');
  for (let i = contextStart; i < contextEnd; i++) {
    const prefix =
      i >= startLine && i < startLine + newLines.length ? chalk_green_prefix : chalk_dim_prefix;
    parts.push(`  ${prefix}${allNewLines[i]}`);
  }

  return parts.join('\n');
}

// Simple prefixes for diff display (no chalk dependency in tool layer)
const chalk_red_prefix = '- ';
const chalk_green_prefix = '+ ';
const chalk_dim_prefix = '  ';

/**
 * Edit a file by finding and replacing exact string matches.
 * Permission checking is handled by the agent loop before this function is called.
 */
export async function executeEditFile(args: EditFileArgs): Promise<string> {
  const target = resolve(args.path);
  const { old_string, new_string, replace_all } = args;

  // Read the existing file
  let content: string;
  try {
    content = await readFile(target, 'utf-8');
  } catch (err) {
    throw new ToolError(`Failed to read file "${target}": ${(err as Error).message}`, err as Error);
  }

  // Count occurrences
  const count = countOccurrences(content, old_string);

  if (count === 0) {
    throw new ToolError(
      `old_string not found in "${target}". Make sure the text matches exactly, including whitespace and indentation.`,
    );
  }

  if (count > 1 && !replace_all) {
    throw new ToolError(
      `old_string matches ${count} locations in "${target}". Provide more surrounding context to uniquely identify the edit, or set replace_all to true.`,
    );
  }

  // Perform replacement
  let newContent: string;
  let replacements: number;
  if (replace_all) {
    newContent = content.split(old_string).join(new_string);
    replacements = count;
  } else {
    // Replace only the first occurrence
    const pos = content.indexOf(old_string);
    newContent = content.slice(0, pos) + new_string + content.slice(pos + old_string.length);
    replacements = 1;
  }

  // Write back
  try {
    await writeFile(target, newContent, 'utf-8');
  } catch (err) {
    throw new ToolError(
      `Failed to write file "${target}": ${(err as Error).message}`,
      err as Error,
    );
  }

  // Build summary
  const oldLineCount = content.split('\n').length;
  const newLineCount = newContent.split('\n').length;
  const lineDelta = newLineCount - oldLineCount;
  const lineDeltaStr =
    lineDelta === 0
      ? 'no line count change'
      : lineDelta > 0
        ? `+${lineDelta} line${lineDelta !== 1 ? 's' : ''}`
        : `${lineDelta} line${lineDelta !== -1 ? 's' : ''}`;

  const preview = buildDiffPreview(content, newContent, old_string, new_string);
  const summary = `Edited ${target}: replaced ${replacements} occurrence${replacements !== 1 ? 's' : ''} (${lineDeltaStr})`;

  return preview ? `${summary}\n${preview}` : summary;
}
