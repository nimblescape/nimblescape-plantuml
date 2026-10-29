// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/// <reference lib="dom" />

/**
 * The renderer of the previews: the Markdown preview
 * ([R-MD-001](../../docs/requirements.md#r-md-001)) and the preview of
 * PlantUML files ([R-PUML-002](../../docs/requirements.md#r-puml-002),
 * [R-PUML-003](../../docs/requirements.md#r-puml-003)). It renders every
 * diagram of every PlantUML block of a page
 * ([R-GEN-009](../../docs/requirements.md#r-gen-009)), one diagram after the
 * other, and keeps the results, so that a change of the document shows the
 * unchanged diagrams at once.
 *
 * A block shows its diagrams in a shadow root of its content element. The
 * content element itself keeps the text of the block as the page wrote it, and
 * the shadow root hides that text. So the Markdown preview, which compares the
 * elements of its page with the new ones on each change of the document, finds
 * an unchanged block equal and keeps it with its diagrams. A block with a
 * changed text keeps its last diagrams until the new ones are ready. A new
 * block shows a note while its diagrams render, never its text. A block with
 * an error shows the message and the line of the text that the message names,
 * above its text ([R-GEN-010](../../docs/requirements.md#r-gen-010)). The styles of the page reach the elements of the shadow root
 * by their part names: `diagram`, `pending`, `error`, and `following` for each
 * element after the first.
 *
 * A block can carry the texts of the files that its diagrams include
 * ([R-GEN-008](../../docs/requirements.md#r-gen-008)). The renderer puts them
 * into the copy of each diagram text that the engine renders, and an error in
 * an included line names the line of the block and the line of the included
 * file. A block whose included files the extension still reads waits for
 * them: it keeps what it shows, or shows the note.
 *
 * The results also stay in the local storage of the preview, which VS Code
 * keeps for all previews of one kind across previews and restarts. So a
 * preview that opens again shows its diagrams at once, without the time that
 * the engine needs to start ([R-GEN-013](../../docs/requirements.md#r-gen-013)).
 * The diagrams use the dark mode of PlantUML with a dark color theme
 * ([R-GEN-012](../../docs/requirements.md#r-gen-012)).
 *
 * A preview loads its script as a module with the nonce of its security
 * policy. The renderer loads the engine with a dynamic import, which keeps the
 * nonce, and loads the further scripts of the engine (themes, emoji, icons)
 * with script elements that carry the nonce. Viz.js, the Graphviz layout, needs
 * WebAssembly; the renderer loads it only when the policy of the page allows
 * WebAssembly. Without it, PlantUML uses its own layout engine Smetana
 * ([R-GEN-011](../../docs/requirements.md#r-gen-011)).
 */

import { diagramLines } from '../diagram/diagramLines';
import { Diagram, diagramsOf } from '../diagram/diagramRanges';
import { Expansion, expandWith, IncludedFiles, parseIncludedFiles } from '../diagram/includes';
import { blockClass, contentClass, includesClass, settingsAttribute, sourceAttribute } from '../markdown/markdownIt';
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
 * with the index of the line of the diagram text that the message names, when it names one. For a diagram with
 * included files, the index names a line of the diagram text with the texts of the files.
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

/**
 * storedSizeLimit is the length of the longest result that the local storage keeps: the SVG text with the text that
 * the engine rendered, which can hold large included files. A longer result would take a large part of the storage,
 * which all previews of one kind share, and could make it remove every other result.
 */
const storedSizeLimit = 200_000;

/**
 * storedTotalLimit is the length of all results in the local storage together. The preview scripts of other
 * extensions in the Markdown preview share this storage and its quota of a few megabytes, so the results keep to
 * a part of it.
 */
const storedTotalLimit = 1_000_000;

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
 * Report receives a problem of a page that no diagram shows. By default the renderer writes it to the console of
 * the page; the preview of PlantUML files sends it to the log of the extension.
 */
export type Report = (message: string) => void;

/** consoleReport writes a problem to the console of the page. */
const consoleReport: Report = (message) => console.error(message);

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
 * previews and restarts. The storage keeps the most recently used results, up to a number and a total length, so
 * that the preview scripts of other extensions that share the storage keep room; each result carries its whole
 * key, so that two keys with the same hash do not mix. A full or blocked storage only means that results are not
 * kept.
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
    const item = JSON.stringify({ key, svg });
    if (item.length > storedSizeLimit) {
      return;
    }
    const id = hash(key);
    try {
      const ids = this.#use(id);
      this.#keepTotal(ids, id, item.length);
      for (;;) {
        try {
          storage.setItem(storagePrefix + id, item);
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
   * #keepTotal removes the least recently used results until all results with a new one keep to their total length.
   * @param ids - The list of the stored results, which ends with the new one; it loses the removed results.
   * @param id - The hash of the key of the new result.
   * @param length - The length of the new result.
   */
  #keepTotal(ids: string[], id: string, length: number): void {
    const storage = this.#storage!;
    const lengthOf = (other: string) => storage.getItem(storagePrefix + other)?.length ?? 0;
    let total = length + ids.reduce((sum, other) => sum + (other === id ? 0 : lengthOf(other)), 0);
    let removed = false;
    while (total > storedTotalLimit && ids[0] !== id) {
      const oldest = ids.shift()!;
      total -= lengthOf(oldest);
      storage.removeItem(storagePrefix + oldest);
      removed = true;
    }
    if (removed) {
      storage.setItem(storageIndex, JSON.stringify(ids));
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
 * bundledLibraries are the libraries of the standard library of PlantUML that the package contains, by the name of
 * their file without `.min.js`, which is the lower-case name of the library: the build copies each file of the
 * folder `stdlib/` next to the engine.
 */
export const bundledLibraries: ReadonlyMap<string, string> = new Map([['c4', 'C4']]);

/** libraryInclude matches a line that includes a file of the standard library of PlantUML, with its library. */
const libraryInclude = /^\s*!include(?:_many|_once)?\s*<([^/>]+)/;

/**
 * missingLibrary returns the message for a line that includes a file of a library of the standard library of
 * PlantUML that the package does not contain, and undefined for every other line. The engine reports such a line
 * with "Fatal parsing error" or "cannot include".
 * @param line - The line.
 */
function missingLibrary(line: string): string | undefined {
  const library = libraryInclude.exec(line)?.[1];
  if (library === undefined || bundledLibraries.has(library.toLowerCase())) {
    return undefined;
  }
  const names = [...bundledLibraries.values()].join(', ');
  return `The extension does not contain the PlantUML library ${library}. It contains only the library ${names}.`;
}

/**
 * errorOf reads the picture that the engine draws for an error in a diagram text: a line with the version of
 * PlantUML, a line `[From textarea (line N) ]` with the number of the line, the lines of the text up to that line,
 * and the message. The line number counts the lines that the engine received, which hold added lines, such as the
 * commands of the UML notation; so errorOf returns the index of the line of the diagram text instead, through the
 * origins of the lines. For a line that includes a library that the package does not contain, it returns a message
 * that says so. It returns undefined for every other image.
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
  // The texts after the line number end with the line of the error and the message.
  const [line, message] = [...svg.slice(texts.lastIndex).matchAll(svgText)].map((match) => decodeText(match[1])).slice(-2);
  // An added line, such as the @enduml line around a body, names the last line of the text before it.
  let index = Math.min(Number(from[1]) - 1, origins.length - 1);
  while (index >= 0 && origins[index] === undefined) {
    index--;
  }
  return { error: missingLibrary(line ?? '') ?? (message ?? line ?? '').trim(), line: index >= 0 ? origins[index] : undefined };
}

/** pending is the value of a content element in the shown results of a renderer while it shows the note. */
const pending = '';

/** BlockDiagram is a diagram of a block on the page, with the key of its result. */
interface BlockDiagram extends Diagram {
  /** text is the text that the engine renders: the diagram text, with the texts of its included files. */
  text: string;
  /** key names the result of the diagram: the theme, the settings and the text that the engine renders. */
  key: string;
  /** expansion holds the places of the lines of a diagram text with include lines. */
  expansion?: Expansion;
}

/** Block is a PlantUML block of the page. */
interface Block {
  element: HTMLElement;
  settings: Settings;
  dark: boolean;
  diagrams: BlockDiagram[];
  /** key names what the block shows: the results of its diagrams, and the first line of each diagram in the block. */
  key: string;
}

/** ParsedBlock is a block with the values of its element that it was read from: its attributes and its included files. */
interface ParsedBlock {
  values: readonly (string | null)[];
  dark: boolean;
  block: Block;
}

/**
 * isPending tells whether a diagram waits for included files that the extension still reads.
 * @param diagram - The diagram.
 */
const isPending = (diagram: BlockDiagram): boolean => (diagram.expansion?.pending.length ?? 0) > 0;

/**
 * blockDiagram returns a diagram of a block, with the texts of its included files.
 * @param diagram - The diagram.
 * @param files - The included files of the block, or undefined when the block carries none.
 * @param settings - The settings of the block.
 * @param dark - Whether the diagram is for a dark background.
 */
function blockDiagram({ text, line }: Diagram, files: IncludedFiles | undefined, settings: Settings, dark: boolean): BlockDiagram {
  const expansion = expandWith(text, files);
  const rendered = expansion ? expansion.lines.join('\n') : text;
  return { text: rendered, line, expansion, key: JSON.stringify([dark, settings, rendered]) };
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
  readonly #report: Report;
  readonly #results = new Map<string, Result>();
  readonly #pending = new Set<string>();
  /** #shown holds for each content element the key of the results that it shows, or `pending` for the note. */
  readonly #shown = new WeakMap<Element, string>();
  /** #parsed holds each block element as the renderer read it last, so that an unchanged element costs no work. */
  readonly #parsed = new WeakMap<Element, ParsedBlock>();
  #queue: Promise<void> = Promise.resolve();
  /** #engineFree resolves when the engine has ended a rendering that ran past the time limit. */
  #engineFree: Promise<void> = Promise.resolve();

  /**
   * @param root - The node whose PlantUML blocks the renderer renders.
   * @param loadEngine - Loads the engine; the renderer calls it before each rendering.
   * @param isDark - Tells whether the diagrams are for a dark background.
   * @param stored - Keeps the results in the local storage of the preview; undefined keeps them in memory only.
   * @param report - Receives a failed update of the page.
   */
  constructor(root: ParentNode, loadEngine: () => Promise<Engine>, isDark: () => boolean, stored?: StoredResults, report = consoleReport) {
    this.#root = root;
    this.#loadEngine = loadEngine;
    this.#isDark = isDark;
    this.#stored = stored;
    this.#report = report;
  }

  /**
   * update shows the kept results in every block that does not show them yet, and queues the rendering of the
   * diagrams without a result. A block shows its results when every diagram of the block has one. A block whose
   * included files the extension still reads keeps what it shows, or shows the note.
   */
  update(): void {
    for (const { element, settings, dark, diagrams, key } of this.#blocks()) {
      const content = contentOf(element);
      if (this.#shown.get(content) === key) {
        continue;
      }
      if (diagrams.some(isPending)) {
        if (!this.#shown.has(content)) {
          showPending(content);
          this.#shown.set(content, pending);
        }
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
      .catch((error: unknown) => this.#report(`The preview could not show a diagram: ${messageOf(error)}`));
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
   * an error names. It reads a block element again only when its attributes, its included files or the theme changed.
   */
  #blocks(): Block[] {
    const dark = this.#isDark();
    return [...this.#root.querySelectorAll<HTMLElement>(`.${blockClass}[${sourceAttribute}]`)].map((element) => {
      const values = [element.getAttribute(sourceAttribute), element.getAttribute(settingsAttribute), includesOf(element)];
      const parsed = this.#parsed.get(element);
      if (parsed && parsed.dark === dark && parsed.values.every((value, index) => value === values[index])) {
        return parsed.block;
      }
      const [source, settingsText, includesText] = values;
      const settings = parseSettings(settingsText);
      const files = parseIncludedFiles(includesText);
      const diagrams = diagramsOf(source ?? '').map((diagram) => blockDiagram(diagram, files, settings, dark));
      const block = { element, settings, dark, diagrams, key: JSON.stringify(diagrams.map(({ key, line }) => [key, line])) };
      this.#parsed.set(element, { values, dark, block });
      return block;
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
   * dropped. The engine runs in the page, so the timer runs only when the engine pauses: a rendering without a pause
   * keeps the page busy until it ends.
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
 * includesOf returns the JSON text of the files that the diagrams of a block include: the text of its hidden child
 * element, or null when the block has none.
 * @param element - The element of the block.
 */
const includesOf = (element: HTMLElement): string | null => element.querySelector(`:scope > .${includesClass}`)?.textContent ?? null;

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
 * errorText returns the message of the error of a diagram, with the number of the line of the block text that it
 * names. For a line of an included file, that is the include line, and the message also names the file and its line.
 * For an include line that the extension could not resolve, the message is the problem of the line, in place of the
 * message of the engine.
 * @param diagram - The diagram.
 * @param result - The error of the diagram.
 */
function errorText(diagram: BlockDiagram, { error, line }: { error: string; line?: number }): string {
  if (line === undefined) {
    return error;
  }
  const origin = diagram.expansion?.origins[line] ?? { line };
  const place = origin.file === undefined ? '' : ` (included file ${origin.file}, line ${(origin.fileLine ?? 0) + 1})`;
  return `Line ${diagram.line + origin.line + 1}${place}: ${diagram.expansion?.problems.get(line) ?? error}`;
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
function show(content: HTMLElement, diagrams: readonly BlockDiagram[], results: readonly Result[]): void {
  const page = content.ownerDocument;
  const message = (text: string): Element => {
    const element = page.createElement('pre');
    element.setAttribute('part', 'error');
    element.textContent = text;
    return element;
  };
  const nodes = results.map((result, index): Element => {
    if ('error' in result) {
      return message(errorText(diagrams[index], result));
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

/** bundledScripts are the further scripts of the engine that the package contains, with the files of its libraries. */
const bundledScripts = new Set(['themes.js', 'emoji.js', 'openiconic.js', ...[...bundledLibraries.keys()].map((name) => `${name}.min.js`)]);

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
 * @param loadClassicScript - Loads a classic script of the engine; by default with a script element that carries the
 *   nonce of the page. The tests with the real engine (`src/engine.test.ts`) run the scripts in Node.js instead.
 * @param report - Receives a failed load of Viz.js.
 */
export function engineLoader(folder: string, layout: Layout, loadClassicScript = loadScript, report = consoleReport): () => Promise<Engine> {
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
        loadClassicScript(folder + name).then(ok, (error: Error) => fail(error.message));
      }
      return true;
    };
    if (layout === 'graphviz') {
      // Without Viz.js, PlantUML uses Smetana, so a failed load only changes the layout engine.
      viz ??= loadClassicScript(`${folder}viz-global.js`).catch((error: unknown) =>
        report(`Graphviz (Viz.js) could not be loaded, so the diagrams use the layout engine Smetana: ${messageOf(error)}`),
      );
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
 * @param report - Receives the problems of the page that no diagram shows.
 */
export function pageRenderer(root: ParentNode, folder: string, loadEngine?: () => Promise<Engine>, report = consoleReport): PreviewRenderer {
  const layout = pageLayout();
  return new PreviewRenderer(
    root,
    loadEngine ?? engineLoader(folder, layout, loadScript, report),
    () => isDarkTheme(document.body),
    new StoredResults(pageStorage(), `${folder} ${layout}`),
    report,
  );
}
