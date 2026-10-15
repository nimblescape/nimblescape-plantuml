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
 *
 * Each preview is a webview with the page of `src/preview/previewHtml.ts` and
 * the script `dist/pumlPreview.js`. The page tells the extension when it is
 * ready, and the extension then sends the text of the file and the settings.
 */

import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
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

/** Preview connects the webview of a preview with the document that it shows. */
interface Preview {
  webview: vscode.Webview;
  document: vscode.TextDocument;
  /** diff is the original document of a rendered diff, and the title of its diff editor. */
  diff?: { original: vscode.TextDocument; label: string };
  /** ready tells whether the page of the webview can receive the text. */
  ready: boolean;
}

/** DiffState is the state that the page of a rendered diff keeps for a restart of VS Code. */
interface DiffState {
  uri?: unknown;
  original?: unknown;
  label?: unknown;
}

/**
 * fileName returns the name of the file of a document.
 * @param document - The document.
 */
const fileName = (document: vscode.TextDocument): string => document.uri.path.slice(document.uri.path.lastIndexOf('/') + 1);

/** PumlPreviews manages the previews of PlantUML files. */
export class PumlPreviews implements vscode.CustomTextEditorProvider, vscode.WebviewPanelSerializer {
  readonly #extensionUri: vscode.Uri;
  readonly #settings: (document: vscode.Uri) => Settings;
  readonly #previews = new Set<Preview>();
  readonly #diffs = new Map<vscode.WebviewPanel, Preview>();
  #side: { panel: vscode.WebviewPanel; preview: Preview } | undefined;

  /**
   * @param extensionUri - The folder of the extension, which holds the scripts and the styles of the page.
   * @param settings - Reads the settings of the extension for a document.
   */
  constructor(extensionUri: vscode.Uri, settings: (document: vscode.Uri) => Settings) {
    this.#extensionUri = extensionUri;
    this.#settings = settings;
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

  /** refreshAll sends the text and the settings to every preview again, for example after a change of a setting. */
  refreshAll(): void {
    this.#previews.forEach((preview) => this.#send(preview));
  }

  /**
   * resolveCustomTextEditor shows a document in the custom editor.
   * @param document - The document of the PlantUML file.
   * @param panel - The panel of the custom editor.
   */
  resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    this.#connect(panel, document);
  }

  /**
   * deserializeWebviewPanel restores the preview to the side or a rendered diff after a restart of VS Code. The page
   * keeps the addresses of its documents in its state.
   * @param panel - The restored panel.
   * @param state - The state of the page.
   */
  async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: unknown): Promise<void> {
    const { uri, original, label } = (state ?? {}) as DiffState;
    if (typeof uri !== 'string' || (panel.viewType === diffPreviewViewType && (typeof original !== 'string' || typeof label !== 'string'))) {
      panel.dispose();
      return;
    }
    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
    if (panel.viewType === diffPreviewViewType) {
      const originalDocument = await vscode.workspace.openTextDocument(vscode.Uri.parse(original as string));
      this.#connectDiff(panel, originalDocument, document, label as string);
      return;
    }
    this.#side?.panel.dispose();
    this.#side = { panel, preview: this.#connect(panel, document) };
  }

  /**
   * togglePreview switches the active tab between the text of a PlantUML file and its preview, or between the diff
   * of a PlantUML file and its rendered diff.
   */
  togglePreview(): Thenable<unknown> {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    const inPreview = (input instanceof vscode.TabInputCustom && input.viewType === previewViewType) || this.#activeDiff();
    return inPreview ? this.reopenAsSource() : this.reopenAsPreview();
  }

  /** reopenAsPreview shows the active PlantUML file as a preview, or the active diff as a rendered diff. */
  reopenAsPreview(): Thenable<unknown> {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    return tab?.input instanceof vscode.TabInputTextDiff
      ? this.showRenderedDiff(tab)
      : vscode.commands.executeCommand('reopenActiveEditorWith', previewViewType);
  }

  /** reopenAsSource shows the active preview as the text of its file, or the active rendered diff as a diff. */
  reopenAsSource(): Thenable<unknown> {
    const diff = this.#activeDiff();
    return diff ? this.#showTextDiff(...diff) : vscode.commands.executeCommand('reopenActiveEditorWith', 'default');
  }

  /**
   * showRenderedDiff replaces the tab of a diff with its rendered diff.
   * @param tab - The tab of the diff.
   */
  async showRenderedDiff(tab: vscode.Tab): Promise<void> {
    const { original, modified } = tab.input as vscode.TabInputTextDiff;
    const [originalDocument, document] = await Promise.all([
      vscode.workspace.openTextDocument(original),
      vscode.workspace.openTextDocument(modified),
    ]);
    const panel = vscode.window.createWebviewPanel(diffPreviewViewType, `Preview ${tab.label}`, tab.group.viewColumn);
    this.#connectDiff(panel, originalDocument, document, tab.label);
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
    const document = await vscode.workspace.openTextDocument(target);
    if (this.#side) {
      this.#show(document);
      this.#side.panel.reveal(vscode.ViewColumn.Beside, true);
      return;
    }
    const panel = vscode.window.createWebviewPanel(sidePreviewViewType, `Preview ${fileName(document)}`, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
    });
    this.#side = { panel, preview: this.#connect(panel, document) };
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
    const { document, diff } = preview;
    await vscode.commands.executeCommand('vscode.diff', diff!.original.uri, document.uri, diff!.label, { viewColumn: panel.viewColumn });
    panel.dispose();
  }

  /**
   * #connectDiff gives a webview panel the page of a rendered diff.
   * @param panel - The panel.
   * @param original - The original document.
   * @param document - The modified document.
   * @param label - The title of the diff editor of the documents.
   */
  #connectDiff(panel: vscode.WebviewPanel, original: vscode.TextDocument, document: vscode.TextDocument, label: string): void {
    const preview = this.#connect(panel, document, { original, label });
    this.#diffs.set(panel, preview);
  }

  /**
   * #connect gives a webview panel the page of the preview and connects it with a document.
   * @param panel - The panel.
   * @param document - The document; in a rendered diff, the modified document.
   * @param diff - The original document and the title of the diff, for a rendered diff.
   */
  #connect(panel: vscode.WebviewPanel, document: vscode.TextDocument, diff?: Preview['diff']): Preview {
    const dist = vscode.Uri.joinPath(this.#extensionUri, 'dist');
    const media = vscode.Uri.joinPath(this.#extensionUri, 'media');
    const webview = panel.webview;
    webview.options = { enableScripts: true, localResourceRoots: [dist, media] };
    webview.html = previewHtml({
      cspSource: webview.cspSource,
      nonce: randomBytes(16).toString('base64'),
      script: webview.asWebviewUri(vscode.Uri.joinPath(dist, 'pumlPreview.js')).toString(),
      style: webview.asWebviewUri(vscode.Uri.joinPath(media, 'pumlPreview.css')).toString(),
    });
    const preview: Preview = { webview, document, diff, ready: false };
    this.#previews.add(preview);
    const subscriptions = [
      // A hidden webview loses its page; the page then sends `ready` again when it shows.
      webview.onDidReceiveMessage((message: { type?: unknown } | undefined) => {
        if (message?.type === 'ready') {
          preview.ready = true;
          this.#send(preview);
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
   * #send sends the text of the document and its settings to a preview whose page is ready, and for a rendered diff
   * also the original text.
   * @param preview - The preview.
   */
  #send(preview: Preview): void {
    if (preview.ready) {
      const { document, diff } = preview;
      void preview.webview.postMessage({
        type: 'update',
        text: document.getText(),
        settings: this.#settings(document.uri),
        ...(diff
          ? { original: diff.original.getText(), state: { uri: document.uri.toString(), original: diff.original.uri.toString(), label: diff.label } }
          : { state: { uri: document.uri.toString() } }),
      });
    }
  }

  /**
   * #refresh sends the text of a changed document to its previews.
   * @param document - The changed document.
   */
  #refresh(document: vscode.TextDocument): void {
    this.#previews.forEach((preview) => (preview.document === document || preview.diff?.original === document) && this.#send(preview));
  }

  /**
   * #follow shows the PlantUML file of the active text editor in the preview to the side.
   * @param editor - The active text editor.
   */
  #follow(editor: vscode.TextEditor | undefined): void {
    if (editor?.document.languageId === 'plantuml' && editor.document !== this.#side?.preview.document) {
      this.#show(editor.document);
    }
  }

  /**
   * #show shows a document in the preview to the side.
   * @param document - The document.
   */
  #show(document: vscode.TextDocument): void {
    if (this.#side) {
      this.#side.preview.document = document;
      this.#side.panel.title = `Preview ${fileName(document)}`;
      this.#send(this.#side.preview);
    }
  }
}
