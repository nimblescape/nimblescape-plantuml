// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The diagrams of a PlantUML text. A diagram starts with a line `@start` and
 * its type, for example `@startuml` or `@startmindmap`, and ends with the next
 * line that starts with `@end`, or at the end of the text. As in the engine,
 * these lines are in small letters: the engine does not read `@StartUml` as
 * the start of a diagram. The previews, the UML notation and the formatting
 * use this one rule. The module uses no API of VS Code and no page.
 */

/** startLine matches the line that starts a diagram, with the type of the diagram, for example `uml`. */
const startLine = /^\s*@start([a-z]*)/;

/** endLine matches the line that ends a diagram. */
const endLine = /^\s*@end/;

/** DiagramRange is the range of the lines of one diagram of a text. */
export interface DiagramRange {
  /** type is the type of the diagram, for example `uml` or `mindmap`. */
  type: string;
  /** start is the index of the `@start` line. */
  start: number;
  /** end is the index of the `@end` line, or the number of lines when the diagram has no `@end` line. */
  end: number;
}

/**
 * isStartLine tells whether a line starts a diagram.
 * @param line - A line of a PlantUML text.
 */
export const isStartLine = (line: string): boolean => startLine.test(line);

/**
 * diagramRanges returns the diagrams of a PlantUML text, in their order. A `@start` line inside a diagram belongs to
 * that diagram. A text without a `@start` line has no diagram range.
 * @param lines - The lines of the text.
 */
export function diagramRanges(lines: readonly string[]): DiagramRange[] {
  const ranges: DiagramRange[] = [];
  let open: { type: string; start: number } | undefined;
  lines.forEach((line, index) => {
    if (!open) {
      const match = startLine.exec(line);
      if (match) {
        open = { type: match[1], start: index };
      }
    } else if (endLine.test(line)) {
      ranges.push({ ...open, end: index });
      open = undefined;
    }
  });
  if (open) {
    ranges.push({ ...open, end: lines.length });
  }
  return ranges;
}
