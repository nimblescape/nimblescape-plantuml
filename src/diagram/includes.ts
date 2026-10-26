// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The included files of a diagram ([R-GEN-008](../../docs/requirements.md#r-gen-008)). The engine of the previews
 * cannot read files, so the extension reads them, and the previews put the text of each included file into the copy
 * of the diagram text that the engine renders, in place of the include line. The module follows the preprocessor of
 * PlantUML 1.2026.9 (the classes `TContext`, `EaterInclude`, `DiagramExtractor` and `Sub` of PlantUML):
 *
 * - The lines `!include`, `!include_many`, `!include_once` and `!includeurl` with the path of a file include the
 *   first diagram of the file without its `@start` and `@end` lines, or the whole file when it has no `@start` line.
 *   After the path, `!` and a number select another diagram, where `!0` is the first one, and `!` and a name select
 *   the diagram whose `@start` line contains `id=` and the name, for example `@startuml(id=STYLES)`. PlantUML 1.2026.9
 *   includes a file at each include line, with each of the four lines.
 * - The line `!includesub` with a path, `!` and a name includes the lines between `!startsub` and `!endsub` with that
 *   name in the file.
 * - A path is relative to the folder of the file of the include line: the document, or an included file, which can
 *   include further files.
 * - An include line in a comment includes nothing. An included text that starts with a line `---` starts with a YAML
 *   header up to the next line `---`, which PlantUML skips.
 *
 * The module leaves the lines that include a file of the standard library of PlantUML (`!include <C4/C4_Container>`)
 * to the engine. It keeps each include line that it cannot resolve: a file that does not exist, an address of the
 * internet, a path with a variable. The engine reports an error at such a line, and the previews then show the
 * problem that the module names for the line instead of the message of the engine.
 *
 * The module uses no API of VS Code and no page. The extension uses it to find the files that the diagrams of a
 * text include, and the scripts of the previews use it to expand each diagram with the files that the extension
 * sends.
 */

/** IncludedFile is a file that an include line names: its text, or the problem that keeps the extension from reading it. */
export type IncludedFile = { text: string } | { problem: string };

/**
 * IncludedFiles maps the path of each file that the diagrams of a text include to the file. A path is relative to the
 * folder of the document, with `/` between its parts, or absolute.
 */
export type IncludedFiles = Readonly<Record<string, IncludedFile>>;

/** Origin is the place of a line of an expanded diagram text. */
export interface Origin {
  /** line is the index of the line of the diagram text: the line itself, or the include line that brought it. */
  line: number;
  /** file is the path of the included file of a line from an included file. */
  file?: string;
  /** fileLine is the index of the line in that file. */
  fileLine?: number;
}

/** Expansion is a diagram text with the texts of its included files. */
export interface Expansion {
  /** lines are the lines of the expanded text. */
  lines: string[];
  /** origins holds the place of each line of the expanded text. */
  origins: Origin[];
  /** problems maps the index of each include line that stays in the expanded text to the problem that kept it. */
  problems: Map<number, string>;
  /** pending holds the paths of the included files whose text is not read yet. */
  pending: string[];
}

/** maxDepth is the largest number of files in a chain of files that include each other. */
export const maxDepth = 32;

/** maxLines is the largest number of lines of an expanded text. */
export const maxLines = 100_000;

/**
 * includeLine matches a line that includes something, with its directive and the rest of the line. As in PlantUML, a
 * word character after the directive makes the line no include line, for example in `!includedef`.
 */
const includeLine = /^\s*!(include(?:url|_many|_once)?|includesub)\b(.*)$/;

/** address matches a location that is an address with a scheme, for example `https://…`, not a path. */
const address = /^[a-z][a-z\d+.-]*:\/\//i;

/** startDirective matches a line that starts a diagram for the preprocessor: `@start` or `\start` and one more character. */
const startDirective = /^\s*[@\\]start./;

/** endDirective matches a line that ends a diagram for the preprocessor. */
const endDirective = /^\s*[@\\]end/;

/** hasIncludeLine matches a text with a line that may include something, so that a text without one costs no work. */
const hasIncludeLine = /^\s*!include/m;

/**
 * mayInclude tells whether a text has a line that may include a file.
 * @param text - The text.
 */
export const mayInclude = (text: string): boolean => hasIncludeLine.test(text);

/**
 * withoutInnerComment removes a comment `/' … '/` at the start or at the end of a line, as PlantUML does before it
 * reads the line.
 * @param line - The line.
 */
function withoutInnerComment(line: string): string {
  const trimmed = line.trim();
  if (trimmed.startsWith(`/'`)) {
    const end = line.indexOf(`'/`);
    if (end >= 0) {
      return line.slice(end + 2);
    }
  }
  if (trimmed.endsWith(`'/`)) {
    const start = line.lastIndexOf(`/'`);
    if (start >= 0) {
      return line.slice(0, start);
    }
  }
  return line;
}

/**
 * Target is what an include line includes: a file, with the diagram (`select`) or the part (`sub`) of the file, or a
 * problem that keeps the extension from reading it.
 */
type Target = { path: string; select?: string; sub?: string } | { problem: string };

/**
 * targetOf returns what a line includes, or undefined for a line that includes no file, which the engine handles: a
 * line that is no include line or has no path, a file of the standard library (`<…>`), and a part of the same text
 * (`!includesub` with a name only).
 * @param line - The line.
 */
function targetOf(line: string): Target | undefined {
  const match = includeLine.exec(withoutInnerComment(line));
  const location = match?.[2].trim() ?? '';
  if (!match || location === '' || location.startsWith('<') || location.startsWith('[')) {
    return undefined;
  }
  if (address.test(location)) {
    return { problem: `The extension reads included files by their path only. It does not read the address ${location}.` };
  }
  if (/[$%]/.test(location)) {
    return { problem: 'The extension cannot read an included file whose path contains a variable or a function ($ or %).' };
  }
  // `!includesub` names the file before the first `!`, the other include lines before the last `!`.
  const separator = match[1] === 'includesub' ? location.indexOf('!') : location.lastIndexOf('!');
  const path = separator < 0 ? location : location.slice(0, separator);
  if (path === '' || (match[1] === 'includesub' && separator < 0)) {
    return undefined;
  }
  const rest = separator < 0 ? undefined : location.slice(separator + 1);
  return match[1] === 'includesub' ? { path, sub: rest } : { path, select: rest };
}

/** absolutePath matches the start of an absolute path: `/`, or a drive letter. */
const absolutePath = /^(?:\/|[A-Za-z]:)/;

/**
 * joinPath returns the path of a file that a location names, relative to a folder: with `/` between its parts, and
 * without the parts `.` and `..`. A location that starts with `/` or with a drive letter is absolute.
 * @param folder - The path of the folder, with a final `/`, or an empty text for the folder of the document.
 * @param location - The path in the include line; `\` separates its parts as `/` does.
 */
export function joinPath(folder: string, location: string): string {
  const slashed = location.replace(/\\/g, '/');
  const whole = absolutePath.test(slashed) ? slashed : folder + slashed;
  const root = /^(?:[A-Za-z]:)?\/?/.exec(whole)![0];
  const parts: string[] = [];
  for (const part of whole.slice(root.length).split('/')) {
    if (part === '..' && parts.length > 0 && parts.at(-1) !== '..') {
      parts.pop();
    } else if (part === '..' ? root === '' : part !== '' && part !== '.') {
      // A relative path keeps the parts `..` that leave the folder of the document; an absolute path stays in its root.
      parts.push(part);
    }
  }
  return root + parts.join('/');
}

/**
 * folderOf returns the folder of the file of a path, with a final `/`, or an empty text for a file in the folder of
 * the document.
 * @param path - The path of the file.
 */
const folderOf = (path: string): string => path.slice(0, path.lastIndexOf('/') + 1);

/**
 * fileLines returns the lines of the text of a file, as PlantUML reads them: without a byte order mark, and without
 * an empty line after the last line break.
 * @param text - The text of the file.
 */
function fileLines(text: string): string[] {
  const content = text.replace(/^\uFEFF/, '');
  return content === '' ? [] : content.replace(/(?:\r\n|\r|\n)$/, '').split(/\r\n|\r|\n/);
}

/**
 * escapeRegExp escapes the characters of a text that have a meaning in a regular expression.
 * @param text - The text.
 */
const escapeRegExp = (text: string): string => text.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');

/**
 * selectedLines returns the indices of the lines of a file that `!include` includes: the lines between the `@start`
 * line of the selected diagram and the next `@end` line, or every line of a file without a `@start` line, without a
 * YAML header. It returns the problem of a selected diagram that the file does not have.
 * @param lines - The lines of the file.
 * @param path - The path of the file, for the problem.
 * @param select - The text after the last `!` of the include line: the number of a diagram, or the name in its id.
 */
function selectedLines(lines: readonly string[], path: string, select: string | undefined): number[] | string {
  const starts = lines.flatMap((line, index) => (startDirective.test(line) ? [index] : []));
  let indices = lines.map((_, index) => index);
  if (starts.length > 0) {
    let start: number | undefined = starts[0];
    if (select !== undefined && select !== '') {
      const id = new RegExp(`id=${escapeRegExp(select)}\\W`);
      start = /^\d+$/.test(select) ? starts[Number(select)] : starts.find((index) => id.test(lines[index]));
    }
    if (start === undefined) {
      return /^\d+$/.test(select ?? '')
        ? `The file ${path} has no diagram with the number ${select}. The first diagram has the number 0.`
        : `The file ${path} has no diagram with id=${select}.`;
    }
    const first = start + 1;
    const end = lines.findIndex((line, index) => index >= first && endDirective.test(line));
    indices = indices.slice(first, end < 0 ? lines.length : end);
  }
  // The YAML header ends at the next line `---`; without that line, the whole text is the header.
  if (indices.length > 0 && lines[indices[0]] === '---') {
    const end = indices.findIndex((index, position) => position > 0 && lines[index] === '---');
    return end < 0 ? [] : indices.slice(end + 1);
  }
  return indices;
}

/**
 * subLines returns the indices of the lines of a file that `!includesub` includes: the lines between each line
 * `!startsub` with the name and the next line `!endsub`. It returns the problem of a file without such a part.
 * @param lines - The lines of the file.
 * @param path - The path of the file, for the problem.
 * @param name - The name of the part.
 */
function subLines(lines: readonly string[], path: string, name: string): number[] | string {
  let found = false;
  let inside = false;
  const indices: number[] = [];
  lines.forEach((line, index) => {
    const start = /^\s*!startsub\b(.*)$/.exec(line);
    if (start) {
      if (start[1].trim() === name) {
        found = true;
        inside = true;
      }
    } else if (inside && /^\s*!endsub\b/.test(line)) {
      inside = false;
    } else if (inside) {
      indices.push(index);
    }
  });
  return found ? indices : `The file ${path} has no lines between !startsub ${name} and !endsub.`;
}

/**
 * expandText writes the lines of a text into an expansion, each include line of a file replaced by the lines that it
 * includes, which the function expands in turn.
 * @param lines - The lines of the text.
 * @param originOf - Returns the place of a line of the text.
 * @param folder - The folder of the file of the text, with a final `/`, or an empty text for the document.
 * @param chain - The paths of the files that include the text, the last one first included.
 * @param read - Returns an included file, or undefined while its text is not read.
 * @param expansion - The expansion that receives the lines.
 */
function expandText(
  lines: readonly string[],
  originOf: (index: number) => Origin,
  folder: string,
  chain: readonly string[],
  read: (path: string) => IncludedFile | undefined,
  expansion: Expansion,
): void {
  let inComment = false;
  lines.forEach((line, index) => {
    const add = (text: string) => {
      expansion.lines.push(text);
      expansion.origins.push(originOf(index));
    };
    // As in PlantUML, a comment of several lines starts with `/'` and ends with the next line that ends with `'/`.
    if (inComment || (/^\s*\/'/.test(line) && !line.includes(`'/`))) {
      inComment = !(inComment && line.trim().endsWith(`'/`));
      add(line);
      return;
    }
    const target = targetOf(line);
    if (!target) {
      add(line);
      return;
    }
    /** keep keeps the include line with a problem. The engine ignores a line `!includesub`, but fails on `!include`. */
    const keep = (problem: string) => {
      expansion.problems.set(expansion.lines.length, problem);
      add(line.replace('!includesub', '!include'));
    };
    if ('problem' in target) {
      keep(target.problem);
      return;
    }
    const path = joinPath(folder, target.path);
    if (chain.includes(path)) {
      keep(`The file ${path} includes itself, directly or through other files.`);
      return;
    }
    if (chain.length >= maxDepth) {
      keep(`The included files include further files more than ${maxDepth} levels deep.`);
      return;
    }
    const file = read(path);
    if (!file) {
      if (!expansion.pending.includes(path)) {
        expansion.pending.push(path);
      }
      add(line);
      return;
    }
    if ('problem' in file) {
      keep(file.problem);
      return;
    }
    const text = fileLines(file.text);
    const selected = target.sub === undefined ? selectedLines(text, path, target.select) : subLines(text, path, target.sub);
    if (typeof selected === 'string') {
      keep(selected);
      return;
    }
    if (expansion.lines.length + selected.length > maxLines) {
      keep(`The included files have more than ${maxLines.toLocaleString('en-US')} lines.`);
      return;
    }
    const { line: includeLine } = originOf(index);
    expandText(
      selected.map((fileLine) => text[fileLine]),
      (position) => ({ line: includeLine, file: path, fileLine: selected[position] }),
      folderOf(path),
      [...chain, path],
      read,
      expansion,
    );
  });
}

/**
 * expandIncludes returns a diagram text with the texts of the files that it includes. The lines of the text split
 * as the function `diagramLines` of `src/diagram/diagramLines.ts` splits them, so that an index of a line of the
 * expanded text names the same line there.
 * @param text - The diagram text.
 * @param read - Returns an included file by its path, or undefined while its text is not read.
 */
export function expandIncludes(text: string, read: (path: string) => IncludedFile | undefined): Expansion {
  const lines = text.replace(/\r?\n$/, '').split(/\r\n|\r|\n/);
  const expansion: Expansion = { lines: [], origins: [], problems: new Map(), pending: [] };
  expandText(lines, (line) => ({ line }), '', [], read, expansion);
  return expansion;
}

/**
 * isIncludedFile tells whether a value is an included file.
 * @param value - The value.
 */
const isIncludedFile = (value: unknown): value is IncludedFile =>
  typeof value === 'object' &&
  value !== null &&
  (typeof (value as { text?: unknown }).text === 'string' || typeof (value as { problem?: unknown }).problem === 'string');

/**
 * parseIncludedFiles reads the included files that a preview receives from the extension as JSON text. It returns
 * undefined for no text or for a text that holds no included files.
 * @param text - The JSON text.
 */
export function parseIncludedFiles(text: string | null | undefined): IncludedFiles | undefined {
  try {
    const value: unknown = JSON.parse(text ?? '');
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).filter(([, file]) => isIncludedFile(file)));
    }
  } catch {
    // No included files.
  }
  return undefined;
}

/**
 * expandWith expands a diagram text in a preview with the included files that the extension sent. A file that is not
 * among them is not read yet. Without included files, as in a preview that the extension did not prepare, each
 * included file has a problem. It returns undefined for a text without include lines.
 * @param text - The diagram text.
 * @param files - The included files.
 */
export function expandWith(text: string, files: IncludedFiles | undefined): Expansion | undefined {
  if (!mayInclude(text)) {
    return undefined;
  }
  return expandIncludes(text, (path) => {
    if (!files) {
      return { problem: `The preview did not receive the included file ${path}.` };
    }
    return Object.hasOwn(files, path) ? files[path] : undefined;
  });
}
