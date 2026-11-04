// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the command of the SVG export with a fake of the API of
 * VS Code and of the page of the export: the file that it exports (R-GEN-003),
 * the blocks of a Markdown file and the text of a PlantUML file that it sends
 * to the page with their settings and included files (R-GEN-007, R-GEN-008),
 * the names of the files next to the file (R-MD-008, R-PUML-009), the
 * messages and the log, and an export that stops. The settings of the tests
 * differ from the default settings, so that the tests see them.
 * `src/preview/svgExportPage.test.ts` tests the page.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { ExportedDiagram, ExportMessage, PageMessage } from './preview/svgExportPage';
import type { IncludesLoader } from './pumlPreviews';

/** FakeUri stands for a vscode.Uri. */
class FakeUri {
  constructor(
    readonly scheme: string,
    readonly path: string,
  ) {}

  static joinPath(base: FakeUri, ...parts: string[]): FakeUri {
    return new FakeUri(base.scheme, [base.path, ...parts].join('/'));
  }

  with(change: { path?: string }): FakeUri {
    return new FakeUri(this.scheme, change.path ?? this.path);
  }

  toString(): string {
    return `${this.scheme}:${this.path}`;
  }
}

/** FakeTabInputCustom stands for a vscode.TabInputCustom. */
class FakeTabInputCustom {
  constructor(
    readonly uri: FakeUri,
    readonly viewType: string,
  ) {}
}

/** FakeWebview stands for a vscode.Webview; the page of the test answers the messages of the extension. */
class FakeWebview {
  html = '';
  readonly cspSource = 'https://webview';
  readonly posted: unknown[] = [];
  readonly listeners: ((message: unknown) => void)[] = [];

  asWebviewUri(uri: FakeUri): FakeUri {
    return uri;
  }

  async postMessage(message: unknown): Promise<boolean> {
    this.posted.push(message);
    setTimeout(() => page(message as ExportMessage, (answer) => this.send(answer)), 0);
    return true;
  }

  onDidReceiveMessage(listener: (message: unknown) => void) {
    this.listeners.push(listener);
    return { dispose: () => this.listeners.splice(this.listeners.indexOf(listener), 1) };
  }

  /** send sends a message of the page to the extension. */
  send(message: unknown): void {
    [...this.listeners].forEach((listener) => listener(message));
  }
}

/** FakePanel stands for a vscode.WebviewPanel. */
class FakePanel {
  readonly webview = new FakeWebview();
  disposed = false;
  readonly disposeListeners: (() => void)[] = [];

  constructor(
    readonly viewType: string,
    readonly title: string,
    readonly showOptions: unknown,
    readonly options: unknown,
  ) {}

  onDidDispose(listener: () => void) {
    this.disposeListeners.push(listener);
    return { dispose: () => this.disposeListeners.splice(this.disposeListeners.indexOf(listener), 1) };
  }

  dispose(): void {
    if (!this.disposed) {
      this.disposed = true;
      [...this.disposeListeners].forEach((listener) => listener());
    }
  }
}

/** FakeDocument stands for a vscode.TextDocument. */
interface FakeDocument {
  uri: FakeUri;
  languageId: string;
  getText(): string;
}

/** documents are the documents of the fake workspace, by the address of their file. */
let documents: Map<string, FakeDocument>;
/** written are the files that the export wrote, by their address, with their text. */
let written: Map<string, string>;
/** writeFails makes each write of a file fail. */
let writeFails: boolean;
/** panels are the webview panels that the export created. */
let panels: FakePanel[];
/** messages are the messages that the export showed, as `<kind>: <text>`. */
let messages: string[];
/** choice is the button that the user clicks in a warning. */
let choice: string | undefined;
/** logged are the lines of the log, as `<level>: <text>`. */
let logged: string[];
/** progress records the increments of the progress of the export. */
let progress: number[];
/** cancel holds the listener of the cancellation of the running export. */
let cancel: (() => void) | undefined;
/** activeDocument is the document of the active text editor. */
let activeDocument: FakeDocument | undefined;
/** activeInput is the input of the active tab. */
let activeInput: unknown;
/** page answers a message of the extension to the page of the export, by sending messages of the page. */
let page: (message: ExportMessage, send: (answer: PageMessage) => void) => void;
/** registered holds the handlers of the registered commands, by their names. */
let registered: Map<string, (...args: unknown[]) => unknown>;
/** pageStarts tells whether the page of a new panel starts and sends `ready`. */
let pageStarts: boolean;

/**
 * pageAnswers returns a page that sends the given diagrams for each block, and then `done`.
 * @param diagrams - The diagrams of each block.
 */
const pageAnswers =
  (diagrams: (ExportedDiagram[] | unknown)[]) =>
  (message: ExportMessage, send: (answer: PageMessage) => void): void => {
    if (message.type !== 'export') {
      return;
    }
    message.blocks.forEach((_, index) => send({ type: 'block', index, diagrams: diagrams[index] as ExportedDiagram[] }));
    send({ type: 'done' });
  };

/**
 * svg returns the SVG file text of a diagram for the fake page.
 * @param name - A name in the text.
 */
const svg = (name: string): string => `<?xml version="1.0"?>\n<svg>${name}</svg>\n`;

beforeEach(() => {
  documents = new Map();
  written = new Map();
  writeFails = false;
  panels = [];
  messages = [];
  choice = undefined;
  logged = [];
  progress = [];
  cancel = undefined;
  activeDocument = undefined;
  activeInput = undefined;
  registered = new Map();
  page = () => undefined;
  pageStarts = true;
  vi.resetModules();
  vi.doMock('vscode', () => ({
    Uri: FakeUri,
    TabInputCustom: FakeTabInputCustom,
    ViewColumn: { Beside: -2 },
    ProgressLocation: { Notification: 15 },
    commands: {
      registerCommand: (command: string, handler: (...args: unknown[]) => unknown) => {
        registered.set(command, handler);
        return { dispose() {} };
      },
    },
    workspace: {
      openTextDocument: async (uri: FakeUri) => {
        const document = documents.get(uri.toString());
        if (!document) {
          throw new Error(`cannot open ${uri.toString()}`);
        }
        return document;
      },
      fs: {
        writeFile: async (uri: FakeUri, bytes: Uint8Array) => {
          if (writeFails) {
            throw new Error('read-only file system');
          }
          written.set(uri.toString(), new TextDecoder().decode(bytes));
        },
      },
    },
    window: {
      get activeTextEditor() {
        return activeDocument && { document: activeDocument };
      },
      tabGroups: {
        get activeTabGroup() {
          return { activeTab: activeInput === undefined ? undefined : { input: activeInput } };
        },
      },
      createWebviewPanel: (viewType: string, title: string, showOptions: unknown, options: unknown) => {
        const panel = new FakePanel(viewType, title, showOptions, options);
        panels.push(panel);
        // The page of the export is ready after a turn of the event loop.
        if (pageStarts) {
          setTimeout(() => panel.webview.send({ type: 'ready' }), 0);
        }
        return panel;
      },
      withProgress: (_options: unknown, task: (progress: unknown, token: unknown) => unknown) =>
        task(
          { report: ({ increment }: { increment: number }) => progress.push(increment) },
          {
            onCancellationRequested: (listener: () => void) => {
              cancel = listener;
              return { dispose: () => (cancel = undefined) };
            },
          },
        ),
      showErrorMessage: async (text: string) => messages.push(`error: ${text}`),
      showInformationMessage: async (text: string) => messages.push(`info: ${text}`),
      showWarningMessage: async (text: string, ...buttons: string[]) => {
        messages.push(`warning: ${text}${buttons.length > 0 ? ` [${buttons.join(', ')}]` : ''}`);
        return choice;
      },
    },
  }));
});

/**
 * addDocument adds a document to the fake workspace.
 * @param path - The path of its file.
 * @param languageId - Its language.
 * @param text - Its text.
 */
function addDocument(path: string, languageId: string, text: string): FakeDocument {
  const document = { uri: new FakeUri('file', path), languageId, getText: () => text };
  documents.set(document.uri.toString(), document);
  return document;
}

/**
 * exporter imports the export with the fake API and returns it with its command.
 * @param includes - Reads the files that the diagrams of a text include.
 */
async function exporter(includes: IncludesLoader = () => undefined) {
  const { SvgExport, exportSvgCommand, readyTimeout } = await import('./svgExport');
  const log = { info: (text: string) => logged.push(`info: ${text}`), warn: (text: string) => logged.push(`warn: ${text}`), show: () => logged.push('show') };
  const svgExport = new SvgExport(new FakeUri('file', '/extension') as never, () => ({ umlNotation: false }), includes, log as never);
  svgExport.register();
  return { svgExport, command: registered.get(exportSvgCommand)!, readyTimeout };
}

/** markdown is a Markdown file with two PlantUML blocks and a blank one. */
const markdown = ['# Notes', '', '```plantuml', 'Alice -> Bob', '```', '', '```plantuml', '', '```', '', '- item', '  ```plantuml', '  class Car', '  ```'].join('\n');

describe('sourceBlocks', () => {
  test('is the text of a PlantUML file, and the blocks of a Markdown file with the line of their fences, without blank blocks', async () => {
    const { sourceBlocks } = await import('./svgExport');
    expect(sourceBlocks({ languageId: 'plantuml', getText: () => '@startuml\nA -> B\n@enduml' })).toEqual([{ text: '@startuml\nA -> B\n@enduml' }]);
    expect(sourceBlocks({ languageId: 'plantuml', getText: () => ' \n' })).toEqual([]);
    expect(sourceBlocks({ languageId: 'markdown', getText: () => markdown })).toEqual([
      { text: 'Alice -> Bob', fence: 3 },
      { text: 'class Car', fence: 12 },
    ]);
    expect(sourceBlocks({ languageId: 'markdown', getText: () => '# Notes' })).toEqual([]);
    expect(sourceBlocks({ languageId: 'javascript', getText: () => '' })).toBeUndefined();
  });
});

describe('the command "Export Diagrams as SVG"', () => {
  test('writes the diagrams of a Markdown file next to it, named by the file and the type of each diagram', async () => {
    const document = addDocument('/work/notes.md', 'markdown', markdown);
    page = pageAnswers([[{ svg: svg('one'), type: 'sequence' }], [{ svg: svg('two'), type: 'class' }]]);
    const { command } = await exporter((_document, text) => (text.includes('Car') ? { 'car.puml': { text: 'class Car' } } : undefined));
    await command(document.uri);
    expect([...written]).toEqual([
      ['file:/work/notes-sequence.svg', svg('one')],
      ['file:/work/notes-class.svg', svg('two')],
    ]);
    expect(messages).toEqual(['info: The export wrote 2 SVG files next to notes.md: notes-sequence.svg, notes-class.svg.']);
    // The page got each block with the settings of the file and its included files, and its tab closed.
    expect(panels).toHaveLength(1);
    expect(panels[0].viewType).toBe('nimblescape.plantuml.svgExport');
    expect(panels[0].title).toBe('Export notes.md');
    expect(panels[0].showOptions).toEqual({ viewColumn: -2, preserveFocus: true });
    expect(panels[0].options).toMatchObject({ enableScripts: true, enableForms: false, retainContextWhenHidden: true });
    expect(panels[0].webview.html).toContain('/extension/dist/svgExport.js');
    expect(panels[0].webview.posted).toEqual([
      {
        type: 'export',
        blocks: [
          { text: 'Alice -> Bob', settings: { umlNotation: false } },
          { text: 'class Car', settings: { umlNotation: false }, includes: { 'car.puml': { text: 'class Car' } } },
        ],
      },
    ]);
    expect(panels[0].disposed).toBe(true);
    expect(progress).toEqual([50, 50]);
    expect(logged).toEqual(['info: The SVG export of notes.md wrote file:/work/notes-sequence.svg.', 'info: The SVG export of notes.md wrote file:/work/notes-class.svg.']);
  });

  test('names the file of a Markdown file with one diagram by the Markdown file, and waits for the included files', async () => {
    const document = addDocument('/work/notes.md', 'markdown', '```plantuml\n!include parts.puml\nclass Car\n```');
    page = pageAnswers([[{ svg: svg('one'), type: 'class' }]]);
    const { command } = await exporter(async () => ({ 'parts.puml': { text: 'class Wheel' } }));
    await command(document.uri);
    expect([...written.keys()]).toEqual(['file:/work/notes.svg']);
    expect((panels[0].webview.posted[0] as ExportMessage).blocks[0].includes).toEqual({ 'parts.puml': { text: 'class Wheel' } });
  });

  test('writes the diagrams of a PlantUML file next to it, numbered from the second diagram of a type on', async () => {
    const document = addDocument('/work/shapes.puml', 'plantuml', '@startuml\nA -> B\n@enduml\n@startuml\nB -> C\n@enduml\n@startmindmap\n* a\n@endmindmap');
    page = pageAnswers([
      [
        { svg: svg('1'), type: 'sequence' },
        { svg: svg('2'), type: 'sequence' },
        { svg: svg('3'), type: 'mindmap' },
      ],
    ]);
    const { command } = await exporter();
    await command(document.uri);
    expect([...written.keys()]).toEqual(['file:/work/shapes-sequence.svg', 'file:/work/shapes-sequence-2.svg', 'file:/work/shapes-mindmap.svg']);
    expect((panels[0].webview.posted[0] as ExportMessage).blocks).toEqual([{ text: document.getText(), settings: { umlNotation: false } }]);
  });

  test('names the file of a PlantUML file with one diagram by the PlantUML file', async () => {
    const document = addDocument('/work/shapes.puml', 'plantuml', 'class Car');
    page = pageAnswers([[{ svg: svg('1'), type: 'class' }]]);
    const { command } = await exporter();
    await command(document.uri);
    expect([...written.keys()]).toEqual(['file:/work/shapes.svg']);
  });

  test('writes no file for a diagram with an error, and names the error in the log', async () => {
    const document = addDocument('/work/notes.md', 'markdown', markdown);
    page = pageAnswers([[{ error: 'Line 1: Syntax Error?' }], [{ svg: svg('two'), type: 'class' }]]);
    choice = 'Show Log';
    const { command } = await exporter();
    await command(document.uri);
    // The log shows after the click on the button, when the command has ended.
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Two diagrams: the name carries the type, also when the other diagram has an error.
    expect([...written.keys()]).toEqual(['file:/work/notes-class.svg']);
    expect(messages).toEqual([
      'warning: The export wrote 1 SVG file next to notes.md: notes-class.svg. 1 diagram has an error and has no SVG file; the log "nimblescape PlantUML" names the errors. [Show Log]',
    ]);
    expect(logged).toEqual([
      'warn: The SVG export of notes.md wrote no file for the PlantUML block at line 3, diagram 1: Line 1: Syntax Error?',
      'info: The SVG export of notes.md wrote file:/work/notes-class.svg.',
      'show',
    ]);
  });

  test('writes no file when every diagram has an error, or when the page sends no valid diagrams for a block', async () => {
    const document = addDocument('/work/shapes.puml', 'plantuml', '@startuml\nA -> B\n@enduml\n@startuml\nB -> C\n@enduml');
    page = pageAnswers([[{ svg: 1, type: 'sequence' }]]);
    const { command } = await exporter();
    await command(document.uri);
    expect(written.size).toBe(0);
    expect(messages).toEqual([
      'warning: The export wrote no SVG file. 1 diagram has an error and has no SVG file; the log "nimblescape PlantUML" names the errors. [Show Log]',
    ]);
    expect(logged).toEqual(['warn: The SVG export of shapes.puml wrote no file for diagram 1: The diagrams of the block could not be rendered.']);
  });

  test('exports the file of the active text editor or of the active preview of a PlantUML file', async () => {
    const { command } = await exporter();
    page = pageAnswers([[{ svg: svg('1'), type: 'class' }]]);
    activeDocument = addDocument('/work/notes.md', 'markdown', '```plantuml\nclass Car\n```');
    await command();
    activeDocument = addDocument('/work/script.js', 'javascript', '');
    activeInput = new FakeTabInputCustom(addDocument('/work/shapes.puml', 'plantuml', 'class Car').uri, 'nimblescape.plantuml.preview');
    await command();
    expect([...written.keys()]).toEqual(['file:/work/notes.svg', 'file:/work/shapes.svg']);
  });

  test('tells what to open when no PlantUML or Markdown file is active', async () => {
    const { command } = await exporter();
    activeDocument = addDocument('/work/script.js', 'javascript', '');
    await command();
    expect(messages).toEqual(['error: Open a PlantUML file or a Markdown file to export its diagrams as SVG files.']);
    expect(panels).toHaveLength(0);
  });

  test('asks to save a new file first, and exports no other kind of file', async () => {
    const { svgExport } = await exporter();
    await svgExport.export(new FakeUri('untitled', 'Untitled-1') as never);
    addDocument('/work/script.js', 'javascript', '');
    await svgExport.export(new FakeUri('file', '/work/script.js') as never);
    expect(messages).toEqual([
      'error: Save Untitled-1 first: the export writes the SVG files next to the file.',
      'error: The export works for PlantUML files and Markdown files, not for script.js.',
    ]);
    expect(panels).toHaveLength(0);
  });

  test('tells that a file has no diagram, without a tab', async () => {
    const document = addDocument('/work/notes.md', 'markdown', '# Notes\n\n```js\nlet a;\n```');
    const { command } = await exporter();
    await command(document.uri);
    expect(messages).toEqual(['info: notes.md has no PlantUML diagram.']);
    expect(panels).toHaveLength(0);
  });

  test('stops, without a file, when the user closes the tab of the export or cancels it', async () => {
    const document = addDocument('/work/notes.md', 'markdown', markdown);
    const { command } = await exporter();
    page = () => panels[0].dispose();
    await command(document.uri);
    page = () => cancel?.();
    await command(document.uri);
    expect(written.size).toBe(0);
    expect(messages).toEqual(['warning: The export of notes.md stopped, because its tab was closed. It wrote no SVG file.']);
    expect(panels.map((panel) => panel.disposed)).toEqual([true, true]);
  });

  test('exports each file that is selected in the explorer, one after the other', async () => {
    const [first, second] = [addDocument('/work/a.puml', 'plantuml', 'class A'), addDocument('/work/b.puml', 'plantuml', 'class B')];
    page = pageAnswers([[{ svg: svg('1'), type: 'class' }]]);
    const { command } = await exporter();
    await command(first.uri, [first.uri, second.uri]);
    // A click on one file passes the file and a list with that file only.
    await command(second.uri, [second.uri]);
    expect([...written.keys()]).toEqual(['file:/work/a.svg', 'file:/work/b.svg']);
    expect(messages).toHaveLength(3);
  });

  test('shows an error when it cannot open the file', async () => {
    const { command } = await exporter();
    await command(new FakeUri('file', '/work/gone.puml'));
    expect(messages).toEqual(['error: The export could not open gone.puml: cannot open file:/work/gone.puml']);
  });

  test('stops with an error when its page does not start', async () => {
    vi.useFakeTimers();
    try {
      const document = addDocument('/work/shapes.puml', 'plantuml', 'class Car');
      pageStarts = false;
      const { command, readyTimeout } = await exporter();
      const done = command(document.uri);
      await vi.advanceTimersByTimeAsync(readyTimeout);
      await done;
      expect(messages).toEqual(['error: The export of shapes.puml stopped, because its page did not start. It wrote no SVG file.']);
      expect(logged).toEqual(['warn: The SVG export of shapes.puml: the page of the export did not start within 30 seconds.']);
      expect(panels[0].disposed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test('shows an error when it cannot write a file', async () => {
    const document = addDocument('/work/shapes.puml', 'plantuml', 'class Car');
    page = pageAnswers([[{ svg: svg('1'), type: 'class' }]]);
    writeFails = true;
    const { command } = await exporter();
    await command(document.uri);
    expect(messages).toEqual(['error: The export could not write the SVG file shapes.svg: read-only file system']);
    expect(logged).toEqual(['warn: The SVG export of shapes.puml could not write file:/work/shapes.svg: read-only file system']);
  });

  test('writes the problems that the page reports into the log, and starts again when the page loads again', async () => {
    const document = addDocument('/work/shapes.puml', 'plantuml', 'class Car');
    let loads = 0;
    page = (message, send) => {
      send({ type: 'log', message: 'Graphviz (Viz.js) could not be loaded.' });
      if (loads++ === 0) {
        panels[0].webview.send({ type: 'ready' });
        return;
      }
      pageAnswers([[{ svg: svg('1'), type: 'class' }]])(message, send);
    };
    const { command } = await exporter();
    await command(document.uri);
    expect(panels[0].webview.posted).toHaveLength(2);
    expect(logged[0]).toBe('warn: The SVG export of shapes.puml: Graphviz (Viz.js) could not be loaded.');
    expect([...written.keys()]).toEqual(['file:/work/shapes.svg']);
  });
});
