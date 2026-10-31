# Contributing

This guide explains the files, the development, the tests and the release of
the extension. The [README](README.md) describes the use in short, the
[user guide](docs/guide.md) describes every feature,
[docs/requirements.md](docs/requirements.md) lists what the extension must do,
each requirement with an ID, and [docs/security.md](docs/security.md)
describes its security model.

## Files

| File | Purpose |
| --- | --- |
| `src/extension.ts` | The editor wiring: activation returns the markdown-it plugin for the Markdown preview with the settings and the included files of the rendered document, refreshes the previews when a setting or an included file changes, creates the log "nimblescape PlantUML" of the Output view, and registers the previews of PlantUML files, the code completion and the formatting. |
| `src/completionProvider.ts` | The code completion of PlantUML files and of the PlantUML blocks of Markdown files, with the proposals while typing in a block. |
| `src/formattingProvider.ts` | The formatting of PlantUML files and of the PlantUML blocks of Markdown files, with the command "Format PlantUML Blocks" and the formatting of the blocks on save. |
| `src/markdownDocuments.ts` | The lines and the PlantUML blocks of open documents, which the code completion and the formatting share. |
| `src/settings.ts` | The settings of the extension that change the diagrams, their defaults, and their JSON form for the preview. It uses no API of VS Code, so the preview script can use it. |
| `src/language/keywords.ts` | The keywords of PlantUML that the highlighting and the code completion share. |
| `src/language/grammars.ts` | The TextMate grammars: `source.plantuml` for PlantUML text, and the injection `markdown.nimblescape.plantuml.codeblock`, which marks the PlantUML blocks of Markdown files. The build writes them into `dist/syntaxes/`. |
| `src/language/completion.ts` | The code completion: the declared names of a PlantUML text, and the proposals for a position. It uses no API of VS Code. |
| `src/language/formatting.ts` | The formatting: the indentation of the lines of a UML diagram by the depth of their blocks, one space for a run of spaces between the parts of a statement, and one space for each run of spaces in a member. It uses no API of VS Code. |
| `src/diagram/diagramLines.ts` | The lines that the engine renders for the text of one diagram: `@startuml` and `@enduml` around a body, the `@end` line of a diagram without one, and the settings applied, each line with the line of the text that it comes from. |
| `src/diagram/diagramRanges.ts` | The diagrams of a PlantUML text, from a `@start` line to the next `@end` line, in small letters as the engine reads them, and the split of a text into the texts of its diagrams. The previews, the UML notation and the formatting use this one rule. |
| `src/diagram/includes.ts` | The expansion of the include lines of a diagram with the texts of the included files, by the rules of the preprocessor of PlantUML, with the line and the file that each line comes from, and the problems of the include lines that stay. It uses no API of VS Code, so the preview scripts can use it. The section [Included files](#included-files) explains it. |
| `src/diagram/includeProblems.ts` | The largest included file (1 MB) and the messages of the problems of an included file, which the reader of the extension and the reader of the npm package share. |
| `src/includeFiles.ts` | The reading of the included files for the previews: the folders that it reads from, the watchers of the files, and the event that refreshes the previews. |
| `src/diagram/umlNotation.ts` | The UML notation of the setting `umlNotation`: the commands `skinparam style strictuml` and `skinparam classAttributeIconSize 0` after each `@startuml` line, the UML keyword as a stereotype in each declaration of a class kind, and `{static}` and `{abstract}` for the modifiers `static` and `abstract` of members. It adds nothing that the diagram has already. |
| `src/diagram/lineKinds.ts` | The kind of each line of a PlantUML text: statement, member of a class, an object, a map or JSON data, rule of a style, line comment, line of a block comment, or free text of a note, title, legend, header, footer, caption, reference or action of several lines. The UML notation, the code completion and the formatting use it. |
| `src/markdown/markdownIt.ts` | The markdown-it plugin: writes a PlantUML block as an element that carries the diagram text, the settings and the included files, and leaves every other token as it is. |
| `src/markdown/blocks.ts` | The PlantUML blocks of a Markdown text by their lines, with the prefix of each line (the markers of a block quote, the indentation of a list item), for the code completion and the formatting. It finds them with markdown-it, as the preview does. |
| `src/pumlPreviews.ts` | The previews of PlantUML files: the custom editor that shows a file as a preview in its own tab, the preview to the side, the rendered diff, and their commands. |
| `src/preview/renderer.ts` | The renderer that both previews share: loads the engine, renders the diagrams of the PlantUML blocks of a page one at a time into a shadow root of each block, shows errors with the line of the block text, and keeps the results in memory and in the local storage of the preview. |
| `src/preview/markdownPreview.ts` | The script of the Markdown preview: starts the renderer for the PlantUML blocks of the page, and again after each change of the page. |
| `src/preview/pumlPreview.ts` | The script of the preview of PlantUML files: writes a block for each diagram of the file, or a row for each pair of diagrams of a rendered diff with a label (Changed, Added, Removed) on each changed side, starts the renderer, and switches a diagram that is wider than its column between the width of the column and its original size on a click. |
| `src/preview/previewHtml.ts` | The page of the preview of PlantUML files, with its security policy. |
| `media/markdownPreview.css` | The styles of the PlantUML blocks in the Markdown preview. |
| `media/pumlPreview.css` | The styles of the preview of PlantUML files and of the rendered diff. |
| `resources/icon.png`, `resources/icon.svg` | The Marketplace icon (256 × 256 PNG, because the Marketplace takes no SVG icon) and its source: a class with two subclasses on the tile of the nimblescape extensions. |
| `src/cli/index.ts` | The library of the npm package `@nimblescape/plantuml` ([npm package](#npm-package)): the markdown-it plugin, the settings, the included files of the disk and the names of the elements of a page. |
| `src/cli/diskIncludes.ts` | The reading of the included files from the disk for a program without VS Code, with the rules and the messages of the extension. |
| `src/cli/diskSettings.ts` | The reading of the settings from the file `.vscode/settings.json` of a folder for a program without VS Code, as JSON with comments. |
| `cli/` | The npm package `@nimblescape/plantuml`: `package.json`, `package-lock.json` without dependencies, the types `index.d.ts`, `README.md` (its page on npmjs.com), and the built `dist/`, `LICENSE` and `THIRD-PARTY-NOTICES.md`, which Git does not keep. |
| `test/cli/`, `vitest.cli.config.mts` | The tests of the built npm package (`npm run test:cli`). |
| `src/**/*.test.ts` | The tests, with vitest: the manifest with its keys, the package contents, the bundled engine and the documents (`src/manifest.test.ts`), the real engine with the loader of the previews (`src/engine.test.ts`), the activation with a fake of the editor API, the settings, the diagram lines and the UML notation, the expansion of included files, the reading of included files with a fake of the editor API and of the file system, the grammars with the TextMate engine of VS Code (`vscode-textmate` and `vscode-oniguruma`), the indentation rules and the folding markers of the language configuration against the formatting, the markdown-it plugin, the commands of the previews of PlantUML files and the preview to the side with a fake of the editor API, and the preview scripts on a page of happy-dom with a fake engine. |
| `src/test/` | Support for the tests: a fake of the engine, and the page of the Markdown preview with its update by morphdom, as VS Code changes the page. |
| `test/vscode/index.cjs`, `test/vscode/workspace/` | The tests in VS Code itself (`npm run test:vscode`) and the folder that VS Code opens for them: the activation, the markdown-it plugin in the Markdown extension, the commands, the code completion, the formatting, and the custom editor of PlantUML files with its toggle. |
| `scripts/vscode-test.mjs` | Downloads VS Code with [`@vscode/test-electron`](https://github.com/microsoft/vscode-test) and runs the tests of `test/vscode/` in it. |
| `.oxlintrc.json` | The settings of the linter [oxlint](https://oxc.rs/docs/guide/usage/linter): the rules of the category "correctness" and the rules that need the types. |
| `.gitattributes` | Keeps the line breaks `\n` in every checkout, also on Windows. |
| `stdlib/` | The libraries of the standard library of PlantUML that the package contains: `c4.min.js`, the library C4, as the PlantUML project builds it for the engine. The section [Engine](#engine) explains it. |
| `dist/` | The bundles `dist/extension.js`, `dist/markdownPreview.js` and `dist/pumlPreview.js`, the grammars in `dist/syntaxes/` and the engine in `dist/engine/`, built by `esbuild.mjs` and kept out of Git. `cli/dist/` holds the library and the page of the npm package. |
| `language-configuration.json` | The editing rules of the language PlantUML: comments, brackets, the pairs that the editor closes, the folding markers of the diagrams and of the preprocessor, and the indentation rules while typing, with the blocks of the formatting. |
| `docs/guide.md` | The user guide: every feature, how to use it, and its state. |
| `docs/requirements.md` | The requirements, each with an ID as its heading, and the plan of the steps. |
| `docs/security.md` | The security model: what the extension does on your computer, what it protects, and where its protection ends. The section "What the extension does on your computer" at the top of the README lists the same behaviors in short. |
| `docs/images/` | The image of the README: `demo.gif`, a screen recording of VS Code that shows the Markdown preview, the completion, the formatting, the previews of a PlantUML file and its rendered Git diff. It has the style of the GIFs of nimblescape Mindbug and nimblescape Comment Links: a VS Code window of 1440 × 816 pixels at a zoom of 120 % in the theme Dark Modern, a blue band above it with the number and the caption of each scene, and for 1.6 s after each key press a label with the key and its command. `markdown-preview.png` and `plantuml-preview.png` are the screenshots of the README of the release 0.1.0, whose page on the Marketplace still shows them; delete them after the next release. GIF and PNG files only, because the Marketplace shows no SVG image. The README links its images with full addresses on the branch `main`, which the Marketplace requires; they are not part of the package. A test checks that each image of the README is a GIF or PNG file in this folder. |
| `THIRD-PARTY-NOTICES.md` | The components of the bundled engine and of the library C4, their licenses and the places of their source code. |
| `SUPPORT.md` | Where to ask questions and report problems, and what a report contains. |
| `esbuild.mjs` | Bundles `src/extension.ts` into `dist/extension.js` for Node.js, and `src/preview/markdownPreview.ts` and `src/preview/pumlPreview.ts` into `dist/markdownPreview.js` and `dist/pumlPreview.js` for the browser of the previews, writes the grammars of `src/language/grammars.ts` into `dist/syntaxes/`, and copies the engine and the libraries of `stdlib/` into `dist/engine/`. It then builds the npm package of `cli/`: `src/cli/index.ts` into `cli/dist/index.js` for Node.js 22, the script of the Markdown preview into `cli/dist/page/` with its style sheet and the engine, and copies `LICENSE` and `THIRD-PARTY-NOTICES.md` into `cli/`. The editor API stays outside the bundle. The bundles are readable JavaScript, not minified (see [Reviewing the package](#reviewing-the-package)); a production build (`--production`) has no source maps. |
| `tsconfig.json` | The TypeScript settings of the type check: strict, and no output, because esbuild builds the bundle. |
| `vitest.config.mts` | The settings of the tests: the files `src/**/*.test.ts` and `scripts/**/*.test.mjs` on Node; a test file that needs a page (the preview scripts and the real engine) selects happy-dom in its first lines. |
| `package.json` | The extension manifest. The section [Manifest](#manifest) explains it. |
| `package-lock.json` | The locked engine and development tools. npm writes this file, and nobody edits it by hand. |
| `.node-version` | The Node release of the development tools. `actions/setup-node` in the workflows and local Node version managers read it. |
| `.vscodeignore` | Lists the files of the package: `dist/extension.js`, `dist/markdownPreview.js`, `dist/pumlPreview.js`, `dist/engine/`, `dist/syntaxes/`, `media/markdownPreview.css`, `media/pumlPreview.css`, `resources/icon.png`, `language-configuration.json`, `package.json`, `README.md`, `CHANGELOG.md`, `SUPPORT.md`, `LICENSE` and `THIRD-PARTY-NOTICES.md`. |
| `.github/workflows/ci.yml` | Checks the types, runs the linter and the tests, packages, runs the tests in VS Code with the package and packs the npm package for every push to `main`, every pull request and the commit of every release; a second job runs the tests and the tests in VS Code on Windows, and the job "package" runs the tests of the npm package on Linux and macOS with Node.js 22 and 26. The release publishes the VSIX and the npm package of this workflow, so a change of it needs a dry run (rule 4 of the [release rules](#release-rules)). |
| `.github/workflows/release.yml` | Releases a version on a manual start: commits the version to a temporary branch, tests and packages it with `ci.yml`, and only then moves `main` to it, creates its tag and GitHub release and publishes it to the Marketplace and the npm package to npmjs.com. A dry run tests without a change. The section [Release](#release) explains it. |
| `.github/workflows/release-dry-run.yml` | Fails on a pull request that changes the release process (`release.yml`, `ci.yml` or `scripts/release-checks.mjs`) until a dry run on its branch tested the change (rule 4 of the [release rules](#release-rules)). |
| `.github/workflows/marketplace-identity.yml` | Prints the Marketplace member ID of the publishing identity, to check the setup of the repository. |
| `.github/dependabot.yml` | Proposes weekly updates of the development tools, of the engine and of the pinned actions. |
| `scripts/install-local.mjs`, `scripts/uninstall-local.mjs` | Install the built package into every profile of the VS Code of this computer, and remove it again. |
| `scripts/npm-setup.sh` | Sets up the publishing of the npm package on npmjs.com. The section [npmjs.com setup](#npmjscom-setup) explains it. |
| `scripts/marketplace-setup.sh` | Sets up the Marketplace publishing of the repository. The section [Setup of a repository](#setup-of-a-repository) explains it. |
| `scripts/release-checks.mjs`, `scripts/release-checks.test.mjs` | The check of rule 4 of the [release rules](#release-rules), which the workflows run, and its test. |
| `.vscode/launch.json`, `.vscode/tasks.json` | Build the bundle and start a VS Code window that loads the extension from this folder. |

## Development

The development tools are TypeScript, esbuild, vitest and
[`@vscode/vsce`](https://github.com/microsoft/vscode-vsce), the Microsoft tool
that packages and publishes extensions. Everything runs on Node.js 24: the
release in `.node-version` for the tools and CI, and the runtime of VS Code
1.125 and later (`engines.vscode`) for the extension.

| Command | Effect |
| --- | --- |
| `npm ci --ignore-scripts` | Installs the locked engine and development tools and runs no install script of a dependency. |
| `npm run typecheck` | Checks the types with `tsc`. esbuild does not check them. |
| `npm run lint` | Runs the linter oxlint with the rules that need the types, for example `no-floating-promises` for a promise that nobody awaits. ESLint with typescript-eslint does not fit here, because typescript-eslint supports TypeScript only below 6.1, and the repository uses TypeScript 7; oxlint runs these rules with tsgolint, which is built on TypeScript 7. |
| `npm test` | Runs the tests with vitest. The tests touch no installed editor. |
| `npm run test:cli` | Builds the extension and the npm package, and runs the tests of the built package in `cli/dist/`. |
| `npm run build` | Bundles `dist/extension.js` with a source map and copies the engine into `dist/engine/`. |
| `npm run test:vscode` | Runs the tests of `test/vscode/` in VS Code, with the built extension of `dist/` (run `npm run build` first). It downloads VS Code into `.vscode-test/`, by default the oldest version that `engines.vscode` allows; `VSCODE_TEST_VERSION=stable` tests the newest one. On Linux without a display, run it with `xvfb-run -a`. |
| `npm run package` | Builds `nimblescape-plantuml-<version>.vsix` with vsce, which first runs the production build (`vscode:prepublish`). vsce also validates the manifest and the README. |
| `npm run install-local` | Builds the package and installs it into every profile of the VS Code of this computer; `-- --profile <name>` installs into one profile. Reload the window after an update of an active extension. |
| `npm run uninstall-local` | Removes `nimblescape.nimblescape-plantuml` from every profile of the VS Code of this computer; `-- --profile <name>` removes it from one profile. |

The launch configuration "Run the extension" builds the bundle and starts a
second VS Code window that loads the extension from this folder, so that a
change can be tried without a package.

## Reviewing the package

The VSIX holds the three bundles of `dist/` (`extension.js`,
`markdownPreview.js` and `pumlPreview.js`) as readable JavaScript: not
minified, with the names of the source, and with a comment that names each
source file. `dist/syntaxes/` holds the grammars as JSON files. `dist/engine/`
holds the scripts of the engine `@plantuml/core` as the PlantUML project
publishes them on npm, which TeaVM compiled from Java, and the library C4 of
`stdlib/`; the section [Engine](#engine) names their sources. To compare a
VSIX with the sources, unpack it (a VSIX is a ZIP file), run
`npm ci --ignore-scripts` and `npm run vscode:prepublish` at the tag of its
version, and compare `extension/dist/` of the VSIX with `dist/`. With the same
sources and the locked versions of the tools and of the engine, the build
gives the same files.

## Manifest

`package.json` is the extension manifest. It has these parts:

- The name and the publisher define the extension ID `nimblescape.nimblescape-plantuml`; the section [Naming](#naming) explains the name.
- The description, the keywords, the categories, the banner (`galleryBanner`), `preview` and `qna` make the page of the Marketplace. The description names the behaviors that a user may not expect, the formatting at save and the default formatter, as the section "What the extension does on your computer" at the top of the README does. vsce turns some words of the description into search tags, for example "Java" into `java`; a test checks that the description adds no tag. `preview` shows the label "Preview" on the page, and `qna` sends the questions of the page to the GitHub issues.
- The version is the only source of the package version, and the tag of a release names it.
- The engine range defines the compatible VS Code versions. `@types/vscode` stays at the lowest version of that range, so that the code compiles only with the API of that version. The manifest enables no proposed API (`enabledApiProposals`), because the Marketplace does not accept an extension that uses one. A test checks both.
- `main` selects the bundle `dist/extension.js`. A test checks it.
- `.vscodeignore` lists the files of the package, not a `files` field: it ignores everything and keeps the bundles, the engine, the styles of the previews, the icon, the language configuration and the documents. A test checks the list.
- `icon` is `resources/icon.png`, a PNG, because the Marketplace takes no SVG icon. `resources/icon.svg` is its source; after a change of the source, render it again as a PNG of 256 × 256 pixels with a transparent background, for example with a screenshot of the SVG in Chromium. A test checks the size.
- `extensionKind` selects the workspace host.
- The language contribution registers the language `plantuml` for its file extensions, with the editing rules of `language-configuration.json`. A test keeps the README table equal to the file extensions, and a test checks the indentation rules and the folding markers against the formatting. The section [Formatting](#formatting) explains them.
- The grammar contribution points to the grammars in `dist/syntaxes/`. The injection into `text.html.markdown` maps the scope `meta.embedded.block.plantuml` to the language `plantuml`, so that the editing rules of PlantUML, for example its comments, apply inside a PlantUML block of a Markdown file. A test checks the contribution against `src/language/grammars.ts`.
- The contributions `markdown.markdownItPlugins`, `markdown.previewScripts` and `markdown.previewStyles` connect the extension with the built-in Markdown preview. The Markdown extension of VS Code activates the extension and reads its export `extendMarkdownIt`. The section [Markdown preview](#markdown-preview) explains it.
- The activation event `onLanguage:markdown` starts the extension when a Markdown file opens, for the code completion and the formatting in PlantUML blocks. VS Code adds the event `onLanguage:plantuml` itself, because the extension contributes that language. The section [Code completion](#code-completion) explains it.
- The custom editor `nimblescape.plantuml.preview` shows a PlantUML file as a preview in its own tab, with the priority `option`, so that the text editor stays the default. The commands, the buttons in the title bar (`menus`) and the keys (`keybindings`) of the previews work as those of the Markdown preview: Ctrl+Shift+V switches a tab between the text and the preview, or between a diff and its rendered diff, and Ctrl+K V opens the preview to the side. A switch that starts while another one runs does nothing, so that a quick second press of Ctrl+Shift+V does not switch the same tab again. The `when` clauses use `activeCustomEditorId` for the preview and `activeWebviewPanelId` for the rendered diff; they leave the same keys to the Markdown preview in Markdown files. A test checks the keys and their clauses. The activation events `onWebviewPanel:nimblescape.plantuml.sidePreview` and `onWebviewPanel:nimblescape.plantuml.diffPreview` start the extension when VS Code restores these panels after a restart.
- The command `nimblescape.plantuml.formatBlocks` ("Format PlantUML Blocks") formats the PlantUML blocks of a Markdown file; the command palette shows it in Markdown files only. VS Code runs one formatter for "Format Document", the default formatter of the language, so the command and the formatting of the blocks on save (`editor.formatOnSave`) keep the blocks formatted when another extension, for example Prettier, formats Markdown files.
- The configuration defaults make the extension the default formatter of PlantUML files (`"[plantuml]": { "editor.defaultFormatter": … }`). A language-specific default of an extension wins over a general `editor.defaultFormatter` of the user, for example Prettier for every file, but not over a formatter that the user sets for the language `plantuml`. A test checks both.
- The configuration contribution declares the settings of `src/settings.ts` in the section `nimblescape.plantuml`, with the scope `resource`, so that a folder of a workspace can have its own value. A test keeps the defaults equal to `src/settings.ts`, and a test checks that the README and the guide name every setting.
- The untrusted-workspace and virtual-workspace capabilities state that the extension only reads.
- The runtime dependency is the engine `@plantuml/core`, pinned to one version; the section [Engine](#engine) explains it. The development dependencies are the build, test and packaging tools. `allowScripts` lists the install scripts of dependencies that npm 11.19 and later may run: those of esbuild and `@vscode/vsce-sign` in every version, because the build and the packaging (`npm run package`) run the code of both packages anyway and Dependabot updates them, and not the one of fsevents, an optional package for macOS that already contains its built binary.

`README.md` is the page of the Marketplace and `CHANGELOG.md` its tab
"Changelog". vsce checks their images: an image must come from an `https`
address and must not be an SVG. Both files and `SUPPORT.md` use full
`https://github.com/…` links outside code, so that every link works in the
repository, in the package and on the Marketplace. A test checks it, and a
test checks that the package script keeps the checks of vsce.

## Engine

The engine is the npm package
[`@plantuml/core`](https://www.npmjs.com/package/@plantuml/core): PlantUML
compiled to JavaScript with TeaVM, built and published by the PlantUML
project. Its versions 1.2026.6 and later are under the MIT License; earlier
versions are under the GPL. `package.json` pins one exact version, so that an
update of the engine is a change of its own, which Dependabot proposes and CI
checks.

The files of the engine are browser scripts that the preview loads as they
are. `esbuild.mjs` copies every script that the package exports, and the
license of the package, into `dist/engine/`; vsce packages without
`node_modules` (`--no-dependencies`).

The engine loads a library of the standard library of PlantUML
(`!include <C4/C4_Context>` and others) when a diagram includes it: one script
per library, for example `c4.min.js`, which the PlantUML project builds and
publishes at <https://plantuml.github.io/plantuml/js-plantuml/>. The package
contains the library C4 (`stdlib/c4.min.js`, C4-PlantUML 2.14.0 under the MIT
License, 183 KB), and the build copies it next to the engine. The previews
load no other library and nothing from the internet: for an include of
another library, the preview shows the message "The extension does not
contain the PlantUML library …" at the line of the include, instead of the
"Fatal parsing error" of the engine. To add or update a library, download its
file from that address, check its license (the field `license` of
`PLANTUML_STDLIB_INFO` in the file, and the license of its source), add it to
`bundledLibraries` in `src/preview/renderer.ts`, and name it with its version,
license and source in `THIRD-PARTY-NOTICES.md`. A test checks the notices
against the file, and `src/engine.test.ts` renders a C4 diagram with it.

`THIRD-PARTY-NOTICES.md` names the components of the engine and their
licenses:

- in `plantuml.js`: PlantUML (MIT) with Smetana (Eclipse Public License 1.0),
  minimal-json (MIT) and Base64Coder (MIT), and the runtime and the class
  library of TeaVM (Apache License 2.0, with its NOTICE) with the Unicode CLDR
  data (Unicode License V3) and JZlib (BSD-style);
- in `viz-global.js`: Viz.js (MIT) with Graphviz (Eclipse Public License 1.0)
  and Expat (MIT);
- in `themes.js`: 44 themes, each with its author and license (MIT, Apache
  License 2.0, one theme under the GPL 3.0 or later, and themes without a
  license statement, which come with PlantUML under its license);
- the Twemoji graphics (CC BY 4.0) and the Open Iconic icons (MIT);
- in `c4.min.js`: C4-PlantUML 2.14.0 (MIT) with its themes and examples.

The section "Source code" of the notices offers the source code of the parts
under the Eclipse Public License on request, because that license requires
this offer for object code. Tests check that the installed engine is under
the MIT License, that the notices name every script of the engine, and that
they name every theme with its license; a theme with a new kind of license
fails the test until the notices cover it.

`src/engine.test.ts` loads the installed engine with the loader of the
previews and renders with it in happy-dom. It checks each part of the engine
that the extension depends on: the further scripts that the loader loads,
every diagram type of `src/language/keywords.ts`, the options `dark` and
`maxSvgSize`, the error picture and the title group that the previews read,
and the Graphviz layout of Viz.js. So an update of the engine that changes one
of them fails CI. A new version that renders one of the diagram types that the
highlighting leaves out (`salt`, `ditaa` and others) also fails the test; then
add the type to `diagramTypes`, with a sample in the test. After an update of
the engine:

- set the source link of PlantUML to the commit of the new npm package
  (`npm view @plantuml/core@<version> gitHead`), which is not always the
  commit of the tag of the version;
- check the versions in the notices against the headers of `viz-global.js`,
  and the version of TeaVM against `gradle/libs.versions.toml` of PlantUML at
  that commit.

## Included files

The engine of the previews cannot read files
([R-GEN-008](docs/requirements.md#r-gen-008)). The extension reads the
included files, and the previews put their text into the copy of the diagram
text that the engine renders:

- `src/diagram/includes.ts` expands the include lines of a diagram with the rules of the preprocessor of PlantUML: the path relative to the including file, the selection of a diagram (`!1`, `!MY_ID`) or of a part (`!includesub parts.puml!PART`), the comments, the YAML header of a diagram, and the limits of 32 levels and 100,000 lines. For each line it keeps the line and the file that the line comes from, for the messages of errors. The extension runs it to find the files that a diagram needs, and the previews run it to expand the text.
- `src/includeFiles.ts` reads the files, only in the workspace folders and in the folder of the document, as the Markdown preview does for images. For the Markdown preview, it reads a file of the disk at once the first time with the file system of Node.js: the Markdown preview renders a document in one step and renders it again only with a new page (`markdown.preview.refresh`), so the files must be there for the first rendering. Every other reading runs in the background (`fs.promises`), so that a slow drive does not block the extension host: the files of the previews of PlantUML files, which wait for them, a file that changed, and a file of another file system, such as a version in Git (`git:`) or a file of a virtual workspace, which it reads through `vscode.workspace.fs`; the previews render again when it has read the file. It watches the files of the disk and uses their saved text, so that typing in an included file does not load the Markdown preview again with each key. The Markdown previews and the previews of PlantUML files have a reader each, so that a change of a file refreshes only the previews of the kind that include it.
- `src/includeFiles.ts` reads a file of the disk through its symbolic links (`realpath`), and the target must be in the same folders as the path, so that a link in a workspace cannot show a file from elsewhere. It watches a file of another file system too, unless its address has a query, as the versions of a file in Git have.
- The Markdown plugin writes the files of all blocks of a page as JSON into the text of one hidden element after the last PlantUML block (class `nimblescape-plantuml-page-includes`), each file once, also when several blocks include it. The paths are relative to the folder of the document, so one path names one file in all blocks. The text is not an attribute: the Markdown preview allows the style rules of a document and images from `https:` addresses, and a style rule can select an element by the start of the value of an attribute, so that the value of an attribute could reach an address of the internet. The previews of PlantUML files receive the files of each block with each update and write them into a hidden child element of the block (class `nimblescape-plantuml-includes`), because the two sides of a rendered diff include different versions of a file.
- The engine fails at a local `!include` line with the message "cannot include …" and ignores a line `!includesub`. A file that the extension cannot include therefore keeps its line, as an `!include` line, so that the engine fails at that line; the preview shows the message of the extension there instead of the message of the engine.
- The rendered diff of Markdown renders a side with changes from its text with the marks of the changes, without naming its document (`currentDocument`). The plugin gives the callbacks the Markdown text of the rendering, and the extension takes the open Markdown document with the same text without the marks.

## Markdown preview

The version of `markdown-it` and `@types/markdown-it` follows the version that
the built-in Markdown preview of VS Code uses (the `markdown-it` dependency of
[extensions/markdown-language-features/package.json](https://github.com/microsoft/vscode/blob/main/extensions/markdown-language-features/package.json),
version 14 on 2026-10-19), so that the tests and `src/markdown/blocks.ts` parse
as the preview does. Dependabot offers no major versions of them
(`.github/dependabot.yml`); move to a new major version only when VS Code does.

The built-in Markdown preview renders a document with markdown-it. The
plugin `src/markdown/markdownIt.ts` writes a fenced code block with the info
string `plantuml` as a `div` with the class `nimblescape-plantuml`, the
attribute `data-plantuml-source` with the diagram text, and an inner `div`
with the class `nimblescape-plantuml-content`, which holds the text of the
block in a `pre` with the class `nimblescape-plantuml-source`. The script
gives the inner `div` a shadow root before the page shows it: the shadow root
shows the diagrams and hides the text, so the text shows only when the script
does not run. The outer `div` keeps the attributes that the preview gives to
every block, `data-line` and the class `code-line`, which the preview uses to
synchronize the scrolling and to mark the changed blocks of a rendered diff.
Every other token keeps the output of the preview.

The rendered diff of VS Code (`documentRenderer.ts` and `preview-src/index.ts`
of the Markdown extension) affects the blocks in two ways:

- Before it renders, it inserts empty elements `<span data-diff-start="N"></span>` and `<span data-diff-end="N"></span>` into the Markdown text around each changed part of a line. In a code block, they are text, so the plugin removes them from the diagram text and from the info string.
- It marks a changed block with classes on the outer `div` and adds a bar to it as a child (`diff-modification-gutter`) left of the block. The script therefore changes only the shadow root of the inner `div`, and only the inner `div` scrolls, so that the bar is not cut off.

The preview loads `dist/markdownPreview.js` as a module. The script starts
in the Markdown preview, which it finds by its element
`vscode-markdown-preview-data`, and on any other page that loads it with a
PlantUML block, such as the page of a PDF of nimblescape Markdown Paper. The
security policy of the Markdown preview allows only scripts with the nonce of the page, no WebAssembly, no network
requests and no frames. The script therefore:

- loads the engine with a dynamic import, which keeps the nonce, and only when the page has a PlantUML block;
- sets `PLANTUML_STDLIB_LOADER`, so that the engine loads its further scripts (`themes.js`, `emoji.js`, `openiconic.js`) and the library C4 (`c4.min.js`) through script elements with the nonce. The loader refuses every other library, and the preview then shows a message that names the library at the line of the include;
- loads Viz.js only when the page allows WebAssembly (the preview security setting "Disable"); otherwise PlantUML uses its own layout engine Smetana, which needs no WebAssembly. The script reads the security policy of the page and does not compile a test module, because a blocked compilation counts as a violation, and the preview then shows the warning "Some content has been disabled in this document";
- applies the settings, which the plugin writes as JSON into the attribute `data-plantuml-settings` when they differ from the defaults (`src/diagram/diagramLines.ts`);
- splits the text of a block into its diagrams (`src/diagram/diagramRanges.ts`), because the engine renders only the first diagram of a text, and only when the text starts with its `@start` line; a diagram without its `@end` line gets one, because the engine fails without it;
- renders one diagram at a time, because the engine keeps shared state, and keeps up to 200 results by theme, settings and text;
- draws the diagrams of a block into the shadow root of the inner `div` and leaves the elements of the block as markdown-it wrote them. On a change of the document, the preview renders the document again and changes its page with morphdom, which keeps each element that equals its new version, apart from `data-line`. So an unchanged block keeps its diagrams, which the renderer neither renders nor draws again, and a changed block keeps its last diagrams until the new ones are ready (checked in VS Code 1.142, and in `src/preview/markdownPreview.test.ts` with morphdom). A mutation observer and the event `vscode.markdown.updateContent` of the preview start each update. The styles reach the elements of the shadow root by their part names: `::part(diagram)`, `::part(pending)`, `::part(error)`, and `::part(following)` for each element after the first;
- shows the note "Rendering the diagram…" in a new block while its diagrams render, never its text. The note is a live region (`role="status"`), which screen readers announce. Each diagram is an image (`role="img"`) with the label "PlantUML diagram" and its title, which the engine writes into the group `g.title` of the SVG image;
- shows an error with its message, and with the number of the line of the block text when the message names a line, above the text of the block (a `slot` of the shadow root). The engine draws an error in the text as a picture with the line number among the lines that it received, which hold the lines that the extension adds: `@startuml` and `@enduml` around a body, the commands of the UML notation, and a missing `@end` line. `src/diagram/diagramLines.ts` therefore keeps for each line the line of the text that it comes from, and the renderer reads the picture (`errorOf`) and shows its own message instead;
- fails a rendering after 60 seconds. The engine then keeps working on it, so the next rendering waits until the engine has ended it, for 60 more seconds at most, and the late result is dropped. After a failed load of the engine, the next rendering loads it again. A diagram has no largest size: the renderer passes the option `maxSvgSize: 0`, without which the engine refuses images wider or higher than 8192 pixels;
- marks the inner `div` of each block with the attribute `data-plantuml-state`: `pending` while the block waits for the diagrams of its text, settings, included files and theme, and `drawn` when it shows them or the message of an error. A page of another extension reads it ([R-MD-007](docs/requirements.md#r-md-007)), for example nimblescape Markdown Paper, which copies the diagrams out of the shadow roots into its pages before Paged.js lays them out and the PDF prints them. The attribute is not part of the HTML of markdown-it, so the preview removes it when it writes its content again (morphdom changes the element in place and keeps its shadow root), and the next update of the script sets it again;
- keeps the SVG texts of the 50 most recently used diagrams in `localStorage`, by the address of the engine (which contains the version of the extension), the layout engine (Graphviz or Smetana, which the security setting decides), the theme and the rendered lines. VS Code gives all Markdown previews one origin and keeps their storage across previews and restarts (checked in VS Code 1.142), so a preview that opens again shows its diagrams without waiting for the engine, which needed about two seconds to start in a test. A full or blocked storage only keeps fewer results. VS Code gives each kind of webview its own origin, so each kind of preview of PlantUML files (the preview in the tab of the file, the preview to the side and the rendered diff) keeps its own storage with the same rules.

The diagrams use the dark mode of PlantUML when the theme of VS Code is dark
or high contrast dark.

The plugin reads the settings of the extension for the document that the
preview names in `currentDocument` of the render environment; for a text that
the rendered diff renders without a document, the extension takes the open
Markdown document with the same text, as for the included files. VS Code finds
the workspace folder of a document by its whole address, scheme included, so
a version of a file in Git (`git:`) has no folder and would get the settings
of the window; the extension reads the settings of the workspace folder of its
path instead, so that both sides of a diff render with the settings of the
folder of the file (checked in VS Code 1.142 with a workspace of two folders).
The preview renders again only when its document or a setting of the
Markdown extension changes, so the extension runs the command
`markdown.preview.refresh` when one of its own settings changes. It does so
only while the Markdown extension is active: no Markdown preview is open
before, and the command would start that extension.

## Code completion

`src/language/completion.ts` computes the proposals from the lines of a
context: a whole PlantUML file, or the lines of one PlantUML block of a
Markdown file. `src/markdown/blocks.ts` finds the blocks with markdown-it, the
parser of the preview, with the options of the preview (`html: true`), its
rule for the front matter of a document, and the info-string rule of the
preview, so that the editor and the preview agree: a fence in indented code
starts no block, and a block in a block quote or in a list item ends with its
container. It skips the inline rules of markdown-it, and a text without a
fence `plantuml` needs no parsing; a Markdown file of 50,000 lines with
PlantUML blocks needed about 50 ms in a test. The grammar of the highlighting
uses the same info-string rule, and a test runs the same info strings through
the grammar, the preview and the block search. The lines of a block in a block
quote or in a list item have a prefix; the completion works after the prefix
only. It reads the declarations
from the statements of the context (`src/diagram/lineKinds.ts`), without the
line of the cursor. `src/completionProvider.ts` registers one completion provider for
the language `plantuml` and one for `markdown`; the provider for `markdown`
returns nothing outside the PlantUML blocks. Each item has an explicit range
that starts at the `@`, `!`, `"`, `[` or `(` of the word, so that the editor
filters by the whole word.

The language at the cursor of a PlantUML block is `plantuml` for the editing
rules, but VS Code selects the completion providers and the editor options by
the language of the document, `markdown`. Two consequences:

- The Markdown extension of VS Code sets `editor.quickSuggestions` to off for Markdown, so the editor shows no proposals while the user types.
- VS Code ignores a trigger character that belongs to a word (`SuggestModel` checks `LineContext.shouldAutoTrigger` first), so letters as trigger characters do not help.

The extension therefore listens to the changes of the active Markdown
document. When the user types one letter at the end of a word inside a
PlantUML block, and `editor.quickSuggestions` of the language `plantuml` is
on (`on`, `true`, or the default `offWhenInlineCompletions`), it runs the
command `editor.action.triggerSuggest` with `{ "auto": true }`. With `auto`,
the editor shows nothing when there are no proposals; the command does
nothing while the proposals show. An undo, a paste, several cursors and
typing outside the PlantUML blocks start nothing. The extension reads the
blocks once for each version of a document.

## Formatting

`src/language/formatting.ts` indents the lines of each UML diagram
(`@startuml` … `@enduml`, or a text without `@start` lines) with a stack of
open blocks: a closing line closes a block only when it fits the innermost
open block, so that `end` inside an activity `if` stays a statement. Other
diagram types keep their lines, because the indentation of a mind map, a work
breakdown structure or YAML data has a meaning. Free text and the lines of
block comments keep their text (`src/diagram/lineKinds.ts`). The further lines
of an action of several lines move with its first line: a test in Chromium
showed that PlantUML shows the indentation of a further line beyond the
indentation of the first line as spaces, and ignores the indentation of notes
and legends.

The formatting must not change the text that a diagram shows
([R-PUML-007](docs/requirements.md#r-puml-007)), and PlantUML shows a run of
spaces in a label, a name or a value as it is. So a run of spaces in a
statement becomes one space only next to a part that the diagram does not
show as text: the first word, an arrow, `as`, quoted text, text in brackets,
parentheses or braces, a stereotype, a color, or the colon before a label. A
run between two other words stays. The label after the colon, actions,
dividers, delays, swimlanes and the text of titles and groups keep their
spaces. Members are the exception, as decided for the extension: each run of
spaces in a member becomes one space, outside quoted text. A diagram of another
type inside `@startuml` (`ditaa`, `salt`, `digraph` …) stays as it is. During
the development, a script widened the runs of spaces in about 25 diagrams of
all UML types in many random ways, formatted them, and compared the SVG of
the real engine before and after; it found no difference outside members.
The end line of a note accepts at most one space between `end` and `note`, as
PlantUML does, so that `end   note` stays free text in both.

`language-configuration.json` repeats the blocks of the formatting as
regular expressions, for the indentation while typing: `increaseIndentPattern`
matches an opening line or a middle line, and `decreaseIndentPattern` matches
a middle line or a closing line. These rules see one line at a time, without
the stack of open blocks, so an `end` inside an activity `if` moves one level
to the left while typing; the formatting indents it again.
`src/language/languageConfiguration.test.ts` indents formatted texts as the
command "Reindent Lines" does and compares the levels with those of the
formatting, so a change of the blocks in `src/language/formatting.ts` needs
the same change in both patterns. VS Code takes the indentation rules from the
language of the file, not from the language at the cursor (as of VS Code
1.142), so they do not apply inside a PlantUML block of a Markdown file; the
brackets and the comments of PlantUML do. The folding markers fold the
diagrams and the procedures, functions, sub parts and long definitions of the
preprocessor; VS Code folds the other blocks of a PlantUML file by their
indentation, and the Markdown extension folds each code block of a Markdown
file as a whole.

`src/formattingProvider.ts` registers a document formatter and a range formatter for
the languages `plantuml` and `markdown`. Each changed line gets one edit of
its text, so that the line breaks stay. For Markdown, the edits cover the
lines of the PlantUML blocks only, and each line keeps its prefix: the
indentation of a list item and of the fence, or the marker of a block quote. A
block whose prefix markdown-it changed, because a tab in the indentation of a
list item became spaces, stays as it is. Format on save formats only when
`editor.formatOnSaveMode` is `file`: with the other values, VS Code formats
the changed lines only, which the extension does not know. A range formatter
reads the whole context, so that the lines of a selection get their depth.

## npm package

`cli/` is the npm package `@nimblescape/plantuml`, in the scope of the
organization `nimblescape` on npmjs.com, as the npm packages of the other
extensions of the publisher (`@nimblescape/typescript`,
`@nimblescape/markdownnotes`, `@nimblescape/markdownpaper`): a folder `cli/`
of the repository of the extension, built by `esbuild.mjs`, tested by
`npm run test:cli` and published by the release. It holds the renderer of the
extension for other programs ([R-NPM-001](docs/requirements.md#r-npm-001)),
for example nimblescape Markdown Paper, which shows the PlantUML blocks on its
pages and in its PDF files as the Markdown preview shows them. Its manifest
`cli/package.json` has these parts:

- The name `@nimblescape/plantuml`. npm needs a scope for this name, because the name `plantuml` is not free on npmjs.com; the Marketplace has no scopes, so the extension keeps the form of [Naming](#naming).
- The version, which the release sets to the version of the extension. A test checks that both manifests and `cli/package-lock.json` have one version.
- `exports`: `.` is the library `dist/index.js` with its types `index.d.ts`, and `./page/*` names the files of the page in `dist/page/`: the script `markdownPreview.js`, the style sheet `markdownPreview.css` and the folder `engine/`, which the script loads next to it. `files` keeps these files and the notices; npm adds `package.json`, `README.md` and `LICENSE`.
- `engines.node` is `>=22`, and the package has no dependencies: the library and the script are bundles, and the engine is a copy. The type of markdown-it in `index.d.ts` comes from `@types/markdown-it` of the program that uses markdown-it. A test checks the types against the library.
- `repository.directory` is `cli`, and `publishConfig.access` is `public`, which a scoped package needs for its first version.

The library holds the markdown-it plugin of the extension, `settingsOf`,
which reads the settings `nimblescape.plantuml.*` from the parsed object of a
file `settings.json`, `readSettings`, which reads them from the file
`.vscode/settings.json` of a folder as VS Code reads it, with comments and
with commas after the last element (`src/cli/diskSettings.ts`), and
`readIncludedFiles`, which reads the included files
from the disk with the rules and the messages of the extension
(`src/diagram/includeProblems.ts`): relative to the folder of the document,
only from that folder and the folders that the program names, which stand
for the workspace folders, also as the target of a symbolic link, up to 1 MB
each. The page script renders the blocks of any page that loads it, and marks
each block with `data-plantuml-state` (see [Markdown preview](#markdown-preview)).

`cli/README.md` is the page of the package on npmjs.com, with full
`https://…` links only. The package of the extension holds no file of `cli/`.

Before the package is on npmjs.com, a program installs it from the GitHub
repository. npm cannot install a folder of a repository, so the program
clones a commit, builds the package and installs its file:

```sh
git clone https://github.com/nimblescape/nimblescape-plantuml
cd nimblescape-plantuml
git checkout <commit>
npm ci --ignore-scripts
node esbuild.mjs --production
npm pack ./cli
```

## Naming

Every extension of the publisher `nimblescape` uses one name,
`nimblescape-<name>`, for the repository, the package and the extension:

| What | Form | This extension |
| --- | --- | --- |
| Repository | `nimblescape/nimblescape-<name>` | `nimblescape/nimblescape-plantuml` |
| `name` in `package.json` | `nimblescape-<name>` | `nimblescape-plantuml` |
| Extension ID | `nimblescape.nimblescape-<name>` | `nimblescape.nimblescape-plantuml` |
| Package file | `nimblescape-<name>-<version>.vsix` | `nimblescape-plantuml-<version>.vsix` |
| Display name | `nimblescape <Title>` | `nimblescape PlantUML` |

The prefix keeps the name apart from the names of other publishers, because
the Marketplace accepts a `name` only once. The Marketplace cannot rename an
extension ID: another `name` publishes a new extension, and the old one stays
with its installations. An extension that is no longer wanted is unpublished
(More Actions > Unpublish; this can be undone), never removed: the Marketplace
keeps the `name` of a removed extension reserved permanently, also for its own
publisher.

## Release

A released version is a tag `v<version>` whose `<version>` equals the version
in `package.json` and in `cli/package.json`. The workflow "Release" creates
the version, its tag, its GitHub release, its Marketplace version and its
version on npmjs.com in one run. To release a version,
follow these steps:

1. Optional: add a section `## <version>` to `CHANGELOG.md` on `main`. The section describes the changes for the users (see [Release rules](#release-rules)).
2. In the tab "Actions", choose the workflow "Release", then "Run workflow" on the branch `main`. Enter the version, for example `0.1.7`. When `CHANGELOG.md` has no section for the version, enter its notes too: they become the section. The GitHub website starts a workflow also in the browser of a phone.

The run has five jobs:

1. "Version commit" checks that the run starts from `main`, that the version has the form `<major>.<minor>.<patch>`, that it is not lower than the version in `package.json` and that its tag does not exist, and, in a release, that a dry run tested the files of the release process with `scripts/release-checks.mjs dry-run` (rule 4 of the [release rules](#release-rules)). It sets the version in `package.json`, `package-lock.json`, `cli/package.json` and `cli/package-lock.json`, adds the section of the notes to `CHANGELOG.md` when the file has none, commits the change as "Release `<version>`" and pushes it to the temporary branch `release/run-<run ID>`, not to `main`. When `main` holds the version and its section already, it commits nothing. It also deletes the temporary branches of earlier runs that failed.
2. "CI" runs the workflow `ci.yml` for the commit of the version, because a push with the token of a workflow starts no other workflow. The VSIX and the npm package that this job tests and builds are the files of the release, so the release repeats no test and no build.
3. "Main, tag and GitHub release" runs only when CI passed. It moves `main` to the commit of the version as a fast-forward and deletes the temporary branch. When `main` changed during the run, it stops before the tag. Then it creates the tag `v<version>` on the commit and the release of the tag with the GitHub CLI `gh`. The section of the version in `CHANGELOG.md` becomes the notes, and the VSIX and the npm package (`nimblescape-plantuml-<version>.tgz`) become the files of the release. A release that exists keeps its notes and receives only a file that it does not hold.
4. "Publish to the Visual Studio Marketplace" downloads the VSIX of the GitHub release, signs in to Microsoft Entra ID with the official [`azure/login`](https://github.com/Azure/login) action and publishes the VSIX with `vsce publish --azure-credential`.
5. "Publish to npmjs.com" downloads the npm package of the GitHub release and publishes it with `npm publish --access public`, with [trusted publishing](https://docs.npmjs.com/trusted-publishers): npm exchanges the OpenID Connect token of the job for a token of npmjs.com that can publish only this package, and adds the provenance of the build. It skips a version that npmjs.com holds already, and it stops with a message when the package does not exist yet (see [npmjs.com setup](#npmjscom-setup)).

`main` receives the version commit only after CI passed. When CI fails,
`main`, the tags, the releases and the Marketplace stay unchanged, and the
version can still be released: fix the cause on `main` and start the release
of the same version again. The jobs move and push with the token of the
workflow, so a rule of `main` that blocks direct pushes stops the release.

A dry run tests a release without a change: choose "Dry run" when you start
the workflow. The run makes the version commit on its temporary branch, runs
CI for it and deletes the branch; it changes neither `main`, a tag, a release
nor the Marketplace. Its run name ends with "(dry run)". A dry run may start
from another branch than `main`, so it also tests a change of `release.yml` on
that branch before the change reaches `main`.

When a job fails, remove the cause and choose "Re-run failed jobs" on the
run. A re-run keeps the tag and the VSIX that the GitHub release already
holds, and the Marketplace skips a version that it already holds, so a re-run
never publishes a version twice. When the publish job fails, for example
because the Marketplace refuses the package, the tag and the GitHub release
stay, and the re-run publishes the VSIX of the GitHub release. GitHub allows a
re-run only within 30 days of the run; after that, only a new version can
reach the Marketplace. A new run deletes the temporary branch of a failed run,
so a failed run can no longer be re-run after a new run started.

The Marketplace refuses a package with more than 30 tags, with the error "You
exceeded the number of allowed tags of 30", which the Microsoft publishing
guide names. The tags are the keywords of `package.json` and the tags that
vsce adds, for example the language of each `onLanguage` event in
`activationEvents`; the element `<Tags>` of `extension.vsixmanifest` in the
VSIX lists them. No job counts them before the tag.

The workflows `release.yml`, `release-dry-run.yml` and
`marketplace-identity.yml`, the script `scripts/release-checks.mjs` with its
test `scripts/release-checks.test.mjs`, and this section are the same in every
extension repository of nimblescape. A change to them goes into every
repository.

### Release rules

Every extension of nimblescape follows these rules. Only rule 4 has a check
in the workflows, `scripts/release-checks.mjs dry-run`; everyone follows the
other rules without a check.

1. **The ID never changes.** An extension keeps its ID `nimblescape.nimblescape-<name>` (see [Naming](#naming)), and nimblescape never publishes an extension under a new ID.
2. **No deletion.** nimblescape never deletes an extension. No workflow, npm script or file of `scripts/` runs `vsce unpublish`, which deletes the extension on the Marketplace, or `vsce delete-publisher`, which deletes the publisher with all its extensions. On the publisher management page, nobody uses More Actions > Remove, which deletes the extension and keeps its name reserved permanently, or "Delete this version" (More Actions > Reports, tab Manage), after which the number of the version can never be used again. An extension that is no longer wanted is unpublished on the publisher management page, as [Naming](#naming) describes.
3. **Only changes for the users, at most one version in 7 days.** A version is published only when it changes something for the users, its section in `CHANGELOG.md` describes that change, and at least 7 days passed since the newest release; an urgent fix may come earlier. A change for the users changes the extension that VS Code runs: its code (`src/`, which the build bundles into `dist/`), another file of the package that is not a document, for example the icon of a view, or a field of `package.json` that changes how the extension works, for example `contributes`. A change only of the documents (for example the README), the Marketplace icon, the tests or the build tools (for example `esbuild.mjs`, `tsconfig.json` or a file of `scripts/`) does not count: it reaches the users with the next version that changes the extension. Images that only the README shows do not belong in the package: the README links them with full `https://github.com/…` links (see [Manifest](#manifest)). The section of the version in `CHANGELOG.md` does not say "maintenance release", "behaves as in" followed by a version, or a phrase of that kind.
4. **Dry run first.** A change of the release process is tested with a dry run before it reaches `main`. The files of the release process are `release.yml`, `ci.yml`, whose VSIX the release publishes, and `scripts/release-checks.mjs`. The workflow "Release dry run" runs on every pull request. When the pull request changes one of these files, also in an update by Dependabot, the check `dry-run` fails until a successful dry run, or the newest release, had these files as they are at the head of the pull request. Start the workflow "Release" on the branch of the pull request with "Dry run" and a version without a tag (with notes when `CHANGELOG.md` has no section for the version), then re-run the job "release dry run" of the pull request. A pull request from a fork cannot meet the rule, because the dry run needs a branch of this repository. The job "Version commit" of a release runs the check `dry-run` again, so a change that reached `main` without a dry run stops the release until a dry run tested it. Do not make "release dry run" a required check of `main`: the release moves `main` to its version commit, which has no result of the check.
5. **Only GitHub Actions with Microsoft Entra ID.** Only the job "Publish to the Visual Studio Marketplace" publishes, signed in with the app registration of [Marketplace setup](#marketplace-setup). No personal access token exists for the publisher. No other workflow, npm script or file of `scripts/` runs `vsce publish` or `vsce login`. Nobody uploads a VSIX on the publisher management page or runs `vsce publish`, `unpublish`, `delete-publisher` or `login` on a computer.

## Marketplace setup

The workflow publishes with a Microsoft Entra ID token, as the
[Microsoft publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace)
recommends. It uses no personal access token, because Azure DevOps retires
the global personal access tokens that the Marketplace needs on
1 December 2026. The publishing identity is an app registration with a
federated credential for each repository: GitHub Actions proves the identity
of the job with an OpenID Connect token, so no secret is stored. An app
registration needs no Azure subscription. One app registration publishes
every extension of the publisher `nimblescape`, because the Marketplace
grants the role of a member for the whole publisher.

### What exists

| Part | Where | Value |
| --- | --- | --- |
| Publisher | [Marketplace publisher management](https://marketplace.visualstudio.com/manage) | `nimblescape`, the `publisher` in `package.json` |
| App registration | [Microsoft Entra admin center](https://entra.microsoft.com), "App registrations" | `vscode-marketplace-publisher`, a member of the publisher `nimblescape` with the role "Contributor" |
| Organization variables | GitHub organization `nimblescape`, "Secrets and variables", "Actions", "Variables" | `AZURE_CLIENT_ID` (the application ID of the app) and `AZURE_TENANT_ID` (its directory ID); identifiers, not secrets |
| Federated credential | the app, "Certificates & secrets", "Federated credentials" | one for each repository, named after it |
| Environment | the settings of each repository, "Environments" | `marketplace`, reachable from the tags `v*` and the branch `main` only |

### Setup of a repository

A new extension repository needs its federated credential and its
environment. The script `scripts/marketplace-setup.sh` sets both up for the
GitHub repository of the remote `origin` of the clone, whose name must be the
`name` of `package.json`; it needs the Azure CLI, the GitHub CLI and Node.js,
the two CLIs signed in with an account that may change the app registration
and the settings of the repository. It shows what it sets up and
asks before it changes anything. It changes nothing that already exists, so it
can run again:

```sh
az login --allow-no-subscriptions
gh auth login
scripts/marketplace-setup.sh
```

Then run the workflow "Marketplace identity" in the tab "Actions" of the
repository: it signs in like the publish job and prints the member ID of the
app, which shows that the setup works.

The script gives the credential these values. For this repository:

| Field of the federated credential | Value |
| --- | --- |
| Issuer | `https://token.actions.githubusercontent.com` |
| Subject | `repo:nimblescape@156021698/nimblescape-plantuml@1421127814:environment:marketplace` |
| Audience | `api://AzureADTokenExchange` |

GitHub puts the owner ID and the repository ID into the subject of every
repository created after 15 July 2026, so a new owner of a reused name gets no
token. The subject also holds the name of the repository: after a rename of
the repository, run the script again and delete the credential of the old
name. One app accepts at most 20 federated credentials.

### Setup from scratch

Only when the publisher, the app or the variables are lost:

1. Create the publisher `nimblescape` on the publisher management page, signed in with the Microsoft account of nimblescape e.U.
2. Register the app `vscode-marketplace-publisher` in the Entra admin center: "New registration", "Single tenant", no API permission, no secret.
3. Set the organization variables `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` to the application ID and the directory ID of the app. Organization variables reach private repositories only on a paid GitHub plan.
4. Set up a repository with the script, and run its workflow "Marketplace identity".
5. On the publisher management page, open the publisher `nimblescape`, then "Members", and add the member ID that the workflow printed with the role "Contributor".

## npmjs.com setup

The job "Publish to npmjs.com" publishes with
[trusted publishing](https://docs.npmjs.com/trusted-publishers): npmjs.com
trusts the workflow `release.yml` of this repository in the environment
`npm`, and accepts the OpenID Connect token of its job instead of a token.
No npm token is stored in GitHub.

### What exists

| Part | Where | Value |
| --- | --- | --- |
| Organization | [npmjs.com](https://www.npmjs.com/org/nimblescape) | `nimblescape`, the scope of the package |
| Package | npmjs.com | `@nimblescape/plantuml`, public |
| Trusted publisher | the settings of the package on npmjs.com, "Trusted Publisher" | GitHub Actions, the repository `nimblescape/nimblescape-plantuml`, the workflow `release.yml`, the environment `npm` |
| Environment | the settings of the repository, "Environments" | `npm`, reachable from the tags `v*` and the branch `main` only |

### Setup

npmjs.com sets up a trusted publisher only for a package that exists, so
the first version is published once by hand, from the GitHub release of
that version. The script `scripts/npm-setup.sh` does all steps. It needs the
GitHub CLI and npm 11.15.0 or newer, both signed in: npm with an account
that may publish in the organization `nimblescape` and has two-factor
authentication, because `npm trust` and the first `npm publish` ask for the
second factor. It shows what it sets up and asks before it changes
anything. It changes nothing that already exists, so it can run again. It
shows the trusted publishers of the package and asks whether to add the
trusted publisher: npm lists them only after the second factor, in the
terminal, so the script cannot check them itself:

```sh
gh auth login
npm login
scripts/npm-setup.sh          # before the first release: the environment npm
scripts/npm-setup.sh 0.2.0    # after the release 0.2.0: its first version and the trusted publisher
```

The order for the first version of the package:

1. Run `scripts/npm-setup.sh` without a version, so the environment `npm` exists.
2. Release the version with the workflow "Release". The job "Publish to npmjs.com" fails, because the package does not exist yet; the Marketplace and the GitHub release are not affected.
3. Run `scripts/npm-setup.sh <version>`. It downloads the npm package of the GitHub release, publishes it, and adds the trusted publisher.
4. Re-run the failed job "Publish to npmjs.com". It finds the version on npmjs.com and ends without a change.

From the next version on, the release publishes to npmjs.com without a step
by hand. Optionally, set "Publishing access" of the package on npmjs.com to
"Require two-factor authentication and disallow tokens" after the setup:
trusted publishing still works, and no token can publish.

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) · [MIT License](LICENSE).
