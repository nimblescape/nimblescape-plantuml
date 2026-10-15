// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The lines that the engine renders for a PlantUML text, with the settings of
 * the extension applied. The module uses no API of VS Code and no page, so the
 * scripts of the previews and the tests can use it.
 */

import { Settings } from '../settings';
import { umlNotation } from './umlNotation';

/**
 * isStartLine tells whether a line starts a diagram.
 * @param line - A line of the diagram text.
 */
const isStartLine = (line: string): boolean => line.trimStart().startsWith('@start');

/**
 * diagramLines returns the lines that the engine renders for a PlantUML text. A text without a line that starts
 * with `@start` holds the body of a diagram only, so the lines get `@startuml` and `@enduml` around it. Without
 * class icons, the UML diagrams get the UML notation ([R-GEN-007](../../docs/requirements.md#r-gen-007)).
 * @param source - The PlantUML text.
 * @param settings - The values of the settings.
 */
export function diagramLines(source: string, settings: Readonly<Settings>): string[] {
  const lines = source.replace(/\r?\n$/, '').split(/\r\n|\r|\n/);
  const diagram = lines.some(isStartLine) ? lines : ['@startuml', ...lines, '@enduml'];
  return settings.classIcons ? diagram : umlNotation(diagram);
}
