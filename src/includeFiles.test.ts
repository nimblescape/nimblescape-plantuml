// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the reading of the included files of the previews (R-GEN-008) with a fake of the API of VS Code
 * and of the file system: the files of the disk, which the extension reads at once, the files of other file systems,
 * for which a diagram waits, the paths relative to the document and to an included file, the versions of Git, the
 * folders that the extension reads from, also through symbolic links, the problems of a file, the event after a
 * reading and after a change of an included file, and the end of the watchers.
 */

import * as posix from 'node:path/posix';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

/** FakeUri stands for a vscode.Uri. */
class FakeUri {
  constructor(
    readonly scheme: string,
    readonly authority: string,
    readonly path: string,
    readonly query = '',
    readonly fragment = '',
  ) {}

  static parse(text: string): FakeUri {
    const match = /^([\w-]+):(?:\/\/([^/?]*))?([^?]*)(?:\?(.*))?$/.exec(text)!;
    return new FakeUri(match[1], match[2] ?? '', match[3], match[4] ?? '');
  }

  static file(path: string): FakeUri {
    return new FakeUri('file', '', path.startsWith('/') ? path : `/${path}`);
  }

  static from(parts: { scheme: string; authority?: string; path: string }): FakeUri {
    return new FakeUri(parts.scheme, parts.authority ?? '', parts.path);
  }

  static joinPath(base: FakeUri, ...parts: string[]): FakeUri {
    return base.with({ path: posix.join(base.path, ...parts) });
  }

  get fsPath(): string {
    return this.path;
  }

  with(change: Partial<Pick<FakeUri, 'path' | 'query' | 'fragment'>>): FakeUri {
    return new FakeUri(this.scheme, this.authority, change.path ?? this.path, change.query ?? this.query, change.fragment ?? this.fragment);
  }

  toString(): string {
    return `${this.scheme}://${this.authority}${this.path}${this.query ? `?${this.query}` : ''}`;
  }
}

/** FakeEventEmitter stands for a vscode.EventEmitter. */
class FakeEventEmitter {
  readonly listeners: (() => void)[] = [];
  readonly event = (listener: () => void) => {
    this.listeners.push(listener);
    return { dispose: () => this.listeners.splice(this.listeners.indexOf(listener), 1) };
  };

  fire(): void {
    this.listeners.forEach((listener) => listener());
  }

  dispose(): void {}
}

/** FakeWatcher stands for a vscode.FileSystemWatcher; the tests send its events. */
class FakeWatcher {
  readonly listeners: (() => void)[] = [];
  disposed = false;

  constructor(readonly pattern: { base: FakeUri; pattern: string }) {
    watchers.push(this);
  }

  readonly onDidCreate = (listener: () => void) => this.listeners.push(listener);
  readonly onDidChange = this.onDidCreate;
  readonly onDidDelete = this.onDidCreate;

  /** changed sends the event of a change of the file. */
  changed(): void {
    this.listeners.forEach((listener) => listener());
  }

  dispose(): void {
    this.disposed = true;
  }
}

/** files holds the files of the fake file systems by their address: a text, `folder`, or `locked` for a file without the right to read it. */
let files: Map<string, string>;
/** links holds the symbolic links of the disk: the path of each link and the path of its target. */
let links: Map<string, string>;
/** reads records the addresses of the files that the extension read. */
let reads: string[];
/** workspaceFolders are the workspace folders of the fake. */
let workspaceFolders: { uri: FakeUri }[] | undefined;
/** watchers are the watchers that the extension created. */
let watchers: FakeWatcher[];

/** locked is the message of the error of the reading of a file without the right to read it. */
const locked = 'EACCES: permission denied';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  files = new Map();
  links = new Map();
  reads = [];
  workspaceFolders = [{ uri: FakeUri.file('/work') }];
  watchers = [];
  const fileNotFound = () => Object.assign(new Error('not found'), { code: 'FileNotFound' });
  // The file system of the disk: the path of a file of the disk is the path of its address.
  // A path whose start is a link continues in the target of the link.
  const realpathSync = (path: string) => {
    for (const [link, target] of links) {
      if (path === link || path.startsWith(`${link}/`)) {
        return target + path.slice(link.length);
      }
    }
    return path;
  };
  const statSync = (path: string) => {
    const file = files.get(`file://${path}`);
    if (file === undefined) {
      throw Object.assign(new Error(`ENOENT: no such file or directory, stat '${path}'`), { code: 'ENOENT' });
    }
    return { isDirectory: () => file === 'folder', size: new TextEncoder().encode(file).length };
  };
  const readFileSync = (path: string) => {
    reads.push(`file://${path}`);
    const file = files.get(`file://${path}`);
    if (file === 'locked') {
      throw Object.assign(new Error(locked), { code: 'EACCES' });
    }
    return file;
  };
  vi.doMock('node:fs', () => ({
    realpathSync,
    statSync,
    readFileSync,
    promises: {
      realpath: async (path: string) => realpathSync(path),
      stat: async (path: string) => statSync(path),
      readFile: async (path: string) => readFileSync(path),
    },
  }));
  vi.doMock('vscode', () => ({
    Uri: FakeUri,
    EventEmitter: FakeEventEmitter,
    RelativePattern: class {
      constructor(
        readonly base: FakeUri,
        readonly pattern: string,
      ) {}
    },
    FileType: { File: 1, Directory: 2 },
    workspace: {
      get workspaceFolders() {
        return workspaceFolders;
      },
      fs: {
        stat: async (uri: FakeUri) => {
          const file = files.get(uri.toString());
          if (file === undefined) {
            throw fileNotFound();
          }
          return file === 'folder' ? { type: 2, size: 0 } : { type: 1, size: new TextEncoder().encode(file).length };
        },
        readFile: async (uri: FakeUri) => {
          reads.push(uri.toString());
          const file = files.get(uri.toString());
          if (file === undefined || file === 'folder') {
            throw fileNotFound();
          }
          return new TextEncoder().encode(file);
        },
      },
      createFileSystemWatcher: (pattern: { base: FakeUri; pattern: string }) => new FakeWatcher(pattern),
    },
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * includeFiles imports the module with the fakes and returns a new reader.
 * @param diskAtOnce - Whether the reader reads a file of the disk at once, as for the Markdown preview.
 */
async function includeFiles(diskAtOnce = true) {
  const { IncludeFiles } = await import('./includeFiles');
  const includes = new IncludeFiles({ diskAtOnce });
  let changes = 0;
  includes.onDidChange(() => changes++);
  return { includes, changes: () => changes };
}

/** document is the address of the document of the tests. */
const document = FakeUri.file('/work/docs/design.md') as never;

/** settle runs the timers and the promises, so that the readings end and the event fires. */
const settle = () => vi.advanceTimersByTimeAsync(1_000);

test('returns nothing for a text that includes no file', async () => {
  const { includes } = await includeFiles();
  expect(includes.filesOf(document, '@startuml\nA -> B\n@enduml')).toBeUndefined();
  expect(includes.filesOf(document, '!include <C4/C4_Container>\nPerson(a, "A")')).toBeUndefined();
  expect(reads).toEqual([]);
});

test('reads a file of the disk at once, and returns it from then on without reading it again', async () => {
  files.set('file:///work/docs/styles.puml', 'skinparam a 1');
  files.set('file:///work/docs/lib/a.puml', '!include ../../shared/b.puml');
  files.set('file:///work/shared/b.puml', 'B');
  const { includes, changes } = await includeFiles();
  const text = '@startuml\n!include styles.puml\nA -> B\n@enduml\n@startuml\n!include lib/a.puml\n@enduml';
  const included = {
    'styles.puml': { text: 'skinparam a 1' },
    // The path of a file that an included file includes is relative to the included file.
    'lib/a.puml': { text: '!include ../../shared/b.puml' },
    '../shared/b.puml': { text: 'B' },
  };
  expect(includes.filesOf(document, text)).toEqual(included);
  expect(includes.load(document, text)).toEqual(included);
  await settle();
  expect(changes()).toBe(0);
  expect(reads).toEqual(['file:///work/docs/styles.puml', 'file:///work/docs/lib/a.puml', 'file:///work/shared/b.puml']);
});

test('reads a file of the disk in the background for the previews of PlantUML files, which wait for it', async () => {
  files.set('file:///work/docs/styles.puml', 'skinparam a 1');
  files.set('file:///work/docs/key.iuml', 'secret');
  links.set('/work/docs/key.iuml', '/home/user/.ssh/id_rsa');
  files.set('file:///home/user/.ssh/id_rsa', 'secret');
  const { includes, changes } = await includeFiles(false);
  const text = '@startuml\n!include styles.puml\n!include key.iuml\n@enduml';
  const loading = includes.load(document, text);
  expect(loading).toBeInstanceOf(Promise);
  expect(reads).toEqual([]);
  await settle();
  const problem = 'The file key.iuml is a symbolic link to a file outside the workspace folders and the folder of the document. The extension reads included files only from these folders.';
  expect(await loading).toEqual({ 'styles.puml': { text: 'skinparam a 1' }, 'key.iuml': { problem } });
  expect(changes()).toBe(1);
  // From then on, the reader returns the files without a promise, and watches them.
  expect(includes.load(document, text)).toEqual(await loading);
  expect(watchers.map((watcher) => watcher.pattern.pattern)).toEqual(['styles.puml', 'key.iuml']);
});

test('reads a file of another file system later, tells the previews, and returns it from then on', async () => {
  const virtual = (path: string) => new FakeUri('vscode-vfs', 'github', path);
  files.set(virtual('/repo/docs/styles.puml').toString(), 'skinparam a 1');
  const { includes, changes } = await includeFiles();
  const text = '@startuml\n!include styles.puml\nA -> B\n@enduml';
  expect(includes.filesOf(virtual('/repo/docs/design.md') as never, text)).toEqual({});
  expect(changes()).toBe(0);
  await settle();
  expect(changes()).toBe(1);
  expect(includes.filesOf(virtual('/repo/docs/design.md') as never, text)).toEqual({ 'styles.puml': { text: 'skinparam a 1' } });
  expect(reads).toEqual(['vscode-vfs://github/repo/docs/styles.puml']);
});

test('loads the files of another file system that the included files include, and returns read files without a promise', async () => {
  const virtual = (path: string) => new FakeUri('vscode-vfs', 'github', path);
  workspaceFolders = [{ uri: virtual('/repo') }];
  files.set(virtual('/repo/docs/lib/a.puml').toString(), '!include ../../shared/b.puml');
  files.set(virtual('/repo/shared/b.puml').toString(), 'B');
  const { includes } = await includeFiles();
  const text = '!include lib/a.puml';
  const loading = includes.load(virtual('/repo/docs/design.md') as never, text);
  expect(loading).toBeInstanceOf(Promise);
  await settle();
  expect(await loading).toEqual({ 'lib/a.puml': { text: '!include ../../shared/b.puml' }, '../shared/b.puml': { text: 'B' } });
  expect(includes.load(virtual('/repo/docs/design.md') as never, text)).toEqual(await loading);
  // The files of a virtual workspace can change, so the extension watches them too.
  expect(watchers.map((watcher) => [watcher.pattern.base.toString(), watcher.pattern.pattern])).toEqual([
    ['vscode-vfs://github/repo/docs/lib', 'a.puml'],
    ['vscode-vfs://github/repo/shared', 'b.puml'],
  ]);
});

test('reads a watched file of a virtual workspace again when it changes, and tells the previews', async () => {
  const virtual = (path: string) => new FakeUri('vscode-vfs', 'github', path);
  workspaceFolders = [{ uri: virtual('/repo') }];
  files.set(virtual('/repo/docs/styles.puml').toString(), 'old');
  const { includes, changes } = await includeFiles();
  const text = '!include styles.puml';
  expect(await includes.load(virtual('/repo/docs/design.md') as never, text)).toEqual({ 'styles.puml': { text: 'old' } });
  await settle();
  expect(changes()).toBe(1);
  files.set(virtual('/repo/docs/styles.puml').toString(), 'new');
  watchers[0].changed();
  await settle();
  expect(changes()).toBe(2);
  expect(includes.filesOf(virtual('/repo/docs/design.md') as never, text)).toEqual({ 'styles.puml': { text: 'new' } });
});

test('names the problem of a file that does not exist, of a folder, of a large file, of a file that it cannot read and of a file outside the folders', async () => {
  files.set('file:///work/docs/folder', 'folder');
  files.set('file:///work/docs/large.puml', 'x'.repeat(1024 * 1024 + 1));
  files.set('file:///work/docs/locked.puml', 'locked');
  files.set('file:///elsewhere/secret.puml', 'secret');
  const { includes } = await includeFiles();
  const text = [
    '!include missing.puml',
    '!include folder',
    '!include large.puml',
    '!include locked.puml',
    '!include /elsewhere/secret.puml',
    '!include ../../outside.puml',
  ].join('\n');
  expect(includes.load(document, text)).toEqual({
    'missing.puml': { problem: 'The file missing.puml does not exist.' },
    folder: { problem: 'The included path folder is a folder, not a file.' },
    'large.puml': { problem: 'The file large.puml is larger than 1 MB, the largest file that the extension includes.' },
    'locked.puml': { problem: `The extension cannot read the file locked.puml: ${locked}` },
    '/elsewhere/secret.puml': {
      problem:
        'The file /elsewhere/secret.puml is outside the workspace folders and the folder of the document. The extension reads included files only from these folders.',
    },
    '../../outside.puml': {
      problem:
        'The file ../../outside.puml is outside the workspace folders and the folder of the document. The extension reads included files only from these folders.',
    },
  });
  expect(reads).toEqual(['file:///work/docs/locked.puml']);
});

test('reads no file whose symbolic links lead outside the workspace folders and the folder of the document', async () => {
  files.set('file:///home/user/.ssh/id_rsa', 'secret');
  files.set('file:///work/shared/styles.puml', 'S');
  files.set('file:///real/work/docs/own.puml', 'O');
  links.set('/work/docs/key.puml', '/home/user/.ssh/id_rsa');
  links.set('/work/docs/lib', '/home/user/.ssh');
  links.set('/work/docs/styles.puml', '/work/shared/styles.puml');
  const { includes } = await includeFiles();
  const text = ['!include key.puml', '!include lib/id_rsa', '!include styles.puml'].join('\n');
  const problem = (path: string) =>
    `The file ${path} is a symbolic link to a file outside the workspace folders and the folder of the document. The extension reads included files only from these folders.`;
  expect(includes.load(document, text)).toEqual({
    'key.puml': { problem: problem('key.puml') },
    'lib/id_rsa': { problem: problem('lib/id_rsa') },
    // A link to a file in a workspace folder is fine.
    'styles.puml': { text: 'S' },
  });

  // A workspace folder that is a symbolic link holds the targets of its links.
  links.clear();
  links.set('/work', '/real/work');
  expect(includes.load(document, '!include own.puml')).toEqual({ 'own.puml': { text: 'O' } });
});

test('reads the files of the folder of a document outside the workspace folders, and no file without a saved document', async () => {
  workspaceFolders = undefined;
  files.set('file:///notes/styles.puml', 'S');
  const { includes } = await includeFiles();
  expect(includes.load(FakeUri.file('/notes/a.md') as never, '!include styles.puml')).toEqual({ 'styles.puml': { text: 'S' } });
  const problem = 'The document is not saved in a folder, so the extension cannot find the included file styles.puml.';
  expect(includes.filesOf(new FakeUri('untitled', '', 'Untitled-1') as never, '!include styles.puml')).toEqual({ 'styles.puml': { problem } });
  expect(includes.filesOf(undefined, '!include styles.puml')).toEqual({ 'styles.puml': { problem } });
});

test('reads the included files of a version in Git from the same version', async () => {
  const query = (path: string) => JSON.stringify({ path, ref: 'HEAD' });
  const original = new FakeUri('git', '', '/work/docs/design.md', query('/work/docs/design.md'));
  files.set(`git:///work/docs/styles.puml?${query('/work/docs/styles.puml')}`, 'old');
  const { includes } = await includeFiles();
  expect(await includes.load(original as never, '!include styles.puml')).toEqual({ 'styles.puml': { text: 'old' } });
  // Git keeps its versions, so the extension watches no file of Git.
  expect(watchers).toEqual([]);
});

test('reads a watched file again when it changes, is deleted or is created, and tells the previews', async () => {
  const { includes, changes } = await includeFiles();
  const text = '!include styles.puml';
  expect(includes.load(document, text)).toEqual({ 'styles.puml': { problem: 'The file styles.puml does not exist.' } });
  const [watcher] = watchers;
  expect(watcher.pattern.base.toString()).toBe('file:///work/docs');
  expect(watcher.pattern.pattern).toBe('styles.puml');

  files.set('file:///work/docs/styles.puml', 'new');
  watcher.changed();
  await settle();
  expect(changes()).toBe(1);
  expect(includes.filesOf(document, text)).toEqual({ 'styles.puml': { text: 'new' } });

  // An event without a change of the text renders nothing again.
  watcher.changed();
  await settle();
  expect(changes()).toBe(1);

  files.delete('file:///work/docs/styles.puml');
  watcher.changed();
  await settle();
  expect(changes()).toBe(2);
  expect(includes.filesOf(document, text)).toEqual({ 'styles.puml': { problem: 'The file styles.puml does not exist.' } });
});

test('forgets a file that no diagram has included for ten minutes, and stops its watcher', async () => {
  files.set('file:///work/docs/a.puml', 'A');
  files.set('file:///work/docs/b.puml', 'B');
  const { includes } = await includeFiles();
  void includes.load(document, '!include a.puml');
  await vi.advanceTimersByTimeAsync(11 * 60_000);
  void includes.load(document, '!include b.puml');
  expect(watchers.map((watcher) => [watcher.pattern.pattern, watcher.disposed])).toEqual([
    ['a.puml', true],
    ['b.puml', false],
  ]);
  includes.dispose();
  expect(watchers.every((watcher) => watcher.disposed)).toBe(true);
});

test('watches a file whose name holds characters with a meaning in patterns by that name', async () => {
  files.set('file:///work/docs/a[1]{x}.puml', 'A');
  const { includes } = await includeFiles();
  void includes.load(document, '!include a[1]{x}.puml');
  expect(watchers.map((watcher) => watcher.pattern.pattern)).toEqual(['a[[]1[]][{]x[}].puml']);
});
