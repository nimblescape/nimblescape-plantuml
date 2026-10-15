// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The UML notation for class diagrams
 * ([R-GEN-007](../../docs/requirements.md#r-gen-007)). PlantUML draws the
 * kind of a class as a colored circle with a letter (C, I, E, A …) and the
 * visibility of a member as a colored icon. The UML standard writes the kind
 * as a keyword above the name, for example «interface», and the visibility as
 * a character: `-` private, `#` protected, `~` package private, `+` public.
 *
 * PlantUML has two commands for the parts that it can change itself:
 * `hide circle` removes the circles, and `skinparam classAttributeIconSize 0`
 * writes the visibility as a character. The function puts both after the
 * `@startuml` line of each diagram, so that the lines of the diagram itself
 * can override them. Other diagram types (`@startgantt`, `@startmindmap` …)
 * do not accept `hide circle`, so they stay as they are.
 *
 * PlantUML has no command for the keywords. The function therefore adds the
 * keyword as a stereotype to the declaration of each class kind that has a
 * keyword, for example `interface Shape` becomes
 * `interface Shape <<interface>>`. It changes no line in a comment or in a
 * note, title, legend, header or footer of several lines, and no line of a
 * component, deployment or use case diagram: there, `interface` declares the
 * circle of a provided interface, which is UML notation already. A class
 * shows no keyword, and PlantUML already writes the name of an abstract class
 * in italics, as UML does.
 */

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

/** umlCommands are the PlantUML commands that change the circles and the visibility icons. */
export const umlCommands: readonly string[] = ['skinparam classAttributeIconSize 0', 'hide circle'];

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
 * descriptionLine matches a line that only a component, deployment or use case diagram accepts: a component
 * `[Name]`, a use case `(Name)`, an actor `:Name:`, or one of their declarations.
 */
const descriptionLine =
  /^\s*(?:\[|\((?!\))|:[^:]+:|(?:component|usecase|actor|agent|artifact|boundary|card|collections|control|file|hexagon|person|port|portin|portout|queue|stack|storage|action|process)(?:\/)?(?:\s|$))/;

/** blockStart matches the first line of a note, title, legend, header or footer of several lines. */
const blockStart = /^\s*(?:(?:[rh]?note)\b(?!.*:)(?!\s+")|legend\b|(?:(?:left|right|center)\s+)?(?:header|footer)\s*$|title\s*$|caption\s*$)/i;

/** blockEnd matches the last line of a note, title, legend, header or footer of several lines. */
const blockEnd = /^\s*end\s*(?:[rh]?note|legend|header|footer|title|caption)\b/i;

/**
 * withKeyword adds the UML keyword to a line that declares a class kind with a keyword, and returns every other
 * line as it is. A declaration that has the keyword as a stereotype already stays as it is.
 * @param line - A line of a class diagram.
 */
export function withKeyword(line: string): string {
  const match = declaration.exec(line);
  if (!match) {
    return line;
  }
  const keyword = keywords[match[2]];
  if (line.toLowerCase().includes(`<<${keyword}>>`)) {
    return line;
  }
  const end = match.index + match[0].length;
  return `${line.slice(0, end)} <<${keyword}>>${line.slice(end)}`;
}

/**
 * umlNotation returns the lines of a PlantUML text with the UML notation in its UML diagrams.
 * @param lines - The lines of the text, with `@start` and `@end` lines.
 */
export function umlNotation(lines: readonly string[]): string[] {
  const result: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index++];
    result.push(line);
    if (!/^\s*@startuml\b/.test(line)) {
      continue;
    }
    let end = index;
    while (end < lines.length && !/^\s*@enduml\b/.test(lines[end])) {
      end++;
    }
    const body = lines.slice(index, end);
    result.push(...umlCommands);
    result.push(...(body.some((bodyLine) => descriptionLine.test(bodyLine)) ? body : withKeywords(body)));
    index = end;
  }
  return result;
}

/**
 * withKeywords adds the UML keywords to the declarations of a diagram, outside comments and outside notes,
 * titles, legends, headers and footers of several lines.
 * @param body - The lines between the `@startuml` and the `@enduml` line.
 */
function withKeywords(body: readonly string[]): string[] {
  let inComment = false;
  let inBlock = false;
  return body.map((line) => {
    if (inComment) {
      inComment = !line.includes(`'/`);
      return line;
    }
    if (inBlock) {
      inBlock = !blockEnd.test(line);
      return line;
    }
    const commentStart = line.indexOf(`/'`);
    if (commentStart >= 0 && !line.includes(`'/`, commentStart + 2)) {
      inComment = true;
      return line;
    }
    if (blockStart.test(line)) {
      inBlock = true;
      return line;
    }
    return withKeyword(line);
  });
}
