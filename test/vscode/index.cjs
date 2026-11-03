// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The tests of the extension in VS Code. `scripts/vscode-test.mjs` starts VS Code with the extension and the folder
 * `test/vscode/workspace`, and VS Code calls `run` of this module in its extension host. The tests use the API of
 * VS Code itself, so they find a change of VS Code that the fakes of the unit tests do not show: the activation, the
 * markdown-it plugin in the Markdown extension, the commands, the code completion, the formatting and the custom
 * editor of PlantUML files. They cannot look into a webview, so they do not check the rendered diagrams.
 */

const assert = require('node:assert/strict');
const vscode = require('vscode');

/** extensionId is the identifier of the extension. */
const extensionId = 'nimblescape.nimblescape-plantuml';

/** workspace returns the address of a file of the test workspace. */
const workspace = (name) => vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, name);

/**
 * until waits until a condition holds, for 10 seconds at most.
 * @param condition - Returns whether the condition holds.
 * @param what - Names the condition in the error.
 */
async function until(condition, what) {
  for (let waited = 0; waited < 10_000; waited += 100) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Waited 10 seconds for ${what}.`);
}

/** activeViewType returns the view type of the custom editor of the active tab, or `text` for a text editor. */
function activeViewType() {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return input instanceof vscode.TabInputCustom ? input.viewType : input instanceof vscode.TabInputText ? 'text' : undefined;
}

/**
 * proposals returns the completion items at a position of a new document, as `label (detail)`. The detail names the
 * keyword of a declaration, which only the extension gives: the editor also proposes the words of the document.
 * @param language - The language of the document.
 * @param lines - The lines of the document; the last one ends at the cursor.
 */
async function proposals(language, lines) {
  const document = await vscode.workspace.openTextDocument({ language, content: lines.join('\n') });
  const position = new vscode.Position(lines.length - 1, lines.at(-1).length);
  const list = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', document.uri, position);
  return list.items.map((item) => `${typeof item.label === 'string' ? item.label : item.label.label}${item.detail ? ` (${item.detail})` : ''}`);
}

const tests = [
  {
    name: 'the extension activates with a Markdown file and returns the markdown-it plugin',
    run: async () => {
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(workspace('diagrams.md')));
      const extension = vscode.extensions.getExtension(extensionId);
      assert.ok(extension, 'VS Code knows the extension');
      await until(() => extension.isActive, 'the activation by the Markdown file');
      assert.equal(typeof extension.exports.extendMarkdownIt, 'function');
    },
  },
  {
    name: 'the Markdown extension renders the PlantUML blocks with the plugin, and the included file once',
    run: async () => {
      const document = await vscode.workspace.openTextDocument(workspace('diagrams.md'));
      const html = await vscode.commands.executeCommand('markdown.api.render', document);
      assert.equal(html.match(/data-plantuml-source=/g)?.length, 2, html);
      assert.equal(html.match(/class="nimblescape-plantuml-page-includes" hidden/g)?.length, 1, html);
      assert.equal(html.match(/skinparam monochrome true/g)?.length, 1, html);
      // The text of the page outside the blocks stays as the Markdown extension writes it.
      assert.match(html, /<h1[^>]*>Diagrams<\/h1>/);
    },
  },
  {
    name: 'the commands of the extension exist',
    run: async () => {
      const commands = await vscode.commands.getCommands(true);
      for (const command of [
        'nimblescape.plantuml.togglePreview',
        'nimblescape.plantuml.reopenAsPreview',
        'nimblescape.plantuml.reopenAsSource',
        'nimblescape.plantuml.showPreviewToSide',
        'nimblescape.plantuml.formatBlocks',
      ]) {
        assert.ok(commands.includes(command), command);
      }
    },
  },
  {
    name: 'the code completion proposes keywords and declared names in PlantUML files and in PlantUML blocks',
    run: async () => {
      const puml = await proposals('plantuml', ['class Car', 'C']);
      assert.ok(puml.includes('class') && puml.includes('Car (class)'), puml.join(', '));
      const markdown = await proposals('markdown', ['```plantuml', 'participant Alice', 'Alice -> A']);
      assert.ok(markdown.includes('Alice (participant)'), markdown.join(', '));
      // Outside the PlantUML blocks, the extension proposes nothing.
      const outside = await proposals('markdown', ['participant Alice', 'Alice -> A']);
      assert.ok(!outside.includes('Alice (participant)'), outside.join(', '));
    },
  },
  {
    name: 'the formatting indents the members of a class in a PlantUML file',
    run: async () => {
      const uri = workspace('classes.puml');
      const edits = await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', uri, { tabSize: 4, insertSpaces: true });
      assert.deepEqual(
        edits.map((edit) => [edit.range.start.line, edit.newText]),
        [[5, '    - wheels : int']],
      );
    },
  },
  {
    name: 'a PlantUML file opens in the preview, and the toggle switches to its text and back',
    run: async () => {
      await vscode.commands.executeCommand('vscode.openWith', workspace('classes.puml'), 'nimblescape.plantuml.preview');
      await until(() => activeViewType() === 'nimblescape.plantuml.preview', 'the preview');
      await vscode.commands.executeCommand('nimblescape.plantuml.togglePreview');
      await until(() => activeViewType() === 'text', 'the text editor');
      await vscode.commands.executeCommand('nimblescape.plantuml.togglePreview');
      await until(() => activeViewType() === 'nimblescape.plantuml.preview', 'the preview again');
    },
  },
];

/** run runs the tests one after the other, and fails when one of them fails. */
async function run() {
  const failed = [];
  for (const { name, run: test } of tests) {
    try {
      await test();
      console.log(`ok - ${name}`);
    } catch (error) {
      failed.push(name);
      console.error(`not ok - ${name}\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    }
  }
  if (failed.length > 0) {
    throw new Error(`${failed.length} of ${tests.length} tests failed: ${failed.join('; ')}`);
  }
}

module.exports = { run };
