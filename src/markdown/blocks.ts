// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The PlantUML blocks of a Markdown text, by their lines. The code completion
 * ([R-MD-004](../../docs/requirements.md#r-md-004)) and the formatting
 * ([R-MD-005](../../docs/requirements.md#r-md-005)) of Markdown files work
 * inside these blocks only, and change nothing outside them
 * ([R-MD-006](../../docs/requirements.md#r-md-006)). The module uses no API of
 * VS Code.
 *
 * The blocks come from markdown-it, the parser of the Markdown preview, with
 * the options of the preview and its rule for the front matter of a document.
 * So the editor and the preview agree on the blocks: a fence in an indented
 * code block or in the front matter starts no block, a block in a block quote
 * or in a list item is a block, and a block ends where its block quote or its
 * list item ends. The info string after the opening fence decides whether a
 * block is a PlantUML block, with the same rule as the preview.
 *
 * A line of a block in a block quote or in a list item has a prefix before
 * its PlantUML text: the markers of the block quote, and the indentation of
 * the list item and of the fence. The completion and the formatting keep the
 * prefix as it is.
 */

import MarkdownIt from 'markdown-it';
import type { StateBlock } from 'markdown-it';
import { isPlantUmlInfo } from './markdownIt';

/** Block is a PlantUML block of a Markdown text. */
export interface Block {
  /** start is the index of the first line of the content, the line after the opening fence. */
  start: number;
  /** end is the index of the line after the content: the closing fence, or the line after the end of the block. */
  end: number;
  /** lines are the lines of the PlantUML text of the block, without their prefixes. */
  lines: string[];
  /**
   * prefixes holds the prefix of each line of the content. It is undefined for a line whose PlantUML text is not the
   * end of the Markdown line: markdown-it writes a tab in the indentation of a list item as spaces.
   */
  prefixes: (string | undefined)[];
}

/**
 * isFrontMatterFence tells whether a line of a Markdown text is a fence of the front matter: `---` at the start of
 * the line, with nothing after it but spaces.
 * @param state - The state of the block parser.
 * @param line - The index of the line.
 */
const isFrontMatterFence = (state: StateBlock, line: number): boolean =>
  state.tShift[line] === 0 && state.src.slice(state.bMarks[line], state.eMarks[line]).trimEnd() === '---';

/**
 * frontMatter is a block rule for the front matter of a Markdown document, as the Markdown preview of VS Code has
 * one: the first line is `---`, and the front matter ends with the next line `---`. The preview shows the front
 * matter as a table or as YAML code, never as Markdown.
 * @param state - The state of the block parser.
 * @param startLine - The index of the line where the rule starts.
 * @param endLine - The index of the line after the text.
 * @param silent - Whether the rule only tells whether it matches.
 */
function frontMatter(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  if (startLine !== 0 || !isFrontMatterFence(state, 0)) {
    return false;
  }
  let end = 1;
  while (end < endLine && !isFrontMatterFence(state, end)) {
    end++;
  }
  if (end >= endLine) {
    return false;
  }
  if (!silent) {
    const token = state.push('front_matter', '', 0);
    token.block = true;
    token.map = [startLine, end + 1];
    state.line = end + 1;
  }
  return true;
}

/**
 * parser reads the blocks of a Markdown text as the Markdown preview of VS Code does: with HTML blocks and with
 * front matter. It skips the text inside the blocks (links, emphasis, typography), which no block depends on.
 */
const parser = new MarkdownIt({ html: true });
parser.block.ruler.before('fence', 'front_matter', frontMatter, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
parser.core.ruler.disable(['inline', 'linkify', 'replacements', 'smartquotes', 'text_join']);

/**
 * plantUmlFence matches the opening fence of a PlantUML block anywhere in a text. A text without a match has no
 * PlantUML block, so it needs no parsing.
 */
const plantUmlFence = /(?:`{3,}|~{3,})\s*plantuml/i;

/**
 * plantUmlBlocks returns the PlantUML blocks of a Markdown text.
 * @param lines - The lines of the Markdown text.
 */
export function plantUmlBlocks(lines: readonly string[]): Block[] {
  const text = lines.join('\n');
  if (!plantUmlFence.test(text)) {
    return [];
  }
  return parser
    .parse(text, {})
    .filter((token) => token.type === 'fence' && token.map && isPlantUmlInfo(token.info))
    .map((token) => {
      const start = token.map![0] + 1;
      const content = token.content === '' ? [] : token.content.replace(/\n$/, '').split('\n');
      const prefixes = content.map((line, index) => {
        const markdown = lines[start + index];
        return markdown.endsWith(line) ? markdown.slice(0, markdown.length - line.length) : undefined;
      });
      return { start, end: start + content.length, lines: content, prefixes };
    });
}
