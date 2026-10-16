// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The formatting of PlantUML text ([R-MD-005](../../docs/requirements.md#r-md-005),
 * [R-PUML-007](../../docs/requirements.md#r-puml-007)). It indents the lines
 * inside the blocks of a UML diagram by their depth, removes the spaces at the
 * end of these lines, and writes one space for some runs of spaces and tabs.
 * It does not change the text that the diagram shows, except in members:
 *
 * - In a statement, a run of spaces becomes one space when it stands next to
 *   the first word of the statement, an arrow, `as`, quoted text, text in
 *   brackets, parentheses or braces, a stereotype, a color, or the colon before
 *   a label, for example `Car  -->   Tank  :   tank` becomes
 *   `Car --> Tank : tank`. A run between two other words stays, because it can
 *   be part of a name that the diagram shows, for example
 *   `package My   Package {`. The label after the colon keeps its spaces.
 * - Actions, dividers (`== … ==`), delays (`...`), swimlanes (`|Lane|`), and
 *   the text of titles, headers, footers, captions, legends, groups and the
 *   arrows of activity diagrams keep their spaces.
 * - In the body of a class, an object, a map or JSON data, each run of spaces
 *   becomes one space, outside quoted text, for example `- type:    string`
 *   becomes `- type: string`. A separator line (`--`, `..`, `==`, `__`) keeps
 *   its spaces.
 * - The rules of a style keep their spaces.
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
 * work breakdown structure or YAML data has a meaning; so do ditaa drawings,
 * wireframes and other diagrams of another type inside `@startuml`.
 */

import { actionStart, actorStart, LineKind, lineKinds, textEnd, textStart } from '../diagram/lineKinds';

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
 * otherDiagram matches the first statement of a diagram of another type inside `@startuml`: a ditaa drawing, a
 * wireframe (`salt`, or a body that starts with `{`), a Graphviz graph, a chart, a formula, or a network, rack or
 * packet diagram.
 */
const otherDiagram = /^\s*(?:(?:ditaa|salt|jcckit|math|latex|nwdiag|rackdiag|packetdiag)\b|(?:strict\s+)?(?:di)?graph\b|\{\s*$)/i;

/** keptStatement matches a statement that keeps its spaces: a divider `== … ==`, a delay `...`, a space `|||` or a swimlane `|Lane|`. */
const keptStatement = /^(?:==|\.\.\.|\|)/;

/**
 * textStatement matches the first word of a statement whose rest is text that the diagram shows: a title, header,
 * footer, caption, legend, frame or page, the value of a `return`, or the label of a group.
 */
const textStatement =
  /^(?:(?:(?:left|right|center)\s+)?(?:header|footer)|title|caption|legend|mainframe|newpage|return|alt|else|opt|loop|par2?|break|critical|group|box|partition)(?=\s)/i;

/** separator matches a separator line in the body of a class, with an optional title: `--`, `..`, `==` or `__`. */
const separator = /^(?:--|\.\.|==|__)/;

/** actor matches an actor at the start of a text, for example `:User:` before an arrow. */
const actor = new RegExp(actorStart.source.replace(String.raw`^\s*`, '^'));

/**
 * arrowCharacters matches a part of a statement that consists of the characters of an arrow only: its body of
 * `-`, `.`, `=` or `~` and its heads, after the removal of its styles and directions.
 */
const arrowCharacters = /^[<>|*ox#+^}{/\\()0]*[-.=~][-.=~<>|*ox#+^}{/\\()0]*$/;

/**
 * isArrow tells whether a part of a statement is an arrow, for example `-->`, `<|--`, `-up->` or `-[#red]->`.
 * @param token - The part of the statement, without spaces.
 */
const isArrow = (token: string): boolean =>
  arrowCharacters.test(token.replace(/\[[^\]]*\]/g, '').replace(/(?<=[-.=~])(?:up|down|left|right|le|ri|do|u|d|l|r)(?=[-.=~])/gi, ''));

/**
 * closing returns the index after the character that closes a group that opens at an index, with nested groups
 * of the same kind, or -1 when the group does not close on the line.
 * @param text - The text.
 * @param index - The index of the opening character.
 * @param open - The opening character.
 * @param close - The closing character.
 */
function closing(text: string, index: number, open: string, close: string): number {
  let depth = 0;
  for (let at = index; at < text.length; at++) {
    if (text[at] === open) {
      depth++;
    } else if (text[at] === close && --depth === 0) {
      return at + 1;
    }
  }
  return -1;
}

/**
 * keptEnd returns the index after a part of a statement that keeps its spaces and starts at an index, or the index
 * itself when no such part starts there. These parts are monospaced text of Creole (`""…""`), quoted text (`"…"`,
 * and the rest of a line after a quote without end), text in brackets, parentheses or braces, a stereotype,
 * generic parameters right after a name, and the strings of the preprocessor (`'…'`).
 * @param text - The statement.
 * @param index - The index.
 * @param preprocessor - Whether the statement is a line of the preprocessor.
 */
function keptEnd(text: string, index: number, preprocessor: boolean): number {
  const rest = text.slice(index);
  const monospaced = /^""(?:(?!"").)*""/.exec(rest);
  if (monospaced) {
    return index + monospaced[0].length;
  }
  for (const quote of preprocessor ? ['"', "'"] : ['"']) {
    if (rest.startsWith(quote)) {
      const end = text.indexOf(quote, index + 1);
      return end < 0 ? text.length : end + 1;
    }
  }
  if (rest.startsWith('<<')) {
    const end = text.indexOf('>>', index + 2);
    return end < 0 ? index : end + 2;
  }
  const groups: Record<string, string> = { '[': ']', '(': ')', '{': '}', '«': '»' };
  if (rest[0] in groups) {
    return Math.max(closing(text, index, rest[0], groups[rest[0]]), index);
  }
  if (rest[0] === '<' && /[\p{L}\p{N}_$]/u.test(text[index - 1] ?? '') && !/^<[-.=~|]/.test(rest)) {
    return Math.max(closing(text, index, '<', '>'), index);
  }
  return index;
}

/**
 * structural tells whether the spaces next to a part of a statement are no part of the text that the diagram
 * shows: the part is the first word of the statement, an arrow, `as`, quoted text, text in brackets, parentheses
 * or braces, a stereotype, a color or a time.
 * @param token - The part of the statement, without spaces.
 * @param index - The number of the part in the statement, from 0.
 * @param first - The first part of the statement.
 */
function structural(token: string, index: number, first: string): boolean {
  if (index === 0 || /^as$/i.test(token) || isArrow(token) || /^(?:["[({}#@«]|<<)/.test(token)) {
    return true;
  }
  if (/^(?:hide|show|remove|restore)$/i.test(first) || (index === 1 && /^skinparam$/i.test(first))) {
    return true;
  }
  return /^(?:[rh]?note|floating)$/i.test(first) && /^(?:note|left|right|top|bottom|over|of|on|link|across)$/i.test(token);
}

/**
 * statementSpaces writes one space for each run of spaces and tabs in a statement that is no part of the text
 * that the diagram shows. The module comment describes the rules.
 * @param statement - The statement, without the spaces at its start and end.
 */
export function statementSpaces(statement: string): string {
  if (keptStatement.test(statement) || (statement.startsWith(':') && !actor.test(statement))) {
    return statement;
  }
  const text = textStatement.exec(statement);
  if (text) {
    return text[0] + statement.slice(text[0].length).replace(/^\s+/, ' ');
  }
  const preprocessor = statement.startsWith('!');
  // parts holds the words of the statement at even indices and the runs of spaces between them at odd indices.
  const parts: string[] = [''];
  let label: string | undefined;
  let index = 0;
  while (index < statement.length && label === undefined) {
    const char = statement[index];
    const word = parts.length - 1;
    if (/\s/.test(char)) {
      const run = /^\s+/.exec(statement.slice(index))![0];
      parts.push(run, '');
      index += run.length;
    } else if (char === ':' && !preprocessor) {
      const colon = statement.startsWith('::', index) ? '::' : parts[word] === '' ? actor.exec(statement.slice(index))?.[0] : undefined;
      if (colon !== undefined) {
        parts[word] += colon;
        index += colon.length;
      } else {
        label = statement.slice(index + 1);
      }
    } else {
      const end = Math.max(keptEnd(statement, index, preprocessor), index + 1);
      parts[word] += statement.slice(index, end);
      index = end;
    }
  }
  const first = parts[0];
  let result = '';
  parts.forEach((part, at) => {
    if (at % 2 === 0) {
      result += part;
    } else if (part !== '') {
      const next = parts[at + 1];
      const beforeLabel = next === '' && at === parts.length - 2;
      result += beforeLabel || structural(parts[at - 1], (at - 1) / 2, first) || structural(next, (at + 1) / 2, first) ? ' ' : part;
    }
  });
  return label === undefined ? result : `${result}:${label.replace(/^\s+/, ' ')}`;
}

/**
 * memberSpaces writes one space for each run of spaces and tabs in a member of a class, an object, a map or JSON
 * data, outside quoted text. A separator line keeps its spaces.
 * @param member - The member, without the spaces at its start and end.
 */
export function memberSpaces(member: string): string {
  if (separator.test(member)) {
    return member;
  }
  const single = (text: string) => text.replace(/[ \t]+/g, ' ');
  let result = '';
  let start = 0;
  for (const kept of member.matchAll(/""(?:(?!"").)*""|"[^"]*"|".*$/g)) {
    result += single(member.slice(start, kept.index)) + kept[0];
    start = kept.index + kept[0].length;
  }
  return result + single(member.slice(start));
}

/**
 * spaces returns a trimmed line with the spaces of its kind.
 * @param line - The line, without the spaces at its start and end.
 * @param kind - The kind of the line.
 */
const spaces = (line: string, kind: LineKind): string =>
  kind === 'member' ? memberSpaces(line) : kind === 'statement' ? statementSpaces(line) : line;

/**
 * formatBody indents the lines of the body of a UML diagram.
 * @param lines - The lines of the body.
 * @param unit - The text of one level of indentation, for example two spaces or a tab.
 * @param base - The text before every formatted line, for example the indentation of a Markdown block.
 */
function formatBody(lines: readonly string[], unit: string, base: string): string[] {
  if (otherDiagram.test(lines.find((line) => line.trim() !== '' && !/^\s*'/.test(line)) ?? '')) {
    return [...lines];
  }
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
    const trimmed = spaces(line.trim(), kind);
    // Members and the rules of a style open and close braces only.
    const candidates = kind === 'statement' ? blocks : blocks.slice(0, 1);
    const innermost = open.at(-1);
    let result: string;
    if (innermost && candidates.includes(innermost) && innermost.close.test(trimmed)) {
      open.pop();
      result = indent(open.length) + trimmed;
    } else if (innermost && candidates.includes(innermost) && innermost.middle?.test(trimmed)) {
      result = indent(open.length - 1) + trimmed;
    } else {
      result = indent(open.length) + trimmed;
    }
    const opened = candidates.find((block) => block.open.test(trimmed));
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
