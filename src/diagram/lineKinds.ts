// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The kind of each line of a PlantUML text: a statement of the diagram, a
 * line of a comment, or a line of free text inside a note, title, legend,
 * header, footer or caption of several lines. The UML notation
 * ([R-GEN-007](../../docs/requirements.md#r-gen-007)) changes statements only,
 * and the code completion ([R-MD-004](../../docs/requirements.md#r-md-004),
 * [R-PUML-006](../../docs/requirements.md#r-puml-006)) reads declarations
 * from statements only and proposes nothing in comments and free text.
 */

/** LineKind is the kind of a line of a PlantUML text. */
export type LineKind = 'statement' | 'comment' | 'text';

/**
 * textStart matches the first line of a note, title, legend, header, footer or caption of several lines. The
 * line itself is a statement; the free text starts on the next line.
 */
const textStart = /^\s*(?:(?:[rh]?note)\b(?!.*:)(?!\s+")|legend\b|(?:(?:left|right|center)\s+)?(?:header|footer)\s*$|title\s*$|caption\s*$)/i;

/** textEnd matches the last line of a note, title, legend, header, footer or caption of several lines. */
const textEnd = /^\s*end\s*(?:[rh]?note|legend|header|footer|title|caption)\b/i;

/**
 * lineKinds returns the kind of each line of a PlantUML text. A line comment starts with `'`. A block comment
 * starts with `/'` and ends with `'/`; a line that starts a block comment counts as a comment as a whole. The
 * first and the last line of a note, title, legend, header, footer or caption of several lines are statements,
 * and the lines between them are free text.
 * @param lines - The lines of the text.
 */
export function lineKinds(lines: readonly string[]): LineKind[] {
  let inComment = false;
  let inText = false;
  return lines.map((line): LineKind => {
    if (inComment) {
      inComment = !line.includes(`'/`);
      return 'comment';
    }
    if (inText) {
      if (textEnd.test(line)) {
        inText = false;
        return 'statement';
      }
      return 'text';
    }
    const commentStart = line.indexOf(`/'`);
    if (commentStart >= 0 && !line.includes(`'/`, commentStart + 2)) {
      inComment = true;
      return 'comment';
    }
    if (/^\s*'/.test(line)) {
      return 'comment';
    }
    inText = textStart.test(line);
    return 'statement';
  });
}
