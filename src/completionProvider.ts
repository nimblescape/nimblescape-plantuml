// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The code completion of PlantUML files and of the PlantUML blocks of
 * Markdown files, with the proposals while typing in a block. The proposals
 * come from `src/language/completion.ts`, which uses no API of VS Code.
 */

import * as vscode from 'vscode';
import { Completion, complete } from './language/completion';
import { blockAt, linesOf } from './markdownDocuments';

/**
 * completionItems turns the result of the completion into completion items. Each item replaces the word at the
 * cursor, with its `@`, `!` or opening quote, so that the editor filters the items by that word. The list is
 * incomplete, so that the editor asks again for each typed character: the completion proposes nothing for a
 * complete word, and the editor then closes the list, so that Enter starts a new line.
 * @param completion - The result of the completion.
 * @param position - The position of the cursor.
 */
function completionItems(completion: Completion, position: vscode.Position): vscode.CompletionList {
  const range = {
    inserting: new vscode.Range(position.line, completion.start, position.line, position.character),
    replacing: new vscode.Range(position.line, completion.start, position.line, completion.end),
  };
  const items = completion.proposals.map((proposal) => {
    const item = new vscode.CompletionItem(proposal.label, vscode.CompletionItemKind[proposal.kind]);
    item.range = range;
    item.detail = proposal.detail;
    return item;
  });
  return new vscode.CompletionList(items, true);
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
 * blocks, and in the prefix of a line of a block (the markers of a block quote, the indentation of a list item), it
 * proposes nothing, so the Markdown editor works there as without the extension
 * ([R-MD-006](../docs/requirements.md#r-md-006)).
 */
const markdownCompletion: vscode.CompletionItemProvider = {
  provideCompletionItems: (document, position) => {
    const block = blockAt(document, position.line);
    const prefix = block?.prefixes[position.line - block.start];
    if (!block || prefix === undefined || position.character < prefix.length) {
      return undefined;
    }
    const completion = complete(block.lines, position.line - block.start, position.character - prefix.length);
    return completionItems({ ...completion, start: completion.start + prefix.length, end: completion.end + prefix.length }, position);
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
  // The setting is quicker to read than the blocks of the document.
  if (quickSuggestionsOn(event.document) && blockAt(event.document, line)) {
    void vscode.commands.executeCommand('editor.action.triggerSuggest', { auto: true });
  }
}

/** registerCompletion registers the code completion of both languages and the proposals while typing. */
export function registerCompletion(): vscode.Disposable[] {
  return [
    vscode.languages.registerCompletionItemProvider('plantuml', pumlCompletion, ...triggerCharacters),
    vscode.languages.registerCompletionItemProvider('markdown', markdownCompletion, ...triggerCharacters),
    vscode.workspace.onDidChangeTextDocument(suggestWhileTyping),
  ];
}
