// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the PlantUML lines that apply the settings to a diagram
 * (R-GEN-007).
 */

import { expect, test } from 'vitest';
import { defaultSettings, preambleLines } from './settings';

test('the default settings add no line, so diagrams look as PlantUML draws them', () => {
  expect(preambleLines(defaultSettings)).toEqual([]);
});

test('without visibility icons, the icon size 0 makes PlantUML write the UML characters', () => {
  expect(preambleLines({ ...defaultSettings, visibilityIcons: false })).toEqual(['skinparam classAttributeIconSize 0']);
});
