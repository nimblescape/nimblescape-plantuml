// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The lines and the PlantUML blocks of open documents, which the code
 * completion (`src/completionProvider.ts`) and the formatting
 * (`src/formattingProvider.ts`) share.
 */

import * as vscode from 'vscode';
import { Block, plantUmlBlocks } from './markdown/blocks';

/**
 * linesOf returns the lines of a document.
 * @param document - The document.
 */
export const linesOf = (document: vscode.TextDocument): string[] => document.getText().split(/\r\n|\r|\n/);

/** markdownBlocks holds the PlantUML blocks of each open Markdown document, for one version. */
const markdownBlocks = new WeakMap<vscode.TextDocument, { version: number; blocks: Block[] }>();

/**
 * blocksOf returns the PlantUML blocks of a Markdown document. The extension reads the blocks once for each version
 * of the document, because it looks for them after each typed letter.
 * @param document - The Markdown document.
 */
export function blocksOf(document: vscode.TextDocument): Block[] {
  let known = markdownBlocks.get(document);
  if (!known || known.version !== document.version) {
    known = { version: document.version, blocks: plantUmlBlocks(linesOf(document)) };
    markdownBlocks.set(document, known);
  }
  return known.blocks;
}

/**
 * blockAt returns the PlantUML block of a Markdown document that holds a line.
 * @param document - The Markdown document.
 * @param line - The index of the line.
 */
export const blockAt = (document: vscode.TextDocument, line: number): Block | undefined =>
  blocksOf(document).find(({ start, end }) => start <= line && line < end);
