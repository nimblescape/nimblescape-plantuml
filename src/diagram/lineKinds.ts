// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The kind of each line of a PlantUML text: a statement of the diagram, a
 * member of a class, a rule of a style, a comment, or a line of free text.
 * The UML notation ([R-GEN-007](../../docs/requirements.md#r-gen-007))
 * changes statements and members only, the code completion
 * ([R-MD-004](../../docs/requirements.md#r-md-004),
 * [R-PUML-006](../../docs/requirements.md#r-puml-006)) reads declarations
 * from statements only and proposes nothing in styles, comments and free
 * text, and the formatting ([R-MD-005](../../docs/requirements.md#r-md-005),
 * [R-PUML-007](../../docs/requirements.md#r-puml-007)) indents statements,
 * members, styles and line comments and keeps comments of several lines and
 * free text as they are.
 */

/**
 * LineKind is the kind of a line of a PlantUML text:
 * - `statement`: a line of the diagram;
 * - `member`: a line in the body of a class, an object, a map or JSON data, between the line that ends with `{`
 *   and the line that starts with `}`;
 * - `style`: a line between `<style>` and `</style>`;
 * - `comment`: a line comment, which starts with `'`;
 * - `blockComment`: a line of a comment between `/'` and `'/` that ends on a later line;
 * - `text`: free text inside a note, title, legend, header, footer, caption or reference of several lines, and
 *   the further lines of an action of an activity diagram of several lines.
 */
export type LineKind = 'statement' | 'member' | 'style' | 'comment' | 'blockComment' | 'text';

/**
 * textStart matches the first line of a note, title, legend, header, footer, caption or reference of several
 * lines. The line itself is a statement; the free text starts on the next line. A line that ends with `{` starts
 * no text, for example `note {` in a style.
 */
export const textStart =
  /^\s*(?!.*\{\s*$)(?:(?:[rh]?note)\b(?!.*:)(?!\s+")|legend\b|(?:(?:left|right|center)\s+)?(?:header|footer)\s*$|title\s*$|caption\s*$|ref\s+over\b(?!.*:))/i;

/**
 * textEnd matches the last line of a note, title, legend, header, footer, caption or reference of several lines.
 * As in PlantUML, at most one space or tab stands between `end` and the second word: `end note`, `endnote`.
 */
export const textEnd = /^\s*end[ \t]?(?:[rh]?note|legend|header|footer|title|caption|ref)\b/i;

/**
 * classKinds are the kinds of classes whose declaration can open a body of members with `{`, and the other
 * elements whose body holds fields: objects, maps and JSON data.
 */
export const classKinds: readonly string[] = [
  'abstract class', 'abstract', 'class', 'entity', 'interface', 'enum', 'annotation', 'protocol', 'struct',
  'exception', 'metaclass', 'stereotype', 'record', 'dataclass', 'object', 'map', 'json',
];

/** bodyStart matches the declaration of a class, an object, a map or JSON data that opens its body with `{`. */
export const bodyStart = new RegExp(String.raw`^\s*(?:${classKinds.map((kind) => kind.replace(' ', String.raw`\s+`)).join('|')})\s.*\{\s*$`, 'i');

/**
 * actor matches the rest of an actor of a use case diagram after its first colon: a name and a second colon,
 * followed by nothing, by `as`, by an arrow or by the colon of a label.
 */
const actor = String.raw`[^:]+:(?!:)(?=\s*(?:$|as\b|:|[-.=~<]|[ox*#+^}{|][-.=~]))`;

/** actorStart matches an actor at the start of a line, for example `:User:` or `:User: --> (Log in)`. */
export const actorStart = new RegExp(String.raw`^\s*:${actor}`);

/**
 * actionStart matches the first line of an action of an activity diagram that continues on the next line: it
 * starts with `:`, is no actor, and does not end with one of the characters that end an action (`;`, `|`, `<`,
 * `>`, `/`, `]`, `}`). An action can hold a colon, for example `:Step 1: read`.
 */
export const actionStart = new RegExp(String.raw`^\s*:(?!${actor})(?!.*[;|<>/\]}]\s*$)`);

/** actionEnd matches the last line of an action of several lines. */
const actionEnd = /[;|<>/\]}]\s*$/;

/**
 * braces returns the number of the opening braces of a line minus the number of its closing braces, outside
 * quoted text, so that the body of JSON data can hold objects.
 * @param line - The line.
 */
const braces = (line: string): number => {
  const outside = line.replace(/"(?:[^"\\]|\\.)*"/g, '');
  return (outside.match(/\{/g)?.length ?? 0) - (outside.match(/\}/g)?.length ?? 0);
};

/**
 * lineKinds returns the kind of each line of a PlantUML text. A line that starts a block comment counts as a
 * comment of several lines as a whole. The first and the last line of a note, title, legend, header, footer,
 * caption or reference of several lines are statements, and the lines between them are free text. The first
 * line of an action of several lines is a statement, and its further lines are free text. The lines that open and
 * close a body or a style are statements, and the lines between them are members or style rules.
 * @param lines - The lines of the text.
 */
export function lineKinds(lines: readonly string[]): LineKind[] {
  let inComment = false;
  let inText = false;
  let inAction = false;
  let inStyle = false;
  /** depth is the number of the open braces of a body. */
  let depth = 0;
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
    if (inStyle) {
      inStyle = !/<\/style>/i.test(line);
      return inStyle ? 'style' : 'statement';
    }
    const commentStart = line.indexOf(`/'`);
    if (commentStart >= 0 && !line.includes(`'/`, commentStart + 2)) {
      inComment = true;
      return 'blockComment';
    }
    if (/^\s*'/.test(line)) {
      return 'comment';
    }
    if (depth > 0) {
      depth += braces(line);
      return depth > 0 ? 'member' : 'statement';
    }
    inStyle = /^\s*<style>/i.test(line) && !/<\/style>/i.test(line);
    inText = textStart.test(line);
    inAction = actionStart.test(line);
    depth = bodyStart.test(line) ? Math.max(braces(line), 1) : 0;
    return 'statement';
  });
}
