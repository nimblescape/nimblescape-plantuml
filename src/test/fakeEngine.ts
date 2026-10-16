// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * A fake of the engine `@plantuml/core` for the tests of the previews. It
 * answers like the engine, without the time that the engine needs.
 */

import { Engine } from '../preview/renderer';

/**
 * escapeXml escapes a text for the content of an XML element.
 * @param text - The text.
 */
export const escapeXml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * errorPicture returns the picture of the engine for an error in the first line that contains `wrong`: the version,
 * the number of the line among the lines that the engine received, those lines up to the error, and the message.
 * @param lines - The lines that the engine received.
 */
export function errorPicture(lines: readonly string[]): string {
  const line = lines.findIndex((text) => text.includes('wrong')) + 1;
  const texts = ['PlantUML version 1.2026.8', `[From textarea (line ${line}) ]`, ' ', ...lines.slice(0, line), ' Syntax Error? (Assumed diagram type: class)'];
  return `<svg>${texts.map((text) => `<text>${escapeXml(text)}</text>`).join('')}</svg>`;
}

/**
 * FakeEngine records its calls and answers each call after a turn of the event loop: with an error for a text with
 * the line `fail`, with the error picture for a text with a line that contains `wrong`, and with an image of the
 * lines else, with the title of a line `title …`. It holds the answer to a text with the line `slow` until the test
 * releases it.
 */
export class FakeEngine implements Engine {
  readonly calls: { lines: string[]; options?: { dark?: boolean; maxSvgSize?: number } }[] = [];
  readonly held: (() => void)[] = [];
  running = 0;
  maxRunning = 0;

  renderToString(
    lines: string[],
    onSuccess: (svg: string) => void,
    onError: (message: string) => void,
    options?: { dark?: boolean; maxSvgSize?: number },
  ): void {
    this.calls.push({ lines, options });
    this.running++;
    this.maxRunning = Math.max(this.maxRunning, this.running);
    const answer = () => {
      this.running--;
      const title = lines.find((line) => line.startsWith('title '))?.slice('title '.length);
      if (lines.includes('fail')) {
        onError('Syntax error');
      } else if (lines.some((line) => line.includes('wrong'))) {
        onSuccess(errorPicture(lines));
      } else {
        const titleGroup = title ? `<g class="title">${title.split(' ').map((word) => `<text>${word}</text>`).join('')}</g>` : '';
        onSuccess(`<svg data-text="${escapeXml(lines.join('|'))}" data-dark="${options?.dark === true}">${titleGroup}</svg>`);
      }
    };
    if (lines.includes('slow')) {
      this.held.push(answer);
    } else {
      setTimeout(answer, 0);
    }
  }
}
