// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the reading of the included files from the disk for a
 * program without VS Code (R-GEN-008, R-NPM-001) in a temporary folder: the
 * paths relative to the folder of the document, the files that an included
 * file includes, the folders that the reader may read, symbolic links, and the
 * problems with the messages of the extension.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, expect, test } from 'vitest';
import { includeProblems } from '../diagram/includeProblems';
import { readIncludedFiles } from './diskIncludes';

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'plantuml-includes-')));
const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'plantuml-outside-')));

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

/**
 * write writes a file of the temporary folder.
 * @param file - The path of the file in the folder.
 * @param text - The text.
 */
function write(file: string, text: string): string {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
  return full;
}

test('reads the included files relative to the folder of the document, and the files that they include', () => {
  const document = write('paper/paper.md', '');
  write('paper/parts/actors.puml', '@startuml\n!include ../common.iuml\nactor A\n@enduml\n');
  write('paper/common.iuml', 'skinparam monochrome true\n');
  const files = readIncludedFiles(document, 'A -> B\n!include parts/actors.puml\n');
  expect(files).toEqual({
    'parts/actors.puml': { text: '@startuml\n!include ../common.iuml\nactor A\n@enduml\n' },
    'common.iuml': { text: 'skinparam monochrome true\n' },
  });
  expect(readIncludedFiles(document, 'A -> B\n')).toBeUndefined();
});

/** canLink tells whether the system lets the tests create a symbolic link; Windows needs the developer mode for it. */
const canLink = (() => {
  try {
    fs.symlinkSync(root, path.join(outside, 'probe'));
    return true;
  } catch {
    return false;
  }
})();

test.skipIf(!canLink)('reads files in the folder of the document and in the given folders only, also through symbolic links', () => {
  const document = write('paper/paper.md', '');
  write('shared/style.iuml', 'skinparam shadowing false\n');
  fs.writeFileSync(path.join(outside, 'secret.iuml'), 'secret\n');
  fs.symlinkSync(path.join(outside, 'secret.iuml'), path.join(root, 'paper', 'link.iuml'));
  const text = '!include ../shared/style.iuml\n!include link.iuml\nA -> B\n';
  expect(readIncludedFiles(document, text)).toEqual({
    '../shared/style.iuml': { problem: includeProblems.outside('../shared/style.iuml') },
    'link.iuml': { problem: includeProblems.linkOutside('link.iuml') },
  });
  expect(readIncludedFiles(document, text, [root, outside])).toEqual({
    '../shared/style.iuml': { text: 'skinparam shadowing false\n' },
    'link.iuml': { text: 'secret\n' },
  });
});

test('names a missing file, a folder and a file larger than 1 MB', () => {
  const document = write('paper/paper.md', '');
  fs.mkdirSync(path.join(root, 'paper', 'folder'), { recursive: true });
  write('paper/large.iuml', 'x'.repeat(1024 * 1024 + 1));
  expect(readIncludedFiles(document, '!include missing.iuml\n!include folder\n!include large.iuml\nA -> B\n')).toEqual({
    'missing.iuml': { problem: includeProblems.missing('missing.iuml') },
    folder: { problem: includeProblems.folder('folder') },
    'large.iuml': { problem: includeProblems.tooLarge('large.iuml') },
  });
});
