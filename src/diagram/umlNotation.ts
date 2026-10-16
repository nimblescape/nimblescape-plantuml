// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The UML notation ([R-GEN-007](../../docs/requirements.md#r-gen-007)). The
 * extension does not draw diagrams itself: it uses the means of PlantUML
 * only, in two steps.
 *
 * 1. PlantUML commands. `skinparam style strictuml` is the UML style of
 *    PlantUML: it removes the colored circles with a letter (C, I, E, A …)
 *    of the class kinds, draws synchronous messages with a filled arrowhead,
 *    draws no participants below the lifelines, and underlines the names of
 *    objects. `skinparam classAttributeIconSize 0` writes the visibility of a
 *    member as a character (`-` private, `#` protected, `~` package private,
 *    `+` public) instead of a colored icon. The function puts the commands
 *    after the `@startuml` line: PlantUML ignores the size of the icons in a
 *    diagram with relations when the command comes after them.
 * 2. Changes of the copy of the text that PlantUML renders, where PlantUML has
 *    no command for a part of the UML notation. A class kind with a keyword
 *    gets the keyword as a stereotype, for example `interface Shape` becomes
 *    `interface Shape <<interface>>`. The modifiers `static` and `abstract`
 *    at the start of a member in the body of a class become the modifiers
 *    `{static}` and `{abstract}` of PlantUML, which underline a static member
 *    and write an abstract member in italics, as UML does.
 *
 * Nothing is added twice: a command that the diagram sets itself, a keyword
 * that a declaration has as a stereotype already, and a member that has a
 * modifier of PlantUML already stay as they are. The function changes no line
 * in a comment, a style, or a note, title, legend, header or footer of several lines,
 * and no line of a component, deployment or use case diagram: there,
 * `interface` declares the circle of a provided interface, which is UML
 * notation already. Other diagram types (`@startgantt`, `@startmindmap` …)
 * stay as they are.
 */

import { diagramRanges } from './diagramRanges';
import { actorStart, LineKind, lineKinds } from './lineKinds';

/** keywords maps a PlantUML class kind to its UML keyword. */
export const keywords: Readonly<Record<string, string>> = {
  interface: 'interface',
  enum: 'enumeration',
  annotation: 'annotation',
  protocol: 'protocol',
  struct: 'struct',
  exception: 'exception',
  metaclass: 'metaclass',
  stereotype: 'stereotype',
  record: 'record',
  dataclass: 'dataclass',
};

/** UmlCommand is a PlantUML command of the UML notation. */
interface UmlCommand {
  /** command is the line of the command. */
  command: string;
  /** setBy matches a line with which a diagram sets the value of the command itself. */
  setBy: RegExp;
}

/**
 * commands are the PlantUML commands of the UML notation. A diagram sets the size of the visibility icons itself
 * with `skinparam classAttributeIconSize` or with `AttributeIconSize` in a block `skinparam class { … }`.
 */
const commands: readonly UmlCommand[] = [
  { command: 'skinparam style strictuml', setBy: /^\s*(?:skinparam\s+)?style\s+strictuml\b/i },
  { command: 'skinparam classAttributeIconSize 0', setBy: /^\s*(?:skinparam\s+)?(?:class)?attributeIconSize\b/i },
];

/** umlCommands are the lines of the PlantUML commands of the UML notation. */
export const umlCommands: readonly string[] = commands.map(({ command }) => command);

/**
 * declaration matches the start of the declaration of a class kind with a keyword: the kind, and the name in one
 * of the forms `Name`, `"Display name"`, `"Display name" as Name` and `Name as "Display name"`, with simple
 * generic parameters (`List<T>`). PlantUML rejects a stereotype after nested generic parameters
 * (`Map<K, List<V>>`) and misreads it after `Name as Name`, so such declarations do not match.
 */
const declaration = new RegExp(
  String.raw`^(\s*)(${Object.keys(keywords).join('|')})\s+` +
    String.raw`("[^"]+"\s+as\s+[\p{L}\p{N}_.:$]+|[\p{L}\p{N}_.:$]+\s+as\s+"[^"]+"|"[^"]+"|[\p{L}\p{N}_.:$]+)` +
    String.raw`(<[^<>]*>)?(?!\s+as\s)(?=\s|\{|$)`,
  'u',
);

/**
 * descriptionLine matches a statement that only a component, deployment or use case diagram accepts: a component
 * `[Name]`, a use case `(Name)`, or the declaration of one of their elements with a name, for example
 * `component Web` or `queue "Jobs"`. The initial state `[*]` of a state diagram and the start `(*)` of an
 * activity diagram do not match.
 */
const descriptionLine =
  /^\s*(?:\[(?!\*\])|\((?![)*])|(?:component|usecase|actor|agent|artifact|boundary|card|collections|control|file|hexagon|person|port|portin|portout|queue|stack|storage|action|process)\/?\s+(?=["\p{L}\p{N}_$[(]))/u;

/**
 * isDescriptionDiagram tells whether a diagram is a component, deployment or use case diagram: one of its
 * statements has an actor, a component, a use case or the declaration of one of their elements. Members, styles,
 * comments and free text do not count.
 * @param body - The lines between the `@startuml` and the `@enduml` line.
 * @param kinds - The kinds of the lines.
 */
const isDescriptionDiagram = (body: readonly string[], kinds: readonly LineKind[]): boolean =>
  body.some((line, index) => kinds[index] === 'statement' && (descriptionLine.test(line) || actorStart.test(line)));

/**
 * memberModifiers matches the modifiers at the start of a member, after its visibility: one or more of the words
 * `static`, `abstract` and `final`, followed by the name or the type of the member.
 */
const memberModifiers = /^(\s*(?:[-#~+]\s*)?)((?:(?:static|abstract|final)\s+)+)(?=[\p{L}_$])/u;

/** plantUmlModifier matches a modifier of PlantUML in a member. */
const plantUmlModifier = /\{(?:static|classifier|abstract)\}/i;

/**
 * hasStereotype tells whether a line has one of some words in a stereotype, for example `<<interface>>` or
 * `«interface»`: after `<<` or `«` and before the next `>` or `»`. It reads each part of the line between two of
 * these ends once, so that a long line of `<` characters takes no long time.
 * @param line - The line.
 * @param words - The words.
 */
const hasStereotype = (line: string, words: readonly string[]): boolean => {
  const word = new RegExp(String.raw`\b(?:${words.join('|')})\b`, 'i');
  return line.split(/[>»]/).some((part) => {
    const open = /<<|«/.exec(part);
    return open !== null && word.test(part.slice(open.index + open[0].length));
  });
};

/**
 * withKeyword adds the UML keyword to a line that declares a class kind with a keyword, and returns every other
 * line as it is. A declaration that has the keyword or the class kind as a stereotype already stays as it is.
 * @param line - A line of a class diagram.
 */
export function withKeyword(line: string): string {
  const match = declaration.exec(line);
  if (!match) {
    return line;
  }
  const keyword = keywords[match[2]];
  if (hasStereotype(line, [keyword, match[2]])) {
    return line;
  }
  const end = match.index + match[0].length;
  return `${line.slice(0, end)} <<${keyword}>>${line.slice(end)}`;
}

/**
 * withModifiers writes the modifiers `static` and `abstract` at the start of a member as the modifiers `{static}`
 * and `{abstract}` of PlantUML, for example `+ static count() : int` becomes `+ {static} count() : int`. A member
 * that has a modifier of PlantUML already stays as it is, and so does every other line.
 * @param line - A line in the body of a class.
 */
export function withModifiers(line: string): string {
  const match = memberModifiers.exec(line);
  if (!match || plantUmlModifier.test(line)) {
    return line;
  }
  const modifiers = match[2].replace(/\b(static|abstract)\b/g, '{$1}');
  return `${match[1]}${modifiers}${line.slice(match[0].length)}`;
}

/**
 * umlNotation returns the lines of a PlantUML text with the UML notation in its UML diagrams.
 * @param lines - The lines of the text, with `@start` and `@end` lines.
 */
export function umlNotation(lines: readonly string[]): string[] {
  const result: string[] = [];
  let next = 0;
  for (const { type, start, end } of diagramRanges(lines)) {
    if (type !== 'uml') {
      continue;
    }
    result.push(...lines.slice(next, start + 1));
    const body = lines.slice(start + 1, end);
    const kinds = lineKinds(body);
    const statements = body.filter((_, index) => kinds[index] === 'statement');
    result.push(...commands.filter(({ setBy }) => !statements.some((statement) => setBy.test(statement))).map(({ command }) => command));
    result.push(...(isDescriptionDiagram(body, kinds) ? body : withClassNotation(body, kinds)));
    next = end;
  }
  result.push(...lines.slice(next));
  return result;
}

/**
 * withClassNotation adds the UML keywords to the declarations of a diagram and writes the modifiers of the members
 * in the bodies of classes as modifiers of PlantUML. It changes no comment, style and free text.
 * @param body - The lines between the `@startuml` and the `@enduml` line.
 * @param kinds - The kinds of the lines.
 */
function withClassNotation(body: readonly string[], kinds: readonly LineKind[]): string[] {
  return body.map((line, index) => {
    switch (kinds[index]) {
      case 'statement':
        return withKeyword(line);
      case 'member':
        return withModifiers(line);
      default:
        return line;
    }
  });
}
