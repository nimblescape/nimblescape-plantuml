// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests tokenize PlantUML text and Markdown text with the grammars of
 * the extension and the TextMate engine of VS Code (vscode-textmate with
 * vscode-oniguruma). They check the scopes of the parts of PlantUML text, that
 * every keyword of the code completion has a color, and that the injection
 * marks the text of a PlantUML block in Markdown as PlantUML and nothing else
 * (R-MD-003, R-MD-006, R-PUML-005). A minimal Markdown grammar stands in for
 * the Markdown grammar of VS Code; it has the scope of that grammar.
 */

import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, test } from 'vitest';
import * as oniguruma from 'vscode-oniguruma';
import * as textmate from 'vscode-textmate';
import { Grammar, markdownInjectionGrammar, plantUmlGrammar } from './grammars';
import { controlKeywords, documentKeywords, elementKeywords, preprocessorKeywords } from './keywords';

/** markdownGrammar stands in for the Markdown grammar of VS Code: every line is a paragraph. */
const markdownGrammar: Grammar = {
  scopeName: 'text.html.markdown',
  patterns: [{ match: '.+', name: 'meta.paragraph.markdown' }],
  repository: {},
};

let registry: textmate.Registry;

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasm = fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
  await oniguruma.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
  const grammars: Record<string, Grammar> = {
    [plantUmlGrammar.scopeName]: plantUmlGrammar,
    [markdownInjectionGrammar.scopeName]: markdownInjectionGrammar,
    [markdownGrammar.scopeName]: markdownGrammar,
  };
  registry = new textmate.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns) => new oniguruma.OnigScanner(patterns),
      createOnigString: (text) => new oniguruma.OnigString(text),
    }),
    loadGrammar: async (scopeName) => {
      const grammar = grammars[scopeName];
      return grammar ? textmate.parseRawGrammar(JSON.stringify(grammar), `${scopeName}.json`) : null;
    },
    getInjections: (scopeName) => (scopeName === markdownGrammar.scopeName ? [markdownInjectionGrammar.scopeName] : undefined),
  });
});

/** Token is a part of a line with its scopes. */
interface Token {
  text: string;
  scopes: string[];
}

/**
 * tokenize returns the tokens of each line of a text.
 * @param scopeName - The scope of the grammar of the text.
 * @param text - The text.
 */
async function tokenize(scopeName: string, text: string): Promise<Token[][]> {
  const grammar = (await registry.loadGrammar(scopeName))!;
  let state = textmate.INITIAL;
  return text.split('\n').map((line) => {
    const result = grammar.tokenizeLine(line, state);
    state = result.ruleStack;
    return result.tokens.map((token) => ({ text: line.slice(token.startIndex, token.endIndex), scopes: token.scopes }));
  });
}

/**
 * scopeOf returns the innermost scope of the first token of a line whose text is the given text, after trimming.
 * @param lines - The tokens of the lines.
 * @param text - The text of the token.
 */
function scopeOf(lines: Token[][], text: string): string | undefined {
  const token = lines.flat().find((candidate) => candidate.text.trim() === text);
  return token?.scopes.at(-1);
}

describe('source.plantuml', () => {
  test('colors comments, diagram lines, directives, strings, stereotypes, colors and arrows', async () => {
    const lines = await tokenize(
      'source.plantuml',
      [
        '@startuml',
        "' a comment",
        "/' a block",
        "comment '/",
        '!include <C4/C4_Context>',
        '!$name = "value"',
        'class Car <<Entity>> #pink',
        'Alice -> Bob : don\'t',
        'A <|-- B',
        'A ..> B',
        'A -[#red]-> B',
        '@enduml',
      ].join('\n'),
    );
    expect(scopeOf(lines, '@startuml')).toBe('keyword.control.diagram.plantuml');
    expect(scopeOf(lines, "' a comment")).toBe('comment.line.single-quote.plantuml');
    expect(scopeOf(lines, 'comment')).toBe('comment.block.plantuml');
    expect(scopeOf(lines, '!include')).toBe('keyword.control.directive.plantuml');
    expect(scopeOf(lines, '<C4/C4_Context>')).toBe('string.quoted.other.lt-gt.include.plantuml');
    expect(scopeOf(lines, '$name')).toBe('variable.other.plantuml');
    expect(scopeOf(lines, '"value"')).toBe('string.quoted.double.plantuml');
    expect(scopeOf(lines, 'class')).toBe('storage.type.plantuml');
    expect(scopeOf(lines, 'Car')).toBe('entity.name.type.plantuml');
    expect(scopeOf(lines, '<<Entity>>')).toBe('entity.other.attribute-name.stereotype.plantuml');
    expect(scopeOf(lines, '#pink')).toBe('constant.other.color.rgb-value.plantuml');
    for (const arrow of ['->', '<|--', '..>', '-[#red]->']) {
      expect(scopeOf(lines, arrow), arrow).toBe('keyword.operator.arrow.plantuml');
    }
    // A quote inside a line is text, not a comment.
    expect(lines[7].some((token) => token.scopes.some((scope) => scope.startsWith('comment')))).toBe(false);
  });

  test('colors the keywords of statements, and the visibility and the modifiers of members', async () => {
    const lines = await tokenize(
      'source.plantuml',
      ['if (ready) then (yes)', 'else', 'endif', 'fork again', 'class C {', '  #id : int', '  {static} + count : int', '}'].join('\n'),
    );
    expect(scopeOf(lines, 'if')).toBe('keyword.control.plantuml');
    expect(scopeOf(lines, 'then')).toBe('keyword.other.plantuml');
    expect(scopeOf(lines, 'fork again')).toBe('keyword.control.plantuml');
    expect(scopeOf(lines, '#')).toBe('storage.modifier.visibility.plantuml');
    expect(scopeOf(lines, '{static}')).toBe('storage.modifier.plantuml');
  });

  test('colors the rules of a style up to its end, where a rule for notes starts no note', async () => {
    const lines = await tokenize('source.plantuml', ['<style>', 'note {', '  BackGroundColor #ffffcc', '}', '</style>', 'class B'].join('\n'));
    expect(scopeOf(lines, '<style>')).toBe('entity.name.tag.style.plantuml');
    expect(scopeOf(lines, 'note')).toBe('entity.name.tag.selector.plantuml');
    expect(scopeOf(lines, 'BackGroundColor')).toBe('support.type.property-name.plantuml');
    expect(scopeOf(lines, '#ffffcc')).toBe('constant.other.color.rgb-value.plantuml');
    expect(scopeOf(lines, '</style>')).toBe('entity.name.tag.style.plantuml');
    expect(scopeOf(lines, 'class')).toBe('storage.type.plantuml');
  });

  test('keeps the text of a note of several lines free of colors up to its end line', async () => {
    const lines = await tokenize('source.plantuml', ['note left of A', 'if this class is -> here', 'end note', 'class B'].join('\n'));
    expect(lines[1].every((token) => token.scopes.at(-1) === 'meta.text.note.plantuml')).toBe(true);
    expect(scopeOf(lines, 'end note')).toBe('keyword.other.note.plantuml');
    expect(scopeOf(lines, 'class')).toBe('storage.type.plantuml');
  });

  test('colors no hyphen, dot or letter of plain text as an arrow', async () => {
    const lines = await tokenize('source.plantuml', 'Alice -> Bob : a multi-step task - on 2026-10-15, foo-x, an x-ray, o-ring.');
    const arrows = lines[0].filter((token) => token.scopes.includes('keyword.operator.arrow.plantuml')).map((token) => token.text);
    expect(arrows).toEqual(['->']);
    const heads = await tokenize('source.plantuml', ['A --o B', 'A o-- B', 'A ->x B', 'A x<- B', 'Alice->Bob'].join('\n'));
    expect(heads.map((line) => line.find((token) => token.scopes.includes('keyword.operator.arrow.plantuml'))?.text)).toEqual([
      '--o',
      'o--',
      '->x',
      'x<-',
      '->',
    ]);
  });

  test('colors every keyword that the code completion proposes', async () => {
    for (const keyword of [...elementKeywords, ...controlKeywords, ...documentKeywords]) {
      const [line] = await tokenize('source.plantuml', keyword);
      expect(line[0].scopes.at(-1), keyword).toMatch(/^(storage\.type|keyword\.(control|other))\./);
    }
    const directives = await tokenize('source.plantuml', preprocessorKeywords.map((keyword) => `!${keyword}`).join('\n'));
    preprocessorKeywords.forEach((keyword, index) => {
      expect(directives[index][0].scopes.at(-1), keyword).toBe('keyword.control.directive.plantuml');
    });
  });
});

describe('markdown.plantuml.codeblock', () => {
  test('marks the text of a PlantUML block as PlantUML, and nothing before or after it', async () => {
    const lines = await tokenize(
      'text.html.markdown',
      ['Some text with class and ->', '', '```plantuml', 'class Car', '```', 'class after the block', '~~~ PlantUML {title="x"}', "' comment", '~~~'].join('\n'),
    );
    expect(lines[0].every((token) => token.scopes.at(-1) === 'meta.paragraph.markdown')).toBe(true);
    expect(lines[2].find((token) => token.text === 'plantuml')?.scopes.at(-1)).toBe('fenced_code.block.language.markdown');
    expect(lines[3].find((token) => token.text === 'class')?.scopes).toEqual([
      'text.html.markdown',
      'markup.fenced_code.block.markdown',
      'meta.embedded.block.plantuml',
      'storage.type.plantuml',
    ]);
    expect(lines[4][0].scopes.at(-1)).toBe('punctuation.definition.markdown');
    expect(lines[5].every((token) => token.scopes.at(-1) === 'meta.paragraph.markdown')).toBe(true);
    expect(lines[7][0].scopes.at(-1)).toBe('comment.line.single-quote.plantuml');
  });

  test('leaves fenced code blocks of other languages to the Markdown grammar', async () => {
    const lines = await tokenize('text.html.markdown', ['```js', 'class A {}', '```', '```plantumlx', 'class B', '```'].join('\n'));
    expect(lines.flat().some((token) => token.scopes.includes('meta.embedded.block.plantuml'))).toBe(false);
  });
});
