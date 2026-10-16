// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The lines that the engine renders for a PlantUML text, with the settings of
 * the extension applied. The module uses no API of VS Code and no page, so the
 * scripts of the previews and the tests can use it.
 */

import { Settings } from '../settings';
import { diagramRanges } from './diagramRanges';
import { LinesWithOrigins, umlNotationWithOrigins } from './umlNotation';

/**
 * diagramLines returns the lines that the engine renders for the text of a diagram, each with the index of the line
 * of the text that it comes from, so that an error of the engine can name the line of the text. A text without a
 * line that starts with `@start` holds the body of a diagram only, so the lines get `@startuml` and `@enduml` around
 * it. A diagram without its `@end` line gets one, because the engine fails without it. With the setting
 * `umlNotation`, the UML diagrams get the UML notation ([R-GEN-007](../../docs/requirements.md#r-gen-007)).
 * @param source - The PlantUML text.
 * @param settings - The values of the settings.
 */
export function diagramLines(source: string, settings: Readonly<Settings>): LinesWithOrigins {
  const lines = source.replace(/\r?\n$/, '').split(/\r\n|\r|\n/);
  const origins = lines.map((_, index) => index);
  const last = diagramRanges(lines).at(-1);
  let diagram: LinesWithOrigins = { lines, origins };
  if (!last) {
    diagram = { lines: ['@startuml', ...lines, '@enduml'], origins: [undefined, ...origins, undefined] };
  } else if (last.end === lines.length) {
    diagram = { lines: [...lines, `@end${last.type}`], origins: [...origins, undefined] };
  }
  if (!settings.umlNotation) {
    return diagram;
  }
  const notation = umlNotationWithOrigins(diagram.lines);
  return { lines: notation.lines, origins: notation.origins.map((origin) => (origin === undefined ? undefined : diagram.origins[origin])) };
}
