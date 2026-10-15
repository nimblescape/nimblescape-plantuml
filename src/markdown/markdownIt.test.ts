// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests render Markdown with markdown-it, the renderer of the built-in
 * Markdown preview, with and without the plugin. They check the element of a
 * PlantUML block, the attributes that the preview needs for scrolling and for
 * the rendered diff, the escaping of the diagram text, and that the plugin
 * changes nothing outside PlantUML blocks (R-MD-006).
 */

import MarkdownIt from 'markdown-it';
import { describe, expect, test } from 'vitest';
import { blockClass, extendMarkdownIt, isPlantUmlInfo, sourceAttribute } from './markdownIt';

/**
 * sourceMap is the rule of the Markdown preview of VS Code that adds the first source line and the class
 * `code-line` to every block token (extensions/markdown-language-features/src/markdownEngine.ts).
 * @param md - The markdown-it instance.
 */
const sourceMap = (md: MarkdownIt): void => {
  md.core.ruler.push('source_map_data_attribute', (state) => {
    for (const token of state.tokens) {
      if (token.map && token.type !== 'inline') {
        token.attrSet('data-line', String(token.map[0]));
        token.attrJoin('class', 'code-line');
        token.attrJoin('dir', 'auto');
      }
    }
  });
};

/** preview returns a markdown-it instance configured like the Markdown preview, with or without the plugin. */
const preview = (withPlugin: boolean): MarkdownIt => {
  const md = new MarkdownIt({ html: true, linkify: true }).use(sourceMap);
  return withPlugin ? extendMarkdownIt(md) : md;
};

/** document is a Markdown text with every kind of block next to a PlantUML block. */
const document = [
  '# Title',
  '',
  'A paragraph with `code` and a [link](https://example.com).',
  '',
  '```plantuml',
  '@startuml',
  'Alice -> Bob: Hello',
  '@enduml',
  '```',
  '',
  '- item',
  '',
  '```js',
  'const a = 1;',
  '```',
  '',
  '    indented code',
  '',
  '```',
  'no language',
  '```',
  '',
  '<div>html</div>',
  '',
].join('\n');

describe('isPlantUmlInfo', () => {
  test('accepts the info string plantuml in any letter case, also with further words', () => {
    for (const info of ['plantuml', 'PlantUML', ' plantuml ', 'plantuml title="A"']) {
      expect(isPlantUmlInfo(info), info).toBe(true);
    }
  });

  test('rejects other info strings', () => {
    for (const info of ['', 'puml', 'plantumlx', 'js plantuml', 'mermaid']) {
      expect(isPlantUmlInfo(info), info).toBe(false);
    }
  });
});

describe('extendMarkdownIt', () => {
  test('writes a PlantUML block as an element with the diagram text and the attributes of the preview', () => {
    const html = preview(true).render('Text\n\n```plantuml\n@startuml\nA -> B\n@enduml\n```\n');
    expect(html).toContain(
      `<div data-line="2" class="code-line ${blockClass}" dir="auto" ${sourceAttribute}="@startuml\nA -&gt; B\n@enduml\n">` +
        `<pre class="${blockClass}-source"><code>@startuml\nA -&gt; B\n@enduml\n</code></pre></div>`,
    );
  });

  test('escapes the diagram text in the attribute and in the text', () => {
    const html = preview(true).render('```plantuml\n<script>alert("x")</script> & \'\n```\n');
    expect(html).not.toContain('<script>');
    expect(html).toContain(`${sourceAttribute}="&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; '\n"`);
    expect(html).toContain('<code>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; \'\n</code>');
  });

  test('changes nothing outside PlantUML blocks (R-MD-006)', () => {
    const withPlugin = preview(true).render(document);
    const without = preview(false).render(document);
    const plantUmlBlock = /<div data-line="4" class="code-line nimblescape-plantuml"[\s\S]*?<\/div>\n/;
    const plainBlock = /<pre><code data-line="4" class="code-line language-plantuml" dir="auto">[\s\S]*?<\/code><\/pre>\n/;
    expect(withPlugin).toMatch(plantUmlBlock);
    expect(without).toMatch(plainBlock);
    expect(withPlugin.replace(plantUmlBlock, 'BLOCK')).toBe(without.replace(plainBlock, 'BLOCK'));
  });

  test('keeps a fence renderer that the preview or another extension set before', () => {
    const md = preview(false);
    md.renderer.rules.fence = (tokens, idx) => `<custom>${tokens[idx].info}</custom>`;
    extendMarkdownIt(md);
    expect(md.render('```js\nx\n```\n')).toBe('<custom>js</custom>');
    expect(md.render('```plantuml\nx\n```\n')).toContain(`class="code-line ${blockClass}"`);
  });
});
