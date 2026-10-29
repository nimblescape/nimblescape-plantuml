// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The page of the preview of PlantUML files. Its security policy allows the
 * script of the extension only, by a nonce, and allows WebAssembly
 * (`'wasm-unsafe-eval'`) for the Graphviz layout of Viz.js. It allows the
 * styles and the images of the extension and inline styles, which the SVG
 * images of PlantUML use, and no network requests, frames, workers, forms or
 * base address. The module uses no API of VS Code.
 */

/** PageResources are the addresses and the security values of the page. */
export interface PageResources {
  /** cspSource is the source of the resources of the webview, from `webview.cspSource`. */
  cspSource: string;
  /** nonce is the random value that allows the script of the page. */
  nonce: string;
  /** script is the address of the script of the page in the webview. */
  script: string;
  /** style is the address of the styles of the page in the webview. */
  style: string;
}

/**
 * escapeAttribute escapes a text for a quoted attribute of HTML.
 * @param text - The text.
 */
const escapeAttribute = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * previewHtml returns the HTML of the preview page.
 * @param resources - The addresses and the security values of the page.
 */
export function previewHtml(resources: PageResources): string {
  const { cspSource, nonce, script, style } = resources;
  const policy = [
    `default-src 'none'`,
    `img-src ${cspSource} data:`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `font-src ${cspSource}`,
    `script-src 'nonce-${nonce}' 'wasm-unsafe-eval'`,
    `base-uri 'none'`,
    `form-action 'none'`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(policy)}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${escapeAttribute(style)}">
<title>PlantUML Preview</title>
</head>
<body>
<main id="diagrams"></main>
<script type="module" nonce="${escapeAttribute(nonce)}" src="${escapeAttribute(script)}"></script>
</body>
</html>
`;
}
