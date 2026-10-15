// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The editor wiring of the extension. The manifest contributes the language
 * `plantuml`, its editing rules, the settings, and the script and the styles
 * of the Markdown preview without code. Activation returns the markdown-it
 * plugin, which the Markdown extension of VS Code reads from the export
 * `extendMarkdownIt` when it builds its preview, and refreshes the Markdown
 * previews when a setting of the extension changes.
 */

import type MarkdownIt from 'markdown-it';
import * as vscode from 'vscode';
import { extendMarkdownIt } from './markdown/markdownIt';
import { defaultSettings, preambleLines, Settings, settingsSection } from './settings';

/** Api is the export of the extension. */
export interface Api {
  /** extendMarkdownIt adds the rendering of PlantUML blocks to the markdown-it instance of the Markdown preview. */
  extendMarkdownIt(md: MarkdownIt): MarkdownIt;
}

/**
 * readSettings reads the settings of the extension that apply to a document.
 * @param document - The document, or undefined for the settings of the window.
 */
export function readSettings(document: vscode.Uri | undefined): Settings {
  const configuration = vscode.workspace.getConfiguration(settingsSection, document);
  return { visibilityIcons: configuration.get<boolean>('visibilityIcons', defaultSettings.visibilityIcons) };
}

/**
 * documentOf returns the document that the Markdown preview renders, from the environment of a rendering. The
 * preview names it in `currentDocument`; a rendering of a text without a document has none.
 * @param env - The environment of the rendering.
 */
function documentOf(env: unknown): vscode.Uri | undefined {
  const document = (env as { currentDocument?: unknown } | undefined)?.currentDocument;
  return typeof document === 'object' && document !== null && 'scheme' in document ? (document as vscode.Uri) : undefined;
}

/**
 * activate starts the extension.
 * @param context - The extension context, which holds the registrations to dispose on deactivation.
 * @returns The export of the extension, which the Markdown extension of VS Code reads.
 */
export function activate(context: vscode.ExtensionContext): Api {
  context.subscriptions.push(
    // The Markdown preview renders again only when its document or its own settings change.
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(settingsSection)) {
        void vscode.commands.executeCommand('markdown.preview.refresh');
      }
    }),
  );
  return { extendMarkdownIt: (md) => extendMarkdownIt(md, (env) => preambleLines(readSettings(documentOf(env)))) };
}

/** deactivate stops the extension. VS Code disposes the registrations of the context. */
export function deactivate(): void {}
