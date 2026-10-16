// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the previews of PlantUML files with a fake of the API of
 * VS Code: the switch between the text and the preview in one tab
 * (R-PUML-002), the messages to the page while the user types (R-PUML-002,
 * R-PUML-003), the preview to the side and the file that it shows
 * (R-PUML-003), the switch between a diff and its rendered diff
 * (R-PUML-004), the restore after a restart, and the documents that VS Code
 * closes and opens again.
 */

import { beforeEach, expect, test, vi } from 'vitest';
import { defaultSettings } from './settings';

/** FakeUri stands for a vscode.Uri. */
class FakeUri {
  constructor(
    readonly scheme: string,
    readonly path: string,
  ) {}

  static parse(text: string): FakeUri {
    const [scheme, path] = text.split(':');
    return new FakeUri(scheme, path);
  }

  static joinPath(base: FakeUri, ...parts: string[]): FakeUri {
    return new FakeUri(base.scheme, [base.path, ...parts].join('/'));
  }

  toString(): string {
    return `${this.scheme}:${this.path}`;
  }
}

/** FakeDocument stands for a vscode.TextDocument. */
class FakeDocument {
  constructor(
    readonly uri: FakeUri,
    public text: string,
    readonly languageId = 'plantuml',
  ) {}

  getText(): string {
    return this.text;
  }
}

/** FakeWebview stands for a vscode.Webview; it records the posted messages. */
class FakeWebview {
  options: unknown;
  html = '';
  readonly cspSource = 'https://webview';
  readonly posted: Record<string, unknown>[] = [];
  readonly listeners: ((message: unknown) => void)[] = [];

  asWebviewUri(uri: FakeUri): FakeUri {
    return uri;
  }

  async postMessage(message: Record<string, unknown>): Promise<boolean> {
    this.posted.push(message);
    return true;
  }

  onDidReceiveMessage(listener: (message: unknown) => void) {
    this.listeners.push(listener);
    return { dispose: () => this.listeners.splice(this.listeners.indexOf(listener), 1) };
  }

  /** ready sends the message of a page that is ready. */
  ready(): void {
    this.listeners.forEach((listener) => listener({ type: 'ready' }));
  }
}

/** FakePanel stands for a vscode.WebviewPanel. */
class FakePanel {
  readonly webview = new FakeWebview();
  active = false;
  disposed = false;
  readonly disposeListeners: (() => void)[] = [];
  /** reveals records the arguments of each call of reveal. */
  readonly reveals: unknown[][] = [];

  constructor(
    readonly viewType: string,
    public title: string,
    readonly viewColumn: number,
  ) {}

  onDidDispose(listener: () => void) {
    this.disposeListeners.push(listener);
    return { dispose() {} };
  }

  dispose(): void {
    this.disposed = true;
    this.disposeListeners.forEach((listener) => listener());
  }

  reveal(...args: unknown[]): void {
    this.reveals.push(args);
  }
}

/** FakeTabInputCustom stands for a vscode.TabInputCustom. */
class FakeTabInputCustom {
  constructor(
    readonly uri: FakeUri,
    readonly viewType: string,
  ) {}
}

/** FakeTabInputTextDiff stands for a vscode.TabInputTextDiff. */
class FakeTabInputTextDiff {
  constructor(
    readonly original: FakeUri,
    readonly modified: FakeUri,
  ) {}
}

/** FakeTab stands for a vscode.Tab. */
interface FakeTab {
  input: unknown;
  label: string;
  group: { viewColumn: number };
}

let documents: Map<string, FakeDocument>;
/** closed holds the addresses of the documents that VS Code has closed; openTextDocument opens them again. */
let closed: Set<string>;
let activeTab: FakeTab | undefined;
let closedTabs: FakeTab[];
let panels: FakePanel[];
let executed: unknown[][];
let changeListeners: ((event: { document: FakeDocument }) => void)[];
/** activeEditor is the active text editor of the fake. */
let activeEditor: { document: FakeDocument } | undefined;
/** editorListeners are the listeners for a change of the active text editor. */
let editorListeners: ((editor: { document: FakeDocument } | undefined) => void)[];

beforeEach(() => {
  vi.resetModules();
  documents = new Map();
  closed = new Set();
  activeTab = undefined;
  closedTabs = [];
  panels = [];
  executed = [];
  changeListeners = [];
  activeEditor = undefined;
  editorListeners = [];
  vi.doMock('vscode', () => ({
    Uri: FakeUri,
    ViewColumn: { Beside: -2 },
    TabInputCustom: FakeTabInputCustom,
    TabInputTextDiff: FakeTabInputTextDiff,
    workspace: {
      get textDocuments() {
        return [...documents.values()].filter((document) => !closed.has(document.uri.toString()));
      },
      openTextDocument: async (uri: FakeUri) => {
        const document = documents.get(uri.toString());
        if (!document) {
          throw new Error(`cannot open ${uri.toString()}`);
        }
        closed.delete(uri.toString());
        return document;
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
      tabGroups: {
        get activeTabGroup() {
          return { activeTab };
        },
        close: async (tab: FakeTab) => {
          closedTabs.push(tab);
          return true;
        },
      },
      createWebviewPanel: (viewType: string, title: string, column: number | { viewColumn: number }) => {
        const panel = new FakePanel(viewType, title, typeof column === 'number' ? column : column.viewColumn);
        panels.push(panel);
        return panel;
      },
      registerCustomEditorProvider: () => ({ dispose() {} }),
      registerWebviewPanelSerializer: () => ({ dispose() {} }),
      onDidChangeActiveTextEditor: (listener: (typeof editorListeners)[number]) => {
        editorListeners.push(listener);
        return { dispose() {} };
      },
    },
    commands: {
      executeCommand: async (...args: unknown[]) => {
        executed.push(args);
      },
      registerCommand: () => ({ dispose() {} }),
    },
  }));
});

/** previews imports the module with the fake API and returns the previews, with the default settings. */
const previews = async () => {
  const module = await import('./pumlPreviews');
  const instance = new module.PumlPreviews(new FakeUri('file', '/extension') as never, () => defaultSettings);
  instance.register();
  return { module, instance };
};

/**
 * addDocument adds a document to the fake workspace.
 * @param address - The address of the document.
 * @param text - The text of the document.
 */
const addDocument = (address: string, text: string): FakeDocument => {
  const document = new FakeDocument(FakeUri.parse(address), text);
  documents.set(address, document);
  return document;
};

/**
 * change changes the text of a document and tells the listeners.
 * @param document - The document.
 * @param text - The new text.
 */
const change = (document: FakeDocument, text: string) => {
  document.text = text;
  changeListeners.forEach((listener) => listener({ document }));
};

test('the toggle switches the tab of a PlantUML file between the text and the preview', async () => {
  const { module, instance } = await previews();
  activeTab = { input: {}, label: 'a.puml', group: { viewColumn: 1 } };
  await instance.togglePreview();
  activeTab = { input: new FakeTabInputCustom(FakeUri.parse('file:/a.puml'), module.previewViewType), label: 'a.puml', group: { viewColumn: 1 } };
  await instance.togglePreview();
  expect(executed).toEqual([
    ['reopenActiveEditorWith', module.previewViewType],
    ['reopenActiveEditorWith', 'default'],
  ]);
});

test('a preview gets the text and the settings when its page is ready, and again after each change of its document', async () => {
  const { instance } = await previews();
  const document = addDocument('file:/a.puml', '@startuml\nA\n@enduml');
  const other = addDocument('file:/b.puml', 'B');
  const panel = new FakePanel('nimblescape.plantuml.preview', 'a.puml', 1);
  instance.resolveCustomTextEditor(document as never, panel as never);
  expect(panel.webview.html).toContain("script-src 'nonce-");
  expect(panel.webview.html).toContain('file:/extension/dist/pumlPreview.js');
  change(document, 'A1');
  expect(panel.webview.posted).toEqual([]);

  panel.webview.ready();
  change(document, 'A2');
  change(other, 'B2');
  instance.refreshAll();
  expect(panel.webview.posted).toEqual([
    { type: 'update', text: 'A1', settings: defaultSettings, state: { uri: 'file:/a.puml' } },
    { type: 'update', text: 'A2', settings: defaultSettings, state: { uri: 'file:/a.puml' } },
    { type: 'update', text: 'A2', settings: defaultSettings, state: { uri: 'file:/a.puml' } },
  ]);

  panel.dispose();
  change(document, 'A3');
  expect(panel.webview.posted).toHaveLength(3);
});

test('the preview to the side opens next to the active PlantUML file, keeps the focus in the text, and follows its changes', async () => {
  const { module, instance } = await previews();
  const document = addDocument('file:/a.puml', 'A');
  activeEditor = { document };
  await instance.showPreviewToSide();
  const [panel] = panels;
  expect(panel).toMatchObject({ viewType: module.sidePreviewViewType, title: 'Preview a.puml', viewColumn: -2 });

  panel.webview.ready();
  change(document, 'A2');
  expect(panel.webview.posted).toEqual([
    { type: 'update', text: 'A', settings: defaultSettings, state: { uri: 'file:/a.puml' } },
    { type: 'update', text: 'A2', settings: defaultSettings, state: { uri: 'file:/a.puml' } },
  ]);
});

test('the preview to the side shows the PlantUML file of each newly active text editor, and no other file', async () => {
  const { instance } = await previews();
  const first = addDocument('file:/a.puml', 'A');
  const second = addDocument('file:/b.puml', 'B');
  activeEditor = { document: first };
  await instance.showPreviewToSide();
  const [panel] = panels;
  panel.webview.ready();

  editorListeners.forEach((listener) => listener({ document: second }));
  expect(panel.title).toBe('Preview b.puml');
  expect(panel.webview.posted.at(-1)).toEqual({ type: 'update', text: 'B', settings: defaultSettings, state: { uri: 'file:/b.puml' } });

  // A Markdown file, no active text editor, and a change of the file that the preview no longer shows change nothing.
  editorListeners.forEach((listener) => listener({ document: new FakeDocument(FakeUri.parse('file:/c.md'), 'C', 'markdown') }));
  editorListeners.forEach((listener) => listener(undefined));
  change(first, 'A2');
  expect(panel.webview.posted).toHaveLength(2);
  expect(panel.title).toBe('Preview b.puml');
});

test('the command opens one preview to the side: with another file, it shows that file in the open preview and reveals it', async () => {
  const { instance } = await previews();
  activeEditor = { document: addDocument('file:/a.puml', 'A') };
  await instance.showPreviewToSide();
  const second = addDocument('file:/b.puml', 'B');
  await instance.showPreviewToSide(second.uri as never);
  expect(panels).toHaveLength(1);
  expect(panels[0].title).toBe('Preview b.puml');
  expect(panels[0].reveals).toEqual([[-2, true]]);

  // After the preview to the side closed, the command opens a new one.
  panels[0].dispose();
  await instance.showPreviewToSide();
  expect(panels).toHaveLength(2);
  expect(panels[1].title).toBe('Preview a.puml');
});

test('in the preview of a tab, the command opens the preview to the side of its file; without a PlantUML file it does nothing', async () => {
  const { module, instance } = await previews();
  activeEditor = { document: new FakeDocument(FakeUri.parse('file:/c.md'), 'C', 'markdown') };
  activeTab = { input: {}, label: 'c.md', group: { viewColumn: 1 } };
  await instance.showPreviewToSide();
  expect(panels).toEqual([]);

  activeEditor = undefined;
  activeTab = { input: new FakeTabInputCustom(FakeUri.parse('file:/a.puml'), module.previewViewType), label: 'a.puml', group: { viewColumn: 1 } };
  await instance.showPreviewToSide();
  expect(panels.map((panel) => panel.title)).toEqual(['Preview a.puml']);
});

test('in a diff, the toggle replaces the diff with its rendered diff, and the rendered diff with the diff', async () => {
  const { module, instance } = await previews();
  const original = addDocument('git:/a.puml', '@startuml\nA\n@enduml');
  const modified = addDocument('file:/a.puml', '@startuml\nA2\n@enduml');
  const diffTab = { input: new FakeTabInputTextDiff(original.uri, modified.uri), label: 'a.puml (Working Tree)', group: { viewColumn: 2 } };
  activeTab = diffTab;
  await instance.togglePreview();
  expect(closedTabs).toEqual([diffTab]);
  const [panel] = panels;
  expect(panel).toMatchObject({ viewType: module.diffPreviewViewType, title: 'Preview a.puml (Working Tree)', viewColumn: 2 });

  panel.webview.ready();
  change(original, '@startuml\nA0\n@enduml');
  const state = { uri: 'file:/a.puml', original: 'git:/a.puml', label: 'a.puml (Working Tree)' };
  expect(panel.webview.posted).toEqual([
    { type: 'update', text: '@startuml\nA2\n@enduml', original: '@startuml\nA\n@enduml', settings: defaultSettings, state },
    { type: 'update', text: '@startuml\nA2\n@enduml', original: '@startuml\nA0\n@enduml', settings: defaultSettings, state },
  ]);

  panel.active = true;
  activeTab = { input: {}, label: panel.title, group: { viewColumn: 2 } };
  await instance.togglePreview();
  expect(executed).toEqual([['vscode.diff', original.uri, modified.uri, 'a.puml (Working Tree)', { viewColumn: 2 }]]);
  expect(panel.disposed).toBe(true);
});

test('a second press of the toggle while the first switch runs switches the tab once', async () => {
  const { instance } = await previews();
  const original = addDocument('git:/a.puml', 'A');
  const modified = addDocument('file:/a.puml', 'A2');
  const diffTab = { input: new FakeTabInputTextDiff(original.uri, modified.uri), label: 'a.puml', group: { viewColumn: 1 } };
  activeTab = diffTab;
  await Promise.all([instance.togglePreview(), instance.togglePreview(), instance.reopenAsPreview()]);
  expect(panels).toHaveLength(1);
  expect(closedTabs).toEqual([diffTab]);

  // After the switch, the toggle works again.
  panels[0].active = true;
  await instance.togglePreview();
  expect(panels[0].disposed).toBe(true);
});

test('a rendered diff and the preview to the side come back after a restart, and a panel without a valid state closes', async () => {
  const { module, instance } = await previews();
  addDocument('git:/a.puml', 'A');
  addDocument('file:/a.puml', 'A2');
  const diff = new FakePanel(module.diffPreviewViewType, 'Preview a.puml', 1);
  await instance.deserializeWebviewPanel(diff as never, { uri: 'file:/a.puml', original: 'git:/a.puml', label: 'a.puml (Working Tree)' });
  diff.webview.ready();
  expect(diff.webview.posted[0]).toMatchObject({ text: 'A2', original: 'A' });

  const side = new FakePanel(module.sidePreviewViewType, 'Preview a.puml', 2);
  await instance.deserializeWebviewPanel(side as never, { uri: 'file:/a.puml' });
  side.webview.ready();
  expect(side.webview.posted[0]).toMatchObject({ text: 'A2' });
  expect(side.webview.posted[0]).not.toHaveProperty('original');

  const broken = new FakePanel(module.diffPreviewViewType, 'Preview a.puml', 1);
  await instance.deserializeWebviewPanel(broken as never, { uri: 'file:/a.puml' });
  expect(broken.disposed).toBe(true);

  const deleted = new FakePanel(module.sidePreviewViewType, 'Preview gone.puml', 2);
  await instance.deserializeWebviewPanel(deleted as never, { uri: 'file:/gone.puml' });
  expect(deleted.disposed).toBe(true);

  // There is one preview to the side: a second restored one replaces the first.
  const second = new FakePanel(module.sidePreviewViewType, 'Preview a.puml', 2);
  await instance.deserializeWebviewPanel(second as never, { uri: 'file:/a.puml' });
  expect(side.disposed).toBe(true);
  expect(second.disposed).toBe(false);
});

test('a rendered diff follows its files after VS Code has closed their documents and opened new ones', async () => {
  const { instance } = await previews();
  const original = addDocument('git:/a.puml', 'A');
  addDocument('file:/a.puml', 'A2');
  activeTab = { input: new FakeTabInputTextDiff(original.uri, FakeUri.parse('file:/a.puml')), label: 'a.puml', group: { viewColumn: 1 } };
  await instance.togglePreview();
  const [panel] = panels;
  panel.webview.ready();

  // VS Code closes a document that no editor shows, and a later change of the file reaches a new document.
  const reopened = addDocument('file:/a.puml', 'A3');
  change(reopened, 'A4');
  expect(panel.webview.posted.at(-1)).toMatchObject({ text: 'A4', original: 'A' });

  // While a document is closed, the preview opens it again to read its text.
  closed.add('git:/a.puml');
  instance.refreshAll();
  await vi.waitFor(() => expect(panel.webview.posted).toHaveLength(3));
  expect(panel.webview.posted.at(-1)).toMatchObject({ text: 'A4', original: 'A' });
});
