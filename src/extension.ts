// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The editor wiring of the extension. The manifest contributes the language
 * `plantuml`, its editing rules and the script and the styles of the Markdown
 * preview without code. Activation returns the markdown-it plugin, which the
 * Markdown extension of VS Code reads from the export `extendMarkdownIt` when
 * it builds its preview.
 */

import type * as vscode from 'vscode';
import { extendMarkdownIt } from './markdown/markdownIt';

/** Api is the export of the extension. */
export interface Api {
  /** extendMarkdownIt adds the rendering of PlantUML blocks to the markdown-it instance of the Markdown preview. */
  extendMarkdownIt: typeof extendMarkdownIt;
}

/**
 * activate starts the extension.
 * @param _context - The extension context, which holds the registrations to dispose on deactivation.
 * @returns The export of the extension, which the Markdown extension of VS Code reads.
 */
export function activate(_context: vscode.ExtensionContext): Api {
  return { extendMarkdownIt };
}

/** deactivate stops the extension. VS Code disposes the registrations of the context. */
export function deactivate(): void {}
