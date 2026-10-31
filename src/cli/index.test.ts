// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check that the hand-written types of the npm package
 * (`cli/index.d.ts`) describe the library (R-NPM-001): the type check of
 * `npm run typecheck` fails when an export of the library does not fit its
 * declared type, and the test names the exports that the types lack.
 */

import { expect, test } from 'vitest';
import type * as Declared from '../../cli/index';
import * as library from './index';

test('the types of the package declare every export of the library, with its type', () => {
  const declared: typeof Declared = library;
  expect(Object.keys(declared).sort()).toEqual(
    [
      'blockClass',
      'contentClass',
      'defaultSettings',
      'extendMarkdownIt',
      'includeProblems',
      'maxFileSize',
      'pageIncludesClass',
      'readIncludedFiles',
      'settingsAttribute',
      'settingsOf',
      'settingsSection',
      'sourceAttribute',
      'stateAttribute',
      'textClass',
    ].sort(),
  );
});
