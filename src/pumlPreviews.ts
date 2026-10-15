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
 * - In the diff of a PlantUML file, "Reopen Editor With…" or the button in the
 *   title bar opens the custom editor for both versions, so the old and the
 *   new diagrams show side by side ([R-PUML-004](../docs/requirements.md#r-puml-004)).
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
  /** ready tells whether the page of the webview can receive the text. */
  ready: boolean;
}

/**
 * title returns the title of the preview to the side of a document.
 * @param document - The document.
 */
const title = (document: vscode.TextDocument): string => `Preview ${document.uri.path.slice(document.uri.path.lastIndexOf('/') + 1)}`;

/** PumlPreviews manages the previews of PlantUML files. */
export class PumlPreviews implements vscode.CustomTextEditorProvider, vscode.WebviewPanelSerializer {
  readonly #extensionUri: vscode.Uri;
  readonly #settings: (document: vscode.Uri) => Settings;
  readonly #previews = new Set<Preview>();
  #side: { panel: vscode.WebviewPanel; preview: Preview } | undefined;

  /**
   * @param extensionUri - The folder of the extension, which holds the scripts and the styles of the page.
   * @param settings - Reads the settings of the extension for a document.
   */
  constructor(extensionUri: vscode.Uri, settings: (document: vscode.Uri) => Settings) {
    this.#extensionUri = extensionUri;
    this.#settings = settings;
  }

  /** register registers the custom editor, the panel serializer, the commands and the listeners. */
  register(): vscode.Disposable[] {
    return [
      vscode.window.registerCustomEditorProvider(previewViewType, this, { supportsMultipleEditorsPerDocument: true }),
      vscode.window.registerWebviewPanelSerializer(sidePreviewViewType, this),
      vscode.workspace.onDidChangeTextDocument((event) => this.#refresh(event.document)),
      vscode.window.onDidChangeActiveTextEditor((editor) => this.#follow(editor)),
      vscode.commands.registerCommand(commands.togglePreview, () => this.togglePreview()),
      vscode.commands.registerCommand(commands.reopenAsPreview, () => vscode.commands.executeCommand('reopenActiveEditorWith', previewViewType)),
      vscode.commands.registerCommand(commands.reopenAsSource, () => vscode.commands.executeCommand('reopenActiveEditorWith', 'default')),
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
   * deserializeWebviewPanel restores the preview to the side after a restart of VS Code. The page keeps the address
   * of its document in its state.
   * @param panel - The restored panel.
   * @param state - The state of the page.
   */
  async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: unknown): Promise<void> {
    const address = (state as { uri?: unknown } | undefined)?.uri;
    if (typeof address !== 'string') {
      panel.dispose();
      return;
    }
    const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(address));
    this.#side?.panel.dispose();
    this.#side = { panel, preview: this.#connect(panel, document) };
  }

  /** togglePreview switches the active tab between the text of a PlantUML file and its preview. */
  togglePreview(): Thenable<unknown> {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    const inPreview = input instanceof vscode.TabInputCustom && input.viewType === previewViewType;
    return vscode.commands.executeCommand('reopenActiveEditorWith', inPreview ? 'default' : previewViewType);
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
    const panel = vscode.window.createWebviewPanel(sidePreviewViewType, title(document), {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
    });
    this.#side = { panel, preview: this.#connect(panel, document) };
  }

  /**
   * #connect gives a webview panel the page of the preview and connects it with a document.
   * @param panel - The panel.
   * @param document - The document.
   */
  #connect(panel: vscode.WebviewPanel, document: vscode.TextDocument): Preview {
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
    const preview: Preview = { webview, document, ready: false };
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
        if (this.#side?.panel === panel) {
          this.#side = undefined;
        }
        subscriptions.forEach((subscription) => subscription.dispose());
      }),
    ];
    return preview;
  }

  /**
   * #send sends the text of the document and its settings to a preview whose page is ready.
   * @param preview - The preview.
   */
  #send(preview: Preview): void {
    if (preview.ready) {
      const { document } = preview;
      void preview.webview.postMessage({
        type: 'update',
        text: document.getText(),
        settings: this.#settings(document.uri),
        state: { uri: document.uri.toString() },
      });
    }
  }

  /**
   * #refresh sends the text of a changed document to its previews.
   * @param document - The changed document.
   */
  #refresh(document: vscode.TextDocument): void {
    this.#previews.forEach((preview) => preview.document === document && this.#send(preview));
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
      this.#side.panel.title = title(document);
      this.#send(this.#side.preview);
    }
  }
}
