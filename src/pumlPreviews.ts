// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The previews of PlantUML files. They work as the previews of Markdown files
 * in VS Code:
 *
 * - The custom editor `nimblescape.plantuml.preview` shows the diagrams of a
 *   file in the tab of the file. Ctrl+Shift+V and the buttons in the title bar
 *   switch the tab between the text and the preview with the command
 *   `reopenActiveEditorWith` ([R-PUML-002](../docs/requirements.md#r-puml-002)).
 * - Ctrl+K V opens a preview next to the text. It follows every change of the
 *   text while the user types, and it shows the PlantUML file of the active
 *   text editor ([R-PUML-003](../docs/requirements.md#r-puml-003)).
 * - In the diff of a PlantUML file, Ctrl+Shift+V and the button in the title
 *   bar replace the diff with its rendered diff: the original diagrams on the
 *   left, the modified ones on the right, with a mark on the changed diagrams
 *   ([R-PUML-004](../docs/requirements.md#r-puml-004)). The rendered diff is a
 *   webview panel of the extension, because VS Code 1.142 and earlier cannot
 *   open a custom editor in a diff: the editor of the original side gets no
 *   options, and VS Code fails on them. The same keys switch back to the diff.
 * - After a restart, VS Code restores the previews; a restored preview to the
 *   side or rendered diff whose file is gone closes
 *   ([R-PUML-008](../docs/requirements.md#r-puml-008)).
 *
 * Each preview is a webview with the page of `src/preview/previewHtml.ts` and
 * the script `dist/pumlPreview.js`. The page tells the extension when it is
 * ready, and the extension then sends the text of the file, the files that its
 * diagrams include ([R-GEN-008](../docs/requirements.md#r-gen-008)) and the
 * settings. A preview keeps the address of its file, not the document:
 * VS Code closes a document that no editor shows after a few minutes, and a
 * later change of the file reaches a new document.
 */

import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { IncludedFiles } from './diagram/includes';
import { previewHtml } from './preview/previewHtml';
import { Settings } from './settings';

/** previewViewType is the type of the custom editor that shows a PlantUML file as a preview. */
export const previewViewType = 'nimblescape.plantuml.preview';

/** sidePreviewViewType is the type of the webview panel of the preview to the side. */
export const sidePreviewViewType = 'nimblescape.plantuml.sidePreview';

/** diffPreviewViewType is the type of the webview panel of a rendered diff. */
export const diffPreviewViewType = 'nimblescape.plantuml.diffPreview';

/** commands are the commands of the previews. */
export const commands = {
  togglePreview: 'nimblescape.plantuml.togglePreview',
  reopenAsPreview: 'nimblescape.plantuml.reopenAsPreview',
  reopenAsSource: 'nimblescape.plantuml.reopenAsSource',
  showPreviewToSide: 'nimblescape.plantuml.showPreviewToSide',
} as const;

/** Preview connects the webview of a preview with the file that it shows. */
interface Preview {
  webview: vscode.Webview;
  /** uri is the address of the file; in a rendered diff, of the modified file. */
  uri: vscode.Uri;
  /** diff is the address of the original file of a rendered diff, and the title of its diff editor. */
  diff?: { original: vscode.Uri; label: string };
  /** ready tells whether the page of the webview can receive the text. */
  ready: boolean;
  /** version counts the texts that the extension has sent, so that a text whose included files come late is dropped. */
  version: number;
}

/**
 * IncludesLoader returns the files that the diagrams of a text include, after it has read them; without a promise
 * when it has read them already, and undefined for a text that includes no file.
 */
export type IncludesLoader = (document: vscode.Uri, text: string) => IncludedFiles | undefined | Promise<IncludedFiles | undefined>;

/** Log is the part of the log channel of the extension that the previews write to. */
export type Log = Pick<vscode.LogOutputChannel, 'warn'>;

/** logMessageLimit is the length of the longest message of a page that the log keeps. */
const logMessageLimit = 2000;

/** DiffState is the state that the page of a rendered diff keeps for a restart of VS Code. */
interface DiffState {
  uri?: unknown;
  original?: unknown;
  label?: unknown;
}

/**
 * fileName returns the name of a file.
 * @param uri - The address of the file.
 */
const fileName = (uri: vscode.Uri): string => uri.path.slice(uri.path.lastIndexOf('/') + 1);

/**
 * openDocument returns the open document of a file, or undefined when VS Code has no open document for it.
 * @param uri - The address of the file.
 */
const openDocument = (uri: vscode.Uri): vscode.TextDocument | undefined =>
  vscode.workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());

/** PumlPreviews manages the previews of PlantUML files. */
export class PumlPreviews implements vscode.CustomTextEditorProvider, vscode.WebviewPanelSerializer {
  readonly #extensionUri: vscode.Uri;
  readonly #settings: (document: vscode.Uri) => Settings;
  readonly #includes: IncludesLoader;
  readonly #log: Log;
  readonly #previews = new Set<Preview>();
  readonly #diffs = new Map<vscode.WebviewPanel, Preview>();
  #side: { panel: vscode.WebviewPanel; preview: Preview } | undefined;
  /** #switching is the switch of the active tab that runs, if any. */
  #switching: Promise<unknown> | undefined;

  /**
   * @param extensionUri - The folder of the extension, which holds the scripts and the styles of the page.
   * @param settings - Reads the settings of the extension for a document.
   * @param includes - Reads the files that the diagrams of a text include.
   * @param log - Receives the problems that no diagram shows: a preview that cannot be restored, and the problems
   *   that the pages report.
   */
  constructor(
    extensionUri: vscode.Uri,
    settings: (document: vscode.Uri) => Settings,
    includes: IncludesLoader = () => undefined,
    log: Log = { warn: () => undefined },
  ) {
    this.#extensionUri = extensionUri;
    this.#settings = settings;
    this.#includes = includes;
    this.#log = log;
  }

  /** register registers the custom editor, the panel serializers, the commands and the listeners. */
  register(): vscode.Disposable[] {
    return [
      vscode.window.registerCustomEditorProvider(previewViewType, this, { supportsMultipleEditorsPerDocument: true }),
      vscode.window.registerWebviewPanelSerializer(sidePreviewViewType, this),
      vscode.window.registerWebviewPanelSerializer(diffPreviewViewType, this),
      vscode.workspace.onDidChangeTextDocument((event) => this.#refresh(event.document)),
      vscode.window.onDidChangeActiveTextEditor((editor) => this.#follow(editor)),
      vscode.commands.registerCommand(commands.togglePreview, () => this.togglePreview()),
      vscode.commands.registerCommand(commands.reopenAsPreview, () => this.reopenAsPreview()),
      vscode.commands.registerCommand(commands.reopenAsSource, () => this.reopenAsSource()),
      vscode.commands.registerCommand(commands.showPreviewToSide, (uri?: vscode.Uri) => this.showPreviewToSide(uri)),
    ];
  }

  /**
   * refreshAll sends the text, the included files and the settings to every preview again, for example after a change
   * of a setting or of an included file.
   */
  refreshAll(): void {
    this.#previews.forEach((preview) => this.#send(preview));
  }

  /**
   * resolveCustomTextEditor shows a document in the custom editor.
   * @param document - The document of the PlantUML file.
   * @param panel - The panel of the custom editor.
   */
  resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    this.#connect(panel, document.uri);
  }

  /**
   * deserializeWebviewPanel restores the preview to the side or a rendered diff after a restart of VS Code. The page
   * keeps the addresses of its files in its state. A panel whose state is not valid, or whose file VS Code cannot
   * open any more, for example because it was deleted, closes.
   * @param panel - The restored panel.
   * @param state - The state of the page.
   */
  async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: unknown): Promise<void> {
    const { uri, original, label } = (state ?? {}) as DiffState;
    const diff = panel.viewType === diffPreviewViewType;
    if (typeof uri !== 'string' || (diff && (typeof original !== 'string' || typeof label !== 'string'))) {
      this.#log.warn('A PlantUML preview could not be restored: its saved state is not valid.');
      panel.dispose();
      return;
    }
    const uris = [vscode.Uri.parse(uri), ...(diff ? [vscode.Uri.parse(original as string)] : [])];
    try {
      await Promise.all(uris.map((address) => vscode.workspace.openTextDocument(address)));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.#log.warn(`The PlantUML preview of ${uris[0].toString(true)} could not be restored: ${reason}`);
      panel.dispose();
      return;
    }
    if (diff) {
      this.#connectDiff(panel, uris[1], uris[0], label as string);
      return;
    }
    this.#side?.panel.dispose();
    this.#side = { panel, preview: this.#connect(panel, uris[0]) };
  }

  /**
   * togglePreview switches the active tab between the text of a PlantUML file and its preview, or between the diff
   * of a PlantUML file and its rendered diff.
   */
  togglePreview(): Promise<unknown> {
    return this.#switch(() => {
      const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
      const inPreview = (input instanceof vscode.TabInputCustom && input.viewType === previewViewType) || this.#activeDiff();
      return inPreview ? this.#toSource() : this.#toPreview();
    });
  }

  /** reopenAsPreview shows the active PlantUML file as a preview, or the active diff as a rendered diff. */
  reopenAsPreview(): Promise<unknown> {
    return this.#switch(() => this.#toPreview());
  }

  /** reopenAsSource shows the active preview as the text of its file, or the active rendered diff as a diff. */
  reopenAsSource(): Promise<unknown> {
    return this.#switch(() => this.#toSource());
  }

  /**
   * #switch runs a switch of the active tab. While a switch runs, a further switch does nothing and returns the
   * running one: a second press of Ctrl+Shift+V comes before the first switch has closed its tab, and would switch
   * the same tab again.
   * @param run - Runs the switch.
   */
  #switch(run: () => Thenable<unknown>): Promise<unknown> {
    if (!this.#switching) {
      const switching = Promise.resolve(run()).finally(() => {
        this.#switching = undefined;
      });
      this.#switching = switching;
    }
    return this.#switching;
  }

  /** #toPreview shows the active PlantUML file as a preview, or the active diff as a rendered diff. */
  #toPreview(): Thenable<unknown> {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    return tab?.input instanceof vscode.TabInputTextDiff
      ? this.#showRenderedDiff(tab)
      : vscode.commands.executeCommand('reopenActiveEditorWith', previewViewType);
  }

  /** #toSource shows the active preview as the text of its file, or the active rendered diff as a diff. */
  #toSource(): Thenable<unknown> {
    const diff = this.#activeDiff();
    return diff ? this.#showTextDiff(...diff) : vscode.commands.executeCommand('reopenActiveEditorWith', 'default');
  }

  /**
   * #showRenderedDiff replaces the tab of a diff with its rendered diff.
   * @param tab - The tab of the diff.
   */
  async #showRenderedDiff(tab: vscode.Tab): Promise<void> {
    const { original, modified } = tab.input as vscode.TabInputTextDiff;
    await Promise.all([vscode.workspace.openTextDocument(original), vscode.workspace.openTextDocument(modified)]);
    const panel = vscode.window.createWebviewPanel(diffPreviewViewType, `Preview ${tab.label}`, tab.group.viewColumn);
    this.#connectDiff(panel, original, modified, tab.label);
    await vscode.window.tabGroups.close(tab);
  }

  /**
   * showPreviewToSide opens the preview to the side for a PlantUML file, or shows the file in the open one.
   * @param uri - The file; without it, the file of the active text editor or of the active preview.
   */
  async showPreviewToSide(uri?: vscode.Uri): Promise<void> {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    const target =
      uri ??
      (vscode.window.activeTextEditor?.document.languageId === 'plantuml' ? vscode.window.activeTextEditor.document.uri : undefined) ??
      (input instanceof vscode.TabInputCustom && input.viewType === previewViewType ? input.uri : undefined);
    if (!target) {
      return;
    }
    if (this.#side) {
      this.#show(target);
      this.#side.panel.reveal(vscode.ViewColumn.Beside, true);
      return;
    }
    const panel = vscode.window.createWebviewPanel(sidePreviewViewType, `Preview ${fileName(target)}`, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
    });
    this.#side = { panel, preview: this.#connect(panel, target) };
  }

  /** #activeDiff returns the panel and the preview of the active rendered diff. */
  #activeDiff(): [vscode.WebviewPanel, Preview] | undefined {
    return [...this.#diffs].find(([panel]) => panel.active);
  }

  /**
   * #showTextDiff replaces a rendered diff with the diff of its documents.
   * @param panel - The panel of the rendered diff.
   * @param preview - The preview of the rendered diff.
   */
  async #showTextDiff(panel: vscode.WebviewPanel, preview: Preview): Promise<void> {
    const { uri, diff } = preview;
    await vscode.commands.executeCommand('vscode.diff', diff!.original, uri, diff!.label, { viewColumn: panel.viewColumn });
    panel.dispose();
  }

  /**
   * #connectDiff gives a webview panel the page of a rendered diff.
   * @param panel - The panel.
   * @param original - The address of the original file.
   * @param uri - The address of the modified file.
   * @param label - The title of the diff editor of the files.
   */
  #connectDiff(panel: vscode.WebviewPanel, original: vscode.Uri, uri: vscode.Uri, label: string): void {
    const preview = this.#connect(panel, uri, { original, label });
    this.#diffs.set(panel, preview);
  }

  /**
   * #connect gives a webview panel the page of the preview and connects it with a file.
   * @param panel - The panel.
   * @param uri - The address of the file; in a rendered diff, of the modified file.
   * @param diff - The address of the original file and the title of the diff, for a rendered diff.
   */
  #connect(panel: vscode.WebviewPanel, uri: vscode.Uri, diff?: Preview['diff']): Preview {
    const dist = vscode.Uri.joinPath(this.#extensionUri, 'dist');
    const media = vscode.Uri.joinPath(this.#extensionUri, 'media');
    const webview = panel.webview;
    // VS Code allows forms in a webview with scripts unless the options forbid them; the page has no form.
    webview.options = { enableScripts: true, enableForms: false, localResourceRoots: [dist, media] };
    webview.html = previewHtml({
      cspSource: webview.cspSource,
      nonce: randomBytes(16).toString('base64'),
      script: webview.asWebviewUri(vscode.Uri.joinPath(dist, 'pumlPreview.js')).toString(),
      style: webview.asWebviewUri(vscode.Uri.joinPath(media, 'pumlPreview.css')).toString(),
    });
    const preview: Preview = { webview, uri, diff, ready: false, version: 0 };
    this.#previews.add(preview);
    const subscriptions = [
      // A hidden webview loses its page; the page then sends `ready` again when it shows. A page reports a problem
      // that no diagram shows with `log`; the log keeps only its text.
      webview.onDidReceiveMessage((message: { type?: unknown; message?: unknown } | undefined) => {
        if (message?.type === 'ready') {
          preview.ready = true;
          this.#send(preview);
        } else if (message?.type === 'log' && typeof message.message === 'string') {
          this.#log.warn(`The PlantUML preview of ${uri.toString(true)}: ${message.message.slice(0, logMessageLimit)}`);
        }
      }),
      panel.onDidDispose(() => {
        this.#previews.delete(preview);
        this.#diffs.delete(panel);
        if (this.#side?.panel === panel) {
          this.#side = undefined;
        }
        subscriptions.forEach((subscription) => subscription.dispose());
      }),
    ];
    return preview;
  }

  /**
   * #send sends the text of the file and its settings to a preview whose page is ready, and for a rendered diff
   * also the original text. It reads the open documents of the files; when VS Code has closed one, it opens it
   * again first.
   * @param preview - The preview.
   */
  #send(preview: Preview): void {
    if (!preview.ready) {
      return;
    }
    const uris = [preview.uri, ...(preview.diff ? [preview.diff.original] : [])];
    const documents = uris.map(openDocument);
    if (documents.every((document) => document !== undefined)) {
      this.#post(preview, documents as vscode.TextDocument[]);
      return;
    }
    Promise.all(uris.map((uri) => vscode.workspace.openTextDocument(uri))).then(
      (opened) => this.#post(preview, opened),
      () => undefined,
    );
  }

  /**
   * #post posts the text of the documents of a preview, their included files and the settings to its page. When the
   * extension has to read included files first, it posts after the reading, unless a later text has come meanwhile.
   * @param preview - The preview.
   * @param documents - The document of the file and, for a rendered diff, the original document.
   */
  #post(preview: Preview, [document, original]: readonly vscode.TextDocument[]): void {
    const { uri, diff } = preview;
    const version = ++preview.version;
    const [text, originalText] = [document.getText(), original?.getText()];
    const includes = [this.#includes(document.uri, text), ...(diff ? [this.#includes(original.uri, originalText!)] : [])];
    const send = ([files, originalFiles]: readonly (IncludedFiles | undefined)[]) => {
      if (version !== preview.version) {
        return;
      }
      void preview.webview.postMessage({
        type: 'update',
        text,
        settings: this.#settings(uri),
        ...(files ? { includes: files } : {}),
        ...(diff
          ? {
              original: originalText,
              ...(originalFiles ? { originalIncludes: originalFiles } : {}),
              state: { uri: uri.toString(), original: diff.original.toString(), label: diff.label },
            }
          : { state: { uri: uri.toString() } }),
      });
    };
    if (includes.some((files) => files instanceof Promise)) {
      Promise.all(includes).then(send, () => undefined);
    } else {
      send(includes as (IncludedFiles | undefined)[]);
    }
  }

  /**
   * #refresh sends the text of a changed document to the previews of its file.
   * @param document - The changed document.
   */
  #refresh(document: vscode.TextDocument): void {
    const changed = document.uri.toString();
    this.#previews.forEach(
      (preview) => (preview.uri.toString() === changed || preview.diff?.original.toString() === changed) && this.#send(preview),
    );
  }

  /**
   * #follow shows the PlantUML file of the active text editor in the preview to the side.
   * @param editor - The active text editor.
   */
  #follow(editor: vscode.TextEditor | undefined): void {
    if (editor?.document.languageId === 'plantuml' && editor.document.uri.toString() !== this.#side?.preview.uri.toString()) {
      this.#show(editor.document.uri);
    }
  }

  /**
   * #show shows a file in the preview to the side.
   * @param uri - The address of the file.
   */
  #show(uri: vscode.Uri): void {
    if (this.#side) {
      this.#side.preview.uri = uri;
      this.#side.panel.title = `Preview ${fileName(uri)}`;
      this.#send(this.#side.preview);
    }
  }
}
