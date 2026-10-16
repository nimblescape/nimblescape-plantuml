// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/// <reference lib="dom" />

/**
 * The renderer of the previews: the Markdown preview
 * ([R-MD-001](../../docs/requirements.md#r-md-001)) and the preview of
 * PlantUML files ([R-PUML-002](../../docs/requirements.md#r-puml-002),
 * [R-PUML-003](../../docs/requirements.md#r-puml-003)). It renders every
 * diagram of every PlantUML block of a page, one diagram after the other, and
 * keeps the results, so that a change of the document shows the unchanged
 * diagrams at once.
 *
 * A block shows its diagrams in a shadow root of its content element. The
 * content element itself keeps the text of the block as the page wrote it, and
 * the shadow root hides that text. So the Markdown preview, which compares the
 * elements of its page with the new ones on each change of the document, finds
 * an unchanged block equal and keeps it with its diagrams. A block with a
 * changed text keeps its last diagrams until the new ones are ready. A new
 * block shows a note while its diagrams render, never its text. A block with
 * an error shows the message and the line of the text that the message names,
 * above its text. The styles of the page reach the elements of the shadow root
 * by their part names: `diagram`, `pending`, `error`, and `following` for each
 * element after the first.
 *
 * The results also stay in the local storage of the preview, which VS Code
 * keeps for all previews of one kind across previews and restarts. So a
 * preview that opens again shows its diagrams at once, without the time that
 * the engine needs to start.
 *
 * A preview loads its script as a module with the nonce of its security
 * policy. The renderer loads the engine with a dynamic import, which keeps the
 * nonce, and loads the further scripts of the engine (themes, emoji, icons)
 * with script elements that carry the nonce. Viz.js, the Graphviz layout, needs
 * WebAssembly; the renderer loads it only when the policy of the page allows
 * WebAssembly. Without it, PlantUML uses its own layout engine Smetana.
 */

import { diagramLines } from '../diagram/diagramLines';
import { Diagram, diagramsOf } from '../diagram/diagramRanges';
import { blockClass, contentClass, settingsAttribute, sourceAttribute } from '../markdown/markdownIt';
import { parseSettings, Settings } from '../settings';

/** Engine is the part of the API of `@plantuml/core` that the preview uses. */
export interface Engine {
  /**
   * renderToString renders a diagram into the text of an SVG image.
   * @param lines - The lines of the diagram text.
   * @param onSuccess - Receives the SVG text.
   * @param onError - Receives the message of an error.
   * @param options - `dark` renders the diagram for a dark background; `maxSvgSize` is the largest width and height
   *   in pixels, and 0 sets no limit.
   */
  renderToString(
    lines: string[],
    onSuccess: (svg: string) => void,
    onError: (message: string) => void,
    options?: { dark?: boolean; maxSvgSize?: number },
  ): void;
}

/**
 * Result is the outcome of the rendering of one diagram: the SVG text of the diagram, or the message of an error,
 * with the index of the line of the diagram text that the message names, when it names one.
 */
export type Result = { svg: string } | { error: string; line?: number };

/**
 * renderTimeout is the time in milliseconds after which a rendering counts as failed. Large diagrams have no other
 * limit: the renderer sets no largest size of a diagram.
 */
const renderTimeout = 60_000;

/** cacheLimit is the number of results that the renderer keeps. */
const cacheLimit = 200;

/** storagePrefix is the start of the keys of the extension in the local storage of a preview. */
const storagePrefix = 'nimblescape-plantuml:';

/** storageIndex is the key of the list of the stored results, from the least to the most recently used. */
const storageIndex = `${storagePrefix}index`;

/** storageLimit is the number of results that the local storage keeps. */
const storageLimit = 50;

/** storedSizeLimit is the length of the longest SVG text that the local storage keeps. */
const storedSizeLimit = 500_000;

/**
 * hash returns the 32-bit FNV-1a hash of a text, as a short text.
 * @param text - The text.
 */
function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(36);
}

/**
 * messageOf returns the message of an error.
 * @param error - The error.
 */
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** pageStorage returns the local storage of the page, or undefined when the page has none or may not use it. */
export function pageStorage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * StoredResults keeps the SVG texts of rendered diagrams in the local storage of a preview. VS Code gives all
 * webviews of one kind, for example all Markdown previews, the same origin, and keeps their local storage across
 * previews and restarts. The storage keeps the most recently used results, up to a limit; each result carries its
 * whole key, so that two keys with the same hash do not mix. A full or blocked storage only means that results are
 * not kept.
 */
export class StoredResults {
  readonly #storage: Storage | undefined;
  readonly #version: string;

  /**
   * @param storage - The local storage of the page, or undefined when the page has none.
   * @param version - Names the engine that renders: the address of its folder, which contains the version of the
   *   extension, and the layout engine, so that the results of another version or another layout engine are not used.
   */
  constructor(storage: Storage | undefined, version: string) {
    this.#storage = storage;
    this.#version = version;
  }

  /**
   * get returns the stored SVG text of a diagram, or undefined when the storage has none, and marks it as used.
   * @param lines - The lines that the engine renders.
   * @param dark - Whether the diagram is for a dark background.
   */
  get(lines: readonly string[], dark: boolean): string | undefined {
    const key = JSON.stringify([this.#version, dark, lines]);
    const id = hash(key);
    try {
      const item: unknown = JSON.parse(this.#storage?.getItem(storagePrefix + id) ?? 'null');
      if (typeof item !== 'object' || item === null || (item as { key?: unknown }).key !== key) {
        return undefined;
      }
      const svg = (item as { svg?: unknown }).svg;
      if (typeof svg !== 'string') {
        return undefined;
      }
      this.#use(id);
      return svg;
    } catch {
      return undefined;
    }
  }

  /**
   * set stores the SVG text of a diagram. When the storage is full, it removes the least recently used results
   * until the new one fits.
   * @param lines - The lines that the engine rendered.
   * @param dark - Whether the diagram is for a dark background.
   * @param svg - The SVG text.
   */
  set(lines: readonly string[], dark: boolean, svg: string): void {
    const storage = this.#storage;
    if (!storage || svg.length > storedSizeLimit) {
      return;
    }
    const key = JSON.stringify([this.#version, dark, lines]);
    const id = hash(key);
    try {
      const ids = this.#use(id);
      for (;;) {
        try {
          storage.setItem(storagePrefix + id, JSON.stringify({ key, svg }));
          return;
        } catch {
          const oldest = ids.find((other) => other !== id);
          ids.splice(ids.indexOf(oldest ?? id), 1);
          storage.removeItem(storagePrefix + (oldest ?? id));
          storage.setItem(storageIndex, JSON.stringify(ids));
          if (oldest === undefined) {
            return;
          }
        }
      }
    } catch {
      // A blocked storage keeps nothing.
    }
  }

  /**
   * #use moves a result to the end of the list of the stored results, removes the least recently used results
   * above the limit, and returns the list.
   * @param id - The hash of the key of the result.
   */
  #use(id: string): string[] {
    const storage = this.#storage!;
    let ids: string[] = [];
    try {
      const stored: unknown = JSON.parse(storage.getItem(storageIndex) ?? '[]');
      ids = Array.isArray(stored) ? stored.filter((other): other is string => typeof other === 'string' && other !== id) : [];
    } catch {
      // A damaged list starts again.
    }
    ids.push(id);
    while (ids.length > storageLimit) {
      storage.removeItem(storagePrefix + ids.shift());
    }
    storage.setItem(storageIndex, JSON.stringify(ids));
    return ids;
  }
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
 * svgText matches a text element of an SVG image of the engine, with its text. The engine writes no element into a
 * text element.
 */
const svgText = /<text\b[^>]*>([^<]*)<\/text>/g;

/**
 * entities maps the named entities of XML to their characters.
 */
const entities: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/**
 * decodeText returns the characters of the text of an XML element.
 * @param text - The text, with entities.
 */
const decodeText = (text: string): string =>
  text.replace(/&(?:#(\d+)|#x([\da-f]+)|(\w+));/gi, (entity, decimal?: string, hexadecimal?: string, name?: string) => {
    if (name !== undefined) {
      return entities[name] ?? entity;
    }
    const code = Number.parseInt(decimal ?? hexadecimal!, decimal === undefined ? 16 : 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });

/**
 * errorOf reads the picture that the engine draws for an error in a diagram text: a line with the version of
 * PlantUML, a line `[From textarea (line N) ]` with the number of the line, the lines of the text up to that line,
 * and the message. The line number counts the lines that the engine received, which hold added lines, such as the
 * commands of the UML notation; so errorOf returns the index of the line of the diagram text instead, through the
 * origins of the lines. It returns undefined for every other image.
 * @param svg - The SVG text from the engine.
 * @param origins - For each line that the engine received, the index of the line of the diagram text that it comes
 *   from, or undefined for an added line.
 */
export function errorOf(svg: string, origins: readonly (number | undefined)[]): { error: string; line?: number } | undefined {
  const texts = new RegExp(svgText.source, 'g');
  const header = texts.exec(svg);
  if (!header || !decodeText(header[1]).startsWith('PlantUML version ')) {
    return undefined;
  }
  const from = /^\[From .* \(line (\d+)\) \]$/.exec(decodeText(texts.exec(svg)?.[1] ?? ''));
  if (!from) {
    return undefined;
  }
  let last = header;
  for (let match = texts.exec(svg); match; match = texts.exec(svg)) {
    last = match;
  }
  // An added line, such as the @enduml line around a body, names the last line of the text before it.
  let index = Math.min(Number(from[1]) - 1, origins.length - 1);
  while (index >= 0 && origins[index] === undefined) {
    index--;
  }
  return { error: decodeText(last[1]).trim(), line: index >= 0 ? origins[index] : undefined };
}

/** pending is the value of a content element in the shown results of a renderer while it shows the note. */
const pending = '';

/** BlockDiagram is a diagram of a block on the page, with the key of its result. */
interface BlockDiagram extends Diagram {
  /** key names the result of the diagram: the theme, the settings and the text of the diagram. */
  key: string;
}

/**
 * PreviewRenderer renders the PlantUML blocks of a page. It renders one diagram at a time, because the engine
 * keeps shared state, and keeps the results by theme, settings and text.
 */
export class PreviewRenderer {
  readonly #root: ParentNode;
  readonly #loadEngine: () => Promise<Engine>;
  readonly #isDark: () => boolean;
  readonly #stored: StoredResults | undefined;
  readonly #results = new Map<string, Result>();
  readonly #pending = new Set<string>();
  /** #shown holds for each content element the key of the results that it shows, or `pending` for the note. */
  readonly #shown = new WeakMap<Element, string>();
  #queue: Promise<void> = Promise.resolve();
  /** #engineFree resolves when the engine has ended a rendering that ran past the time limit. */
  #engineFree: Promise<void> = Promise.resolve();

  /**
   * @param root - The node whose PlantUML blocks the renderer renders.
   * @param loadEngine - Loads the engine; the renderer calls it before each rendering.
   * @param isDark - Tells whether the diagrams are for a dark background.
   * @param stored - Keeps the results in the local storage of the preview; undefined keeps them in memory only.
   */
  constructor(root: ParentNode, loadEngine: () => Promise<Engine>, isDark: () => boolean, stored?: StoredResults) {
    this.#root = root;
    this.#loadEngine = loadEngine;
    this.#isDark = isDark;
    this.#stored = stored;
  }

  /**
   * update shows the kept results in every block that does not show them yet, and queues the rendering of the
   * diagrams without a result. A block shows its results when every diagram of the block has one.
   */
  update(): void {
    for (const { element, settings, dark, diagrams, key } of this.#blocks()) {
      const content = contentOf(element);
      if (this.#shown.get(content) === key) {
        continue;
      }
      const results = diagrams.map((diagram) => this.#results.get(diagram.key) ?? this.#fromStorage(diagram, settings, dark));
      if (results.every((result): result is Result => result !== undefined)) {
        show(content, diagrams, results);
        this.#shown.set(content, key);
        continue;
      }
      if (!this.#shown.has(content)) {
        showPending(content);
        this.#shown.set(content, pending);
      }
      diagrams.forEach((diagram, index) => {
        if (!results[index]) {
          this.#enqueue(diagram, settings, dark);
        }
      });
    }
  }

  /**
   * whenIdle resolves when every queued rendering has finished, also the renderings that a finished rendering
   * queued.
   */
  async whenIdle(): Promise<void> {
    for (let queue = this.#queue; ; queue = this.#queue) {
      await queue;
      if (queue === this.#queue) {
        return;
      }
    }
  }

  /**
   * #enqueue queues the rendering of a diagram, unless it is queued already. A failed rendering shows its error in
   * its block, and the next renderings still run.
   * @param diagram - The diagram.
   * @param settings - The settings of its block.
   * @param dark - Whether the diagram is for a dark background.
   */
  #enqueue({ text, key }: BlockDiagram, settings: Settings, dark: boolean): void {
    if (this.#pending.has(key)) {
      return;
    }
    this.#pending.add(key);
    this.#queue = this.#queue
      .then(async () => {
        try {
          // While the user types, a text can change again before its turn comes; such a text needs no diagram.
          if (this.#blocks().some(({ diagrams }) => diagrams.some((diagram) => diagram.key === key))) {
            const { lines, origins } = diagramLines(text, settings);
            const result = await this.#render(lines, origins, dark);
            if ('svg' in result) {
              this.#stored?.set(lines, dark, result.svg);
            }
            this.#keep(key, result);
          }
        } catch (error) {
          // Without a result, the block would wait for its diagram for ever.
          this.#keep(key, { error: messageOf(error) });
        } finally {
          this.#pending.delete(key);
        }
        this.update();
      })
      // An error of the update must not stop the queue.
      .catch((error: unknown) => console.error(error));
  }

  /**
   * #fromStorage returns the stored result of a diagram and keeps it in memory, or undefined when the local storage
   * has none.
   * @param diagram - The diagram.
   * @param settings - The settings of its block.
   * @param dark - Whether the diagram is for a dark background.
   */
  #fromStorage({ text, key }: BlockDiagram, settings: Settings, dark: boolean): Result | undefined {
    const svg = this.#stored?.get(diagramLines(text, settings).lines, dark);
    if (svg === undefined) {
      return undefined;
    }
    const result = { svg };
    this.#keep(key, result);
    return result;
  }

  /**
   * #blocks returns the PlantUML blocks of the page, each with its settings, the theme, its diagrams, and the key of
   * what it shows: the results of its diagrams, and the first line of each diagram in the block, which the message of
   * an error names.
   */
  #blocks() {
    const dark = this.#isDark();
    return [...this.#root.querySelectorAll<HTMLElement>(`.${blockClass}[${sourceAttribute}]`)].map((element) => {
      const settings = parseSettings(element.getAttribute(settingsAttribute));
      const diagrams: BlockDiagram[] = diagramsOf(element.getAttribute(sourceAttribute) ?? '').map((diagram) => ({
        ...diagram,
        key: JSON.stringify([dark, settings, diagram.text]),
      }));
      return { element, settings, dark, diagrams, key: JSON.stringify(diagrams.map(({ key, line }) => [key, line])) };
    });
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
   * #render renders one diagram. A rendering that runs past the time limit fails; the engine keeps working on it, so
   * the next rendering waits until the engine has ended it, for one more time limit at most, and its late result is
   * dropped.
   * @param lines - The lines that the engine renders.
   * @param origins - For each line, the index of the line of the diagram text that it comes from.
   * @param dark - Whether the diagram is for a dark background.
   */
  async #render(lines: string[], origins: readonly (number | undefined)[], dark: boolean): Promise<Result> {
    try {
      const engine = await this.#loadEngine();
      await this.#engineFree;
      const result = await new Promise<Result>((resolve) => {
        let settled = false;
        let ended = () => {};
        const end = new Promise<void>((resolveEnd) => {
          ended = resolveEnd;
        });
        const timer = setTimeout(() => {
          settled = true;
          this.#engineFree = Promise.race([end, new Promise<void>((resolveLimit) => setTimeout(resolveLimit, renderTimeout))]);
          resolve({ error: 'The rendering of the diagram took too long.' });
        }, renderTimeout);
        const finish = (outcome: Result) => {
          ended();
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(outcome);
          }
        };
        try {
          engine.renderToString(
            lines,
            (svg) => finish(typeof svg === 'string' ? { svg } : { error: 'The engine returned no diagram.' }),
            (message) => finish({ error: String(message) }),
            { dark, maxSvgSize: 0 },
          );
        } catch (error) {
          finish({ error: messageOf(error) });
        }
      });
      return 'svg' in result ? (errorOf(result.svg, origins) ?? result) : result;
    } catch (error) {
      return { error: messageOf(error) };
    }
  }
}

/**
 * contentOf returns the content element of a block, and adds it when the block has none.
 * @param element - The element of the block.
 */
function contentOf(element: HTMLElement): HTMLElement {
  let content = element.querySelector<HTMLElement>(`:scope > .${contentClass}`);
  if (!content) {
    content = element.ownerDocument.createElement('div');
    content.className = contentClass;
    element.prepend(content);
  }
  return content;
}

/**
 * shadowOf returns the shadow root of the content element of a block, and adds it when the element has none.
 * @param content - The content element.
 */
const shadowOf = (content: HTMLElement): ShadowRoot => content.shadowRoot ?? content.attachShadow({ mode: 'open' });

/**
 * showPending shows the note of a block whose diagrams render. Screen readers announce the note.
 * @param content - The content element of the block.
 */
function showPending(content: HTMLElement): void {
  const note = content.ownerDocument.createElement('div');
  note.setAttribute('part', 'pending');
  note.setAttribute('role', 'status');
  note.textContent = 'Rendering the diagram…';
  shadowOf(content).replaceChildren(note);
}

/**
 * diagramLabel returns the text that screen readers read for a diagram: "PlantUML diagram", and its title when it
 * has one. The engine writes the title of a diagram into a group with the class `title`.
 * @param svg - The image of the diagram.
 */
function diagramLabel(svg: Element): string {
  const title = [...svg.querySelectorAll('g.title text')]
    .map((text) => text.textContent ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return title ? `PlantUML diagram: ${title}` : 'PlantUML diagram';
}

/**
 * show shows the results of the diagrams of a block in its shadow root: each diagram as an image, or the message
 * of its error with the number of the line of the block text that the message names. Below the messages, the shadow
 * root shows the text of the block from the content element. Other children of the block, such as the bar that the
 * rendered diff of VS Code adds to a changed block, stay. The SVG text comes from the engine; the security policy of
 * the preview keeps any script in it from running.
 * @param content - The content element of the block.
 * @param diagrams - The diagrams of the block.
 * @param results - The result of each diagram.
 */
function show(content: HTMLElement, diagrams: readonly Diagram[], results: readonly Result[]): void {
  const page = content.ownerDocument;
  const message = (text: string): Element => {
    const element = page.createElement('pre');
    element.setAttribute('part', 'error');
    element.textContent = text;
    return element;
  };
  const nodes = results.map((result, index): Element => {
    if ('error' in result) {
      return message(result.line === undefined ? result.error : `Line ${diagrams[index].line + result.line + 1}: ${result.error}`);
    }
    const template = page.createElement('template');
    template.innerHTML = result.svg;
    const svg = template.content.querySelector('svg');
    if (!svg) {
      return message('The engine returned no diagram.');
    }
    svg.setAttribute('part', 'diagram');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', diagramLabel(svg));
    return svg;
  });
  nodes.slice(1).forEach((node) => node.setAttribute('part', `${node.getAttribute('part')} following`));
  if (nodes.some((node) => node.localName === 'pre')) {
    nodes.push(page.createElement('slot'));
  }
  shadowOf(content).replaceChildren(...nodes);
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

/** Layout is the layout engine of the diagrams: Graphviz from Viz.js, or Smetana, the own layout engine of PlantUML. */
export type Layout = 'graphviz' | 'smetana';

/**
 * pageLayout returns the layout engine of the diagrams of the page: Graphviz when the security policies of the page
 * allow WebAssembly, which Viz.js needs, and Smetana else.
 */
export function pageLayout(): Layout {
  const policies = [...document.querySelectorAll<HTMLMetaElement>('meta[http-equiv="Content-Security-Policy" i]')];
  return typeof WebAssembly === 'object' && policiesAllowWebAssembly(policies.map((meta) => meta.content)) ? 'graphviz' : 'smetana';
}

/**
 * engineLoader returns a function that loads the engine from a folder, with the support for its further scripts. A
 * loaded engine stays; after a failed load, the next call loads the engine again.
 * @param folder - The address of the folder of the engine, with a final slash.
 * @param layout - The layout engine: with Graphviz, the function loads Viz.js first.
 */
export function engineLoader(folder: string, layout: Layout): () => Promise<Engine> {
  let viz: Promise<void> | undefined;
  let engine: Promise<Engine> | undefined;
  const load = async (): Promise<Engine> => {
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
    if (layout === 'graphviz') {
      // Without Viz.js, PlantUML uses Smetana, so a failed load only changes the layout engine.
      viz ??= loadScript(`${folder}viz-global.js`).catch(() => undefined);
      await viz;
    }
    return (await import(`${folder}plantuml.js`)) as Engine;
  };
  return () => {
    engine ??= load().catch((error: unknown) => {
      engine = undefined;
      throw error;
    });
    return engine;
  };
}

/**
 * pageRenderer returns the renderer of a preview page: with the engine in a folder of the extension, the layout
 * engine that the security policies of the page allow, the color theme of VS Code, and the local storage of the
 * page. The stored results carry the address of the folder and the layout engine.
 * @param root - The node whose PlantUML blocks the renderer renders.
 * @param folder - The address of the folder of the engine, with a final slash.
 * @param loadEngine - Loads the engine; by default, from the folder.
 */
export function pageRenderer(root: ParentNode, folder: string, loadEngine?: () => Promise<Engine>): PreviewRenderer {
  const layout = pageLayout();
  return new PreviewRenderer(
    root,
    loadEngine ?? engineLoader(folder, layout),
    () => isDarkTheme(document.body),
    new StoredResults(pageStorage(), `${folder} ${layout}`),
  );
}
