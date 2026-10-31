// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The tests of the built npm package @nimblescape/plantuml (cli/dist/, npm run test:cli) on Linux and macOS
// (R-NPM-001). They load the library as a program that installed the package does, with require, render a Markdown
// file with markdown-it and the plugin, the settings of a file settings.json and the included files of the disk, and
// check that the package holds the page with the script, the style sheet and the engine.

import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import MarkdownIt from 'markdown-it';
import { afterAll, expect, test } from 'vitest';

const repository = path.resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const library = require(path.join(repository, 'cli', 'dist', 'index.js')) as typeof import('../../cli/index');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'plantuml-cli-'));

afterAll(() => {
  fs.rmSync(folder, { recursive: true, force: true });
});

test('the plugin writes a PlantUML block with its text, the settings of settings.json and the included files of the disk', () => {
  const document = path.join(folder, 'paper.md');
  fs.writeFileSync(path.join(folder, 'style.iuml'), 'skinparam monochrome true\n');
  const settings = library.settingsOf({ 'nimblescape.plantuml.umlNotation': false });
  const md = library.extendMarkdownIt(
    new MarkdownIt(),
    () => settings,
    (_rendering, source) => library.readIncludedFiles(document, source, [folder]),
  );
  const html = md.render('# Title\n\n```plantuml\n!include style.iuml\nA -> B\n```\n\nText.\n');
  expect(html).toContain('<h1>Title</h1>');
  expect(html).toContain(`<div class="${library.blockClass}" ${library.sourceAttribute}="!include style.iuml\nA -&gt; B\n" ${library.settingsAttribute}="{&quot;umlNotation&quot;:false}">`);
  expect(html).toContain(`<div class="${library.pageIncludesClass}" hidden>{&quot;style.iuml&quot;:{&quot;text&quot;:&quot;skinparam monochrome true\\n&quot;}}</div>`);
  expect(html).toContain('<p>Text.</p>');
  expect(library.stateAttribute).toBe('data-plantuml-state');
  expect(library.defaultSettings).toEqual({ umlNotation: true });
});

test('the package holds the page: the script, the style sheet and the scripts of the engine next to the script', () => {
  const page = path.join(repository, 'cli', 'dist', 'page');
  const script = fs.readFileSync(path.join(page, 'markdownPreview.js'), 'utf8');
  // The script loads the engine from the folder engine/ next to it, and has no source map.
  expect(script).toContain('new URL("./engine/", import.meta.url)');
  expect(script).not.toContain('sourceMappingURL');
  expect(fs.readFileSync(path.join(page, 'markdownPreview.css'), 'utf8')).toContain('.nimblescape-plantuml-content::part(diagram)');
  for (const file of ['plantuml.js', 'viz-global.js', 'themes.js', 'emoji.js', 'openiconic.js', 'c4.min.js', 'LICENSE']) {
    expect(fs.existsSync(path.join(page, 'engine', file)), file).toBe(true);
  }
  // The exports of the package name these files.
  const manifest = JSON.parse(fs.readFileSync(path.join(repository, 'cli', 'package.json'), 'utf8'));
  expect(manifest.exports['./page/*']).toBe('./dist/page/*');
});
