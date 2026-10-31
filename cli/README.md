# @nimblescape/plantuml

The renderer of the VS Code extension
[nimblescape PlantUML](https://github.com/nimblescape/nimblescape-plantuml)
for other programs. A program that shows Markdown files on its own pages, for
example [nimblescape Markdown Paper](https://github.com/nimblescape/markdownpaper-vscode)
in its PDF files, shows the ```` ```plantuml ```` blocks with it as the
Markdown preview of VS Code shows them with the extension: the same engine,
the same settings, the same included files and the same layout engine.

## Install

```sh
npm install @nimblescape/plantuml
```

The package needs Node.js 22 or newer and has no dependencies. It contains
the PlantUML engine compiled to JavaScript
([`@plantuml/core`](https://www.npmjs.com/package/@plantuml/core) 1.2026.9),
so it needs no Java, no Graphviz installation and no server.

## Usage

The program renders the Markdown text with markdown-it and the plugin of the
package, and loads the script and the style sheet of the package in the page
that shows the HTML:

```js
const MarkdownIt = require('markdown-it');
const fs = require('node:fs');
const { extendMarkdownIt, readIncludedFiles, readSettings } = require('@nimblescape/plantuml');

const document = '/work/paper/paper.md';
const settings = readSettings('/work/paper');
const md = extendMarkdownIt(
  new MarkdownIt(),
  () => settings,
  (rendering, source) => readIncludedFiles(document, source, ['/work/paper']),
);
const html = md.render(fs.readFileSync(document, 'utf8'));
```

```html
<link rel="stylesheet" href="node_modules/@nimblescape/plantuml/dist/page/markdownPreview.css">
<script type="module" src="node_modules/@nimblescape/plantuml/dist/page/markdownPreview.js"></script>
```

| Export | Effect |
| --- | --- |
| `extendMarkdownIt(md, settings?, includes?)` | Writes each fenced code block with the info string `plantuml` as an element with the diagram text, the settings and the included files. Every other token keeps its output. |
| `readSettings(folder)` | Reads the settings `nimblescape.plantuml.*` from the file `.vscode/settings.json` of a folder, as VS Code reads the settings of a workspace folder: JSON with comments and with commas after the last element. A missing file gives the default settings, and a missing value its default. |
| `settingsOf(values)` | Reads the settings `nimblescape.plantuml.*` from the parsed object of a file `settings.json` of VS Code, or from other values in that form; a missing value gets its default. |
| `parseJsonWithComments(text)` | Parses JSON with comments and with commas after the last element, as VS Code reads its settings files. |
| `readIncludedFiles(document, text, folders?)` | Reads the files that the diagrams of a block include (`!include`, `!includesub` and their forms), relative to the folder of the document, only from that folder and the given folders, also as the target of a symbolic link, up to 1 MB each. |
| `@nimblescape/plantuml/page/markdownPreview.js` | The script of the page: renders the diagrams of each block one at a time into the open shadow root of its element `.nimblescape-plantuml-content`. It loads the engine from the folder `engine/` next to it. |
| `@nimblescape/plantuml/page/markdownPreview.css` | The style sheet of the blocks. |

The script draws a diagram for a dark background only when the body of the
page has the class `vscode-dark`, and uses the layout engine Graphviz only
when the security policy of the page allows WebAssembly; otherwise PlantUML
arranges the diagrams with its own layout engine Smetana, as in the Markdown
preview of VS Code.

The element `.nimblescape-plantuml-content` of each block has the attribute
`data-plantuml-state`: `pending` while the block waits for its diagrams, and
`drawn` when it shows them, or the message of an error in their place. A page
that prints or copies the diagrams waits for `drawn` and copies them out of
the shadow root, because a copy of an element has no shadow root.

## License

MIT. The engine and the library C4 of the standard library of PlantUML keep
their own licenses, which `THIRD-PARTY-NOTICES.md` lists. nimblescape
PlantUML is not a product of the PlantUML project, and the PlantUML project
does not endorse it.
