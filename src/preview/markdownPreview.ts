// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/// <reference lib="dom" />

/**
 * The script of the built-in Markdown preview. It renders every PlantUML block
 * that the markdown-it plugin (`src/markdown/markdownIt.ts`) wrote into the
 * page, one block after the other, and keeps the results, so that a change of
 * the document shows the unchanged diagrams at once
 * ([R-MD-001](../../docs/requirements.md#r-md-001)).
 *
 * The preview loads this script as a module with the nonce of its security
 * policy. That policy allows only scripts with the nonce: the script loads the
 * engine with a dynamic import, which keeps the nonce, and loads the further
 * scripts of the engine (themes, emoji, icons) with script elements that carry
 * the nonce. The policy forbids WebAssembly, so the Graphviz layout of Viz.js
 * cannot run in the default preview; PlantUML then uses its own layout engine
 * Smetana. When the preview allows WebAssembly (the security setting
 * "Disable"), the script loads Viz.js first.
 */

import { blockClass, sourceAttribute } from '../markdown/markdownIt';

/** Engine is the part of the API of `@plantuml/core` that the preview uses. */
export interface Engine {
  /**
   * renderToString renders a diagram into the text of an SVG image.
   * @param lines - The lines of the diagram text.
   * @param onSuccess - Receives the SVG text.
   * @param onError - Receives the message of an error.
   * @param options - `dark` renders the diagram for a dark background.
   */
  renderToString(
    lines: string[],
    onSuccess: (svg: string) => void,
    onError: (message: string) => void,
    options?: { dark?: boolean },
  ): void;
}

/** Result is the outcome of one rendering: the SVG text of the diagram, or the message of an error. */
export type Result = { svg: string } | { error: string };

/** renderTimeout is the time in milliseconds after which a rendering counts as failed. */
const renderTimeout = 60_000;

/** cacheLimit is the number of results that the renderer keeps. */
const cacheLimit = 200;

/**
 * diagramLines returns the lines that the engine renders for the text of a block. A block without a line that
 * starts with `@start` holds the body of a diagram only, so the lines get `@startuml` and `@enduml` around it.
 * @param source - The text of the block.
 */
export function diagramLines(source: string): string[] {
  const lines = source.replace(/\r?\n$/, '').split(/\r\n|\r|\n/);
  return lines.some((line) => line.trimStart().startsWith('@start')) ? lines : ['@startuml', ...lines, '@enduml'];
}

/**
 * isDarkTheme tells whether the color theme of VS Code has a dark background. VS Code marks the body of a webview
 * with the class of the kind of its theme.
 * @param body - The body of the preview.
 */
export function isDarkTheme(body: HTMLElement): boolean {
  const classes = body.classList;
  return classes.contains('vscode-dark') || (classes.contains('vscode-high-contrast') && !classes.contains('vscode-high-contrast-light'));
}

/**
 * PreviewRenderer renders the PlantUML blocks of a page. It renders one diagram at a time, because the engine
 * keeps shared state, and keeps the results by theme and text.
 */
export class PreviewRenderer {
  readonly #root: ParentNode;
  readonly #loadEngine: () => Promise<Engine>;
  readonly #isDark: () => boolean;
  readonly #results = new Map<string, Result>();
  readonly #pending = new Set<string>();
  #queue: Promise<void> = Promise.resolve();

  /**
   * @param root - The node whose PlantUML blocks the renderer renders.
   * @param loadEngine - Loads the engine; the renderer calls it before the first rendering.
   * @param isDark - Tells whether the diagrams are for a dark background.
   */
  constructor(root: ParentNode, loadEngine: () => Promise<Engine>, isDark: () => boolean) {
    this.#root = root;
    this.#loadEngine = loadEngine;
    this.#isDark = isDark;
  }

  /**
   * update shows the kept result in every block that does not show it yet, and queues the rendering of the
   * blocks without a result.
   */
  update(): void {
    const dark = this.#isDark();
    for (const element of this.#root.querySelectorAll<HTMLElement>(`.${blockClass}[${sourceAttribute}]`)) {
      const source = element.getAttribute(sourceAttribute) ?? '';
      const key = `${dark ? 'dark' : 'light'}\n${source}`;
      if (element.dataset.plantumlShown === key) {
        continue;
      }
      const result = this.#results.get(key);
      if (result) {
        show(element, source, result);
        element.dataset.plantumlShown = key;
      } else if (!this.#pending.has(key)) {
        this.#pending.add(key);
        this.#queue = this.#queue
          .then(() => this.#render(source, dark))
          .then((rendered) => this.#keep(key, rendered))
          .finally(() => {
            this.#pending.delete(key);
            this.update();
          });
      }
    }
  }

  /**
   * whenIdle resolves when every queued rendering has finished.
   */
  whenIdle(): Promise<void> {
    return this.#queue;
  }

  /**
   * #keep stores a result and removes the oldest results above the limit.
   * @param key - The theme and the text of the diagram.
   * @param result - The result of its rendering.
   */
  #keep(key: string, result: Result): void {
    this.#results.set(key, result);
    for (const oldest of this.#results.keys()) {
      if (this.#results.size <= cacheLimit) {
        break;
      }
      this.#results.delete(oldest);
    }
  }

  /**
   * #render renders one diagram.
   * @param source - The text of the block.
   * @param dark - Whether the diagram is for a dark background.
   */
  async #render(source: string, dark: boolean): Promise<Result> {
    try {
      const engine = await this.#loadEngine();
      return await new Promise<Result>((resolve) => {
        const timer = setTimeout(() => resolve({ error: 'The rendering of the diagram took too long.' }), renderTimeout);
        const finish = (result: Result) => {
          clearTimeout(timer);
          resolve(result);
        };
        engine.renderToString(diagramLines(source), (svg) => finish({ svg }), (message) => finish({ error: String(message) }), { dark });
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
}

/**
 * show puts the result of a rendering into the element of a block: the diagram, or the message of the error
 * above the text of the block. The SVG text comes from the engine; the security policy of the preview keeps any
 * script in it from running.
 * @param element - The element of the block.
 * @param source - The text of the block.
 * @param result - The result of the rendering.
 */
function show(element: HTMLElement, source: string, result: Result): void {
  if ('svg' in result) {
    element.innerHTML = result.svg;
    return;
  }
  const message = element.ownerDocument.createElement('pre');
  message.className = `${blockClass}-error`;
  message.textContent = result.error;
  const text = element.ownerDocument.createElement('pre');
  text.className = `${blockClass}-source`;
  const code = element.ownerDocument.createElement('code');
  code.textContent = source;
  text.append(code);
  element.replaceChildren(message, text);
}

/** bundledScripts are the further scripts of the engine that the package contains. */
const bundledScripts = new Set(['themes.js', 'emoji.js', 'openiconic.js']);

/**
 * loadScript loads a classic script with the nonce of the preview.
 * @param url - The address of the script.
 */
function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce;
    if (nonce) {
      script.nonce = nonce;
    }
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`The script ${url} did not load.`));
    document.head.append(script);
  });
}

/** webAssemblyAllowed tells whether the security policy of the page allows WebAssembly. */
function webAssemblyAllowed(): boolean {
  try {
    new WebAssembly.Module(new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]));
    return true;
  } catch {
    return false;
  }
}

/**
 * engineLoader returns a function that loads the engine from a folder once, with the support for its further
 * scripts.
 * @param folder - The address of the folder of the engine, with a final slash.
 */
function engineLoader(folder: string): () => Promise<Engine> {
  let engine: Promise<Engine> | undefined;
  return () => {
    engine ??= (async () => {
      const global = globalThis as Record<string, unknown>;
      global.PLANTUML_STDLIB_BASE = folder;
      // The engine calls the loader for a further script instead of adding a script element without the nonce.
      global.PLANTUML_STDLIB_LOADER = (url: string, ok: () => void, fail: (message: string) => void) => {
        const name = url.slice(url.lastIndexOf('/') + 1);
        if (!bundledScripts.has(name)) {
          fail(`The extension does not contain the PlantUML library ${name}.`);
        } else {
          loadScript(folder + name).then(ok, (error: Error) => fail(error.message));
        }
        return true;
      };
      if (webAssemblyAllowed()) {
        // Without Viz.js, PlantUML uses Smetana, so a failed load only changes the layout engine.
        await loadScript(`${folder}viz-global.js`).catch(() => undefined);
      }
      return (await import(`${folder}plantuml.js`)) as Engine;
    })();
    return engine;
  };
}

/**
 * start renders the blocks of the preview page and renders again when the content or the color theme changes.
 * The preview adds its content after the scripts load and replaces it on every change of the document, so a
 * mutation observer starts each update.
 */
function start(): void {
  const renderer = new PreviewRenderer(
    document,
    engineLoader(new URL('./engine/', import.meta.url).href),
    () => isDarkTheme(document.body),
  );
  let scheduled = false;
  const schedule = () => {
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        renderer.update();
      });
    }
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('vscode.markdown.updateContent', schedule);
  schedule();
}

// The tests import this module without a preview page.
if (typeof document !== 'undefined' && document.getElementById('vscode-markdown-preview-data')) {
  start();
}
