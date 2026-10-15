// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The markdown-it plugin of the built-in Markdown preview
 * ([R-MD-001](../../docs/requirements.md#r-md-001)). It changes the output of
 * a fenced code block with the info string `plantuml` only: such a block
 * becomes an element that carries the diagram text, and the preview script
 * (`src/preview/markdownPreview.ts`) renders the diagram into it. Every other
 * token keeps the output of the preview
 * ([R-MD-006](../../docs/requirements.md#r-md-006)).
 *
 * The element keeps the attributes that the preview gives to the token of the
 * block, among them `data-line` and the class `code-line`. The preview needs
 * them to synchronize the scrolling with the editor and to mark the block in a
 * rendered diff ([R-MD-002](../../docs/requirements.md#r-md-002)).
 */

import type MarkdownIt from 'markdown-it';

/** blockClass is the class of the element of a PlantUML block, which the preview script looks for. */
export const blockClass = 'nimblescape-plantuml';

/** sourceAttribute is the attribute that carries the text of a PlantUML block to the preview script. */
export const sourceAttribute = 'data-plantuml-source';

/**
 * isPlantUmlInfo tells whether the info string of a fenced code block names PlantUML: its first word is
 * `plantuml`, in any letter case.
 * @param info - The info string of the block, the text after the opening fence.
 */
export function isPlantUmlInfo(info: string): boolean {
  return info.trim().split(/\s+/, 1)[0].toLowerCase() === 'plantuml';
}

/**
 * extendMarkdownIt adds the rendering of PlantUML blocks to a markdown-it instance. The Markdown extension of
 * VS Code calls it for the preview, through the export of the same name of the extension.
 * @param md - The markdown-it instance of the preview.
 * @returns The same instance.
 */
export function extendMarkdownIt(md: MarkdownIt): MarkdownIt {
  const fence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (!isPlantUmlInfo(token.info)) {
      return fence ? fence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
    }
    // renderAttrs escapes the attribute values, so the diagram text is safe in the attribute.
    token.attrJoin('class', blockClass);
    token.attrSet(sourceAttribute, token.content);
    // The text of the block shows until the diagram replaces it, and stays when the preview runs no scripts.
    return `<div${self.renderAttrs(token)}><pre class="${blockClass}-source"><code>${md.utils.escapeHtml(token.content)}</code></pre></div>\n`;
  };
  return md;
}
