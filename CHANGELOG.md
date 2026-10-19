# Change log

Each section lists the changes of one released version. The release workflow
takes the section of a version as the notes of its GitHub release.

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
[MIT License](https://github.com/nimblescape/nimblescape-plantuml/blob/main/LICENSE).
