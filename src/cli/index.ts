// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The library of the npm package `@nimblescape/plantuml` in `cli/`
 * ([R-NPM-001](../../docs/requirements.md#r-npm-001)): the renderer of the
 * extension for other programs, such as nimblescape Markdown Paper, so that a
 * diagram on their pages and in their PDF files looks as in the Markdown
 * preview of VS Code. The extension and the package build from the same
 * sources.
 *
 * - The markdown-it plugin writes a PlantUML block as an element with the
 *   diagram text, the settings and the included files (`extendMarkdownIt`).
 * - The settings come from the settings of VS Code (`settingsOf`), for
 *   example of the file `.vscode/settings.json` of a folder (`readSettings`),
 *   the included files from the disk (`readIncludedFiles`).
 * - The page that shows the diagrams loads the script, the style sheet and the
 *   engine of the folder `page/` of the package
 *   ([R-MD-007](../../docs/requirements.md#r-md-007)).
 */

export { includeProblems, maxFileSize } from '../diagram/includeProblems';
export type { IncludedFile, IncludedFiles } from '../diagram/includes';
export {
  blockClass,
  contentClass,
  extendMarkdownIt,
  pageIncludesClass,
  type Rendering,
  settingsAttribute,
  sourceAttribute,
  stateAttribute,
  textClass,
} from '../markdown/markdownIt';
export { defaultSettings, type Settings, settingsOf, settingsSection } from '../settings';
export { readIncludedFiles } from './diskIncludes';
export { parseJsonWithComments, readSettings } from './diskSettings';
