// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The limits and the problems of the included files
 * ([R-GEN-008](../../docs/requirements.md#r-gen-008)), which the reader of
 * the extension (`src/includeFiles.ts`) and the reader of the files of the disk
 * of the npm package (`src/cli/diskIncludes.ts`) share, so that a diagram
 * shows the same message in the Markdown preview and on the page of another
 * program. The module uses no API of VS Code.
 */

/** maxFileSize is the size in bytes of the largest file that the extension includes. */
export const maxFileSize = 1024 * 1024;

/** includeProblems are the messages of the problems of an included file, by the path of its include line. */
export const includeProblems = {
  unsaved: (path: string): string => `The document is not saved in a folder, so the extension cannot find the included file ${path}.`,
  unknown: (path: string): string => `The extension cannot find the included file ${path}.`,
  outside: (path: string): string =>
    `The file ${path} is outside the workspace folders and the folder of the document. The extension reads included files only from these folders.`,
  linkOutside: (path: string): string =>
    `The file ${path} is a symbolic link to a file outside the workspace folders and the folder of the document. The extension reads included files only from these folders.`,
  folder: (path: string): string => `The included path ${path} is a folder, not a file.`,
  tooLarge: (path: string): string => `The file ${path} is larger than 1 MB, the largest file that the extension includes.`,
  missing: (path: string): string => `The file ${path} does not exist.`,
  unreadable: (path: string, message: string): string => `The extension cannot read the file ${path}: ${message}`,
};
