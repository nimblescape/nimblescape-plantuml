// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The SVG files of the export ([R-GEN-003](../../docs/requirements.md#r-gen-003)):
 * the type of each diagram, the names of the files and their text. The module
 * uses no API of VS Code and no page, so the script of the export page, the
 * extension and the tests can use it.
 *
 * A file with one diagram gives one SVG file with the name of the file, for
 * example `notes.svg` for `notes.md`. A file with several diagrams gives one
 * SVG file for each diagram, named by the file and the type of the diagram,
 * for example `notes-sequence.svg` and `notes-class.svg`; a second diagram of
 * the same type gets a number, for example `notes-sequence-2.svg`
 * ([R-MD-008](../../docs/requirements.md#r-md-008),
 * [R-PUML-009](../../docs/requirements.md#r-puml-009)).
 *
 * The type of a diagram is the word after its `@start`, for example
 * `mindmap` or `gantt`. For `@startuml`, it is the type of UML diagram that
 * PlantUML finds in the text, as PlantUML names it, for example `sequence`,
 * `class`, `activity`, `component`, `state` or `timing`. The SVG image of the
 * engine does not name this type, so the export asks the engine: it renders
 * the lines of the diagram once more with a line that no diagram type accepts
 * before the `@end` line. PlantUML then tries each type, in its own order,
 * and its error message names the type that read the most lines: the type
 * that it uses for the diagram ("Syntax Error? (Assumed diagram type:
 * sequence)").
 */

import { diagramRanges } from './diagramRanges';

/** typeProbeLine is a line that no type of UML diagram of PlantUML accepts, so that the engine reports an error at it. */
export const typeProbeLine = '@@@ !!! ###';

/** umlType is the type of a diagram with `@startuml` whose UML type the engine does not name. */
export const umlType = 'uml';

/**
 * declaredType returns the type of a diagram that its `@start` line names, for example `uml` or `mindmap`, or `uml`
 * for lines without a `@start` line.
 * @param lines - The lines of the diagram that the engine renders.
 */
export const declaredType = (lines: readonly string[]): string => diagramRanges(lines)[0]?.type || umlType;

/**
 * typeProbe returns the lines of a diagram with the line of the probe before its last line, the `@end` line.
 * @param lines - The lines of the diagram that the engine renders, which end with the `@end` line.
 */
export const typeProbe = (lines: readonly string[]): string[] => [...lines.slice(0, -1), typeProbeLine, ...lines.slice(-1)];

/** assumedType matches the end of the error message of PlantUML that names the type of a diagram. */
const assumedType = /\(Assumed diagram type: ([a-z][a-z0-9]*)\)\s*$/i;

/**
 * typeOfError returns the type of a diagram that the error message of PlantUML names, in small letters, or undefined
 * when the message names none.
 * @param message - The error message, for example "Syntax Error? (Assumed diagram type: sequence)".
 */
export const typeOfError = (message: string): string | undefined => assumedType.exec(message)?.[1].toLowerCase();

/**
 * fileType returns the type of a diagram as a part of a file name: small letters and digits only.
 * @param type - The type of the diagram.
 */
const fileType = (type: string): string => type.toLowerCase().replace(/[^a-z0-9]+/g, '') || umlType;

/**
 * baseName returns the name of a file without its last extension, for example `notes` for `notes.md`, as the start of
 * the names of its SVG files. A name that is only an extension, for example `.puml`, stays as it is.
 * @param fileName - The name of the file.
 */
export function baseName(fileName: string): string {
  const base = fileName.replace(/\.[^.]*$/, '');
  return base === '' ? fileName : base;
}

/**
 * svgFileNames returns the name of the SVG file of each diagram of a file, in the order of the diagrams. With one
 * diagram, the name is the base name; with several, the base name and the type of the diagram, and from the second
 * diagram of a type on, its number among the diagrams of that type: `notes-sequence.svg`, `notes-sequence-2.svg`. A
 * diagram without a type, because it has an error, gets no name, and the numbers of the other diagrams do not count
 * it; it still counts as a diagram of the file.
 * @param base - The base name of the file, for example `notes` for `notes.md`.
 * @param types - The type of each diagram of the file, or undefined for a diagram with an error.
 */
export function svgFileNames(base: string, types: readonly (string | undefined)[]): (string | undefined)[] {
  if (types.length === 1) {
    return [types[0] === undefined ? undefined : `${base}.svg`];
  }
  const counts = new Map<string, number>();
  return types.map((type) => {
    if (type === undefined) {
      return undefined;
    }
    const name = fileType(type);
    const count = (counts.get(name) ?? 0) + 1;
    counts.set(name, count);
    return count === 1 ? `${base}-${name}.svg` : `${base}-${name}-${count}.svg`;
  });
}

/** xmlDeclaration is the first line of an SVG file of the export. */
export const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>';

/** xlinkNamespace is the namespace of the attributes `xlink:…` of SVG. */
const xlinkNamespace = 'http://www.w3.org/1999/xlink';

/** svgBackground is the color of the background that svgFile gives an image without one: the white of PlantUML. */
export const svgBackground = '#FFFFFF';

/**
 * svgFile returns the text of an SVG file for the SVG image of the engine: the XML declaration and the image.
 *
 * - In the browser of VS Code, the engine declares the namespace of the attribute `xlink:href`, which it writes for the
 *   image of a sprite, on the element that uses it. An SVG file is XML and needs this declaration, so for an image that
 *   uses the prefix `xlink:` without any declaration, svgFile adds the declaration to the root element.
 * - The engine draws the background of a diagram only when the diagram sets a color other than white, for example with
 *   `skinparam backgroundColor`, and then marks the root element with the style `background-color`. Without it, the
 *   image is transparent, and a viewer with a dark theme hides the black lines and texts of PlantUML. So for an image
 *   without this style, svgFile adds a white rectangle of the size of the image as its first element, as the engine
 *   draws a background.
 *
 * Nothing else of the image changes.
 * @param svg - The SVG text of the engine.
 */
export function svgFile(svg: string): string {
  let text = svg.trim().replace(/^<\?xml\b[^>]*\?>\s*/, '');
  if (/\sxlink:[a-z]/i.test(text) && !/\sxmlns:xlink=/.test(text)) {
    text = text.replace(/^<svg\b/, `<svg xmlns:xlink="${xlinkNamespace}"`);
  }
  return `${xmlDeclaration}\n${withBackground(text)}\n`;
}

/**
 * withBackground returns an SVG image with a white rectangle behind all its elements, of the size of its `viewBox`, or
 * of its `width` and `height` without a `viewBox`. An image whose root element has a background color already stays as
 * it is.
 * @param svg - The SVG text, which starts with the root element.
 */
function withBackground(svg: string): string {
  const root = /^<svg\b[^>]*>/.exec(svg)?.[0];
  if (!root || root.endsWith('/>') || /\sstyle="[^"]*background/i.test(root)) {
    return svg;
  }
  const attribute = (name: string): string | undefined => new RegExp(`\\s${name}="([^"]*)"`).exec(root)?.[1];
  const box = attribute('viewBox')?.trim().split(/[\s,]+/);
  const [x, y, width, height] = box?.length === 4 ? box : ['0', '0', attribute('width') ?? '100%', attribute('height') ?? '100%'];
  return `${root}<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${svgBackground}" stroke="none"/>${svg.slice(root.length)}`;
}
