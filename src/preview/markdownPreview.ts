// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/// <reference lib="dom" />

/**
 * The script of the built-in Markdown preview. It renders every PlantUML block
 * that the markdown-it plugin (`src/markdown/markdownIt.ts`) wrote into the
 * page with the renderer of `src/preview/renderer.ts`
 * ([R-MD-001](../../docs/requirements.md#r-md-001)).
 *
 * The preview loads this script as a module with the nonce of its security
 * policy. That policy allows only scripts with the nonce: the script loads the
 * engine with a dynamic import, which keeps the nonce, and loads the further
 * scripts of the engine (themes, emoji, icons) with script elements that carry
 * the nonce. The policy forbids WebAssembly, so the Graphviz layout of Viz.js
 * cannot run in the default preview; PlantUML then uses its own layout engine
 * Smetana. When the preview allows WebAssembly (the security setting
 * "Disable"), the script loads Viz.js first.
 *
 * On a change of the document, the preview renders the document again and
 * changes only the elements of its page that differ from the new ones. The
 * renderer draws the diagrams into shadow roots and leaves the elements of the
 * blocks as markdown-it wrote them, so an unchanged block keeps its diagrams,
 * which the renderer neither renders nor draws again.
 */

import { pageRenderer, PreviewRenderer } from './renderer';

/**
 * watchMarkdownPreview renders the blocks of a Markdown preview page, and renders again when the content or the
 * color theme changes. The preview may add its content after the scripts load, and changes it on every change of
 * the document, after which it sends the event `vscode.markdown.updateContent`. A mutation observer and that event
 * start each update, at most one in a turn of the event loop.
 * @param page - The document of the preview.
 * @param renderer - The renderer of the blocks of the page.
 */
export function watchMarkdownPreview(page: Document, renderer: PreviewRenderer): void {
  let scheduled = false;
  const schedule = () => {
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        renderer.update();
      });
    }
  };
  // VS Code changes the class of the body when the color theme changes.
  new MutationObserver(schedule).observe(page.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  page.defaultView?.addEventListener('vscode.markdown.updateContent', schedule);
  schedule();
}

// The tests import this module without a preview page.
if (typeof document !== 'undefined' && document.getElementById('vscode-markdown-preview-data')) {
  watchMarkdownPreview(document, pageRenderer(document, new URL('./engine/', import.meta.url).href));
}
