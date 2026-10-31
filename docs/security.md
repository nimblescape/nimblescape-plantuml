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
  preview, with the engine `@plantuml/core` 1.2026.9 that the package
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
  recently rendered diagrams, with their text, in the storage of the webviews,
  up to 1,000,000 characters together. Warnings go to the log "nimblescape
  PlantUML" in the Output view, which VS Code also writes into its log files.
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

- keep the engine of a preview busy. The engine runs in the page of the
  preview, and the page does not react while the engine works without a
  pause (a class diagram with 400 classes took 1.7 seconds in Chromium on 29
  October 2026). A rendering fails after 60 seconds when the engine pauses
  in that time, and the next diagram of the preview then waits up to 60 more
  seconds for the engine; a rendering without a pause keeps the page busy
  until it ends. A web worker, which runs beside the page and can be
  stopped, cannot run the engine 1.2026.9: the engine builds its pictures
  with the elements of the page (`document`, `window`), which a worker does
  not have (checked in Chromium on 29 October 2026);
- show the text of an included file in a preview, when that file is in a
  workspace folder or in the folder of the document (see
  [Included files](#included-files)).

## Trust boundaries

| Part | Runs as | Trusts |
| --- | --- | --- |
| The extension (`dist/extension.js`) | Your user, in the extension host of VS Code, where the workspace is | VS Code. It reads documents and included files only as text. |
| The Markdown preview with the script `dist/markdownPreview.js` and the engine | The webview of the Markdown preview of VS Code, with the security policy of the Markdown preview | The page that the Markdown extension of VS Code writes |
| A preview of a PlantUML file or a rendered diff, with `dist/pumlPreview.js` and the engine | A webview of the extension, with its own security policy | The messages of the extension. The extension accepts only two messages from the page: `ready`, and `log`, whose text (up to 2,000 characters) goes into the log of the extension. |
| The engine (`dist/engine/`) | The webview of the preview | Nothing: the diagram text and the texts of the included files are data that it renders into SVG |

In a remote window (SSH, WSL, a container), the extension runs where the
workspace is, and the previews show in the VS Code window of your computer.
The text of a diagram and of its included files then goes over the connection
of VS Code, as the text of an open file does.

## Rendering

- **The engine.** The engine is the npm package `@plantuml/core` 1.2026.9:
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
  and the preview shows a message at that line. With `@plantuml/core` 1.2026.9,
  the engine sends no request for an address in `!include`, `!includeurl`,
  `!import`, `!theme … from`, `%load_json`, `sprite` or `<img:…>`: it shows an
  error or a placeholder text, and its SVG picture has no image that names an
  address (checked on 17 October 2026, with the engine in a page of happy-dom
  that recorded each call of `XMLHttpRequest` and `fetch`, and on 29 October
  2026 in Chromium, which recorded each request of the page).
- **Links in a diagram.** The engine writes a link of a diagram (`[[…]]`) as
  a link of the SVG picture. A click on it opens the address the way VS Code
  opens a link of any webview: VS Code opens only web addresses, mail
  addresses and `vscode:` addresses, asks before it opens a website that is
  not one of its trusted domains, and runs no `command:` address, because no
  preview of the extension and not the Markdown preview allow command links.
  A link sends nothing until you click it. In a preview of a PlantUML file, a
  click on a link does not change the size of the diagram.
- **The preview of PlantUML files.** Its page (`src/preview/previewHtml.ts`)
  has the security policy `default-src 'none'`, with the scripts of the
  extension by a nonce, WebAssembly for Graphviz, the styles, fonts and images
  of the extension, inline styles and `data:` images. The policy allows no
  network request, no frame, no worker, no form and no base address
  (`base-uri 'none'`, `form-action 'none'`), and the webview forbids forms
  (`enableForms: false`). The webview can load only the files of `dist/` and
  `media/` of the extension (`localResourceRoots`).
- **The Markdown preview.** VS Code sets the security policy of the Markdown
  preview by its security setting ("Markdown: Change Preview Security
  Settings"). With the default "Strict", it allows the scripts with its nonce,
  the style rules of the document, and images, style sheets and fonts from
  `https:` addresses, and no other network request and no WebAssembly.
  PlantUML then arranges the diagrams with its own layout engine Smetana. With
  "Disable", VS Code sets no security policy, and the extension uses
  Graphviz. The extension does not change this setting. The Markdown
  preview itself shows the images that the Markdown text names, also from the
  internet, as it does without the extension.
- **The pictures.** The engine writes each diagram as an SVG text. The
  preview puts it into a shadow root of the block. The security policy of the
  preview does not let a script in a picture run (see [Known limits](#known-limits)
  for the setting "Disable"). The engine 1.2026.9 escapes the text of a
  diagram and writes no script, no event handler and no `<foreignObject>`
  into a picture, also not for the pragma `svginteractive`; it does not
  render an inline SVG sprite, and it writes a link to a `javascript:`
  address with an empty address (checked on 29 October 2026 in Chromium).

## Included files

The engine cannot read files, so the extension reads the files of `!include`,
`!include_many`, `!include_once` and `!includesub` (`src/includeFiles.ts`) and
sends their text to the preview:

- A path is relative to the folder of the including file, or absolute. The
  extension reads a file only when its path is inside a workspace folder or
  inside the folder of the document. A path outside these folders, a path with
  a variable or a function (`$` or `%`), and an address of the internet show a
  message instead.
- For a file of the disk, the target of its symbolic links must be inside
  these folders too (`fs.realpathSync`). So a symbolic link in a workspace,
  for example `key.iuml` that links to `~/.ssh/id_rsa` or to
  `/proc/self/environ`, shows a message, and the extension does not send the
  text of that file to a preview.
- The Markdown preview receives the texts of the included files of all
  PlantUML blocks of a page as the text of one hidden element after the last
  block, each file once, not as the value of an attribute. The Markdown preview allows the style rules of a document and
  images from `https:` addresses, and a style rule can select an element by
  the start of the value of an attribute and then load an image from an
  address of its own. A Markdown file could so send the value of an attribute
  to the internet, one character after the other. A style rule cannot select
  an element by its text.
- It reads files up to 1 MB. A folder, a larger file and a missing file show a
  message.
- It reads a file of the disk with the file system of Node.js, and a file of
  another file system, for example a version in Git or a file of a virtual
  workspace, through the file system of VS Code. Only the first reading of a
  file for the Markdown preview waits for the file, because the Markdown
  preview renders a document in one step; every other reading runs in the
  background.
- It watches each included file for changes, and forgets a file that no
  diagram included for ten minutes. It does not watch a version of a file in
  Git, which does not change. A file of a virtual workspace reports its
  changes when the extension of its file system watches files.
- It reads nothing for a document that is not saved in a folder.

The npm package `@nimblescape/plantuml` reads the included files for a
program without VS Code (`src/cli/diskIncludes.ts`) with the same rules and
messages: a path relative to the folder of the document, only in that folder
and in the folders that the program names in place of the workspace folders,
also as the target of a symbolic link, up to 1 MB each, and no path with a
variable or a function. It reads the files of the disk at once and watches
nothing. The program decides which folders it names, so it decides how far
the reading reaches.

## Formatting and editing

- **Markdown files at save.** VS Code formats at save only with the default
  formatter of Markdown files, which is often another extension. So the
  extension formats the PlantUML blocks itself before each save of a Markdown
  file (`onWillSaveTextDocument` in `src/formattingProvider.ts`), when these conditions
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
| The SVG pictures of the 50 most recently rendered diagrams, each with the version of the extension, the layout engine, the color theme and the text that the engine rendered, with the texts of the included files, up to 200,000 characters for each diagram and 1,000,000 characters for all of them. The preview scripts of other extensions in the Markdown preview share this storage, so the limit leaves room for them. | The local storage of the webviews (`localStorage`), which VS Code keeps on your computer for each kind of preview | Until newer diagrams replace them. The extension has no command that removes them. |
| Warnings: a failed refresh of the Markdown previews, a preview of a PlantUML file that VS Code cannot restore, with the address of its file, and a problem that the page of such a preview reports, such as a failed load of Graphviz | The log "nimblescape PlantUML" in the Output view, which VS Code also writes into the log folder of the window | As long as VS Code keeps the logs of the window |
| The address of the file of a preview of a PlantUML file, and of the original file of a rendered diff | The state of the webview, which VS Code keeps for a restart | Until the preview closes, also across a restart of VS Code |
| The texts of the included files | The memory of the extension host | Until no diagram included the file for ten minutes, or VS Code closes |
| The setting `nimblescape.plantuml.umlNotation` | The settings of VS Code, when you change it | Until you change it |

The extension writes no file of its own (VS Code writes the log), uses
neither `globalState` nor `workspaceState` of VS Code, stores no secret, and
sends nothing to any address.

## Known limits

- A diagram text can show the text of any file in a workspace folder or in
  the folder of the document, for example `!include ../.git/config` in a
  repository that you cloned. Its text shows in the preview on your computer.
  The style rules of a Markdown file cannot read it (see
  [Included files](#included-files)), but a font of a style rule can still
  tell an address which characters a hidden text contains, not their order.
  The check of a symbolic link applies to the files of the disk; a file of
  another file system, for example of a virtual workspace, has its own
  rules.
- With the security setting "Disable" of the Markdown preview, VS Code sets no
  security policy, so the policy no longer blocks network requests or scripts
  in the Markdown preview. The engine 1.2026.9 sends no request for the
  addresses of a diagram (see [Rendering](#rendering)); that check covers this
  version of the engine only. Set "Disable" only for documents that you trust,
  as the [user guide](guide.md#layout-of-diagrams-in-the-markdown-preview)
  says.
- A diagram text can keep the engine of a preview busy and the preview slow
  (see [The trust model](#the-trust-model)).

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) ·
[MIT License](https://github.com/nimblescape/nimblescape-plantuml/blob/main/LICENSE).
