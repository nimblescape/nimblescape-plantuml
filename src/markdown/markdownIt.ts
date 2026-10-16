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
 *
 * The rendered diff of VS Code changes the page in two ways that matter here.
 * First, it inserts empty `span` elements with the attribute `data-diff-start`
 * or `data-diff-end` into the Markdown text around each changed part of a
 * line, before markdown-it renders the text. In a code block these elements
 * are plain text, so the plugin removes them from the diagram text. Second, it
 * adds a bar for a changed block as a child of the element of the block. For
 * this reason, the diagram goes into an inner content element, and the preview
 * script changes only the shadow root of that content element.
 */

import type MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it';
import { defaultSettings, isDefault, Settings } from '../settings';

/** blockClass is the class of the element of a PlantUML block, which the preview script looks for. */
export const blockClass = 'nimblescape-plantuml';

/** contentClass is the class of the inner element of a PlantUML block that shows the text or the diagram. */
export const contentClass = `${blockClass}-content`;

/**
 * textClass is the class of the element in the content element that holds the text of a PlantUML block. The preview
 * script hides it while the block shows its diagrams, and shows it below the message of an error.
 */
export const textClass = `${blockClass}-source`;

/** sourceAttribute is the attribute that carries the text of a PlantUML block to the preview script. */
export const sourceAttribute = 'data-plantuml-source';

/**
 * settingsAttribute is the attribute that carries the settings of the extension
 * ([R-GEN-007](../../docs/requirements.md#r-gen-007)) to the preview script, as JSON text. A block with the default
 * settings has no such attribute.
 */
export const settingsAttribute = 'data-plantuml-settings';

/**
 * diffMarker matches an empty element that the rendered diff of VS Code inserts into the Markdown text at the
 * start or at the end of a changed part of a line
 * (extensions/markdown-language-features/src/preview/documentRenderer.ts).
 */
const diffMarker = /<span data-diff-(?:start|end)="\d+"><\/span>/g;

/**
 * withoutDiffMarkers removes the elements that the rendered diff of VS Code inserts into the Markdown text.
 * @param text - A text of the Markdown document.
 */
export function withoutDiffMarkers(text: string): string {
  return text.replace(diffMarker, '');
}

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
 * @param settings - Returns the settings for a rendering; it receives the environment of the rendering, in which
 *   the preview names the document. It runs on every rendering, so a changed setting applies to the next one.
 * @returns The same instance.
 */
export function extendMarkdownIt(
  md: MarkdownIt,
  settings: (env: unknown) => Readonly<Settings> = () => defaultSettings,
): MarkdownIt {
  const fence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (!isPlantUmlInfo(withoutDiffMarkers(token.info))) {
      return fence ? fence(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
    }
    const source = withoutDiffMarkers(token.content);
    // The Markdown preview keeps the tokens of a version of the document for its next rendering, so the attributes
    // of the element are a copy: the token stays as it is.
    const attributes = new Map(token.attrs ?? []);
    attributes.set('class', [attributes.get('class'), blockClass].filter(Boolean).join(' '));
    attributes.set(sourceAttribute, source);
    const values = settings(env);
    if (!isDefault(values)) {
      attributes.set(settingsAttribute, JSON.stringify(values));
    }
    // renderAttrs escapes the attribute values, so the diagram text is safe in the attribute. The preview script
    // hides the text before the page shows it; the text stays when the preview runs no scripts.
    const element = { attrs: [...attributes] } as Token;
    return (
      `<div${self.renderAttrs(element)}><div class="${contentClass}">` +
      `<pre class="${textClass}"><code>${md.utils.escapeHtml(source)}</code></pre></div></div>\n`
    );
  };
  return md;
}
