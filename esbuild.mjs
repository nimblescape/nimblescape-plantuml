// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// Bundle the extension into dist/extension.js, the script of the Markdown
// preview into dist/markdownPreview.js and the script of the preview of
// PlantUML files into dist/pumlPreview.js, write the TextMate grammars into
// dist/syntaxes/, and copy the PlantUML engine into dist/engine/. VS Code provides the module `vscode` at run time, so the bundle
// of the extension leaves it out. A preview loads its script as a module in
// the browser of the webview; that script imports the engine from
// ./engine/plantuml.js at run time. The three bundles are readable JavaScript:
// not minified, so that they keep the names of the source and anyone can read
// the code of the package and compare it with the source (CONTRIBUTING.md,
// "Reviewing the package"). The option `keepNames` stays off: without
// minification the names of the source stay, and no code of the extension
// reads the name of a function at run time. Only a development build writes
// source maps; a production build (--production, which vscode:prepublish
// passes) has none.
//
// The engine is the package @plantuml/core: PlantUML compiled to JavaScript
// with TeaVM, with the Graphviz layout engine of Viz.js. Its files are browser
// scripts that the preview loads as they are, so the build copies them and
// does not bundle them. The package declares its scripts in its `exports`;
// the build copies every exported script and the license of the package. vsce
// packages without node_modules (--no-dependencies), so dist/engine/ is the
// only copy of the engine in the package. The libraries of the standard
// library of PlantUML that the package contains (stdlib/) go next to the
// engine, where its loader finds them.

import * as fs from 'fs';
import { createRequire } from 'module';
import * as path from 'path';
import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const outfile = 'dist/extension.js';
const previewOutfile = 'dist/markdownPreview.js';
const pumlPreviewOutfile = 'dist/pumlPreview.js';
const engineDir = 'dist/engine';

// A production build writes no source maps: remove the maps of an earlier
// development build, so that no map that does not match a bundle of the
// production build stays in dist/.
if (production) {
  for (const file of [outfile, previewOutfile, pumlPreviewOutfile]) fs.rmSync(`${file}.map`, { force: true });
}

await esbuild.build({
  entryPoints: ['src/extension.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['vscode'],
  sourcemap: !production,
  minify: false,
  logLevel: 'info',
});

// The webview of VS Code runs the Chromium of its Electron release, which
// supports the ES2022 target of the TypeScript settings.
for (const [entry, file] of [
  ['src/preview/markdownPreview.ts', previewOutfile],
  ['src/preview/pumlPreview.ts', pumlPreviewOutfile],
]) {
  await esbuild.build({
    entryPoints: [entry],
    outfile: file,
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    sourcemap: !production,
    minify: false,
    logLevel: 'info',
  });
}

// The grammars are TypeScript objects in src/language/grammars.ts, so that
// the highlighting and the code completion share one list of keywords. The
// build bundles that module in memory, imports it, and writes each grammar as
// a JSON file.
const syntaxesDir = 'dist/syntaxes';
const grammarModule = await esbuild.build({
  entryPoints: ['src/language/grammars.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'warning',
});
const { grammarFiles } = await import(`data:text/javascript;base64,${Buffer.from(grammarModule.outputFiles[0].text).toString('base64')}`);
fs.rmSync(syntaxesDir, { recursive: true, force: true });
fs.mkdirSync(syntaxesDir, { recursive: true });
for (const [file, grammar] of Object.entries(grammarFiles)) {
  fs.writeFileSync(path.join(syntaxesDir, file), `${JSON.stringify(grammar, null, 2)}\n`);
}
console.log(`Wrote ${Object.keys(grammarFiles).length} grammars to ${syntaxesDir}/`);

// The engine folder holds exactly the files of the installed engine version
// and of stdlib/, so a file that a newer version dropped does not stay in it.
const require = createRequire(import.meta.url);
const engineRoot = path.dirname(require.resolve('@plantuml/core/package.json'));
const engine = JSON.parse(fs.readFileSync(path.join(engineRoot, 'package.json'), 'utf8'));
const scripts = [...new Set(Object.values(engine.exports))].filter((file) => file.endsWith('.js'));
fs.rmSync(engineDir, { recursive: true, force: true });
fs.mkdirSync(engineDir, { recursive: true });
for (const file of [...scripts, './LICENSE']) {
  fs.copyFileSync(path.join(engineRoot, file), path.join(engineDir, path.basename(file)));
}
const libraries = fs.readdirSync('stdlib').filter((file) => file.endsWith('.min.js'));
for (const file of libraries) {
  fs.copyFileSync(path.join('stdlib', file), path.join(engineDir, file));
}
console.log(`Copied @plantuml/core ${engine.version} (${scripts.length} scripts and LICENSE) and ${libraries.join(', ')} to ${engineDir}/`);
