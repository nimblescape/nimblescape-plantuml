// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The files that the diagrams of the previews include
 * ([R-GEN-008](../docs/requirements.md#r-gen-008)). The engine of the previews
 * cannot read files, so the extension reads each included file and sends its
 * text with the diagram text to the preview, which puts it into the copy of
 * the text that the engine renders (`src/diagram/includes.ts`).
 *
 * The path of an included file is relative to the folder of the document. As
 * the Markdown preview, which shows only the images of these folders, the
 * extension reads only files in a workspace folder or in the folder of the
 * document, up to 1 MB. For a file of the disk, the target of its symbolic
 * links must be in these folders too, so that a link in a workspace cannot
 * show a file from elsewhere on the computer. The extension reads the saved
 * file, not the text of an open document: the previews show the changes of an
 * included file when the file is saved.
 *
 * For the Markdown preview, the extension reads a file of the disk at once
 * when a diagram includes it first: the Markdown preview renders a document in
 * one step, and renders it again only as a whole, with a new page. Every other
 * reading runs in the background, so that a slow drive does not block the
 * extension host: the files of the previews of PlantUML files, a file that
 * changed, and the files of other file systems, such as the versions of a file
 * in Git and the files of virtual workspaces, which the extension reads
 * through the file system of VS Code. A diagram waits for them. The original
 * side of a diff in Git is a version of the document in Git; the extension
 * reads its included files from the same version.
 *
 * The extension keeps the texts that it read and watches the files. A file of
 * another file system whose address has a query, as the versions of a file in
 * Git have, does not change, so the extension does not watch it. When an
 * included file changes, and when it has read the files that a diagram waits
 * for, it tells the previews to render again (`onDidChange`).
 * It forgets a file that no diagram has included for ten minutes. The
 * Markdown previews and the previews of PlantUML files each have a reader of
 * their own, so that a change of a file renders only the previews of the kind
 * that include it again.
 */

import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { diagramsOf } from './diagram/diagramRanges';
import { expandIncludes, IncludedFile, IncludedFiles, maxDepth, mayInclude } from './diagram/includes';

/** maxFileSize is the size in bytes of the largest file that the extension includes. */
const maxFileSize = 1024 * 1024;

/** idleTime is the time in milliseconds after which the extension forgets a file that no diagram has included. */
const idleTime = 10 * 60_000;

/** changeDelay is the time in milliseconds that the extension waits for further changes before the previews render again. */
const changeDelay = 100;

/** Content is the content of a file that the extension has read: its text, or the problem for a path of the file. */
type Content = { text: string } | { problem: (path: string) => string };

/** Reading is the content of a file that the extension has read, and for a file of the disk, its path after its symbolic links. */
interface Reading {
  content: Content;
  /** real is the path of a file of the disk after its symbolic links, when the file exists. */
  real?: string;
}

/** Entry is a file that the extension has read, with the watcher of the file. */
interface Entry extends Reading {
  watcher?: vscode.Disposable;
}

/**
 * withQueryPath returns the address of an included file whose query names a file, as the addresses of the
 * versions of a file in Git do: the query holds the path of the document, and gets the path of the included file.
 * @param uri - The address of the included file, with the query of the address of the document.
 */
function withQueryPath(uri: vscode.Uri): vscode.Uri {
  let query: unknown;
  try {
    query = JSON.parse(uri.query);
  } catch {
    return uri;
  }
  if (typeof query !== 'object' || query === null || typeof (query as { path?: unknown }).path !== 'string') {
    return uri;
  }
  const path = vscode.Uri.from({ scheme: 'file', path: uri.path }).fsPath;
  return uri.with({ query: JSON.stringify({ ...query, path }) });
}

/**
 * pathKey returns a path for a comparison of paths: in small letters on Windows, whose file system ignores the case of
 * letters.
 * @param path - The path.
 */
const pathKey = (path: string): string => (process.platform === 'win32' ? path.toLowerCase() : path);

/**
 * isInFolder tells whether a file is in a folder. It compares the authority and the path of the addresses, not their
 * scheme, so that a version of a file in Git, whose address has the scheme `git`, is in the folder of the file.
 * @param uri - The address of the file.
 * @param folder - The address of the folder.
 */
export function isInFolder(uri: vscode.Uri, folder: vscode.Uri): boolean {
  return folder.authority === uri.authority && pathKey(`${uri.path}/`).startsWith(pathKey(folder.path.replace(/\/?$/, '/')));
}

/**
 * realFolder returns the address of a folder of the disk after its symbolic links, and every other folder as it is.
 * @param folder - The address of the folder.
 */
function realFolder(folder: vscode.Uri): vscode.Uri {
  if (folder.scheme !== 'file') {
    return folder;
  }
  try {
    return vscode.Uri.file(fs.realpathSync(folder.fsPath));
  } catch {
    return folder;
  }
}

/**
 * isInRealFolders tells whether the target of a file of the disk, after its symbolic links, is in one of some folders.
 * A file whose path has no symbolic link is in the folder of its path, which the extension checked before.
 * @param uri - The address of the file.
 * @param real - The path of the file after its symbolic links.
 * @param folders - The folders.
 */
function isInRealFolders(uri: vscode.Uri, real: string, folders: readonly vscode.Uri[]): boolean {
  if (pathKey(real) === pathKey(uri.fsPath)) {
    return true;
  }
  const target = vscode.Uri.file(real);
  return folders.some((folder) => isInFolder(target, realFolder(folder)));
}

/**
 * resolve returns the address of an included file with the folders that it must be in, or the problem that keeps the
 * extension from reading it.
 * @param document - The address of the document.
 * @param path - The path of the file, relative to the folder of the document or absolute.
 */
function resolve(document: vscode.Uri | undefined, path: string): { uri: vscode.Uri; folders: vscode.Uri[] } | { problem: string } {
  if (!document || document.scheme === 'untitled') {
    return { problem: `The document is not saved in a folder, so the extension cannot find the included file ${path}.` };
  }
  const folder = vscode.Uri.joinPath(document, '..');
  let uri: vscode.Uri;
  try {
    if (/^(?:\/|[A-Za-z]:)/.test(path)) {
      uri = document.scheme === 'file' ? vscode.Uri.file(path) : document.with({ path: path.startsWith('/') ? path : `/${path}` });
    } else {
      uri = vscode.Uri.joinPath(folder, path);
    }
  } catch {
    return { problem: `The extension cannot find the included file ${path}.` };
  }
  uri = withQueryPath(uri.with({ fragment: '' }));
  const folders = [folder, ...(vscode.workspace.workspaceFolders ?? []).map((workspaceFolder) => workspaceFolder.uri)];
  if (!folders.some((root) => isInFolder(uri, root))) {
    return {
      problem: `The file ${path} is outside the workspace folders and the folder of the document. The extension reads included files only from these folders.`,
    };
  }
  return { uri, folders };
}

/**
 * checkStat returns the problem of a path that is a folder or a file larger than the limit, or undefined for a file
 * that the extension includes.
 * @param folder - Whether the path is a folder.
 * @param size - The size of the file in bytes.
 */
function checkStat(folder: boolean, size: number): Content | undefined {
  if (folder) {
    return { problem: (path) => `The included path ${path} is a folder, not a file.` };
  }
  if (size > maxFileSize) {
    return { problem: (path) => `The file ${path} is larger than 1 MB, the largest file that the extension includes.` };
  }
  return undefined;
}

/**
 * readProblem returns the problem of a file that the extension cannot read.
 * @param error - The error of the reading.
 * @param missing - Whether the error tells that the file does not exist.
 */
function readProblem(error: unknown, missing: boolean): Content {
  if (missing) {
    return { problem: (path) => `The file ${path} does not exist.` };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { problem: (path) => `The extension cannot read the file ${path}: ${message}` };
}

/**
 * readDiskFile reads a file of the disk at once, through its symbolic links.
 * @param uri - The address of the file.
 */
function readDiskFile(uri: vscode.Uri): Reading {
  try {
    const real = fs.realpathSync(uri.fsPath);
    const stat = fs.statSync(real);
    return { content: checkStat(stat.isDirectory(), stat.size) ?? { text: fs.readFileSync(real, 'utf8') }, real };
  } catch (error) {
    return diskProblem(error);
  }
}

/**
 * readDiskFileLater reads a file of the disk through its symbolic links, without blocking the extension host.
 * @param uri - The address of the file.
 */
async function readDiskFileLater(uri: vscode.Uri): Promise<Reading> {
  try {
    const real = await fs.promises.realpath(uri.fsPath);
    const stat = await fs.promises.stat(real);
    return { content: checkStat(stat.isDirectory(), stat.size) ?? { text: await fs.promises.readFile(real, 'utf8') }, real };
  } catch (error) {
    return diskProblem(error);
  }
}

/**
 * diskProblem returns the reading of a file of the disk that the extension cannot read.
 * @param error - The error of the reading.
 */
function diskProblem(error: unknown): Reading {
  const code = (error as { code?: unknown } | undefined)?.code;
  return { content: readProblem(error, code === 'ENOENT' || code === 'ENOTDIR') };
}

/**
 * readContent reads a file of another file system through the file system of VS Code.
 * @param uri - The address of the file.
 */
async function readContent(uri: vscode.Uri): Promise<Content> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    return (
      checkStat((stat.type & vscode.FileType.Directory) !== 0, stat.size) ?? {
        text: new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)),
      }
    );
  } catch (error) {
    return readProblem(error, (error as { code?: unknown } | undefined)?.code === 'FileNotFound');
  }
}

/**
 * readLater reads a file without blocking the extension host: a file of the disk through its symbolic links, and
 * another file through the file system of VS Code.
 * @param uri - The address of the file.
 */
const readLater = async (uri: vscode.Uri): Promise<Reading> =>
  uri.scheme === 'file' ? readDiskFileLater(uri) : { content: await readContent(uri) };

/**
 * sameContent tells whether two contents of a file are equal.
 * @param first - The one content.
 * @param second - The other content.
 */
const sameContent = (first: Content, second: Content): boolean =>
  'text' in first || 'text' in second
    ? 'text' in first && 'text' in second && first.text === second.text
    : first.problem('') === second.problem('');

/** IncludeFiles reads, keeps and watches the files that the diagrams of the previews include. */
export class IncludeFiles implements vscode.Disposable {
  /** #entries holds the files that the extension has read, by their address. */
  readonly #entries = new Map<string, Entry>();
  /** #reading holds the reading of each file that the extension reads now, by its address. */
  readonly #reading = new Map<string, Promise<void>>();
  /** #used holds for the address of each included file the time when a diagram included it last. */
  readonly #used = new Map<string, number>();
  readonly #changed = new vscode.EventEmitter<void>();
  readonly #diskAtOnce: boolean;
  #timer: ReturnType<typeof setTimeout> | undefined;

  /**
   * @param options - diskAtOnce: reads a file of the disk at once when a diagram includes it first, as the Markdown
   *   preview needs; without it, the reader reads every file in the background, and `load` waits for it.
   */
  constructor({ diskAtOnce = true }: { diskAtOnce?: boolean } = {}) {
    this.#diskAtOnce = diskAtOnce;
  }

  /** onDidChange fires when an included file changes, and when the extension has read files that a diagram waits for. */
  readonly onDidChange = this.#changed.event;

  /** dispose stops the watchers and the events. */
  dispose(): void {
    clearTimeout(this.#timer);
    this.#entries.forEach((entry) => entry.watcher?.dispose());
    this.#entries.clear();
    this.#changed.dispose();
  }

  /**
   * filesOf returns the files that the diagrams of a text include, as far as the extension has read them, and starts
   * to read the other ones; `onDidChange` fires when it has read them. It returns undefined for a text whose diagrams
   * include no file.
   * @param document - The address of the document of the text, or undefined for a text without a document.
   * @param text - The text.
   */
  filesOf(document: vscode.Uri | undefined, text: string): IncludedFiles | undefined {
    return this.#collect(document, text)?.files;
  }

  /**
   * load returns the files that the diagrams of a text include, after the extension has read them all. It returns
   * them without a promise when it has read them already.
   * @param document - The address of the document of the text.
   * @param text - The text.
   */
  load(document: vscode.Uri | undefined, text: string): IncludedFiles | undefined | Promise<IncludedFiles | undefined> {
    const collected = this.#collect(document, text);
    return collected && collected.readings.length > 0 ? this.#loadAll(document, text, collected.readings) : collected?.files;
  }

  /**
   * #loadAll waits for the readings of files, and reads the files that they include, until the extension has read
   * every file that the diagrams of a text include.
   * @param document - The address of the document of the text.
   * @param text - The text.
   * @param readings - The readings of the files that the extension reads now.
   */
  async #loadAll(document: vscode.Uri | undefined, text: string, readings: Promise<void>[]): Promise<IncludedFiles | undefined> {
    // Each round reads the files that the files of the round before include, so the chain of files limits the rounds.
    for (let round = 0; ; round++) {
      await Promise.all(readings);
      const collected = this.#collect(document, text);
      if (!collected || collected.readings.length === 0 || round > maxDepth) {
        return collected?.files;
      }
      readings = collected.readings;
    }
  }

  /**
   * #collect returns the files that the diagrams of a text include, as far as the extension has read them, and the
   * readings of the other ones, which it starts. It returns undefined for a text whose diagrams include no file.
   * @param document - The address of the document of the text.
   * @param text - The text.
   */
  #collect(document: vscode.Uri | undefined, text: string): { files: IncludedFiles; readings: Promise<void>[] } | undefined {
    if (!mayInclude(text)) {
      return undefined;
    }
    const files = new Map<string, IncludedFile>();
    const readings: Promise<void>[] = [];
    let includes = false;
    // The previews expand each diagram of the text with these files, in the same way.
    for (const diagram of diagramsOf(text)) {
      expandIncludes(diagram.text, (path) => {
        includes = true;
        const file = this.#file(document, path, readings);
        if (file) {
          files.set(path, file);
        }
        return file;
      });
    }
    this.#forgetUnused();
    return includes ? { files: Object.fromEntries(files), readings } : undefined;
  }

  /**
   * #file returns an included file. For the Markdown preview, it reads a file of the disk at once; for another file
   * that it has not read yet, it starts to read it and returns undefined.
   * @param document - The address of the document.
   * @param path - The path of the file.
   * @param readings - Receives the reading of a file that the extension starts.
   */
  #file(document: vscode.Uri | undefined, path: string, readings: Promise<void>[]): IncludedFile | undefined {
    const target = resolve(document, path);
    if ('problem' in target) {
      return target;
    }
    const key = target.uri.toString();
    this.#used.set(key, Date.now());
    let entry = this.#entries.get(key);
    if (!entry && target.uri.scheme === 'file' && this.#diskAtOnce) {
      entry = { ...readDiskFile(target.uri), watcher: this.#watch(target.uri, key) };
      this.#entries.set(key, entry);
    }
    if (!entry) {
      readings.push(this.#read(target.uri, key));
      return undefined;
    }
    if (entry.real !== undefined && !isInRealFolders(target.uri, entry.real, target.folders)) {
      return {
        problem: `The file ${path} is a symbolic link to a file outside the workspace folders and the folder of the document. The extension reads included files only from these folders.`,
      };
    }
    return 'text' in entry.content ? entry.content : { problem: entry.content.problem(path) };
  }

  /**
   * #read reads a file in the background, keeps its content, watches the file, and tells the previews. A file whose
   * address has a query, as the versions of a file in Git have, does not change; the extension does not watch it,
   * and keeps its content until it forgets the file.
   * @param uri - The address of the file.
   * @param key - The address as text.
   */
  #read(uri: vscode.Uri, key: string): Promise<void> {
    let reading = this.#reading.get(key);
    if (!reading) {
      reading = readLater(uri).then((read) => {
        this.#reading.delete(key);
        this.#entries.set(key, { ...read, watcher: uri.query === '' ? this.#watch(uri, key) : undefined });
        this.#fire();
      });
      this.#reading.set(key, reading);
    }
    return reading;
  }

  /**
   * #watch watches a file, also before it exists, and reads it again when it changes. A file of another file system
   * than the disk reports its changes when its file system can watch files.
   * @param uri - The address of the file.
   * @param key - The address as text.
   */
  #watch(uri: vscode.Uri, key: string): vscode.Disposable {
    // The name is a pattern, in which a character with a meaning in patterns stands for itself in brackets.
    const name = uri.path.slice(uri.path.lastIndexOf('/') + 1).replace(/[*?[\]{}]/g, '[$&]');
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.joinPath(uri, '..'), name));
    const reload = async () => {
      const reading = await readLater(uri);
      const entry = this.#entries.get(key);
      if (!entry) {
        return;
      }
      const changed = !sameContent(entry.content, reading.content) || entry.real !== reading.real;
      entry.content = reading.content;
      entry.real = reading.real;
      if (changed) {
        this.#fire();
      }
    };
    watcher.onDidCreate(reload);
    watcher.onDidChange(reload);
    watcher.onDidDelete(reload);
    return watcher;
  }

  /** #fire fires `onDidChange` once after a series of changes. */
  #fire(): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#changed.fire(), changeDelay);
  }

  /** #forgetUnused forgets the files that no diagram has included for some time. */
  #forgetUnused(): void {
    const limit = Date.now() - idleTime;
    for (const [key, used] of this.#used) {
      if (used < limit) {
        this.#used.delete(key);
        this.#entries.get(key)?.watcher?.dispose();
        this.#entries.delete(key);
      }
    }
  }
}
