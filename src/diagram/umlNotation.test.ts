// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the UML notation for class diagrams (R-GEN-007): the
 * commands after each `@startuml` line, the keywords of the declarations,
 * and the lines and diagrams that stay as they are. The forms of the
 * declarations are those that the engine accepted with a stereotype in a
 * test in Chromium.
 */

import { describe, expect, test } from 'vitest';
import { umlCommands, umlNotation, withKeyword } from './umlNotation';

describe('withKeyword', () => {
  test('adds the UML keyword of each class kind after the name', () => {
    const cases: [string, string][] = [
      ['interface Shape', 'interface Shape <<interface>>'],
      ['enum Color {', 'enum Color <<enumeration>> {'],
      ['annotation Deprecated', 'annotation Deprecated <<annotation>>'],
      ['protocol P', 'protocol P <<protocol>>'],
      ['struct S', 'struct S <<struct>>'],
      ['exception Failure', 'exception Failure <<exception>>'],
      ['metaclass M', 'metaclass M <<metaclass>>'],
      ['stereotype T', 'stereotype T <<stereotype>>'],
      ['record R', 'record R <<record>>'],
      ['dataclass D', 'dataclass D <<dataclass>>'],
    ];
    for (const [line, expected] of cases) {
      expect(withKeyword(line), line).toBe(expected);
    }
  });

  test('accepts the forms of a name, generic parameters, and the rest of the declaration', () => {
    const cases: [string, string][] = [
      ['  interface "Long name" as L', '  interface "Long name" as L <<interface>>'],
      ['interface I as "Long name"', 'interface I as "Long name" <<interface>>'],
      ['interface "I"', 'interface "I" <<interface>>'],
      ['interface java.util.List<E> extends Collection', 'interface java.util.List<E> <<interface>> extends Collection'],
      ['interface Map<K, V> #pink {', 'interface Map<K, V> <<interface>> #pink {'],
      ['interface Remote <<Service>>', 'interface Remote <<interface>> <<Service>>'],
      ['interface Ä{', 'interface Ä <<interface>>{'],
    ];
    for (const [line, expected] of cases) {
      expect(withKeyword(line), line).toBe(expected);
    }
  });

  test('leaves other lines, nested generic parameters and existing keywords as they are', () => {
    for (const line of [
      'class C',
      'abstract class A',
      'entity E',
      "' interface I",
      'interfaces are listed below',
      'interface Map<K, List<V>>',
      'interface A as B',
      'interface I <<Interface>>',
      'enum E <<enumeration>>',
      'C ..|> I',
    ]) {
      expect(withKeyword(line), line).toBe(line);
    }
  });
});

describe('umlNotation', () => {
  test('puts the commands after each @startuml line and adds the keywords in its diagram', () => {
    const lines = ['@startuml', 'interface I', '@enduml', '@startuml', 'enum E', '@enduml'];
    expect(umlNotation(lines)).toEqual([
      '@startuml', ...umlCommands, 'interface I <<interface>>', '@enduml',
      '@startuml', ...umlCommands, 'enum E <<enumeration>>', '@enduml',
    ]);
  });

  test('leaves the diagrams of other types as they are, because they reject the commands', () => {
    const lines = ['@startgantt', '[Task] lasts 3 days', '@endgantt'];
    expect(umlNotation(lines)).toEqual(lines);
  });

  test('adds no keyword in a component or use case diagram, where an interface is a circle', () => {
    for (const marker of ['[A] - I', 'component C', 'actor A', '(Use) --> I', ':User:', 'usecase/ U', 'queue Q']) {
      expect(umlNotation(['@startuml', marker, 'interface I', '@enduml']), marker).toEqual(['@startuml', ...umlCommands, marker, 'interface I', '@enduml']);
    }
  });

  test('adds no keyword in comments and in notes, titles, legends, headers and footers of several lines', () => {
    const body = [
      "/' interface A",
      'interface B',
      "'/",
      "/' interface C '/",
      'note left of X',
      'interface D',
      'end note',
      'note as N',
      'interface E',
      'endnote',
      'legend',
      'interface F',
      'endlegend',
      'title',
      'interface G',
      'end title',
      'left header',
      'interface H',
      'endheader',
      'note right of X : interface J',
      'interface K',
    ];
    const result = umlNotation(['@startuml', ...body, '@enduml']);
    expect(result.filter((line) => line.includes('<<interface>>'))).toEqual(['interface K <<interface>>']);
  });
});
