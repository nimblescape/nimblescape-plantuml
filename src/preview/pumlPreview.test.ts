// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// @vitest-environment happy-dom

/**
 * These tests check the page of the preview of PlantUML files (R-PUML-002,
 * R-PUML-003) and of their rendered diff (R-PUML-004): the split of a file
 * into its diagrams, the pairs of diagrams of two versions, the blocks and
 * rows that the page writes and reuses, the labels of the changes, the text
 * of a diagram below an error, and the security policy of the page.
 */

import { describe, expect, test } from 'vitest';
import { blockClass, contentClass, settingsAttribute, sourceAttribute, textClass } from '../markdown/markdownIt';
import { FakeEngine } from '../test/fakeEngine';
import { diagramSources, diffRows, emptyClass, labelClass, rowClass, showDiagrams, showDiff, sideClass } from './pumlPreview';
import { previewHtml } from './previewHtml';
import { PreviewRenderer } from './renderer';

describe('diagramSources', () => {
  test('splits a file into its diagrams and ignores the text between them', () => {
    expect(diagramSources('@startuml\nA -> B\n@enduml\ntext\n@startmindmap\n* a\n@endmindmap\n@startuml\nC')).toEqual([
      '@startuml\nA -> B\n@enduml',
      '@startmindmap\n* a\n@endmindmap',
      '@startuml\nC',
    ]);
  });

  test('takes a text without @start lines as one diagram, and blank text as none', () => {
    expect(diagramSources('A -> B\n')).toEqual(['A -> B\n']);
    expect(diagramSources(' \n')).toEqual([]);
  });
});

describe('showDiagrams', () => {
  test('writes one block for each diagram and reuses the blocks of the last message', () => {
    const container = document.createElement('main');
    showDiagrams(container, { type: 'update', text: '@startuml\nA\n@enduml\n@startuml\nB\n@enduml', settings: { umlNotation: true } });
    const first = container.querySelector(`.${blockClass}`);
    expect([...container.children].map((block) => block.getAttribute(sourceAttribute))).toEqual(['@startuml\nA\n@enduml', '@startuml\nB\n@enduml']);
    expect(first?.hasAttribute(settingsAttribute)).toBe(false);

    showDiagrams(container, { type: 'update', text: '@startuml\nA2\n@enduml', settings: { umlNotation: false } });
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild).toBe(first);
    expect(first?.getAttribute(sourceAttribute)).toBe('@startuml\nA2\n@enduml');
    expect(first?.getAttribute(settingsAttribute)).toBe('{"umlNotation":false}');
    expect(first?.querySelector(`:scope > .${contentClass} > .${textClass} > code`)?.textContent).toBe('@startuml\nA2\n@enduml');
  });

  test('writes the text of each diagram into its block, which the renderer shows below an error', async () => {
    const container = document.createElement('main');
    showDiagrams(container, { type: 'update', text: '@startuml\nfail\n@enduml', settings: { umlNotation: true } });
    const renderer = new PreviewRenderer(container, async () => new FakeEngine(), () => false);
    renderer.update();
    await renderer.whenIdle();
    const content = container.querySelector(`.${contentClass}`)!;
    expect([...content.shadowRoot!.children].map((child) => child.localName)).toEqual(['pre', 'slot']);
    expect(content.querySelector(`:scope > .${textClass}`)?.textContent).toBe('@startuml\nfail\n@enduml');
  });

  test('shows a message for a file without a diagram', () => {
    const container = document.createElement('main');
    showDiagrams(container, { type: 'update', text: '', settings: { umlNotation: true } });
    expect(container.querySelector(`.${emptyClass}`)?.textContent).toBe('The file has no diagram.');
    showDiagrams(container, { type: 'update', text: 'A -> B', settings: { umlNotation: true } });
    expect(container.querySelector(`.${emptyClass}`)).toBeNull();
  });
});

describe('diffRows', () => {
  test('pairs equal diagrams as unchanged and the others in their order as modified, removed or added', () => {
    expect(diffRows(['A', 'B', 'C', 'D'], ['A', 'B2', 'C', 'E', 'F'])).toEqual([
      { original: 'A', modified: 'A', change: 'unchanged' },
      { original: 'B', modified: 'B2', change: 'modified' },
      { original: 'C', modified: 'C', change: 'unchanged' },
      { original: 'D', modified: 'E', change: 'modified' },
      { modified: 'F', change: 'added' },
    ]);
    expect(diffRows(['A', 'B', 'C'], ['C'])).toEqual([
      { original: 'A', change: 'removed' },
      { original: 'B', change: 'removed' },
      { original: 'C', modified: 'C', change: 'unchanged' },
    ]);
    expect(diffRows(['A'], ['X', 'A'])).toEqual([
      { modified: 'X', change: 'added' },
      { original: 'A', modified: 'A', change: 'unchanged' },
    ]);
    expect(diffRows([], [])).toEqual([]);
  });
});

describe('showDiff', () => {
  /** sides returns the change and the label and the text of the two sides of each row; '-' marks an empty side. */
  const sides = (container: HTMLElement) =>
    [...container.querySelectorAll(`.${rowClass}`)].map((row) => [
      row.className,
      ...[...row.querySelectorAll(`:scope > .${sideClass}`)].map((side) => {
        const label = side.querySelector(`:scope > .${labelClass}`)?.textContent;
        const source = side.querySelector(`.${blockClass}`)?.getAttribute(sourceAttribute) ?? '-';
        return label ? `${label}: ${source}` : source;
      }),
    ]);

  test('writes one row for each pair of diagrams, with the change in its class and in labels, and reuses the rows', () => {
    const container = document.createElement('main');
    const message = (original: string, text: string) => ({ type: 'update' as const, original, text, settings: { umlNotation: true } });
    const [a, b, b2, c] = ['A', 'B', 'B2', 'C'].map((name) => `@startuml\n${name}\n@enduml`);
    showDiff(container, message([a, b].join('\n'), [a, b2, c].join('\n')));
    expect(sides(container)).toEqual([
      [`${rowClass} ${rowClass}-unchanged`, a, a],
      [`${rowClass} ${rowClass}-modified`, `Changed: ${b}`, `Changed: ${b2}`],
      [`${rowClass} ${rowClass}-added`, '-', `Added: ${c}`],
    ]);
    const firstBlock = container.querySelector(`.${blockClass}`);

    showDiff(container, message([a, b].join('\n'), a));
    expect(sides(container)).toEqual([
      [`${rowClass} ${rowClass}-unchanged`, a, a],
      [`${rowClass} ${rowClass}-removed`, `Removed: ${b}`, '-'],
    ]);
    expect(container.querySelector(`.${blockClass}`)).toBe(firstBlock);

    showDiff(container, message('', ''));
    expect(container.querySelector(`.${rowClass}`)).toBeNull();
    expect(container.querySelector(`.${emptyClass}`)).not.toBeNull();
  });
});

describe('previewHtml', () => {
  test('allows the script by its nonce and WebAssembly for Graphviz, and nothing from the network', () => {
    const html = previewHtml({ cspSource: 'https://webview', nonce: 'abc', script: 'https://webview/dist/pumlPreview.js', style: 'https://webview/media/pumlPreview.css' });
    const policy = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1];
    expect(policy).toBe(
      "default-src 'none'; img-src https://webview data:; style-src https://webview 'unsafe-inline'; font-src https://webview; script-src 'nonce-abc' 'wasm-unsafe-eval'",
    );
    expect(html).toContain('<script type="module" nonce="abc" src="https://webview/dist/pumlPreview.js"></script>');
    expect(html).toContain('<main id="diagrams"></main>');
  });
});
