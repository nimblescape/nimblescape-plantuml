// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The formatting of PlantUML text ([R-MD-005](../../docs/requirements.md#r-md-005),
 * [R-PUML-007](../../docs/requirements.md#r-puml-007)). It indents the lines
 * inside the blocks of a UML diagram by their depth, removes the spaces at the
 * end of these lines, and writes one space for each run of spaces and tabs
 * inside a statement, for example `Car  -->   Tank` becomes `Car --> Tank`.
 * Quoted text (`"…"`) and monospaced text of Creole (`""…""`) keep their
 * spaces, and so does the rest of a line after a quote without end. It changes
 * nothing else in a line.
 *
 * A block has an opening line, optional middle lines and a closing line:
 *
 * | Block | Opening line | Middle lines | Closing line |
 * | --- | --- | --- | --- |
 * | Braces | ends with `{` | | starts with `}` |
 * | Group of a sequence diagram | `alt`, `opt`, `loop`, `par`, `break …`, `critical`, `group`, `box` | `else` | `end`, `end box`, `end group` … |
 * | Condition | `if` | `else`, `elseif` | `endif` |
 * | Loop | `while` | | `endwhile` |
 * | Loop | `repeat` | `backward` | `repeat while` |
 * | Parallel flows | `fork`, `split` | `fork again`, `split again` | `end fork`, `end merge`, `end split` |
 * | Switch | `switch` | `case` | `endswitch` |
 * | Note, title, legend, header, footer, caption, reference of several lines | `note …`, `legend` … | | `end note`, `endlegend` … |
 * | Style | `<style>` | | `</style>` |
 * | Preprocessor | `!if`, `!ifdef`, `!ifndef`, `!while`, `!foreach`, `!procedure`, `!function`, `!startsub`, `!definelong` | `!else`, `!elseif` | `!endif`, `!endwhile`, `!endfor`, `!endprocedure`, `!endfunction`, `!endsub`, `!enddefinelong` |
 *
 * A closing line closes a block only when it fits the innermost open block,
 * so the `end` of an activity diagram, which ends the flow, stays a statement
 * inside an `if`. A `break` without text breaks a loop of an activity diagram
 * and opens no group.
 *
 * The free text of notes and the lines of a comment of several lines keep
 * their indentation. The further lines of an action of several lines move with
 * its first line, because PlantUML shows the indentation of a further line
 * beyond the indentation of the first line as spaces. Diagrams of other types
 * than UML keep every line as it is, because the indentation of a mind map, a
 * work breakdown structure or YAML data has a meaning.
 */

import { actionStart, lineKinds, textEnd, textStart } from '../diagram/lineKinds';

/** Block describes a kind of block: its opening, middle and closing lines, which the trimmed line must match. */
interface Block {
  open: RegExp;
  middle?: RegExp;
  close: RegExp;
}

/** blocks are the kinds of blocks, in the order of the check of an opening line. */
const blocks: readonly Block[] = [
  { open: /\{$/, close: /^\}/ },
  {
    open: /^(?:alt|opt|loop|par|par2|critical|group|box)\b|^break\s+\S/i,
    middle: /^else\b/i,
    close: /^end(?:\s+(?:box|group|alt|opt|loop|par|break|critical))?$/i,
  },
  { open: /^if\b/i, middle: /^else(?:\s*if)?\b/i, close: /^end\s*if\b/i },
  { open: /^while\b/i, close: /^end\s*while\b/i },
  { open: /^repeat\b(?!\s*while\b)/i, middle: /^backward\b/i, close: /^repeat\s*while\b/i },
  { open: /^fork\b(?!\s+again\b)/i, middle: /^fork\s+again\b/i, close: /^end\s*(?:fork|merge)\b/i },
  { open: /^split\b(?!\s+again\b)/i, middle: /^split\s+again\b/i, close: /^end\s*split\b/i },
  { open: /^switch\b/i, middle: /^case\b/i, close: /^end\s*switch\b/i },
  { open: textStart, close: textEnd },
  { open: /^<style>$/i, close: /^<\/style>$/i },
  { open: /^!(?:if|ifdef|ifndef)\b/i, middle: /^!(?:else|elseif)\b/i, close: /^!endif\b/i },
  { open: /^!while\b/i, close: /^!endwhile\b/i },
  { open: /^!foreach\b/i, close: /^!endfor\b/i },
  { open: /^!(?:unquoted\s+)?(?:procedure|function)\b(?!.*!return\b)/i, close: /^!end(?:procedure|function)\b/i },
  { open: /^!startsub\b/i, close: /^!endsub\b/i },
  { open: /^!definelong\b/i, close: /^!enddefinelong\b/i },
];

/**
 * keptSpaces matches the parts of a statement that keep their spaces: monospaced text of Creole (`""…""`), quoted
 * text (`"…"`), and the rest of a line after a quote without end.
 */
const keptSpaces = /""(?:(?!"").)*""|"[^"]*"|".*$/g;

/**
 * singleSpaces writes one space for each run of spaces and tabs in a statement, outside the parts that keep their
 * spaces.
 * @param statement - The statement, without the spaces at its start and end.
 */
export function singleSpaces(statement: string): string {
  const single = (text: string) => text.replace(/[ \t]+/g, ' ');
  let result = '';
  let start = 0;
  for (const kept of statement.matchAll(keptSpaces)) {
    result += single(statement.slice(start, kept.index)) + kept[0];
    start = kept.index + kept[0].length;
  }
  return result + single(statement.slice(start));
}

/**
 * formatBody indents the lines of the body of a UML diagram.
 * @param lines - The lines of the body.
 * @param unit - The text of one level of indentation, for example two spaces or a tab.
 * @param base - The text before every formatted line, for example the indentation of a Markdown block.
 */
function formatBody(lines: readonly string[], unit: string, base: string): string[] {
  const open: Block[] = [];
  const kinds = lineKinds(lines);
  const indent = (depth: number) => base + unit.repeat(Math.max(depth, 0));
  /** action holds the old and the new indentation of the first line of the action of several lines. */
  let action: { from: string; to: string } | undefined;
  return lines.map((line, index) => {
    const kind = kinds[index];
    const indentation = /^\s*/.exec(line)?.[0] ?? '';
    if (kind === 'text' && action && line.trim() !== '') {
      const beyond = indentation.startsWith(action.from) ? indentation.slice(action.from.length) : '';
      return action.to + beyond + line.slice(indentation.length);
    }
    if (kind === 'text' || kind === 'blockComment') {
      return line;
    }
    action = undefined;
    if (line.trim() === '') {
      return '';
    }
    if (kind === 'comment') {
      return indent(open.length) + line.trim();
    }
    const trimmed = singleSpaces(line.trim());
    const innermost = open.at(-1);
    let result: string;
    if (innermost?.close.test(trimmed)) {
      open.pop();
      result = indent(open.length) + trimmed;
    } else if (innermost?.middle?.test(trimmed)) {
      result = indent(open.length - 1) + trimmed;
    } else {
      result = indent(open.length) + trimmed;
    }
    const opened = blocks.find((block) => block.open.test(trimmed));
    if (opened) {
      open.push(opened);
    }
    if (actionStart.test(line)) {
      action = { from: indentation, to: /^\s*/.exec(result)?.[0] ?? '' };
    }
    return result;
  });
}

/**
 * formatLines returns the formatted lines of a PlantUML text, one for each line of the text. The lines inside a
 * UML diagram (`@startuml` … `@enduml`, or a text without `@start` lines) get the indentation of their depth.
 * The `@start` and `@end` lines of a UML diagram get the base indentation only. Every other line stays as it is.
 * @param lines - The lines of the text.
 * @param unit - The text of one level of indentation, for example two spaces or a tab.
 * @param base - The text before every formatted line, for example the indentation of a Markdown block.
 */
export function formatLines(lines: readonly string[], unit: string, base = ''): string[] {
  if (!lines.some((line) => /^\s*@start/i.test(line))) {
    return formatBody(lines, unit, base);
  }
  const result = [...lines];
  let index = 0;
  while (index < lines.length) {
    if (!/^\s*@startuml\b/i.test(lines[index])) {
      index++;
      continue;
    }
    result[index] = base + lines[index].trim();
    let end = index + 1;
    while (end < lines.length && !/^\s*@enduml\b/i.test(lines[end])) {
      end++;
    }
    result.splice(index + 1, end - index - 1, ...formatBody(lines.slice(index + 1, end), unit, base));
    if (end < lines.length) {
      result[end] = base + lines[end].trim();
    }
    index = end + 1;
  }
  return result;
}
