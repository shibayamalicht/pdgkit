/** pdgkit Node API — the browser-free rendering surface a host tool calls. */

import { readFileSync } from 'node:fs';
import type { Lang } from '../core/types';
import { renderToSvg } from './svg';
import { resolvePackageFile } from './assets';

export { renderToSvg, buildSvgModel } from './svg';
export type { RenderToSvgOptions, RenderToSvgResult, SvgModel } from './svg';

export { validate } from './validate';
export type { ValidateResult } from './validate';

export { renderToPng, renderToJpeg } from './raster';
export type { RasterOptions } from './raster';

export { renderToPdf } from './pdf';
export type { PdfOptions } from './pdf';

export { renderToPptx } from './pptx';
export type { PptxOptions } from './pptx';

export { computeContentBox, svgDisplayDimensions, rasterDimensions } from './content-box';
export type { ViewBox } from './content-box';

export { installDomShim, serializeSvg } from './dom';
export type { SvgNode } from './dom';

export { resolveFontPath, loadFontBuffer, FONT_FAMILY_NAME, resolvePackageFile } from './assets';

// Reference-sign table exporters (pure; re-exported for convenience).
export { refsToMarkdown, refsToCsv } from '../core/refs';

// Low-level pipeline, for advanced hosts that want the intermediate artifacts.
export { parse } from '../core/parser';
export { layout } from '../core/layout';
export { render } from '../core/render';

/** The pdgkit package version. Keep in sync with package.json. */
export const VERSION = '0.1.2';

/** Convenience: render to SVG and return just the string. */
export function toSvgString(source: string, lang: Lang = 'ja'): string {
  return renderToSvg(source, { lang }).svg;
}

/** Read the bundled AI authoring guide (docs/ai-authoring-guide.md) as a string, for injecting into an LLM's system prompt. */
export function loadAuthoringGuide(): string {
  return readFileSync(resolvePackageFile('docs', 'ai-authoring-guide.md'), 'utf8');
}
