// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the UML notation (R-GEN-007): the commands after each
 * `@startuml` line, the keywords of the declarations, the modifiers of the
 * members, the lines and diagrams that stay as they are, and that nothing is
 * added twice. The forms of the declarations are those that the engine
 * accepted with a stereotype in a test in Chromium.
 */

import { describe, expect, test } from 'vitest';
import { umlCommands, umlNotation, withKeyword, withModifiers } from './umlNotation';

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
      'interface I «interface»',
      'interface Remote <<Service, interface>>',
      'enum E <<enumeration>>',
      'enum E <<enum>>',
      'C ..|> I',
    ]) {
      expect(withKeyword(line), line).toBe(line);
    }
  });
});

describe('withModifiers', () => {
  test('writes the modifiers static and abstract at the start of a member as modifiers of PlantUML', () => {
    const cases: [string, string][] = [
      ['+ static count() : int', '+ {static} count() : int'],
      ['  - static int max', '  - {static} int max'],
      ['#abstract void park()', '#{abstract} void park()'],
      ['abstract drive() : void', '{abstract} drive() : void'],
      ['~ static final String NAME', '~ {static} final String NAME'],
      ['+ final static int MAX', '+ final {static} int MAX'],
      ['static abstract Ä()', '{static} {abstract} Ä()'],
    ];
    for (const [line, expected] of cases) {
      expect(withModifiers(line), line).toBe(expected);
    }
  });

  test('leaves members with a modifier of PlantUML and other lines as they are', () => {
    for (const line of [
      '+ {static} count() : int',
      '+ {classifier} static count() : int',
      '{abstract} abstract drive()',
      '- id : int',
      '+ staticCount : int',
      'static : boolean',
      '-- static members --',
      'final int MAX',
    ]) {
      expect(withModifiers(line), line).toBe(line);
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

  test('changes a diagram without an @enduml line up to the end of the text', () => {
    expect(umlNotation(['@startuml', 'interface I'])).toEqual(['@startuml', ...umlCommands, 'interface I <<interface>>']);
  });

  test('does not add a command that the diagram sets itself', () => {
    const cases: [string[], string[]][] = [
      [['skinparam style strictuml'], ['skinparam classAttributeIconSize 0']],
      [['SkinParam Style StrictUML'], ['skinparam classAttributeIconSize 0']],
      [['skinparam classAttributeIconSize 8'], ['skinparam style strictuml']],
      [['skinparam class {', '  AttributeIconSize 8', '}'], ['skinparam style strictuml']],
      [['skinparam style strictuml', 'skinparam classAttributeIconSize 0'], []],
      [["' skinparam style strictuml"], umlCommands as string[]],
    ];
    for (const [body, added] of cases) {
      expect(umlNotation(['@startuml', ...body, '@enduml']), body.join('\n')).toEqual(['@startuml', ...added, ...body, '@enduml']);
    }
  });

  test('writes the modifiers of the members in the body of a class only', () => {
    const body = [
      'package shop {',
      'abstract class Vehicle {',
      '+ static count() : int',
      '+ abstract drive() : void',
      '}',
      'interface Movable {',
      '+ abstract move() : void',
      '}',
      'static Thing',
      '}',
      'skinparam class {',
      '  abstract Value',
      '}',
    ];
    expect(umlNotation(['@startuml', ...body, '@enduml'])).toEqual([
      '@startuml',
      ...umlCommands,
      'package shop {',
      'abstract class Vehicle {',
      '+ {static} count() : int',
      '+ {abstract} drive() : void',
      '}',
      'interface Movable <<interface>> {',
      '+ {abstract} move() : void',
      '}',
      'static Thing',
      '}',
      'skinparam class {',
      '  abstract Value',
      '}',
      '@enduml',
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

  test('counts only statements as the marks of a component or use case diagram', () => {
    const body = [
      'class Worker {',
      '  port : int',
      '  queue : Queue<Job>',
      '}',
      'note left of Worker',
      '  (not a use case)',
      '  [not a component]',
      'end note',
      ':Step 1: read;',
      '[*] --> Idle',
      'interface Task',
    ];
    expect(umlNotation(['@startuml', ...body, '@enduml'])).toContain('interface Task <<interface>>');
  });

  test('checks the stereotypes of a long line in a short time', () => {
    // A check that searches the rest of the line for each `<` takes seconds here.
    const line = `interface X ${'<'.repeat(50_000)}`;
    const started = performance.now();
    expect(umlNotation(['@startuml', line, '@enduml'])).toContain(`interface X <<interface>> ${'<'.repeat(50_000)}`);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(withKeyword('interface X <<a>> <<interface>>')).toBe('interface X <<a>> <<interface>>');
    expect(withKeyword('interface X <<a, interface>>')).toBe('interface X <<a, interface>>');
    expect(withKeyword('interface X <<a>> interface')).toBe('interface X <<interface>> <<a>> interface');
  });

  test('changes the declarations after a style, also after a rule for notes', () => {
    const body = ['<style>', 'note {', '  BackGroundColor #ffffcc', '}', '</style>', 'interface Task', 'class Worker {', '  static count : int', '}'];
    expect(umlNotation(['@startuml', ...body, '@enduml']).slice(3)).toEqual([
      ...body.slice(0, 5),
      'interface Task <<interface>>',
      'class Worker {',
      '  {static} count : int',
      '}',
      '@enduml',
    ]);
  });
});
