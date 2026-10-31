// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// The types of the library of @nimblescape/plantuml (dist/index.js). The type of markdown-it comes from the package
// @types/markdown-it of the program that uses markdown-it.

import type MarkdownIt from 'markdown-it';

/** Settings are the values of the settings of nimblescape PlantUML that change the diagrams. */
export interface Settings {
  /** umlNotation renders UML diagrams in the notation of the UML standard; `false` shows the notation of PlantUML. */
  umlNotation: boolean;
}

/** settingsSection is the section of the settings in VS Code: `nimblescape.plantuml`. */
export declare const settingsSection: string;

/** defaultSettings are the values of the settings that the user did not set. */
export declare const defaultSettings: Readonly<Settings>;

/**
 * settingsOf reads the settings from settings of VS Code, as the parsed object of a file `settings.json`, for example
 * `.vscode/settings.json` of a repository: the keys `nimblescape.plantuml.<name>`. A missing or invalid value gets its
 * default.
 */
export declare function settingsOf(values: unknown): Settings;

/**
 * readSettings reads the settings from the file `.vscode/settings.json` of a folder, as VS Code reads the settings of a
 * workspace folder: JSON with comments and with commas after the last element. A missing file or a file that is no
 * JSON object gives the default settings, and a missing or invalid value its default.
 * @param folder - The path of the folder, for example the top folder of a repository.
 */
export declare function readSettings(folder: string): Settings;

/**
 * parseJsonWithComments parses JSON with comments and with commas after the last element of an object or an array, as
 * VS Code reads its settings files.
 * @throws When the text is no JSON without the comments and these commas.
 */
export declare function parseJsonWithComments(text: string): unknown;

/** IncludedFile is the text of an included file, or the problem that keeps it from the diagram. */
export type IncludedFile = { text: string } | { problem: string };

/** IncludedFiles are the included files of the diagrams of a PlantUML block, by the paths of their include lines. */
export type IncludedFiles = Readonly<Record<string, IncludedFile>>;

/**
 * readIncludedFiles returns the files that the diagrams of the text of a PlantUML block include, read from the disk
 * with the rules of the extension: paths relative to the folder of the document, only files in that folder and in the
 * given folders, also as the target of a symbolic link, up to 1 MB each. It returns undefined for a text whose diagrams
 * include no file.
 * @param document - The path of the Markdown file of the block.
 * @param text - The text of the block.
 * @param folders - The folders besides the folder of the document, as the workspace folders of VS Code.
 */
export declare function readIncludedFiles(document: string, text: string, folders?: readonly string[]): IncludedFiles | undefined;

/** Rendering is a rendering of markdown-it, as the callbacks of the plugin receive it. */
export interface Rendering {
  /** env is the environment of the rendering. */
  readonly env: unknown;
  /** markdown returns the Markdown text of the rendering, or undefined. */
  markdown(): string | undefined;
}

/**
 * extendMarkdownIt adds the PlantUML blocks to a markdown-it instance, as the extension adds them to the Markdown
 * preview of VS Code: a fenced code block with the info string `plantuml` becomes an element with the diagram text,
 * the settings and the included files, which the script of the page (`@nimblescape/plantuml/page/markdownPreview.js`)
 * renders. Every other token keeps its output.
 * @param md - The markdown-it instance.
 * @param settings - Returns the settings for a rendering; by default the default settings.
 * @param includes - Returns the included files of the text of a block, for example with readIncludedFiles; by
 *   default none.
 * @returns The same instance.
 */
export declare function extendMarkdownIt(
  md: MarkdownIt,
  settings?: (rendering: Rendering) => Readonly<Settings>,
  includes?: (rendering: Rendering, source: string) => IncludedFiles | undefined,
): MarkdownIt;

/** blockClass is the class of the element of a PlantUML block. */
export declare const blockClass: string;
/** contentClass is the class of the inner element of a block, whose open shadow root shows the diagrams. */
export declare const contentClass: string;
/** textClass is the class of the element in the content element that holds the text of a block. */
export declare const textClass: string;
/** sourceAttribute is the attribute of a block element with its diagram text. */
export declare const sourceAttribute: string;
/** settingsAttribute is the attribute of a block element with its settings as JSON text, when they are not the defaults. */
export declare const settingsAttribute: string;
/** stateAttribute is the attribute of the content element: `pending` while the block waits for its diagrams, `drawn` when it shows them. */
export declare const stateAttribute: string;
/** pageIncludesClass is the class of the hidden element after the last block with the included files of the page. */
export declare const pageIncludesClass: string;

/** maxFileSize is the size in bytes of the largest included file. */
export declare const maxFileSize: number;
/** includeProblems are the messages of the problems of an included file, by the path of its include line. */
export declare const includeProblems: {
  readonly unsaved: (path: string) => string;
  readonly unknown: (path: string) => string;
  readonly outside: (path: string) => string;
  readonly linkOutside: (path: string) => string;
  readonly folder: (path: string) => string;
  readonly tooLarge: (path: string) => string;
  readonly missing: (path: string) => string;
  readonly unreadable: (path: string, message: string) => string;
};
