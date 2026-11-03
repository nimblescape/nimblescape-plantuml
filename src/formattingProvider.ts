// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The formatting of PlantUML files and of the PlantUML blocks of Markdown
 * files, with the command "Format PlantUML Blocks" and the formatting of the
 * blocks on save for Markdown files that another extension formats. The
 * formatted lines come from `src/language/formatting.ts`, which uses no API
 * of VS Code.
 */

import * as vscode from 'vscode';
import { formatLines } from './language/formatting';
import { blocksOf, linesOf } from './markdownDocuments';

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

/** registerFormatting registers the formatting of both languages, the command and the formatting on save. */
export function registerFormatting(): vscode.Disposable[] {
  return [
    vscode.languages.registerDocumentFormattingEditProvider('plantuml', pumlFormatting),
    vscode.languages.registerDocumentRangeFormattingEditProvider('plantuml', pumlFormatting),
    vscode.languages.registerDocumentFormattingEditProvider('markdown', markdownFormatting),
    vscode.languages.registerDocumentRangeFormattingEditProvider('markdown', markdownFormatting),
    vscode.commands.registerCommand(formatBlocksCommand, formatBlocks),
    vscode.workspace.onWillSaveTextDocument(formatBlocksOnSave),
  ];
}
