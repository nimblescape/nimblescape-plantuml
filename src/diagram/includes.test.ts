// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the expansion of the included files of a diagram (R-GEN-008) against the rules of the
 * preprocessor of PlantUML: the include lines and their paths, the selected diagram or part of a file, the comments,
 * the lines that the engine handles, the places of the lines for the messages of errors, the problems that keep an
 * include line, and the limits.
 */

import { describe, expect, test } from 'vitest';
import { expandIncludes, IncludedFile, joinPath, maxDepth, maxLines, mayInclude } from './includes';

/**
 * expand expands a diagram text with files of a record, and records the paths that it reads.
 * @param text - The diagram text.
 * @param files - The text of each file by its path; a missing path reads as a file whose text is not read yet.
 */
function expand(text: string, files: Readonly<Record<string, string | IncludedFile>> = {}) {
  const reads: string[] = [];
  const expansion = expandIncludes(text, (path) => {
    reads.push(path);
    const file = files[path];
    return typeof file === 'string' ? { text: file } : file;
  });
  return { ...expansion, text: expansion.lines.join('\n'), reads };
}

describe('expandIncludes', () => {
  test('keeps a text without include lines as it is, each line from itself', () => {
    const { lines, origins, problems, pending, reads } = expand('@startuml\nA -> B\n@enduml\n');
    expect(lines).toEqual(['@startuml', 'A -> B', '@enduml']);
    expect(origins).toEqual([{ line: 0 }, { line: 1 }, { line: 2 }]);
    expect([problems.size, pending, reads]).toEqual([0, [], []]);
  });

  test('puts the lines of a file without a diagram in place of its include line', () => {
    const { text, origins } = expand('@startuml\n!include styles.puml\nA -> B\n@enduml', { 'styles.puml': 'skinparam a 1\r\nskinparam b 2\n' });
    expect(text).toBe('@startuml\nskinparam a 1\nskinparam b 2\nA -> B\n@enduml');
    expect(origins).toEqual([
      { line: 0 },
      { line: 1, file: 'styles.puml', fileLine: 0 },
      { line: 1, file: 'styles.puml', fileLine: 1 },
      { line: 2 },
      { line: 3 },
    ]);
  });

  test('includes the first diagram of a file without its @start and @end lines, and skips a YAML header', () => {
    const file = 'text before\n@startuml\n---\ntitle: header\n---\nclass A\n@enduml\n@startuml\nclass B\n@enduml';
    const { text, origins } = expand('!include parts.puml', { 'parts.puml': file });
    expect(text).toBe('class A');
    expect(origins).toEqual([{ line: 0, file: 'parts.puml', fileLine: 5 }]);
  });

  test('selects a diagram of a file by its number or by the name in its id', () => {
    const file = '@startuml\nclass A\n@enduml\n@startuml(id=SECOND)\nclass B\n@enduml\n\\startuml\nclass C\n@enduml';
    const files = { 'parts.puml': file };
    expect(expand('!include parts.puml!0', files).text).toBe('class A');
    expect(expand('!include parts.puml!2', files).text).toBe('class C');
    expect(expand('!include parts.puml!SECOND', files).text).toBe('class B');
    const missing = expand('!include parts.puml!3\n!include parts.puml!THIRD', files);
    expect(missing.text).toBe('!include parts.puml!3\n!include parts.puml!THIRD');
    expect([...missing.problems]).toEqual([
      [0, 'The file parts.puml has no diagram with the number 3. The first diagram has the number 0.'],
      [1, 'The file parts.puml has no diagram with id=THIRD.'],
    ]);
  });

  test('includes a file at each include line, with each of the include lines of a file', () => {
    const lines = ['!include a.puml', '!include_many a.puml', '!include_once a.puml', '!includeurl a.puml', '  !include   a.puml  '];
    expect(expand(lines.join('\n'), { 'a.puml': 'A' }).lines).toEqual(['A', 'A', 'A', 'A', 'A']);
  });

  test('reads the paths of included files relative to the file of the include line', () => {
    const files = {
      'lib/a.puml': '!include b.puml\n!include ../c.puml\n!include sub\\d.puml',
      'lib/b.puml': 'B',
      'c.puml': 'C',
      'lib/sub/d.puml': 'D',
    };
    const { text, origins, reads } = expand('first\n!include ./lib/a.puml', files);
    expect(text).toBe('first\nB\nC\nD');
    expect(reads).toEqual(['lib/a.puml', 'lib/b.puml', 'c.puml', 'lib/sub/d.puml']);
    expect(origins.slice(1)).toEqual([
      { line: 1, file: 'lib/b.puml', fileLine: 0 },
      { line: 1, file: 'c.puml', fileLine: 0 },
      { line: 1, file: 'lib/sub/d.puml', fileLine: 0 },
    ]);
  });

  test('includes the lines of each part of a file with !includesub, and the parts of other names not', () => {
    const file = 'A\n!startsub PART\nB\n!endsub\nC\n!startsub OTHER\nD\n!endsub\n!startsub PART\nE\n!endsub';
    const { text, origins } = expand('!includesub parts.puml!PART', { 'parts.puml': file });
    expect(text).toBe('B\nE');
    expect(origins).toEqual([
      { line: 0, file: 'parts.puml', fileLine: 2 },
      { line: 0, file: 'parts.puml', fileLine: 9 },
    ]);
  });

  test('keeps a line !includesub of a missing part as a line !include, on which the engine fails', () => {
    const { lines, problems } = expand('  !includesub parts.puml!MISSING', { 'parts.puml': '!startsub PART\nB\n!endsub' });
    expect(lines).toEqual(['  !include parts.puml!MISSING']);
    expect([...problems]).toEqual([[0, 'The file parts.puml has no lines between !startsub MISSING and !endsub.']]);
  });

  test('includes nothing from an include line in a comment, and reads a line with a comment at its end', () => {
    const text = ["' !include a.puml", "/' !include a.puml '/", "/'", '!include a.puml', "end '/", "!include b.puml /' note '/"].join('\n');
    const result = expand(text, { 'a.puml': 'A', 'b.puml': 'B' });
    expect(result.lines).toEqual([...text.split('\n').slice(0, 5), 'B']);
    expect(result.reads).toEqual(['b.puml']);
  });

  test('leaves the libraries, the parts of the same text and the other directives to the engine', () => {
    const text = ['!include <C4/C4_Container>', '!includesub PART', '!includedef X', '!include_manyfoo', '!include', '!theme cerulean'].join('\n');
    const result = expand(text);
    expect(result.text).toBe(text);
    expect([result.reads, result.problems.size]).toEqual([[], 0]);
  });

  test('keeps an include line of an address or of a path with a variable, with its problem', () => {
    const { text, problems, reads } = expand('!include https://example.com/a.puml\n!includeurl http://x/b.puml\n!include $folder/c.puml\n!include %dirpath()/d.puml');
    expect(text).toBe('!include https://example.com/a.puml\n!includeurl http://x/b.puml\n!include $folder/c.puml\n!include %dirpath()/d.puml');
    expect(reads).toEqual([]);
    expect([...problems]).toEqual([
      [0, 'The extension reads included files by their path only. It does not read the address https://example.com/a.puml.'],
      [1, 'The extension reads included files by their path only. It does not read the address http://x/b.puml.'],
      [2, 'The extension cannot read an included file whose path contains a variable or a function ($ or %).'],
      [3, 'The extension cannot read an included file whose path contains a variable or a function ($ or %).'],
    ]);
  });

  test('keeps an include line with the problem of its file, and names it by the index in the expanded text', () => {
    const { lines, problems } = expand('!include a.puml\n!include missing.puml', { 'a.puml': 'A1\nA2', 'missing.puml': { problem: 'The file missing.puml does not exist.' } });
    expect(lines).toEqual(['A1', 'A2', '!include missing.puml']);
    expect([...problems]).toEqual([[2, 'The file missing.puml does not exist.']]);
  });

  test('names each file whose text is not read yet once, and keeps its include lines', () => {
    const { lines, pending } = expand('!include a.puml\n!include a.puml\n!include lib/b.puml');
    expect(lines).toEqual(['!include a.puml', '!include a.puml', '!include lib/b.puml']);
    expect(pending).toEqual(['a.puml', 'lib/b.puml']);
  });

  test('keeps the include line of a file that includes itself, at its place in the file', () => {
    const { lines, origins, problems } = expand('!include a.puml', { 'a.puml': 'A\n!include b.puml', 'b.puml': '!include a.puml' });
    expect(lines).toEqual(['A', '!include a.puml']);
    expect(origins[1]).toEqual({ line: 0, file: 'b.puml', fileLine: 0 });
    expect([...problems]).toEqual([[1, 'The file a.puml includes itself, directly or through other files.']]);
  });

  test('stops at a chain of included files deeper than the limit', () => {
    const files = Object.fromEntries(Array.from({ length: maxDepth + 5 }, (_, index) => [`f${index}.puml`, `!include f${index + 1}.puml`]));
    const { problems, reads } = expand('!include f0.puml', files);
    expect(reads).toHaveLength(maxDepth);
    expect([...problems.values()]).toEqual([`The included files include further files more than ${maxDepth} levels deep.`]);
  });

  test('stops at an expanded text longer than the limit', () => {
    const big = Array.from({ length: maxLines / 2 + 1 }, (_, index) => `line ${index}`).join('\n');
    const { lines, problems } = expand('!include big.puml\n!include big.puml', { 'big.puml': big });
    expect(lines).toHaveLength(maxLines / 2 + 2);
    expect([...problems]).toEqual([[maxLines / 2 + 1, 'The included files have more than 100,000 lines.']]);
  });

  test('reads a file with a byte order mark, an empty file, and a file that ends with an empty line', () => {
    expect(expand('!include a.puml', { 'a.puml': '\uFEFFA\n' }).lines).toEqual(['A']);
    expect(expand('x\n!include a.puml\ny', { 'a.puml': '' }).lines).toEqual(['x', 'y']);
    expect(expand('!include a.puml', { 'a.puml': 'A\n\n' }).lines).toEqual(['A', '']);
  });
});

describe('joinPath', () => {
  test.each([
    ['', 'a.puml', 'a.puml'],
    ['', './lib/../a.puml', 'a.puml'],
    ['lib/', '../../a.puml', '../a.puml'],
    ['../shared/', 'a.puml', '../shared/a.puml'],
    ['lib/', '/home/user/a.puml', '/home/user/a.puml'],
    ['/home/user/', '../../../a.puml', '/a.puml'],
    ['', 'C:\\styles\\..\\a.puml', 'C:/a.puml'],
    ['C:/styles/', 'b\\c.puml', 'C:/styles/b/c.puml'],
  ])('joins the folder %j and the path %j', (folder, location, path) => {
    expect(joinPath(folder, location)).toBe(path);
  });
});

test('mayInclude finds a text with an include line', () => {
  expect([mayInclude('A -> B'), mayInclude('A\n  !include a.puml'), mayInclude('!includesub a.puml!B')]).toEqual([false, true, true]);
});
