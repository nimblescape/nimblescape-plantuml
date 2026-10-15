// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The editor wiring of the extension. The manifest contributes the language
 * `plantuml`, its editing rules, the grammars, the settings, and the script
 * and the styles of the Markdown preview without code. Activation returns the
 * markdown-it plugin, which the Markdown extension of VS Code reads from the
 * export `extendMarkdownIt` when it builds its preview, refreshes the Markdown
 * previews when a setting of the extension changes, and registers the code
 * completion for `.puml` files and for the PlantUML blocks of Markdown files.
 */

import type MarkdownIt from 'markdown-it';
import * as vscode from 'vscode';
import { Completion, complete } from './language/completion';
import { Block, plantUmlBlocks } from './markdown/blocks';
import { extendMarkdownIt } from './markdown/markdownIt';
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
  const configuration = vscode.workspace.getConfiguration(settingsSection, document);
  return { classIcons: configuration.get<boolean>('classIcons', defaultSettings.classIcons) };
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
 * linesOf returns the lines of a document.
 * @param document - The document.
 */
const linesOf = (document: vscode.TextDocument): string[] => document.getText().split(/\r\n|\r|\n/);

/** markdownBlocks holds the lines and the PlantUML blocks of each open Markdown document, for one version. */
const markdownBlocks = new WeakMap<vscode.TextDocument, { version: number; lines: string[]; blocks: Block[] }>();

/**
 * blockAt returns the lines of a Markdown document and its PlantUML block that holds a line. The extension reads
 * the blocks once for each version of the document, because it looks for them after each typed letter.
 * @param document - The Markdown document.
 * @param line - The index of the line.
 */
function blockAt(document: vscode.TextDocument, line: number): { lines: string[]; block: Block | undefined } {
  let known = markdownBlocks.get(document);
  if (!known || known.version !== document.version) {
    const lines = linesOf(document);
    known = { version: document.version, lines, blocks: plantUmlBlocks(lines) };
    markdownBlocks.set(document, known);
  }
  return { lines: known.lines, block: known.blocks.find(({ start, end }) => start <= line && line < end) };
}

/**
 * completionItems turns the result of the completion into completion items. Each item replaces the word at the
 * cursor, with its `@`, `!` or opening quote, so that the editor filters the items by that word.
 * @param completion - The result of the completion.
 * @param position - The position of the cursor.
 */
function completionItems(completion: Completion, position: vscode.Position): vscode.CompletionItem[] {
  const range = {
    inserting: new vscode.Range(position.line, completion.start, position.line, position.character),
    replacing: new vscode.Range(position.line, completion.start, position.line, completion.end),
  };
  return completion.proposals.map((proposal) => {
    const item = new vscode.CompletionItem(proposal.label, vscode.CompletionItemKind[proposal.kind]);
    item.range = range;
    item.detail = proposal.detail;
    return item;
  });
}

/**
 * pumlCompletion is the code completion of PlantUML files
 * ([R-PUML-006](../docs/requirements.md#r-puml-006)). Its context is the whole file.
 */
const pumlCompletion: vscode.CompletionItemProvider = {
  provideCompletionItems: (document, position) =>
    completionItems(complete(linesOf(document), position.line, position.character), position),
};

/**
 * markdownCompletion is the code completion of the PlantUML blocks of Markdown files
 * ([R-MD-004](../docs/requirements.md#r-md-004)). Its context is the block of the cursor. Outside the PlantUML
 * blocks it proposes nothing, so the Markdown editor works there as without the extension
 * ([R-MD-006](../docs/requirements.md#r-md-006)).
 */
const markdownCompletion: vscode.CompletionItemProvider = {
  provideCompletionItems: (document, position) => {
    const { lines, block } = blockAt(document, position.line);
    if (!block) {
      return undefined;
    }
    const completion = complete(lines.slice(block.start, block.end), position.line - block.start, position.character);
    return completionItems(completion, position);
  },
};

/** triggerCharacters start the completion: the `@` of `@startuml`, the `!` of `!include`, and the `$` of variables. */
const triggerCharacters = ['@', '!', '$'];

/**
 * quickSuggestionsOn tells whether the editor shows proposals while the user types code of the language
 * `plantuml`, by the setting `editor.quickSuggestions` for that language. The default value
 * `offWhenInlineCompletions` shows them too; the editor only waits for the inline completions first, if an
 * extension provides them. The value `inline` shows the proposals as inline text, which an extension cannot start.
 * @param document - The document, for the settings of its folder.
 */
function quickSuggestionsOn(document: vscode.TextDocument): boolean {
  const value = vscode.workspace.getConfiguration('editor', { languageId: 'plantuml', uri: document.uri }).get<unknown>('quickSuggestions');
  const other = typeof value === 'object' && value !== null ? (value as Record<string, unknown>).other : value;
  return other === true || other === 'on' || other === 'offWhenInlineCompletions';
}

/**
 * suggestWhileTyping shows the proposals while the user types a word in a PlantUML block of a Markdown file, as
 * the editor does in a `.puml` file ([R-MD-004](../docs/requirements.md#r-md-004)).
 *
 * VS Code turns off the proposals while typing for Markdown files (`editor.quickSuggestions` of the language
 * `markdown`), and it starts the completion by a trigger character only when the character is not part of a word.
 * So the extension starts the completion itself, with the command `editor.action.triggerSuggest`, when the user
 * types a letter at the end of a word in a PlantUML block, and when `editor.quickSuggestions` of the language
 * `plantuml` is on. The argument `auto` makes the editor show nothing when there are no proposals, and the command
 * does nothing while the proposals show. Outside the PlantUML blocks the extension does nothing
 * ([R-MD-006](../docs/requirements.md#r-md-006)).
 * @param event - The change of a document.
 */
function suggestWhileTyping(event: vscode.TextDocumentChangeEvent): void {
  const editor = vscode.window.activeTextEditor;
  const [change] = event.contentChanges;
  if (
    event.document.languageId !== 'markdown' ||
    editor?.document !== event.document ||
    editor.selections.length !== 1 ||
    event.reason !== undefined ||
    event.contentChanges.length !== 1 ||
    change.rangeLength !== 0 ||
    !/^[\p{L}_]$/u.test(change.text)
  ) {
    return;
  }
  const { line, character } = change.range.start;
  if (/^[\p{L}\p{N}_$]/u.test(event.document.lineAt(line).text.slice(character + 1))) {
    return;
  }
  if (blockAt(event.document, line).block && quickSuggestionsOn(event.document)) {
    void vscode.commands.executeCommand('editor.action.triggerSuggest', { auto: true });
  }
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
    vscode.languages.registerCompletionItemProvider('plantuml', pumlCompletion, ...triggerCharacters),
    vscode.languages.registerCompletionItemProvider('markdown', markdownCompletion, ...triggerCharacters),
    vscode.workspace.onDidChangeTextDocument(suggestWhileTyping),
  );
  return { extendMarkdownIt: (md) => extendMarkdownIt(md, (env) => readSettings(documentOf(env))) };
}

/** deactivate stops the extension. VS Code disposes the registrations of the context. */
export function deactivate(): void {}
