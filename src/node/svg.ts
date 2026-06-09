/** Headless SVG rendering: `.pdg` source → standalone SVG string. */

import { parse } from '../core/parser';
import { layout } from '../core/layout';
import { render } from '../core/render';
import type { Lang, DiagramKind } from '../core/types';
import { withShimDocument, serializeSvg, type SvgNode } from './dom';
import { computeContentBox, svgDisplayDimensions, type ViewBox } from './content-box';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_BLEED = 3;
const DEFAULT_TARGET_SIDE = 1600;

export interface RenderToSvgOptions {
  /** Display language: 'ja' (default), 'en', or 'both' (bilingual two-line labels). */
  lang?: Lang;
  /** Crop to the real drawn extent (default true). When false, uses the full canvas. */
  crop?: boolean;
  /** Padding added around the content box, in user units (default 3). */
  bleed?: number;
  /** Minimum long-side length in px for the width/height attributes (default 1600). */
  targetSide?: number;
  /** Prepend an `<?xml ... ?>` declaration (default true). */
  xmlDeclaration?: boolean;
}

export interface RenderToSvgResult {
  /** The serialized standalone SVG document. */
  svg: string;
  /** The diagram kind inferred from the source. */
  kind: DiagramKind;
  /** The viewBox used (content box when cropped). */
  viewBox: ViewBox;
  /** Display width in px (the `width` attribute). */
  width: number;
  /** Display height in px (the `height` attribute). */
  height: number;
}

/** The fully-attributed SVG model: the element tree plus the geometry used. */
export interface SvgModel {
  /** The cropped, attributed root `<svg>` element (shim node). */
  el: SvgNode;
  kind: DiagramKind;
  viewBox: ViewBox;
  width: number;
  height: number;
}

/** Build the SVG element model (parse → layout → render, crop, set attributes). Returns the live element tree, which the editable-PPTX renderer walks directly. */
export function buildSvgModel(source: string, opts: RenderToSvgOptions = {}): SvgModel {
  const {
    lang = 'ja',
    crop = true,
    bleed = DEFAULT_BLEED,
    targetSide = DEFAULT_TARGET_SIDE,
  } = opts;

  const doc = parse(source);
  const laid = layout(doc);
  const svgEl = withShimDocument(() => render(laid, { lang })) as unknown as SvgNode;

  const viewBox: ViewBox = crop
    ? computeContentBox(svgEl, bleed)
    : { minX: 0, minY: 0, width: laid.width, height: laid.height };

  const display = svgDisplayDimensions(viewBox, targetSide);

  svgEl.setAttribute('xmlns', SVG_NS);
  svgEl.setAttribute('version', '1.1');
  svgEl.setAttribute(
    'viewBox',
    `${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`,
  );
  svgEl.setAttribute('width', String(display.width));
  svgEl.setAttribute('height', String(display.height));
  svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  return { el: svgEl, kind: doc.kind, viewBox, width: display.width, height: display.height };
}

/**
 * Render `.pdg` source to a standalone SVG string. Synchronous and dependency-free.
 */
export function renderToSvg(source: string, opts: RenderToSvgOptions = {}): RenderToSvgResult {
  const model = buildSvgModel(source, opts);
  const body = serializeSvg(model.el);
  const svg = (opts.xmlDeclaration ?? true)
    ? `<?xml version="1.0" encoding="UTF-8"?>\n${body}`
    : body;
  return {
    svg,
    kind: model.kind,
    viewBox: model.viewBox,
    width: model.width,
    height: model.height,
  };
}
