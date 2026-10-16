// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the kinds of the lines of a PlantUML text: statements,
 * members, rules of styles, comments, and free text of notes, titles,
 * legends, headers, footers, captions, references and actions of several
 * lines.
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

test('finds the further lines of actions of several lines, also when the first line holds a colon', () => {
  expect(lineKinds([':first line', '  second line', 'third line;', ':one line;', ':User: --> (Log in)', ':Admin:', 'B -> A'])).toEqual([
    'statement', 'text', 'text', 'statement', 'statement', 'statement', 'statement',
  ]);
  expect(lineKinds([':Step 1: read', 'the file;', ':Admin: as A', ':Guest: : visits', 'B -> A'])).toEqual([
    'statement', 'text', 'statement', 'statement', 'statement',
  ]);
});

test('ends free text only at an end line that PlantUML accepts', () => {
  expect(lineKinds(['note left of A', 'end     note', 'text', 'endnote', 'legend', 'end\tlegend', 'class B'])).toEqual([
    'statement', 'text', 'text', 'statement', 'statement', 'statement', 'statement',
  ]);
});

test('finds the members of classes, objects, maps and JSON data, with braces inside JSON data', () => {
  expect(
    lineKinds([
      'class A {', '+ x : int', "' comment", '{static} y', '}',
      'json J {', '"a": {', '"b": "}"', '},', '"c": 2', '}',
      'map M {', 'key => value', '}',
      'skinparam class {', 'abstract Value', '}',
      'package p {', 'class B', '}',
    ]),
  ).toEqual([
    'statement', 'member', 'comment', 'member', 'statement',
    'statement', 'member', 'member', 'member', 'member', 'statement',
    'statement', 'member', 'statement',
    'statement', 'statement', 'statement',
    'statement', 'statement', 'statement',
  ]);
});

test('finds the rules of a style, where a rule for notes starts no note', () => {
  expect(lineKinds(['<style>', 'note {', 'BackGroundColor #ffffcc', '}', 'legend {', '}', '</style>', 'class A', '<style>a { }</style>', 'class B'])).toEqual([
    'statement', 'style', 'style', 'style', 'style', 'style', 'statement', 'statement', 'statement', 'statement',
  ]);
  // A line that ends with a brace starts no note, also outside a style.
  expect(lineKinds(['note {', 'class A'])).toEqual(['statement', 'statement']);
});
