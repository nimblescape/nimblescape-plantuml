// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the reading of the settings from the file
 * `.vscode/settings.json` of a folder for a program without VS Code
 * (R-NPM-001): JSON with comments and with commas after the last element, as
 * VS Code reads it, and the default settings for a missing or an invalid file.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, expect, test } from 'vitest';
import { defaultSettings } from '../settings';
import { parseJsonWithComments, readSettings } from './diskSettings';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plantuml-settings-'));

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/**
 * folderWith returns a new folder of the temporary folder with a file `.vscode/settings.json`.
 * @param text - The text of the file.
 */
function folderWith(text: string): string {
  const folder = fs.mkdtempSync(path.join(root, 'folder-'));
  fs.mkdirSync(path.join(folder, '.vscode'));
  fs.writeFileSync(path.join(folder, '.vscode', 'settings.json'), text);
  return folder;
}

test('parseJsonWithComments reads JSON with comments and with commas after the last element', () => {
  const text = [
    '﻿{',
    '  // A comment of a line',
    '  "a": "// no comment, /* no comment */",',
    '  /* A comment',
    '     of two lines */ "b": [1, 2,],',
    '  "c": "a comma before a brace: ,}",',
    '  "d": "a quote \\" and a slash \\\\",',
    '}',
  ].join('\n');
  expect(parseJsonWithComments(text)).toEqual({ a: '// no comment, /* no comment */', b: [1, 2], c: 'a comma before a brace: ,}', d: 'a quote " and a slash \\' });
  expect(parseJsonWithComments('{"a":1}//')).toEqual({ a: 1 });
  expect(() => parseJsonWithComments('{"a":}')).toThrow();
});

test('readSettings reads the settings of the file .vscode/settings.json of a folder', () => {
  const folder = folderWith('{\n  // UML notation off\n  "nimblescape.plantuml.umlNotation": false,\n  "editor.tabSize": 2,\n}\n');
  expect(readSettings(folder)).toEqual({ umlNotation: false });
});

test('readSettings gives the default settings for a missing file, a file that is no JSON, and an invalid value', () => {
  expect(readSettings(path.join(root, 'missing'))).toEqual(defaultSettings);
  expect(readSettings(folderWith('{ "nimblescape.plantuml.umlNotation": false'))).toEqual(defaultSettings);
  expect(readSettings(folderWith('[]'))).toEqual(defaultSettings);
  expect(readSettings(folderWith('{ "nimblescape.plantuml.umlNotation": "no" }'))).toEqual(defaultSettings);
});
