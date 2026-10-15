// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/// <reference lib="dom" />

/**
 * The renderer of the previews: the Markdown preview
 * ([R-MD-001](../../docs/requirements.md#r-md-001)) and the preview of
 * PlantUML files ([R-PUML-002](../../docs/requirements.md#r-puml-002),
 * [R-PUML-003](../../docs/requirements.md#r-puml-003)). It renders every
 * PlantUML block of a page, one block after the other, and keeps the results,
 * so that a change of the document shows the unchanged diagrams at once.
 *
 * A preview loads its script as a module with the nonce of its security
 * policy. The renderer loads the engine with a dynamic import, which keeps the
 * nonce, and loads the further scripts of the engine (themes, emoji, icons)
 * with script elements that carry the nonce. Viz.js, the Graphviz layout, needs
 * WebAssembly; the renderer loads it only when the policy of the page allows
 * WebAssembly. Without it, PlantUML uses its own layout engine Smetana.
 */

import { diagramLines } from '../diagram/diagramLines';
import { blockClass, contentClass, settingsAttribute, sourceAttribute } from '../markdown/markdownIt';
import { parseSettings } from '../settings';

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
   * blocks without a result. A result belongs to the theme, the settings and the text of a block.
   */
  update(): void {
    for (const { element, source, settings, dark, key } of this.#blocks()) {
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
          .then(async () => {
            // While the user types, a text can change again before its turn comes; such a text needs no diagram.
            if (this.#blocks().some((block) => block.key === key)) {
              this.#keep(key, await this.#render(diagramLines(source, settings), dark));
            }
          })
          .finally(() => {
            this.#pending.delete(key);
            this.update();
          });
      }
    }
  }

  /**
   * #blocks returns the PlantUML blocks of the page, each with its text, its settings, the theme, and the key of
   * its result.
   */
  #blocks() {
    const dark = this.#isDark();
    return [...this.#root.querySelectorAll<HTMLElement>(`.${blockClass}[${sourceAttribute}]`)].map((element) => {
      const source = element.getAttribute(sourceAttribute) ?? '';
      const settings = parseSettings(element.getAttribute(settingsAttribute));
      return { element, source, settings, dark, key: JSON.stringify([dark, settings, source]) };
    });
  }

  /**
   * whenIdle resolves when every queued rendering has finished.
   */
  whenIdle(): Promise<void> {
    return this.#queue;
  }

  /**
   * #keep stores a result and removes the oldest results above the limit.
   * @param key - The theme, the settings and the text of the diagram.
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
   * @param lines - The lines of the diagram.
   * @param dark - Whether the diagram is for a dark background.
   */
  async #render(lines: string[], dark: boolean): Promise<Result> {
    try {
      const engine = await this.#loadEngine();
      return await new Promise<Result>((resolve) => {
        const timer = setTimeout(() => resolve({ error: 'The rendering of the diagram took too long.' }), renderTimeout);
        const finish = (result: Result) => {
          clearTimeout(timer);
          resolve(result);
        };
        engine.renderToString(lines, (svg) => finish({ svg }), (message) => finish({ error: String(message) }), { dark });
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }
}

/**
 * show puts the result of a rendering into the content element of a block: the diagram, or the message of the
 * error above the text of the block. Other children of the block, such as the bar that the rendered diff of
 * VS Code adds to a changed block, stay. The SVG text comes from the engine; the security policy of the preview
 * keeps any script in it from running.
 * @param element - The element of the block.
 * @param source - The text of the block.
 * @param result - The result of the rendering.
 */
function show(element: HTMLElement, source: string, result: Result): void {
  const page = element.ownerDocument;
  let content = element.querySelector<HTMLElement>(`:scope > .${contentClass}`);
  if (!content) {
    content = page.createElement('div');
    content.className = contentClass;
    element.prepend(content);
  }
  if ('svg' in result) {
    content.innerHTML = result.svg;
    return;
  }
  const message = page.createElement('pre');
  message.className = `${blockClass}-error`;
  message.textContent = result.error;
  const text = page.createElement('pre');
  text.className = `${blockClass}-source`;
  const code = page.createElement('code');
  code.textContent = source;
  text.append(code);
  content.replaceChildren(message, text);
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

/**
 * policiesAllowWebAssembly tells whether security policies allow WebAssembly. A policy allows it when it limits no
 * scripts, or when its script sources contain `'wasm-unsafe-eval'` or `'unsafe-eval'`. The script reads the
 * policies of the page instead of compiling a test module, because a blocked compilation is a violation of the
 * policy, and the preview then shows the warning "Some content has been disabled in this document".
 * @param policies - The texts of the security policies of the page.
 */
export function policiesAllowWebAssembly(policies: readonly string[]): boolean {
  return policies.every((policy) => {
    const directives = new Map(
      policy
        .split(';')
        .map((directive) => directive.trim().split(/\s+/))
        .filter((parts) => parts[0])
        .map((parts) => [parts[0].toLowerCase(), parts.slice(1)] as const),
    );
    const sources = directives.get('script-src') ?? directives.get('default-src');
    return !sources || sources.includes(`'wasm-unsafe-eval'`) || sources.includes(`'unsafe-eval'`);
  });
}

/** webAssemblyAllowed tells whether the security policies of the page allow WebAssembly. */
function webAssemblyAllowed(): boolean {
  const policies = [...document.querySelectorAll<HTMLMetaElement>('meta[http-equiv="Content-Security-Policy" i]')];
  return typeof WebAssembly === 'object' && policiesAllowWebAssembly(policies.map((meta) => meta.content));
}

/**
 * engineLoader returns a function that loads the engine from a folder once, with the support for its further
 * scripts.
 * @param folder - The address of the folder of the engine, with a final slash.
 */
export function engineLoader(folder: string): () => Promise<Engine> {
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
