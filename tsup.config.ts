import { defineConfig } from 'tsup';

/**
 * Two builds:
 *
 * 1. The library + CLIs — dual ESM + CJS with type declarations.
 *      - `index`      the full library (core + node renderers)
 *      - `core`       the dependency-free pipeline only (`pdgkit/core`)
 *      - `pdgkit`     the CLI (shebang preserved from bin/pdgkit.ts)
 *      - `pdgkit-mcp` the MCP server entry
 *
 * 2. The browser global bundle — a single self-contained IIFE that defines a global
 *    `pdgkit`, for pasting into browser JavaScript environments. SVG + validation +
 *    reference-sign table only (no native/Node dependencies).
 */
export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      core: 'src/core/index.ts',
      pdgkit: 'bin/pdgkit.ts',
      'pdgkit-mcp': 'bin/pdgkit-mcp.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    outDir: 'dist',
    target: 'node18',
    sourcemap: false,
    splitting: false,
    // assets.ts intentionally feature-detects import.meta.url and falls back to
    // __dirname in the CJS build, so silence esbuild's empty-import-meta warning.
    esbuildOptions(options) {
      options.logOverride = { ...options.logOverride, 'empty-import-meta': 'silent' };
    },
  },
  {
    entry: { pdgkit: 'src/browser.ts' },
    format: ['iife'],
    globalName: 'pdgkit',
    platform: 'browser',
    minify: true,
    dts: false,
    sourcemap: false,
    clean: false,
    outDir: 'dist',
  },
]);
