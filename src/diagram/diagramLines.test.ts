// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the lines that the engine receives for a PlantUML text:
 * the lines of the text, the `@startuml` and `@enduml` lines around a body,
 * the end line of a diagram without one (R-GEN-009), the UML notation of the
 * setting `umlNotation` (R-GEN-007), and the line of the text of each line,
 * for the line numbers of errors (R-GEN-010).
 */

import { describe, expect, test } from 'vitest';
import { defaultSettings, Settings } from '../settings';
import { diagramLines } from './diagramLines';
import { umlCommands } from './umlNotation';

/** plantUmlNotation are the settings with the own notation of PlantUML. */
const plantUmlNotation: Settings = { ...defaultSettings, umlNotation: false };

describe('diagramLines', () => {
  test('keeps a diagram with its @start line and drops the final line break of the text', () => {
    expect(diagramLines('@startuml\nA -> B\n@enduml\n', plantUmlNotation)).toEqual({ lines: ['@startuml', 'A -> B', '@enduml'], origins: [0, 1, 2] });
    expect(diagramLines('  @startmindmap\r\n* a\r\n@endmindmap', defaultSettings).lines).toEqual(['  @startmindmap', '* a', '@endmindmap']);
  });

  test('puts @startuml and @enduml around the body of a diagram', () => {
    expect(diagramLines('A -> B\n', plantUmlNotation)).toEqual({ lines: ['@startuml', 'A -> B', '@enduml'], origins: [undefined, 0, undefined] });
  });

  test('adds the end line to a diagram without one, because the engine fails without it', () => {
    expect(diagramLines('@startmindmap\n* a', plantUmlNotation)).toEqual({ lines: ['@startmindmap', '* a', '@endmindmap'], origins: [0, 1, undefined] });
    expect(diagramLines('@startuml\nA -> B\n', defaultSettings).lines.at(-1)).toBe('@enduml');
  });

  test('applies the UML notation by default, also to a body without @startuml, and keeps the line of the text of each line', () => {
    expect(diagramLines('interface I\nclass C\n', defaultSettings)).toEqual({
      lines: ['@startuml', ...umlCommands, 'interface I <<interface>>', 'class C', '@enduml'],
      origins: [undefined, ...umlCommands.map(() => undefined), 0, 1, undefined],
    });
  });
});
