// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The editor wiring of the extension. The manifest contributes the language
 * `plantuml` and its editing rules without code, so activation registers
 * nothing yet: the preview of a PlantUML file and the diagrams of Markdown
 * files register here when they arrive.
 */

import type * as vscode from 'vscode';

/**
 * activate starts the extension.
 * @param _context - The extension context, which holds the registrations to dispose on deactivation.
 */
export function activate(_context: vscode.ExtensionContext): void {}

/** deactivate stops the extension. VS Code disposes the registrations of the context. */
export function deactivate(): void {}
