// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * The words of the PlantUML language that the extension knows. The syntax
 * highlighting ([R-MD-003](../../docs/requirements.md#r-md-003),
 * [R-PUML-005](../../docs/requirements.md#r-puml-005)) and the code completion
 * ([R-MD-004](../../docs/requirements.md#r-md-004),
 * [R-PUML-006](../../docs/requirements.md#r-puml-006)) use the same lists, so
 * a proposed word always has its color. The lists follow the language
 * reference of PlantUML (https://plantuml.com); the extension wrote them, and
 * they cover the diagram types that the engine renders.
 */

/**
 * diagramTypes are the diagram types that follow `@start` and `@end`, for the types that the engine renders. A
 * test with the real engine (`src/engine.test.ts`) renders each of them; the engine reports the other types of
 * PlantUML (`salt`, `ditaa`, `dot` …) as not supported.
 */
export const diagramTypes: readonly string[] = [
  'uml', 'mindmap', 'wbs', 'gantt', 'project', 'json', 'yaml', 'ebnf', 'regex', 'creole', 'chart', 'nwdiag', 'packetdiag',
];

/** elementKeywords declare an element of a diagram, for example a participant, a class or a component. */
export const elementKeywords: readonly string[] = [
  // Sequence diagrams.
  'participant', 'actor', 'boundary', 'control', 'entity', 'database', 'collections', 'queue',
  // Class and object diagrams.
  'class', 'interface', 'abstract', 'enum', 'annotation', 'protocol', 'struct', 'exception', 'metaclass',
  'stereotype', 'record', 'dataclass', 'object', 'map', 'json',
  // Containers.
  'package', 'namespace', 'node', 'folder', 'frame', 'cloud', 'rectangle', 'together', 'box', 'partition',
  // Component, deployment and use case diagrams.
  'component', 'usecase', 'card', 'artifact', 'storage', 'file', 'stack', 'agent', 'person', 'hexagon', 'label',
  'circle', 'diamond', 'port', 'portin', 'portout', 'action', 'process', 'archimate',
  // State and timing diagrams.
  'state', 'robust', 'concise', 'clock', 'binary', 'analog',
];

/** controlKeywords start a statement of the flow of a diagram, for example a branch, a loop or a group. */
export const controlKeywords: readonly string[] = [
  // Activity diagrams.
  'start', 'stop', 'end', 'if', 'elseif', 'else', 'endif', 'while', 'endwhile', 'repeat', 'backward', 'fork', 'again',
  'merge', 'split', 'detach', 'kill', 'switch', 'case', 'endswitch',
  // Sequence diagrams.
  'alt', 'opt', 'loop', 'par', 'break', 'critical', 'group', 'ref', 'return', 'activate', 'deactivate', 'destroy',
  'create', 'autoactivate', 'autonumber', 'newpage', 'delay',
];

/** documentKeywords start the parts and the settings of a whole diagram, for example its title or its notes. */
export const documentKeywords: readonly string[] = [
  'title', 'header', 'footer', 'caption', 'legend', 'endlegend', 'note', 'rnote', 'hnote', 'endnote', 'mainframe',
  'skinparam', 'hide', 'show', 'remove', 'restore', 'scale', 'allowmixing', 'sprite', 'left to right direction',
  'top to bottom direction',
];

/** linkKeywords connect the parts of a declaration or a note, for example `as` in `class Car as C`. */
export const linkKeywords: readonly string[] = ['as', 'extends', 'implements', 'of', 'over', 'on', 'link', 'is'];

/** preprocessorKeywords are the directives of the preprocessor of PlantUML, without their `!`. */
export const preprocessorKeywords: readonly string[] = [
  'include', 'include_many', 'include_once', 'includeurl', 'includesub', 'import', 'theme', 'define', 'definelong',
  'enddefinelong', 'undef', 'ifdef', 'ifndef', 'if', 'elseif', 'else', 'endif', 'while', 'endwhile', 'foreach',
  'endfor', 'procedure', 'endprocedure', 'function', 'endfunction', 'return', 'unquoted', 'local', 'global', 'log',
  'dump_memory', 'assert', 'pragma', 'startsub', 'endsub', 'option',
];
