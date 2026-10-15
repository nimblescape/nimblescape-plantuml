// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The settings of the extension and the PlantUML lines that apply them to a
 * diagram ([R-GEN-007](../docs/requirements.md#r-gen-007)). The module uses
 * no API of VS Code, so its tests need no fake of the editor API.
 */

/** settingsSection is the section of the settings of the extension. */
export const settingsSection = 'nimblescape.plantuml';

/** Settings are the values of the settings of the extension. */
export interface Settings {
  /**
   * visibilityIcons shows the visibility of class members as the colored icons of PlantUML. The value `false`
   * shows the UML characters `-`, `#`, `~` and `+` instead.
   */
  visibilityIcons: boolean;
}

/** defaultSettings are the values of the settings that the user did not set. */
export const defaultSettings: Readonly<Settings> = { visibilityIcons: true };

/**
 * preambleLines returns the PlantUML lines that apply the settings to a diagram. The renderer puts them directly
 * after the `@start` line, so a line of the diagram itself overrides them.
 * @param settings - The values of the settings.
 */
export function preambleLines(settings: Readonly<Settings>): string[] {
  // An icon size of 0 makes PlantUML write the visibility as a UML character.
  return settings.visibilityIcons ? [] : ['skinparam classAttributeIconSize 0'];
}
