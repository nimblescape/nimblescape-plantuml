// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the formatting of PlantUML text (R-MD-005, R-PUML-007):
 * the indentation of the blocks of class, activity and sequence diagrams and
 * of the preprocessor, the single spaces inside statements, the lines that
 * keep their text, and the diagrams of other types, which stay as they are.
 */

import { describe, expect, test } from 'vitest';
import { formatLines } from './formatting';

/**
 * format formats a text with two spaces for each level.
 * @param text - The lines of the text, with any indentation.
 */
const format = (...text: string[]) => formatLines(text.map((line) => line.trimStart()), '  ');

describe('formatLines', () => {
  test('indents the braces of packages, classes and skin parameters, and the line comments', () => {
    expect(
      format(
        '@startuml',
        'package shop {',
        "' the model",
        'class Car {',
        '- id : int',
        '+ drive() : void',
        '}',
        'class Bike {}',
        '}',
        'skinparam class {',
        'BackgroundColor #fff',
        '}',
        '@enduml',
      ),
    ).toEqual([
      '@startuml',
      'package shop {',
      "  ' the model",
      '  class Car {',
      '    - id : int',
      '    + drive() : void',
      '  }',
      '  class Bike {}',
      '}',
      'skinparam class {',
      '  BackgroundColor #fff',
      '}',
      '@enduml',
    ]);
  });

  test('indents the blocks of activity diagrams, and keeps the end of the flow inside an if', () => {
    expect(
      format(
        'start',
        'if (ready?) then (yes)',
        ':work;',
        'elseif (late?) then (yes)',
        'end',
        'else (no)',
        'while (more?) is (yes)',
        'repeat',
        ':read;',
        'backward :retry;',
        'repeat while (again?)',
        'break',
        'endwhile',
        'endif',
        'fork',
        ':a;',
        'fork again',
        ':b;',
        'end fork',
        'switch (kind?)',
        'case (A)',
        ':x;',
        'endswitch',
        'stop',
      ),
    ).toEqual([
      'start',
      'if (ready?) then (yes)',
      '  :work;',
      'elseif (late?) then (yes)',
      '  end',
      'else (no)',
      '  while (more?) is (yes)',
      '    repeat',
      '      :read;',
      '    backward :retry;',
      '    repeat while (again?)',
      '    break',
      '  endwhile',
      'endif',
      'fork',
      '  :a;',
      'fork again',
      '  :b;',
      'end fork',
      'switch (kind?)',
      'case (A)',
      '  :x;',
      'endswitch',
      'stop',
    ]);
  });

  test('indents the groups of sequence diagrams', () => {
    expect(
      format(
        'box "Shop" #LightBlue',
        'participant Web',
        'end box',
        'alt success',
        'Web -> DB : save',
        'loop 3 times',
        'DB -> DB : retry',
        'end',
        'else failure',
        'break on error',
        'Web -> Web : log',
        'end',
        'end',
        'group Payment [details]',
        'Web -> Bank : pay',
        'end group',
      ),
    ).toEqual([
      'box "Shop" #LightBlue',
      '  participant Web',
      'end box',
      'alt success',
      '  Web -> DB : save',
      '  loop 3 times',
      '    DB -> DB : retry',
      '  end',
      'else failure',
      '  break on error',
      '    Web -> Web : log',
      '  end',
      'end',
      'group Payment [details]',
      '  Web -> Bank : pay',
      'end group',
    ]);
  });

  test('indents the blocks of the preprocessor and the style', () => {
    expect(
      format(
        '!procedure $box($name)',
        '!if $name == "a"',
        'rectangle $name',
        '!else',
        'card $name',
        '!endif',
        '!endprocedure',
        '!function $twice($x) !return $x + $x',
        '<style>',
        'classDiagram {',
        'FontColor red',
        '}',
        '</style>',
      ),
    ).toEqual([
      '!procedure $box($name)',
      '  !if $name == "a"',
      '    rectangle $name',
      '  !else',
      '    card $name',
      '  !endif',
      '!endprocedure',
      '!function $twice($x) !return $x + $x',
      '<style>',
      '  classDiagram {',
      '    FontColor red',
      '  }',
      '</style>',
    ]);
  });

  test('keeps the free text of notes and the lines of block comments, and moves an action with its first line', () => {
    const lines = [
      'package p {',
      'note left of A',
      '    free  text   ',
      'end note',
      ':first line',
      '     second line',
      '',
      'third line;',
      "/' comment",
      "   inside '/",
      '}',
    ];
    expect(formatLines(lines, '  ')).toEqual([
      'package p {',
      '  note left of A',
      '    free  text   ',
      '  end note',
      '  :first line',
      '       second line',
      '',
      '  third line;',
      "/' comment",
      "   inside '/",
      '}',
    ]);
  });

  test('keeps the diagrams of other types as they are, and formats each UML diagram of a text', () => {
    const lines = ['  @startmindmap', '* root', '  * child  ', '@endmindmap', ' text between', '  @startuml', 'package p {', 'class A', '}', ' @enduml  '];
    expect(formatLines(lines, '\t')).toEqual([
      '  @startmindmap', '* root', '  * child  ', '@endmindmap', ' text between', '@startuml', 'package p {', '\tclass A', '}', '@enduml',
    ]);
  });

  test('writes one space for each run of spaces and tabs in a statement, outside quoted and monospaced text', () => {
    expect(
      format(
        '@startuml',
        'class Car {',
        '- type:             string',
        '+ getTank():\tTank',
        '}',
        'Car -right->            "1"       Tank     :      tank',
        'A -> B : ""mono   space""  and "quoted   text"   end',
        'C -> D : 5"   screen    rest',
        "'   comment    text",
        'note left of A',
        'free   text',
        'end note',
        '@enduml',
      ),
    ).toEqual([
      '@startuml',
      'class Car {',
      '  - type: string',
      '  + getTank(): Tank',
      '}',
      'Car -right-> "1" Tank : tank',
      'A -> B : ""mono   space"" and "quoted   text" end',
      'C -> D : 5"   screen    rest',
      "'   comment    text",
      'note left of A',
      'free   text',
      'end note',
      '@enduml',
    ]);
  });

  test('puts the base before every formatted line, removes the spaces at the end, and keeps empty lines empty', () => {
    expect(formatLines(['package p {  ', '   ', 'class A', '}'], '  ', '  ')).toEqual(['  package p {', '', '    class A', '  }']);
  });

  test('gives the same result when it formats a formatted text again', () => {
    const text = ['@startuml', 'alt x', 'if (a) then', 'A  ->   B : "a  b"', 'endif', 'end', 'package p {', 'note as N', 'x', 'end note', '}', '@enduml'];
    const formatted = formatLines(text, '  ');
    expect(formatLines(formatted, '  ')).toEqual(formatted);
  });
});
