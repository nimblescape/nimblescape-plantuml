// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

// `npm run install-local`: packages the extension (npm run package) and installs the .vsix into the current VS Code
// profile of this computer (`code --install-extension … --force --profile …`). The current profile is the profile of
// the VS Code window that has this repository open: VS Code's storage.json maps each folder that a window opened to
// the ID of the profile of the window (profileAssociations), and names the profiles other than the default profile
// (userDataProfiles). A window that has a parent folder of the repository open counts too; the nearest folder wins. A
// repository that no window has opened yet gets the default profile. Other profiles stay as they are.
// `npm run install-local -- --profile <name>` installs into the named profile instead.
// The script first installs the locked development tools (`npm ci --ignore-scripts`, as CI does) when they are missing
// or older than package-lock.json, for example after a fresh clone or a git pull that changed package-lock.json.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { name, version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const vsix = join(root, `${name}-${version}.vsix`);
// npm and code are .cmd files on Windows, which need a shell.
const shell = process.platform === 'win32';
// The ID of the default profile in VS Code's storage.json.
const defaultProfileId = '__default__profile__';

function run(command, args) {
  console.log(`> ${command} ${args.join(' ')}`);
  // With a shell (Windows), an argument with spaces (a profile name, the path of the package) must be quoted.
  const shellArgs = shell ? args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)) : args;
  const result = spawnSync(command, shellArgs, { cwd: root, stdio: 'inherit', shell });
  if (result.error) {
    console.error(`${command}: ${result.error.message}`);
    if (command === 'code') {
      console.error('The command `code` was not found. In VS Code: Shell Command: Install \'code\' command in PATH.');
    }
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

/** The folder of VS Code's user data (VSCODE_USER_DATA_DIR for tests), by platform. */
function userDataDir() {
  if (process.env.VSCODE_USER_DATA_DIR) return process.env.VSCODE_USER_DATA_DIR;
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Code');
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Code');
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'Code');
}

/**
 * The real path of a folder, compared without case where the file system of the platform usually ignores it
 * (Windows, macOS).
 */
function comparable(folder) {
  let path = folder;
  try {
    path = realpathSync(folder);
  } catch {
    // A folder that no longer exists keeps its path.
  }
  return process.platform === 'win32' || process.platform === 'darwin' ? path.toLowerCase() : path;
}

/**
 * The path of a folder that VS Code names with a file URI, or undefined for another URI. VS Code encodes the colon of
 * a Windows drive (file:///c%3A/…), which fileURLToPath decodes.
 */
function folderPath(uri) {
  try {
    return uri.startsWith('file:') ? fileURLToPath(uri) : undefined;
  } catch {
    return undefined;
  }
}

/** Whether a folder is the repository or a parent folder of it. */
function containsRoot(folder) {
  const path = relative(comparable(folder), comparable(root));
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

/** The ID of a profile in storage.json: the last part of its location, a relative path or a URI. */
function profileId(location) {
  const path = typeof location === 'string' ? location : location?.path;
  return typeof path === 'string' ? posix.basename(path) : undefined;
}

/**
 * The current profile: its name (undefined for the default profile), and the folder of the window whose profile it
 * is (undefined when no window has the repository open).
 */
function currentProfile() {
  let storage;
  try {
    storage = JSON.parse(readFileSync(join(userDataDir(), 'User', 'globalStorage', 'storage.json'), 'utf8'));
  } catch {
    return {};
  }
  const [nearest] = Object.entries(storage?.profileAssociations?.workspaces ?? {})
    .map(([uri, id]) => ({ folder: folderPath(uri), id }))
    .filter(({ folder, id }) => folder !== undefined && typeof id === 'string' && containsRoot(folder))
    .sort((a, b) => b.folder.length - a.folder.length);
  if (!nearest || nearest.id === defaultProfileId) return { folder: nearest?.folder };
  const profile = (storage?.userDataProfiles ?? []).find((stored) => profileId(stored?.location) === nearest.id);
  // VS Code opens the folder in the default profile when its profile no longer exists.
  return { name: typeof profile?.name === 'string' && profile.name !== '' ? profile.name : undefined, folder: nearest.folder };
}

const profileIndex = process.argv.indexOf('--profile');
const named = profileIndex >= 0 ? process.argv[profileIndex + 1] : undefined;
if (profileIndex >= 0 && !named) {
  console.error('--profile needs the name of a VS Code profile.');
  process.exit(1);
}
// An undefined profile stands for the default profile.
const { name: profile, folder } = named ? { name: named } : currentProfile();
const profileName = profile ?? 'Default';
if (named) {
  console.log(`VS Code profile: ${profileName} (named with --profile)`);
} else if (folder) {
  console.log(`VS Code profile: ${profileName} (the profile of the window with ${folder})`);
} else {
  console.log(`VS Code profile: ${profileName} (no VS Code window has opened ${root} yet)`);
}

// npm writes node_modules/.package-lock.json at each installation of the dependencies.
const installed = join(root, 'node_modules', '.package-lock.json');
if (!existsSync(installed) || statSync(join(root, 'package-lock.json')).mtimeMs > statSync(installed).mtimeMs) {
  run('npm', ['ci', '--ignore-scripts']);
}
run('npm', ['run', 'package']);
if (!existsSync(vsix)) {
  console.error(`The package ${vsix} was not written.`);
  process.exit(1);
}
run('code', ['--install-extension', vsix, '--force', ...(profile ? ['--profile', profile] : [])]);
console.log(`Installed ${name} ${version} in the profile ${profileName}. Reload the VS Code windows of this profile (Developer: Reload Window) to use it.`);
