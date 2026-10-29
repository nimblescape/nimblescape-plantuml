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
 * The element also carries the texts of the files that the diagrams of the
 * block include ([R-GEN-008](../../docs/requirements.md#r-gen-008)), which
 * the extension reads, because the preview script cannot read files. They are
 * the text of a hidden child element, not the value of an attribute: the
 * Markdown preview allows the styles of the document and images from the
 * internet, and a style rule can select an element by the start of the value
 * of an attribute and load an image for it, so that the value of an attribute
 * could reach an address of the internet character by character. A style rule
 * cannot select an element by its text.
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
 * are plain text, so the plugin removes them from the diagram text. Such a
 * text reaches markdown-it without its document, so the plugin also gives the
 * callbacks the Markdown text of the rendering, by which the extension finds
 * the document. Second, it adds a bar for a changed block as a child of the
 * element of the block. For this reason, the diagram goes into an inner
 * content element, and the preview script changes only the shadow root of
 * that content element.
 */

import type MarkdownIt from 'markdown-it';
import type { Token } from 'markdown-it';
import { IncludedFiles } from '../diagram/includes';
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
 * includesClass is the class of the hidden child element of a PlantUML block whose text carries the files that the
 * diagrams of the block include ([R-GEN-008](../../docs/requirements.md#r-gen-008)) to the preview script, as JSON
 * text. A block whose diagrams include no file has no such element.
 */
export const includesClass = `${blockClass}-includes`;

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
 * Rendering is a rendering of the preview, as the callbacks of the plugin receive it.
 */
export interface Rendering {
  /** env is the environment of the rendering, in which the preview names its document as `currentDocument`. */
  readonly env: unknown;
  /**
   * markdown returns the Markdown text of the rendering with the line breaks `\n` of markdown-it, without the elements
   * that the rendered diff inserts, or undefined when the plugin did not see the parsing of the text.
   */
  markdown(): string | undefined;
}

/**
 * markdownTexts holds the Markdown text of each parsing, by the tokens of the parsing, which the renderer receives.
 * The preview keeps the tokens of a version of a document, so the text stays as long as these tokens.
 */
const markdownTexts = new WeakMap<Token[], string>();

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
 * @param settings - Returns the settings for a rendering. It runs on every rendering, so a changed setting applies to
 *   the next one.
 * @param includes - Returns the files that the diagrams of the text of a block include, as far as the extension has
 *   read them, or undefined for a text that includes no file; it receives the rendering and the text.
 * @returns The same instance.
 */
export function extendMarkdownIt(
  md: MarkdownIt,
  settings: (rendering: Rendering) => Readonly<Settings> = () => defaultSettings,
  includes: (rendering: Rendering, source: string) => IncludedFiles | undefined = () => undefined,
): MarkdownIt {
  // The last rule of the parsing keeps the text, after the plugins that may replace the list of the tokens.
  md.core.ruler.push('nimblescape_plantuml_text', (state) => {
    markdownTexts.set(state.tokens, state.src);
  });
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
    const rendering: Rendering = {
      env,
      markdown: () => {
        const text = markdownTexts.get(tokens);
        return text === undefined ? undefined : withoutDiffMarkers(text);
      },
    };
    const values = settings(rendering);
    if (!isDefault(values)) {
      attributes.set(settingsAttribute, JSON.stringify(values));
    }
    const files = includes(rendering, source);
    const included = files ? `<div class="${includesClass}" hidden>${md.utils.escapeHtml(JSON.stringify(files))}</div>` : '';
    // renderAttrs escapes the attribute values, so the diagram text is safe in the attribute. The preview script
    // hides the text before the page shows it; the text stays when the preview runs no scripts.
    const element = { attrs: [...attributes] } as Token;
    return (
      `<div${self.renderAttrs(element)}><div class="${contentClass}">` +
      `<pre class="${textClass}"><code>${md.utils.escapeHtml(source)}</code></pre></div>${included}</div>\n`
    );
  };
  return md;
}
