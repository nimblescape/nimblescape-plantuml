// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the names and the texts of the SVG files of the export
 * (R-GEN-003, R-MD-008, R-PUML-009) and the probe that asks the engine for the
 * type of a UML diagram. `src/engine.test.ts` checks the probe with the real
 * engine.
 */

import { describe, expect, test } from 'vitest';
import { baseName, declaredType, svgFile, svgFileNames, typeOfError, typeProbe, typeProbeLine, xmlDeclaration } from './svgFiles';

describe('svgFileNames', () => {
  test('names the file of the only diagram of a file by the file alone', () => {
    expect(svgFileNames('notes', ['sequence'])).toEqual(['notes.svg']);
    expect(svgFileNames('notes', ['mindmap'])).toEqual(['notes.svg']);
  });

  test('names the file of each of several diagrams by the file and the type of the diagram', () => {
    expect(svgFileNames('notes', ['sequence', 'class', 'mindmap'])).toEqual(['notes-sequence.svg', 'notes-class.svg', 'notes-mindmap.svg']);
  });

  test('numbers the diagrams of the same type from the second one on', () => {
    expect(svgFileNames('notes', ['sequence', 'class', 'sequence', 'sequence', 'class'])).toEqual([
      'notes-sequence.svg',
      'notes-class.svg',
      'notes-sequence-2.svg',
      'notes-sequence-3.svg',
      'notes-class-2.svg',
    ]);
  });

  test('gives a diagram with an error no name, and still counts it as a diagram of the file', () => {
    expect(svgFileNames('notes', [undefined])).toEqual([undefined]);
    // With two diagrams, the file names carry the type, also when one of them has an error.
    expect(svgFileNames('notes', [undefined, 'sequence'])).toEqual([undefined, 'notes-sequence.svg']);
    expect(svgFileNames('notes', ['class', undefined, 'class'])).toEqual(['notes-class.svg', undefined, 'notes-class-2.svg']);
  });

  test('writes a type in small letters and digits only, so that it cannot leave the folder', () => {
    expect(svgFileNames('notes', ['../Sequence', 'a/b\\c'])).toEqual(['notes-sequence.svg', 'notes-abc.svg']);
    expect(svgFileNames('notes', ['', '...'])).toEqual(['notes-uml.svg', 'notes-uml-2.svg']);
  });

  test('has no name for a file without a diagram', () => {
    expect(svgFileNames('notes', [])).toEqual([]);
  });
});

describe('baseName', () => {
  test('removes the last extension of a file name', () => {
    expect(baseName('notes.md')).toBe('notes');
    expect(baseName('shapes.puml')).toBe('shapes');
    expect(baseName('v1.2.wsd')).toBe('v1.2');
    expect(baseName('README')).toBe('README');
  });

  test('keeps a name that is only an extension', () => {
    expect(baseName('.puml')).toBe('.puml');
  });
});

describe('the type of a diagram', () => {
  test('is the word after @start, and uml without a @start line', () => {
    expect(declaredType(['@startmindmap', '* root', '@endmindmap'])).toBe('mindmap');
    expect(declaredType(['  @startgantt', '[A] lasts 1 day', '@endgantt'])).toBe('gantt');
    expect(declaredType(['@startuml', 'class A', '@enduml'])).toBe('uml');
    expect(declaredType(['class A'])).toBe('uml');
  });

  test('of a UML diagram comes from the probe: a line that no type accepts, before the @end line', () => {
    expect(typeProbe(['@startuml', 'skinparam style strictuml', 'Alice -> Bob', '@enduml'])).toEqual([
      '@startuml',
      'skinparam style strictuml',
      'Alice -> Bob',
      typeProbeLine,
      '@enduml',
    ]);
  });

  test('is the type that the error message of PlantUML assumes, in small letters', () => {
    expect(typeOfError('Syntax Error? (Assumed diagram type: sequence)')).toBe('sequence');
    expect(typeOfError('Syntax Error? (Assumed diagram type: Class)')).toBe('class');
    expect(typeOfError('Syntax Error?')).toBeUndefined();
    expect(typeOfError('The extension does not contain the PlantUML library awslib.')).toBeUndefined();
  });
});

describe('svgFile', () => {
  test('puts the XML declaration before the image and ends with a line break', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><g/></svg>';
    expect(svgFile(svg)).toBe(`${xmlDeclaration}\n${svg}\n`);
  });

  test('declares the namespace xlink on the root element of an image that uses it', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:," xlink:href="data:,"/></svg>';
    expect(svgFile(svg)).toBe(
      `${xmlDeclaration}\n<svg xmlns:xlink="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg"><image href="data:," xlink:href="data:,"/></svg>\n`,
    );
  });

  test('keeps a declaration of the namespace xlink, also on the element that uses it, and does not repeat the XML declaration', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="https://plantuml.com"/></svg>';
    expect(svgFile(svg)).toBe(`${xmlDeclaration}\n${svg}\n`);
    expect(svgFile(`<?xml version="1.0"?>\n${svg}`)).toBe(`${xmlDeclaration}\n${svg}\n`);
    // The engine in a browser declares the namespace on the image of a sprite.
    const sprite = '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:," xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="data:,"/></svg>';
    expect(svgFile(sprite)).toBe(`${xmlDeclaration}\n${sprite}\n`);
  });
});
