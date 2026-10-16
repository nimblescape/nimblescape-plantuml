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
 * completion and the formatting for `.puml` files and for the PlantUML blocks
 * of Markdown files, with the command "Format PlantUML Blocks" and the
 * formatting of the blocks on save for Markdown files that another extension
 * formats.
 */

import type MarkdownIt from 'markdown-it';
import * as vscode from 'vscode';
import { IncludeFiles } from './includeFiles';
import { Completion, complete } from './language/completion';
import { formatLines } from './language/formatting';
import { Block, plantUmlBlocks } from './markdown/blocks';
import { extendMarkdownIt, Rendering } from './markdown/markdownIt';
import { PumlPreviews } from './pumlPreviews';
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
  return { umlNotation: configuration.get<boolean>('umlNotation', defaultSettings.umlNotation) };
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

/**
 * linesOf returns the lines of a document.
 * @param document - The document.
 */
const linesOf = (document: vscode.TextDocument): string[] => document.getText().split(/\r\n|\r|\n/);

/** markdownBlocks holds the PlantUML blocks of each open Markdown document, for one version. */
const markdownBlocks = new WeakMap<vscode.TextDocument, { version: number; blocks: Block[] }>();

/**
 * blocksOf returns the PlantUML blocks of a Markdown document. The extension reads the blocks once for each version
 * of the document, because it looks for them after each typed letter.
 * @param document - The Markdown document.
 */
function blocksOf(document: vscode.TextDocument): Block[] {
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
const blockAt = (document: vscode.TextDocument, line: number): Block | undefined =>
  blocksOf(document).find(({ start, end }) => start <= line && line < end);

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

/**
 * indentUnit returns the text of one level of indentation for the options of the editor.
 * @param options - The formatting options of the editor.
 */
const indentUnit = (options: vscode.FormattingOptions): string => (options.insertSpaces ? ' '.repeat(options.tabSize) : '\t');

/**
 * lastLine returns the index of the last line of a range. A range that ends at the start of a line, as a selection
 * of whole lines does, ends on the line before.
 * @param range - The range.
 */
const lastLine = (range: vscode.Range): number =>
  range.end.character === 0 && range.end.line > range.start.line ? range.end.line - 1 : range.end.line;

/**
 * lineEdits returns the edits that replace the lines of a document by formatted lines. Each changed line gets one
 * edit of its text; the line breaks stay as they are.
 * @param document - The document.
 * @param first - The index of the line of the first formatted line.
 * @param formatted - The formatted lines.
 * @param range - The range to format, or undefined for every line.
 */
function lineEdits(document: vscode.TextDocument, first: number, formatted: readonly string[], range?: vscode.Range): vscode.TextEdit[] {
  const edits: vscode.TextEdit[] = [];
  formatted.forEach((text, offset) => {
    const line = document.lineAt(first + offset);
    const inRange = !range || (line.lineNumber >= range.start.line && line.lineNumber <= lastLine(range));
    if (inRange && line.text !== text) {
      edits.push(vscode.TextEdit.replace(line.range, text));
    }
  });
  return edits;
}

/**
 * pumlFormatting is the formatting of PlantUML files ([R-PUML-007](../docs/requirements.md#r-puml-007)) for the
 * commands "Format Document" and "Format Selection". It reads the whole file, so that a selection gets the depth
 * of its lines in the file.
 */
const pumlFormatting: vscode.DocumentFormattingEditProvider & vscode.DocumentRangeFormattingEditProvider = {
  provideDocumentFormattingEdits: (document, options) => lineEdits(document, 0, formatLines(linesOf(document), indentUnit(options))),
  provideDocumentRangeFormattingEdits: (document, range, options) =>
    lineEdits(document, 0, formatLines(linesOf(document), indentUnit(options)), range),
};

/**
 * markdownEdits returns the edits that format the PlantUML blocks of a Markdown document. Each line of a block keeps
 * its prefix, for example the indentation of a list item or the marker of a block quote, and a blank line keeps it
 * without spaces at its end. A block with a line whose prefix is not known stays as it is. No other line changes
 * ([R-MD-006](../docs/requirements.md#r-md-006)).
 * @param document - The Markdown document.
 * @param options - The formatting options of the editor.
 * @param range - The range to format, or undefined for every block.
 */
function markdownEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, range?: vscode.Range): vscode.TextEdit[] {
  return blocksOf(document)
    .filter(({ start, end }) => !range || (end > range.start.line && start <= lastLine(range)))
    .filter(({ prefixes }) => prefixes.every((prefix) => prefix !== undefined))
    .flatMap(({ start, lines, prefixes }) => {
      const formatted = formatLines(lines, indentUnit(options)).map((line, index) =>
        line === '' ? prefixes[index]!.trimEnd() : prefixes[index] + line,
      );
      return lineEdits(document, start, formatted, range);
    });
}

/**
 * markdownFormatting is the formatting of the PlantUML blocks of Markdown files
 * ([R-MD-005](../docs/requirements.md#r-md-005)). It changes the lines of the PlantUML blocks only.
 */
const markdownFormatting: vscode.DocumentFormattingEditProvider & vscode.DocumentRangeFormattingEditProvider = {
  provideDocumentFormattingEdits: (document, options) => markdownEdits(document, options),
  provideDocumentRangeFormattingEdits: (document, range, options) => markdownEdits(document, options, range),
};

/** formatBlocksCommand is the command "Format PlantUML Blocks" for Markdown files. */
export const formatBlocksCommand = 'nimblescape.plantuml.formatBlocks';

/**
 * formattingOptions returns the formatting options of a document: the options of the editor that shows it, or else
 * the settings `editor.tabSize` and `editor.insertSpaces` of the document.
 * @param document - The document.
 */
function formattingOptions(document: vscode.TextDocument): vscode.FormattingOptions {
  const options = vscode.window.visibleTextEditors.find((editor) => editor.document === document)?.options;
  const settings = vscode.workspace.getConfiguration('editor', document);
  return {
    tabSize: typeof options?.tabSize === 'number' ? options.tabSize : settings.get<number>('tabSize', 4),
    insertSpaces: typeof options?.insertSpaces === 'boolean' ? options.insertSpaces : settings.get<boolean>('insertSpaces', true),
  };
}

/**
 * formatBlocks formats the PlantUML blocks of the Markdown file of the active editor
 * ([R-MD-005](../docs/requirements.md#r-md-005)). VS Code runs one formatter for "Format Document": the default
 * formatter of Markdown files, which is often another extension, for example Prettier. The command formats the
 * PlantUML blocks whatever that formatter is.
 */
async function formatBlocks(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.languageId !== 'markdown') {
    return;
  }
  const edits = markdownEdits(editor.document, formattingOptions(editor.document));
  if (edits.length > 0) {
    await editor.edit((builder) => edits.forEach((edit) => builder.replace(edit.range, edit.newText)));
  }
}

/**
 * formatBlocksOnSave formats the PlantUML blocks of a Markdown file on save when the setting `editor.formatOnSave`
 * of the file is on ([R-MD-005](../docs/requirements.md#r-md-005)). VS Code formats on save with the default
 * formatter of Markdown files only, so this keeps the blocks formatted when another extension is that formatter.
 * As VS Code does, it does not format on an automatic save after a delay. It formats only when the setting
 * `editor.formatOnSaveMode` is `file`: with the other values, VS Code formats the changed lines only, and the
 * extension does not know them.
 * @param event - The event of the save.
 */
function formatBlocksOnSave(event: vscode.TextDocumentWillSaveEvent): void {
  const { document } = event;
  if (document.languageId !== 'markdown' || event.reason === vscode.TextDocumentSaveReason.AfterDelay) {
    return;
  }
  const settings = vscode.workspace.getConfiguration('editor', document);
  if (!settings.get<boolean>('formatOnSave', false) || settings.get<string>('formatOnSaveMode', 'file') !== 'file') {
    return;
  }
  const edits = markdownEdits(document, formattingOptions(document));
  if (edits.length > 0) {
    event.waitUntil(Promise.resolve(edits));
  }
}

/** markdownExtension is the identifier of the Markdown extension of VS Code, which owns the Markdown preview. */
const markdownExtension = 'vscode.markdown-language-features';

/**
 * refreshMarkdownPreviews renders the Markdown previews again, so that they use a changed setting of the extension or
 * a changed included file. While the Markdown extension is not active, no Markdown preview is open, and the command
 * would only start that extension, so nothing happens then.
 */
function refreshMarkdownPreviews(): void {
  if (vscode.extensions.getExtension(markdownExtension)?.isActive) {
    vscode.commands.executeCommand('markdown.preview.refresh').then(undefined, () => undefined);
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
  const previews = new PumlPreviews(context.extensionUri, readSettings, (document, text) => pumlIncludes.load(document, text));
  context.subscriptions.push(
    markdownIncludes,
    pumlIncludes,
    // The Markdown preview renders again only when its document or its own settings change.
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(settingsSection)) {
        refreshMarkdownPreviews();
        previews.refreshAll();
      }
    }),
    markdownIncludes.onDidChange(refreshMarkdownPreviews),
    pumlIncludes.onDidChange(() => previews.refreshAll()),
    ...previews.register(),
    vscode.languages.registerCompletionItemProvider('plantuml', pumlCompletion, ...triggerCharacters),
    vscode.languages.registerCompletionItemProvider('markdown', markdownCompletion, ...triggerCharacters),
    vscode.workspace.onDidChangeTextDocument(suggestWhileTyping),
    vscode.languages.registerDocumentFormattingEditProvider('plantuml', pumlFormatting),
    vscode.languages.registerDocumentRangeFormattingEditProvider('plantuml', pumlFormatting),
    vscode.languages.registerDocumentFormattingEditProvider('markdown', markdownFormatting),
    vscode.languages.registerDocumentRangeFormattingEditProvider('markdown', markdownFormatting),
    vscode.commands.registerCommand(formatBlocksCommand, formatBlocks),
    vscode.workspace.onWillSaveTextDocument(formatBlocksOnSave),
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
