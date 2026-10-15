// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the default settings and the reading of settings from
 * the JSON text that the Markdown preview receives (R-GEN-007).
 */

import { expect, test } from 'vitest';
import { defaultSettings, isDefault, parseSettings } from './settings';

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
