// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the lines that the engine receives for a PlantUML text:
 * the lines of the text, the `@startuml` and `@enduml` lines around a body,
 * and the UML notation of the setting `umlNotation` (R-GEN-007).
 */

import { describe, expect, test } from 'vitest';
import { defaultSettings, Settings } from '../settings';
import { diagramLines } from './diagramLines';
import { umlCommands } from './umlNotation';

/** plantUmlNotation are the settings with the own notation of PlantUML. */
const plantUmlNotation: Settings = { ...defaultSettings, umlNotation: false };

describe('diagramLines', () => {
  test('keeps a diagram with its @start line and drops the final line break of the text', () => {
    expect(diagramLines('@startuml\nA -> B\n@enduml\n', plantUmlNotation)).toEqual(['@startuml', 'A -> B', '@enduml']);
    expect(diagramLines('  @startmindmap\r\n* a\r\n@endmindmap', defaultSettings)).toEqual(['  @startmindmap', '* a', '@endmindmap']);
  });

  test('puts @startuml and @enduml around the body of a diagram', () => {
    expect(diagramLines('A -> B\n', plantUmlNotation)).toEqual(['@startuml', 'A -> B', '@enduml']);
  });

  test('applies the UML notation by default, also to a body without @startuml', () => {
    expect(diagramLines('interface I\n', defaultSettings)).toEqual(['@startuml', ...umlCommands, 'interface I <<interface>>', '@enduml']);
  });
});
