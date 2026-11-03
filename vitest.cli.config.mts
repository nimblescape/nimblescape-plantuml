// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

import { defineConfig } from 'vitest/config';

// The tests of the built npm package @nimblescape/plantuml of cli/ (npm run test:cli). They need the files that
// esbuild.mjs writes into cli/dist/ and markdown-it of the development tools.
export default defineConfig({
  test: {
    include: ['test/cli/**/*.test.ts'],
    environment: 'node',
  },
});
