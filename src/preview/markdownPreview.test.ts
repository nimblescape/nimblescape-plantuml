// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// @vitest-environment happy-dom

/**
 * These tests run the script of the Markdown preview (R-MD-001) on a page of
 * happy-dom with a fake engine. The page changes as the Markdown preview of
 * VS Code changes it, with morphdom: the tests check the first rendering, the
 * rendering after a change of the document, that an unchanged block keeps its
 * diagram, which the renderer neither renders nor draws again, and the
 * rendering after a change of the color theme.
 */

import { expect, test } from 'vitest';
import { contentClass } from '../markdown/markdownIt';
import { FakeEngine } from '../test/fakeEngine';
import { addCopyButtons, fence, renderMarkdown, updatePreview } from '../test/markdownPreview';
import { watchMarkdownPreview } from './markdownPreview';
import { isDarkTheme, PreviewRenderer } from './renderer';

/**
 * open writes the content of a Markdown text into the page as the preview does, and starts the script of the
 * preview with a fake engine.
 * @param text - The Markdown text.
 */
function open(text: string) {
  document.body.className = 'vscode-light';
  document.body.innerHTML = `<div class="markdown-body">${renderMarkdown(text)}</div>`;
  const root = document.querySelector<HTMLElement>('.markdown-body')!;
  addCopyButtons(root);
  const engine = new FakeEngine();
  const renderer = new PreviewRenderer(root, async () => engine, () => isDarkTheme(document.body));
  watchMarkdownPreview(document, renderer);
  /** settle waits until the script has reacted to the changes of the page and every rendering has ended. */
  const settle = async () => {
    for (let turn = 0; turn < 3; turn++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await renderer.whenIdle();
    }
  };
  /** diagrams returns the image of each block of the page. */
  const diagrams = () => [...root.querySelectorAll(`.${contentClass}`)].map((content) => content.shadowRoot?.querySelector('svg'));
  return { root, engine, settle, diagrams };
}

test('renders the blocks when the preview opens, and a changed block after the preview changed its content', async () => {
  const { root, engine, settle, diagrams } = open(`# Title\n\n${fence('A -> B')}\n${fence('C -> D')}`);
  await settle();
  expect(engine.calls).toHaveLength(2);
  const [first, second] = diagrams();
  expect(first?.getAttribute('data-text')).toContain('A -> B');
  expect(second?.getAttribute('data-text')).toContain('C -> D');

  updatePreview(root, renderMarkdown(`# Title\n\n${fence('A -> B')}\n${fence('C -> E')}`));
  // The changed block shows its last diagram while the new one renders.
  expect(diagrams()[1]).toBe(second);
  await settle();
  expect(engine.calls).toHaveLength(3);
  expect(diagrams()[0]).toBe(first);
  expect(diagrams()[1]?.getAttribute('data-text')).toContain('C -> E');
});

test('keeps unchanged blocks with their diagrams, without a new rendering, when the preview writes its content again', async () => {
  const { root, engine, settle, diagrams } = open(`Text\n\n${fence('A -> B')}\n- item\n\n  ${fence('C -> D').replace(/\n(?=.)/g, '\n  ')}`);
  await settle();
  const shown = diagrams();
  expect(shown.every(Boolean)).toBe(true);

  // A changed paragraph, and new lines above the blocks, which change their line numbers.
  updatePreview(root, renderMarkdown(`Other text\nin two lines\n\n${fence('A -> B')}\n- item\n\n  ${fence('C -> D').replace(/\n(?=.)/g, '\n  ')}`));
  await settle();
  expect(diagrams()).toEqual(shown);
  expect(diagrams().every((svg, index) => svg === shown[index])).toBe(true);
  expect(engine.calls).toHaveLength(2);
});

test('renders the blocks again for a dark background when the color theme changes', async () => {
  const { engine, settle, diagrams } = open(fence('A -> B'));
  await settle();
  document.body.className = 'vscode-dark';
  await settle();
  expect(engine.calls.map((call) => call.options?.dark)).toEqual([false, true]);
  expect(diagrams()[0]?.getAttribute('data-dark')).toBe('true');
});
