// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// @vitest-environment happy-dom

/**
 * These tests run the renderer of the preview script on a page of happy-dom
 * with a fake engine. They check the detection of a dark theme, the
 * rendering of one diagram at a time, the reuse of a result after the
 * preview replaced its content, the new rendering after a change of the
 * theme or of the settings, the display of errors, and that the bar of the
 * rendered diff stays in a block. The real engine runs in the preview of
 * VS Code only.
 */

import { describe, expect, test } from 'vitest';
import { blockClass, contentClass, settingsAttribute, sourceAttribute } from '../markdown/markdownIt';
import { umlCommands } from '../diagram/umlNotation';
import { Engine, isDarkTheme, PreviewRenderer } from './markdownPreview';

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

describe('PreviewRenderer', () => {
  test('renders every block, one at a time, and shows the diagram', async () => {
    const root = document.createElement('div');
    root.innerHTML = block('A -&gt; B') + block('C -&gt; D') + '<pre>other</pre>';
    const engine = new FakeEngine();
    const renderer = new PreviewRenderer(root, async () => engine, () => false);
    renderer.update();
    await renderer.whenIdle();
    expect(engine.calls.map((call) => call.lines)).toEqual([
      ['@startuml', 'A -> B', '@enduml'],
      ['@startuml', 'C -> D', '@enduml'],
    ]);
    expect(engine.maxRunning).toBe(1);
    const diagrams = [...root.querySelectorAll(`.${contentClass} > svg`)].map((svg) => svg.getAttribute('data-text'));
    expect(diagrams).toEqual(['@startuml|A -> B|@enduml', '@startuml|C -> D|@enduml']);
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
    root.innerHTML = block('A', '{"classIcons":false}');
    const engine = new FakeEngine();
    const renderer = new PreviewRenderer(root, async () => engine, () => false);
    renderer.update();
    await renderer.whenIdle();
    root.innerHTML = block('A');
    renderer.update();
    await renderer.whenIdle();
    expect(engine.calls.map((call) => call.lines)).toEqual([
      ['@startuml', ...umlCommands, 'A', '@enduml'],
      ['@startuml', 'A', '@enduml'],
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
