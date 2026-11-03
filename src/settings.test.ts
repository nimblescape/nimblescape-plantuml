// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the default settings, the reading of settings from the
 * JSON text that the Markdown preview receives (R-GEN-007), and from the
 * settings of VS Code for a program without VS Code (R-NPM-001).
 */

import { expect, test } from 'vitest';
import { defaultSettings, isDefault, parseSettings, settingsOf } from './settings';

test('isDefault tells whether every setting has its default value', () => {
  expect(isDefault(defaultSettings)).toBe(true);
  expect(defaultSettings).toEqual({ umlNotation: true });
  expect(isDefault({ ...defaultSettings, umlNotation: false })).toBe(false);
});

test('parseSettings reads the JSON text of settings, and a missing or invalid value gets its default', () => {
  expect(parseSettings('{"umlNotation":false}')).toEqual({ umlNotation: false });
  for (const text of [null, '', '{', '[]', 'null', '{"umlNotation":"no"}', '{"classIcons":false}', '{"other":1}']) {
    expect(parseSettings(text), String(text)).toEqual(defaultSettings);
  }
});

test('settingsOf reads the settings from the settings of VS Code, and a missing or invalid value gets its default', () => {
  expect(settingsOf({ 'nimblescape.plantuml.umlNotation': false, 'editor.tabSize': 2 })).toEqual({ umlNotation: false });
  for (const values of [undefined, null, 1, [], {}, { 'nimblescape.plantuml.umlNotation': 'no' }, { umlNotation: false }]) {
    expect(settingsOf(values), JSON.stringify(values)).toEqual(defaultSettings);
  }
});
