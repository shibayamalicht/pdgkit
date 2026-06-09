/** Tight content bounding box of a rendered SVG tree, computed analytically (no `getBBox`), reusing {@link estimateTextWidth} for text. Also provides raster/display dimension helpers. */

import { estimateTextWidth } from '../core/render';
import type { SvgNode } from './dom';

export interface ViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const DEFAULT_BLEED = 3;

function num(node: SvgNode, name: string, fallback = 0): number {
  const raw = node.getAttribute(name);
  if (raw == null) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function parseNumbers(text: string): number[] {
  const out: number[] = [];
  const re = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(Number.parseFloat(m[0]));
  return out;
}

/** Bounds of a single primitive, or null if it contributes nothing measurable. */
function primitiveBounds(node: SvgNode): Bounds | null {
  switch (node.tagName) {
    case 'rect': {
      const x = num(node, 'x');
      const y = num(node, 'y');
      const w = num(node, 'width');
      const h = num(node, 'height');
      if (w <= 0 && h <= 0) return null;
      return { minX: x, minY: y, maxX: x + w, maxY: y + h };
    }
    case 'circle': {
      const cx = num(node, 'cx');
      const cy = num(node, 'cy');
      const r = num(node, 'r');
      if (r <= 0) return null;
      return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r };
    }
    case 'line': {
      const x1 = num(node, 'x1');
      const y1 = num(node, 'y1');
      const x2 = num(node, 'x2');
      const y2 = num(node, 'y2');
      return {
        minX: Math.min(x1, x2),
        minY: Math.min(y1, y2),
        maxX: Math.max(x1, x2),
        maxY: Math.max(y1, y2),
      };
    }
    case 'polygon':
    case 'polyline': {
      const nums = parseNumbers(node.getAttribute('points') ?? '');
      return boundsFromPairs(nums);
    }
    case 'path': {
      // render() only emits absolute M/L commands, so every number pair is a vertex.
      const nums = parseNumbers(node.getAttribute('d') ?? '');
      return boundsFromPairs(nums);
    }
    case 'text': {
      return textBounds(node);
    }
    default:
      return null;
  }
}

function boundsFromPairs(nums: number[]): Bounds | null {
  if (nums.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i];
    const y = nums[i + 1];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function textBounds(node: SvgNode): Bounds | null {
  const text = node.textContent;
  if (!text) return null;
  const x = num(node, 'x');
  const y = num(node, 'y');
  const fontSize = num(node, 'font-size', 2.8);
  const width = estimateTextWidth(text, fontSize);
  const anchor = node.getAttribute('text-anchor') ?? 'start';

  let minX: number;
  if (anchor === 'middle') minX = x - width / 2;
  else if (anchor === 'end') minX = x - width;
  else minX = x;
  const maxX = minX + width;

  // Vertical extent depends on the baseline. render() uses 'alphabetic' (default)
  // for node/container text and 'middle' for some edge labels.
  const baseline = node.getAttribute('dominant-baseline') ?? 'alphabetic';
  let minY: number;
  let maxY: number;
  if (baseline === 'middle' || baseline === 'central') {
    minY = y - fontSize * 0.6;
    maxY = y + fontSize * 0.6;
  } else {
    minY = y - fontSize * 0.8;
    maxY = y + fontSize * 0.25;
  }
  return { minX, minY, maxX, maxY };
}

function collectBounds(node: SvgNode, acc: Bounds[]): void {
  const b = primitiveBounds(node);
  if (b) acc.push(b);
  for (const child of node.children) collectBounds(child, acc);
}

function unionAll(bounds: Bounds[]): Bounds | null {
  if (bounds.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of bounds) {
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  return { minX, minY, maxX, maxY };
}

/** Parse a `viewBox="minX minY w h"` attribute as a fallback content box. */
function fallbackViewBox(root: SvgNode): ViewBox {
  const nums = parseNumbers(root.getAttribute('viewBox') ?? '');
  if (nums.length === 4 && nums[2] > 0 && nums[3] > 0) {
    return { minX: nums[0], minY: nums[1], width: nums[2], height: nums[3] };
  }
  return { minX: 0, minY: 0, width: 210, height: 297 };
}

/** Tight content bounding box of a rendered SVG tree, padded by `bleed` (default 3 units). */
export function computeContentBox(root: SvgNode, bleed = DEFAULT_BLEED): ViewBox {
  const all: Bounds[] = [];
  collectBounds(root, all);
  const merged = unionAll(all);
  if (!merged) return fallbackViewBox(root);
  const pad = Math.max(0, bleed);
  return {
    minX: merged.minX - pad,
    minY: merged.minY - pad,
    width: Math.max(1, merged.maxX - merged.minX + pad * 2),
    height: Math.max(1, merged.maxY - merged.minY + pad * 2),
  };
}

/** Display dimensions for a viewBox so the long side is at least `targetSide` px (default 1600). */
export function svgDisplayDimensions(
  viewBox: Pick<ViewBox, 'width' | 'height'>,
  targetSide = 1600,
): { width: number; height: number; scale: number } {
  const longest = Math.max(viewBox.width, viewBox.height, 1);
  const scale = Math.max(1, targetSide / longest);
  return {
    width: Math.max(1, Math.ceil(viewBox.width * scale)),
    height: Math.max(1, Math.ceil(viewBox.height * scale)),
    scale,
  };
}

const RASTER_SCALE = 8;
const RASTER_MAX_SIDE = 24000;
const RASTER_MAX_PIXELS = 100_000_000;

/** Raster (PNG/JPEG) pixel dimensions for a viewBox at `scale`× (default 8×), capped so neither side exceeds 24000 px nor the total exceeds 1e8 px. */
export function rasterDimensions(
  viewBox: Pick<ViewBox, 'width' | 'height'>,
  scale = RASTER_SCALE,
): { width: number; height: number; scale: number } {
  const requested = Number.isFinite(scale) && scale > 0 ? scale : RASTER_SCALE;
  const sideScale = RASTER_MAX_SIDE / Math.max(viewBox.width, viewBox.height, 1);
  const pixelScale = Math.sqrt(RASTER_MAX_PIXELS / Math.max(viewBox.width * viewBox.height, 1));
  const capped = Math.min(requested, sideScale, pixelScale);
  return {
    width: Math.max(1, Math.ceil(viewBox.width * capped)),
    height: Math.max(1, Math.ceil(viewBox.height * capped)),
    scale: capped,
  };
}
