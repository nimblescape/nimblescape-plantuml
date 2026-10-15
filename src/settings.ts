// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The settings of the extension that change the diagrams. The module uses no
 * API of VS Code, so the scripts of the previews can use it, and its tests
 * need no fake of the editor API.
 */

/** settingsSection is the section of the settings of the extension. */
export const settingsSection = 'nimblescape.plantuml';

/** Settings are the values of the settings of the extension. */
export interface Settings {
  /**
   * classIcons shows the colored icons of PlantUML in class diagrams: the circled letter of the kind of a class
   * and the icons of the visibility of its members. The value `false` shows the UML notation instead
   * ([R-GEN-007](../docs/requirements.md#r-gen-007)).
   */
  classIcons: boolean;
}

/** defaultSettings are the values of the settings that the user did not set. */
export const defaultSettings: Readonly<Settings> = { classIcons: true };

/**
 * isDefault tells whether settings have the default value of every setting.
 * @param settings - The values of the settings.
 */
export function isDefault(settings: Readonly<Settings>): boolean {
  return (Object.keys(defaultSettings) as (keyof Settings)[]).every((key) => settings[key] === defaultSettings[key]);
}

/**
 * parseSettings reads settings from their JSON text. A missing or invalid value gets its default.
 * @param text - The JSON text, or null for the default settings.
 */
export function parseSettings(text: string | null): Settings {
  let value: unknown;
  try {
    value = text ? JSON.parse(text) : undefined;
  } catch {
    value = undefined;
  }
  const values = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return { classIcons: typeof values.classIcons === 'boolean' ? values.classIcons : defaultSettings.classIcons };
}
