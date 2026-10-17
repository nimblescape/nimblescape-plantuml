<!--
SPDX-License-Identifier: MIT
© 2026 Hannes Stauss (scalarion@nimblescape.com)
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Security model

This document describes what nimblescape PlantUML does on your computer, what
it protects, how, and where its protection ends. The user guide is
[guide.md](guide.md); how the parts work together is in
[CONTRIBUTING.md](../CONTRIBUTING.md). Report a security problem by e-mail, as
[SUPPORT.md](../SUPPORT.md#security-problems) describes, not in a public issue.

## What the extension does on your computer

The README and the Marketplace page list these behaviors at the top. Each item
links to its details.

- **When it works.** The extension activates when a Markdown file opens
  (`onLanguage:markdown`), when a PlantUML file opens (`onLanguage:plantuml`,
  which VS Code adds for the language of the extension), and when VS Code
  restores a preview to the side or a rendered diff of a PlantUML file after a
  restart (`onWebviewPanel:…`). The manifest has no `browser` entry, so the
  extension does not run in VS Code for the Web. See
  [Trust boundaries](#trust-boundaries).
- **Rendering.** The diagrams render on your computer, in the webview of the
  preview, with the engine `@plantuml/core` 1.2026.8 that the package
  contains. The extension uses no PlantUML server, starts no Java and no other
  program, and sends no diagram text and no file to the internet. No setting
  changes this. The security setting of the Markdown preview only selects the
  layout engine. See [Rendering](#rendering).
- **Markdown preview.** The extension adds a markdown-it plugin, a script and
  a style sheet to the built-in Markdown preview of VS Code
  (`markdown.markdownItPlugins`, `markdown.previewScripts`,
  `markdown.previewStyles`). The plugin changes only the fenced code blocks
  with the language `plantuml`. See [Rendering](#rendering).
- **Markdown files.** While `editor.formatOnSave` is on, each save of a
  Markdown file formats the lines of its PlantUML blocks, also when another
  extension formats Markdown files. In a PlantUML block, the code completion
  opens while you type. See [Formatting and editing](#formatting-and-editing).
- **PlantUML files.** The extension is the default formatter of PlantUML
  files, and it takes the keys Ctrl+Shift+V and Ctrl+K V in PlantUML files and
  in its previews. See [Formatting and editing](#formatting-and-editing).
- **Files and data.** The extension reads the files that a diagram includes,
  only in the workspace folders and in the folder of the document, up to 1 MB
  each, and watches them. It writes no file, except the formatting of the file
  that you format or save. The previews keep the pictures of the 50 most
  recently rendered diagrams, with their text, in the storage of the webviews.
  See [Included files](#included-files) and [Stored data](#stored-data).
- **Network.** The extension connects to no address and collects no
  telemetry. See [Rendering](#rendering).
- **Restricted Mode and virtual workspaces.** The extension works with all
  features in both. See
  [Workspace trust and virtual workspaces](#workspace-trust-and-virtual-workspaces).

## The trust model

**A diagram text is data, not a program that runs on your computer.** The
extension reads the text of Markdown files, of PlantUML files and of the files
that they include, and gives it to the engine in the webview of a preview. The
engine runs the preprocessor of PlantUML (variables, functions, loops) inside
that webview. A diagram text cannot start a program, read a file or connect to
an address through the extension.

A diagram text from a stranger can still:

- keep the engine of a preview busy: a rendering fails after 60 seconds, and
  the next diagram of the preview then waits up to 60 more seconds for the
  engine;
- show the text of an included file in a preview, when that file is in a
  workspace folder or in the folder of the document (see
  [Included files](#included-files)).

## Trust boundaries

| Part | Runs as | Trusts |
| --- | --- | --- |
| The extension (`dist/extension.js`) | Your user, in the extension host of VS Code, where the workspace is | VS Code. It reads documents and included files only as text. |
| The Markdown preview with the script `dist/markdownPreview.js` and the engine | The webview of the Markdown preview of VS Code, with the security policy of the Markdown preview | The page that the Markdown extension of VS Code writes |
| A preview of a PlantUML file or a rendered diff, with `dist/pumlPreview.js` and the engine | A webview of the extension, with its own security policy | The messages of the extension |
| The engine (`dist/engine/`) | The webview of the preview | Nothing: the diagram text and the texts of the included files are data that it renders into SVG |

In a remote window (SSH, WSL, a container), the extension runs where the
workspace is, and the previews show in the VS Code window of your computer.
The text of a diagram and of its included files then goes over the connection
of VS Code, as the text of an open file does.

## Rendering

- **The engine.** The engine is the npm package `@plantuml/core` 1.2026.8:
  PlantUML compiled to JavaScript with TeaVM, with Viz.js (Graphviz compiled
  to WebAssembly). The build copies its scripts into `dist/engine/` of the
  package. A preview loads the engine from the folder of the extension
  (`src/preview/renderer.ts`, function `engineLoader`). It loads the further
  scripts of the engine (`themes.js`, `emoji.js`, `openiconic.js`) and the
  library C4 (`c4.min.js`) only from that folder. For another library of the
  standard library of PlantUML, for example `!include <awslib/…>`, the loader
  loads nothing and the preview shows a message.
- **No server, no Java.** The extension sends no diagram text to a PlantUML
  server and starts no program. The extension host part has no network code;
  it reads files and sends their text to the previews.
- **Addresses in a diagram.** The extension does not read an include line
  with an address, for example `!include https://…` or `!includeurl https://…`,
  and the preview shows a message at that line. With `@plantuml/core` 1.2026.8,
  the engine sends no request for an address in `!include`, `!includeurl`,
  `!import`, `!theme … from`, `%load_json`, `sprite` or `<img:…>`: it shows an
  error or a placeholder text, and its SVG picture has no link and no image
  that names an address (checked on 17 October 2026, with the engine in a page
  of happy-dom that recorded each call of `XMLHttpRequest` and `fetch`).
- **The preview of PlantUML files.** Its page (`src/preview/previewHtml.ts`)
  has the security policy `default-src 'none'`, with the scripts of the
  extension by a nonce, WebAssembly for Graphviz, the styles, fonts and images
  of the extension, inline styles and `data:` images. The policy allows no
  network request, no frame and no worker. The webview can load only the files
  of `dist/` and `media/` of the extension (`localResourceRoots`).
- **The Markdown preview.** VS Code sets the security policy of the Markdown
  preview by its security setting ("Markdown: Change Preview Security
  Settings"). With the default "Strict", it allows the scripts with its nonce
  and images from `https:` addresses, and no network request and no
  WebAssembly. PlantUML then arranges the diagrams with its own layout engine
  Smetana. With "Disable", VS Code sets no security policy, and the extension
  uses Graphviz. The extension does not change this setting. The Markdown
  preview itself shows the images that the Markdown text names, also from the
  internet, as it does without the extension.
- **The pictures.** The engine writes each diagram as an SVG text. The
  preview puts it into a shadow root of the block. The security policy of the
  preview does not let a script in a picture run (see [Known limits](#known-limits)
  for the setting "Disable").

## Included files

The engine cannot read files, so the extension reads the files of `!include`,
`!include_many`, `!include_once` and `!includesub` (`src/includeFiles.ts`) and
sends their text to the preview:

- A path is relative to the folder of the including file, or absolute. The
  extension reads a file only when its path is inside a workspace folder or
  inside the folder of the document. A path outside these folders, a path with
  a variable or a function (`$` or `%`), and an address of the internet show a
  message instead.
- It reads files up to 1 MB. A folder, a larger file and a missing file show a
  message.
- It reads a file of the disk with the file system of Node.js, and a file of
  another file system, for example a version in Git or a file of a virtual
  workspace, through the file system of VS Code.
- It watches each included file of the disk for changes, and forgets a file
  that no diagram included for ten minutes.
- It reads nothing for a document that is not saved in a folder.

## Formatting and editing

- **Markdown files at save.** VS Code formats at save only with the default
  formatter of Markdown files, which is often another extension. So the
  extension formats the PlantUML blocks itself before each save of a Markdown
  file (`onWillSaveTextDocument` in `src/extension.ts`), when these conditions
  hold: `editor.formatOnSave` is on for the file, `editor.formatOnSaveMode` is
  `file` (the default), and the save is not an automatic save after a delay.
  The edits change the indentation and the spaces of the lines of the
  PlantUML blocks only; each line keeps its prefix, for example the
  indentation of a list item or the marker of a block quote.
- **Formatter of Markdown files.** The extension also registers a formatter
  for Markdown files, which formats the PlantUML blocks only. When another
  extension also formats Markdown files and no default formatter of Markdown
  files is set, VS Code shows the message "There are multiple formatters for
  'Markdown' files" at "Format Document".
- **Formatter of PlantUML files.** The manifest sets
  `"[plantuml]": { "editor.defaultFormatter": "nimblescape.nimblescape-plantuml" }`
  (`configurationDefaults`). A default of an extension for a language wins
  over an `editor.defaultFormatter` that you set for all files, but not over a
  formatter that you set for `[plantuml]`.
- **Code completion while typing.** VS Code turns off the proposals while
  typing for Markdown files. When you type a letter at the end of a word in a
  PlantUML block, and `editor.quickSuggestions` is on for the language
  `plantuml`, the extension runs the command `editor.action.triggerSuggest`.
  Outside the PlantUML blocks, it does nothing.
- **Keys.** Ctrl+Shift+V (PlantUML: Toggle Preview) and Ctrl+K V (PlantUML:
  Open Preview to the Side), Cmd on macOS, work in PlantUML files, in their
  diffs and in the previews of the extension. In Markdown files, the keys stay
  with the Markdown preview of VS Code.

## Workspace trust and virtual workspaces

The manifest declares `untrustedWorkspaces` and `virtualWorkspaces` as
supported. In Restricted Mode and in a virtual workspace, the extension
activates with all features, because it only reads the files of the workspace
and runs no program of the workspace. The only setting of the extension,
`nimblescape.plantuml.umlNotation`, can come from the settings of a workspace;
it only changes the notation of the diagrams. The settings of VS Code that
control the formatting at save (`editor.formatOnSave`,
`editor.formatOnSaveMode`, `editor.tabSize`, `editor.insertSpaces`) can also
come from the settings of a workspace (`.vscode/settings.json`).

In a virtual workspace, the extension reads the included files through the
file system of VS Code. The provider of that file system, for example the
extension of a remote repository, may download a file to read it.

## Stored data

| Data | Where | How long |
| --- | --- | --- |
| The SVG pictures of the 50 most recently rendered diagrams, each with the version of the extension, the layout engine, the color theme and the text that the engine rendered, with the texts of the included files | The local storage of the webviews (`localStorage`), which VS Code keeps on your computer for each kind of preview | Until 50 newer diagrams replace them. The extension has no command that removes them. |
| The address of the file of a preview of a PlantUML file, and of the original file of a rendered diff | The state of the webview, which VS Code keeps for a restart | Until the preview closes, also across a restart of VS Code |
| The texts of the included files | The memory of the extension host | Until no diagram included the file for ten minutes, or VS Code closes |
| The setting `nimblescape.plantuml.umlNotation` | The settings of VS Code, when you change it | Until you change it |

The extension writes no file, uses neither `globalState` nor `workspaceState`
of VS Code, stores no secret, and sends nothing to any address.

## Known limits

- The check of the folders compares the path of an included file, not the
  target of a symbolic link: a symbolic link inside a workspace folder can
  link to a file outside it, and the extension then reads that file. Its text
  shows only in the preview on your computer.
- With the security setting "Disable" of the Markdown preview, VS Code sets no
  security policy, so the policy no longer blocks network requests or scripts
  in the Markdown preview. The engine 1.2026.8 sends no request for the
  addresses of a diagram (see [Rendering](#rendering)); that check covers this
  version of the engine only. Set "Disable" only for documents that you trust,
  as the [user guide](guide.md#layout-of-diagrams-in-the-markdown-preview)
  says.
- A diagram text can keep the engine of a preview busy and the preview slow
  (see [The trust model](#the-trust-model)).

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) ·
[MIT License](https://github.com/nimblescape/nimblescape-plantuml/blob/main/LICENSE).
