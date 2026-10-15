// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the kinds of the lines of a PlantUML text: statements,
 * comments, and free text of notes, titles, legends, headers, footers,
 * captions, references and actions of several lines.
 */

import { expect, test } from 'vitest';
import { lineKinds } from './lineKinds';

test('finds line comments and block comments', () => {
  expect(lineKinds(["' comment", "  ' comment", "/' start", "' inside", "end '/", 'class A', "class B /' inline '/"])).toEqual([
    'comment', 'comment', 'blockComment', 'blockComment', 'blockComment', 'statement', 'statement',
  ]);
});

test('finds the free text of notes, titles, legends, headers, footers and captions of several lines', () => {
  expect(
    lineKinds([
      'note left of A', 'text', 'end note',
      'legend', 'text', 'endlegend',
      'title', 'text', 'end title',
      'right header', 'text', 'endheader',
      'note as N1', 'text', 'end note',
      'note left of A : one line', 'class B',
      'note "one line" as N2', 'class C',
      'ref over A, B', 'text', 'end ref',
    ]),
  ).toEqual([
    'statement', 'text', 'statement',
    'statement', 'text', 'statement',
    'statement', 'text', 'statement',
    'statement', 'text', 'statement',
    'statement', 'text', 'statement',
    'statement', 'statement',
    'statement', 'statement',
    'statement', 'text', 'statement',
  ]);
});

test('finds the further lines of actions of several lines', () => {
  expect(lineKinds([':first line', '  second line', 'third line;', ':one line;', ':User: --> (Log in)', ':Admin:', 'B -> A'])).toEqual([
    'statement', 'text', 'text', 'statement', 'statement', 'statement', 'statement',
  ]);
});
