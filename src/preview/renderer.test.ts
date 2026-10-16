// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// @vitest-environment happy-dom

/**
 * These tests run the renderer of the previews on a page of happy-dom
 * with a fake engine. They check the detection of a dark theme, the
 * rendering of one diagram at a time, the reuse of a result after the
 * preview replaced its content, the skip of a text that changed again, the new rendering after a change of the
 * theme or of the settings, the display of errors, that the bar of the
 * rendered diff stays in a block, that the text of a block never shows while
 * its diagram renders, and the results in the local storage. The real engine
 * runs in the preview of VS Code only.
 */

import { describe, expect, test } from 'vitest';
import { blockClass, contentClass, settingsAttribute, sourceAttribute } from '../markdown/markdownIt';
import { umlCommands } from '../diagram/umlNotation';
import { Engine, isDarkTheme, pendingClass, policiesAllowWebAssembly, PreviewRenderer, StoredResults } from './renderer';

/** FakeEngine records its calls and answers each call after a turn of the event loop. */
class FakeEngine implements Engine {
  readonly calls: { lines: string[]; dark: boolean }[] = [];
  running = 0;
  maxRunning = 0;

  renderToString(lines: string[], onSuccess: (svg: string) => void, onError: (message: string) => void, options?: { dark?: boolean }): void {
    this.calls.push({ lines, dark: options?.dark === true });
    this.running++;
    this.maxRunning = Math.max(this.maxRunning, this.running);
    setTimeout(() => {
      this.running--;
      if (lines.includes('fail')) {
        onError('Syntax error');
      } else {
        onSuccess(`<svg data-text="${lines.join('|')}" data-dark="${options?.dark === true}"></svg>`);
      }
    }, 0);
  }
}

/**
 * block returns the HTML of a PlantUML block as the markdown-it plugin writes it.
 * @param source - The text of the block.
 */
const block = (source: string, settings?: string): string =>
  `<div class="code-line ${blockClass}" ${sourceAttribute}="${source}"${settings ? ` ${settingsAttribute}='${settings}'` : ''}>` +
  `<div class="${contentClass}"><pre class="${blockClass}-source"><code>${source}</code></pre></div></div>`;

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

/**
 * contentOf returns the classes of the children of the content element of the first block.
 * @param root - The node of the blocks.
 */
const contentOf = (root: ParentNode) => [...root.querySelector(`.${contentClass}`)!.children].map((child) => child.tagName.toLowerCase() === 'svg' ? `svg ${child.getAttribute('data-text')}` : child.className);

/** lines returns the lines that the engine renders for a text with the default settings. */
const lines = (text: string) => ['@startuml', ...umlCommands, text, '@enduml'].join('|');

describe('PreviewRenderer', () => {
  test('shows a note, and not the text of the block, while the first diagram of a block renders', async () => {
    const root = document.createElement('div');
    root.innerHTML = block('A');
    const renderer = new PreviewRenderer(root, async () => new FakeEngine(), () => false);
    renderer.update();
    expect(contentOf(root)).toEqual([pendingClass]);
    // A second update, as the change of the page starts it, changes nothing.
    const note = root.querySelector(`.${pendingClass}`);
    renderer.update();
    expect(root.querySelector(`.${pendingClass}`)).toBe(note);
    await renderer.whenIdle();
    expect(contentOf(root)).toEqual([`svg ${lines('A')}`]);
  });

  test('keeps the last diagram of a block while its new text renders, also after the preview wrote the text again', async () => {
    const root = document.createElement('div');
    root.innerHTML = block('A');
    const renderer = new PreviewRenderer(root, async () => new FakeEngine(), () => false);
    renderer.update();
    await renderer.whenIdle();

    // The Markdown preview keeps the element of the block, sets its attributes and writes its text again.
    const element = root.querySelector<HTMLElement>(`.${blockClass}`)!;
    const written = document.createElement('div');
    written.innerHTML = block('AB');
    const fresh = written.firstElementChild as HTMLElement;
    for (const name of element.getAttributeNames()) {
      element.removeAttribute(name);
    }
    for (const name of fresh.getAttributeNames()) {
      element.setAttribute(name, fresh.getAttribute(name)!);
    }
    element.replaceChildren(...fresh.childNodes);
    renderer.update();
    expect(contentOf(root)).toEqual([`svg ${lines('A')}`]);
    await renderer.whenIdle();
    expect(contentOf(root)).toEqual([`svg ${lines('AB')}`]);
  });

  test('keeps the results in the local storage, so that another preview shows them at once', async () => {
    const storage = new FakeStorage();
    const first = document.createElement('div');
    first.innerHTML = block('A') + block('fail');
    const engine = new FakeEngine();
    const renderer = new PreviewRenderer(first, async () => engine, () => false, new StoredResults(storage as unknown as Storage, 'v1'));
    renderer.update();
    await renderer.whenIdle();
    expect(engine.calls).toHaveLength(2);

    // A new preview of the same version shows the stored diagram without the engine; an error is not stored.
    const second = document.createElement('div');
    second.innerHTML = block('A') + block('fail');
    const again = new PreviewRenderer(second, async () => engine, () => false, new StoredResults(storage as unknown as Storage, 'v1'));
    again.update();
    expect(contentOf(second)).toEqual([`svg ${lines('A')}`]);
    expect(second.querySelectorAll(`.${pendingClass}`)).toHaveLength(1);
    await again.whenIdle();
    expect(engine.calls).toHaveLength(3);

    // Another version and another theme do not use the stored diagram.
    expect(new StoredResults(storage as unknown as Storage, 'v2').get(lines('A').split('|'), false)).toBeUndefined();
    expect(new StoredResults(storage as unknown as Storage, 'v1').get(lines('A').split('|'), true)).toBeUndefined();
    expect(new StoredResults(storage as unknown as Storage, 'v1').get(lines('A').split('|'), false)).toContain('<svg');
  });

  test('the local storage keeps the most recently used results up to its limit, and makes room when it is full', () => {
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
  });


  test('renders every block, one at a time, and shows the diagram', async () => {
    const root = document.createElement('div');
    root.innerHTML = block('A -&gt; B') + block('C -&gt; D') + '<pre>other</pre>';
    const engine = new FakeEngine();
    const renderer = new PreviewRenderer(root, async () => engine, () => false);
    renderer.update();
    await renderer.whenIdle();
    expect(engine.calls.map((call) => call.lines)).toEqual([
      ['@startuml', ...umlCommands, 'A -> B', '@enduml'],
      ['@startuml', ...umlCommands, 'C -> D', '@enduml'],
    ]);
    expect(engine.maxRunning).toBe(1);
    const diagrams = [...root.querySelectorAll(`.${contentClass} > svg`)].map((svg) => svg.getAttribute('data-text'));
    expect(diagrams).toEqual([['@startuml', ...umlCommands, 'A -> B', '@enduml'].join('|'), ['@startuml', ...umlCommands, 'C -> D', '@enduml'].join('|')]);
    expect(root.querySelector(':scope > pre')?.textContent).toBe('other');
  });

  test('renders the same text once and shows the kept result after the preview replaced its content', async () => {
    const root = document.createElement('div');
    root.innerHTML = block('A') + block('A');
    const engine = new FakeEngine();
    const renderer = new PreviewRenderer(root, async () => engine, () => false);
    renderer.update();
    await renderer.whenIdle();
    expect(engine.calls).toHaveLength(1);
    expect(root.querySelectorAll('svg')).toHaveLength(2);

    // The preview writes the blocks again on every change of the document.
    root.innerHTML = block('A');
    renderer.update();
    expect(root.querySelectorAll('svg')).toHaveLength(1);
    expect(engine.calls).toHaveLength(1);
  });

  test('does not render a text that changed again before its turn, as while the user types', async () => {
    const root = document.createElement('div');
    root.innerHTML = block('A');
    const engine = new FakeEngine();
    const renderer = new PreviewRenderer(root, async () => engine, () => false);
    renderer.update();
    root.innerHTML = block('AB');
    renderer.update();
    await renderer.whenIdle();
    await renderer.whenIdle();
    expect(engine.calls.map((call) => call.lines)).toEqual([['@startuml', ...umlCommands, 'AB', '@enduml']]);
    expect(root.querySelector('svg')?.getAttribute('data-text')).toBe(['@startuml', ...umlCommands, 'AB', '@enduml'].join('|'));
  });

  test('renders again for a dark background after a change of the theme', async () => {
    const root = document.createElement('div');
    root.innerHTML = block('A');
    const engine = new FakeEngine();
    let dark = false;
    const renderer = new PreviewRenderer(root, async () => engine, () => dark);
    renderer.update();
    await renderer.whenIdle();
    dark = true;
    renderer.update();
    await renderer.whenIdle();
    expect(engine.calls.map((call) => call.dark)).toEqual([false, true]);
    expect(root.querySelector('svg')?.getAttribute('data-dark')).toBe('true');
  });

  test('renders with the settings of the block, and again when they change', async () => {
    const root = document.createElement('div');
    root.innerHTML = block('A', '{"umlNotation":false}');
    const engine = new FakeEngine();
    const renderer = new PreviewRenderer(root, async () => engine, () => false);
    renderer.update();
    await renderer.whenIdle();
    root.innerHTML = block('A');
    renderer.update();
    await renderer.whenIdle();
    expect(engine.calls.map((call) => call.lines)).toEqual([
      ['@startuml', 'A', '@enduml'],
      ['@startuml', ...umlCommands, 'A', '@enduml'],
    ]);
  });

  test('shows the message of an error above the text of the block', async () => {
    const root = document.createElement('div');
    root.innerHTML = block('fail');
    const renderer = new PreviewRenderer(root, async () => new FakeEngine(), () => false);
    renderer.update();
    await renderer.whenIdle();
    const children = [...root.querySelector(`.${contentClass}`)!.children];
    expect(children.map((child) => child.className)).toEqual([`${blockClass}-error`, `${blockClass}-source`]);
    expect(children.map((child) => child.textContent)).toEqual(['Syntax error', 'fail']);
  });

  test('keeps the bar that the rendered diff of VS Code adds to a changed block', async () => {
    const root = document.createElement('div');
    root.innerHTML = block('A');
    // The preview adds the bar after it wrote the content, before the diagram is ready.
    const bar = document.createElement('div');
    bar.className = 'diff-modification-gutter';
    root.querySelector(`.${blockClass}`)!.append(bar);
    const renderer = new PreviewRenderer(root, async () => new FakeEngine(), () => false);
    renderer.update();
    await renderer.whenIdle();
    const children = [...root.querySelector(`.${blockClass}`)!.children];
    expect(children.map((child) => child.className)).toEqual([contentClass, 'diff-modification-gutter']);
    expect(children[0].querySelector(':scope > svg')).not.toBeNull();
  });

  test('shows the error when the engine does not load', async () => {
    const root = document.createElement('div');
    root.innerHTML = block('A');
    const renderer = new PreviewRenderer(root, () => Promise.reject(new Error('The engine did not load.')), () => false);
    renderer.update();
    await renderer.whenIdle();
    expect(root.querySelector(`.${blockClass}-error`)?.textContent).toBe('The engine did not load.');
  });
});
