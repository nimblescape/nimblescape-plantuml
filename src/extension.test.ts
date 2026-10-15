// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests run the activation of the extension with a fake of the API of
 * VS Code. They check that the export renders PlantUML blocks with the lines
 * of the settings of the document, that a change of a setting of the
 * extension refreshes the Markdown previews (R-GEN-007), and that the code
 * completion works in `.puml` files (R-PUML-006) and in the PlantUML blocks of
 * Markdown files only (R-MD-004, R-MD-006).
 */

import MarkdownIt from 'markdown-it';
import { beforeEach, expect, test, vi } from 'vitest';
import { settingsAttribute } from './markdown/markdownIt';
import { settingsSection } from './settings';

/** FakeUri stands for a vscode.Uri; the extension only passes it on. */
interface FakeUri {
  scheme: string;
  path: string;
}

/** settingsOf holds the values of the settings of the fake, by the path of a document; '' is the window. */
let settingsOf: Map<string, Record<string, unknown>>;
/** requests records the reads of the settings: the section and the path of the document. */
let requests: [string, string][];
/** commands records the executed commands. */
let commands: string[];
/** commandArguments records the arguments of the executed commands. */
let commandArguments: unknown[][];
/** configurationListeners are the listeners for a change of the settings. */
let configurationListeners: ((event: { affectsConfiguration(section: string): boolean }) => void)[];

/** FakeRange stands for a vscode.Range. */
class FakeRange {
  constructor(
    readonly startLine: number,
    readonly startCharacter: number,
    readonly endLine: number,
    readonly endCharacter: number,
  ) {}

  get start() {
    return { line: this.startLine, character: this.startCharacter };
  }

  get end() {
    return { line: this.endLine, character: this.endCharacter };
  }
}

/** FakeCompletionItem stands for a vscode.CompletionItem. */
class FakeCompletionItem {
  range?: { inserting: FakeRange; replacing: FakeRange };
  detail?: string;
  constructor(
    readonly label: string,
    readonly kind: string,
  ) {}
}

/** FakeProvider stands for a vscode.CompletionItemProvider with a fake document. */
interface FakeProvider {
  provideCompletionItems(document: { version: number; getText(): string }, position: { line: number; character: number }): FakeCompletionItem[] | undefined;
}

/** providers records the registered completion providers by their language, with their trigger characters. */
let providers: Map<string, { provider: FakeProvider; triggerCharacters: string[] }>;

/** FakeFormatter stands for a vscode.DocumentFormattingEditProvider and a vscode.DocumentRangeFormattingEditProvider. */
interface FakeFormatter {
  provideDocumentFormattingEdits?(document: FakeTextDocument, options: FakeOptions): FakeEdit[];
  provideDocumentRangeFormattingEdits?(document: FakeTextDocument, range: FakeRange, options: FakeOptions): FakeEdit[];
}

/** FakeOptions stands for vscode.FormattingOptions. */
interface FakeOptions {
  tabSize: number;
  insertSpaces: boolean;
}

/** FakeEdit stands for a vscode.TextEdit. */
interface FakeEdit {
  range: FakeRange;
  newText: string;
}

/** FakeTextDocument stands for a vscode.TextDocument for the formatting. */
interface FakeTextDocument {
  version: number;
  getText(): string;
  lineAt(line: number): { lineNumber: number; text: string; range: FakeRange };
}

/** formatters records the registered formatting providers by their language and kind (document or range). */
let formatters: Map<string, FakeFormatter>;

/** FakeChangeEvent stands for a vscode.TextDocumentChangeEvent. */
interface FakeChangeEvent {
  document: FakeDocument;
  reason: number | undefined;
  contentChanges: { range: { start: { line: number; character: number } }; rangeLength: number; text: string }[];
}

/** FakeDocument stands for a vscode.TextDocument. */
interface FakeDocument {
  languageId: string;
  version: number;
  uri: FakeUri;
  getText(): string;
  lineAt(line: number): { text: string };
}

/** changeListeners are the listeners for a change of a document. */
let changeListeners: ((event: FakeChangeEvent) => void)[];
/** activeEditor is the active text editor of the fake window. */
let activeEditor: { document: FakeDocument; selections: unknown[] } | undefined;

beforeEach(() => {
  settingsOf = new Map();
  requests = [];
  commands = [];
  commandArguments = [];
  configurationListeners = [];
  changeListeners = [];
  activeEditor = undefined;
  providers = new Map();
  formatters = new Map();
  vi.resetModules();
  vi.doMock('vscode', () => ({
    workspace: {
      getConfiguration: (section: string, scope?: FakeUri) => {
        requests.push([section, scope?.path ?? '']);
        const values = settingsOf.get(scope?.path ?? '') ?? {};
        return { get: (key: string, fallback?: unknown) => (key in values ? values[key] : fallback) };
      },
      onDidChangeConfiguration: (listener: (typeof configurationListeners)[number]) => {
        configurationListeners.push(listener);
        return { dispose() {} };
      },
      onDidChangeTextDocument: (listener: (typeof changeListeners)[number]) => {
        changeListeners.push(listener);
        return { dispose() {} };
      },
    },
    window: {
      get activeTextEditor() {
        return activeEditor;
      },
      // These tests do not cover the previews of PlantUML files; the registrations only need to exist.
      registerCustomEditorProvider: () => ({ dispose() {} }),
      registerWebviewPanelSerializer: () => ({ dispose() {} }),
      onDidChangeActiveTextEditor: () => ({ dispose() {} }),
    },
    commands: {
      executeCommand: async (command: string, ...args: unknown[]) => {
        commands.push(command);
        commandArguments.push(args);
      },
      registerCommand: () => ({ dispose() {} }),
    },
    languages: {
      registerCompletionItemProvider: (language: string, provider: FakeProvider, ...triggerCharacters: string[]) => {
        providers.set(language, { provider, triggerCharacters });
        return { dispose() {} };
      },
      registerDocumentFormattingEditProvider: (language: string, provider: FakeFormatter) => {
        formatters.set(`${language} document`, provider);
        return { dispose() {} };
      },
      registerDocumentRangeFormattingEditProvider: (language: string, provider: FakeFormatter) => {
        formatters.set(`${language} range`, provider);
        return { dispose() {} };
      },
    },
    TextEdit: { replace: (range: FakeRange, newText: string): FakeEdit => ({ range, newText }) },
    Range: FakeRange,
    CompletionItem: FakeCompletionItem,
    // The kinds are their names here, so that the tests can read them.
    CompletionItemKind: new Proxy({}, { get: (_target, name) => name }),
  }));
});

/** activate imports the extension with the fake API and activates it. */
const activate = async () => {
  const extension = await import('./extension');
  const context = { subscriptions: [] as { dispose(): void }[], extensionUri: { scheme: 'file', path: '/extension' } };
  return { api: extension.activate(context as never), context, extension };
};

/** block is a Markdown text with one PlantUML block. */
const block = '```plantuml\nclass A\n```\n';

test('the module exports activate and deactivate', async () => {
  const { extension } = await activate();
  expect(typeof extension.deactivate).toBe('function');
});

test('the export renders PlantUML blocks without settings by default', async () => {
  const { api } = await activate();
  const md = api.extendMarkdownIt(new MarkdownIt());
  expect(md.render(block)).not.toContain(settingsAttribute);
});

test('the export reads the settings of the rendered document and adds them to the block', async () => {
  const { api } = await activate();
  const md = api.extendMarkdownIt(new MarkdownIt());
  const document: FakeUri = { scheme: 'file', path: '/folder/a.md' };
  settingsOf.set(document.path, { classIcons: false });
  expect(md.render(block, { currentDocument: document })).toContain(`${settingsAttribute}="{&quot;classIcons&quot;:false}"`);
  expect(requests).toEqual([[settingsSection, document.path]]);

  // A text without a document gets the settings of the window, which keep the icons here.
  expect(md.render(block)).not.toContain(settingsAttribute);
  expect(requests.at(-1)).toEqual([settingsSection, '']);
});

test('a change of a setting of the extension refreshes the Markdown previews, a change of another setting does not', async () => {
  const { context } = await activate();
  expect(context.subscriptions).toHaveLength(16);
  const change = (changed: string) => configurationListeners.forEach((listener) => listener({ affectsConfiguration: (section) => section === changed }));
  change('editor');
  expect(commands).toEqual([]);
  change(settingsSection);
  expect(commands).toEqual(['markdown.preview.refresh']);
});

/**
 * completeIn runs the completion provider of a language at the position of `‸` in a text.
 * @param language - The language of the document.
 * @param text - The text, with `‸` at the cursor.
 */
function completeIn(language: string, text: string) {
  const before = text.slice(0, text.indexOf('‸')).split('\n');
  const document = { version: 1, getText: () => text.replace('‸', '') };
  const position = { line: before.length - 1, character: before.at(-1)!.length };
  return providers.get(language)!.provider.provideCompletionItems(document, position);
}

test('the completion of PlantUML files proposes keywords and the names of the file, for the word at the cursor', async () => {
  await activate();
  expect(providers.get('plantuml')!.triggerCharacters).toEqual(['@', '!', '$']);
  const items = completeIn('plantuml', '@startuml\ninterface Shape\nclass Car\nCar ..|> Sh‸ape\n@enduml\n')!;
  expect(items.map((item) => item.label)).toEqual(expect.arrayContaining(['Shape', 'Car', 'as']));
  const shape = items.find((item) => item.label === 'Shape')!;
  expect(shape).toMatchObject({ kind: 'Interface', detail: 'interface' });
  expect(shape.range).toEqual({ inserting: new FakeRange(3, 9, 3, 11), replacing: new FakeRange(3, 9, 3, 14) });
});

test('the completion of Markdown files works in PlantUML blocks only, with the names of the same block', async () => {
  await activate();
  expect(providers.get('markdown')!.triggerCharacters).toEqual(['@', '!', '$']);
  const markdown = ['# Title', '', '```plantuml', 'class Car', '```', '', '```plantuml', 'class Bike', 'B‸', '```', 'Text'];
  const items = completeIn('markdown', markdown.join('\n'))!;
  expect(items.map((item) => item.label)).toEqual(expect.arrayContaining(['Bike', 'class']));
  expect(items.map((item) => item.label)).not.toContain('Car');
  expect(items[0].range!.inserting).toEqual(new FakeRange(8, 0, 8, 1));

  // Outside the PlantUML blocks, and in another code block, the completion proposes nothing.
  expect(completeIn('markdown', markdown.join('\n').replace('B‸', 'B').replace('Text', 'Te‸xt'))).toBeUndefined();
  expect(completeIn('markdown', '```js\ncl‸\n```')).toBeUndefined();

  // The extension reads the blocks again for a new version of the same document.
  const document = { version: 1, text: '```js\nB\n```', getText: () => document.text };
  const provider = providers.get('markdown')!.provider;
  expect(provider.provideCompletionItems(document, { line: 1, character: 1 })).toBeUndefined();
  Object.assign(document, { version: 2, text: '```plantuml\nB\n```' });
  expect(provider.provideCompletionItems(document, { line: 1, character: 1 })).toBeDefined();
});

/**
 * typeIn opens a Markdown text in the active editor and types a character at the position of `‸`.
 * @param text - The Markdown text, with `‸` at the cursor.
 * @param typed - The typed character.
 * @param reason - The reason of the change: undefined for typing, 1 for undo.
 */
function typeIn(text: string, typed: string, reason?: number) {
  const before = text.slice(0, text.indexOf('‸')).split('\n');
  const after = text.replace('‸', typed);
  const document: FakeDocument = {
    languageId: 'markdown',
    version: 1,
    uri: { scheme: 'file', path: '/folder/a.md' },
    getText: () => after,
    lineAt: (line) => ({ text: after.split('\n')[line] }),
  };
  activeEditor = { document, selections: [{}] };
  const change = { range: { start: { line: before.length - 1, character: before.at(-1)!.length } }, rangeLength: 0, text: typed };
  changeListeners.forEach((listener) => listener({ document, reason, contentChanges: [change] }));
}

test('typing a word in a PlantUML block of a Markdown file shows the proposals, as in a PlantUML file', async () => {
  await activate();
  settingsOf.set('', { quickSuggestions: { other: 'offWhenInlineCompletions', comments: 'off', strings: 'off' } });
  const block = '```plantuml\nclass Car\n‸\n```\n';
  typeIn(block, 'C');
  expect(commands).toEqual(['editor.action.triggerSuggest']);
  expect(commandArguments).toEqual([[{ auto: true }]]);
  expect(requests).toContainEqual(['editor', '']);

  // Typing in the middle of a word, typing another character, an undo, and typing outside the block do nothing.
  commands = [];
  typeIn('```plantuml\n‸ar\n```\n', 'C');
  typeIn(block, ' ');
  typeIn(block, 'C', 1);
  typeIn('Text ‸\n' + block.replace('‸', ''), 'C');
  expect(commands).toEqual([]);

  // The setting editor.quickSuggestions of the language plantuml decides, as in a PlantUML file.
  settingsOf.set('', { quickSuggestions: { other: 'off' } });
  typeIn(block, 'C');
  settingsOf.set('', { quickSuggestions: 'inline' });
  typeIn(block, 'C');
  expect(commands).toEqual([]);
  settingsOf.set('', { quickSuggestions: true });
  typeIn(block, 'C');
  expect(commands).toEqual(['editor.action.triggerSuggest']);
});

/**
 * textDocument returns a fake document with a text.
 * @param text - The text.
 */
function textDocument(text: string): FakeTextDocument {
  const lines = text.split('\n');
  return {
    version: 1,
    getText: () => text,
    lineAt: (line) => ({ lineNumber: line, text: lines[line], range: new FakeRange(line, 0, line, lines[line].length) }),
  };
}

/** spaces are formatting options with two spaces for each level. */
const spaces: FakeOptions = { tabSize: 2, insertSpaces: true };

test('the formatting of PlantUML files indents the whole file or the lines of a selection', async () => {
  await activate();
  const document = textDocument('@startuml\npackage p {\nclass A\n  class B   \n}\n@enduml');
  expect(formatters.get('plantuml document')!.provideDocumentFormattingEdits!(document, spaces)).toEqual([
    { range: new FakeRange(2, 0, 2, 7), newText: '  class A' },
    { range: new FakeRange(3, 0, 3, 12), newText: '  class B' },
  ]);
  // A selection of whole lines ends at the start of the next line, which it does not format.
  const selection = new FakeRange(3, 0, 4, 0);
  expect(formatters.get('plantuml range')!.provideDocumentRangeFormattingEdits!(document, selection, { tabSize: 4, insertSpaces: false })).toEqual([
    { range: new FakeRange(3, 0, 3, 12), newText: '\tclass B' },
  ]);
});

test('the formatting of Markdown files changes the lines of the PlantUML blocks only, with the indentation of the fence', async () => {
  await activate();
  const markdown = ['# Title   ', '- item', '  ```plantuml', '  package p {', '  class A', '  }', '  ```', '', '```js', 'if (a) {', 'b', '}', '```', '```plantuml', 'alt x', 'A -> B', 'end', '```'];
  const document = textDocument(markdown.join('\n'));
  expect(formatters.get('markdown document')!.provideDocumentFormattingEdits!(document, spaces)).toEqual([
    { range: new FakeRange(4, 0, 4, 9), newText: '    class A' },
    { range: new FakeRange(15, 0, 15, 6), newText: '  A -> B' },
  ]);
  // A selection formats the lines of the blocks inside it only.
  const selection = new FakeRange(10, 0, 15, 3);
  expect(formatters.get('markdown range')!.provideDocumentRangeFormattingEdits!(document, selection, spaces)).toEqual([
    { range: new FakeRange(15, 0, 15, 6), newText: '  A -> B' },
  ]);
  expect(formatters.get('markdown range')!.provideDocumentRangeFormattingEdits!(document, new FakeRange(0, 0, 1, 3), spaces)).toEqual([]);
});
