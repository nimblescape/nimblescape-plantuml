// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/// <reference lib="dom" />

/**
 * The script of the preview of PlantUML files
 * ([R-PUML-002](../../docs/requirements.md#r-puml-002),
 * [R-PUML-003](../../docs/requirements.md#r-puml-003)). The extension sends
 * the text of the file and the settings in a message; the script writes one
 * block for each diagram of the file and renders the blocks with the renderer
 * of `src/preview/renderer.ts`. The page allows WebAssembly, so the diagrams
 * use the Graphviz layout of Viz.js.
 *
 * The script reuses the block of each diagram from one message to the next,
 * so that the page keeps its scroll position and shows the unchanged diagrams
 * at once while the user types.
 */

import { blockClass, settingsAttribute, sourceAttribute } from '../markdown/markdownIt';
import { isDefault, Settings } from '../settings';
import { engineLoader, isDarkTheme, PreviewRenderer } from './renderer';

/** UpdateMessage is the message of the extension with the text of the file and the settings. */
export interface UpdateMessage {
  type: 'update';
  /** text is the text of the PlantUML file. */
  text: string;
  /** settings are the settings of the extension for the file. */
  settings: Settings;
  /** state is the state that the page keeps for the extension, for example the address of the file. */
  state?: unknown;
}

/** emptyClass is the class of the message that the page shows for a file without a diagram. */
export const emptyClass = `${blockClass}-empty`;

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
 * showDiagrams writes one block for each diagram of a text into a container, and reuses the blocks that exist.
 * @param container - The element of the blocks.
 * @param message - The message with the text and the settings.
 */
export function showDiagrams(container: HTMLElement, message: UpdateMessage): void {
  const page = container.ownerDocument;
  const sources = diagramSources(message.text);
  const blocks = [...container.querySelectorAll<HTMLElement>(`:scope > .${blockClass}`)];
  sources.forEach((source, index) => {
    let block = blocks[index];
    if (!block) {
      block = page.createElement('div');
      block.className = blockClass;
      container.append(block);
    }
    block.setAttribute(sourceAttribute, source);
    if (isDefault(message.settings)) {
      block.removeAttribute(settingsAttribute);
    } else {
      block.setAttribute(settingsAttribute, JSON.stringify(message.settings));
    }
  });
  blocks.slice(sources.length).forEach((block) => block.remove());
  let empty = container.querySelector<HTMLElement>(`:scope > .${emptyClass}`);
  if (sources.length === 0 && !empty) {
    empty = page.createElement('p');
    empty.className = emptyClass;
    empty.textContent = 'The file has no diagram.';
    container.append(empty);
  } else if (sources.length > 0) {
    empty?.remove();
  }
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
      showDiagrams(container, event.data);
      vscode.setState(event.data.state);
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
