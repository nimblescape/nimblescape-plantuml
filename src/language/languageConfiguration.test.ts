// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the editing rules of the language `plantuml` in
 * `language-configuration.json` that go with the formatting (R-PUML-007): the
 * indentation rules give each line of a formatted text the indentation that
 * the formatter gives it, and the folding markers fold each diagram and the
 * definitions of the preprocessor.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, test } from 'vitest';
import { formatLines } from './formatting';

/** Pattern is a regular expression of the language configuration: its text, or its text with its flags. */
type Pattern = string | { pattern: string; flags?: string };

/** configuration is the language configuration, without its leading comment lines, which VS Code allows. */
const configuration = JSON.parse(
  fs
    .readFileSync(path.resolve(__dirname, '../../language-configuration.json'), 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n'),
);

/**
 * regExp returns the regular expression of a pattern, as VS Code builds it.
 * @param pattern - The pattern.
 */
const regExp = (pattern: Pattern): RegExp => (typeof pattern === 'string' ? new RegExp(pattern) : new RegExp(pattern.pattern, pattern.flags));

const increase = regExp(configuration.indentationRules.increaseIndentPattern);
const decrease = regExp(configuration.indentationRules.decreaseIndentPattern);
const start = regExp(configuration.folding.markers.start);
const end = regExp(configuration.folding.markers.end);

/**
 * reindentLevels returns the level of indentation of each line by the indentation rules, as the command
 * "Reindent Lines" of VS Code computes it (getReindentEditOperations): a line that decreases the indentation is one
 * level lower than the lines before it, and the lines after a line that increases it are one level higher. No level
 * is lower than 0.
 * @param lines - The lines; the first line has the level 0.
 */
function reindentLevels(lines: readonly string[]): number[] {
  let level = 0;
  return lines.map((line, index) => {
    if (index > 0 && decrease.test(line)) {
      level = Math.max(0, level - 1);
    }
    const current = level;
    if (increase.test(line)) {
      level++;
    }
    return current;
  });
}

/**
 * formatted formats lines with two spaces for each level, and returns each line with its level.
 * @param lines - The lines, without indentation.
 */
function formatted(...lines: string[]): { lines: string[]; levels: number[] } {
  const result = formatLines(lines, '  ');
  return { lines: result, levels: result.map((line) => (line.length - line.trimStart().length) / 2) };
}

describe('indentationRules', () => {
  test.each([
    ['the braces of packages, classes, skin parameters and styles', ['package shop {', "' the model", 'class Car {', '- id : int', '}', 'class Bike {}', '}', 'skinparam class {', 'BackgroundColor #fff', '}', '<style>', 'classDiagram {', 'FontColor red', '}', '</style>']],
    ['the groups of sequence diagrams', ['box "Shop" #LightBlue', 'participant Web', 'end box', 'alt success', 'Web -> DB : save', 'loop 3 times', 'DB -> DB : retry', 'end', 'else failure', 'break on error', 'Web -> Web : log', 'end', 'end', 'group Payment [details]', 'Web -> Bank : pay', 'end group', 'par', 'A -> B', 'else', 'B -> C', 'end', 'critical', 'C -> D', 'end']],
    ['the blocks of activity diagrams', ['start', 'if (ready?) then (yes)', ':work;', 'elseif (late?) then (yes)', ':hurry;', 'else if (lost?) then (yes)', ':search;', 'else (no)', 'while (more?) is (yes)', 'repeat', ':read;', 'backward :retry;', 'repeat while (again?)', 'break', 'endwhile', 'endif', 'fork', ':a;', 'fork again', ':b;', 'end merge', 'split', ':c;', 'split again', ':d;', 'end split', 'switch (kind?)', 'case (A)', ':x;', 'case (B)', ':y;', 'endswitch', 'stop']],
    ['the blocks of the preprocessor', ['!procedure $box($name)', '!if $name == "a"', 'rectangle $name', '!elseif $name == "b"', 'card $name', '!else', 'node $name', '!endif', '!endprocedure', '!function $twice($x) !return $x + $x', '!function $half($x)', '!return $x / 2', '!endfunction', '!ifdef SHOW', '!while $i < 3', '!foreach $item in $list', 'class $item', '!endfor', '!endwhile', '!endif', '!startsub PART', 'class A', '!endsub', '!definelong LONG', 'class B', '!enddefinelong']],
  ])('agree with the formatter on %s', (_name, lines) => {
    const text = formatted('@startuml', ...lines, '@enduml');
    expect(reindentLevels(text.lines)).toEqual(text.levels);
  });

  test('indent the free text of a note, a legend, a title, a header, a footer, a caption and a reference of several lines', () => {
    const openings = ['note left of A', 'note as N1', 'rnote over A', 'hnote over A', 'legend right', 'title', 'header', 'right footer', 'caption', 'ref over A, B'];
    const closings = ['end note', 'endnote', 'end rnote', 'endhnote', 'endlegend', 'end title', 'endheader', 'end footer', 'endcaption', 'end ref'];
    expect(openings.filter((line) => !increase.test(line))).toEqual([]);
    expect(closings.filter((line) => !decrease.test(line))).toEqual([]);
    // These notes, titles and references have one line, and open no block.
    const single = ['note left of A : text', 'note "text" as N1', 'title Shop', 'header Page 1', 'caption Figure 1', 'ref over A : step'];
    expect(single.filter((line) => increase.test(line))).toEqual([]);
  });

  test('do not change the indentation for a comment or for a word that starts like a keyword', () => {
    const lines = ["' if this {", 'iframe', 'endpoint -> casement', 'elsewhere', 'Alternative -> B', 'breaker', 'boxer', '!includesub a.puml!B'];
    expect(lines.filter((line) => increase.test(line) || decrease.test(line))).toEqual([]);
  });

  test('outdent the end of the flow inside a condition of an activity diagram, which the formatter keeps indented', () => {
    // A closing `end` belongs to a group of a sequence diagram; inside an `if` it ends the flow, which only the
    // formatter knows. Format Document indents it again.
    const text = formatted('@startuml', 'if (ready?) then (yes)', 'end', 'endif', '@enduml');
    expect(text.levels).toEqual([0, 0, 1, 0, 0]);
    expect(reindentLevels(text.lines)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('folding markers', () => {
  /**
   * foldingRegions returns the regions that the markers fold, as VS Code pairs them: an end marker closes the last
   * open start marker.
   * @param lines - The lines.
   */
  function foldingRegions(lines: readonly string[]): [number, number][] {
    const open: number[] = [];
    const regions: [number, number][] = [];
    lines.forEach((line, index) => {
      if (start.test(line)) {
        open.push(index);
      } else if (end.test(line) && open.length > 0) {
        regions.push([open.pop()!, index]);
      }
    });
    return regions;
  }

  test('fold each diagram, and each procedure, function, sub part and long definition of the preprocessor', () => {
    const lines = [
      '@startuml(id=FIRST)',
      '  !procedure $box($name)',
      '    rectangle $name',
      '  !endprocedure',
      '!function $twice($x) !return $x + $x',
      '!unquoted function $half($x)',
      '!return $x / 2',
      '!endfunction',
      '!startsub PART',
      'class A',
      '!endsub',
      '!definelong LONG',
      'class B',
      '!enddefinelong',
      '@enduml',
      '@startmindmap',
      '* root',
      '@endmindmap',
    ];
    expect(foldingRegions(lines)).toEqual([
      [1, 3],
      [5, 7],
      [8, 10],
      [11, 13],
      [0, 14],
      [15, 17],
    ]);
  });
});
