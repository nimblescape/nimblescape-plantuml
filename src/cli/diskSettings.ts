// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The settings of the extension, read from the disk for a program without
 * VS Code ([R-NPM-001](../../docs/requirements.md#r-npm-001)): the file
 * `.vscode/settings.json` of a folder holds the settings of the workspace
 * folder, as VS Code reads them. VS Code reads the file as JSON with comments
 * (`//` and `/* … *\/`) and with commas after the last element of an object or
 * an array, so the reader accepts both.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { defaultSettings, type Settings, settingsOf } from '../settings';

/**
 * scanJson goes through a JSON text, copies its strings without a change, and passes every other character to a
 * function, which returns the text for it and how many characters it uses.
 * @param text - The text.
 * @param other - Returns the text for the character at an index and the number of characters that it replaces.
 */
function scanJson(text: string, other: (at: number) => { out: string; length: number }): string {
  let result = '';
  let at = 0;
  while (at < text.length) {
    if (text[at] === '"') {
      let end = at + 1;
      while (end < text.length && text[end] !== '"') {
        end += text[end] === '\\' ? 2 : 1;
      }
      result += text.slice(at, end + 1);
      at = end + 1;
    } else {
      const { out, length } = other(at);
      result += out;
      at += length;
    }
  }
  return result;
}

/**
 * parseJsonWithComments parses JSON with comments and with commas after the last element of an object or an array, as
 * VS Code reads its settings files.
 * @param text - The text.
 * @throws When the text is no JSON without the comments and these commas.
 */
export function parseJsonWithComments(text: string): unknown {
  const source = text.replace(/^﻿/, '');
  // A comment becomes a space or the end of its line, so that it still separates what stands around it.
  const withoutComments = scanJson(source, (at) => {
    if (source.startsWith('//', at)) {
      const end = source.indexOf('\n', at);
      return { out: '', length: (end < 0 ? source.length : end) - at };
    }
    if (source.startsWith('/*', at)) {
      const end = source.indexOf('*/', at + 2);
      return { out: ' ', length: (end < 0 ? source.length : end + 2) - at };
    }
    return { out: source[at], length: 1 };
  });
  const closing = /\s*[}\]]/y;
  const withoutCommas = scanJson(withoutComments, (at) => {
    closing.lastIndex = at + 1;
    return { out: withoutComments[at] === ',' && closing.test(withoutComments) ? '' : withoutComments[at], length: 1 };
  });
  return JSON.parse(withoutCommas);
}

/**
 * readSettings reads the settings of the extension from the file `.vscode/settings.json` of a folder, as VS Code reads
 * the settings of a workspace folder. A missing file or a file that is no JSON object gives the default settings, and
 * a missing or invalid value its default.
 * @param folder - The path of the folder, for example the top folder of a repository.
 */
export function readSettings(folder: string): Settings {
  let text: string;
  try {
    text = fs.readFileSync(path.join(folder, '.vscode', 'settings.json'), 'utf8');
  } catch {
    return { ...defaultSettings };
  }
  try {
    return settingsOf(parseJsonWithComments(text));
  } catch {
    return { ...defaultSettings };
  }
}
