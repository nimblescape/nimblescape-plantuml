# nimblescape PlantUML

Renders [PlantUML](https://plantuml.com) diagrams in VS Code: the PlantUML
blocks of Markdown files and PlantUML files. The extension carries the
PlantUML engine compiled to JavaScript, so it needs no Java, no Graphviz
installation and no server, and it works offline.

> **Status: in development.** This version registers the language PlantUML
> for the files below. The rendering in the Markdown preview, the preview of
> PlantUML files, the highlighting, the code completion and the formatting
> follow. The
> [requirements](https://github.com/nimblescape/nimblescape-plantuml/blob/main/docs/requirements.md)
> list the planned features.

## Files

| Files | Language |
| --- | --- |
| `.puml`, `.plantuml`, `.pu`, `.iuml` and `.wsd` | PlantUML, with the line comment `'` and the block comment `/' '/` |

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
