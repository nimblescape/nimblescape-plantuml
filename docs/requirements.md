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
| 2 | Markdown: rendering, rendered diff, highlighting, code completion and formatting of PlantUML blocks | [R-MD-001](#r-md-001) to [R-MD-006](#r-md-006) |
| 3 | PlantUML files: the same features | [R-PUML-002](#r-puml-002) to [R-PUML-007](#r-puml-007) |
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

## Markdown

### R-MD-001

**Rendering in the Markdown preview.** A fenced code block with the info
string `plantuml` in a Markdown file shows as a diagram in the built-in
Markdown preview of VS Code: in the preview to the side (Ctrl+K V) and in the
preview in the same tab (Ctrl+Shift+V).

### R-MD-002

**Rendered Git diff of Markdown.** In the rendered diff of a Markdown file
("Reopen Editor With…", "Markdown Preview" in a diff), the PlantUML blocks of
both versions show as diagrams.

### R-MD-003

**Highlighting in Markdown.** The text of a PlantUML block in a Markdown file
has syntax highlighting.

### R-MD-004

**Code completion in Markdown.** The text editor offers code completion inside
a PlantUML block of a Markdown file.

### R-MD-005

**Formatting in Markdown.** The extension formats the text of the PlantUML
blocks of a Markdown file and changes no other text of the file.

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
user can show the old and the new diagram side by side. The changes get marks
as soon as VS Code makes the API `customEditorDiffs` stable; until then, the
proposed API stays unused ([R-GEN-005](#r-gen-005)).

### R-PUML-005

**Highlighting in PlantUML files.** The text of a PlantUML file has syntax
highlighting.

### R-PUML-006

**Code completion in PlantUML files.** The text editor offers code completion
in a PlantUML file.

### R-PUML-007

**Formatting of PlantUML files.** The extension formats PlantUML files.

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) ·
[MIT License](https://github.com/nimblescape/nimblescape-plantuml/blob/main/LICENSE).
