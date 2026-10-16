// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// @vitest-environment happy-dom

/**
 * These tests load the real engine, the npm package `@plantuml/core`, with
 * the loader of the previews, and render diagrams with it. They check each
 * part of the engine that the extension depends on, so that a new version of
 * the engine that changes one of them fails here and not in the preview: the
 * further scripts that the loader loads, the function `renderToString` with
 * its options `dark` and `maxSvgSize`, every diagram type of
 * `src/language/keywords.ts`, the picture of an error that `errorOf` reads,
 * the group of the title that the label of an image reads, the library C4 of
 * the package, and the Graphviz layout of Viz.js. One test renders a Markdown
 * page with the renderer of the previews.
 *
 * The tests run the engine in happy-dom, which has no fonts: a text measures
 * a fixed width for each character.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as vm from 'node:vm';
import { beforeAll, describe, expect, test } from 'vitest';
import { diagramLines } from './diagram/diagramLines';
import { diagramTypes } from './language/keywords';
import { contentClass } from './markdown/markdownIt';
import { Engine, engineLoader, errorOf, PreviewRenderer } from './preview/renderer';
import { defaultSettings } from './settings';
import { fence, renderMarkdown } from './test/markdownPreview';

/** engineFolder is the folder of the installed engine, whose scripts the build copies into dist/engine/. */
const engineFolder = path.resolve(__dirname, '../node_modules/@plantuml/core');

/** stdlibFolder is the folder of the libraries of PlantUML that the build also copies into dist/engine/. */
const stdlibFolder = path.resolve(__dirname, '../stdlib');

/** folder is the address of the folder of the engine, with a final slash, as the previews pass it to the loader. */
const folder = `${pathToFileURL(engineFolder).href}/`;

/** loaded holds the names of the classic scripts that the loader loaded. */
const loaded: string[] = [];

/**
 * runScript runs a classic script of the engine in the global scope, as a script element of a preview runs it.
 * @param url - The address of the script.
 */
async function runScript(url: string): Promise<void> {
  const name = path.basename(fileURLToPath(url));
  loaded.push(name);
  const file = [engineFolder, stdlibFolder].map((folder) => path.join(folder, name)).find((candidate) => fs.existsSync(candidate));
  vm.runInThisContext(fs.readFileSync(file ?? fileURLToPath(url), 'utf8'), { filename: url });
}

/** loadEngine loads the engine with the loader of the previews, with Smetana, the layout of the Markdown preview. */
const loadEngine = engineLoader(folder, 'smetana', runScript);

/**
 * render renders a diagram with the real engine.
 * @param lines - The lines of the diagram.
 * @param options - The options of the rendering.
 * @returns The SVG text of the diagram, or the message of an error.
 */
async function render(lines: string[], options: Parameters<Engine['renderToString']>[3] = {}): Promise<{ svg: string } | { error: string }> {
  const engine = await loadEngine();
  return new Promise((resolve) => engine.renderToString(lines, (svg) => resolve({ svg }), (error) => resolve({ error }), options));
}

/**
 * svgOf renders a diagram and returns its SVG text; an error of the engine fails the test.
 * @param text - The diagram text.
 * @param options - The options of the rendering.
 */
async function svgOf(text: string, options?: Parameters<typeof render>[1]): Promise<string> {
  const result = await render(text.split('\n'), options);
  if (!('svg' in result)) {
    throw new Error(result.error);
  }
  return result.svg;
}

/**
 * textsOf returns the texts of the text elements of an SVG image.
 * @param svg - The SVG text.
 */
const textsOf = (svg: string): string[] => [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);

/** samples are a short body of each diagram type that the engine renders. */
const samples: Readonly<Record<string, string>> = {
  uml: 'Alice -> Bob : hello',
  mindmap: '* root\n** branch',
  wbs: '* root\n** branch',
  gantt: '[Design] lasts 3 days',
  project: '[Design] lasts 3 days',
  json: '{"name": "value"}',
  yaml: 'name: value',
  ebnf: 'rule = "text";',
  regex: 'a|b',
  creole: '**bold**',
  chart: 'bar "Sales" [1, 2]',
  nwdiag: 'nwdiag {\n  network lan {\n    server;\n  }\n}',
  packetdiag: 'packetdiag {\n  0-15: Source\n}',
};

/** unsupportedTypes are diagram types of PlantUML that the engine does not render. */
const unsupportedTypes = ['salt', 'ditaa', 'dot', 'math', 'latex', 'wire', 'files', 'chen', 'board', 'git', 'chronology', 'hcl'];

beforeAll(() => {
  // happy-dom has no canvas; the engine measures each text with the context of one, and draws the sprites of C4 on it.
  (HTMLCanvasElement.prototype as unknown as { getContext(): unknown }).getContext = () => ({
    font: '12px sans-serif',
    createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData() {},
    measureText(this: { font: string }, text: string) {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 12);
      return {
        width: text.length * size * 0.6,
        actualBoundingBoxAscent: size * 0.8,
        actualBoundingBoxDescent: size * 0.2,
        fontBoundingBoxAscent: size * 0.9,
        fontBoundingBoxDescent: size * 0.3,
      };
    },
  });
});

describe('the engine with the loader of the previews', () => {
  test('loads, and renders a diagram into an SVG image', async () => {
    const svg = await svgOf('@startuml\nAlice -> Bob : hello\n@enduml');
    expect(svg).toMatch(/^<svg\b/);
    expect(textsOf(svg)).toEqual(expect.arrayContaining(['Alice', 'Bob', 'hello']));
  });

  test.each(diagramTypes)('renders the diagram type %s of the highlighting and the completion', async (type) => {
    const svg = await svgOf(`@start${type}\n${samples[type]}\n@end${type}`);
    expect(errorOf(svg, [])).toBeUndefined();
    expect(textsOf(svg).join(' ')).not.toMatch(/not supported|error/i);
  });

  test('has a sample for each diagram type, and no other', () => {
    expect(Object.keys(samples)).toEqual([...diagramTypes]);
  });

  test.each(unsupportedTypes)('does not render the diagram type %s, which the highlighting and the completion leave out', async (type) => {
    // A new version of the engine that renders the type fails here: then add the type to diagramTypes.
    const result = await render([`@start${type}`, 'text', `@end${type}`]);
    const message = 'svg' in result ? textsOf(result.svg).join(' ') : result.error;
    expect(message).toMatch(/not supported|Unsupported diagram type/);
  });

  test('loads the scripts of the themes, the emoji and the icons through the loader, from the files of the package', async () => {
    const svg = await svgOf('@startuml\n!theme cerulean\nAlice -> Bob : <:1f600:> <&account-login> hello\n@enduml');
    expect(errorOf(svg, [])).toBeUndefined();
    expect(loaded).toEqual(expect.arrayContaining(['themes.js', 'emoji.js', 'openiconic.js']));
    // The build copies the scripts that the package exports into dist/engine/, so the package must export each one.
    const exported = Object.values<string>(JSON.parse(fs.readFileSync(path.join(engineFolder, 'package.json'), 'utf8')).exports);
    for (const name of ['themes.js', 'emoji.js', 'openiconic.js']) {
      expect(exported, name).toContain(`./${name}`);
    }
  });

  test('renders for a dark background with the option dark', async () => {
    const text = '@startuml\nclass Car\nCar --> Wheel\n@enduml';
    expect(await svgOf(text, { dark: true })).not.toBe(await svgOf(text));
  });

  test('renders a diagram higher than 8192 pixels with the option maxSvgSize 0', { timeout: 30_000 }, async () => {
    const messages = Array.from({ length: 400 }, (_, index) => `Alice -> Bob : message ${index}`);
    const svg = await svgOf(['@startuml', ...messages, '@enduml'].join('\n'), { maxSvgSize: 0 });
    expect(Number(/<svg\b[^>]*\bheight="(\d+)/.exec(svg)?.[1])).toBeGreaterThan(8192);
  });

  test('draws an error as the picture that errorOf reads, with the number of the line among the lines it received', async () => {
    const svg = await svgOf('@startuml\nAlice -> Bob : hello\nthis is wrong\n@enduml');
    expect(errorOf(svg, [0, 1, 2, 3])).toEqual({ error: 'Syntax Error? (Assumed diagram type: sequence)', line: 2 });
  });

  test('names the line of the text of a block in an error, also with the lines that the extension adds', async () => {
    // The block has no start line and gets the commands of the UML notation, so the engine receives 4 more lines.
    const { lines, origins } = diagramLines('Alice -> Bob : hello\nthis is wrong', defaultSettings);
    const result = await render(lines);
    expect('svg' in result && errorOf(result.svg, origins)).toEqual({ error: 'Syntax Error? (Assumed diagram type: sequence)', line: 1 });
  });

  test('writes the title of a diagram into a group with the class title', async () => {
    const svg = await svgOf('@startuml\ntitle Greeting\nAlice -> Bob : hello\n@enduml');
    expect(svg).toMatch(/<g class="title"[^>]*>(?:(?!<\/g>)[\s\S])*>Greeting<\/text>/);
  });

  test('renders a C4 diagram with the library C4 of the package, and names a library that the package does not contain', async () => {
    const svg = await svgOf('@startuml\n!include <C4/C4_Container>\nPerson(customer, "Customer")\nSystem(shop, "Shop")\nRel(customer, shop, "Uses")\n@enduml');
    expect(errorOf(svg, [])).toBeUndefined();
    expect(textsOf(svg)).toEqual(expect.arrayContaining(['Customer', 'Shop', 'Uses']));
    expect(loaded).toContain('c4.min.js');
    const missing = await svgOf('@startuml\n!include <awslib/AWSCommon>\nAlice -> Bob : hello\n@enduml');
    expect(errorOf(missing, [0, 1, 2, 3])).toEqual({
      error: 'The extension does not contain the PlantUML library awslib. It contains only the library C4.',
      line: 1,
    });
  });

  test('shows the diagrams of a Markdown page with the renderer of the previews', async () => {
    document.body.innerHTML = renderMarkdown(`${fence('title Greeting\nAlice -> Bob : hello')}\n${fence('Alice -> Bob : hello\nthis is wrong')}`);
    const renderer = new PreviewRenderer(document.body, loadEngine, () => false);
    renderer.update();
    await renderer.whenIdle();
    const [first, second] = [...document.querySelectorAll(`.${contentClass}`)].map((content) => content.shadowRoot);
    expect(first?.querySelector('svg')?.getAttribute('aria-label')).toBe('PlantUML diagram: Greeting');
    expect(second?.querySelector('[part~="error"]')?.textContent).toBe('Line 2: Syntax Error? (Assumed diagram type: sequence)');
  });
});

// Viz.js stays loaded for the rest of the file, so this test comes last.
describe('the engine with the Graphviz layout', () => {
  test('lays out the diagrams with Viz.js when the loader loads it', async () => {
    const text = '@startuml\nclass Car\nCar --> Wheel\nCar --> Engine\n@enduml';
    const smetana = await svgOf(text);
    await engineLoader(folder, 'graphviz', runScript)();
    expect(loaded).toContain('viz-global.js');
    expect(await svgOf(text)).not.toBe(smetana);
  });
});
