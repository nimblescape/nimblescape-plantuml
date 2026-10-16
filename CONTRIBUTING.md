# Contributing

This guide explains the files, the development, the tests and the release of
the extension. The [README](README.md) describes the use in short, the
[user guide](docs/guide.md) describes every feature, and
[docs/requirements.md](docs/requirements.md) lists what the extension must do,
each requirement with an ID.

## Files

| File | Purpose |
| --- | --- |
| `src/extension.ts` | The editor wiring: activation returns the markdown-it plugin for the Markdown preview with the settings of the rendered document, refreshes the previews when a setting changes, and registers the code completion and the formatting for PlantUML files and for the PlantUML blocks of Markdown files, with the command "Format PlantUML Blocks" and the formatting of the blocks on save. |
| `src/settings.ts` | The settings of the extension that change the diagrams, their defaults, and their JSON form for the preview. It uses no API of VS Code, so the preview script can use it. |
| `src/language/keywords.ts` | The keywords of PlantUML that the highlighting and the code completion share. |
| `src/language/grammars.ts` | The TextMate grammars: `source.plantuml` for PlantUML text, and the injection `markdown.plantuml.codeblock`, which marks the PlantUML blocks of Markdown files. The build writes them into `dist/syntaxes/`. |
| `src/language/completion.ts` | The code completion: the declared names of a PlantUML text, and the proposals for a position. It uses no API of VS Code. |
| `src/language/formatting.ts` | The formatting: the indentation of the lines of a UML diagram by the depth of their blocks, and one space for each run of spaces inside a statement. It uses no API of VS Code. |
| `src/diagram/diagramLines.ts` | The lines that the engine renders for a PlantUML text: `@startuml` and `@enduml` around a body, and the settings applied. |
| `src/diagram/umlNotation.ts` | The UML notation of the setting `umlNotation`: the commands `skinparam style strictuml` and `skinparam classAttributeIconSize 0` after each `@startuml` line, the UML keyword as a stereotype in each declaration of a class kind, and `{static}` and `{abstract}` for the modifiers `static` and `abstract` of members. It adds nothing that the diagram has already. |
| `src/diagram/lineKinds.ts` | The kind of each line of a PlantUML text: statement, line comment, line of a block comment, or free text of a note, title, legend, header, footer, caption, reference or action of several lines. The UML notation, the code completion and the formatting use it. |
| `src/markdown/markdownIt.ts` | The markdown-it plugin: writes a PlantUML block as an element that carries the diagram text, and leaves every other token as it is. |
| `src/markdown/blocks.ts` | The PlantUML blocks of a Markdown text by their lines, for the code completion and the formatting. |
| `src/pumlPreviews.ts` | The previews of PlantUML files: the custom editor that shows a file as a preview in its own tab, the preview to the side, the rendered diff, and their commands. |
| `src/preview/renderer.ts` | The renderer that both previews share: loads the engine, renders the PlantUML blocks of a page one at a time, and keeps the results in memory and in the local storage of the preview. |
| `src/preview/markdownPreview.ts` | The script of the Markdown preview: starts the renderer for the PlantUML blocks of the page. |
| `src/preview/pumlPreview.ts` | The script of the preview of PlantUML files: writes a block for each diagram of the file, or a row for each pair of diagrams of a rendered diff, and starts the renderer. |
| `src/preview/previewHtml.ts` | The page of the preview of PlantUML files, with its security policy. |
| `media/markdownPreview.css` | The styles of the PlantUML blocks in the Markdown preview. |
| `media/pumlPreview.css` | The styles of the preview of PlantUML files and of the rendered diff. |
| `resources/icon.png`, `resources/icon.svg` | The Marketplace icon (256 × 256 PNG, because the Marketplace takes no SVG icon) and its source: a class with two subclasses on the tile of the nimblescape extensions. |
| `src/**/*.test.ts` | The tests, with vitest: the manifest, the package contents, the bundled engine and the documents (`src/manifest.test.ts`), the activation with a fake of the editor API, the settings, the diagram lines and the UML notation, the grammars with the TextMate engine of VS Code (`vscode-textmate` and `vscode-oniguruma`), the markdown-it plugin, the commands of the previews of PlantUML files with a fake of the editor API, and the preview scripts on a page of happy-dom with a fake engine. |
| `dist/` | The bundles `dist/extension.js`, `dist/markdownPreview.js` and `dist/pumlPreview.js` and the engine in `dist/engine/`, built by `esbuild.mjs` and kept out of Git. |
| `language-configuration.json` | The editing rules of the language PlantUML: comments, brackets and the pairs that the editor closes. |
| `docs/guide.md` | The user guide: every feature, how to use it, and its state. |
| `docs/requirements.md` | The requirements, each with an ID as its heading, and the plan of the steps. |
| `THIRD-PARTY-NOTICES.md` | The components of the bundled engine, their licenses and the places of their source code. |
| `SUPPORT.md` | Where to ask questions and report problems, and what a report contains. |
| `esbuild.mjs` | Bundles `src/extension.ts` into `dist/extension.js` for Node.js, and `src/preview/markdownPreview.ts` and `src/preview/pumlPreview.ts` into `dist/markdownPreview.js` and `dist/pumlPreview.js` for the browser of the previews, writes the grammars of `src/language/grammars.ts` into `dist/syntaxes/`, and copies the engine into `dist/engine/`. The editor API stays outside the bundle. A production build (`--production`) is minified and has no source maps. |
| `tsconfig.json` | The TypeScript settings of the type check: strict, and no output, because esbuild builds the bundle. |
| `vitest.config.mts` | The settings of the tests: the files `src/**/*.test.ts` on Node; a test file of the preview script selects happy-dom in its first lines. |
| `package.json` | The extension manifest. The section [Manifest](#manifest) explains it. |
| `package-lock.json` | The locked engine and development tools. npm writes this file, and nobody edits it by hand. |
| `.node-version` | The Node release of the development tools. `actions/setup-node` in the workflows and local Node version managers read it. |
| `.vscodeignore` | Lists the files of the package: `dist/extension.js`, `dist/markdownPreview.js`, `dist/pumlPreview.js`, `dist/engine/`, `dist/syntaxes/`, `media/markdownPreview.css`, `media/pumlPreview.css`, `resources/icon.png`, `language-configuration.json`, `package.json`, `README.md`, `CHANGELOG.md`, `SUPPORT.md`, `LICENSE` and `THIRD-PARTY-NOTICES.md`. |
| `.github/workflows/ci.yml` | Checks the types, tests and packages every push to `main`, every pull request and the commit of every release. |
| `.github/workflows/release.yml` | Releases a version on a manual start: commits the version to a temporary branch, tests and packages it with `ci.yml`, and only then moves `main` to it, creates its tag and GitHub release and publishes it to the Marketplace. A dry run tests without a change. The section [Release](#release) explains it. |
| `.github/workflows/marketplace-identity.yml` | Prints the Marketplace member ID of the publishing identity, to check the setup of the repository. |
| `.github/dependabot.yml` | Proposes weekly updates of the development tools, of the engine and of the pinned actions. |
| `scripts/install-local.mjs` | Builds the package and installs it into the current VS Code profile. The section [Development](#development) explains it. |
| `scripts/marketplace-setup.sh` | Sets up the Marketplace publishing of the repository. The section [Setup of a repository](#setup-of-a-repository) explains it. |
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
| `npm test` | Runs the tests with vitest. The tests touch no installed editor. |
| `npm run build` | Bundles `dist/extension.js` with a source map and copies the engine into `dist/engine/`. |
| `npm run package` | Builds `nimblescape-plantuml-<version>.vsix` with vsce, which first runs the production build (`vscode:prepublish`). vsce also validates the manifest and the README. |
| `npm run install-local` | Builds the package and installs it into the current VS Code profile only: the profile of the VS Code window that has this repository open (or a parent folder of it), or the default profile when no window has opened it yet. `npm run install-local -- --profile <name>` installs it into the named profile instead. Other profiles stay as they are. Before the build, it installs the locked development tools with `npm ci --ignore-scripts` when they are missing or older than `package-lock.json`. Reload the windows of the profile after an update of an active extension. |

The launch configuration "Run the extension" builds the bundle and starts a
second VS Code window that loads the extension from this folder, so that a
change can be tried without a package.

## Manifest

`package.json` is the extension manifest. It has these parts:

- The name and the publisher define the extension ID `nimblescape.nimblescape-plantuml`; the section [Naming](#naming) explains the name.
- The description, the keywords, the categories, the banner (`galleryBanner`), `preview` and `qna` make the page of the Marketplace. vsce turns some words of the description into search tags, for example "Java" into `java`; a test checks that the description adds no tag. `preview` shows the label "Preview" on the page, and `qna` sends the questions of the page to the GitHub issues.
- The version is the only source of the package version, and the tag of a release names it.
- The engine range defines the compatible VS Code versions. `@types/vscode` stays at the lowest version of that range.
- `main` selects the bundle `dist/extension.js`. A test checks it.
- `.vscodeignore` lists the files of the package, not a `files` field: it ignores everything and keeps the bundles, the engine, the styles of the previews, the icon, the language configuration and the documents. A test checks the list.
- `icon` is `resources/icon.png`, a PNG, because the Marketplace takes no SVG icon. `resources/icon.svg` is its source; after a change of the source, render it again as a PNG of 256 × 256 pixels with a transparent background, for example with a screenshot of the SVG in Chromium. A test checks the size.
- `extensionKind` selects the workspace host.
- The language contribution registers the language `plantuml` for its file extensions, with the editing rules of `language-configuration.json`. A test keeps the README table equal to the file extensions.
- The grammar contribution points to the grammars in `dist/syntaxes/`. The injection into `text.html.markdown` maps the scope `meta.embedded.block.plantuml` to the language `plantuml`, so that the editing rules of PlantUML, for example its comments, apply inside a PlantUML block of a Markdown file. A test checks the contribution against `src/language/grammars.ts`.
- The contributions `markdown.markdownItPlugins`, `markdown.previewScripts` and `markdown.previewStyles` connect the extension with the built-in Markdown preview. The Markdown extension of VS Code activates the extension and reads its export `extendMarkdownIt`. The section [Markdown preview](#markdown-preview) explains it.
- The activation event `onLanguage:markdown` starts the extension when a Markdown file opens, for the code completion and the formatting in PlantUML blocks. VS Code adds the event `onLanguage:plantuml` itself, because the extension contributes that language. The section [Code completion](#code-completion) explains it.
- The custom editor `nimblescape.plantuml.preview` shows a PlantUML file as a preview in its own tab, with the priority `option`, so that the text editor stays the default. The commands, the buttons in the title bar (`menus`) and the keys (`keybindings`) of the previews work as those of the Markdown preview: Ctrl+Shift+V switches a tab between the text and the preview, or between a diff and its rendered diff, and Ctrl+K V opens the preview to the side. The `when` clauses use `activeCustomEditorId` for the preview and `activeWebviewPanelId` for the rendered diff. The activation events `onWebviewPanel:nimblescape.plantuml.sidePreview` and `onWebviewPanel:nimblescape.plantuml.diffPreview` start the extension when VS Code restores these panels after a restart.
- The command `nimblescape.plantuml.formatBlocks` ("Format PlantUML Blocks") formats the PlantUML blocks of a Markdown file; the command palette shows it in Markdown files only. VS Code runs one formatter for "Format Document", the default formatter of the language, so the command and the formatting of the blocks on save (`editor.formatOnSave`) keep the blocks formatted when another extension, for example Prettier, formats Markdown files.
- The configuration defaults make the extension the default formatter of PlantUML files (`"[plantuml]": { "editor.defaultFormatter": … }`). A language-specific default of an extension wins over a general `editor.defaultFormatter` of the user, for example Prettier for every file, but not over a formatter that the user sets for the language `plantuml`. A test checks both.
- The configuration contribution declares the settings of `src/settings.ts` in the section `nimblescape.plantuml`, with the scope `resource`, so that a folder of a workspace can have its own value. A test keeps the defaults equal to `src/settings.ts`, and a test checks that the README and the guide name every setting.
- The untrusted-workspace and virtual-workspace capabilities state that the extension only reads.
- The runtime dependency is the engine `@plantuml/core`, pinned to one version; the section [Engine](#engine) explains it. The development dependencies are the build, test and packaging tools.

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
`node_modules` (`--no-dependencies`). The package does not bundle the standard
library of PlantUML (`!include <C4/C4_Context>` and others), which the engine
loads on demand from a configurable address.

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
- the Twemoji graphics (CC BY 4.0) and the Open Iconic icons (MIT).

The section "Source code" of the notices offers the source code of the parts
under the Eclipse Public License on request, because that license requires
this offer for object code. Tests check that the installed engine is under
the MIT License, that the notices name every script of the engine, and that
they name every theme with its license; a theme with a new kind of license
fails the test until the notices cover it. After an update of the engine:

- set the source link of PlantUML to the commit of the new npm package
  (`npm view @plantuml/core@<version> gitHead`), which is not always the
  commit of the tag of the version;
- check the versions in the notices against the headers of `viz-global.js`,
  and the version of TeaVM against `gradle/libs.versions.toml` of PlantUML at
  that commit.

## Markdown preview

The built-in Markdown preview renders a document with markdown-it. The
plugin `src/markdown/markdownIt.ts` writes a fenced code block with the info
string `plantuml` as a `div` with the class `nimblescape-plantuml`, the
attribute `data-plantuml-source` with the diagram text, and an inner `div`
with the class `nimblescape-plantuml-content`, which holds the text of the
block. The script replaces the text before the page shows it, so the text
shows only when the script does not run. The outer `div` keeps the attributes that
the preview gives to every block, `data-line` and the class `code-line`, which
the preview uses to synchronize the scrolling and to mark the changed blocks
of a rendered diff. Every other token keeps the output of the preview.

The rendered diff of VS Code (`documentRenderer.ts` and `preview-src/index.ts`
of the Markdown extension) affects the blocks in two ways:

- Before it renders, it inserts empty elements `<span data-diff-start="N"></span>` and `<span data-diff-end="N"></span>` into the Markdown text around each changed part of a line. In a code block, they are text, so the plugin removes them from the diagram text and from the info string.
- It marks a changed block with classes on the outer `div` and adds a bar to it as a child (`diff-modification-gutter`) left of the block. The script therefore changes only the inner `div`, and only the inner `div` scrolls, so that the bar is not cut off.

The preview loads `dist/markdownPreview.js` as a module. Its security policy
allows only scripts with the nonce of the page, no WebAssembly, no network
requests and no frames. The script therefore:

- loads the engine with a dynamic import, which keeps the nonce, and only when the page has a PlantUML block;
- sets `PLANTUML_STDLIB_LOADER`, so that the engine loads its further scripts (`themes.js`, `emoji.js`, `openiconic.js`) through script elements with the nonce; a library of the PlantUML standard library, which the package does not contain, fails with a message;
- loads Viz.js only when the page allows WebAssembly (the preview security setting "Disable"); otherwise PlantUML uses its own layout engine Smetana, which needs no WebAssembly. The script reads the security policy of the page and does not compile a test module, because a blocked compilation counts as a violation, and the preview then shows the warning "Some content has been disabled in this document";
- applies the settings, which the plugin writes as JSON into the attribute `data-plantuml-settings` when they differ from the defaults (`src/diagram/diagramLines.ts`);
- renders one block at a time, because the engine keeps shared state, and keeps up to 200 results by theme, settings and text;
- renders again after each change of the page: the preview replaces its content on every change of the document, and a mutation observer then shows the kept results at once. The observer runs before the page is drawn again, so the text that the preview writes never shows;
- shows, while a diagram renders, the last diagram of the block, or the note "Rendering the diagram…" (`nimblescape-plantuml-pending`) in a block without one. The preview keeps the element of a block when it writes the block again, and removes the attributes of the extension, so the renderer keeps the last result of each element;
- keeps the SVG texts of the 50 most recently used diagrams in `localStorage`, by the address of the engine (which contains the version of the extension), the theme and the rendered lines. VS Code gives all Markdown previews one origin and keeps their storage across previews and restarts (checked in VS Code 1.142), so a preview that opens again shows its diagrams without waiting for the engine, which needed about two seconds to start in a test. A full or blocked storage only keeps fewer results. The preview of PlantUML files uses the same storage for its own origin.

The diagrams use the dark mode of PlantUML when the theme of VS Code is dark
or high contrast dark.

The plugin reads the settings of the extension for the document that the
preview names in `currentDocument` of the render environment; the rendered
diff renders a text without a document, which gets the settings of the
window. The preview renders again only when its document or a setting of the
Markdown extension changes, so the extension runs the command
`markdown.preview.refresh` when one of its own settings changes.

## Code completion

`src/language/completion.ts` computes the proposals from the lines of a
context: a whole PlantUML file, or the lines of one PlantUML block of a
Markdown file, which `src/markdown/blocks.ts` finds with the fence rules of
CommonMark and the info-string rule of the preview. It reads the declarations
from the statements of the context (`src/diagram/lineKinds.ts`), without the
line of the cursor. `src/extension.ts` registers one completion provider for
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
and legends. Inside a statement, each run of spaces and tabs becomes one space;
quoted text, monospaced text of Creole (`""…""`) and the rest of a line after
a quote without end keep their spaces, because these spaces belong to a name or a text that the diagram shows.

`src/extension.ts` registers a document formatter and a range formatter for
the languages `plantuml` and `markdown`. Each changed line gets one edit of
its text, so that the line breaks stay. For Markdown, the edits cover the
lines of the PlantUML blocks only, each with the indentation of its opening
fence as the base. A range formatter reads the whole context, so that the
lines of a selection get their depth.

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
(More Actions, Unpublish, which can be undone), never removed: the Marketplace
keeps the `name` of a removed extension reserved for good, also for its own
publisher.

## Release

A released version is a tag `v<version>` whose `<version>` equals the version
in `package.json`. The workflow "Release" creates the version, its tag, its
GitHub release and its Marketplace version in one run. To release a version,
follow these steps:

1. Optional: add a section `## <version>` to `CHANGELOG.md` on `main`.
2. In the tab "Actions", choose the workflow "Release", then "Run workflow" on the branch `main`. Enter the version, for example `0.1.7`. When `CHANGELOG.md` has no section for the version, enter its notes too: they become the section. The GitHub website starts a workflow also in the browser of a phone.

The run has four jobs:

1. "Version commit" checks that the run starts from `main`, that the version has the form `<major>.<minor>.<patch>`, that it is not lower than the version in `package.json` and that its tag does not exist. It sets the version in `package.json` and `package-lock.json`, adds the section of the notes to `CHANGELOG.md` when the file has none, commits the change as "Release `<version>`" and pushes it to the temporary branch `release/run-<run ID>`, not to `main`. When `main` holds the version and its section already, it commits nothing. It also deletes the temporary branches of earlier runs that failed.
2. "CI" runs the workflow `ci.yml` for the commit of the version, because a push with the token of a workflow starts no other workflow. The VSIX that this job tests and builds is the VSIX of the release, so the release repeats no test and no build.
3. "Main, tag and GitHub release" runs only when CI passed. It moves `main` to the commit of the version as a fast-forward and deletes the temporary branch. When `main` changed during the run, it stops before the tag. Then it creates the tag `v<version>` on the commit and the release of the tag with the GitHub CLI `gh`. The section of the version in `CHANGELOG.md` becomes the notes, and the VSIX becomes the file of the release. A release that exists keeps its notes and receives the VSIX only when it holds none.
4. "Publish to the Visual Studio Marketplace" downloads the VSIX of the GitHub release, signs in to Microsoft Entra ID with the official [`azure/login`](https://github.com/Azure/login) action and publishes the VSIX with `vsce publish --azure-credential`.

`main` receives the version commit only after CI passed. When CI fails,
`main`, the tags, the releases and the Marketplace stay unchanged, and the
version stays free: fix the cause on `main` and start the release of the same
version again. The jobs move and push with the token of the workflow, so a
rule of `main` that blocks direct pushes stops the release.

A dry run tests a release without a change: choose "Dry run" when you start
the workflow. The run makes the version commit on its temporary branch, runs
CI for it and deletes the branch; it changes neither `main`, a tag, a release
nor the Marketplace. A dry run may start from another branch than `main`, so
it also tests a change of `release.yml` on that branch before the change
reaches `main`.

When a job fails, remove the cause and choose "Re-run failed jobs" on the
run. A re-run keeps the tag and the VSIX that the GitHub release already
holds, and the Marketplace skips a version that it already holds, so a re-run
never publishes a version twice. A new run deletes the temporary branch of a
failed run, so a failed run can no longer be re-run after a new run started.

The workflows `release.yml` and `marketplace-identity.yml` and this section
are the same in every extension repository of nimblescape. A change to them
goes into every repository.

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

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) · [MIT License](LICENSE).
