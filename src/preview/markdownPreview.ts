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
 */

import { engineLoader, isDarkTheme, PreviewRenderer } from './renderer';

/**
 * start renders the blocks of the preview page and renders again when the content or the color theme changes.
 * The preview adds its content after the scripts load and replaces it on every change of the document, so a
 * mutation observer starts each update.
 */
function start(): void {
  const renderer = new PreviewRenderer(
    document,
    engineLoader(new URL('./engine/', import.meta.url).href),
    () => isDarkTheme(document.body),
  );
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
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('vscode.markdown.updateContent', schedule);
  schedule();
}

// The tests import this module without a preview page.
if (typeof document !== 'undefined' && document.getElementById('vscode-markdown-preview-data')) {
  start();
}
