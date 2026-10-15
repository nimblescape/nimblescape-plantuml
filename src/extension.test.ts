// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests run the activation of the extension with a fake of the API of
 * VS Code. They check that the export renders PlantUML blocks with the lines
 * of the settings of the document, and that a change of a setting of the
 * extension refreshes the Markdown previews (R-GEN-007).
 */

import MarkdownIt from 'markdown-it';
import { beforeEach, expect, test, vi } from 'vitest';
import { settingsAttribute } from './markdown/markdownIt';
import { settingsSection } from './settings';

/** FakeUri stands for a vscode.Uri; the extension only passes it on. */
interface FakeUri {
  scheme: string;
  path: string;
}

/** settingsOf holds the values of the settings of the fake, by the path of a document; '' is the window. */
let settingsOf: Map<string, Record<string, unknown>>;
/** requests records the reads of the settings: the section and the path of the document. */
let requests: [string, string][];
/** commands records the executed commands. */
let commands: string[];
/** configurationListeners are the listeners for a change of the settings. */
let configurationListeners: ((event: { affectsConfiguration(section: string): boolean }) => void)[];

beforeEach(() => {
  settingsOf = new Map();
  requests = [];
  commands = [];
  configurationListeners = [];
  vi.resetModules();
  vi.doMock('vscode', () => ({
    workspace: {
      getConfiguration: (section: string, scope?: FakeUri) => {
        requests.push([section, scope?.path ?? '']);
        const values = settingsOf.get(scope?.path ?? '') ?? {};
        return { get: (key: string, fallback?: unknown) => (key in values ? values[key] : fallback) };
      },
      onDidChangeConfiguration: (listener: (typeof configurationListeners)[number]) => {
        configurationListeners.push(listener);
        return { dispose() {} };
      },
    },
    commands: {
      executeCommand: async (command: string) => {
        commands.push(command);
      },
    },
  }));
});

/** activate imports the extension with the fake API and activates it. */
const activate = async () => {
  const extension = await import('./extension');
  const context = { subscriptions: [] as { dispose(): void }[] };
  return { api: extension.activate(context as never), context, extension };
};

/** block is a Markdown text with one PlantUML block. */
const block = '```plantuml\nclass A\n```\n';

test('the module exports activate and deactivate', async () => {
  const { extension } = await activate();
  expect(typeof extension.deactivate).toBe('function');
});

test('the export renders PlantUML blocks without settings by default', async () => {
  const { api } = await activate();
  const md = api.extendMarkdownIt(new MarkdownIt());
  expect(md.render(block)).not.toContain(settingsAttribute);
});

test('the export reads the settings of the rendered document and adds them to the block', async () => {
  const { api } = await activate();
  const md = api.extendMarkdownIt(new MarkdownIt());
  const document: FakeUri = { scheme: 'file', path: '/folder/a.md' };
  settingsOf.set(document.path, { classIcons: false });
  expect(md.render(block, { currentDocument: document })).toContain(`${settingsAttribute}="{&quot;classIcons&quot;:false}"`);
  expect(requests).toEqual([[settingsSection, document.path]]);

  // A text without a document gets the settings of the window, which keep the icons here.
  expect(md.render(block)).not.toContain(settingsAttribute);
  expect(requests.at(-1)).toEqual([settingsSection, '']);
});

test('a change of a setting of the extension refreshes the Markdown previews, a change of another setting does not', async () => {
  const { context } = await activate();
  expect(context.subscriptions).toHaveLength(1);
  const change = (changed: string) => configurationListeners.forEach((listener) => listener({ affectsConfiguration: (section) => section === changed }));
  change('editor');
  expect(commands).toEqual([]);
  change(settingsSection);
  expect(commands).toEqual(['markdown.preview.refresh']);
});
