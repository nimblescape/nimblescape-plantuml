# Change log

Each section lists the changes of one released version. The release workflow
takes the section of a version as the notes of its GitHub release.

## 0.3.0

**Export as SVG.** The new command "PlantUML: Export Diagrams as SVG" writes
one SVG file for each diagram of a PlantUML file, or of the PlantUML blocks
of a Markdown file, into the folder of the file. A file with one diagram
gives `notes.svg`; a file with several diagrams gives one file for each,
named by the type of the diagram, for example `notes-sequence.svg` and
`notes-class.svg`, and numbered when several diagrams have the same type, for
example `notes-sequence-1.svg` and `notes-sequence-2.svg`. The files have the
normal colors of PlantUML with a white background, so that a viewer with a
dark theme shows them, the UML notation of the setting
`nimblescape.plantuml.umlNotation`, and the included files. Run the command
from the command palette in any editor of a PlantUML or Markdown file, also
in its preview, or from the context menu of a PlantUML file in the explorer.

## 0.2.2

**PlantUML 1.2026.9.** The extension renders with the engine 1.2026.9. Wireframes with `@startsalt` now render, and `salt` is a diagram type of the highlighting and the completion. The links of a diagram (`[[…]]`) are links of the picture: a click opens web, mail and `vscode:` addresses. In the preview of PlantUML files, a click on a link opens it and no longer changes the size of the diagram.

**Included files through symbolic links.** The extension reads an included file through a symbolic link only when the target is in a workspace folder or in the folder of the document. Before, a link in a cloned repository, for example to a file in your home folder, showed that file in a preview. The Markdown preview keeps the texts of the included files in a hidden element, each file once for each page, and the preview of PlantUML files allows no forms.

**Faster previews.** The previews read the included files in the background, so a slow drive blocks VS Code less. A saved change of an included file in a virtual workspace renders the previews again. The stored diagrams stay within 1,000,000 characters together, so they leave room for the stored data of other extensions in the Markdown preview. The completion stays fast on very long lines.

**Log.** The log "nimblescape PlantUML" in the Output view shows the problems that no diagram shows, for example a preview that cannot be restored. Add it to a report of a problem.

**Diagrams on the pages of other extensions.** The script of the Markdown preview also renders the PlantUML blocks on the page of another extension that loads it, and each block tells that page when its diagrams are drawn.

**npm package.** The new npm package [`@nimblescape/plantuml`](https://github.com/nimblescape/plantuml-vscode/blob/main/cli/README.md) renders the PlantUML blocks of Markdown outside VS Code, with the same engine, the same included files and the settings of a folder.

## 0.2.1

The Markdown preview of PlantUML diagrams uses markdown-it 14.3.3, the newest patch release of the Markdown parser.

## 0.2.0

**Colors of class members.** In the body `{ … }` of a class, an interface,
an enum or another classifier, the editor colors the members as the theme
colors code: the name of an attribute as a property, the name of an
operation as a function, a parameter as a parameter, a type as a type, and
a value of an enum as an enum member. The colors follow the notation of
UML, for example `name : Type` and `name(param : Type) : Type`, so they do
not depend on the programming language that the diagram describes; a
member in another order, for example `int count`, keeps the color of plain
text.
This works in PlantUML files and in the PlantUML blocks of Markdown files.
The diagram does not change.

## 0.1.0

The first version.

- Shows the ```` ```plantuml ```` blocks of Markdown files as diagrams in the
  built-in Markdown preview and in its rendered Git diff.
- Shows PlantUML files (`.puml`, `.plantuml`, `.pu`, `.iuml` and `.wsd`) as
  a preview in the same tab or to the side, and their Git diff as a rendered
  diff with marks on the changed diagrams.
- Renders with the PlantUML engine compiled to JavaScript
  (`@plantuml/core` 1.2026.8): no Java, no Graphviz installation and no
  server; works offline.
- Adds syntax highlighting, code completion and formatting to PlantUML files
  and to the PlantUML blocks of Markdown files, and folding and indentation
  while typing to PlantUML files.
- Renders UML diagrams in the notation of the UML standard, as far as
  PlantUML allows; the setting `nimblescape.plantuml.umlNotation` switches
  to the own notation of PlantUML.
- Includes files of the workspace with `!include`, `!include_many`,
  `!include_once` and `!includesub`, and contains the library C4 of the
  standard library of PlantUML.
- Shows every diagram of a text, errors with the line number of your text,
  and diagrams for light and dark color themes.

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) ·
[MIT License](https://github.com/nimblescape/plantuml-vscode/blob/main/LICENSE).
