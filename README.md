# nimblescape PlantUML

Renders [PlantUML](https://plantuml.com) diagrams in VS Code: the PlantUML
blocks of Markdown files and PlantUML files. The extension carries the
PlantUML engine compiled to JavaScript, so it needs no Java, no Graphviz
installation and no server, and it works offline.

> **Status: in development.** This version registers the language PlantUML
> for the files below, renders the ```` ```plantuml ```` blocks of Markdown
> files in the built-in Markdown preview, shows PlantUML files as a preview in
> the same tab, to the side and as a rendered Git diff, and adds syntax
> highlighting, code completion and formatting to PlantUML files and to these
> blocks. The
> [user guide](https://github.com/nimblescape/nimblescape-plantuml/blob/main/docs/guide.md)
> describes every feature and its state, and the
> [requirements](https://github.com/nimblescape/nimblescape-plantuml/blob/main/docs/requirements.md)
> define each feature exactly.

## Files

| Files | Language |
| --- | --- |
| `.puml`, `.plantuml`, `.pu`, `.iuml` and `.wsd` | PlantUML, with the line comment `'` and the block comment `/' '/` |

## Settings

| Setting | Default | Effect |
| --- | --- | --- |
| `nimblescape.plantuml.umlNotation` | `true` | Renders UML diagrams in the notation of the UML standard, as far as PlantUML allows: a keyword such as «interface» above the name of a class instead of a colored circle, the characters `-`, `#`, `~` and `+` for the visibility of attributes and methods, underlined static members, and the UML style of PlantUML for sequence and object diagrams. The value `false` shows the own notation of PlantUML. |

## About PlantUML

nimblescape PlantUML is not a product of the PlantUML project, and the
PlantUML project does not endorse it. It renders with the npm package
[`@plantuml/core`](https://www.npmjs.com/package/@plantuml/core), the
official JavaScript build of PlantUML by Arnaud Roques under the MIT License.
The emoji graphics come from [Twemoji](https://github.com/twitter/twemoji)
(CC BY 4.0). The
[third-party notices](https://github.com/nimblescape/nimblescape-plantuml/blob/main/THIRD-PARTY-NOTICES.md)
list every bundled component and its license.

---

[Change log](https://github.com/nimblescape/nimblescape-plantuml/blob/main/CHANGELOG.md) · [Contributing](https://github.com/nimblescape/nimblescape-plantuml/blob/main/CONTRIBUTING.md) · [Issues](https://github.com/nimblescape/nimblescape-plantuml/issues) · [Source](https://github.com/nimblescape/nimblescape-plantuml)

© 2026 Hannes Stauss (scalarion@nimblescape.com) · [MIT License](https://github.com/nimblescape/nimblescape-plantuml/blob/main/LICENSE).
