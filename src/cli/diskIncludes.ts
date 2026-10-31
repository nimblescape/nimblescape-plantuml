// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The files that the diagrams of a Markdown file include, read from the disk
 * for a program without VS Code, with the rules of the extension
 * ([R-GEN-008](../../docs/requirements.md#r-gen-008),
 * [R-NPM-001](../../docs/requirements.md#r-npm-001)): the path of an included
 * file is relative to the folder of the document; the reader reads only files
 * in the folder of the document and in the folders that the program names, as
 * the extension reads only files in the workspace folders, also as the target
 * of a symbolic link, up to 1 MB each. It reads the files at once, as the
 * extension does for the Markdown preview, and watches nothing.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { diagramsOf } from '../diagram/diagramRanges';
import { includeProblems, maxFileSize } from '../diagram/includeProblems';
import { expandIncludes, IncludedFile, IncludedFiles, mayInclude } from '../diagram/includes';

/**
 * pathKey returns a path for a comparison of paths: in small letters on Windows, whose file system ignores the case of
 * letters.
 * @param file - The path.
 */
const pathKey = (file: string): string => (process.platform === 'win32' ? file.toLowerCase() : file);

/**
 * isInFolder tells whether a path is in a folder.
 * @param file - The absolute path.
 * @param folder - The absolute path of the folder.
 */
function isInFolder(file: string, folder: string): boolean {
  const relative = path.relative(pathKey(folder), pathKey(file));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * realPath returns a path after its symbolic links, or the path itself when it does not exist.
 * @param file - The path.
 */
function realPath(file: string): string {
  try {
    return fs.realpathSync(file);
  } catch {
    return file;
  }
}

/**
 * readFile reads an included file.
 * @param document - The absolute path of the Markdown file.
 * @param location - The path of the include line, relative to the folder of the document or absolute.
 * @param folders - The folders in which the reader reads files besides the folder of the document.
 */
function readFile(document: string, location: string, folders: readonly string[]): IncludedFile {
  const folder = path.dirname(document);
  const file = path.resolve(folder, location);
  const roots = [folder, ...folders.map((root) => path.resolve(root))];
  if (!roots.some((root) => isInFolder(file, root))) {
    return { problem: includeProblems.outside(location) };
  }
  let real: string;
  try {
    real = fs.realpathSync(file);
  } catch (error) {
    const code = (error as { code?: unknown } | undefined)?.code;
    const missing = code === 'ENOENT' || code === 'ENOTDIR';
    return { problem: missing ? includeProblems.missing(location) : includeProblems.unreadable(location, (error as Error).message) };
  }
  // A path without a symbolic link is in its folder, which the check above found.
  if (pathKey(real) !== pathKey(file) && !roots.some((root) => isInFolder(real, realPath(root)))) {
    return { problem: includeProblems.linkOutside(location) };
  }
  try {
    const stat = fs.statSync(real);
    if (stat.isDirectory()) {
      return { problem: includeProblems.folder(location) };
    }
    if (stat.size > maxFileSize) {
      return { problem: includeProblems.tooLarge(location) };
    }
    return { text: fs.readFileSync(real, 'utf8') };
  } catch (error) {
    return { problem: includeProblems.unreadable(location, (error as Error).message) };
  }
}

/**
 * readIncludedFiles returns the files that the diagrams of the text of a PlantUML block include, read from the disk.
 * It returns undefined for a text whose diagrams include no file.
 * @param document - The path of the Markdown file of the block.
 * @param text - The text of the block.
 * @param folders - The folders in which the reader reads files besides the folder of the document, for example the
 *   folder of the repository; the extension reads files in its workspace folders.
 */
export function readIncludedFiles(document: string, text: string, folders: readonly string[] = []): IncludedFiles | undefined {
  if (!mayInclude(text)) {
    return undefined;
  }
  const absolute = path.resolve(document);
  const files = new Map<string, IncludedFile>();
  for (const diagram of diagramsOf(text)) {
    expandIncludes(diagram.text, (location) => {
      let file = files.get(location);
      if (!file) {
        file = readFile(absolute, location, folders);
        files.set(location, file);
      }
      return file;
    });
  }
  return files.size > 0 ? Object.fromEntries(files) : undefined;
}
