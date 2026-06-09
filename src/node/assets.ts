/** Resolve and load files shipped with the package (IPAex Gothic font, docs). */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The font family name recorded in ipaexg.ttf (used for resvg fallback / PDF VFS). */
export const FONT_FAMILY_NAME = 'IPAexGothic';

let cachedPath: string | null = null;
let cachedBuffer: Buffer | null = null;

function moduleDir(): string {
  // ESM: import.meta.url. CJS: esbuild leaves it empty, so fall back to __dirname.
  let url = '';
  try {
    url = import.meta.url;
  } catch {
    /* import.meta not available (CJS) */
  }
  if (url) {
    try {
      return dirname(fileURLToPath(url));
    } catch {
      /* fall through */
    }
  }
  if (typeof __dirname !== 'undefined') return __dirname;
  return process.cwd();
}

/** Resolve a file shipped with the package by walking up from this module's directory. Throws if not found. */
export function resolvePackageFile(...segments: string[]): string {
  let dir = moduleDir();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, ...segments);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `pdgkit: bundled file ${segments.join('/')} not found. ` +
      'Ensure the package was installed with its data files intact.',
  );
}

/** Absolute path to the bundled font. */
export function resolveFontPath(): string {
  if (cachedPath) return cachedPath;
  cachedPath = resolvePackageFile('assets', 'ipaexg.ttf');
  return cachedPath;
}

/** Load the font file as a Buffer (cached). */
export function loadFontBuffer(): Buffer {
  if (cachedBuffer) return cachedBuffer;
  cachedBuffer = readFileSync(resolveFontPath());
  return cachedBuffer;
}

/** Load the font file as a base64 string (for jsPDF's virtual file system). */
export function loadFontBase64(): string {
  return loadFontBuffer().toString('base64');
}
