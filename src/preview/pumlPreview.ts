// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/// <reference lib="dom" />

/**
 * The script of the preview of PlantUML files
 * ([R-PUML-002](../../docs/requirements.md#r-puml-002),
 * [R-PUML-003](../../docs/requirements.md#r-puml-003)) and of their rendered
 * diff ([R-PUML-004](../../docs/requirements.md#r-puml-004)). The extension
 * sends the text of the file and the settings in a message; the script writes
 * one block for each diagram of the file and renders the blocks with the
 * renderer of `src/preview/renderer.ts`. For a rendered diff, the message also
 * has the original text, and the script writes one row for each diagram: the
 * original diagram on the left, the modified one on the right, with a mark on
 * the changed side. The page allows WebAssembly, so the diagrams use the
 * Graphviz layout of Viz.js.
 *
 * The script reuses the blocks from one message to the next, so that the page
 * keeps its scroll position and shows the unchanged diagrams at once while
 * the user types.
 */

import { blockClass, settingsAttribute, sourceAttribute } from '../markdown/markdownIt';
import { isDefault, Settings } from '../settings';
import { engineLoader, isDarkTheme, PreviewRenderer } from './renderer';

/** UpdateMessage is the message of the extension with the text of the file and the settings. */
export interface UpdateMessage {
  type: 'update';
  /** text is the text of the PlantUML file; in a rendered diff, its modified text. */
  text: string;
  /** original is the original text of the file in a rendered diff. */
  original?: string;
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

/** Change is the change of a diagram from the original to the modified text. */
export type Change = 'unchanged' | 'modified' | 'added' | 'removed';

/** DiffRow is a row of a rendered diff: a diagram of the original text, of the modified text, or of both. */
export interface DiffRow {
  original?: string;
  modified?: string;
  change: Change;
}

/**
 * diagramSources returns the texts of the diagrams of a PlantUML file. A diagram runs from a line that starts with
 * `@start` to the next line that starts with `@end`, or to the end of the file. A text without such lines is the
 * body of one diagram. Blank text has no diagram.
 * @param text - The text of the file.
 */
export function diagramSources(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n/);
  if (!lines.some((line) => /^\s*@start/i.test(line))) {
    return text.trim() === '' ? [] : [text];
  }
  const sources: string[] = [];
  let start: number | undefined;
  lines.forEach((line, index) => {
    if (start === undefined && /^\s*@start/i.test(line)) {
      start = index;
    } else if (start !== undefined && /^\s*@end/i.test(line)) {
      sources.push(lines.slice(start, index + 1).join('\n'));
      start = undefined;
    }
  });
  if (start !== undefined) {
    sources.push(lines.slice(start).join('\n'));
  }
  return sources;
}

/**
 * diffRows pairs the diagrams of two versions of a file. Equal diagrams pair as unchanged, along the longest
 * common sequence of equal diagrams. Between two unchanged pairs, the other diagrams of both versions pair in their
 * order as modified; the rest are removed from the original or added in the modified version.
 * @param original - The diagrams of the original text.
 * @param modified - The diagrams of the modified text.
 */
export function diffRows(original: readonly string[], modified: readonly string[]): DiffRow[] {
  // common[i][j] is the length of the longest common sequence of original.slice(i) and modified.slice(j).
  const common = Array.from({ length: original.length + 1 }, () => new Array<number>(modified.length + 1).fill(0));
  for (let i = original.length - 1; i >= 0; i--) {
    for (let j = modified.length - 1; j >= 0; j--) {
      common[i][j] = original[i] === modified[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }
  const rows: DiffRow[] = [];
  let removed: string[] = [];
  let added: string[] = [];
  const pairChanges = () => {
    for (let index = 0; index < Math.max(removed.length, added.length); index++) {
      const [before, after] = [removed[index], added[index]];
      if (before !== undefined && after !== undefined) {
        rows.push({ original: before, modified: after, change: 'modified' });
      } else if (before !== undefined) {
        rows.push({ original: before, change: 'removed' });
      } else {
        rows.push({ modified: after, change: 'added' });
      }
    }
    removed = [];
    added = [];
  };
  let i = 0;
  let j = 0;
  while (i < original.length || j < modified.length) {
    if (i < original.length && j < modified.length && original[i] === modified[j]) {
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
 * showBlock writes a diagram and the settings into a block.
 * @param block - The element of the block.
 * @param source - The text of the diagram.
 * @param settings - The settings.
 */
function showBlock(block: HTMLElement, source: string, settings: Settings): void {
  block.setAttribute(sourceAttribute, source);
  if (isDefault(settings)) {
    block.removeAttribute(settingsAttribute);
  } else {
    block.setAttribute(settingsAttribute, JSON.stringify(settings));
  }
}

/**
 * newBlock returns a new element of a block.
 * @param page - The document of the page.
 */
function newBlock(page: Document): HTMLElement {
  const block = page.createElement('div');
  block.className = blockClass;
  return block;
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
  const blocks = [...container.querySelectorAll<HTMLElement>(`:scope > .${blockClass}`)];
  sources.forEach((source, index) => {
    let block = blocks[index];
    if (!block) {
      block = newBlock(container.ownerDocument);
      container.append(block);
    }
    showBlock(block, source, message.settings);
  });
  blocks.slice(sources.length).forEach((block) => block.remove());
  showEmpty(container, sources.length === 0);
}

/**
 * showDiff writes one row for each diagram of a rendered diff into a container, and reuses the rows that exist.
 * The class of a row names its change, and an empty side has no block.
 * @param container - The element of the rows.
 * @param message - The message with the original and the modified text and the settings.
 */
export function showDiff(container: HTMLElement, message: UpdateMessage & { original: string }): void {
  const page = container.ownerDocument;
  const rows = diffRows(diagramSources(message.original), diagramSources(message.text));
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
    [row.original, row.modified].forEach((source, side) => {
      const cell = element.children[side] as HTMLElement;
      let block = cell.querySelector<HTMLElement>(`:scope > .${blockClass}`);
      if (source === undefined) {
        block?.remove();
        return;
      }
      if (!block) {
        block = newBlock(page);
        cell.append(block);
      }
      showBlock(block, source, message.settings);
    });
  });
  elements.slice(rows.length).forEach((element) => element.remove());
  showEmpty(container, rows.length === 0);
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
  const renderer = new PreviewRenderer(
    container,
    engineLoader(new URL('./engine/', import.meta.url).href),
    () => isDarkTheme(document.body),
  );
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
