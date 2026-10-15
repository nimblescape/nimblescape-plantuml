// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The kind of each line of a PlantUML text: a statement of the diagram, a
 * comment, or a line of free text. The UML notation
 * ([R-GEN-007](../../docs/requirements.md#r-gen-007)) changes statements only,
 * the code completion ([R-MD-004](../../docs/requirements.md#r-md-004),
 * [R-PUML-006](../../docs/requirements.md#r-puml-006)) reads declarations
 * from statements only and proposes nothing in comments and free text, and the
 * formatting ([R-MD-005](../../docs/requirements.md#r-md-005),
 * [R-PUML-007](../../docs/requirements.md#r-puml-007)) indents statements and
 * line comments and keeps comments of several lines and free text as they are.
 */

/**
 * LineKind is the kind of a line of a PlantUML text:
 * - `statement`: a line of the diagram;
 * - `comment`: a line comment, which starts with `'`;
 * - `blockComment`: a line of a comment between `/'` and `'/` that ends on a later line;
 * - `text`: free text inside a note, title, legend, header, footer, caption or reference of several lines, and
 *   the further lines of an action of an activity diagram of several lines.
 */
export type LineKind = 'statement' | 'comment' | 'blockComment' | 'text';

/**
 * textStart matches the first line of a note, title, legend, header, footer, caption or reference of several
 * lines. The line itself is a statement; the free text starts on the next line.
 */
export const textStart =
  /^\s*(?:(?:[rh]?note)\b(?!.*:)(?!\s+")|legend\b|(?:(?:left|right|center)\s+)?(?:header|footer)\s*$|title\s*$|caption\s*$|ref\s+over\b(?!.*:))/i;

/** textEnd matches the last line of a note, title, legend, header, footer, caption or reference of several lines. */
export const textEnd = /^\s*end\s*(?:[rh]?note|legend|header|footer|title|caption|ref)\b/i;

/**
 * actionStart matches the first line of an action of an activity diagram that continues on the next line: it
 * starts with `:` and does not end with one of the characters that end an action (`;`, `|`, `<`, `>`, `/`, `]`,
 * `}`). An actor such as `:User:` is no action.
 */
export const actionStart = /^\s*:(?![^:]*:(?!:))(?!.*[;|<>/\]}]\s*$)/;

/** actionEnd matches the last line of an action of several lines. */
const actionEnd = /[;|<>/\]}]\s*$/;

/**
 * lineKinds returns the kind of each line of a PlantUML text. A line that starts a block comment counts as a
 * comment of several lines as a whole. The first and the last line of a note, title, legend, header, footer,
 * caption or reference of several lines are statements, and the lines between them are free text. The first
 * line of an action of several lines is a statement, and its further lines are free text.
 * @param lines - The lines of the text.
 */
export function lineKinds(lines: readonly string[]): LineKind[] {
  let inComment = false;
  let inText = false;
  let inAction = false;
  return lines.map((line): LineKind => {
    if (inComment) {
      inComment = !line.includes(`'/`);
      return 'blockComment';
    }
    if (inAction) {
      inAction = !actionEnd.test(line);
      return 'text';
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
      return 'blockComment';
    }
    if (/^\s*'/.test(line)) {
      return 'comment';
    }
    inText = textStart.test(line);
    inAction = actionStart.test(line);
    return 'statement';
  });
}
