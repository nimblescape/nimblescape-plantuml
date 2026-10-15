// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// @vitest-environment happy-dom

/**
 * These tests check the page of the preview of PlantUML files (R-PUML-002,
 * R-PUML-003): the split of a file into its diagrams, the blocks that the
 * page writes and reuses, and the security policy of the page.
 */

import { describe, expect, test } from 'vitest';
import { blockClass, settingsAttribute, sourceAttribute } from '../markdown/markdownIt';
import { diagramSources, emptyClass, showDiagrams } from './pumlPreview';
import { previewHtml } from './previewHtml';

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
  });

  test('shows a message for a file without a diagram', () => {
    const container = document.createElement('main');
    showDiagrams(container, { type: 'update', text: '', settings: { umlNotation: true } });
    expect(container.querySelector(`.${emptyClass}`)?.textContent).toBe('The file has no diagram.');
    showDiagrams(container, { type: 'update', text: 'A -> B', settings: { umlNotation: true } });
    expect(container.querySelector(`.${emptyClass}`)).toBeNull();
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
