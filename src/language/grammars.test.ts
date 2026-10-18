// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests tokenize PlantUML text and Markdown text with the grammars of
 * the extension and the TextMate engine of VS Code (vscode-textmate with
 * vscode-oniguruma). They check the scopes of the parts of PlantUML text, that
 * every keyword of the code completion has a color, and that the injection
 * marks the text of a PlantUML block in Markdown as PlantUML and nothing else,
 * by the same rule as the preview and the editor features (R-MD-003, R-MD-006,
 * R-PUML-005). A minimal Markdown grammar stands in for the Markdown grammar
 * of VS Code; it has the scope of that grammar.
 */

import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, test } from 'vitest';
import * as oniguruma from 'vscode-oniguruma';
import * as textmate from 'vscode-textmate';
import MarkdownIt from 'markdown-it';
import { plantUmlBlocks } from '../markdown/blocks';
import { blockClass, extendMarkdownIt, isPlantUmlInfo } from '../markdown/markdownIt';
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

  test('colors the members of a classifier by the notation of UML, as the grammars of programming languages do', async () => {
    const lines = await tokenize(
      'source.plantuml',
      [
        'abstract class Book<T> extends Item {',
        '  - title : String',
        '  # pages : int = 0',
        '  + {static} create(title : String, in size : int = 1) : Book',
        '  print()',
        '  /age : Integer',
        '  items : Map<String, List<Book>>',
        '  count',
        '  void close()',
        '  .. Getters ..',
        "  ' a comment",
        '}',
        'enum Color {',
        '  RED',
        '  + label() : String',
        '}',
        'object user {',
        '  name = "Dummy"',
        '}',
      ].join('\n'),
    );
    const scope = (line: number, text: string) => lines[line].find((token) => token.text.trim() === text)?.scopes.at(-1);
    expect(scope(0, 'Book')).toBe('entity.name.type.plantuml');
    expect(scope(0, 'extends')).toBe('keyword.other.plantuml');
    expect([scope(1, '-'), scope(1, 'title'), scope(1, 'String')]).toEqual([
      'storage.modifier.visibility.plantuml',
      'variable.other.property.plantuml',
      'entity.name.type.plantuml',
    ]);
    expect([scope(2, 'pages'), scope(2, 'int')]).toEqual(['variable.other.property.plantuml', 'entity.name.type.plantuml']);
    expect([scope(3, '{static}'), scope(3, 'create'), scope(3, 'title'), scope(3, 'in'), scope(3, 'size'), scope(3, 'Book')]).toEqual([
      'storage.modifier.plantuml',
      'entity.name.function.plantuml',
      'variable.parameter.plantuml',
      'storage.modifier.plantuml',
      'variable.parameter.plantuml',
      'entity.name.type.plantuml',
    ]);
    expect(lines[3].filter((token) => token.text === 'String' || token.text === 'int').map((token) => token.scopes.at(-1))).toEqual([
      'entity.name.type.plantuml',
      'entity.name.type.plantuml',
    ]);
    expect(scope(4, 'print')).toBe('entity.name.function.plantuml');
    expect(scope(5, 'age')).toBe('variable.other.property.plantuml');
    expect(lines[6].filter((token) => token.scopes.at(-1) === 'entity.name.type.plantuml').map((token) => token.text)).toEqual([
      'Map',
      'String',
      'List',
      'Book',
    ]);
    expect(scope(7, 'count')).toBe('variable.other.property.plantuml');
    // Words before the name of an operation are not in UML order: they keep the color of plain text.
    expect([scope(8, 'void'), scope(8, 'close')]).toEqual(['meta.body.class.plantuml', 'entity.name.function.plantuml']);
    expect(scope(9, '.. Getters ..')).toBe('meta.separator.plantuml');
    expect(scope(10, "' a comment")).toBe('comment.line.single-quote.plantuml');
    expect(scope(13, 'RED')).toBe('variable.other.enummember.plantuml');
    expect([scope(14, 'label'), scope(14, 'String')]).toEqual(['entity.name.function.plantuml', 'entity.name.type.plantuml']);
    expect([scope(17, 'name'), scope(17, '"Dummy"')]).toEqual(['variable.other.property.plantuml', 'string.quoted.double.plantuml']);
  });

  test('colors no member that is not in UML notation, and nothing outside the body of a classifier', async () => {
    const lines = await tokenize(
      'source.plantuml',
      [
        'class Book {',
        '  int count',
        '  Radius float64',
        '  {field} A field (with parentheses)',
        '  -- encrypted --',
        '}',
        'class Empty {}',
        'title : String',
        'Alice -> Bob : print()',
        'state Idle : count',
      ].join('\n'),
    );
    const member = /^(variable\.(other\.property|parameter|other\.enummember)|entity\.name\.function)\.|^entity\.name\.type\.plantuml$/;
    // The lines with a declaration color the name of the element, as before.
    for (const [index, line] of lines.entries()) {
      const colored = line.filter((token) => member.test(token.scopes.at(-1) ?? '')).map((token) => token.text);
      expect(colored, `line ${index + 1}`).toEqual({ 0: ['Book'], 6: ['Empty'], 9: ['Idle'] }[index] ?? []);
    }
    expect(lines[3].find((token) => token.text === '{field}')?.scopes.at(-1)).toBe('storage.modifier.plantuml');
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

describe('markdown.nimblescape.plantuml.codeblock', () => {
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

  test('marks the same blocks as the preview and the editor features, by one rule for the info string', async () => {
    const md = extendMarkdownIt(new MarkdownIt({ html: true }));
    const infos = ['plantuml', 'PlantUML', ' plantuml', 'plantuml title="A"', 'plantuml\tx', 'plantuml {.x}', 'plantuml:a.puml', 'plantuml{.x}'];
    const others = ['plantuml,x', 'plantuml?x', 'plantumlx', '{.plantuml}', 'puml', 'js plantuml', 'plantuml `x`'];
    for (const fence of ['```', '~~~']) {
      for (const info of [...infos, ...others]) {
        const lines = [`${fence}${info}`, 'class A', fence];
        const highlighted = (await tokenize('text.html.markdown', lines.join('\n'))).flat().some((token) => token.scopes.includes('meta.embedded.block.plantuml'));
        const rendered = md.render(lines.join('\n')).includes(`class="${blockClass}"`);
        const edited = plantUmlBlocks(lines).length > 0;
        expect([highlighted, edited], `${fence}${info}`).toEqual([rendered, rendered]);
      }
    }
    // The rule takes the first word: a fence of tildes may have a backtick in its info string, a fence of backticks may not.
    expect(isPlantUmlInfo('plantuml:a.puml')).toBe(false);
    expect(md.render('~~~plantuml `x`\nclass A\n~~~')).toContain(`class="${blockClass}"`);
    expect(md.render('```plantuml `x`\nclass A\n```')).not.toContain(`class="${blockClass}"`);
  });

  test('colors the members of a class in a PlantUML block, and ends the body of the class with the block', async () => {
    const lines = await tokenize(
      'text.html.markdown',
      ['```plantuml', 'class Book {', '  title : String', '```', 'title : String', '```plantuml', 'class A', '```'].join('\n'),
    );
    expect(lines[2].find((token) => token.text === 'title')?.scopes.at(-1)).toBe('variable.other.property.plantuml');
    expect(lines[4].every((token) => token.scopes.at(-1) === 'meta.paragraph.markdown')).toBe(true);
    expect(lines[6].find((token) => token.text === 'class')?.scopes.at(-1)).toBe('storage.type.plantuml');
  });

  test('leaves fenced code blocks of other languages to the Markdown grammar', async () => {
    const lines = await tokenize('text.html.markdown', ['```js', 'class A {}', '```', '```plantumlx', 'class B', '```'].join('\n'));
    expect(lines.flat().some((token) => token.scopes.includes('meta.embedded.block.plantuml'))).toBe(false);
  });
});
