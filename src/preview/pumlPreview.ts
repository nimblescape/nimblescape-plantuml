// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/// <reference lib="dom" />

/**
 * The script of the preview of PlantUML files
 * ([R-PUML-002](../../docs/requirements.md#r-puml-002),
 * [R-PUML-003](../../docs/requirements.md#r-puml-003)) and of their rendered
 * diff ([R-PUML-004](../../docs/requirements.md#r-puml-004)). The extension
 * sends the text of the file, the files that its diagrams include
 * ([R-GEN-008](../../docs/requirements.md#r-gen-008)) and the settings in a
 * message; the script writes one block for each diagram of the file and
 * renders the blocks with the renderer of `src/preview/renderer.ts`. For a
 * rendered diff, the message also has the original text with its included
 * files, and the script writes one row for each diagram: the original diagram
 * on the left, the modified one on the right, with a colored mark and a label
 * (Changed, Added, Removed) on the changed side. A diagram whose included
 * files changed counts as changed. The page allows WebAssembly, so the
 * diagrams use the Graphviz layout of Viz.js.
 *
 * A diagram is never wider than its column. A click on a diagram that the
 * column makes smaller shows it in its original size, and the column then
 * scrolls; a second click fits it to the column again. A click on a link of a
 * diagram (`[[…]]`) opens the link, as VS Code opens the links of a webview,
 * and keeps the size.
 *
 * The script reuses the blocks from one message to the next, so that the page
 * keeps its scroll position and shows the unchanged diagrams at once while
 * the user types.
 */

import { diagramsOf } from '../diagram/diagramRanges';
import { expandWith, IncludedFiles } from '../diagram/includes';
import { blockClass, contentClass, includesClass, settingsAttribute, sourceAttribute, textClass } from '../markdown/markdownIt';
import { isDefault, Settings } from '../settings';
import { pageRenderer } from './renderer';

/** UpdateMessage is the message of the extension with the text of the file and the settings. */
export interface UpdateMessage {
  type: 'update';
  /** text is the text of the PlantUML file; in a rendered diff, its modified text. */
  text: string;
  /** original is the original text of the file in a rendered diff. */
  original?: string;
  /** includes are the files that the diagrams of the text include, if they include any. */
  includes?: IncludedFiles;
  /** originalIncludes are the files that the diagrams of the original text include, if they include any. */
  originalIncludes?: IncludedFiles;
  /** settings are the settings of the extension for the file. */
  settings: Settings;
  /** state is the state that the page keeps for the extension, for example the address of the file. */
  state?: unknown;
}

/** emptyClass is the class of the message that the page shows for a file without a diagram. */
export const emptyClass = `${blockClass}-empty`;

/** rowClass is the class of a row of a rendered diff; a second class `${rowClass}-<change>` names its change. */
export const rowClass = `${blockClass}-row`;

/** sideClass is the class of the original (first) and the modified (second) side of a row of a rendered diff. */
export const sideClass = `${blockClass}-side`;

/** labelClass is the class of the label that names the change of a side of a row of a rendered diff. */
export const labelClass = `${blockClass}-change`;

/**
 * wideClass is the class of a block whose diagram is wider than its column, so that the column makes it smaller. The
 * pointer then shows that a click changes the size.
 */
export const wideClass = `${blockClass}-wide`;

/** originalSizeClass is the class of a block that shows its diagram in its original size instead of the width of the column. */
export const originalSizeClass = `${blockClass}-original-size`;

/** Change is the change of a diagram from the original to the modified text. */
export type Change = 'unchanged' | 'modified' | 'added' | 'removed';

/** DiffRow is a row of a rendered diff: a diagram of the original text, of the modified text, or of both. */
export interface DiffRow<Item = string> {
  original?: Item;
  modified?: Item;
  change: Change;
}

/**
 * diagramSources returns the texts of the diagrams of a PlantUML file. A diagram runs from a line that starts with
 * `@start` to the next line that starts with `@end`, or to the end of the file (`src/diagram/diagramRanges.ts`). A
 * text without such lines is the body of one diagram. Blank text has no diagram.
 * @param text - The text of the file.
 */
export function diagramSources(text: string): string[] {
  return diagramsOf(text)
    .map((diagram) => diagram.text)
    .filter((source) => source.trim() !== '');
}

/**
 * diffRows pairs the diagrams of two versions of a file. Equal diagrams pair as unchanged, along the longest
 * common sequence of equal diagrams. Between two unchanged pairs, the other diagrams of both versions pair in their
 * order as modified; the rest are removed from the original or added in the modified version.
 * @param original - The diagrams of the original text.
 * @param modified - The diagrams of the modified text.
 * @param keyOf - Returns the text that two equal diagrams share; by default, the diagram itself.
 */
export function diffRows<Item = string>(
  original: readonly Item[],
  modified: readonly Item[],
  keyOf: (item: Item) => unknown = (item) => item,
): DiffRow<Item>[] {
  const [originalKeys, modifiedKeys] = [original.map(keyOf), modified.map(keyOf)];
  const equal = (i: number, j: number) => originalKeys[i] === modifiedKeys[j];
  // common[i][j] is the length of the longest common sequence of original.slice(i) and modified.slice(j).
  const common = Array.from({ length: original.length + 1 }, () => new Array<number>(modified.length + 1).fill(0));
  for (let i = original.length - 1; i >= 0; i--) {
    for (let j = modified.length - 1; j >= 0; j--) {
      common[i][j] = equal(i, j) ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }
  const rows: DiffRow<Item>[] = [];
  let removed: Item[] = [];
  let added: Item[] = [];
  const pairChanges = () => {
    for (let index = 0; index < Math.max(removed.length, added.length); index++) {
      if (index < removed.length && index < added.length) {
        rows.push({ original: removed[index], modified: added[index], change: 'modified' });
      } else if (index < removed.length) {
        rows.push({ original: removed[index], change: 'removed' });
      } else {
        rows.push({ modified: added[index], change: 'added' });
      }
    }
    removed = [];
    added = [];
  };
  let i = 0;
  let j = 0;
  while (i < original.length || j < modified.length) {
    if (i < original.length && j < modified.length && equal(i, j)) {
      pairChanges();
      rows.push({ original: original[i++], modified: modified[j++], change: 'unchanged' });
    } else if (j === modified.length || (i < original.length && common[i + 1][j] >= common[i][j + 1])) {
      removed.push(original[i++]);
    } else {
      added.push(modified[j++]);
    }
  }
  pairChanges();
  return rows;
}

/**
 * labels are the labels of the original and the modified side of a row of a rendered diff, by the change of the row.
 * They name the change that the color of the side shows.
 */
const labels: Readonly<Record<Change, readonly (string | undefined)[]>> = {
  unchanged: [],
  modified: ['Changed', 'Changed'],
  removed: ['Removed'],
  added: [undefined, 'Added'],
};

/**
 * setAttribute sets an attribute of an element, or removes it for undefined.
 * @param element - The element.
 * @param name - The name of the attribute.
 * @param value - The value.
 */
function setAttribute(element: HTMLElement, name: string, value: string | undefined): void {
  if (value === undefined) {
    element.removeAttribute(name);
  } else if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

/**
 * showIncludes writes the included files of a block into its hidden child element, as the markdown-it plugin writes
 * them, or removes that element.
 * @param block - The element of the block.
 * @param includes - The included files as JSON text, or undefined for none.
 */
function showIncludes(block: HTMLElement, includes: string | undefined): void {
  let element = block.querySelector<HTMLElement>(`:scope > .${includesClass}`);
  if (includes === undefined) {
    element?.remove();
    return;
  }
  if (!element) {
    element = block.ownerDocument.createElement('div');
    element.className = includesClass;
    element.hidden = true;
    block.append(element);
  }
  if (element.textContent !== includes) {
    element.textContent = includes;
  }
}

/**
 * showBlock writes a diagram, its included files and the settings into a block, and the text of the diagram into
 * the element that the renderer shows below the message of an error.
 * @param block - The element of the block.
 * @param source - The text of the diagram.
 * @param settings - The settings.
 * @param includes - The included files of the text of the diagram as JSON text, or undefined for none.
 */
function showBlock(block: HTMLElement, source: string, settings: Settings, includes: string | undefined): void {
  block.setAttribute(sourceAttribute, source);
  setAttribute(block, settingsAttribute, isDefault(settings) ? undefined : JSON.stringify(settings));
  showIncludes(block, includes);
  const code = block.querySelector(`:scope > .${contentClass} > .${textClass} > code`);
  if (code && code.textContent !== source) {
    code.textContent = source;
  }
}

/**
 * newBlock returns a new element of a block, with a content element that holds the text of the diagram, as the
 * markdown-it plugin writes a block into a Markdown preview.
 * @param page - The document of the page.
 */
function newBlock(page: Document): HTMLElement {
  const block = page.createElement('div');
  block.className = blockClass;
  const content = page.createElement('div');
  content.className = contentClass;
  const text = page.createElement('pre');
  text.className = textClass;
  text.append(page.createElement('code'));
  content.append(text);
  block.append(content);
  return block;
}

/**
 * showLabel writes the label of a side of a row of a rendered diff before its block, or removes it.
 * @param cell - The element of the side.
 * @param label - The label, or undefined for none.
 */
function showLabel(cell: HTMLElement, label: string | undefined): void {
  let element = cell.querySelector<HTMLElement>(`:scope > .${labelClass}`);
  if (label === undefined) {
    element?.remove();
    return;
  }
  if (!element) {
    element = cell.ownerDocument.createElement('div');
    element.className = labelClass;
    cell.prepend(element);
  }
  element.textContent = label;
}

/**
 * showEmpty shows the message for a file without a diagram when a text has no diagram, and removes it else.
 * @param container - The element of the blocks.
 * @param empty - Tells whether the text has no diagram.
 */
function showEmpty(container: HTMLElement, empty: boolean): void {
  const message = container.querySelector<HTMLElement>(`:scope > .${emptyClass}`);
  if (empty && !message) {
    const element = container.ownerDocument.createElement('p');
    element.className = emptyClass;
    element.textContent = 'The file has no diagram.';
    container.append(element);
  } else if (!empty) {
    message?.remove();
  }
}

/**
 * showDiagrams writes one block for each diagram of a text into a container, and reuses the blocks that exist.
 * @param container - The element of the blocks.
 * @param message - The message with the text and the settings.
 */
export function showDiagrams(container: HTMLElement, message: UpdateMessage): void {
  const sources = diagramSources(message.text);
  const includes = message.includes && JSON.stringify(message.includes);
  const blocks = [...container.querySelectorAll<HTMLElement>(`:scope > .${blockClass}`)];
  sources.forEach((source, index) => {
    let block = blocks[index];
    if (!block) {
      block = newBlock(container.ownerDocument);
      container.append(block);
    }
    showBlock(block, source, message.settings, includes);
  });
  blocks.slice(sources.length).forEach((block) => block.remove());
  showEmpty(container, sources.length === 0);
}

/** DiffDiagram is a diagram of a side of a rendered diff, with the text that the engine renders for it. */
interface DiffDiagram {
  source: string;
  rendered: string;
}

/**
 * diffDiagrams returns the diagrams of a side of a rendered diff, each with the text that the engine renders: with
 * the texts of its included files.
 * @param text - The text of the side.
 * @param files - The included files of the side.
 */
const diffDiagrams = (text: string, files: IncludedFiles | undefined): DiffDiagram[] =>
  diagramSources(text).map((source) => ({ source, rendered: expandWith(source, files)?.lines.join('\n') ?? source }));

/**
 * showDiff writes one row for each diagram of a rendered diff into a container, and reuses the rows that exist.
 * The class of a row names its change, a label names the change of each changed side in words, and an empty side
 * has no block. Two diagrams are equal when the engine renders the same text for them, with their included files.
 * @param container - The element of the rows.
 * @param message - The message with the original and the modified text, their included files and the settings.
 */
export function showDiff(container: HTMLElement, message: UpdateMessage & { original: string }): void {
  const page = container.ownerDocument;
  const sides = [message.original, message.text];
  const files = [message.originalIncludes, message.includes];
  const includes = files.map((side) => side && JSON.stringify(side));
  const rows = diffRows(diffDiagrams(sides[0], files[0]), diffDiagrams(sides[1], files[1]), (diagram) => diagram.rendered);
  const elements = [...container.querySelectorAll<HTMLElement>(`:scope > .${rowClass}`)];
  rows.forEach((row, index) => {
    let element = elements[index];
    if (!element) {
      element = page.createElement('div');
      for (let side = 0; side < 2; side++) {
        const cell = page.createElement('div');
        cell.className = sideClass;
        element.append(cell);
      }
      container.append(element);
    }
    element.className = `${rowClass} ${rowClass}-${row.change}`;
    [row.original, row.modified].forEach((diagram, side) => {
      const cell = element.children[side] as HTMLElement;
      showLabel(cell, labels[row.change][side]);
      let block = cell.querySelector<HTMLElement>(`:scope > .${blockClass}`);
      if (diagram === undefined) {
        block?.remove();
        return;
      }
      if (!block) {
        block = newBlock(page);
        cell.append(block);
      }
      showBlock(block, diagram.source, message.settings, includes[side]);
    });
  });
  elements.slice(rows.length).forEach((element) => element.remove());
  showEmpty(container, rows.length === 0);
}

/**
 * diagramOf returns the image of a diagram that an event of the pointer happened on, in the shadow root of a block.
 * @param event - The event.
 */
function diagramOf(event: Event): Element | undefined {
  return event
    .composedPath()
    .find((target): target is Element => target instanceof Element && (target.getAttribute('part') ?? '').split(' ').includes('diagram'));
}

/**
 * isOnLink tells whether an event of the pointer happened on a link, for example a link of a diagram (`[[…]]`).
 * @param event - The event.
 */
const isOnLink = (event: Event): boolean => event.composedPath().some((target) => target instanceof Element && target.localName === 'a');

/**
 * blockOf returns the block of the image of a diagram: the block of the content element that holds its shadow root.
 * @param diagram - The image of the diagram.
 */
function blockOf(diagram: Element): HTMLElement | null {
  const root = diagram.getRootNode();
  return root instanceof ShadowRoot ? root.host.closest<HTMLElement>(`.${blockClass}`) : null;
}

/**
 * isWide tells whether the image of a diagram is wider than the column of its block: the engine writes the original
 * width into the attribute `width`, and the content element is as wide as the column.
 * @param diagram - The image of the diagram.
 */
function isWide(diagram: Element): boolean {
  const root = diagram.getRootNode();
  return root instanceof ShadowRoot && Number.parseFloat(diagram.getAttribute('width') ?? '') > root.host.clientWidth;
}

/**
 * zoomOnClick lets a click on a diagram that is wider than its column switch its block between the width of the
 * column and the original size. A click on a link of the diagram changes nothing, because it opens the link. A block
 * keeps its size while its diagram changes, because the page reuses the blocks.
 * @param container - The element of the blocks.
 */
export function zoomOnClick(container: HTMLElement): void {
  // The width of the column changes with the size of the page, so the pointer checks it on each diagram that it enters.
  container.addEventListener('pointerover', (event) => {
    const diagram = diagramOf(event);
    if (diagram) {
      blockOf(diagram)?.classList.toggle(wideClass, isWide(diagram));
    }
  });
  container.addEventListener('click', (event) => {
    if (isOnLink(event)) {
      return;
    }
    const diagram = diagramOf(event);
    const block = diagram && blockOf(diagram);
    if (block && (block.classList.contains(originalSizeClass) || isWide(diagram))) {
      block.classList.toggle(originalSizeClass);
    }
  });
}

/** VsCodeApi is the part of the API of the webview of VS Code that the page uses. */
interface VsCodeApi {
  postMessage(message: unknown): void;
  setState(state: unknown): void;
}

/**
 * start renders the diagrams of the messages of the extension, and renders again when the color theme changes.
 * The page tells the extension that it is ready, so that the extension sends the first text only when the page
 * can receive it.
 */
function start(): void {
  const vscode = (globalThis as unknown as { acquireVsCodeApi(): VsCodeApi }).acquireVsCodeApi();
  const container = document.getElementById('diagrams') ?? document.body;
  const renderer = pageRenderer(container, new URL('./engine/', import.meta.url).href);
  zoomOnClick(container);
  window.addEventListener('message', (event: MessageEvent<UpdateMessage>) => {
    if (event.data?.type === 'update') {
      const { data } = event;
      if (typeof data.original === 'string') {
        showDiff(container, { ...data, original: data.original });
      } else {
        showDiagrams(container, data);
      }
      vscode.setState(data.state);
      renderer.update();
    }
  });
  // VS Code changes the class of the body when the color theme changes.
  new MutationObserver(() => renderer.update()).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  vscode.postMessage({ type: 'ready' });
}

// The tests import this module without a preview page.
if (typeof document !== 'undefined' && document.getElementById('diagrams')) {
  start();
}
