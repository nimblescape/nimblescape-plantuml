// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/// <reference lib="dom" />

/**
 * The page of the built-in Markdown preview of VS Code, for the tests: the
 * HTML of a document, and the update of the page.
 *
 * The preview renders a document with markdown-it and a rule that gives each
 * block element the line of its source in the attribute `data-line` and the
 * class `code-line`. On a change of the document, the preview renders the
 * document again and changes its page with morphdom, the library that the
 * preview uses (extensions/markdown-language-features/preview-src/index.ts in
 * VS Code). The preview keeps each element that equals its new version: by
 * `isEqualNode`, or by the same tag, text and attributes apart from
 * `data-line` and `open`, with children that are equal by the same rule. It
 * changes the other elements in place where their tags match. After the
 * update, it sends the event `vscode.markdown.updateContent` and adds a copy
 * button to each code block that has none, also to the hidden text of a
 * PlantUML block.
 */

import MarkdownIt from 'markdown-it';
import morphdom from 'morphdom';
import { IncludedFiles } from '../diagram/includes';
import { extendMarkdownIt } from '../markdown/markdownIt';
import { defaultSettings, Settings } from '../settings';

/**
 * renderMarkdown returns the HTML of a Markdown text as the preview writes it, with the plugin of the extension.
 * @param text - The Markdown text.
 * @param settings - The settings of the extension for the document.
 * @param includes - Returns the included files of the text of a block, as the extension reads them; by default, none.
 */
export function renderMarkdown(
  text: string,
  settings: Readonly<Settings> = defaultSettings,
  includes: (source: string) => IncludedFiles | undefined = () => undefined,
): string {
  const md = new MarkdownIt({ html: true });
  md.core.ruler.push('source_lines', (state) => {
    for (const token of state.tokens) {
      if (token.map && token.type !== 'inline') {
        token.attrSet('data-line', String(token.map[0]));
        token.attrJoin('class', 'code-line');
      }
    }
  });
  return extendMarkdownIt(md, () => settings, (_rendering, source) => includes(source)).render(text);
}

/**
 * fence returns a PlantUML block of a Markdown text.
 * @param text - The PlantUML text of the block.
 */
export const fence = (text: string): string => `\`\`\`plantuml\n${text}\n\`\`\`\n`;

/** skippedAttributes are the attributes that the preview does not compare. */
const skippedAttributes = new Set(['open']);

/**
 * equal tells whether the preview keeps an element of its page for its new version.
 * @param current - The element of the page.
 * @param next - The new version of the element.
 */
function equal(current: Element, next: Element): boolean {
  if (current.isEqualNode(next)) {
    return true;
  }
  if (current.tagName !== next.tagName || current.textContent !== next.textContent) {
    return false;
  }
  const attributes = (element: Element) => [...element.attributes].filter(({ name }) => !skippedAttributes.has(name));
  const [before, after] = [attributes(current), attributes(next)];
  const sameAttributes = before.length === after.length &&
    before.every(({ name, value }, index) => name === after[index].name && (value === after[index].value || name === 'data-line'));
  return sameAttributes && current.children.length === next.children.length &&
    [...current.children].every((child, index) => equal(child, next.children[index]));
}

/**
 * addCopyButtons adds a copy button to each code block of a page that has none, as the preview does after it wrote
 * its content.
 * @param root - The element of the content of the page.
 */
export function addCopyButtons(root: HTMLElement): void {
  for (const code of root.querySelectorAll('pre > code')) {
    const block = code.parentElement!;
    if (!block.querySelector('.code-block-copy-button')) {
      const button = root.ownerDocument.createElement('button');
      button.className = 'code-block-copy-button';
      block.append(button);
    }
  }
}

/**
 * updatePreview changes the content of a preview page to new HTML, as the Markdown preview of VS Code does on a
 * change of the document: it sends the event of the preview after the update and adds the copy buttons.
 * @param root - The element of the content of the page, with the class `markdown-body` in the preview.
 * @param html - The new HTML of the content.
 */
export function updatePreview(root: HTMLElement, html: string): void {
  const page = root.ownerDocument;
  const next = page.createElement(root.localName);
  next.innerHTML = html;
  morphdom(root, next, { childrenOnly: true, onBeforeElUpdated: (current, element) => !equal(current, element) });
  page.defaultView!.dispatchEvent(new page.defaultView!.CustomEvent('vscode.markdown.updateContent'));
  addCopyButtons(root);
}
