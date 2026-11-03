<!--
SPDX-License-Identifier: MIT
© 2026 Hannes Stauss (scalarion@nimblescape.com)
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Requirements

This document lists what nimblescape PlantUML must do. Each requirement has
an ID as its heading, so that code, tests and pull requests can link to it,
for example `[R-MD-001](docs/requirements.md#r-md-001)`. Markdown support
comes first, the support of PlantUML files second.

## Plan

| Step | Content | Requirements |
| --- | --- | --- |
| 1 | Setup: manifest, build, the bundled engine, CI, release workflows, license notices | [R-GEN-001](#r-gen-001), [R-GEN-004](#r-gen-004), [R-GEN-005](#r-gen-005), [R-GEN-006](#r-gen-006), [R-PUML-001](#r-puml-001) |
| 2 | Markdown: rendering, rendered diff, highlighting, code completion and formatting of PlantUML blocks | [R-MD-001](#r-md-001) to [R-MD-006](#r-md-006), [R-GEN-007](#r-gen-007) to [R-GEN-013](#r-gen-013) |
| 3 | PlantUML files: the same features | [R-PUML-002](#r-puml-002) to [R-PUML-008](#r-puml-008), [R-GEN-007](#r-gen-007) to [R-GEN-013](#r-gen-013) |
| 4 | Tests, README, icon, and a release workflow that is ready but not run | all |
| 5 | The diagrams on the pages of other extensions, such as the pages and the PDF of nimblescape Markdown Paper | [R-MD-007](#r-md-007) |
| 6 | The npm package `@nimblescape/plantuml` with the renderer for other programs, built and tested in CI and published by the release | [R-NPM-001](#r-npm-001), [R-GEN-006](#r-gen-006) |

## General

### R-GEN-001

**Engine.** The extension renders with the npm package
[`@plantuml/core`](https://www.npmjs.com/package/@plantuml/core), PlantUML
compiled to JavaScript with TeaVM, in version 1.2026.6 or later, because
earlier versions are not under the MIT License. The engine is part of the
package of the extension. Rendering needs no Java, no Graphviz installation,
no server and no network connection.

### R-GEN-002

**Diagram types.** The extension renders every diagram type that the engine
renders. It hides or blocks no diagram type.

### R-GEN-003

**No export.** The extension only renders diagrams. It exports no diagram to a
file, neither SVG nor any other format.

### R-GEN-004

**Licenses.** The extension respects the licenses of the projects that it
uses. `THIRD-PARTY-NOTICES.md` names every bundled component, its license and
the place of its source code. This includes the parts inside a bundled file,
for example the runtime of the compiler and the libraries inside the engine,
and each theme with its own license. It holds the full text of every license
that requires it, and the notices that a license requires, such as the NOTICE
file of a project under the Apache License. For the parts under the Eclipse
Public License, it offers their source code. Code that comes from
[vscode-plantuml](https://github.com/qjebbs/vscode-plantuml) (MIT) keeps its
copyright notice.

### R-GEN-005

**Marketplace rules.** The extension follows the rules of the Visual Studio
Marketplace. It uses no proposed VS Code API, because the Marketplace does
not accept extensions that use one. Its name and texts do not suggest an
official product of the PlantUML project.

### R-GEN-006

**Release.** The publisher is `nimblescape`. The release uses the same
workflows and checks as the other extensions of the publisher (`release.yml`,
`release-dry-run.yml`, `marketplace-identity.yml`,
`scripts/release-checks.mjs`) and follows the
[release rules](../CONTRIBUTING.md#release-rules) of the publisher: the
extension ID never changes, no deletion, only versions that change something
for the users and at most one version in 7 days, a dry run before a change of
the release process reaches `main`, and publishing only from GitHub Actions
with Microsoft Entra ID. The release also publishes the npm package
([R-NPM-001](#r-npm-001)) to npmjs.com with trusted publishing, in the same
version as the extension. Nobody publishes the extension or the npm package
until Hannes asks for it.

### R-GEN-007

**UML notation.** A setting renders UML diagrams in the notation of the UML
standard, as far as PlantUML allows. The setting is on by default. When it is
off, the diagrams show the own notation of PlantUML.

The extension has no rendering logic of its own. It reaches the UML notation
with the means of PlantUML only, in this order:

1. It uses what PlantUML supports out of the box, for example the UML style
   (`skinparam style strictuml`) and the visibility as characters
   (`skinparam classAttributeIconSize 0`).
2. Where the result is not UML notation yet and standard PlantUML text can
   change it, the extension changes the copy of the diagram text that
   PlantUML renders, for example with a stereotype such as `<<interface>>`.
   The file stays as it is.

The result:

- The kind of a class shows no colored circle with a letter (C, I, E, A …).
  A kind with a UML keyword shows the keyword above its name, for example
  «interface» or «enumeration». An abstract class shows its name in italics.
- The visibility of attributes and methods shows as the characters `-`
  (private), `#` (protected), `~` (package private) and `+` (public).
- A static attribute or method is underlined, and an abstract one shows in
  italics. This applies to the modifiers `{static}`, `{classifier}` and
  `{abstract}` of PlantUML, and to the modifiers `static` and `abstract` at
  the start of a member in the body of a class.
- In a sequence diagram, a synchronous message has a filled arrowhead, and
  the participants show above the lifelines only.
- In an object diagram, the names of the objects are underlined.

The extension recognizes what the diagram has already and adds nothing twice:
no command that the diagram sets itself, for example
`skinparam style strictuml`; no stereotype that a declaration has already; and
no modifier for a member that has a modifier of PlantUML already.

The setting applies to the PlantUML blocks of Markdown files and to PlantUML
files.

### R-GEN-008

**Included files.** A diagram can include files with the lines `!include`,
`!include_many`, `!include_once` and `!includesub` of PlantUML. The engine
cannot read files, so the extension reads each included file and puts its
text into the copy of the diagram text that the engine renders. The file of
the diagram stays as it is. The rules are those of PlantUML:

- A relative path starts at the folder of the Markdown or PlantUML file; in an
  included file, it starts at the folder of that file.
- A path can select a diagram of the file by its number or by its id
  (`!include parts.puml!1`, `!include parts.puml!MY_ID`), and `!includesub`
  selects the lines between `!startsub` and `!endsub` of a name. Without a
  selection, the first diagram of the file is included, or the whole file
  when it has no `@start` line.

The extension reads files only in the workspace folders and in the folder of
the document, as the Markdown preview does for images, and only files up to
1 MB. It reads the saved file: when an included file is saved, created or
deleted, the previews that include it render again. In the rendered Git diff,
the old version includes the files of the same Git version. The extension
reads no file from the internet and no path with a variable or a function
(`$` or `%`). The libraries of the standard library of PlantUML
(`!include <…>`) are not files; the engine handles them.

A problem with an included file shows as a message at the line of the
include, for example a missing file, a folder, a file that is too large, a
file outside these folders, or a file that includes itself. An error inside an
included file names the line of the include and the line in the included
file.

### R-GEN-009

**Diagrams of a text.** A PlantUML block or a PlantUML file can hold several
diagrams, each from its `@start…` line to its `@end…` line. The preview shows
every diagram, in the order of the text. A text without an `@start…` line
renders as one UML diagram, as if it started with `@startuml` and ended with
`@enduml`, and a diagram without its `@end…` line renders as if it had one.

### R-GEN-010

**Errors.** When the engine cannot render a diagram, the preview shows the
message of the engine in place of the diagram, with the text of the PlantUML
block, or of the diagram in a PlantUML file, below it. The message names the number of the line in the user's text: in a
PlantUML file, the line of the file; in a Markdown file, the line of the
block, where line 1 is the first line after the opening fence. The lines that
the extension adds to the copy that the engine renders
([R-GEN-007](#r-gen-007), [R-GEN-009](#r-gen-009)) do not change the number.
The other diagrams of the text still show.

A diagram has no largest size. A rendering that takes longer than 60 seconds
fails with a message, and the next diagram renders after it.

### R-GEN-011

**Layout engine.** A preview arranges the diagrams with Graphviz (Viz.js)
when its page allows WebAssembly, and otherwise with Smetana, the layout
engine of PlantUML that needs no WebAssembly. The previews of PlantUML files
allow WebAssembly. The Markdown preview allows it only with its security
setting "Disable"; the extension does not change the security of the
Markdown preview.

### R-GEN-012

**Color theme.** With a dark color theme of VS Code, including a dark high
contrast theme, the diagrams use the dark mode of PlantUML; with a light
theme, its normal colors. When the color theme changes, the open previews
render their diagrams again.

### R-GEN-013

**Stored diagrams.** The previews keep the pictures of the 50 most recently
rendered diagrams in the storage that VS Code keeps for its webviews on the
user's computer, so that a preview that opens again, also after a restart of
VS Code, shows its diagrams at once. A stored picture is used only for the
same version of the extension, layout engine, color theme, settings and
text, with the same included files. The previews store nothing else and send
nothing to the internet.

## Markdown

### R-MD-001

**Rendering in the Markdown preview.** A fenced code block with the info
string `plantuml` in a Markdown file shows as a diagram in the built-in
Markdown preview of VS Code: in the preview to the side (Ctrl+K V) and in the
preview in the same tab (Ctrl+Shift+V). While a diagram renders, the block
does not show the diagram text: it shows its last diagram or a note.

### R-MD-002

**Rendered Git diff of Markdown.** In the rendered diff of a Markdown file
("Reopen Editor With…", "Markdown Preview" in a diff), the PlantUML blocks of
both versions show as diagrams.

### R-MD-003

**Highlighting in Markdown.** The text of a PlantUML block in a Markdown file
has syntax highlighting.

### R-MD-004

**Code completion in Markdown.** The text editor offers code completion inside
a PlantUML block of a Markdown file. The proposals are the PlantUML keywords
and the names that the same block declares, for example participants, classes
and aliases. Names that other blocks of the file declare are not proposed.

### R-MD-005

**Formatting in Markdown.** The extension formats the text of the PlantUML
blocks of a Markdown file with the rules of [R-PUML-007](#r-puml-007) and
changes no other text of the file. This also works when another extension,
for example Prettier, is the default formatter of Markdown files: with a
command, and on each save when `editor.formatOnSave` is on.

### R-MD-006

**No change outside PlantUML blocks.** The extension does not change the
behavior of the Markdown editor and of the Markdown preview outside the
PlantUML blocks. Inside a PlantUML block, it adds the rendering in the preview
([R-MD-001](#r-md-001), [R-MD-002](#r-md-002)), the syntax highlighting
([R-MD-003](#r-md-003)), the code completion ([R-MD-004](#r-md-004)) and the
formatting ([R-MD-005](#r-md-005)).

For the formatting, the extension registers a formatter for Markdown files
that changes only the PlantUML blocks. VS Code lists it with the other
formatters of Markdown files: without another one, "Format Document" formats
the PlantUML blocks; with another one and no default formatter of Markdown
files, VS Code asks the user to set the default formatter. This is the only
effect of the extension on Markdown files outside the PlantUML blocks.

### R-MD-007

**Pages of other extensions.** Another extension can show the PlantUML blocks
of a Markdown file as the Markdown preview shows them, for example nimblescape
Markdown Paper on its pages and in its PDF. Such an extension uses the
markdown-it plugin of the extension (`extendMarkdownIt` of its export), the
script of the Markdown preview and its style sheet on its own page, as the
Markdown preview does. The diagrams then have the same engine, settings,
included files and layout engine as in the Markdown preview:

- The script renders the PlantUML blocks of any page that loads it, also of a
  page that is not the Markdown preview of VS Code.
- The diagrams use the light colors of PlantUML unless the body of the page has
  the class of a dark theme of VS Code ([R-GEN-012](#r-gen-012)), and Graphviz
  only when the page allows WebAssembly ([R-GEN-011](#r-gen-011)).
- The inner element of each block (class `nimblescape-plantuml-content`) has
  the attribute `data-plantuml-state`: `pending` while the block waits for the
  diagrams of its text, settings, included files and color theme, and `drawn`
  when it shows them, or the message of an error in their place. The diagrams
  are in the open shadow root of that element, so that the page can copy them,
  for example into its pages before it prints them.

## npm package

### R-NPM-001

**The renderer as an npm package.** The repository also holds the npm package
`@nimblescape/plantuml` in the folder `cli/`, with the renderer of the
extension for other programs, such as nimblescape Markdown Paper, which shows
the PlantUML blocks of a Markdown file on its pages and in its PDF files
([R-MD-007](#r-md-007)). The extension and the package build from the same
sources, so a diagram looks the same in the Markdown preview and on the pages
of such a program.

- The package holds the markdown-it plugin of the extension, the reading of
  the settings `nimblescape.plantuml.*` from the settings of VS Code as a
  program finds them in a file `settings.json`, also from the file
  `.vscode/settings.json` of a folder as VS Code reads it (JSON with comments
  and with commas after the last element), the reading of the included
  files from the disk with the rules of [R-GEN-008](#r-gen-008), and the
  files of the page: the script of the Markdown preview, its style sheet and
  the engine with the library C4.
- The package needs Node.js 22 or later and has no dependencies. Its types
  are part of the package.
- The package has the version of the extension. The CI builds and tests it,
  and the release publishes it to npmjs.com with the extension
  ([R-GEN-006](#r-gen-006)). The npm packages of the other extensions of the
  publisher, such as `@nimblescape/typescript` and
  `@nimblescape/markdownnotes`, have the same form: a folder `cli/` of the
  repository of the extension, built by `esbuild.mjs`, tested by
  `npm run test:cli`, and published by the job "Publish to npmjs.com" of the
  release.
- Before the package is on npmjs.com, a program installs it from the GitHub
  repository: it clones a commit, builds the package and installs the file
  of `npm pack ./cli`.

## PlantUML files

### R-PUML-001

**Language.** Files with the extensions `.puml`, `.plantuml`, `.pu`, `.iuml`
and `.wsd` have the language PlantUML. The comment commands of VS Code use the
line comment `'` and the block comment `/' '/`.

The editor folds each diagram from its `@start…` line to its `@end…` line,
and each procedure, function, sub part and long definition of the
preprocessor. While the user types, the editor indents the lines of the
blocks of the formatting ([R-PUML-007](#r-puml-007)) as the formatting does.

### R-PUML-002

**Switching between text and preview.** A PlantUML file switches between text
and preview in the same tab, as a Markdown file does: Ctrl+Shift+V switches in
both directions, the title bar of the text editor has a button that opens the
preview, and the title bar of the preview has a button that opens the text.

### R-PUML-003

**Preview to the side.** Ctrl+K V opens the preview of a PlantUML file next to
its text, and the preview follows every change of the text while the user
types. When the active text editor shows another PlantUML file, the preview
to the side shows that file.

In every preview of a PlantUML file, a diagram is never wider than the
preview. A click on a diagram that the preview makes smaller shows it in its
original size, with a scroll bar; a second click fits it to the preview
again.

### R-PUML-004

**Rendered Git diff of PlantUML files.** In the diff of a PlantUML file, the
same keys and buttons as for the preview switch the tab to a rendered diff
and back. The rendered diff shows the old diagrams on the left and the new
diagrams on the right, puts each changed diagram next to its old version, and
marks the changed, added and removed diagrams. Marks on single lines inside a
diagram need the API `customEditorDiffs`, which is not stable yet; until
VS Code makes it stable, the proposed API stays unused
([R-GEN-005](#r-gen-005)).

### R-PUML-005

**Highlighting in PlantUML files.** The text of a PlantUML file has syntax
highlighting.

### R-PUML-006

**Code completion in PlantUML files.** The text editor offers code completion
in a PlantUML file. The proposals are the PlantUML keywords and the names that
the same file declares, for example participants, classes and aliases.

### R-PUML-007

**Formatting of PlantUML files.** The extension formats PlantUML files. It
is the default formatter of PlantUML files, also when the user has set another
default formatter for all files.

The formatting indents the lines inside the blocks of a UML diagram and writes
one space for a run of spaces between the parts of a statement, for example
around an arrow. It does not change the text that the diagram shows: a label,
an action, a title, the text of a group, a name of several words and quoted
text keep their spaces. The members of a class, an object or a map are the
exception: each run of spaces in a member becomes one space, outside quoted
text, for example `- type:      string` becomes `- type: string`. Diagrams of
other types than UML stay as they are.

### R-PUML-008

**Restored previews.** After a restart of VS Code, the previews of PlantUML
files that were open show again: the preview in the tab of a file, the
preview to the side and the rendered diff. A restored preview to the side or
rendered diff whose file no longer exists closes, without an error.

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) ·
[MIT License](https://github.com/nimblescape/nimblescape-plantuml/blob/main/LICENSE).
