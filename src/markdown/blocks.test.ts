// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check how the code completion finds the PlantUML blocks of a
 * Markdown text (R-MD-004): the fences, the info strings, and the blocks
 * that other blocks contain or that have no closing fence.
 */

import { expect, test } from 'vitest';
import { plantUmlBlocks } from './blocks';

test('finds the content lines of PlantUML blocks with backticks and tildes', () => {
  const lines = ['# Title', '```plantuml', 'class A', '```', 'Text', '~~~ PlantUML {.diagram}', 'class B', 'class C', '~~~'];
  expect(plantUmlBlocks(lines)).toEqual([
    { start: 2, end: 3 },
    { start: 6, end: 8 },
  ]);
});

test('ignores other code blocks, also when they contain a PlantUML fence', () => {
  const lines = ['````markdown', '```plantuml', 'class A', '```', '````', '```js', 'x', '```', '```plantumlx', 'y', '```'];
  expect(plantUmlBlocks(lines)).toEqual([]);
});

test('closes a block only with a fence of the same character that is at least as long', () => {
  const lines = ['````plantuml', '```', '~~~~', '````` ', 'after'];
  expect(plantUmlBlocks(lines)).toEqual([{ start: 1, end: 3 }]);
});

test('runs a block without a closing fence to the end of the text, and accepts indented fences', () => {
  expect(plantUmlBlocks(['- item', '  ```plantuml', '  class A', '  ```', '```plantuml', 'class B'])).toEqual([
    { start: 2, end: 3 },
    { start: 5, end: 6 },
  ]);
});

test('does not open a fence of backticks with a backtick in its info string', () => {
  expect(plantUmlBlocks(['``` plantuml `x`', 'class A', '```'])).toEqual([]);
});
