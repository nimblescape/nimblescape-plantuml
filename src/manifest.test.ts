// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the parts of the extension that are files, not code: the
 * name and the entry point of the manifest, the language contribution and its
 * editing rules, the settings and their documentation, the files of the
 * package, the bundled engine and its license, the third-party notices, and
 * the links of the documents. No installed editor is touched.
 */

import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import * as vm from 'node:vm';
import * as esbuild from 'esbuild';
import { expect, test, vi } from 'vitest';
import { formatBlocksCommand } from './extension';
import { grammarFiles } from './language/grammars';
import { bundledLibraries } from './preview/renderer';
import { commands, diffPreviewViewType, previewViewType, sidePreviewViewType } from './pumlPreviews';
import { defaultSettings, settingsSection } from './settings';

// The previews module imports the editor API; these tests read only its constants.
vi.mock('vscode', () => ({}));

/** repository is the root folder of this repository, which holds the manifest and the documents. */
const repository = path.resolve(__dirname, '..');

/**
 * read returns the text of a file of the repository.
 * @param file - The path of the file, relative to the repository.
 */
const read = (file: string): string => fs.readFileSync(path.join(repository, file), 'utf8');

/**
 * readJsonWithComments parses a JSON file whose leading lines may be `//` comments, as VS Code allows them.
 * @param file - The path of the file, relative to the repository.
 */
const readJsonWithComments = (file: string): any =>
  JSON.parse(
    read(file)
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n'),
  );

/** manifest is the extension manifest. */
const manifest = JSON.parse(read('package.json'));

/** engineName is the npm package of the PlantUML engine. */
const engineName = '@plantuml/core';

/** engineManifest is the manifest of the installed engine. */
const engineManifest = JSON.parse(read(`node_modules/${engineName}/package.json`));

/** fileExtensions are the file extensions of the language PlantUML, as docs/requirements.md (R-PUML-001) names them. */
const fileExtensions = ['.puml', '.plantuml', '.pu', '.iuml', '.wsd'];

/**
 * compareVersions orders two versions of the form <major>.<minor>.<patch>.
 * @param a - The first version.
 * @param b - The second version.
 * @returns A negative number when a is lower, zero when both are equal, a positive number when a is higher.
 */
const compareVersions = (a: string, b: string): number => {
  const [x, y] = [a, b].map((version) => version.split('.').map(Number));
  return x.map((part, index) => part - y[index]).find((difference) => difference !== 0) ?? 0;
};

/**
 * markdownLinks returns the targets of the inline links of a Markdown text outside code blocks and code spans.
 * @param text - The Markdown text.
 */
const markdownLinks = (text: string): string[] => {
  const prose = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  return [...prose.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);
};

test('the manifest follows the naming scheme of the publisher nimblescape', () => {
  expect(manifest.publisher).toBe('nimblescape');
  expect(manifest.name).toBe('nimblescape-plantuml');
  expect(manifest.displayName).toBe('nimblescape PlantUML');
  expect(manifest.repository.url).toBe(`https://github.com/nimblescape/${manifest.name}.git`);
  expect(manifest.bugs.url).toBe(`https://github.com/nimblescape/${manifest.name}/issues`);
  expect(manifest.license).toBe('MIT');
});

test('the entry point is the bundle that esbuild.mjs writes', () => {
  expect(manifest.main).toBe('./dist/extension.js');
  expect(read('esbuild.mjs')).toContain(`const outfile = '${manifest.main.slice(2)}';`);
});

test('the manifest contributes the grammars that the build writes, with PlantUML as the language of the Markdown blocks', () => {
  const grammars = manifest.contributes.grammars;
  expect(grammars.map((grammar: { path: string }) => grammar.path)).toEqual(Object.keys(grammarFiles).map((file) => `./dist/syntaxes/${file}`));
  expect(grammars.map((grammar: { scopeName: string }) => grammar.scopeName)).toEqual(Object.values(grammarFiles).map((grammar) => grammar.scopeName));
  expect(grammars[0].language).toBe('plantuml');
  expect(grammars[1].injectTo).toEqual(['text.html.markdown']);
  expect(grammars[1].embeddedLanguages).toEqual({ 'meta.embedded.block.plantuml': 'plantuml' });
});

test('the icon is a PNG of 256 × 256 pixels, because the Marketplace takes no SVG icon', () => {
  expect(manifest.icon).toBe('resources/icon.png');
  const png = fs.readFileSync(path.join(repository, manifest.icon));
  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([256, 256]);
});

test('the manifest contributes the custom editor, the commands and the activation events of the previews', () => {
  expect(manifest.contributes.customEditors.map((editor: { viewType: string }) => editor.viewType)).toEqual([previewViewType]);
  expect(manifest.contributes.commands.map((command: { command: string }) => command.command).sort()).toEqual(
    [...Object.values(commands), formatBlocksCommand].sort(),
  );
  expect(manifest.activationEvents).toEqual(
    expect.arrayContaining([`onWebviewPanel:${sidePreviewViewType}`, `onWebviewPanel:${diffPreviewViewType}`]),
  );
  const whens = JSON.stringify([manifest.contributes.menus, manifest.contributes.keybindings]);
  expect(whens).toContain(`activeCustomEditorId == '${previewViewType}'`);
  expect(whens).toContain(`activeWebviewPanelId == '${diffPreviewViewType}'`);
});

test('the keys of the previews are those of the Markdown preview, for PlantUML files and their previews only (R-PUML-002, R-PUML-003)', () => {
  // The same keys open the preview of a Markdown file; the conditions leave them to VS Code in Markdown files.
  const plantuml = '(editorLangId == plantuml && !notebookEditorFocused)';
  expect(manifest.contributes.keybindings).toEqual([
    {
      command: commands.togglePreview,
      key: 'ctrl+shift+v',
      mac: 'cmd+shift+v',
      when: `${plantuml} || activeCustomEditorId == '${previewViewType}' || activeWebviewPanelId == '${diffPreviewViewType}'`,
    },
    {
      command: commands.showPreviewToSide,
      key: 'ctrl+k v',
      mac: 'cmd+k v',
      when: `${plantuml} || activeCustomEditorId == '${previewViewType}'`,
    },
  ]);
});

test('the extension uses no proposed API, and the API of the oldest VS Code version that it supports (R-GEN-005)', () => {
  // The Marketplace does not accept an extension that enables a proposed API.
  expect(manifest).not.toHaveProperty('enabledApiProposals');
  // The types of the API are those of the version in engines.vscode, so the code compiles only with its API.
  expect(manifest.engines.vscode).toMatch(/^\^\d+\.\d+\.0$/);
  expect(manifest.devDependencies['@types/vscode']).toBe(`~${manifest.engines.vscode.slice(1)}`);
});

test('the extension is the default formatter of PlantUML files, and the command "Format PlantUML Blocks" is for Markdown files', () => {
  // A language-specific default of an extension wins over a general editor.defaultFormatter of the user, for example
  // Prettier, but not over a formatter that the user sets for the language plantuml.
  expect(manifest.contributes.configurationDefaults).toEqual({
    '[plantuml]': { 'editor.defaultFormatter': `${manifest.publisher}.${manifest.name}` },
  });
  expect(manifest.contributes.menus.commandPalette).toContainEqual({ command: formatBlocksCommand, when: 'editorLangId == markdown' });
});

test('the manifest contributes the settings of src/settings.ts with their defaults', () => {
  const properties = manifest.contributes.configuration.properties;
  const contributed = Object.fromEntries(Object.entries<any>(properties).map(([key, value]) => [key, value.default]));
  const expected = Object.fromEntries(Object.entries(defaultSettings).map(([key, value]) => [`${settingsSection}.${key}`, value]));
  expect(contributed).toEqual(expected);
});

test('the README and the guide name every setting that the manifest contributes', () => {
  for (const setting of Object.keys(manifest.contributes.configuration.properties)) {
    expect(read('README.md'), `README.md does not name ${setting}`).toContain(`\`${setting}\``);
    expect(read('docs/guide.md'), `docs/guide.md does not name ${setting}`).toContain(`\`${setting}\``);
  }
});

test('the language plantuml covers the PlantUML file extensions with the comments of PlantUML', () => {
  expect(manifest.contributes.languages).toEqual([
    {
      id: 'plantuml',
      aliases: ['PlantUML', 'plantuml'],
      extensions: fileExtensions,
      configuration: './language-configuration.json',
    },
  ]);
  const configuration = readJsonWithComments('language-configuration.json');
  expect(configuration.comments).toEqual({ lineComment: "'", blockComment: ["/'", "'/"] });
});

test('the file table of the README names every file extension of the language', () => {
  const row = read('README.md')
    .split('\n')
    .find((line) => line.startsWith('| `.puml`'));
  expect(row).toBeDefined();
  expect([...row!.split('|')[1].matchAll(/`([^`]+)`/g)].map((match) => match[1])).toEqual(fileExtensions);
});

test('the package holds the bundles, the engine, the grammars, the preview styles, the icon, the language configuration and the documents only', () => {
  const patterns = read('.vscodeignore')
    .split('\n')
    .filter((line) => line && !line.startsWith('#'));
  expect(patterns).toEqual([
    '**',
    '!dist/extension.js',
    '!dist/markdownPreview.js',
    '!dist/pumlPreview.js',
    '!dist/engine/**',
    '!dist/syntaxes/**',
    '!media/markdownPreview.css',
    '!media/pumlPreview.css',
    '!resources/icon.png',
    '!language-configuration.json',
    '!package.json',
    '!README.md',
    '!CHANGELOG.md',
    '!SUPPORT.md',
    '!LICENSE',
    '!THIRD-PARTY-NOTICES.md',
  ]);
  for (const pattern of patterns.filter((pattern) => pattern.startsWith('!') && !pattern.startsWith('!dist/'))) {
    expect(fs.existsSync(path.join(repository, pattern.slice(1))), pattern).toBe(true);
  }
});

test('the engine is pinned to one installed version under the MIT License (R-GEN-001)', () => {
  const pinned = manifest.dependencies[engineName];
  expect(Object.keys(manifest.dependencies)).toEqual([engineName]);
  expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
  expect(engineManifest.version).toBe(pinned);
  // Versions before 1.2026.6 are under the GPL.
  expect(compareVersions(pinned, '1.2026.6')).toBeGreaterThanOrEqual(0);
  expect(engineManifest.license).toBe('MIT');
  expect(read(`node_modules/${engineName}/LICENSE`)).toContain('under the terms of the MIT License');
});

test('the third-party notices name the engine version and every script of the engine (R-GEN-004)', () => {
  const notices = read('THIRD-PARTY-NOTICES.md');
  expect(notices).toContain(`[\`${engineName}\`](https://www.npmjs.com/package/${engineName})\n${engineManifest.version}`);
  // The source of the engine is the commit of the npm package (its gitHead), which is not always the commit of the tag.
  expect(notices).toMatch(/<https:\/\/github\.com\/plantuml\/plantuml\/tree\/[0-9a-f]{40}>/);
  const scripts = [...new Set(Object.values<string>(engineManifest.exports))].filter((file) => file.endsWith('.js'));
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) {
    expect(notices, script).toContain(`| \`${path.basename(script)}\` |`);
  }
  for (const license of [
    'Eclipse Public License - v 1.0',
    'CC BY 4.0',
    'MIT License',
    'Apache License',
    'GNU GENERAL PUBLIC LICENSE',
    'UNICODE LICENSE V3',
  ]) {
    expect(notices, license).toContain(license);
  }
  // plantuml.js holds more than PlantUML: the layout engine Smetana, the runtime and the class library of the
  // compiler TeaVM with its NOTICE, and the libraries that PlantUML and TeaVM contain.
  for (const section of ['## Smetana', '## TeaVM', '## Unicode CLDR data', '## JZlib', '## minimal-json', '## Base64Coder']) {
    expect(notices, section).toContain(section);
  }
  expect(notices).toContain('This product includes software developed by Alexey Andreev');
});

test('the third-party notices name every package that the build bundles into a script, with its version and license (R-GEN-004)', async () => {
  const notices = read('THIRD-PARTY-NOTICES.md');
  const bundles: [string, esbuild.Platform][] = [
    ['src/extension.ts', 'node'],
    ['src/preview/markdownPreview.ts', 'browser'],
    ['src/preview/pumlPreview.ts', 'browser'],
  ];
  const packages = new Set<string>();
  for (const [entry, platform] of bundles) {
    const result = await esbuild.build({
      entryPoints: [path.join(repository, entry)],
      bundle: true,
      platform,
      external: ['vscode'],
      write: false,
      metafile: true,
      logLevel: 'silent',
    });
    for (const input of Object.keys(result.metafile.inputs)) {
      // The folder of the package is the part of the path up to the name after the last node_modules.
      const folder = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(input)?.[1];
      if (folder) {
        packages.add(folder);
      }
    }
  }
  expect(packages.size).toBeGreaterThan(0);
  for (const folder of packages) {
    const { name, version, license } = JSON.parse(fs.readFileSync(path.join(repository, folder, 'package.json'), 'utf8'));
    expect(notices, name).toMatch(new RegExp(String.raw`\| \[${name.replace(/\./g, '\\.')}\]\(#[^)]+\) \| ${version.replace(/\./g, '\\.')} \| ${license} \|`));
    expect(notices, name).toContain(`\n## ${name}\n`);
  }
});

test('the third-party notices name every theme of the engine and its license (R-GEN-004)', () => {
  const notices = read('THIRD-PARTY-NOTICES.md');
  const themes = read(`node_modules/${engineName}/themes.js`);
  // Each theme is a JavaScript string that starts with a header of fields, among them its author and its license.
  const licenses = new Map<string, string>();
  for (const [, name, body] of themes.matchAll(/PLANTUML_THEMES\["([^"]+)"\]="((?:[^"\\]|\\.)*)"/g)) {
    const header = /^---\n([\s\S]*?)\n---/.exec(JSON.parse(`"${body}"`))?.[1] ?? '';
    licenses.set(name, /^license:[ \t]*(.*)$/m.exec(header)?.[1].trim() ?? '');
  }
  expect(licenses.size).toBeGreaterThan(0);
  for (const [name, license] of licenses) {
    expect(notices, name).toContain(`\`${name}\``);
    if (license !== '') {
      expect(notices, `${name}: ${license}`).toContain(license);
    }
  }
  // A new kind of license needs a review of the notices, not only its name in them.
  expect(new Set(licenses.values())).toEqual(new Set(['', 'MIT', 'Apache License, Version 2.0', 'GPL 3+']));
});

test('the third-party notices name every library of PlantUML in stdlib/ with its version and license (R-GEN-004)', () => {
  const notices = read('THIRD-PARTY-NOTICES.md');
  const files = fs.readdirSync(path.join(repository, 'stdlib')).sort();
  expect(files).toEqual([...bundledLibraries.keys()].map((library) => `${library}.min.js`).sort());
  for (const file of files) {
    // The file of a library is a script that writes the files and the facts of the library into global variables.
    const page: { window: { PLANTUML_STDLIB_INFO?: Record<string, { name: string; version: string; license: string }> } } = { window: {} };
    vm.runInNewContext(read(`stdlib/${file}`), page);
    const library = file.slice(0, -'.min.js'.length);
    const info = page.window.PLANTUML_STDLIB_INFO![library];
    expect(info.name).toBe(bundledLibraries.get(library));
    // A new kind of license needs a review of the notices, not only its name in them.
    expect(info.license, file).toBe('MIT');
    const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const row = new RegExp(String.raw`^\| \`${escape(file)}\` \|[^\n]* ${escape(info.version)} [^\n]*\| ${info.license} \|$`, 'm').exec(notices);
    expect(row, file).not.toBeNull();
    // The row links to the section of the library, which holds its license.
    const anchor = /\]\(#([^)]+)\)/.exec(row![0])?.[1];
    const headings = [...notices.matchAll(/^## (.+)$/gm)].map((match) => match[1].toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').replace(/ /g, '-'));
    expect(headings, file).toContain(anchor);
  }
});

test('the documents of the package use full links, so that each link works in the repository, in the package and on the Marketplace', () => {
  for (const file of ['README.md', 'CHANGELOG.md', 'SUPPORT.md']) {
    for (const target of markdownLinks(read(file))) {
      expect(target, `${file}: ${target}`).toMatch(/^https:\/\//);
    }
  }
});

test('the images of the README are PNG files of the repository, from its branch main, as the Marketplace requires', () => {
  // The Marketplace shows no SVG image and no image with a relative address.
  const base = 'https://raw.githubusercontent.com/nimblescape/nimblescape-plantuml/main/';
  const images = [...read('README.md').matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((match) => match[1]);
  expect(images.length).toBeGreaterThan(0);
  for (const image of images) {
    expect(image.startsWith(base) && image.endsWith('.png'), image).toBe(true);
    expect(fs.existsSync(path.join(repository, image.slice(base.length))), image).toBe(true);
  }
});

test('the package script keeps the checks of vsce for the images of the README and the change log', () => {
  // --no-rewrite-relative-links also switches off the checks for https sources and SVG images.
  expect(manifest.scripts.package).toBe('vsce package --no-dependencies');
});

test('the description adds no search tag, for example of another programming language (R-GEN-005)', async () => {
  // vsce adds a tag for each of its keywords that the description contains, for example "java" for "Java".
  const { TagsProcessor } = createRequire(__filename)('@vscode/vsce/out/package');
  const tags = async (description: string): Promise<string[]> => {
    const processor = new TagsProcessor({ ...manifest, description });
    await processor.onEnd();
    return processor.tags;
  };
  expect(await tags(manifest.description)).toEqual(await tags(''));
});

test('every requirement has a unique ID, and every link to a requirement names an existing one', () => {
  const requirements = read('docs/requirements.md');
  const ids = [...requirements.matchAll(/^### (R-[A-Z]+-\d{3})$/gm)].map((match) => match[1]);
  expect(ids.length).toBeGreaterThan(0);
  expect(new Set(ids).size).toBe(ids.length);
  const anchors = new Set(ids.map((id) => `#${id.toLowerCase()}`));
  for (const target of markdownLinks(requirements).filter((target) => target.startsWith('#r-'))) {
    expect(anchors.has(target), target).toBe(true);
  }
  for (const target of markdownLinks(read('docs/guide.md')).filter((target) => target.startsWith('requirements.md#'))) {
    expect(anchors.has(target.slice('requirements.md'.length)), target).toBe(true);
  }
});

test('every link of the user guide to one of its sections names an existing heading', () => {
  const guide = read('docs/guide.md');
  // The anchor of a heading as GitHub writes it: lower case, without punctuation, with hyphens for spaces.
  const anchors = new Set(
    [...guide.matchAll(/^#{2,4} (.+)$/gm)].map(
      (match) => `#${match[1].toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').replace(/ /g, '-')}`,
    ),
  );
  for (const target of markdownLinks(guide).filter((target) => target.startsWith('#'))) {
    expect(anchors.has(target), target).toBe(true);
  }
});
