/** PPTX output: `.pdg` → PowerPoint (one 16:9 slide). Image mode (default) places a rasterized picture; editable mode converts each SVG primitive to an editable PowerPoint shape, connector, or text box. */

import type { Lang } from '../core/types';
import { buildSvgModel } from './svg';
import { renderToPng } from './raster';
import { rasterDimensions } from './content-box';
import { buildPptxPackage, buildEditablePptxPackage } from './ooxml';

export interface PptxOptions {
  lang?: Lang;
  /** Emit editable PowerPoint shapes instead of a single image (default false). */
  editable?: boolean;
  /** Raster resolution multiplier for image mode (default 8). */
  scale?: number;
  /** Padding around the content box, in user units (default 3). */
  bleed?: number;
}

/** Render `.pdg` source to a PPTX (image by default, or editable shapes). */
export async function renderToPptx(source: string, opts: PptxOptions = {}): Promise<Uint8Array> {
  const { lang = 'ja', editable = false, scale = 8, bleed = 3 } = opts;

  if (editable) {
    const model = buildSvgModel(source, { lang, crop: true, bleed });
    return buildEditablePptxPackage(model.el);
  }

  const { viewBox } = buildSvgModel(source, { lang, crop: true, bleed });
  const dims = rasterDimensions(viewBox, scale);
  const png = await renderToPng(source, { lang, scale, bleed });
  return buildPptxPackage(png, dims.width, dims.height);
}
