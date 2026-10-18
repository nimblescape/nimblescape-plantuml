// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The TextMate grammars of the syntax highlighting
 * ([R-PUML-005](../../docs/requirements.md#r-puml-005),
 * [R-MD-003](../../docs/requirements.md#r-md-003)). The build (`esbuild.mjs`)
 * writes them as JSON files into `dist/syntaxes/`, where the manifest points
 * to them. They are TypeScript objects, so that they take their words from
 * `keywords.ts`, the lists of the code completion.
 *
 * The grammar `source.plantuml` colors PlantUML text. The grammar
 * `markdown.nimblescape.plantuml.codeblock` is an injection into the Markdown
 * grammar of VS Code: it marks the text of a fenced code block with the info
 * string `plantuml` as PlantUML and colors it with `source.plantuml`. It
 * matches no other text of a Markdown file, so the rest of the file keeps its
 * colors ([R-MD-006](../../docs/requirements.md#r-md-006)). The name of the
 * injection contains the publisher, so that it differs from the injection of
 * another PlantUML extension.
 *
 * The scopes follow the naming conventions of TextMate, so that every color
 * theme colors them: `comment`, `string`, `keyword.control`, `storage.type`,
 * `entity.name.type`, `entity.other.attribute-name`, `variable` and
 * `constant`.
 *
 * In the body of a class, an interface, an enum or another classifier, the
 * members get the scopes that the grammars of programming languages give
 * them: `entity.name.function` for an operation, `variable.other.property`
 * for an attribute, `variable.parameter` for a parameter, `entity.name.type`
 * for a type and `variable.other.enummember` for a value of an enum. So a
 * color theme colors them as in code, whatever language the diagram
 * describes. The grammar takes the parts of a member only from the notation
 * of UML, for example `name : Type` and `name(param : Type) : Type`, and does
 * not guess: a member in another order, for example `int count`, keeps the
 * color of plain text.
 */

import { controlKeywords, diagramTypes, documentKeywords, elementKeywords, linkKeywords, preprocessorKeywords } from './keywords';

/** Rule is a rule of a TextMate grammar. */
export interface Rule {
  name?: string;
  contentName?: string;
  match?: string;
  begin?: string;
  end?: string;
  while?: string;
  captures?: Record<string, Rule>;
  beginCaptures?: Record<string, Rule>;
  endCaptures?: Record<string, Rule>;
  patterns?: Rule[];
  include?: string;
}

/** Grammar is a TextMate grammar. */
export interface Grammar {
  scopeName: string;
  name?: string;
  injectionSelector?: string;
  patterns: Rule[];
  repository: Record<string, Rule>;
}

/**
 * alternatives returns a regular expression that matches one of the words, longest first, with any white space
 * between the parts of a word of several parts.
 * @param words - The words.
 */
const alternatives = (words: readonly string[]): string =>
  [...words]
    .sort((a, b) => b.length - a.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'))
    .join('|');

/** leftHead matches the head of an arrow on its left side, for example `<`, `<|`, `*` or `o`. */
const leftHead = String.raw`(?:(?<!\w)[ox])?<\|?|<<|(?<!\w)[ox](?=[-.=~]{2})|(?<!\w)[*#}{+^]|[\\/]`;

/** rightHead matches the head of an arrow on its right side, for example `>`, `|>`, `*` or `o`. */
const rightHead = String.raw`\|?>>?(?:[ox](?!\w))?|[*#}{+^\\/]|(?<=[-.=~]{2})[ox](?!\w)`;

/** name matches the name of an element without quotes. */
const name = String.raw`[\p{L}\p{N}_.:$]+`;

/**
 * classifierKeywords declare an element whose body `{ … }` holds members: attributes, operations or the values of an
 * enum.
 */
const classifierKeywords: readonly string[] = [
  'class', 'interface', 'abstract', 'enum', 'annotation', 'protocol', 'struct', 'exception', 'metaclass', 'stereotype',
  'record', 'dataclass', 'entity', 'object',
];

/** identifier matches the name of a member, a parameter or a type. */
const identifier = String.raw`[\p{L}_$][\p{L}\p{N}_$]*`;

/** modifier matches a modifier of a member, for example `{static}`. */
const modifier = String.raw`\{(?:static|abstract|classifier|field|method)\}`;

/**
 * memberPrefix matches the visibility (`-`, `#`, `~` or `+`) and the modifiers at the start of a member, in any order.
 * Two visibility characters, as in the separator `-- text --`, start no member.
 */
const memberPrefix = String.raw`((?:${modifier}\s*)*(?:[-#~+](?![-#~+])\s*)?(?:${modifier}\s*)*)`;

/**
 * typeArguments matches the type arguments of a generic type, for example `<String, List<Map<K, V>>>`, nested three
 * levels deep. `<<` starts a stereotype, not type arguments.
 */
const typeArguments = String.raw`<(?!<)(?:[^<>]|<(?:[^<>]|<[^<>]*>)*>)*>`;

/**
 * typeText matches a type after a colon, for example `int`, `List<Book>` or `Book[0..*]`. It stops before a comment
 * `/'`. It is possessive, so that a long line does not make the regular expression try every split of its spaces.
 */
const typeText = String.raw`(?:[^,=(){}<>/]|/(?!')|${typeArguments})++`;

/**
 * classifierBody returns the rule of a classifier with a body of members, from its declaration, for example
 * `class Book {`, up to the line with `}`.
 * @param keywords - The keywords that declare the classifier.
 * @param kind - The last part of the scope of the body, for example `class`.
 * @param patterns - The rules of the lines of the body.
 */
const classifierBody = (keywords: readonly string[], kind: string, patterns: Rule[]): Rule => ({
  begin: String.raw`^\s*(?:(abstract)\s+)?(${alternatives(keywords)})\b(?:\s+(${name}))?([^{]*)(\{)\s*$`,
  // A body that is not closed yet, while you type, ends at the end of the diagram.
  end: String.raw`^\s*(\})|^(?=\s*@end)`,
  beginCaptures: {
    1: { name: 'storage.modifier.plantuml' },
    2: { name: 'storage.type.plantuml' },
    3: { name: 'entity.name.type.plantuml' },
    4: { patterns: [{ include: '#declaration-rest' }] },
  },
  contentName: `meta.body.${kind}.plantuml`,
  patterns: [{ include: '#member-comments' }, { include: '#preprocessor' }, { include: '#separator' }, ...patterns],
});

/** plantUmlGrammar colors PlantUML text. */
export const plantUmlGrammar: Grammar = {
  scopeName: 'source.plantuml',
  name: 'PlantUML',
  patterns: [
    { include: '#block-comment' },
    { include: '#line-comment' },
    { include: '#diagram-delimiter' },
    { include: '#preprocessor' },
    { include: '#style' },
    { include: '#text-block' },
    { include: '#skinparam' },
    { include: '#classifier' },
    { include: '#declaration' },
    { include: '#compound-statement' },
    { include: '#statement' },
    { include: '#visibility' },
    { include: '#inline' },
  ],
  repository: {
    'block-comment': {
      name: 'comment.block.plantuml',
      begin: "/'",
      end: "'/",
      beginCaptures: { 0: { name: 'punctuation.definition.comment.begin.plantuml' } },
      endCaptures: { 0: { name: 'punctuation.definition.comment.end.plantuml' } },
    },
    'line-comment': {
      // A quote starts a comment only at the start of a line; elsewhere it is text, as in "don't".
      match: String.raw`^\s*('.*)$`,
      captures: { 1: { name: 'comment.line.single-quote.plantuml' } },
    },
    'diagram-delimiter': {
      match: String.raw`^\s*(@(?:start|end)(?:${alternatives(diagramTypes)}|[a-z]+))\b(.*)$`,
      captures: { 1: { name: 'keyword.control.diagram.plantuml' }, 2: { patterns: [{ include: '#strings' }] } },
    },
    preprocessor: {
      name: 'meta.preprocessor.plantuml',
      match: String.raw`^\s*(!(?:${alternatives(preprocessorKeywords)})\b|!(?=\$))(.*)$`,
      captures: {
        1: { name: 'keyword.control.directive.plantuml' },
        2: {
          patterns: [
            { match: String.raw`<[^<>\s]+>`, name: 'string.quoted.other.lt-gt.include.plantuml' },
            { include: '#strings' },
            { include: '#variables' },
          ],
        },
      },
    },
    style: {
      // A style holds rules up to `</style>`, also `note { … }`, which starts no note.
      begin: String.raw`^\s*(<style>)`,
      end: String.raw`(</style>)`,
      beginCaptures: { 1: { name: 'entity.name.tag.style.plantuml' } },
      endCaptures: { 1: { name: 'entity.name.tag.style.plantuml' } },
      contentName: 'meta.style.plantuml',
      patterns: [
        { include: '#block-comment' },
        { include: '#line-comment' },
        {
          match: String.raw`^\s*([^{}\s][^{}]*?)\s*(\{)`,
          captures: { 1: { name: 'entity.name.tag.selector.plantuml' } },
        },
        {
          match: String.raw`^\s*([A-Za-z][\w-]*)(?=\s)`,
          captures: { 1: { name: 'support.type.property-name.plantuml' } },
        },
        { include: '#strings' },
        { include: '#colors' },
      ],
    },
    'text-block': {
      // A note, legend, title, header, footer or caption of several lines holds free text up to its end line. A
      // line that ends with `{` starts no free text.
      patterns: [
        {
          begin: String.raw`^\s*([rh]?note)\b(?![^\n]*:)(?![^\n]*\{\s*$)(?!\s+")(.*)$`,
          end: String.raw`^\s*(end[ \t]?[rh]?note)\b`,
          beginCaptures: { 1: { name: 'keyword.other.note.plantuml' }, 2: { patterns: [{ include: '#inline' }] } },
          endCaptures: { 1: { name: 'keyword.other.note.plantuml' } },
          contentName: 'meta.text.note.plantuml',
        },
        {
          begin: String.raw`^\s*(legend)\b(?![^\n]*\{\s*$)(.*)$`,
          end: String.raw`^\s*(end[ \t]?legend)\b`,
          beginCaptures: { 1: { name: 'keyword.other.legend.plantuml' } },
          endCaptures: { 1: { name: 'keyword.other.legend.plantuml' } },
          contentName: 'meta.text.legend.plantuml',
        },
        {
          begin: String.raw`^\s*((?:(?:left|right|center)\s+)?(?:title|header|footer|caption))\s*$`,
          end: String.raw`^\s*(end[ \t]?(?:title|header|footer|caption))\b`,
          beginCaptures: { 1: { name: 'keyword.other.title.plantuml' } },
          endCaptures: { 1: { name: 'keyword.other.title.plantuml' } },
          contentName: 'meta.text.title.plantuml',
        },
      ],
    },
    skinparam: {
      match: String.raw`^\s*(skinparam)\b\s*([\w.]+)?`,
      captures: { 1: { name: 'keyword.other.skinparam.plantuml' }, 2: { name: 'support.type.property-name.plantuml' } },
    },
    classifier: {
      // A class, an interface, an enum or another classifier with a body of members, from `class Book {` up to `}`.
      patterns: [
        classifierBody(['enum'], 'enum', [{ include: '#enum-value' }, { include: '#members' }]),
        classifierBody(
          classifierKeywords.filter((keyword) => keyword !== 'enum'),
          'class',
          [{ include: '#members' }],
        ),
      ],
    },
    'declaration-rest': {
      patterns: [
        { match: String.raw`\b(?:${alternatives(linkKeywords)})\b`, name: 'keyword.other.plantuml' },
        { include: '#inline' },
      ],
    },
    'member-comments': {
      patterns: [{ include: '#block-comment' }, { include: '#line-comment' }],
    },
    separator: {
      // A line that separates the members, with or without a title, for example `--`, `..`, `==`, `__` or `.. Getters ..`.
      // A title ends with the same two characters as the start, so that `__str__()` is no separator.
      match: String.raw`^\s*(--|\.\.|==|__)(?:.*\1)?\s*$`,
      name: 'meta.separator.plantuml',
    },
    'enum-value': {
      // A single word in the body of an enum is a value of the enum, also with `,`, `;` or a value after `=`.
      match: String.raw`^\s*${memberPrefix}(${identifier})\s*(?:[,;]\s*|=.*)?$`,
      captures: {
        1: { patterns: [{ include: '#member-prefix' }] },
        2: { name: 'variable.other.enummember.plantuml' },
      },
    },
    members: {
      patterns: [
        {
          // An operation: `name(param : Type) : Type`, also without parameters or without the type of its result. The
          // word before `(` is its name; words before the name, as in `void print()`, keep the color of plain text.
          // `{field}` makes a member an attribute, also with parentheses.
          match: String.raw`^(?!.*\{field\})\s*${memberPrefix}(?:([^():=]*?)\s+)?(${identifier})\s*(\()([^()]*)(\))\s*+(?:(:)\s*+(${typeText}))?\s*+((?:\{|<<|/').*)?$`,
          captures: {
            1: { patterns: [{ include: '#member-prefix' }] },
            2: { patterns: [{ include: '#inline' }] },
            3: { name: 'entity.name.function.plantuml' },
            5: { patterns: [{ include: '#parameters' }] },
            8: { patterns: [{ include: '#type' }] },
            9: { patterns: [{ include: '#inline' }] },
          },
        },
        {
          // An attribute: `name : Type`, `name : Type = value`, `name = value` or only `name`. A `/` marks a derived
          // attribute. `{method}` makes a member an operation, also without parentheses.
          match: String.raw`^(?!.*\{method\})\s*${memberPrefix}(/?)(${identifier})(?:\s*+(:)\s*+(${typeText})?)?\s*+((?:=|\{|<<|/').*)?$`,
          captures: {
            1: { patterns: [{ include: '#member-prefix' }] },
            3: { name: 'variable.other.property.plantuml' },
            5: { patterns: [{ include: '#type' }] },
            6: { patterns: [{ include: '#inline' }] },
          },
        },
        { include: '#visibility' },
        { include: '#inline' },
      ],
    },
    'member-prefix': {
      patterns: [{ include: '#modifiers' }, { match: '[-#~+]', name: 'storage.modifier.visibility.plantuml' }],
    },
    parameters: {
      // The parameters of an operation: `name : Type`, also with a direction (`in`, `out`, `inout`) or a default value.
      patterns: [
        {
          match: String.raw`(?:\b(in|out|inout)\s+)?(${identifier})\s*(:)\s*(${typeText})`,
          captures: {
            1: { name: 'storage.modifier.plantuml' },
            2: { name: 'variable.parameter.plantuml' },
            4: { patterns: [{ include: '#type' }] },
          },
        },
        { include: '#inline' },
      ],
    },
    type: {
      patterns: [{ match: identifier, name: 'entity.name.type.plantuml' }],
    },
    declaration: {
      match: String.raw`^\s*(?:(abstract)\s+)?(${alternatives(elementKeywords)})\b(?:\s+(${name}))?(.*)$`,
      captures: {
        1: { name: 'storage.modifier.plantuml' },
        2: { name: 'storage.type.plantuml' },
        3: { name: 'entity.name.type.plantuml' },
        4: { patterns: [{ include: '#declaration-rest' }] },
      },
    },
    'compound-statement': {
      // A statement of two words, for example `end note`, `fork again` or `repeat while`.
      match: String.raw`^\s*((?:end|repeat|fork|split)\s+(?:${alternatives(['fork', 'split', 'box', 'group', 'note', 'rnote', 'hnote', 'legend', 'while', 'again', 'merge', 'switch', 'title', 'header', 'footer'])}))\b(.*)$`,
      captures: {
        1: { name: 'keyword.control.plantuml' },
        2: { patterns: [{ match: String.raw`\b(?:is)\b`, name: 'keyword.other.plantuml' }, { include: '#inline' }] },
      },
    },
    statement: {
      match: String.raw`^\s*(${alternatives([...controlKeywords, ...documentKeywords])})\b(.*)$`,
      captures: {
        1: { name: 'keyword.control.plantuml' },
        2: {
          patterns: [
            { match: String.raw`\b(?:then|is|${alternatives(linkKeywords)})\b`, name: 'keyword.other.plantuml' },
            { include: '#inline' },
          ],
        },
      },
    },
    visibility: {
      // The visibility of a member at the start of its line, so that `#id` is no color.
      match: String.raw`^\s*([-#~+])(?=\s*[\p{L}_{])`,
      captures: { 1: { name: 'storage.modifier.visibility.plantuml' } },
    },
    inline: {
      patterns: [
        { include: '#block-comment' },
        { include: '#strings' },
        { include: '#stereotypes' },
        { include: '#modifiers' },
        { include: '#colors' },
        { include: '#arrows' },
        { include: '#variables' },
      ],
    },
    strings: {
      name: 'string.quoted.double.plantuml',
      match: '"[^"]*"',
    },
    stereotypes: {
      name: 'entity.other.attribute-name.stereotype.plantuml',
      match: '<<[^<>]*>>',
    },
    modifiers: {
      name: 'storage.modifier.plantuml',
      match: modifier,
    },
    colors: {
      name: 'constant.other.color.rgb-value.plantuml',
      match: String.raw`#(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{3}|[A-Za-z][A-Za-z0-9]*)\b`,
    },
    arrows: {
      // An arrow has a head on one side at least, or a body of two characters or more. A letter head (o, x)
      // stands apart from words and needs a body of two characters or an arrow head next to it, so that a
      // word such as "x-ray" is no arrow.
      name: 'keyword.operator.arrow.plantuml',
      match: [
        String.raw`(?:${leftHead})?[-.=~]+(?:\[[^\]]*\]|up|down|left|right)?[-.=~]*(?:${rightHead})`,
        String.raw`(?:${leftHead})[-.=~]+(?:\[[^\]]*\]|up|down|left|right)?[-.=~]*`,
        String.raw`[-.=~]+\[[^\]]*\][-.=~]+`,
        String.raw`[-.=~]{2,}`,
      ].join('|'),
    },
    variables: {
      patterns: [
        { match: String.raw`%\w+(?=\()`, name: 'support.function.builtin.plantuml' },
        { match: String.raw`\$\w+`, name: 'variable.other.plantuml' },
      ],
    },
  },
};

/**
 * markdownInjectionGrammar marks a fenced code block with the info string `plantuml` in a Markdown file as
 * PlantUML. Its regular expressions for the fences come from the fenced code blocks of the Markdown grammar of
 * VS Code (https://github.com/microsoft/vscode-markdown-tm-grammar, Copyright (c) Microsoft 2018, MIT License;
 * THIRD-PARTY-NOTICES.md holds the license): the fence of three backticks or tildes or more, the info string, and
 * the closing fence of the same kind. The info string follows the rule of the preview (`isPlantUmlInfo` in
 * `src/markdown/markdownIt.ts`): its first word is `plantuml` in any letter case, and further words follow after a
 * space. As in CommonMark, the info string of a fence of backticks has no backtick.
 */
export const markdownInjectionGrammar: Grammar = {
  scopeName: 'markdown.nimblescape.plantuml.codeblock',
  injectionSelector: 'L:text.html.markdown',
  patterns: [{ include: '#fenced-code-block' }],
  repository: {
    'fenced-code-block': {
      name: 'markup.fenced_code.block.markdown',
      begin:
        String.raw`(^|\G)(\s*)(` +
        '`{3,}' +
        String.raw`(?=\s*(?i:plantuml)(?:\s[^` +
        '`' +
        String.raw`]*)?$)|~{3,})\s*(?i:(plantuml))(\s.*)?$`,
      end: String.raw`(^|\G)(\2|\s{0,3})(\3)\s*$`,
      beginCaptures: {
        3: { name: 'punctuation.definition.markdown' },
        4: { name: 'fenced_code.block.language.markdown' },
        5: { name: 'fenced_code.block.language.attributes.markdown' },
      },
      endCaptures: { 3: { name: 'punctuation.definition.markdown' } },
      patterns: [
        {
          begin: String.raw`(^|\G)(\s*)(.*)`,
          while: String.raw`(^|\G)(?!\s*([` + '`' + String.raw`~]{3,})\s*$)`,
          contentName: 'meta.embedded.block.plantuml',
          patterns: [{ include: 'source.plantuml' }],
        },
      ],
    },
  },
};

/** grammarFiles maps the file names in `dist/syntaxes/` to the grammars. */
export const grammarFiles: Readonly<Record<string, Grammar>> = {
  'plantuml.tmLanguage.json': plantUmlGrammar,
  'markdown-plantuml.tmLanguage.json': markdownInjectionGrammar,
};
