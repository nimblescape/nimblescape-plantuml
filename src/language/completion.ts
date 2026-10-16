// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The code completion of PlantUML ([R-MD-004](../../docs/requirements.md#r-md-004),
 * [R-PUML-006](../../docs/requirements.md#r-puml-006)). It proposes the
 * keywords of PlantUML and the names that the same context declares: the
 * same `.puml` file, or the same PlantUML block of a Markdown file. The
 * module uses no API of VS Code; the extension passes it the lines of the
 * context and turns its proposals into completion items.
 *
 * A name is declared in one of these ways:
 * - by a keyword, for example `class Car`, `participant "Long name" as L` or
 *   `component [Web server] as Web`; the alias is the name, because the
 *   other lines use it;
 * - by a link, for example `Alice -> Bob` or `[Web] ..> [Database]`;
 * - by a component, use case, actor or task at the start of a line, for
 *   example `[Web server]`, `(Log in)`, `:User:` or `[Design] lasts 5 days`;
 * - by the preprocessor, for example `!procedure $box($name)`,
 *   `!$color = "red"` or `!define LIGHT`.
 *
 * The completion reads statements only: no comment and no free text of a note,
 * title, legend, header, footer or caption of several lines. The line of the
 * cursor declares nothing, because the name that the user is typing there is
 * not complete.
 */

import { lineKinds } from '../diagram/lineKinds';
import {
  controlKeywords,
  diagramTypes,
  documentKeywords,
  elementKeywords,
  linkKeywords,
  preprocessorKeywords,
} from './keywords';

/** ProposalKind is the kind of a proposal; the names are those of vscode.CompletionItemKind. */
export type ProposalKind = 'Keyword' | 'Class' | 'Interface' | 'Enum' | 'Struct' | 'Module' | 'Variable' | 'Function' | 'Constant';

/** Proposal is a text that the completion proposes. */
export interface Proposal {
  /** label is the text that the completion inserts. */
  label: string;
  /** kind is the kind of the proposal, which selects its icon. */
  kind: ProposalKind;
  /** detail names what declared a name, for example `class` or `!procedure`. */
  detail?: string;
}

/** Completion is the result of the completion at a position. */
export interface Completion {
  /** start is the column where the text that a proposal replaces starts: the start of the word at the cursor. */
  start: number;
  /** end is the column where the word at the cursor ends. */
  end: number;
  /** proposals are the proposals, without an order. */
  proposals: Proposal[];
}

/** nameText matches a plain name, with the parts of a qualified name: `Car`, `java.util.List`, `std::vector`. */
const nameText = String.raw`[\p{L}\p{N}_$]+(?:(?:\.|::)[\p{L}\p{N}_$]+)*`;

/** tokenText matches an element in a statement: a name, a quoted name, a component, a use case or an actor. */
const tokenText = String.raw`"[^"]+"|\[[^\]]+\]|\([^)]+\)|:[^:\s][^:]*:|${nameText}`;

/**
 * arrowText matches the arrow of a link: an optional head, a line of `-`, `.`, `=` or `~` with optional styles
 * (`-[#red]->`) and directions (`-up->`), and an optional head. The letter heads `o` and `x` count only when no
 * letter of a name touches them.
 */
const arrowText =
  String.raw`(?:[<*#}{+^\\/|?]|(?<![\p{L}\p{N}_])[ox])*` +
  String.raw`[-.=~](?:[-.=~]|\[[^\]]*\]|(?<=[-.=~])(?:left|right|up|down|le|ri|do|l|r|u|d)(?=[-.=~]))*` +
  String.raw`(?:[>*#}{+^\\/|?]|[ox](?![\p{L}\p{N}_]))*`;

/** declaringKeywords are the keywords that declare a named element. */
const declaringKeywords = elementKeywords.filter((keyword) => !['together', 'box', 'partition'].includes(keyword));

/** kinds maps a declaring keyword to the kind of its names; other keywords declare a Variable. */
const kinds: Readonly<Record<string, ProposalKind>> = {
  class: 'Class', abstract: 'Class', annotation: 'Class', protocol: 'Class', exception: 'Class', metaclass: 'Class',
  stereotype: 'Class', record: 'Class', dataclass: 'Class', object: 'Class', map: 'Class', json: 'Class',
  interface: 'Interface', enum: 'Enum', struct: 'Struct', package: 'Module', namespace: 'Module',
};

/** keywordDeclaration matches a declaration by a keyword: the keyword, the element and an optional alias. */
const keywordDeclaration = new RegExp(
  String.raw`^\s*((?:abstract\s+)?(?:${declaringKeywords.join('|')}))\s+(${tokenText})(?:\s+as\s+(${tokenText}))?`,
  'iu',
);

/** noteDeclaration matches a note with an alias, which links can connect: `note "Text" as N1`, `note as N2`. */
const noteDeclaration = new RegExp(String.raw`^\s*([rh]?note)\s+(?:"[^"]*"\s+)?as\s+(${nameText})`, 'iu');

/** linkStatement matches a link with its two elements and optional quoted labels at the ends of the arrow. */
const linkStatement = new RegExp(
  String.raw`^\s*(${tokenText})\s*(?:"[^"]*"\s*)?${arrowText}\s*(?:"[^"]*"\s*)?(${tokenText})`,
  'u',
);

/** shapeDeclaration matches a component, use case, actor or task at the start of a line, with an optional alias. */
const shapeDeclaration = new RegExp(String.raw`^\s*(\[[^\]]+\]|\([^)]+\)|:[^:\s][^:]*:)(?:\s+as\s+(${tokenText}))?(?=\s|$)`, 'u');

/** aliasDeclaration matches a quoted name with an alias at the start of a line: `"Web server" as Web`. */
const aliasDeclaration = new RegExp(String.raw`^\s*("[^"]+")\s+as\s+(${nameText})`, 'u');

/** procedureDeclaration matches the declaration of a procedure or a function of the preprocessor. */
const procedureDeclaration = new RegExp(String.raw`^\s*!((?:unquoted\s+)?(?:procedure|function))\s+(${nameText})`, 'iu');

/** variableDeclaration matches the assignment of a variable of the preprocessor: `!$color = "red"`. */
const variableDeclaration = new RegExp(String.raw`^\s*!(?:(?:local|global)\s+)?(\$${nameText})\s*\??=`, 'u');

/** defineDeclaration matches a macro of the preprocessor: `!define LIGHT` or `!define BOX(name)`. */
const defineDeclaration = new RegExp(String.raw`^\s*!(define(?:long)?)\s+(${nameText})(\()?`, 'u');

/** labelled matches the text before a label of a link, for example `Alice -> Bob : `; the label is free text. */
const labelled = new RegExp(
  String.raw`^\s*(?:${tokenText})\s*(?:"[^"]*"\s*)?${arrowText}\s*(?:"[^"]*"\s*)?(?:${tokenText})?[^:]*:`,
  'u',
);

/** afterDeclaringKeyword matches the text before the name of a new declaration, for example `class `. */
const afterDeclaringKeyword = new RegExp(String.raw`^\s*(?:abstract\s+)?(?:${declaringKeywords.join('|')})\s+$`, 'iu');

/**
 * isPlain tells whether an element is a plain name, not a quoted name, a component, a use case or an actor.
 * @param token - The element.
 */
const isPlain = (token: string): boolean => /^[\p{L}\p{N}_$]/u.test(token);

/**
 * reference returns the name by which other lines refer to a declared element: the plain name among the element
 * and its alias, the alias when both are plain, and else the alias or the element.
 * @param token - The element.
 * @param alias - The alias, if the declaration has one.
 */
function reference(token: string, alias: string | undefined): string {
  if (alias === undefined) {
    return token;
  }
  return isPlain(alias) || !isPlain(token) ? alias : token;
}

/**
 * declarationsOf returns the names that one statement declares.
 * @param line - The statement.
 */
function declarationsOf(line: string): Proposal[] {
  let match = procedureDeclaration.exec(line);
  if (match) {
    return [{ label: match[2], kind: 'Function', detail: `!${match[1].replace(/\s+/g, ' ').toLowerCase()}` }];
  }
  if ((match = variableDeclaration.exec(line))) {
    return [{ label: match[1], kind: 'Variable', detail: '!$variable' }];
  }
  if ((match = defineDeclaration.exec(line))) {
    return [{ label: match[2], kind: match[3] ? 'Function' : 'Constant', detail: `!${match[1]}` }];
  }
  if ((match = noteDeclaration.exec(line))) {
    return [{ label: match[2], kind: 'Variable', detail: match[1].toLowerCase() }];
  }
  if ((match = keywordDeclaration.exec(line))) {
    const keyword = match[1].replace(/\s+/g, ' ').toLowerCase();
    const kind = kinds[keyword.split(' ').at(-1) ?? ''] ?? 'Variable';
    return [{ label: reference(match[2], match[3]), kind, detail: keyword }];
  }
  if ((match = linkStatement.exec(line))) {
    return [match[1], match[2]].map((label) => ({ label, kind: 'Variable' }));
  }
  if ((match = shapeDeclaration.exec(line)) || (match = aliasDeclaration.exec(line))) {
    return [{ label: reference(match[1], match[2]), kind: 'Variable' }];
  }
  return [];
}

/**
 * declarations returns the names that the statements of a PlantUML text declare, each name once. A name that a
 * keyword declares keeps the kind and the detail of that declaration, also when a link uses it earlier.
 * @param lines - The lines of the text.
 * @param skip - The index of a line that declares nothing, usually the line of the cursor.
 */
export function declarations(lines: readonly string[], skip = -1): Proposal[] {
  const names = new Map<string, Proposal>();
  const lineKind = lineKinds(lines);
  lines.forEach((line, index) => {
    if (index === skip || lineKind[index] !== 'statement') {
      return;
    }
    for (const proposal of declarationsOf(line)) {
      const known = names.get(proposal.label);
      if (!known || (!known.detail && proposal.detail)) {
        names.set(proposal.label, proposal);
      }
    }
  });
  return [...names.values()];
}

/**
 * keywordProposals returns proposals for keywords.
 * @param words - The keywords.
 * @param prefix - The text before each keyword, for example `!`.
 */
const keywordProposals = (words: readonly string[], prefix = ''): Proposal[] =>
  [...new Set(words)].map((word) => ({ label: `${prefix}${word}`, kind: 'Keyword' }));

/**
 * wordRange returns the columns of the word at the cursor. A word is a name, with a leading `@` or `!`. A quoted
 * name, a component or a use case that is still open before the cursor counts from its opening character, and
 * its closing character right after the word counts too, because the editor inserts it with the opening one.
 * @param text - The line of the cursor.
 * @param character - The column of the cursor.
 */
function wordRange(text: string, character: number): { start: number; end: number } {
  const before = text.slice(0, character);
  let start = /[@!]?(?:[\p{L}\p{N}_$]+(?:\.|::))*[\p{L}\p{N}_$]*$/u.exec(before)?.index ?? character;
  const openings: Record<string, string> = { '"': '"', '[': ']', '(': ')' };
  let closing: string | undefined;
  const quote = before.lastIndexOf('"');
  const bracket = before.lastIndexOf('[') > before.lastIndexOf(']') ? before.lastIndexOf('[') : -1;
  const parenthesis = before.lastIndexOf('(') > before.lastIndexOf(')') ? before.lastIndexOf('(') : -1;
  const open = Math.max((before.split('"').length - 1) % 2 === 1 ? quote : -1, bracket, parenthesis);
  if (open >= 0) {
    start = open;
    closing = openings[before[open]];
  }
  let end = character + (/^(?:[\p{L}\p{N}_$]|(?:\.|::)(?=[\p{L}\p{N}_$]))*/u.exec(text.slice(character))?.[0].length ?? 0);
  if (closing !== undefined && text[end] === closing) {
    end++;
  }
  return { start, end };
}

/**
 * completeWord tells whether a typed word is complete: one proposal is the word itself, ignoring case, and no other
 * proposal continues it. VS Code would else show the word as the only proposal, and Enter would accept the
 * proposal instead of starting a new line, for example after `@startuml`.
 * @param word - The typed part of the word at the cursor.
 * @param proposals - The proposals for the word.
 */
function completeWord(word: string, proposals: readonly Proposal[]): boolean {
  const typed = word.toLowerCase();
  const labels = proposals.map((proposal) => proposal.label.toLowerCase());
  return typed !== '' && labels.includes(typed) && !labels.some((label) => label !== typed && label.startsWith(typed));
}

/**
 * complete returns the proposals at a position of a PlantUML text.
 *
 * At the start of a line, it proposes `@start…` and `@end…` after `@`, the directives of the preprocessor after
 * `!`, and else the keywords that start a statement and the declared names. Later in a line, it proposes the
 * declared names and the keywords that connect the parts of a statement. In the member of a class, it proposes
 * the declared names only, for example as the type of an attribute. It proposes nothing in a comment, in a style,
 * in free text, in the label of a link, in an action of an activity diagram, in a `skinparam` line, in the path
 * of an `!include`, and for the name of a new declaration. It proposes nothing for a complete word.
 * @param lines - The lines of the text: a `.puml` file, or the lines of a PlantUML block of a Markdown file.
 * @param line - The index of the line of the cursor.
 * @param character - The column of the cursor.
 */
export function complete(lines: readonly string[], line: number, character: number): Completion {
  const text = lines[line] ?? '';
  const { start, end } = wordRange(text, character);
  const word = text.slice(start, character);
  const lead = text.slice(0, start);
  const result = (proposals: Proposal[]): Completion => ({ start, end, proposals: completeWord(word, proposals) ? [] : proposals });
  const kind = lineKinds(lines)[line];
  if (kind === 'member') {
    return result(declarations(lines, line));
  }
  if (kind !== 'statement') {
    return result([]);
  }
  const names = () => declarations(lines, line);
  if (/^\s*$/.test(lead)) {
    if (word.startsWith('@')) {
      return result(diagramTypes.flatMap((type) => keywordProposals([`start${type}`, `end${type}`], '@')));
    }
    if (word.startsWith('!')) {
      return result(keywordProposals(preprocessorKeywords, '!'));
    }
    if (/^["[(]/.test(word)) {
      return result(names());
    }
    return result([...keywordProposals([...elementKeywords, ...controlKeywords, ...documentKeywords]), ...names()]);
  }
  if (/^\s*abstract\s+$/i.test(lead)) {
    return result(keywordProposals(['class']));
  }
  if (
    /^\s*!(?:include\w*|import|theme)\b/i.test(lead) ||
    /^\s*skinparam\b/i.test(lead) ||
    /^\s*:[^:]*$/.test(lead) ||
    afterDeclaringKeyword.test(lead) ||
    labelled.test(lead)
  ) {
    return result([]);
  }
  return result([...names(), ...keywordProposals(linkKeywords)]);
}
