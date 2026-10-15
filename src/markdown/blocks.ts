// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The PlantUML blocks of a Markdown text, by their lines. The code completion
 * in Markdown files ([R-MD-004](../../docs/requirements.md#r-md-004)) works
 * inside these blocks only, with the lines of the block as its context, and
 * changes nothing outside them ([R-MD-006](../../docs/requirements.md#r-md-006)).
 * The module uses no API of VS Code.
 *
 * A fenced code block starts with a fence of three backticks or tildes or
 * more, and ends with a fence of the same character that is at least as long
 * and has nothing after it, as in CommonMark. A block without its closing
 * fence runs to the end of the text, as markdown-it renders it. The info
 * string after the opening fence decides whether a block is a PlantUML block,
 * with the same rule as the preview.
 */

import { isPlantUmlInfo } from './markdownIt';

/** Block is the range of the lines of the content of a PlantUML block, without its fences. */
export interface Block {
  /** start is the index of the first line of the content. */
  start: number;
  /** end is the index of the line after the content: the closing fence, or the number of lines. */
  end: number;
}

/**
 * plantUmlBlocks returns the PlantUML blocks of a Markdown text.
 * @param lines - The lines of the Markdown text.
 */
export function plantUmlBlocks(lines: readonly string[]): Block[] {
  const blocks: Block[] = [];
  let open: { fence: string; start: number; plantUml: boolean } | undefined;
  for (const [index, line] of lines.entries()) {
    if (!open) {
      const opening = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
      // The info string of a fence of backticks has no backtick.
      if (opening && !(opening[1].startsWith('`') && opening[2].includes('`'))) {
        open = { fence: opening[1], start: index + 1, plantUml: isPlantUmlInfo(opening[2]) };
      }
      continue;
    }
    const closing = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
    if (closing && closing[1][0] === open.fence[0] && closing[1].length >= open.fence.length) {
      if (open.plantUml) {
        blocks.push({ start: open.start, end: index });
      }
      open = undefined;
    }
  }
  if (open?.plantUml) {
    blocks.push({ start: open.start, end: lines.length });
  }
  return blocks;
}
