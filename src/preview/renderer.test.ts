// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// @vitest-environment happy-dom

/**
 * These tests run the renderer of the previews on a page of happy-dom with a
 * fake engine. They check the detection of a dark theme (R-GEN-012) and of
 * WebAssembly (R-GEN-011), the rendering of one diagram at a time, every
 * diagram of a block (R-GEN-009), the results in memory and in the local
 * storage (R-GEN-013), the skip of a text that changed again, the new
 * rendering after a change of the theme or of the settings, the display of
 * errors with the line of the text (R-GEN-010), the included files of a block
 * (R-GEN-008), the labels for screen readers, that the elements of the page
 * stay as the page wrote them, the time limit (R-GEN-010), and the load of
 * the engine.
 * `src/engine.test.ts` runs the real engine.
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { IncludedFiles, mayInclude } from '../diagram/includes';
import { umlCommands } from '../diagram/umlNotation';
import { blockClass, contentClass, pageIncludesClass, textClass } from '../markdown/markdownIt';
import { defaultSettings } from '../settings';
import { errorPicture, escapeXml, FakeEngine } from '../test/fakeEngine';
import { fence, renderMarkdown } from '../test/markdownPreview';
import { engineLoader, errorOf, isDarkTheme, pageRenderer, policiesAllowWebAssembly, PreviewRenderer, StoredResults } from './renderer';

/**
 * page returns an element with the HTML of a Markdown text, as the Markdown preview writes it.
 * @param text - The Markdown text.
 * @param settings - The settings of the extension.
 */
function page(text: string, settings = defaultSettings): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = renderMarkdown(text, settings);
  return root;
}

/**
 * shown returns what the shadow root of each block of a page shows: `svg` with the lines of the diagram, the part
 * name and the text of a note or an error, or `text` for the text of the block below an error.
 * @param root - The node of the blocks.
 */
const shown = (root: ParentNode): string[][] =>
  [...root.querySelectorAll(`.${contentClass}`)].map((content) =>
    [...(content.shadowRoot?.children ?? [])].map((child) => {
      if (child.localName === 'svg') {
        return `svg ${child.getAttribute('data-text')}`;
      }
      return child.localName === 'slot' ? 'text' : `${child.getAttribute('part')!.split(' ')[0]} ${child.textContent}`;
    }),
  );

/**
 * includingPage returns an element with the HTML of a Markdown text whose blocks include files, as the Markdown
 * preview writes it with the included files that the extension read.
 * @param text - The Markdown text.
 * @param files - The included files of each block whose text includes files.
 */
function includingPage(text: string, files: IncludedFiles): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = renderMarkdown(text, defaultSettings, (source) => (mayInclude(source) ? files : undefined));
  return root;
}

/** lines returns the lines that the engine renders for a body with the default settings, joined with `|`. */
const lines = (...body: string[]) => ['@startuml', ...umlCommands, ...body, '@enduml'].join('|');

afterEach(() => {
  vi.useRealTimers();
});

describe('isDarkTheme', () => {
  test('follows the class of the theme kind on the body', () => {
    const body = document.createElement('body');
    const cases: [string, boolean][] = [
      ['vscode-light', false],
      ['vscode-dark', true],
      ['vscode-high-contrast', true],
      ['vscode-high-contrast vscode-high-contrast-light', false],
    ];
    for (const [classes, dark] of cases) {
      body.className = classes;
      expect(isDarkTheme(body), classes).toBe(dark);
    }
  });
});

describe('policiesAllowWebAssembly', () => {
  test('reads the script sources of the security policies of the Markdown preview', () => {
    // The policy of the security levels "Strict" and "Allow insecure content", and of the level "Disable".
    const strict = "default-src 'none'; img-src 'self' https: data:; script-src 'nonce-abc'; style-src 'self' 'unsafe-inline';";
    expect(policiesAllowWebAssembly([strict])).toBe(false);
    expect(policiesAllowWebAssembly([''])).toBe(true);
    expect(policiesAllowWebAssembly([])).toBe(true);
  });

  test('allows WebAssembly when every policy allows it, by script-src or else by default-src', () => {
    expect(policiesAllowWebAssembly(["script-src 'nonce-a' 'wasm-unsafe-eval'"])).toBe(true);
    expect(policiesAllowWebAssembly(["default-src 'self' 'unsafe-eval'"])).toBe(true);
    expect(policiesAllowWebAssembly(["default-src 'unsafe-eval'; script-src 'self'"])).toBe(false);
    expect(policiesAllowWebAssembly(["img-src data:", "script-src 'self'"])).toBe(false);
  });
});

/** FakeStorage stands for the local storage of a page, with a limit of the length of all its keys and values. */
class FakeStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  readonly items = new Map<string, string>();
  constructor(readonly capacity = Infinity) {}

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    const used = [...this.items].reduce((sum, [other, text]) => sum + (other === key ? 0 : other.length + text.length), 0);
    if (used + key.length + value.length > this.capacity) {
      throw new DOMException('The storage is full.', 'QuotaExceededError');
    }
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

describe('StoredResults', () => {
  test('keeps the results in the local storage, so that another preview shows them at once', async () => {
    const storage = new FakeStorage();
    const first = page(fence('A') + fence('fail'));
    const engine = new FakeEngine();
    const renderer = new PreviewRenderer(first, async () => engine, () => false, new StoredResults(storage as unknown as Storage, 'v1'));
    renderer.update();
    await renderer.whenIdle();
    expect(engine.calls).toHaveLength(2);

    // A new preview of the same version shows the stored diagram without the engine; an error is not stored.
    const second = page(fence('A') + fence('fail'));
    const again = new PreviewRenderer(second, async () => engine, () => false, new StoredResults(storage as unknown as Storage, 'v1'));
    again.update();
    expect(shown(second)).toEqual([[`svg ${lines('A')}`], ['pending Rendering the diagram…']]);
    await again.whenIdle();
    expect(engine.calls).toHaveLength(3);

    // Another version and another theme do not use the stored diagram.
    expect(new StoredResults(storage as unknown as Storage, 'v2').get(lines('A').split('|'), false)).toBeUndefined();
    expect(new StoredResults(storage as unknown as Storage, 'v1').get(lines('A').split('|'), true)).toBeUndefined();
    expect(new StoredResults(storage as unknown as Storage, 'v1').get(lines('A').split('|'), false)).toContain('<svg');
  });

  test('keeps the most recently used results up to its limit, and makes room when it is full', () => {
    const storage = new FakeStorage();
    const stored = new StoredResults(storage as unknown as Storage, 'v1');
    for (let index = 0; index < 60; index++) {
      stored.set([`D${index}`], false, `<svg>${index}</svg>`);
    }
    // Using the oldest kept result makes it the most recently used one.
    expect(stored.get(['D0'], false)).toBeUndefined();
    expect(stored.get(['D10'], false)).toBe('<svg>10</svg>');
    stored.set(['D60'], false, '<svg>60</svg>');
    expect(stored.get(['D10'], false)).toBe('<svg>10</svg>');
    expect(stored.get(['D11'], false)).toBeUndefined();
    expect(storage.items.size).toBe(51);

    // A full storage removes the least recently used results until the new one fits.
    const small = new FakeStorage(1500);
    const kept = new StoredResults(small as unknown as Storage, 'v1');
    for (let index = 0; index < 10; index++) {
      kept.set([`D${index}`], false, `<svg>${'x'.repeat(200)}</svg>`);
    }
    expect(kept.get(['D9'], false)).toContain('<svg>');
    expect(kept.get(['D0'], false)).toBeUndefined();

    // A result larger than the whole storage is not kept, and a page without a storage keeps nothing; neither throws.
    kept.set(['big'], false, `<svg>${'x'.repeat(2000)}</svg>`);
    expect(kept.get(['big'], false)).toBeUndefined();
    const none = new StoredResults(undefined, 'v1');
    none.set(['A'], false, '<svg></svg>');
    expect(none.get(['A'], false)).toBeUndefined();

    // A result with a long text, for example with large included files, is not kept, and removes no other result.
    const count = storage.items.size;
    stored.set(['x'.repeat(200_000)], false, '<svg></svg>');
    expect(storage.items.size).toBe(count);
    expect(stored.get(['D60'], false)).toBe('<svg>60</svg>');
  });

  test('keeps all results within a total length, so that the other scripts of a preview keep room in the storage', () => {
    const storage = new FakeStorage();
    const stored = new StoredResults(storage as unknown as Storage, 'v1');
    for (let index = 0; index < 10; index++) {
      stored.set([`D${index}`], false, `<svg>${'x'.repeat(150_000)}</svg>`);
    }
    // Six results of 150,000 characters fit into 1,000,000 characters; the least recently used ones are removed.
    const total = [...storage.items.values()].reduce((sum, value) => sum + value.length, 0);
    expect(total).toBeLessThanOrEqual(1_000_000 + 1000);
    expect(stored.get(['D3'], false)).toBeUndefined();
    expect(stored.get(['D4'], false)).toContain('<svg>');
    expect(stored.get(['D9'], false)).toContain('<svg>');
    expect(JSON.parse(storage.getItem('nimblescape-plantuml:index')!)).toHaveLength(6);
  });
});

describe('PreviewRenderer', () => {
  test('shows a note, and not the text of the block, while the diagrams of a new block render', async () => {
    const root = page(fence('A'));
    const written = root.innerHTML;
    const renderer = new PreviewRenderer(root, async () => new FakeEngine(), () => false);
    renderer.update();
    expect(shown(root)).toEqual([['pending Rendering the diagram…']]);
    // Screen readers announce the note.
    const note = root.querySelector(`.${contentClass}`)!.shadowRoot!.firstElementChild!;
    expect(note.getAttribute('role')).toBe('status');
    // A second update changes nothing.
    renderer.update();
    expect(root.querySelector(`.${contentClass}`)!.shadowRoot!.firstElementChild).toBe(note);
    await renderer.whenIdle();
    expect(shown(root)).toEqual([[`svg ${lines('A')}`]]);
    // The elements of the page stay as the page wrote them, apart from the state of the block (R-MD-007); the shadow
    // root hides the text.
    expect(root.innerHTML).toBe(written.replace(`class="${contentClass}"`, `class="${contentClass}" data-plantuml-state="drawn"`));
  });

  test('renders every diagram of a block, one at a time, and leaves the other elements of the page as they are', async () => {
    const root = page(fence("' The flow\n@startuml\nA -> B\n@enduml\n@startuml\nC -> D") + '<pre>other</pre>\n');
    const engine = new FakeEngine();
    const renderer = new PreviewRenderer(root, async () => engine, () => false);
    renderer.update();
    await renderer.whenIdle();
    // The second diagram gets its missing end line.
    expect(engine.calls.map((call) => call.lines)).toEqual([
      ['@startuml', ...umlCommands, 'A -> B', '@enduml'],
      ['@startuml', ...umlCommands, 'C -> D', '@enduml'],
    ]);
    expect(engine.maxRunning).toBe(1);
    // A diagram has no largest size, so that large diagrams render.
    expect(engine.calls.map((call) => call.options)).toEqual([
      { dark: false, maxSvgSize: 0 },
      { dark: false, maxSvgSize: 0 },
    ]);
    expect(shown(root)).toEqual([[`svg ${lines('A -> B')}`, `svg ${lines('C -> D')}`]]);
    const diagrams = [...root.querySelector(`.${contentClass}`)!.shadowRoot!.children];
    expect(diagrams.map((diagram) => diagram.getAttribute('part'))).toEqual(['diagram', 'diagram following']);
    expect(root.querySelector(':scope > pre')?.textContent).toBe('other');
  });

  test('labels each diagram for screen readers, with its title when it has one', async () => {
    const root = page(fence('title The Order Flow\nA -> B') + fence('C -> D'));
    const renderer = new PreviewRenderer(root, async () => new FakeEngine(), () => false);
    renderer.update();
    await renderer.whenIdle();
    const diagrams = [...root.querySelectorAll(`.${contentClass}`)].map((content) => content.shadowRoot!.querySelector('svg')!);
    expect(diagrams.map((svg) => svg.getAttribute('role'))).toEqual(['img', 'img']);
    expect(diagrams.map((svg) => svg.getAttribute('aria-label'))).toEqual(['PlantUML diagram: The Order Flow', 'PlantUML diagram']);
  });

  test('renders the same text once and shows the kept result in a new block at once', async () => {
    const root = page(fence('A') + fence('A'));
    const engine = new FakeEngine();
    const renderer = new PreviewRenderer(root, async () => engine, () => false);
    renderer.update();
    await renderer.whenIdle();
    expect(engine.calls).toHaveLength(1);
    expect(shown(root)).toEqual([[`svg ${lines('A')}`], [`svg ${lines('A')}`]]);

    // The preview writes a new block, for example after a new paragraph before it.
    root.innerHTML = renderMarkdown(`Text\n\n${fence('A')}`);
    renderer.update();
    expect(shown(root)).toEqual([[`svg ${lines('A')}`]]);
    expect(engine.calls).toHaveLength(1);
  });

  test('keeps the last diagrams of a block while its new text renders', async () => {
    const root = page(fence('A'));
    const engine = new FakeEngine();
    const renderer = new PreviewRenderer(root, async () => engine, () => false);
    renderer.update();
    await renderer.whenIdle();

    // The Markdown preview keeps the elements of a changed block and changes their attributes and text.
    const element = root.querySelector<HTMLElement>(`.${blockClass}`)!;
    const next = page(fence('AB')).querySelector(`.${blockClass}`)!;
    for (const name of next.getAttributeNames()) {
      element.setAttribute(name, next.getAttribute(name)!);
    }
    element.querySelector('code')!.textContent = 'AB';
    renderer.update();
    expect(shown(root)).toEqual([[`svg ${lines('A')}`]]);
    await renderer.whenIdle();
    expect(shown(root)).toEqual([[`svg ${lines('AB')}`]]);
  });

  test('does not render a text that changed again before its turn, as while the user types', async () => {
    const root = page(fence('A'));
    const engine = new FakeEngine();
    const renderer = new PreviewRenderer(root, async () => engine, () => false);
    renderer.update();
    root.innerHTML = renderMarkdown(fence('AB'));
    renderer.update();
    await renderer.whenIdle();
    expect(engine.calls.map((call) => call.lines)).toEqual([['@startuml', ...umlCommands, 'AB', '@enduml']]);
    expect(shown(root)).toEqual([[`svg ${lines('AB')}`]]);
  });

  test('renders again for a dark background after a change of the theme', async () => {
    const root = page(fence('A'));
    const engine = new FakeEngine();
    let dark = false;
    const renderer = new PreviewRenderer(root, async () => engine, () => dark);
    renderer.update();
    await renderer.whenIdle();
    dark = true;
    renderer.update();
    await renderer.whenIdle();
    expect(engine.calls.map((call) => call.options?.dark)).toEqual([false, true]);
    expect(root.querySelector(`.${contentClass}`)!.shadowRoot!.querySelector('svg')?.getAttribute('data-dark')).toBe('true');
  });

  test('renders with the settings of the block, and again when they change', async () => {
    const root = page(fence('A'), { umlNotation: false });
    const engine = new FakeEngine();
    const renderer = new PreviewRenderer(root, async () => engine, () => false);
    renderer.update();
    await renderer.whenIdle();
    root.innerHTML = renderMarkdown(fence('A'));
    renderer.update();
    await renderer.whenIdle();
    expect(engine.calls.map((call) => call.lines)).toEqual([
      ['@startuml', 'A', '@enduml'],
      ['@startuml', ...umlCommands, 'A', '@enduml'],
    ]);
  });

  test('shows the message of an error above the text of the block', async () => {
    const root = page(fence('fail'));
    const renderer = new PreviewRenderer(root, async () => new FakeEngine(), () => false);
    renderer.update();
    await renderer.whenIdle();
    expect(shown(root)).toEqual([['error Syntax error', 'text']]);
    // The slot shows the text of the block from the content element.
    expect(root.querySelector(`.${contentClass} > .${textClass}`)?.textContent).toBe('fail\n');
  });

  test('shows an error picture of the engine as a message with the number of the line of the block text', async () => {
    // The engine counts the lines that it received, among them the lines that the extension added.
    const root = page(fence('class A\nwrong') + fence("' The classes\n\n@startuml\nclass B\nwrong\n@enduml"));
    const renderer = new PreviewRenderer(root, async () => new FakeEngine(), () => false);
    renderer.update();
    await renderer.whenIdle();
    expect(shown(root)).toEqual([
      ['error Line 2: Syntax Error? (Assumed diagram type: class)', 'text'],
      ['error Line 5: Syntax Error? (Assumed diagram type: class)', 'text'],
    ]);
  });

  test('keeps the bar that the rendered diff of VS Code adds to a changed block', async () => {
    const root = page(fence('A'));
    // The preview adds the bar after it wrote the content, before the diagram is ready.
    const bar = document.createElement('div');
    bar.className = 'diff-modification-gutter';
    root.querySelector(`.${blockClass}`)!.append(bar);
    const renderer = new PreviewRenderer(root, async () => new FakeEngine(), () => false);
    renderer.update();
    await renderer.whenIdle();
    const children = [...root.querySelector(`.${blockClass}`)!.children];
    expect(children.map((child) => child.className)).toEqual([contentClass, 'diff-modification-gutter']);
    expect(shown(root)).toEqual([[`svg ${lines('A')}`]]);
  });

  test('shows the error when the engine does not load', async () => {
    const root = page(fence('A'));
    const renderer = new PreviewRenderer(root, () => Promise.reject(new Error('The engine did not load.')), () => false);
    renderer.update();
    await renderer.whenIdle();
    expect(shown(root)).toEqual([['error The engine did not load.', 'text']]);
  });

  test('an unexpected error in a rendering shows in its block, and the next renderings still run', async () => {
    const root = page(fence('A'));
    const engine = new FakeEngine();
    let failing = false;
    const renderer = new PreviewRenderer(root, async () => engine, () => {
      if (failing) {
        failing = false;
        throw new Error('The page failed.');
      }
      return false;
    });
    renderer.update();
    // The page fails once while the rendering runs.
    failing = true;
    await renderer.whenIdle();
    expect(shown(root)).toEqual([['error The page failed.', 'text']]);

    root.innerHTML = renderMarkdown(fence('B'));
    renderer.update();
    await renderer.whenIdle();
    expect(shown(root)).toEqual([[`svg ${lines('B')}`]]);
  });

  test('fails a rendering after the time limit, renders the next diagram after the late end, and drops the late result', async () => {
    vi.useFakeTimers();
    const root = page(fence('slow') + fence('B'));
    const engine = new FakeEngine();
    const renderer = new PreviewRenderer(root, async () => engine, () => false);
    renderer.update();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(shown(root)).toEqual([['error The rendering of the diagram took too long.', 'text'], ['pending Rendering the diagram…']]);
    // The engine still works on the first diagram, so the second one waits.
    expect(engine.calls).toHaveLength(1);

    engine.held[0]();
    await vi.advanceTimersByTimeAsync(0);
    await renderer.whenIdle();
    expect(shown(root)).toEqual([['error The rendering of the diagram took too long.', 'text'], [`svg ${lines('B')}`]]);
  });

  test('renders the next diagram one more time limit later when the engine does not end a rendering', async () => {
    vi.useFakeTimers();
    const root = page(fence('slow') + fence('B'));
    const engine = new FakeEngine();
    const renderer = new PreviewRenderer(root, async () => engine, () => false);
    renderer.update();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(engine.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60_001);
    await renderer.whenIdle();
    expect(shown(root)[1]).toEqual([`svg ${lines('B')}`]);
  });
});

describe('PreviewRenderer with included files', () => {
  test('renders the text of a block with the texts of its included files', async () => {
    const root = includingPage(fence('!include styles.puml\nA'), { 'styles.puml': { text: 'skinparam a 1\nskinparam b 2' } });
    const engine = new FakeEngine();
    const renderer = new PreviewRenderer(root, async () => engine, () => false);
    renderer.update();
    await renderer.whenIdle();
    expect(engine.calls.map((call) => call.lines)).toEqual([['@startuml', ...umlCommands, 'skinparam a 1', 'skinparam b 2', 'A', '@enduml']]);
    expect(shown(root)).toEqual([[`svg ${lines('skinparam a 1', 'skinparam b 2', 'A')}`]]);
  });

  test('names the include line and the line of the included file in the message of an error in the file', async () => {
    const root = includingPage(fence('A\n!include lib/styles.puml'), { 'lib/styles.puml': { text: 'skinparam a 1\nwrong' } });
    const renderer = new PreviewRenderer(root, async () => new FakeEngine(), () => false);
    renderer.update();
    await renderer.whenIdle();
    expect(shown(root)).toEqual([['error Line 2 (included file lib/styles.puml, line 2): Syntax Error? (Assumed diagram type: class)', 'text']]);
  });

  test('shows the problem of an include line in place of the message of the engine, also without included files', async () => {
    const root = includingPage(fence('A\n!include missing.puml') + fence('B\n!includesub parts.puml!PART'), {
      'missing.puml': { problem: 'The file missing.puml does not exist.' },
      'parts.puml': { text: 'C' },
    });
    const renderer = new PreviewRenderer(root, async () => new FakeEngine(), () => false);
    renderer.update();
    await renderer.whenIdle();
    expect(shown(root)).toEqual([
      ['error Line 2: The file missing.puml does not exist.', 'text'],
      ['error Line 2: The file parts.puml has no lines between !startsub PART and !endsub.', 'text'],
    ]);
    // A page without the element of the included files, for example without the extension in the host, names them.
    const without = page(fence('!include other.puml'));
    const other = new PreviewRenderer(without, async () => new FakeEngine(), () => false);
    other.update();
    await other.whenIdle();
    expect(shown(without)).toEqual([['error Line 1: The preview did not receive the included file other.puml.', 'text']]);
  });

  test('waits for the included files that the extension still reads, and renders when they come', async () => {
    const root = includingPage(fence('A'), {});
    const engine = new FakeEngine();
    const renderer = new PreviewRenderer(root, async () => engine, () => false);
    renderer.update();
    await renderer.whenIdle();
    expect(shown(root)).toEqual([[`svg ${lines('A')}`]]);

    // A new include line names a file that the extension reads now: the block keeps its diagram. The Markdown preview
    // changes the attributes of the block and the element of the included files in place.
    const block = root.querySelector<HTMLElement>(`.${blockClass}`)!;
    const replace = (files: IncludedFiles) => {
      const nextPage = includingPage(fence('A\n!include b.puml'), files);
      const next = nextPage.querySelector(`.${blockClass}`)!;
      next.getAttributeNames().forEach((name) => block.setAttribute(name, next.getAttribute(name)!));
      root.querySelector(`.${pageIncludesClass}`)?.remove();
      root.append(nextPage.querySelector(`.${pageIncludesClass}`)!);
      renderer.update();
    };
    replace({});
    await renderer.whenIdle();
    expect(engine.calls).toHaveLength(1);
    expect(shown(root)).toEqual([[`svg ${lines('A')}`]]);
    replace({ 'b.puml': { text: 'B' } });
    await renderer.whenIdle();
    expect(shown(root)).toEqual([[`svg ${lines('A', 'B')}`]]);

    // A change of the included file renders the block again.
    replace({ 'b.puml': { text: 'B2' } });
    await renderer.whenIdle();
    expect(shown(root)).toEqual([[`svg ${lines('A', 'B2')}`]]);
    expect(engine.calls).toHaveLength(3);
  });

  test('shows the note in a new block whose included files the extension still reads', () => {
    const root = includingPage(fence('!include a.puml'), {});
    expect(root.querySelector(`.${blockClass} + .${pageIncludesClass}`)?.textContent).toBe('{}');
    const renderer = new PreviewRenderer(root, async () => new FakeEngine(), () => false);
    renderer.update();
    expect(shown(root)).toEqual([['pending Rendering the diagram…']]);
  });
});

describe('errorOf', () => {
  test('reads the message and the line of an error picture, and no other image', () => {
    const picture = errorPicture(['@startuml', 'skinparam style strictuml', 'class A {', 'wrong <b>', '@enduml']);
    expect(errorOf(picture, [0, undefined, 1, 2, 3])).toEqual({ error: 'Syntax Error? (Assumed diagram type: class)', line: 2 });
    // A line that the extension added names the line of the text before it.
    expect(errorOf(picture, [undefined, undefined, 0, undefined, 1])).toEqual({ error: 'Syntax Error? (Assumed diagram type: class)', line: 0 });
    expect(errorOf(picture, [undefined, undefined, undefined, undefined])).toEqual({ error: 'Syntax Error? (Assumed diagram type: class)', line: undefined });
    expect(errorOf('<svg><text>PlantUML version 1</text><text>A &amp; B</text></svg>', [0])).toBeUndefined();
    expect(errorOf('<svg><g class="title"><text>PlantUML version 1</text></g></svg>', [0])).toBeUndefined();
  });

  test('names a library of PlantUML that the package does not contain, at the line that includes it', () => {
    const picture = (line: string, message: string) =>
      `<svg>${['PlantUML version 1', '[From textarea (line 2) ]', ' ', '@startuml', line, message].map((text) => `<text>${escapeXml(text)}</text>`).join('')}</svg>`;
    const missing = (library: string) => `The extension does not contain the PlantUML library ${library}. It contains only the library C4.`;
    expect(errorOf(picture('!include <aws/common>', ' Fatal parsing error'), [0, 1, 2])).toEqual({ error: missing('aws'), line: 1 });
    expect(errorOf(picture('  !include_once <classy-c4/c4>', ' cannot include <classy-c4/c4>'), [0, 1, 2])).toEqual({ error: missing('classy-c4'), line: 1 });
    // A file that the library C4 does not have, and an include of a local file, keep the message of the engine.
    expect(errorOf(picture('!include <C4/NoSuchFile>', ' cannot include <C4/NoSuchFile>'), [0, 1, 2])).toEqual({ error: 'cannot include <C4/NoSuchFile>', line: 1 });
    expect(errorOf(picture('!include styles.puml', ' cannot include styles.puml'), [0, 1, 2])).toEqual({ error: 'cannot include styles.puml', line: 1 });
  });

  test('decodes the entities of the message', () => {
    const picture = `<svg><text>PlantUML version 1</text><text>[From textarea (line 1) ]</text><text> cannot include &lt;a&gt; &amp; &#228;&#x1F600; &#x110000;</text></svg>`;
    expect(errorOf(picture, [0])).toEqual({ error: 'cannot include <a> & ä😀 &#x110000;', line: 0 });
  });
});

describe('pageRenderer', () => {
  test('keeps the stored results of each layout engine apart, as the security of the preview decides the layout engine', async () => {
    const folder = 'https://extension.test/dist/engine/';
    localStorage.clear();
    new StoredResults(localStorage, `${folder} graphviz`).set(lines('A').split('|'), false, '<svg data-text="graphviz"></svg>');
    const engine = new FakeEngine();

    // The policy of the Markdown preview with the security levels "Strict" and "Allow insecure content".
    const policy = document.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content = "default-src 'none'; script-src 'nonce-a'";
    document.head.append(policy);
    const strict = page(fence('A'));
    const smetana = pageRenderer(strict, folder, async () => engine);
    smetana.update();
    expect(shown(strict)).toEqual([['pending Rendering the diagram…']]);
    await smetana.whenIdle();

    policy.remove();
    const disabled = page(fence('A'));
    pageRenderer(disabled, folder, async () => engine).update();
    expect(shown(disabled)).toEqual([['svg graphviz']]);
    expect(engine.calls).toHaveLength(1);
  });
});

describe('engineLoader', () => {
  test('loads the engine again after a failed load', async () => {
    const load = engineLoader('file:///no/such/folder/', 'smetana');
    const first = load();
    expect(load()).toBe(first);
    await expect(first).rejects.toThrow();
    const second = load();
    expect(second).not.toBe(first);
    await expect(second).rejects.toThrow();
  });

  test('reports a failed load of Viz.js, which only changes the layout engine', async () => {
    const reports: string[] = [];
    const blocked = async () => {
      throw new Error('blocked');
    };
    const load = engineLoader('file:///no/such/folder/', 'graphviz', blocked, (message) => reports.push(message));
    // The folder has no engine either.
    await expect(load()).rejects.toThrow();
    expect(reports).toEqual(['Graphviz (Viz.js) could not be loaded, so the diagrams use the layout engine Smetana: blocked']);
  });
});
