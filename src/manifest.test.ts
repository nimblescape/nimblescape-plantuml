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
import * as path from 'node:path';
import { expect, test } from 'vitest';
import { grammarFiles } from './language/grammars';
import { defaultSettings, settingsSection } from './settings';

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

test('the package holds the bundles, the engine, the grammars, the preview styles, the language configuration and the documents only', () => {
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
    '!language-configuration.json',
    '!package.json',
    '!README.md',
    '!CHANGELOG.md',
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
  expect(notices).toContain(`/tree/v${engineManifest.version}>`);
  const scripts = [...new Set(Object.values<string>(engineManifest.exports))].filter((file) => file.endsWith('.js'));
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) {
    expect(notices, script).toContain(`| \`${path.basename(script)}\` |`);
  }
  for (const license of ['Eclipse Public License - v 1.0', 'CC BY 4.0', 'MIT License']) {
    expect(notices, license).toContain(license);
  }
});

test('the README and the change log use full links, because vsce does not rewrite relative links', () => {
  for (const file of ['README.md', 'CHANGELOG.md']) {
    for (const target of markdownLinks(read(file))) {
      expect(target, `${file}: ${target}`).toMatch(/^https:\/\//);
    }
  }
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
