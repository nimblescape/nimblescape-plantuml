// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// @vitest-environment happy-dom

/**
 * These tests run the page of the SVG export (R-GEN-003) on a page of
 * happy-dom with a fake engine. They check the SVG file text and the type of
 * each diagram of each block, the light colors also with a dark theme, the
 * settings and the included files of a block (R-GEN-007, R-GEN-008), the
 * errors with the line of the block text (R-GEN-010), and the text of a file
 * for an image that is not well-formed XML. `src/engine.test.ts` asks the real
 * engine for the types.
 */

import { afterEach, describe, expect, test } from 'vitest';
import { umlCommands } from '../diagram/umlNotation';
import { xmlDeclaration } from '../diagram/svgFiles';
import { defaultSettings } from '../settings';
import { FakeEngine } from '../test/fakeEngine';
import { PreviewRenderer } from './renderer';
import { ExportBlock, exportBlocks, ExportedDiagram, wellFormedSvg } from './svgExportPage';

afterEach(() => {
  document.body.className = '';
  document.body.replaceChildren();
});

/**
 * run renders blocks on the page of the export with a fake engine.
 * @param blocks - The blocks.
 * @returns The diagrams of each block, by the index of the block, and the fake engine.
 */
async function run(blocks: ExportBlock[]): Promise<{ results: ExportedDiagram[][]; engine: FakeEngine; container: HTMLElement }> {
  const engine = new FakeEngine();
  const container = document.createElement('main');
  document.body.append(container);
  const renderer = new PreviewRenderer(container, async () => engine, () => false);
  const results: ExportedDiagram[][] = [];
  await exportBlocks(container, renderer, blocks, (index, diagrams) => {
    results[index] = diagrams;
  });
  return { results, engine, container };
}

/**
 * linesOf returns the lines that the fake engine rendered for the SVG text of a file.
 * @param diagram - The diagram of the export.
 */
const linesOf = (diagram: ExportedDiagram): string[] => {
  if (!('svg' in diagram)) {
    throw new Error(`The diagram has an error: ${diagram.error}`);
  }
  return (/data-text="([^"]*)"/.exec(diagram.svg)?.[1] ?? '').replace(/&gt;/g, '>').split('|');
};

describe('exportBlocks', () => {
  test('sends the SVG file text and the type of each diagram of each block', async () => {
    const { results } = await run([
      { text: 'Alice -> Bob : hello', settings: defaultSettings },
      { text: '@startuml\nclass Car\n@enduml\n@startmindmap\n* root\n@endmindmap', settings: defaultSettings },
    ]);
    expect(results.map((diagrams) => diagrams.map((diagram) => ('type' in diagram ? diagram.type : diagram.error)))).toEqual([
      ['sequence'],
      ['class', 'mindmap'],
    ]);
    for (const diagram of results.flat()) {
      expect('svg' in diagram && diagram.svg.startsWith(`${xmlDeclaration}\n<svg `)).toBe(true);
    }
    expect(linesOf(results[0][0])).toEqual(['@startuml', ...umlCommands, 'Alice -> Bob : hello', '@enduml']);
  });

  test('renders in the normal colors of PlantUML, also with a dark color theme', async () => {
    document.body.className = 'vscode-dark';
    const { results, engine } = await run([{ text: 'class Car', settings: defaultSettings }]);
    expect('svg' in results[0][0] && results[0][0].svg).toContain('data-dark="false"');
    expect(engine.calls.every((call) => call.options?.dark === false)).toBe(true);
  });

  test('renders with the settings of the block', async () => {
    const { results } = await run([{ text: 'class Car', settings: { umlNotation: false } }]);
    expect(linesOf(results[0][0])).toEqual(['@startuml', 'class Car', '@enduml']);
  });

  test('renders with the included files of the block', async () => {
    const { results } = await run([
      { text: '!include parts.puml\nCar -> Wheel', settings: { umlNotation: false }, includes: { 'parts.puml': { text: 'class Car' } } },
    ]);
    expect(linesOf(results[0][0])).toEqual(['@startuml', 'class Car', 'Car -> Wheel', '@enduml']);
  });

  test('sends the error of a diagram with the line of the block text, and the other diagrams of the block', async () => {
    const { results } = await run([{ text: '@startuml\nclass A\nthis is wrong\n@enduml\n@startuml\nclass B\n@enduml', settings: defaultSettings }]);
    expect(results[0][0]).toEqual({ error: 'Line 3: Syntax Error? (Assumed diagram type: class)' });
    expect('type' in results[0][1] && results[0][1].type).toBe('class');
  });

  test('asks the engine for the type of a UML diagram only, after the diagram renders', async () => {
    const { engine } = await run([{ text: '@startgantt\n[A] lasts 1 day\n@endgantt\n@startuml\nA -> B\n@enduml', settings: defaultSettings }]);
    expect(engine.calls.map((call) => call.lines[0])).toEqual(['@startgantt', '@startuml', '@startuml']);
    expect(engine.calls[2].lines.at(-2)).toBe('@@@ !!! ###');
  });

  test('shows each block on a white background while it renders', async () => {
    const { container } = await run([{ text: 'class Car', settings: defaultSettings }]);
    const block = container.firstElementChild as HTMLElement;
    expect(block.style.backgroundColor).toMatch(/^(#ffffff|rgb\(255, 255, 255\))$/);
    expect(block.querySelector('.nimblescape-plantuml-content')?.shadowRoot?.querySelector('svg')).not.toBeNull();
  });
});

describe('wellFormedSvg', () => {
  test('keeps the text of an image that is well-formed XML', () => {
    // The background of the root element keeps svgFile from adding the white one.
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" style="background-color:#FFFFAA;"><text>a &amp; b</text></svg>';
    expect(wellFormedSvg(document, svg)).toBe(`${xmlDeclaration}\n${svg}\n`);
  });

  test('writes an image that is not well-formed XML as XML', () => {
    // The HTML parser of the page closes the open elements of the image.
    const text = wellFormedSvg(document, '<svg xmlns="http://www.w3.org/2000/svg" style="background-color:#FFFFAA;"><g><rect width="1"></svg>');
    expect(text).toBe(`${xmlDeclaration}\n<svg xmlns="http://www.w3.org/2000/svg" style="background-color:#FFFFAA;"><g><rect width="1"/></g></svg>\n`);
    expect(new DOMParser().parseFromString(text, 'image/svg+xml').getElementsByTagName('parsererror')).toHaveLength(0);
  });
});
