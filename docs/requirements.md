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
| 2 | Markdown: rendering, rendered diff, highlighting, code completion and formatting of PlantUML blocks | [R-MD-001](#r-md-001) to [R-MD-006](#r-md-006), [R-GEN-007](#r-gen-007) |
| 3 | PlantUML files: the same features | [R-PUML-002](#r-puml-002) to [R-PUML-007](#r-puml-007), [R-GEN-007](#r-gen-007) |
| 4 | Tests, README, icon, and a release workflow that is ready but not run | all |

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
the place of its source code. Code that comes from
[vscode-plantuml](https://github.com/qjebbs/vscode-plantuml) (MIT) keeps its
copyright notice.

### R-GEN-005

**Marketplace rules.** The extension follows the rules of the Visual Studio
Marketplace. It uses no proposed VS Code API, because the Marketplace does
not accept extensions that use one. Its name and texts do not suggest an
official product of the PlantUML project.

### R-GEN-006

**Release.** The publisher is `nimblescape`. The release uses the same
workflows as the other extensions of the publisher (`release.yml`,
`marketplace-identity.yml`). Nobody publishes the extension until Hannes asks
for it.

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
blocks of a Markdown file and changes no other text of the file. This also
works when another extension, for example Prettier, is the default formatter
of Markdown files: with a command, and on each save when
`editor.formatOnSave` is on.

### R-MD-006

**No change outside PlantUML blocks.** The extension does not change the
behavior of the Markdown editor and of the Markdown preview outside the
PlantUML blocks. Inside a PlantUML block, it adds the rendering in the preview
([R-MD-001](#r-md-001), [R-MD-002](#r-md-002)), the syntax highlighting
([R-MD-003](#r-md-003)), the code completion ([R-MD-004](#r-md-004)) and the
formatting ([R-MD-005](#r-md-005)).

## PlantUML files

### R-PUML-001

**Language.** Files with the extensions `.puml`, `.plantuml`, `.pu`, `.iuml`
and `.wsd` have the language PlantUML. The comment commands of VS Code use the
line comment `'` and the block comment `/' '/`.

### R-PUML-002

**Switching between text and preview.** A PlantUML file switches between text
and preview in the same tab, as a Markdown file does: Ctrl+Shift+V switches in
both directions, the title bar of the text editor has a button that opens the
preview, and the title bar of the preview has a button that opens the text.

### R-PUML-003

**Preview to the side.** Ctrl+K V opens the preview of a PlantUML file next to
its text, and the preview follows every change of the text while the user
types.

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

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) ·
[MIT License](https://github.com/nimblescape/nimblescape-plantuml/blob/main/LICENSE).
