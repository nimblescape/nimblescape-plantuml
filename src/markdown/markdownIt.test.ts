// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests render Markdown with markdown-it, the renderer of the built-in
 * Markdown preview, with and without the plugin. They check the element of a
 * PlantUML block, the attributes that the preview needs for scrolling and for
 * the rendered diff, the settings and the included files (R-GEN-008) of a
 * block, the escaping of the diagram text, the removal of the marks of the
 * rendered diff, and that the plugin changes nothing outside PlantUML blocks
 * (R-MD-006).
 */

import MarkdownIt from 'markdown-it';
import { describe, expect, test } from 'vitest';
import { defaultSettings } from '../settings';
import {
  blockClass,
  contentClass,
  extendMarkdownIt,
  includesAttribute,
  isPlantUmlInfo,
  settingsAttribute,
  sourceAttribute,
  withoutDiffMarkers,
} from './markdownIt';

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
        `<div class="${contentClass}"><pre class="${blockClass}-source"><code>@startuml\nA -&gt; B\n@enduml\n</code></pre></div></div>`,
    );
  });

  test('adds the settings to a PlantUML block only, and only when they differ from the defaults', () => {
    const envs: unknown[] = [];
    const md = extendMarkdownIt(new MarkdownIt(), (rendering) => {
      envs.push(rendering.env);
      return { ...defaultSettings, umlNotation: false };
    });
    const env = { currentDocument: 'a.md' };
    const html = md.render('```plantuml\nA\n```\n\n```js\nx\n```\n', env);
    expect(html).toContain(`${settingsAttribute}="{&quot;umlNotation&quot;:false}"`);
    expect(html.match(new RegExp(settingsAttribute, 'g'))).toHaveLength(1);
    expect(envs).toEqual([env]);
    expect(extendMarkdownIt(new MarkdownIt(), () => defaultSettings).render('```plantuml\nA\n```\n')).not.toContain(settingsAttribute);
    expect(preview(true).render('```plantuml\nA\n```\n')).not.toContain(settingsAttribute);
  });

  test('adds the included files of the text of a PlantUML block, as escaped JSON text, to that block only', () => {
    const calls: unknown[][] = [];
    const md = extendMarkdownIt(new MarkdownIt(), undefined, (rendering, source) => {
      calls.push([rendering.env, source]);
      return source.includes('!include') ? { 'a "b".puml': { text: 'A <&x>' } } : undefined;
    });
    const env = { currentDocument: 'a.md' };
    const html = md.render('```plantuml\n!include a "b".puml\n```\n\n```plantuml\nA\n```\n\n```js\n!include x\n```\n', env);
    expect(html).toContain(`${includesAttribute}="{&quot;a \\&quot;b\\&quot;.puml&quot;:{&quot;text&quot;:&quot;A &lt;&amp;x&gt;&quot;}}"`);
    expect(html.match(new RegExp(includesAttribute, 'g'))).toHaveLength(1);
    expect(calls).toEqual([
      [env, '!include a "b".puml\n'],
      [env, 'A\n'],
    ]);
  });

  test('gives the callbacks the Markdown text of the rendering, without the marks of the rendered diff', () => {
    const texts: (string | undefined)[] = [];
    const md = extendMarkdownIt(new MarkdownIt(), (rendering) => {
      texts.push(rendering.markdown());
      return defaultSettings;
    });
    // The rendered diff renders a side with changes from its text, with marks of the changes and without a document.
    md.render('# A\r\n\r\n```plantuml\r\nclass <span data-diff-start="0"></span>Car<span data-diff-end="0"></span>\r\n```\r\n', {});
    expect(texts).toEqual(['# A\n\n```plantuml\nclass Car\n```\n']);

    // The preview renders the kept tokens of a version again; tokens that another instance parsed have no text here.
    const tokens = md.parse('```plantuml\nA\n```\n', {});
    md.renderer.render(tokens, md.options, {});
    md.renderer.render(new MarkdownIt().parse('```plantuml\nB\n```\n', {}), md.options, {});
    expect(texts.slice(1)).toEqual(['```plantuml\nA\n```\n', undefined]);
  });

  test('renders the same tokens again with the same result, because the preview keeps the tokens of a version', () => {
    let settings = { ...defaultSettings, umlNotation: false };
    const md = extendMarkdownIt(new MarkdownIt({ html: true }).use(sourceMap), () => settings);
    const tokens = md.parse('```plantuml\nA\n```\n', {});
    const first = md.renderer.render(tokens, md.options, {});
    expect(md.renderer.render(tokens, md.options, {})).toBe(first);
    expect(first.match(new RegExp(blockClass, 'g'))).toHaveLength(3);

    // A changed setting reaches the next rendering of the kept tokens.
    settings = defaultSettings;
    expect(md.renderer.render(tokens, md.options, {})).not.toContain(settingsAttribute);
    expect(tokens[0].attrs).toEqual([
      ['data-line', '0'],
      ['class', 'code-line'],
      ['dir', 'auto'],
    ]);
  });

  test('escapes the diagram text in the attribute and in the text', () => {
    const html = preview(true).render('```plantuml\n<script>alert("x")</script> & \'\n```\n');
    expect(html).not.toContain('<script>');
    expect(html).toContain(`${sourceAttribute}="&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; '\n"`);
    expect(html).toContain('<code>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; \'\n</code>');
  });

  test('removes the marks that the rendered diff of VS Code inserts into a changed line', () => {
    // The rendered diff inserts these elements into the Markdown text before markdown-it renders it.
    const start = '<span data-diff-start="0"></span>';
    const end = '<span data-diff-end="0"></span>';
    expect(withoutDiffMarkers(`A -> ${start}Carol${end}`)).toBe('A -> Carol');
    const html = preview(true).render(`\`\`\`plant${start}uml${end}\nA -> ${start}Carol${end}\n\`\`\`\n`);
    expect(html).toContain(`${sourceAttribute}="A -&gt; Carol\n"`);
    expect(html).toContain('<code>A -&gt; Carol\n</code>');
    expect(html).not.toContain('data-diff');
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
