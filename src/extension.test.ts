// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests run the activation of the extension with a fake of the API of
 * VS Code. They check that every registration can be removed, that the export
 * renders PlantUML blocks with the lines of the settings of the document and
 * with their included files (R-GEN-008), that a change of a setting of the
 * extension or of an included file refreshes the open Markdown previews
 * (R-GEN-007, R-GEN-008), that the code completion works in `.puml` files (R-PUML-006)
 * and in the PlantUML blocks of Markdown files only (R-MD-004, R-MD-006), and
 * the formatting with its command and on save (R-MD-005, R-PUML-007).
 */

import MarkdownIt from 'markdown-it';
import { beforeEach, expect, test, vi } from 'vitest';
import { includesClass, settingsAttribute } from './markdown/markdownIt';
import { settingsSection } from './settings';

/** FakeUri stands for a vscode.Uri; the extension only passes it on. */
interface FakeUri {
  scheme: string;
  path: string;
}

/** FakeFolder stands for a vscode.WorkspaceFolder. */
interface FakeFolder {
  uri: FakeUri;
}

/** workspaceFolders are the workspace folders of the fake. */
let workspaceFolders: FakeFolder[];

/** settingsOf holds the values of the settings of the fake, by the path of a document or a folder; '' is the window. */
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

/** FakeCompletionList stands for a vscode.CompletionList. */
class FakeCompletionList {
  constructor(
    readonly items: FakeCompletionItem[],
    readonly isIncomplete: boolean,
  ) {}
}

/** FakeProvider stands for a vscode.CompletionItemProvider with a fake document. */
interface FakeProvider {
  provideCompletionItems(document: { version: number; getText(): string }, position: { line: number; character: number }): FakeCompletionList | undefined;
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

/** FakeSaveEvent stands for a vscode.TextDocumentWillSaveEvent. */
interface FakeSaveEvent {
  document: FakeTextDocument & { languageId: string };
  reason: number;
  waitUntil(edits: Promise<FakeEdit[]>): void;
}

/** FakeEditor stands for a vscode.TextEditor. */
interface FakeEditor {
  document: FakeDocument | (FakeTextDocument & { languageId: string });
  selections: unknown[];
  options?: { tabSize: number | string; insertSpaces: boolean | string };
  edit?(callback: (builder: { replace(range: FakeRange, text: string): void }) => void): Promise<boolean>;
}

/** changeListeners are the listeners for a change of a document. */
let changeListeners: ((event: FakeChangeEvent) => void)[];
/** saveListeners are the listeners for a save of a document. */
let saveListeners: ((event: FakeSaveEvent) => void)[];
/** activeEditor is the active text editor of the fake window. */
let activeEditor: FakeEditor | undefined;
/** registeredCommands are the handlers of the registered commands, by their names. */
let registeredCommands: Map<string, () => unknown>;
/** disposables are the registrations that the fake API returned. */
let disposables: { dispose(): void }[];
/** markdownActive tells whether the Markdown extension of VS Code is active. */
let markdownActive: boolean;
/** refreshFails makes the command `markdown.preview.refresh` fail. */
let refreshFails: boolean;
/** logged are the warnings in the log channel of the extension. */
let logged: string[];

/** disposable returns a new registration of the fake API and records it. */
const disposable = () => {
  const registration = { dispose() {} };
  disposables.push(registration);
  return registration;
};

/** openDocuments are the open documents of the fake: their language, address and text. */
let openDocuments: { languageId: string; uri: FakeUri; getText(): string }[];

/** emitters are the event emitters that the extension created. */
let emitters: FakeEventEmitter[];

/** FakeEventEmitter stands for a vscode.EventEmitter. */
class FakeEventEmitter {
  readonly listeners: (() => void)[] = [];

  constructor() {
    emitters.push(this);
  }

  readonly event = (listener: () => void) => {
    this.listeners.push(listener);
    return disposable();
  };

  fire(): void {
    this.listeners.forEach((listener) => listener());
  }

  dispose(): void {}
}

beforeEach(() => {
  settingsOf = new Map();
  requests = [];
  commands = [];
  commandArguments = [];
  configurationListeners = [];
  changeListeners = [];
  saveListeners = [];
  activeEditor = undefined;
  registeredCommands = new Map();
  disposables = [];
  markdownActive = true;
  refreshFails = false;
  logged = [];
  emitters = [];
  openDocuments = [];
  workspaceFolders = [];
  providers = new Map();
  formatters = new Map();
  vi.resetModules();
  vi.doMock('vscode', () => ({
    workspace: {
      getConfiguration: (section: string, scope?: FakeUri | FakeFolder | { languageId: string; uri: FakeUri }) => {
        // A workspace folder as the scope reads the settings of the folder; a scope with a language, those of the window.
        const path = scope === undefined || 'languageId' in scope ? '' : 'uri' in scope ? scope.uri.path : scope.path;
        requests.push([section, path]);
        const values = settingsOf.get(path) ?? {};
        return { get: (key: string, fallback?: unknown) => (key in values ? values[key] : fallback) };
      },
      get workspaceFolders() {
        return workspaceFolders;
      },
      getWorkspaceFolder: (uri: FakeUri) =>
        workspaceFolders.find((folder) => folder.uri.scheme === uri.scheme && uri.path.startsWith(`${folder.uri.path}/`)),
      onDidChangeConfiguration: (listener: (typeof configurationListeners)[number]) => {
        configurationListeners.push(listener);
        return disposable();
      },
      onDidChangeTextDocument: (listener: (typeof changeListeners)[number]) => {
        changeListeners.push(listener);
        return disposable();
      },
      onWillSaveTextDocument: (listener: (typeof saveListeners)[number]) => {
        saveListeners.push(listener);
        return disposable();
      },
      get textDocuments() {
        return openDocuments;
      },
    },
    window: {
      get activeTextEditor() {
        return activeEditor;
      },
      get visibleTextEditors() {
        return activeEditor ? [activeEditor] : [];
      },
      // These tests do not cover the previews of PlantUML files; the registrations only need to exist.
      registerCustomEditorProvider: disposable,
      registerWebviewPanelSerializer: disposable,
      onDidChangeActiveTextEditor: disposable,
      createOutputChannel: () => Object.assign(disposable(), { warn: (message: string) => logged.push(message) }),
    },
    extensions: {
      getExtension: (id: string) => (id === 'vscode.markdown-language-features' ? { isActive: markdownActive } : undefined),
    },
    commands: {
      executeCommand: async (command: string, ...args: unknown[]) => {
        commands.push(command);
        commandArguments.push(args);
        if (refreshFails && command === 'markdown.preview.refresh') {
          throw new Error('command not found');
        }
      },
      registerCommand: (command: string, handler: () => unknown) => {
        registeredCommands.set(command, handler);
        return disposable();
      },
    },
    languages: {
      registerCompletionItemProvider: (language: string, provider: FakeProvider, ...triggerCharacters: string[]) => {
        providers.set(language, { provider, triggerCharacters });
        return disposable();
      },
      registerDocumentFormattingEditProvider: (language: string, provider: FakeFormatter) => {
        formatters.set(`${language} document`, provider);
        return disposable();
      },
      registerDocumentRangeFormattingEditProvider: (language: string, provider: FakeFormatter) => {
        formatters.set(`${language} range`, provider);
        return disposable();
      },
    },
    EventEmitter: FakeEventEmitter,
    TextDocumentSaveReason: { Manual: 1, AfterDelay: 2, FocusOut: 3 },
    TextEdit: { replace: (range: FakeRange, newText: string): FakeEdit => ({ range, newText }) },
    Range: FakeRange,
    CompletionItem: FakeCompletionItem,
    CompletionList: FakeCompletionList,
    // The kinds are their names here, so that the tests can read them.
    CompletionItemKind: new Proxy({}, { get: (_target, name) => name }),
  }));
});

/** activate imports the extension with the fake API and activates it. */
const activate = async () => {
  const extension = { ...(await import('./extension')), ...(await import('./formattingProvider')) };
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
  settingsOf.set(document.path, { umlNotation: false });
  expect(md.render(block, { currentDocument: document })).toContain(`${settingsAttribute}="{&quot;umlNotation&quot;:false}"`);
  expect(requests).toEqual([[settingsSection, document.path]]);

  // A text without a document gets the settings of the window, which have the default values here.
  expect(md.render(block)).not.toContain(settingsAttribute);
  expect(requests.at(-1)).toEqual([settingsSection, '']);
});

test('the export finds the document of a text that the rendered diff renders without its document, by the text', async () => {
  const { api } = await activate();
  const md = api.extendMarkdownIt(new MarkdownIt());
  const text = '# A\r\n\r\n```plantuml\r\nclass Car\r\n```\r\n\r\n```plantuml\r\nclass Bike\r\n```\r\n';
  let reads = 0;
  const read = (content: string) => () => {
    reads++;
    return content;
  };
  openDocuments = [
    { languageId: 'plaintext', uri: { scheme: 'file', path: '/folder/a.txt' }, getText: read(text) },
    { languageId: 'markdown', uri: { scheme: 'file', path: '/folder/other.md' }, getText: read('# Other') },
    { languageId: 'markdown', uri: { scheme: 'git', path: '/folder/a.md' }, getText: read(text) },
  ];
  // The rendered diff marks the changes in the text of a side with changes.
  md.render(text.replace('Car', '<span data-diff-start="0"></span>Car<span data-diff-end="0"></span>'));
  expect(requests).toEqual([
    [settingsSection, '/folder/a.md'],
    [settingsSection, '/folder/a.md'],
  ]);
  // The search runs once for the rendering, not once for each block.
  expect(reads).toBe(2);

  // A text that no open Markdown document has gets the settings of the window.
  md.render('```plantuml\nclass Car\n```\n');
  expect(requests.at(-1)).toEqual([settingsSection, '']);
});

test('the export reads the settings of a version of a file in Git from the workspace folder of the file', async () => {
  const { api } = await activate();
  const md = api.extendMarkdownIt(new MarkdownIt());
  workspaceFolders = [{ uri: { scheme: 'file', path: '/other' } }, { uri: { scheme: 'file', path: '/folder' } }];
  settingsOf.set('/folder', { umlNotation: false });
  // VS Code finds no workspace folder for an address with the scheme git; the extension finds it by the path.
  const original: FakeUri = { scheme: 'git', path: '/folder/a.md' };
  expect(md.render(block, { currentDocument: original })).toContain(`${settingsAttribute}="{&quot;umlNotation&quot;:false}"`);
  expect(requests).toEqual([[settingsSection, '/folder']]);

  // A file of a workspace folder, and a file outside all workspace folders, are read as they are.
  md.render(block, { currentDocument: { scheme: 'file', path: '/folder/a.md' } });
  md.render(block, { currentDocument: { scheme: 'git', path: '/elsewhere/a.md' } });
  expect(requests.slice(1)).toEqual([
    [settingsSection, '/folder/a.md'],
    [settingsSection, '/elsewhere/a.md'],
  ]);
});

test('the export adds the included files of a block, and a change of a file that it includes refreshes the Markdown previews', async () => {
  const { api } = await activate();
  const md = api.extendMarkdownIt(new MarkdownIt());
  expect(md.render(block)).not.toContain(includesClass);
  // A text without a document has no folder for the paths of its included files.
  const problem = 'The document is not saved in a folder, so the extension cannot find the included file a.puml.';
  expect(md.render('```plantuml\n!include a.puml\nclass A\n```\n')).toContain(
    `<div class="${includesClass}" hidden>{&quot;a.puml&quot;:{&quot;problem&quot;:&quot;${problem}&quot;}}</div>`,
  );
  // The Markdown previews and the previews of PlantUML files each have a reader of included files, in this order.
  const [markdownReader, pumlReader] = emitters;
  expect(emitters).toHaveLength(2);
  pumlReader.fire();
  expect(commands).toEqual([]);
  markdownReader.fire();
  expect(commands).toEqual(['markdown.preview.refresh']);
});

test('every registration goes into the subscriptions of the context, so that VS Code removes it on deactivation', async () => {
  const { context } = await activate();
  expect(disposables.length).toBeGreaterThan(0);
  expect(disposables.every((registration) => context.subscriptions.includes(registration))).toBe(true);
  // The other subscriptions are the readers of the included files, which stop the watchers of the files.
  const others = context.subscriptions.filter((subscription) => !disposables.includes(subscription));
  expect(others.map((other) => other.constructor.name)).toEqual(['IncludeFiles', 'IncludeFiles']);
});

/**
 * changeSetting tells the listeners that the settings of a section changed.
 * @param changed - The section of the changed settings.
 */
const changeSetting = (changed: string) =>
  configurationListeners.forEach((listener) => listener({ affectsConfiguration: (section) => section === changed }));

test('a change of a setting of the extension refreshes the Markdown previews, a change of another setting does not', async () => {
  await activate();
  changeSetting('editor');
  expect(commands).toEqual([]);
  changeSetting(settingsSection);
  expect(commands).toEqual(['markdown.preview.refresh']);
});

test('a change of a setting does not start the Markdown extension, and a failed refresh is no error but a warning', async () => {
  await activate();
  markdownActive = false;
  changeSetting(settingsSection);
  expect(commands).toEqual([]);

  // An unhandled rejection would fail the test run.
  markdownActive = true;
  refreshFails = true;
  changeSetting(settingsSection);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(commands).toEqual(['markdown.preview.refresh']);
  expect(logged).toEqual(['The Markdown previews could not render again: command not found']);
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
  return providers.get(language)!.provider.provideCompletionItems(document, position)?.items;
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

test('the completion list is incomplete, so that VS Code asks again and closes it after a complete word', async () => {
  await activate();
  const provider = providers.get('plantuml')!.provider;
  const document = { version: 1, getText: () => '@startuml\n' };
  expect(provider.provideCompletionItems(document, { line: 0, character: 1 })).toMatchObject({ isIncomplete: true });
  expect(provider.provideCompletionItems(document, { line: 0, character: 1 })!.items.length).toBeGreaterThan(0);
  expect(provider.provideCompletionItems(document, { line: 0, character: 9 })!.items).toEqual([]);
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

test('the completion and the formatting work in a PlantUML block in a block quote, and keep its markers', async () => {
  await activate();
  const quote = ['> ```plantuml', '> package p {', '> class Car', '>', '> }', '> C‸', '> ```'];
  const items = completeIn('markdown', quote.join('\n'))!;
  expect(items.map((item) => item.label)).toContain('Car');
  expect(items[0].range!.replacing).toEqual(new FakeRange(5, 2, 5, 3));

  // In the marker of the block quote, the completion proposes nothing.
  expect(completeIn('markdown', quote.join('\n').replace('> C‸', '‸> C'))).toBeUndefined();

  const document = textDocument(quote.join('\n').replace('‸', ''));
  expect(formatters.get('markdown document')!.provideDocumentFormattingEdits!(document, spaces)).toEqual([
    { range: new FakeRange(2, 0, 2, 11), newText: '>   class Car' },
  ]);

  // A block whose prefix markdown-it changed, here a tab in a list item, stays as it is.
  const tab = textDocument(['- item', '', '  ```plantuml', '  package p {', '\tclass A', '  }', '  ```'].join('\n'));
  expect(formatters.get('markdown document')!.provideDocumentFormattingEdits!(tab, spaces)).toEqual([]);
});

/** markdownText is a Markdown text with a PlantUML block that the formatting changes, and a JavaScript block. */
const markdownText = ['# Title   ', '```plantuml', 'package p {', 'class A', '}', '```', '```js', 'if (a) {', 'b', '}', '```'].join('\n');

/**
 * markdownDocument returns a fake Markdown document with a text.
 * @param text - The text.
 */
const markdownDocument = (text: string) => ({ ...textDocument(text), languageId: 'markdown' });

test('the command "Format PlantUML Blocks" formats the PlantUML blocks of the Markdown file of the active editor', async () => {
  const { extension } = await activate();
  const replaced: [FakeRange, string][] = [];
  const edit = async (callback: Parameters<NonNullable<FakeEditor['edit']>>[0]) => {
    callback({ replace: (range, text) => replaced.push([range, text]) });
    return true;
  };
  activeEditor = { document: markdownDocument(markdownText), selections: [], options: { tabSize: 4, insertSpaces: true }, edit };
  await registeredCommands.get(extension.formatBlocksCommand)!();
  expect(replaced).toEqual([[new FakeRange(3, 0, 3, 7), '    class A']]);

  // The command changes nothing in a file of another language.
  replaced.length = 0;
  activeEditor = { ...activeEditor, document: { ...markdownDocument(markdownText), languageId: 'plaintext' } };
  await registeredCommands.get(extension.formatBlocksCommand)!();
  expect(replaced).toEqual([]);
});

/**
 * save sends the event of a save of a document and returns the edits that the extension makes before the save.
 * @param document - The document.
 * @param reason - The reason of the save: 1 by the user, 2 after a delay.
 */
async function save(document: FakeSaveEvent['document'], reason = 1): Promise<FakeEdit[]> {
  const edits: Promise<FakeEdit[]>[] = [];
  saveListeners.forEach((listener) => listener({ document, reason, waitUntil: (promise) => edits.push(promise) }));
  return (await Promise.all(edits)).flat();
}

test('a save formats the PlantUML blocks of a Markdown file when editor.formatOnSave is on, with the settings of the indentation', async () => {
  await activate();
  const document = markdownDocument(markdownText);
  expect(await save(document)).toEqual([]);

  settingsOf.set('', { formatOnSave: true, tabSize: 3, insertSpaces: true });
  expect(await save(document)).toEqual([{ range: new FakeRange(3, 0, 3, 7), newText: '   class A' }]);

  // An automatic save after a delay and a file of another language keep their text, as with VS Code's own formatting.
  expect(await save(document, 2)).toEqual([]);
  expect(await save({ ...document, languageId: 'plantuml' })).toEqual([]);

  // When VS Code formats the changed lines only, the extension, which does not know them, formats nothing.
  for (const mode of ['modifications', 'modificationsIfAvailable']) {
    settingsOf.set('', { formatOnSave: true, formatOnSaveMode: mode });
    expect(await save(document), mode).toEqual([]);
  }
  settingsOf.set('', { formatOnSave: true, formatOnSaveMode: 'file' });
  expect(await save(document)).toHaveLength(1);
});
