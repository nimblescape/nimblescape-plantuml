// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// Bundle the extension into dist/extension.js and copy the PlantUML engine into
// dist/engine/. VS Code provides the module `vscode` at run time, so the bundle
// leaves it out. A production build (--production, which vscode:prepublish
// passes) is minified and has no source map.
//
// The engine is the package @plantuml/core: PlantUML compiled to JavaScript
// with TeaVM, with the Graphviz layout engine of Viz.js. Its files are browser
// scripts that the preview loads as they are, so the build copies them and
// does not bundle them. The package declares its scripts in its `exports`;
// the build copies every exported script and the license of the package. vsce
// packages without node_modules (--no-dependencies), so dist/engine/ is the
// only copy of the engine in the package.

import * as fs from 'fs';
import { createRequire } from 'module';
import * as path from 'path';
import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const outfile = 'dist/extension.js';
const engineDir = 'dist/engine';

// A production build writes no source map: remove the map of an earlier
// development build, so that no map that does not match the minified bundle
// stays in dist/.
if (production) fs.rmSync(`${outfile}.map`, { force: true });

await esbuild.build({
  entryPoints: ['src/extension.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
});

// The engine folder holds exactly the files of the installed engine version,
// so a file that a newer version dropped does not stay in it.
const require = createRequire(import.meta.url);
const engineRoot = path.dirname(require.resolve('@plantuml/core/package.json'));
const engine = JSON.parse(fs.readFileSync(path.join(engineRoot, 'package.json'), 'utf8'));
const scripts = [...new Set(Object.values(engine.exports))].filter((file) => file.endsWith('.js'));
fs.rmSync(engineDir, { recursive: true, force: true });
fs.mkdirSync(engineDir, { recursive: true });
for (const file of [...scripts, './LICENSE']) {
  fs.copyFileSync(path.join(engineRoot, file), path.join(engineDir, path.basename(file)));
}
console.log(`Copied @plantuml/core ${engine.version} (${scripts.length} scripts and LICENSE) to ${engineDir}/`);
