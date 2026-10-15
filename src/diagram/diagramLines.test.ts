// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the lines that the engine receives for a PlantUML text:
 * the lines of the text, the `@startuml` and `@enduml` lines around a body,
 * and the UML notation without class icons (R-GEN-007).
 */

import { describe, expect, test } from 'vitest';
import { defaultSettings } from '../settings';
import { diagramLines } from './diagramLines';
import { umlCommands } from './umlNotation';

describe('diagramLines', () => {
  test('keeps a diagram with its @start line and drops the final line break of the text', () => {
    expect(diagramLines('@startuml\nA -> B\n@enduml\n', defaultSettings)).toEqual(['@startuml', 'A -> B', '@enduml']);
    expect(diagramLines('  @startmindmap\r\n* a\r\n@endmindmap', defaultSettings)).toEqual(['  @startmindmap', '* a', '@endmindmap']);
  });

  test('puts @startuml and @enduml around the body of a diagram', () => {
    expect(diagramLines('A -> B\n', defaultSettings)).toEqual(['@startuml', 'A -> B', '@enduml']);
  });

  test('applies the UML notation without class icons, also to a body without @startuml', () => {
    expect(diagramLines('interface I\n', { ...defaultSettings, classIcons: false })).toEqual([
      '@startuml',
      ...umlCommands,
      'interface I <<interface>>',
      '@enduml',
    ]);
  });
});
