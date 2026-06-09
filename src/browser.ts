/** Browser global-bundle entry: an IIFE (`dist/pdgkit.global.js`) exposing a global `pdgkit`. Dependency-free SVG rendering, validation, and reference-sign table; PNG/PDF/PPTX are not included. */

import { renderToSvg } from './node/svg';
import type { Lang } from './core/types';

export { parse, layout, render, refsToMarkdown, refsToCsv, SAMPLES, SAMPLE_ORDER, PATTERN_SOURCE } from './core';
export { renderToSvg, buildSvgModel } from './node/svg';
export type { RenderToSvgOptions, RenderToSvgResult, SvgModel } from './node/svg';
export { validate } from './node/validate';
export type { ValidateResult } from './node/validate';
export { computeContentBox, svgDisplayDimensions } from './node/content-box';
export { serializeSvg } from './node/dom';
export type { SvgNode } from './node/dom';

/** The pdgkit version bundled here. */
export const VERSION = '0.1.2';

/** Convenience: render to SVG and return just the string. */
export function toSvgString(source: string, lang: Lang = 'ja'): string {
  return renderToSvg(source, { lang }).svg;
}
