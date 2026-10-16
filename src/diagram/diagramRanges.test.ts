// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the one rule for the start and the end of a diagram that
 * the previews, the UML notation and the formatting share: the types, a
 * diagram without an end line, and the letter case that the engine requires.
 */

import { expect, test } from 'vitest';
import { formatLines } from '../language/formatting';
import { diagramSources } from '../preview/pumlPreview';
import { diagramRanges, isStartLine } from './diagramRanges';
import { umlNotation } from './umlNotation';

test('finds each diagram with its type, also a last diagram without an end line', () => {
  const lines = ['@startuml', 'A -> B', '@enduml', 'text', '  @startmindmap', '* a', '@startuml', '@endmindmap', '@startgantt(id=x)', '[A] lasts 1 day'];
  expect(diagramRanges(lines)).toEqual([
    { type: 'uml', start: 0, end: 2 },
    { type: 'mindmap', start: 4, end: 7 },
    { type: 'gantt', start: 8, end: 10 },
  ]);
  expect(diagramRanges(['A -> B'])).toEqual([]);
});

test('reads the start and the end of a diagram in small letters only, as the engine does', () => {
  expect(isStartLine('@startuml')).toBe(true);
  expect(isStartLine('@StartUml')).toBe(false);
  expect(diagramRanges(['@startuml', 'A -> B', '@EndUml', '@enduml'])).toEqual([{ type: 'uml', start: 0, end: 3 }]);

  // The previews, the UML notation and the formatting all follow the rule.
  const text = ['@STARTUML', 'interface A', '@ENDUML'];
  expect(diagramSources(text.join('\n'))).toEqual([text.join('\n')]);
  expect(umlNotation(text)).toEqual(text);
  expect(formatLines(['@StartUml', 'package p {', 'class A', '}', '@EndUml'], '  ')).toEqual([
    '@StartUml',
    'package p {',
    '  class A',
    '}',
    '@EndUml',
  ]);
});
