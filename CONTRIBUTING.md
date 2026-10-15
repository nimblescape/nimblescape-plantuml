# Contributing

This guide explains the files, the development, the tests and the release of
the extension. The [README](README.md) describes the use in short, the
[user guide](docs/guide.md) describes every feature, and
[docs/requirements.md](docs/requirements.md) lists what the extension must do,
each requirement with an ID.

## Files

| File | Purpose |
| --- | --- |
| `src/extension.ts` | The editor wiring. The manifest contributes the language without code, so activation registers nothing yet. |
| `src/manifest.test.ts` | The tests of the manifest, the package contents, the bundled engine and the documents, with vitest. |
| `dist/` | The bundle `dist/extension.js` and the engine in `dist/engine/`, built by `esbuild.mjs` and kept out of Git. |
| `language-configuration.json` | The editing rules of the language PlantUML: comments, brackets and the pairs that the editor closes. |
| `docs/guide.md` | The user guide: every feature, how to use it, and its state. |
| `docs/requirements.md` | The requirements, each with an ID as its heading, and the plan of the steps. |
| `THIRD-PARTY-NOTICES.md` | The components of the bundled engine, their licenses and the places of their source code. |
| `esbuild.mjs` | Bundles `src/extension.ts` and the modules that it imports into `dist/extension.js`, and copies the engine into `dist/engine/`. The editor API stays outside the bundle. A production build (`--production`) is minified and has no source map. |
| `tsconfig.json` | The TypeScript settings of the type check: strict, and no output, because esbuild builds the bundle. |
| `vitest.config.mts` | The settings of the tests: the files `src/**/*.test.ts` on Node. |
| `package.json` | The extension manifest. The section [Manifest](#manifest) explains it. |
| `package-lock.json` | The locked engine and development tools. npm writes this file, and nobody edits it by hand. |
| `.node-version` | The Node release of the development tools. `actions/setup-node` in the workflows and local Node version managers read it. |
| `.vscodeignore` | Lists the files of the package: `dist/extension.js`, `dist/engine/`, `language-configuration.json`, `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE` and `THIRD-PARTY-NOTICES.md`. |
| `.github/workflows/ci.yml` | Checks the types, tests and packages every push to `main`, every pull request and the commit of every release. |
| `.github/workflows/release.yml` | Releases a version on a manual start: commits the version to a temporary branch, tests and packages it with `ci.yml`, and only then moves `main` to it, creates its tag and GitHub release and publishes it to the Marketplace. A dry run tests without a change. The section [Release](#release) explains it. |
| `.github/workflows/marketplace-identity.yml` | Prints the Marketplace member ID of the publishing identity, to check the setup of the repository. |
| `.github/dependabot.yml` | Proposes weekly updates of the development tools, of the engine and of the pinned actions. |
| `scripts/marketplace-setup.sh` | Sets up the Marketplace publishing of the repository. The section [Setup of a repository](#setup-of-a-repository) explains it. |
| `.vscode/launch.json`, `.vscode/tasks.json` | Build the bundle and start a VS Code window that loads the extension from this folder. |

## Development

The development tools are TypeScript, esbuild, vitest and
[`@vscode/vsce`](https://github.com/microsoft/vscode-vsce), the Microsoft tool
that packages and publishes extensions. Everything runs on Node.js 24: the
release in `.node-version` for the tools and CI, and the runtime of VS Code
1.125 and later (`engines.vscode`) for the extension.

| Command | Effect |
| --- | --- |
| `npm ci --ignore-scripts` | Installs the locked engine and development tools and runs no install script of a dependency. |
| `npm run typecheck` | Checks the types with `tsc`. esbuild does not check them. |
| `npm test` | Runs the tests with vitest. The tests touch no installed editor. |
| `npm run build` | Bundles `dist/extension.js` with a source map and copies the engine into `dist/engine/`. |
| `npm run package` | Builds `nimblescape-plantuml-<version>.vsix` with vsce, which first runs the production build (`vscode:prepublish`). vsce also validates the manifest and the README. |
| `code --install-extension nimblescape-plantuml-<version>.vsix` | Installs the built package. Reload the window after an update of an active extension. |

The launch configuration "Run the extension" builds the bundle and starts a
second VS Code window that loads the extension from this folder, so that a
change can be tried without a package.

## Manifest

`package.json` is the extension manifest. It has these parts:

- The name and the publisher define the extension ID `nimblescape.nimblescape-plantuml`; the section [Naming](#naming) explains the name.
- The version is the only source of the package version, and the tag of a release names it.
- The engine range defines the compatible VS Code versions. `@types/vscode` stays at the lowest version of that range.
- `main` selects the bundle `dist/extension.js`. A test checks it.
- `.vscodeignore` lists the files of the package, not a `files` field: it ignores everything and keeps the bundle, the engine, the language configuration and the documents. A test checks the list.
- `extensionKind` selects the workspace host.
- The language contribution registers the language `plantuml` for its file extensions, with the editing rules of `language-configuration.json`. A test keeps the README table equal to the file extensions.
- The untrusted-workspace and virtual-workspace capabilities state that the extension only reads.
- The runtime dependency is the engine `@plantuml/core`, pinned to one version; the section [Engine](#engine) explains it. The development dependencies are the build, test and packaging tools.

`README.md` is the page of the Marketplace and `CHANGELOG.md` its tab
"Changelog". vsce does not rewrite relative links
(`--no-rewrite-relative-links`), so both use full `https://github.com/…`
links outside code. A test checks it.

## Engine

The engine is the npm package
[`@plantuml/core`](https://www.npmjs.com/package/@plantuml/core): PlantUML
compiled to JavaScript with TeaVM, built and published by the PlantUML
project. Its versions 1.2026.6 and later are under the MIT License; earlier
versions are under the GPL. `package.json` pins one exact version, so that an
update of the engine is a change of its own, which Dependabot proposes and CI
checks.

The files of the engine are browser scripts that the preview loads as they
are. `esbuild.mjs` copies every script that the package exports, and the
license of the package, into `dist/engine/`; vsce packages without
`node_modules` (`--no-dependencies`). The package does not bundle the standard
library of PlantUML (`!include <C4/C4_Context>` and others), which the engine
loads on demand from a configurable address.

`THIRD-PARTY-NOTICES.md` names the components of the engine: PlantUML (MIT),
Viz.js (MIT) with Graphviz (Eclipse Public License 1.0) and Expat (MIT), the
themes (MIT), the Twemoji graphics (CC BY 4.0) and the Open Iconic icons (MIT).
A test checks that the installed engine is under the MIT License and that the
notices name every script of the engine. After an update of the engine, check
the versions in the notices against the headers of `viz-global.js`.

## Naming

Every extension of the publisher `nimblescape` uses one name,
`nimblescape-<name>`, for the repository, the package and the extension:

| What | Form | This extension |
| --- | --- | --- |
| Repository | `nimblescape/nimblescape-<name>` | `nimblescape/nimblescape-plantuml` |
| `name` in `package.json` | `nimblescape-<name>` | `nimblescape-plantuml` |
| Extension ID | `nimblescape.nimblescape-<name>` | `nimblescape.nimblescape-plantuml` |
| Package file | `nimblescape-<name>-<version>.vsix` | `nimblescape-plantuml-<version>.vsix` |
| Display name | `nimblescape <Title>` | `nimblescape PlantUML` |

The prefix keeps the name apart from the names of other publishers, because
the Marketplace accepts a `name` only once. The Marketplace cannot rename an
extension ID: another `name` publishes a new extension, and the old one stays
with its installations. An extension that is no longer wanted is unpublished
(More Actions, Unpublish, which can be undone), never removed: the Marketplace
keeps the `name` of a removed extension reserved for good, also for its own
publisher.

## Release

A released version is a tag `v<version>` whose `<version>` equals the version
in `package.json`. The workflow "Release" creates the version, its tag, its
GitHub release and its Marketplace version in one run. To release a version,
follow these steps:

1. Optional: add a section `## <version>` to `CHANGELOG.md` on `main`.
2. In the tab "Actions", choose the workflow "Release", then "Run workflow" on the branch `main`. Enter the version, for example `0.1.7`. When `CHANGELOG.md` has no section for the version, enter its notes too: they become the section. The GitHub website starts a workflow also in the browser of a phone.

The run has four jobs:

1. "Version commit" checks that the run starts from `main`, that the version has the form `<major>.<minor>.<patch>`, that it is not lower than the version in `package.json` and that its tag does not exist. It sets the version in `package.json` and `package-lock.json`, adds the section of the notes to `CHANGELOG.md` when the file has none, commits the change as "Release `<version>`" and pushes it to the temporary branch `release/run-<run ID>`, not to `main`. When `main` holds the version and its section already, it commits nothing. It also deletes the temporary branches of earlier runs that failed.
2. "CI" runs the workflow `ci.yml` for the commit of the version, because a push with the token of a workflow starts no other workflow. The VSIX that this job tests and builds is the VSIX of the release, so the release repeats no test and no build.
3. "Main, tag and GitHub release" runs only when CI passed. It moves `main` to the commit of the version as a fast-forward and deletes the temporary branch. When `main` changed during the run, it stops before the tag. Then it creates the tag `v<version>` on the commit and the release of the tag with the GitHub CLI `gh`. The section of the version in `CHANGELOG.md` becomes the notes, and the VSIX becomes the file of the release. A release that exists keeps its notes and receives the VSIX only when it holds none.
4. "Publish to the Visual Studio Marketplace" downloads the VSIX of the GitHub release, signs in to Microsoft Entra ID with the official [`azure/login`](https://github.com/Azure/login) action and publishes the VSIX with `vsce publish --azure-credential`.

`main` receives the version commit only after CI passed. When CI fails,
`main`, the tags, the releases and the Marketplace stay unchanged, and the
version stays free: fix the cause on `main` and start the release of the same
version again. The jobs move and push with the token of the workflow, so a
rule of `main` that blocks direct pushes stops the release.

A dry run tests a release without a change: choose "Dry run" when you start
the workflow. The run makes the version commit on its temporary branch, runs
CI for it and deletes the branch; it changes neither `main`, a tag, a release
nor the Marketplace. A dry run may start from another branch than `main`, so
it also tests a change of `release.yml` on that branch before the change
reaches `main`.

When a job fails, remove the cause and choose "Re-run failed jobs" on the
run. A re-run keeps the tag and the VSIX that the GitHub release already
holds, and the Marketplace skips a version that it already holds, so a re-run
never publishes a version twice. A new run deletes the temporary branch of a
failed run, so a failed run can no longer be re-run after a new run started.

The workflows `release.yml` and `marketplace-identity.yml` and this section
are the same in every extension repository of nimblescape. A change to them
goes into every repository.

## Marketplace setup

The workflow publishes with a Microsoft Entra ID token, as the
[Microsoft publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace)
recommends. It uses no personal access token, because Azure DevOps retires
the global personal access tokens that the Marketplace needs on
1 December 2026. The publishing identity is an app registration with a
federated credential for each repository: GitHub Actions proves the identity
of the job with an OpenID Connect token, so no secret is stored. An app
registration needs no Azure subscription. One app registration publishes
every extension of the publisher `nimblescape`, because the Marketplace
grants the role of a member for the whole publisher.

### What exists

| Part | Where | Value |
| --- | --- | --- |
| Publisher | [Marketplace publisher management](https://marketplace.visualstudio.com/manage) | `nimblescape`, the `publisher` in `package.json` |
| App registration | [Microsoft Entra admin center](https://entra.microsoft.com), "App registrations" | `vscode-marketplace-publisher`, a member of the publisher `nimblescape` with the role "Contributor" |
| Organization variables | GitHub organization `nimblescape`, "Secrets and variables", "Actions", "Variables" | `AZURE_CLIENT_ID` (the application ID of the app) and `AZURE_TENANT_ID` (its directory ID); identifiers, not secrets |
| Federated credential | the app, "Certificates & secrets", "Federated credentials" | one for each repository, named after it |
| Environment | the settings of each repository, "Environments" | `marketplace`, reachable from the tags `v*` and the branch `main` only |

### Setup of a repository

A new extension repository needs its federated credential and its
environment. The script `scripts/marketplace-setup.sh` sets both up for the
GitHub repository of the remote `origin` of the clone, whose name must be the
`name` of `package.json`; it needs the Azure CLI, the GitHub CLI and Node.js,
the two CLIs signed in with an account that may change the app registration
and the settings of the repository. It shows what it sets up and
asks before it changes anything. It changes nothing that already exists, so it
can run again:

```sh
az login --allow-no-subscriptions
gh auth login
scripts/marketplace-setup.sh
```

Then run the workflow "Marketplace identity" in the tab "Actions" of the
repository: it signs in like the publish job and prints the member ID of the
app, which shows that the setup works.

The script gives the credential these values. For this repository:

| Field of the federated credential | Value |
| --- | --- |
| Issuer | `https://token.actions.githubusercontent.com` |
| Subject | `repo:nimblescape@156021698/nimblescape-plantuml@1421127814:environment:marketplace` |
| Audience | `api://AzureADTokenExchange` |

GitHub puts the owner ID and the repository ID into the subject of every
repository created after 15 July 2026, so a new owner of a reused name gets no
token. The subject also holds the name of the repository: after a rename of
the repository, run the script again and delete the credential of the old
name. One app accepts at most 20 federated credentials.

### Setup from scratch

Only when the publisher, the app or the variables are lost:

1. Create the publisher `nimblescape` on the publisher management page, signed in with the Microsoft account of nimblescape e.U.
2. Register the app `vscode-marketplace-publisher` in the Entra admin center: "New registration", "Single tenant", no API permission, no secret.
3. Set the organization variables `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` to the application ID and the directory ID of the app. Organization variables reach private repositories only on a paid GitHub plan.
4. Set up a repository with the script, and run its workflow "Marketplace identity".
5. On the publisher management page, open the publisher `nimblescape`, then "Members", and add the member ID that the workflow printed with the role "Contributor".

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) · [MIT License](LICENSE).
