// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the code completion of PlantUML (R-MD-004, R-PUML-006):
 * the names that a text declares, the proposals at the start of a line and
 * later in a line, the places without proposals, and the range of the word
 * that a proposal replaces.
 */

import { describe, expect, test } from 'vitest';
import { complete, declarations } from './completion';
import { elementKeywords, linkKeywords } from './keywords';

/** labels returns the labels of the declarations of a text. */
const labels = (lines: string[]) => declarations(lines).map((proposal) => proposal.label);

/**
 * at completes at the position of `|` in a text, and returns the result without the `|`.
 * @param text - The lines of the text, one with `|` at the cursor.
 */
function at(...text: string[]) {
  const line = text.findIndex((value) => value.includes('|'));
  const character = text[line].indexOf('|');
  const lines = text.map((value, index) => (index === line ? value.replace('|', '') : value));
  const completion = complete(lines, line, character);
  return { ...completion, labels: completion.proposals.map((proposal) => proposal.label) };
}

describe('declarations', () => {
  test('reads the names that keywords declare, with their kind and their keyword', () => {
    expect(
      declarations([
        'class Car',
        'abstract class Vehicle',
        'interface Shape <<Drawable>>',
        'enum Color {',
        'package shop.model {',
        'participant Alice',
        'actor "Bob the builder" as Bob',
        'database Store as "Main store"',
        'component [Web server] as Web',
        'usecase (Log in)',
        'state "Waiting for input" as Waiting',
      ]),
    ).toEqual([
      { label: 'Car', kind: 'Class', detail: 'class' },
      { label: 'Vehicle', kind: 'Class', detail: 'abstract class' },
      { label: 'Shape', kind: 'Interface', detail: 'interface' },
      { label: 'Color', kind: 'Enum', detail: 'enum' },
      { label: 'shop.model', kind: 'Module', detail: 'package' },
      { label: 'Alice', kind: 'Variable', detail: 'participant' },
      { label: 'Bob', kind: 'Variable', detail: 'actor' },
      { label: 'Store', kind: 'Variable', detail: 'database' },
      { label: 'Web', kind: 'Variable', detail: 'component' },
      { label: '(Log in)', kind: 'Variable', detail: 'usecase' },
      { label: 'Waiting', kind: 'Variable', detail: 'state' },
    ]);
  });

  test('reads the elements of links', () => {
    expect(
      labels([
        'Alice -> Bob : hello',
        'Carol->>Dave++',
        'Erin <-- Frank',
        'Car "1" *-- "4" Wheel : has',
        'java.util.List <|.. java.util.ArrayList',
        '[Web] ..> [Database]',
        ':User: --> (Log in)',
        'A -[#red,dashed]-> B',
        'C -up-> D',
        'E --o F',
        '[*] --> Idle',
      ]),
    ).toEqual([
      'Alice', 'Bob', 'Carol', 'Dave', 'Erin', 'Frank', 'Car', 'Wheel', 'java.util.List', 'java.util.ArrayList',
      '[Web]', '[Database]', ':User:', '(Log in)', 'A', 'B', 'C', 'D', 'E', 'F', '[*]', 'Idle',
    ]);
  });

  test('reads components, use cases, actors, tasks and aliases at the start of a line', () => {
    expect(labels(['[Web server]', '(Log in) as Login', ':Admin:', '[Design] lasts 5 days', '"Long name" as Long'])).toEqual([
      '[Web server]', 'Login', ':Admin:', '[Design]', 'Long',
    ]);
  });

  test('reads notes with an alias and the declarations of the preprocessor', () => {
    expect(
      declarations(['note "Remark" as N1', '!procedure $box($name)', '!unquoted function Twice($x)', '!$color = "red"', '!define LIGHT', '!define BOX(x)']),
    ).toEqual([
      { label: 'N1', kind: 'Variable', detail: 'note' },
      { label: '$box', kind: 'Function', detail: '!procedure' },
      { label: 'Twice', kind: 'Function', detail: '!unquoted function' },
      { label: '$color', kind: 'Variable', detail: '!$variable' },
      { label: 'LIGHT', kind: 'Constant', detail: '!define' },
      { label: 'BOX', kind: 'Function', detail: '!define' },
    ]);
  });

  test('reads each name once and keeps the declaration by a keyword', () => {
    expect(declarations(['Alice -> Bob', 'participant Bob', 'Bob -> Alice'])).toEqual([
      { label: 'Alice', kind: 'Variable' },
      { label: 'Bob', kind: 'Variable', detail: 'participant' },
    ]);
  });

  test('reads no comment, no free text, no line to skip, and no other statement', () => {
    expect(
      labels([
        "' class InComment",
        "/' class InBlockComment",
        "class AlsoInBlockComment '/",
        'note left of Alice',
        '  Text -> Text',
        'end note',
        'class Skipped',
        ':Action;',
        'if (ready) then (yes)',
        '+ field : Type',
        '-- separator --',
        '== Section ==',
        'skinparam classBackgroundColor #fff',
        '@startuml',
      ]),
    ).toEqual(['Skipped']);
    expect(declarations(['class Skipped'], 0)).toEqual([]);
  });
});

describe('complete', () => {
  test('proposes the keywords that start a statement and the declared names at the start of a line', () => {
    const result = at('class Car', '  cl|');
    expect(result.labels).toEqual(expect.arrayContaining(['class', 'participant', 'if', 'title', 'left to right direction', 'Car']));
    expect(result.labels).not.toContain('as');
    expect(result.proposals.find((proposal) => proposal.label === 'class')).toEqual({ label: 'class', kind: 'Keyword' });
    expect(result).toMatchObject({ start: 2, end: 4 });
  });

  test('proposes @start and @end lines after @, and directives after !', () => {
    expect(at('@st|').labels).toEqual(expect.arrayContaining(['@startuml', '@enduml', '@startmindmap', '@endgantt']));
    expect(at('@st|')).toMatchObject({ start: 0, end: 3 });
    expect(at('!in|').labels).toEqual(expect.arrayContaining(['!include', '!procedure', '!theme']));
    expect(at('!in|').labels).not.toContain('class');
  });

  test('proposes the declared names and the link keywords later in a line', () => {
    const result = at('participant Alice', 'participant Bob', 'Alice -> B|');
    expect(result.labels).toEqual(['Alice', 'Bob', ...linkKeywords]);
    expect(result).toMatchObject({ start: 9, end: 10 });
    expect(at('class Car', 'class Wheel', 'Car "1" *-- "4" |').labels).toContain('Wheel');
    expect(at('class Car', 'class Bike', 'note right of |').labels).toContain('Bike');
  });

  test('replaces the whole word and an open quoted name, component or use case', () => {
    expect(at('participant "Long name" as L', 'L -> Lo|ng')).toMatchObject({ start: 5, end: 9 });
    expect(at('[Web server]', 'A --> [We|]')).toMatchObject({ start: 6, end: 10, labels: expect.arrayContaining(['[Web server]']) });
    expect(at('usecase (Log in)', 'User --> (Lo|)')).toMatchObject({ start: 9, end: 13 });
    expect(at('"A" -> "B"', '"A" -> "|"')).toMatchObject({ start: 7, end: 9 });
    expect(at('package shop.model', 'shop.mo|')).toMatchObject({ start: 0, end: 7 });
  });

  test('proposes class after abstract and nothing for the name of a new declaration', () => {
    expect(at('abstract |').labels).toEqual(['class']);
    expect(at('class Car', 'class |').labels).toEqual([]);
    expect(at('class Car', 'participant "Lo|').labels).toEqual([]);
    expect(elementKeywords).toContain('participant');
  });

  test('proposes nothing in comments, free text, labels, actions, skinparam and include lines', () => {
    const empty = [
      at('class Car', "' C|"),
      at('class Car', "/'", 'C|', "'/"),
      at('class Car', 'note left of Car', 'C|', 'end note'),
      at('class Car', 'Car -> Car : C|'),
      at('class Car', 'Car->Car:C|'),
      at('class Car', ':C|'),
      at('class Car', 'skinparam C|'),
      at('class Car', '!include C|'),
    ];
    for (const result of empty) {
      expect(result.labels).toEqual([]);
    }
  });

  test('does not propose the name that the line of the cursor declares', () => {
    expect(at('class Ca|').labels).not.toContain('Ca');
    expect(at('Alice -> Bo|').labels).not.toContain('Alice');
  });
});
