// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The editor wiring of the extension. The manifest contributes the language
 * `plantuml`, its editing rules, the grammars, the settings, and the script
 * and the styles of the Markdown preview without code. Activation returns the
 * markdown-it plugin, which the Markdown extension of VS Code reads from the
 * export `extendMarkdownIt` when it builds its preview, reads the files that
 * the diagrams include (`src/includeFiles.ts`), refreshes the previews when a
 * setting of the extension or an included file changes, registers the
 * previews of PlantUML files (`src/pumlPreviews.ts`), and registers the code
 * completion (`src/completionProvider.ts`) and the formatting
 * (`src/formattingProvider.ts`) for `.puml` files and for the PlantUML blocks
 * of Markdown files. Problems that no diagram shows go to the log channel
 * "nimblescape PlantUML" in the Output view.
 */

import type MarkdownIt from 'markdown-it';
import * as vscode from 'vscode';
import { registerCompletion } from './completionProvider';
import { registerFormatting } from './formattingProvider';
import { IncludeFiles, isInFolder } from './includeFiles';
import { extendMarkdownIt, Rendering } from './markdown/markdownIt';
import { Log, PumlPreviews } from './pumlPreviews';
import { defaultSettings, Settings, settingsSection } from './settings';

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
  const configuration = vscode.workspace.getConfiguration(settingsSection, settingsScope(document));
  return { umlNotation: configuration.get<boolean>('umlNotation', defaultSettings.umlNotation) };
}

/**
 * settingsScope returns the scope of the settings of a document. VS Code finds the workspace folder of a document by
 * its whole address, scheme included, so a version of a file in Git, whose address has the scheme `git`, has no
 * folder, and would get the settings of the window. Such a document gets the workspace folder of its path, so that
 * both sides of a diff render with the settings of the folder of the file.
 * @param document - The document, or undefined for the settings of the window.
 */
function settingsScope(document: vscode.Uri | undefined): vscode.ConfigurationScope | undefined {
  if (!document || vscode.workspace.getWorkspaceFolder(document)) {
    return document;
  }
  return vscode.workspace.workspaceFolders?.find((folder) => isInFolder(document, folder.uri)) ?? document;
}

/** foundDocuments holds the document of each rendering of a text without its document, by its environment. */
const foundDocuments = new WeakMap<object, vscode.Uri | undefined>();

/**
 * documentOf returns the document that the Markdown preview renders. The preview names it in the environment of the
 * rendering (`currentDocument`). The rendered diff renders a side with changes as a text with marks of the changes,
 * without its document; the open Markdown document with this text, without the marks, is then the document. A
 * rendering of another text has no document.
 * @param rendering - The rendering.
 */
function documentOf(rendering: Rendering): vscode.Uri | undefined {
  const { env } = rendering;
  const document = (env as { currentDocument?: unknown } | undefined)?.currentDocument;
  if (typeof document === 'object' && document !== null && 'scheme' in document) {
    return document as vscode.Uri;
  }
  if (typeof env !== 'object' || env === null) {
    return undefined;
  }
  // The plugin asks for the document of each block of a rendering, and the search runs once for the rendering.
  if (!foundDocuments.has(env)) {
    const text = rendering.markdown();
    const found =
      text === undefined
        ? undefined
        : vscode.workspace.textDocuments.find(
            (candidate) => candidate.languageId === 'markdown' && candidate.getText().replace(/\r\n?/g, '\n') === text,
          );
    foundDocuments.set(env, found?.uri);
  }
  return foundDocuments.get(env);
}

/** markdownExtension is the identifier of the Markdown extension of VS Code, which owns the Markdown preview. */
const markdownExtension = 'vscode.markdown-language-features';

/**
 * refreshMarkdownPreviews renders the Markdown previews again, so that they use a changed setting of the extension or
 * a changed included file. While the Markdown extension is not active, no Markdown preview is open, and the command
 * would only start that extension, so nothing happens then.
 * @param log - Receives a failed refresh.
 */
function refreshMarkdownPreviews(log: Log): void {
  if (vscode.extensions.getExtension(markdownExtension)?.isActive) {
    vscode.commands.executeCommand('markdown.preview.refresh').then(undefined, (error: unknown) => {
      log.warn(`The Markdown previews could not render again: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
}

/**
 * activate starts the extension.
 * @param context - The extension context, which holds the registrations to dispose on deactivation.
 * @returns The export of the extension, which the Markdown extension of VS Code reads.
 */
export function activate(context: vscode.ExtensionContext): Api {
  // Each kind of preview has a reader of its own, so that a change of an included file refreshes only the kind that
  // includes it: the Markdown preview renders again only as a whole, with a new page.
  const markdownIncludes = new IncludeFiles();
  const pumlIncludes = new IncludeFiles();
  // The log shows the problems that no diagram shows, in the Output view of VS Code.
  const log = vscode.window.createOutputChannel('nimblescape PlantUML', { log: true });
  const previews = new PumlPreviews(context.extensionUri, readSettings, (document, text) => pumlIncludes.load(document, text), log);
  const refresh = () => refreshMarkdownPreviews(log);
  context.subscriptions.push(
    log,
    markdownIncludes,
    pumlIncludes,
    // The Markdown preview renders again only when its document or its own settings change.
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(settingsSection)) {
        refresh();
        previews.refreshAll();
      }
    }),
    markdownIncludes.onDidChange(refresh),
    pumlIncludes.onDidChange(() => previews.refreshAll()),
    ...previews.register(),
    ...registerCompletion(),
    ...registerFormatting(),
  );
  return {
    extendMarkdownIt: (md) =>
      extendMarkdownIt(
        md,
        (rendering) => readSettings(documentOf(rendering)),
        (rendering, source) => markdownIncludes.filesOf(documentOf(rendering), source),
      ),
  };
}

/** deactivate stops the extension. VS Code disposes the registrations of the context. */
export function deactivate(): void {}
