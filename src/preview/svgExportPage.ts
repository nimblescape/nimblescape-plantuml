// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/// <reference lib="dom" />

/**
 * The script of the page of the SVG export
 * ([R-GEN-003](../../docs/requirements.md#r-gen-003)). The engine needs a
 * page to measure the texts of a diagram, so the extension renders the
 * diagrams of the export in a webview with this page (`src/svgExport.ts`).
 * The extension sends the blocks of the file in one message: the PlantUML
 * blocks of a Markdown file, or the whole text of a PlantUML file, each with
 * its settings and its included files. The page renders the blocks one after
 * the other with the renderer of the previews (`src/preview/renderer.ts`), in
 * the normal colors of PlantUML for a light background, also with a dark color
 * theme of VS Code, and with the Graphviz layout, because the page allows
 * WebAssembly. It shows each block as the preview shows it, and sends for each
 * block the SVG file text and the type of each diagram, or the message of its
 * error; then it tells the extension that it is done.
 */

import { IncludedFiles } from '../diagram/includes';
import { svgFile } from '../diagram/svgFiles';
import { blockClass, includesClass, settingsAttribute, sourceAttribute } from '../markdown/markdownIt';
import { Settings } from '../settings';
import { engineLoader, pageLayout, PreviewRenderer } from './renderer';

/** ExportBlock is a part of a file whose diagrams the page renders together, with its settings and its included files. */
export interface ExportBlock {
  /** text is the text of a PlantUML block of a Markdown file, or the text of a PlantUML file. */
  text: string;
  settings: Settings;
  /** includes are the files that the diagrams of the text include, if they include any. */
  includes?: IncludedFiles;
}

/** ExportedDiagram is the result of a diagram of the export: the text of its SVG file and its type, or its error. */
export type ExportedDiagram = { svg: string; type: string } | { error: string };

/** ExportMessage is the message of the extension with the blocks of the export. */
export interface ExportMessage {
  type: 'export';
  blocks: ExportBlock[];
}

/**
 * PageMessage is a message of the page to the extension: `ready` when it can receive the blocks, `block` with the
 * diagrams of a block, `done` after the last block, and `log` with a problem that no diagram shows.
 */
export type PageMessage =
  | { type: 'ready' }
  | { type: 'block'; index: number; diagrams: ExportedDiagram[] }
  | { type: 'done' }
  | { type: 'log'; message: string };

/**
 * wellFormedSvg returns the text of an SVG file that is well-formed XML. It keeps the text of `svgFile` when an XML
 * parser reads it without an error, which is the case for the images of the engine. Otherwise it reads the image as
 * the page reads it, as HTML, and writes it as XML.
 * @param page - The document of the page.
 * @param svg - The SVG text of the engine.
 */
export function wellFormedSvg(page: Document, svg: string): string {
  const text = svgFile(svg);
  const window = page.defaultView ?? globalThis;
  const parsed = new window.DOMParser().parseFromString(text, 'image/svg+xml');
  if (parsed.getElementsByTagName('parsererror').length === 0 && parsed.documentElement?.localName === 'svg') {
    return text;
  }
  const template = page.createElement('template');
  template.innerHTML = svg;
  const image = template.content.querySelector('svg');
  return image ? svgFile(new window.XMLSerializer().serializeToString(image)) : text;
}

/**
 * exportElement returns the element of a block of the export, as the markdown-it plugin writes a block: the text, the
 * settings and the included files of the block. The renderer adds the content element with the diagrams.
 * @param page - The document of the page.
 * @param block - The block.
 */
function exportElement(page: Document, block: ExportBlock): HTMLElement {
  const element = page.createElement('div');
  element.className = blockClass;
  element.setAttribute(sourceAttribute, block.text);
  element.setAttribute(settingsAttribute, JSON.stringify(block.settings));
  // The diagrams are for a light background, as the files are.
  element.style.backgroundColor = '#ffffff';
  element.style.padding = '8px';
  if (block.includes) {
    const files = page.createElement('div');
    files.className = includesClass;
    files.hidden = true;
    files.textContent = JSON.stringify(block.includes);
    element.append(files);
  }
  return element;
}

/**
 * exportBlocks renders the blocks of an export one after the other into a container, and passes the diagrams of each
 * block, with the text of the SVG file and the type of each diagram, or its error.
 * @param container - The element of the blocks.
 * @param renderer - The renderer of the container, for a light background.
 * @param blocks - The blocks.
 * @param onBlock - Receives the index and the diagrams of each block.
 */
export async function exportBlocks(
  container: HTMLElement,
  renderer: PreviewRenderer,
  blocks: readonly ExportBlock[],
  onBlock: (index: number, diagrams: ExportedDiagram[]) => void,
): Promise<void> {
  const page = container.ownerDocument;
  for (const [index, block] of blocks.entries()) {
    const element = exportElement(page, block);
    container.append(element);
    renderer.update();
    await renderer.whenIdle();
    const results = renderer.resultsOf(element) ?? [{ error: 'The diagram could not be rendered.' }];
    const diagrams: ExportedDiagram[] = [];
    for (const result of results) {
      if ('error' in result) {
        diagrams.push(result);
      } else if (!/<svg\b/.test(result.svg)) {
        diagrams.push({ error: 'The engine returned no diagram.' });
      } else {
        diagrams.push({ svg: wellFormedSvg(page, result.svg), type: await renderer.typeOf(result.lines) });
      }
    }
    onBlock(index, diagrams);
  }
}

/** VsCodeApi is the part of the API of the webview of VS Code that the page uses. */
interface VsCodeApi {
  postMessage(message: PageMessage): void;
}

/**
 * start renders the blocks of the message of the extension and sends the results. The page tells the extension that
 * it is ready, so that the extension sends the blocks only when the page can receive them.
 */
function start(): void {
  const vscode = (globalThis as unknown as { acquireVsCodeApi(): VsCodeApi }).acquireVsCodeApi();
  const container = document.getElementById('diagrams') ?? document.body;
  const report = (message: string) => vscode.postMessage({ type: 'log', message });
  const folder = new URL('./engine/', import.meta.url).href;
  // The files have the normal colors of PlantUML, and the page keeps no result in its storage.
  const renderer = new PreviewRenderer(container, engineLoader(folder, pageLayout(), undefined, report), () => false, undefined, report);
  window.addEventListener('message', (event: MessageEvent<ExportMessage>) => {
    if (event.data?.type !== 'export' || !Array.isArray(event.data.blocks)) {
      return;
    }
    container.replaceChildren();
    exportBlocks(container, renderer, event.data.blocks, (index, diagrams) => vscode.postMessage({ type: 'block', index, diagrams })).then(
      () => vscode.postMessage({ type: 'done' }),
      (error: unknown) => {
        report(`The export failed: ${error instanceof Error ? error.message : String(error)}`);
        vscode.postMessage({ type: 'done' });
      },
    );
  });
  vscode.postMessage({ type: 'ready' });
}

// The tests import this module without the page of the export.
if (typeof document !== 'undefined' && document.getElementById('diagrams')) {
  start();
}
