// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * Runs the tests of the extension in VS Code (`npm run test:vscode`): it downloads VS Code into `.vscode-test/`,
 * starts it with the built extension of this repository (`dist/`, from `npm run build` or `npm run package`) and the
 * folder `test/vscode/workspace`, and runs `test/vscode/index.cjs` in its extension host. The other unit tests replace
 * the API of VS Code with fakes; these tests check the extension against VS Code itself. The version is the oldest
 * one that the manifest allows (`engines.vscode`), unless the variable VSCODE_TEST_VERSION names another one, such as
 * `stable`. On Linux without a display, run the script with `xvfb-run -a`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { engines } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = process.env.VSCODE_TEST_VERSION || engines.vscode.replace(/^\^/, '');

if (!existsSync(join(root, 'dist', 'extension.js'))) {
  console.error('Build the extension first: npm run build');
  process.exit(1);
}

try {
  await runTests({
    version,
    extensionDevelopmentPath: root,
    extensionTestsPath: join(root, 'test', 'vscode', 'index.cjs'),
    launchArgs: [
      join(root, 'test', 'vscode', 'workspace'),
      // Other installed extensions stay off; the built-in extensions, among them the Markdown preview, stay on.
      '--disable-extensions',
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
      // Chromium has no sandbox for the user root, for example in a container.
      ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
    ],
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
