// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The SVG export ([R-GEN-003](../docs/requirements.md#r-gen-003)): the
 * command "PlantUML: Export Diagrams as SVG" writes one SVG file for each
 * diagram of a PlantUML file ([R-PUML-009](../docs/requirements.md#r-puml-009))
 * or of the PlantUML blocks of a Markdown file
 * ([R-MD-008](../docs/requirements.md#r-md-008)), next to the file. It
 * exports the text of the editor, also with changes that are not saved yet,
 * with the settings of the file and the saved texts of its included files
 * ([R-GEN-008](../docs/requirements.md#r-gen-008)).
 *
 * The engine needs a page to measure the texts of a diagram, and VS Code runs
 * a page only in a webview that shows. So the export opens a tab next to the
 * editor with the page of the export (`src/preview/svgExportPage.ts`), which
 * renders the diagrams and sends their SVG texts and types back, and closes
 * the tab when the files are written. A notification shows the progress and
 * can cancel the export. The names of the files come from
 * `src/diagram/svgFiles.ts`: the name of the file alone for one diagram, and
 * the name with the type of each diagram for several. An existing file with
 * the same name is replaced. A diagram with an error gets no file, and the log
 * "nimblescape PlantUML" names its error.
 */

import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { baseName, svgFileNames } from './diagram/svgFiles';
import { plantUmlBlocks } from './markdown/blocks';
import { previewHtml } from './preview/previewHtml';
import type { ExportBlock, ExportedDiagram, PageMessage } from './preview/svgExportPage';
import { IncludesLoader } from './pumlPreviews';
import { Settings } from './settings';

/** exportSvgCommand is the command that exports the diagrams of a file as SVG files. */
export const exportSvgCommand = 'nimblescape.plantuml.exportSvg';

/** exportViewType is the type of the webview panel that renders the diagrams of an export. */
export const exportViewType = 'nimblescape.plantuml.svgExport';

/** ExportLog is the part of the log channel of the extension that the export writes to. */
export type ExportLog = Pick<vscode.LogOutputChannel, 'info' | 'warn' | 'show'>;

/** SourceBlock is a part of a file whose diagrams render together: a PlantUML block of a Markdown file, or a PlantUML file. */
export interface SourceBlock {
  /** text is the PlantUML text of the block or of the file. */
  text: string;
  /** fence is the number of the line of the opening fence of a Markdown block, from 1; undefined for a PlantUML file. */
  fence?: number;
}

/** maxListedNames is the number of file names that the message after an export lists. */
const maxListedNames = 5;

/**
 * readyTimeout is the time in milliseconds that the export waits for its page to start. A page that does not start,
 * for example because its script cannot load, stops the export with a message.
 */
export const readyTimeout = 30_000;

/**
 * sourceBlocks returns the parts of a document whose diagrams the export renders: the whole text of a PlantUML file,
 * or each PlantUML block of a Markdown file, without the blank ones. It returns undefined for a document of another
 * language.
 * @param document - The document.
 */
export function sourceBlocks(document: Pick<vscode.TextDocument, 'languageId' | 'getText'>): SourceBlock[] | undefined {
  const text = document.getText();
  if (document.languageId === 'plantuml') {
    return text.trim() === '' ? [] : [{ text }];
  }
  if (document.languageId === 'markdown') {
    return plantUmlBlocks(text.split(/\r\n|\r|\n/))
      .map((block) => ({ text: block.lines.join('\n'), fence: block.start }))
      .filter((block) => block.text.trim() !== '');
  }
  return undefined;
}

/**
 * fileName returns the name of a file.
 * @param uri - The address of the file.
 */
const fileName = (uri: vscode.Uri): string => uri.path.slice(uri.path.lastIndexOf('/') + 1);

/**
 * folderOf returns the address of the folder of a file.
 * @param uri - The address of the file.
 */
const folderOf = (uri: vscode.Uri): vscode.Uri => uri.with({ path: uri.path.slice(0, uri.path.lastIndexOf('/')) || '/' });

/**
 * listNames returns a list of file names for a message, with at most a few names.
 * @param names - The names.
 */
function listNames(names: readonly string[]): string {
  const listed = names.slice(0, maxListedNames).join(', ');
  return names.length > maxListedNames ? `${listed} and ${names.length - maxListedNames} more` : listed;
}

/**
 * plural returns a number with a noun in the singular or the plural.
 * @param count - The number.
 * @param singular - The noun in the singular.
 * @param pluralForm - The noun in the plural.
 */
const plural = (count: number, singular: string, pluralForm: string): string => `${count} ${count === 1 ? singular : pluralForm}`;

/**
 * isExportedDiagram tells whether a value of a message of the page is a diagram of the export.
 * @param value - The value.
 */
const isExportedDiagram = (value: unknown): value is ExportedDiagram =>
  typeof value === 'object' &&
  value !== null &&
  (('svg' in value && typeof value.svg === 'string' && 'type' in value && typeof value.type === 'string') ||
    ('error' in value && typeof value.error === 'string'));

/** Rendering is the outcome of the page of an export: the diagrams of each block, or the reason why it stopped. */
type Rendering = { blocks: (ExportedDiagram[] | undefined)[] } | { stopped: 'closed' | 'cancelled' | 'not started' };

/** SvgExport exports the diagrams of PlantUML files and of the PlantUML blocks of Markdown files as SVG files. */
export class SvgExport {
  readonly #extensionUri: vscode.Uri;
  readonly #settings: (document: vscode.Uri) => Settings;
  readonly #includes: IncludesLoader;
  readonly #log: ExportLog;

  /**
   * @param extensionUri - The folder of the extension, which holds the script of the page and the engine.
   * @param settings - Reads the settings of the extension for a document.
   * @param includes - Reads the files that the diagrams of a text include.
   * @param log - Receives the errors of the diagrams and the written files.
   */
  constructor(extensionUri: vscode.Uri, settings: (document: vscode.Uri) => Settings, includes: IncludesLoader, log: ExportLog) {
    this.#extensionUri = extensionUri;
    this.#settings = settings;
    this.#includes = includes;
    this.#log = log;
  }

  /**
   * register registers the command of the export. The context menu of the explorer passes the file that the user
   * clicked and the selected files; the command exports each selected file, one after the other.
   */
  register(): vscode.Disposable[] {
    return [
      vscode.commands.registerCommand(exportSvgCommand, async (uri?: unknown, uris?: unknown) => {
        const selected = Array.isArray(uris) ? uris.filter((item): item is vscode.Uri => item instanceof vscode.Uri) : [];
        const files = selected.length > 1 ? selected : [uri instanceof vscode.Uri ? uri : undefined];
        for (const file of files) {
          await this.export(file);
        }
      }),
    ];
  }

  /**
   * export writes an SVG file for each diagram of a file, next to the file.
   * @param uri - The file; without it, the file of the active tab (see activeFile).
   */
  async export(uri?: vscode.Uri): Promise<void> {
    const target = uri ?? activeFile();
    if (!target) {
      void vscode.window.showErrorMessage('Open a PlantUML file or a Markdown file to export its diagrams as SVG files.');
      return;
    }
    const name = fileName(target);
    if (target.scheme === 'untitled') {
      void vscode.window.showErrorMessage(`Save ${name} first: the export writes the SVG files next to the file.`);
      return;
    }
    let document: vscode.TextDocument;
    try {
      document = await vscode.workspace.openTextDocument(target);
    } catch (error) {
      void vscode.window.showErrorMessage(`The export could not open ${name}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const sources = sourceBlocks(document);
    if (!sources) {
      void vscode.window.showErrorMessage(`The export works for PlantUML files and Markdown files, not for ${name}.`);
      return;
    }
    if (sources.length === 0) {
      void vscode.window.showInformationMessage(`${name} has no PlantUML diagram.`);
      return;
    }
    const settings = this.#settings(target);
    const includes = await Promise.all(sources.map((source) => this.#includes(target, source.text)));
    const blocks = sources.map((source, index): ExportBlock => ({ text: source.text, settings, ...(includes[index] ? { includes: includes[index] } : {}) }));
    const rendering = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Exporting the diagrams of ${name} as SVG files`, cancellable: true },
      (progress, token) => this.#render(name, blocks, progress, token),
    );
    if ('stopped' in rendering) {
      if (rendering.stopped === 'closed') {
        void vscode.window.showWarningMessage(`The export of ${name} stopped, because its tab was closed. It wrote no SVG file.`);
      } else if (rendering.stopped === 'not started') {
        void vscode.window.showErrorMessage(`The export of ${name} stopped, because its page did not start. It wrote no SVG file.`);
      }
      return;
    }
    await this.#write(target, sources, rendering.blocks);
  }

  /**
   * #render renders the blocks of an export on the page of the export, in a tab next to the editor, and closes the tab
   * when the page has sent the diagrams of every block, or when the user cancels the export.
   * @param name - The name of the file, for the title of the tab.
   * @param blocks - The blocks.
   * @param progress - Shows the progress of the export.
   * @param token - Tells when the user cancels the export.
   */
  #render(name: string, blocks: ExportBlock[], progress: vscode.Progress<{ increment?: number }>, token: vscode.CancellationToken): Promise<Rendering> {
    const dist = vscode.Uri.joinPath(this.#extensionUri, 'dist');
    const media = vscode.Uri.joinPath(this.#extensionUri, 'media');
    const panel = vscode.window.createWebviewPanel(
      exportViewType,
      `Export ${name}`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      // The page keeps working while another tab hides it; VS Code allows forms in a webview with scripts unless the
      // options forbid them, and the page has no form.
      { enableScripts: true, enableForms: false, retainContextWhenHidden: true, localResourceRoots: [dist, media] },
    );
    const webview = panel.webview;
    webview.html = previewHtml({
      cspSource: webview.cspSource,
      nonce: randomBytes(16).toString('base64'),
      script: webview.asWebviewUri(vscode.Uri.joinPath(dist, 'svgExport.js')).toString(),
      style: webview.asWebviewUri(vscode.Uri.joinPath(media, 'pumlPreview.css')).toString(),
      title: 'PlantUML SVG Export',
    });
    return new Promise((resolve) => {
      let results: (ExportedDiagram[] | undefined)[] = [];
      let finished = false;
      const subscriptions: vscode.Disposable[] = [];
      const timer = setTimeout(() => {
        this.#log.warn(`The SVG export of ${name}: the page of the export did not start within ${readyTimeout / 1000} seconds.`);
        finish({ stopped: 'not started' });
      }, readyTimeout);
      const finish = (rendering: Rendering) => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          subscriptions.forEach((subscription) => subscription.dispose());
          panel.dispose();
          resolve(rendering);
        }
      };
      subscriptions.push(
        webview.onDidReceiveMessage((message: PageMessage | undefined) => {
          if (message?.type === 'ready') {
            // A page that loads again starts the export again.
            clearTimeout(timer);
            results = [];
            void webview.postMessage({ type: 'export', blocks });
          } else if (message?.type === 'block' && Number.isInteger(message.index) && message.index >= 0 && message.index < blocks.length) {
            results[message.index] = Array.isArray(message.diagrams) && message.diagrams.every(isExportedDiagram) ? message.diagrams : undefined;
            progress.report({ increment: 100 / blocks.length });
          } else if (message?.type === 'done') {
            finish({ blocks: blocks.map((_, index) => results[index]) });
          } else if (message?.type === 'log' && typeof message.message === 'string') {
            this.#log.warn(`The SVG export of ${name}: ${message.message.slice(0, 2000)}`);
          }
        }),
        panel.onDidDispose(() => finish({ stopped: 'closed' })),
        token.onCancellationRequested(() => finish({ stopped: 'cancelled' })),
      );
    });
  }

  /**
   * #write writes the SVG file of each diagram without an error next to the file, logs the errors of the other
   * diagrams, and shows a message with the written files.
   * @param target - The address of the file.
   * @param sources - The blocks of the file.
   * @param blocks - The diagrams of each block, or undefined for a block that the page did not render.
   */
  async #write(target: vscode.Uri, sources: readonly SourceBlock[], blocks: readonly (ExportedDiagram[] | undefined)[]): Promise<void> {
    const name = fileName(target);
    const diagrams = blocks.flatMap((diagrams, index) =>
      (diagrams ?? [{ error: 'The diagrams of the block could not be rendered.' }]).map((diagram, number) => ({
        diagram,
        place: sources[index].fence === undefined ? `diagram ${number + 1}` : `the PlantUML block at line ${sources[index].fence}, diagram ${number + 1}`,
      })),
    );
    const names = svgFileNames(
      baseName(name),
      diagrams.map(({ diagram }) => ('svg' in diagram ? diagram.type : undefined)),
    );
    const folder = folderOf(target);
    const written: string[] = [];
    let errors = 0;
    for (const [index, { diagram, place }] of diagrams.entries()) {
      const file = names[index];
      if ('error' in diagram || file === undefined) {
        errors++;
        this.#log.warn(`The SVG export of ${name} wrote no file for ${place}: ${'error' in diagram ? diagram.error : 'it has no name.'}`);
        continue;
      }
      const uri = vscode.Uri.joinPath(folder, file);
      try {
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(diagram.svg));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.#log.warn(`The SVG export of ${name} could not write ${uri.toString(true)}: ${reason}`);
        void vscode.window.showErrorMessage(`The export could not write the SVG file ${file}: ${reason}`);
        return;
      }
      written.push(file);
      this.#log.info(`The SVG export of ${name} wrote ${uri.toString(true)}.`);
    }
    const files = written.length === 0 ? 'The export wrote no SVG file' : `The export wrote ${plural(written.length, 'SVG file', 'SVG files')} next to ${name}: ${listNames(written)}`;
    if (errors === 0) {
      void vscode.window.showInformationMessage(`${files}.`);
      return;
    }
    const showLog = 'Show Log';
    const failed = `${plural(errors, 'diagram has an error and has', 'diagrams have an error and have')} no SVG file`;
    // The command ends without waiting for the button, as after a message without one.
    void vscode.window.showWarningMessage(`${files}. ${failed}; the log "nimblescape PlantUML" names the errors.`, showLog).then((choice) => {
      if (choice === showLog) {
        this.#log.show(true);
      }
    });
  }
}

/**
 * activeFile returns the file that the active tab shows: the file of the active text editor, if it is a PlantUML or a
 * Markdown file, or the file of any other editor of a file, for example the preview of a PlantUML file, the Markdown
 * preview of VS Code (Ctrl+Shift+V) or the Markdown editor of another extension. The Markdown preview beside the editor
 * (Ctrl+K V) names no file, so for it, activeFile returns the Markdown file of the visible text editors, when they show
 * exactly one. The export checks the kind of the file.
 */
function activeFile(): vscode.Uri | undefined {
  const document = vscode.window.activeTextEditor?.document;
  if (document && (document.languageId === 'plantuml' || document.languageId === 'markdown')) {
    return document.uri;
  }
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (input instanceof vscode.TabInputCustom) {
    return input.uri;
  }
  if (input instanceof vscode.TabInputWebview && isMarkdownPreviewPanel(input.viewType)) {
    const shown = new Map(
      vscode.window.visibleTextEditors
        .map((editor) => editor.document)
        .filter((shownDocument) => shownDocument.languageId === 'markdown')
        .map((shownDocument) => [shownDocument.uri.toString(), shownDocument.uri]),
    );
    return shown.size === 1 ? [...shown.values()][0] : undefined;
  }
  return undefined;
}

/** markdownPreviewPanel is the type of the webview panel of the Markdown preview of VS Code beside the editor (Ctrl+K V). */
export const markdownPreviewPanel = 'markdown.preview';

/**
 * isMarkdownPreviewPanel tells whether the view type of a webview tab is the one of the Markdown preview beside the
 * editor. VS Code puts a prefix before the type that the extension gave, for example `mainThreadWebview-`.
 * @param viewType - The view type of the tab.
 */
const isMarkdownPreviewPanel = (viewType: string): boolean => viewType === markdownPreviewPanel || viewType.endsWith(`-${markdownPreviewPanel}`);
