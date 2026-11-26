// The game's tests, run from the repository root:
//   node_modules/.bin/vitest run --config packages/world/src/game/vitest.config.mjs
// They read src/data/frame-data.json (scripts/sync-data.sh), the sealed fixtures under fixtures/od-20261126, and
// packages/engine and packages/core from source. The tests are JavaScript so the package's type-check (browser types
// only) never sees their Node imports.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const world = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
  root: world,
  test: { include: ['src/game/**/*.test.mjs'], environment: 'node', testTimeout: 120_000 },
});
