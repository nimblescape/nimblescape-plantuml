// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check how the code completion and the formatting find the
 * PlantUML blocks of a Markdown text (R-MD-004, R-MD-005): the fences and
 * their info strings, and the structure of Markdown, in which the editor
 * agrees with the preview: indented code, block quotes, list items, HTML
 * blocks and the front matter of a document.
 */

import MarkdownIt from 'markdown-it';
import { expect, test } from 'vitest';
import { plantUmlBlocks } from './blocks';
import { blockClass, extendMarkdownIt } from './markdownIt';

/**
 * block returns a block whose lines have no prefix.
 * @param start - The index of the first line of the content.
 * @param lines - The lines of the content.
 */
const block = (start: number, lines: string[]) => ({ start, end: start + lines.length, lines, prefixes: lines.map(() => '') });

test('finds the content lines of PlantUML blocks with backticks and tildes', () => {
  const lines = ['# Title', '```plantuml', 'class A', '```', 'Text', '~~~ PlantUML {.diagram}', 'class B', 'class C', '~~~'];
  expect(plantUmlBlocks(lines)).toEqual([block(2, ['class A']), block(6, ['class B', 'class C'])]);
});

test('ignores other code blocks, also when they contain a PlantUML fence', () => {
  const lines = ['````markdown', '```plantuml', 'class A', '```', '````', '```js', 'x', '```', '```plantumlx', 'y', '```'];
  expect(plantUmlBlocks(lines)).toEqual([]);
});

test('closes a block only with a fence of the same character that is at least as long, and indented less than four spaces', () => {
  expect(plantUmlBlocks(['````plantuml', '```', '~~~~', '````` ', 'after'])).toEqual([block(1, ['```', '~~~~'])]);
  expect(plantUmlBlocks(['```plantuml', 'A', '    ```', 'B', '```'])).toEqual([block(1, ['A', '    ```', 'B'])]);
});

test('runs a block without a closing fence to the end of the text', () => {
  expect(plantUmlBlocks(['```plantuml', 'class B'])).toEqual([block(1, ['class B'])]);
});

test('does not open a fence of backticks with a backtick in its info string', () => {
  expect(plantUmlBlocks(['``` plantuml `x`', 'class A', '```'])).toEqual([]);
});

test('finds blocks in list items and block quotes, with the prefix of each line, and ends them with their container', () => {
  expect(plantUmlBlocks(['- item', '  ```plantuml', '  class A', '  ```'])).toEqual([
    { start: 2, end: 3, lines: ['class A'], prefixes: ['  '] },
  ]);
  expect(plantUmlBlocks(['> ```plantuml', '> A -> B', '>', '>     class C', '> ```', 'after'])).toEqual([
    { start: 1, end: 4, lines: ['A -> B', '', '    class C'], prefixes: ['> ', '>', '> '] },
  ]);
  expect(plantUmlBlocks(['> - item', '>   ```plantuml', '>   A', '>   ```'])).toEqual([{ start: 2, end: 3, lines: ['A'], prefixes: ['>   '] }]);

  // A list item ends at a line with less indentation, and its block ends with it.
  expect(plantUmlBlocks(['- item', '  ```plantuml', '  A -> B', 'Paragraph', 'class X'])).toEqual([
    { start: 2, end: 3, lines: ['A -> B'], prefixes: ['  '] },
  ]);

  // markdown-it writes a tab in the indentation of a list item as spaces, so the prefix of the line is not known.
  expect(plantUmlBlocks(['- item', '', '  ```plantuml', '\tclass B', '  ```'])).toEqual([
    { start: 3, end: 4, lines: ['  class B'], prefixes: [undefined] },
  ]);
});

test('finds no block in indented code, in an HTML block or in the front matter, as the preview shows them', () => {
  expect(plantUmlBlocks(['Text', '', '    ```plantuml', '    A -> B', '    ```'])).toEqual([]);
  expect(plantUmlBlocks(['<div>', '```plantuml', 'A', '```', '</div>', '', '```plantuml', 'B', '```'])).toEqual([block(7, ['B'])]);
  expect(plantUmlBlocks(['---', 'a: |', '  ```plantuml', '  A', '  ```', '---', '```plantuml', 'B', '```'])).toEqual([block(7, ['B'])]);
});

test('finds the blocks that the preview renders as diagrams', () => {
  const md = extendMarkdownIt(new MarkdownIt({ html: true }));
  const texts = [
    ['> ```plantuml', '> A', '> ```'],
    ['- a', '', '  ```plantuml', '  A', '  ```'],
    ['    ```plantuml', '    A', '    ```'],
    ['<div>', '```plantuml', 'A', '```', '</div>'],
    ['```` plantuml', '```', '````'],
    ['~~~ plantuml `x`', 'A', '~~~'],
    ['``` plantuml `x`', 'A', '```'],
  ];
  for (const lines of texts) {
    const rendered = md.render(lines.join('\n')).split(`class="${blockClass}"`).length - 1;
    expect(plantUmlBlocks(lines), lines.join('\n')).toHaveLength(rendered);
  }
});
