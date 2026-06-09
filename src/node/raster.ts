/** Raster output (PNG / JPEG) via `@resvg/resvg-js` with the bundled IPAex Gothic font and a white background. Native dependencies are imported lazily. */

import type { Lang } from '../core/types';
import { renderToSvg } from './svg';
import { rasterDimensions } from './content-box';
import { resolveFontPath, FONT_FAMILY_NAME } from './assets';

export interface RasterOptions {
  lang?: Lang;
  /** Resolution multiplier applied to the cropped content box (default 8). */
  scale?: number;
  /** Padding around the content box, in user units (default 3). */
  bleed?: number;
}

const JPEG_QUALITY = 100; // maximum quality

interface RawImage {
  pixels: Uint8Array; // RGBA
  width: number;
  height: number;
}

/** Render to raw RGBA pixels on a white background, at the capped raster size. */
async function renderPixels(source: string, opts: RasterOptions): Promise<{ raw: RawImage; png: Uint8Array }> {
  const { lang = 'ja', scale = 8, bleed = 3 } = opts;
  const { svg, viewBox } = renderToSvg(source, { lang, crop: true, bleed });
  const dims = rasterDimensions(viewBox, scale);

  const { Resvg } = await import('@resvg/resvg-js');
  const resvg = new Resvg(svg, {
    background: 'rgba(255,255,255,1)',
    fitTo: { mode: 'width', value: dims.width },
    font: {
      fontFiles: [resolveFontPath()],
      loadSystemFonts: false,
      defaultFontFamily: FONT_FAMILY_NAME,
    },
  });
  const rendered = resvg.render();
  const raw: RawImage = {
    pixels: rendered.pixels,
    width: rendered.width,
    height: rendered.height,
  };
  return { raw, png: rendered.asPng() };
}

/** Render `.pdg` source to a PNG (8× by default, white background). */
export async function renderToPng(source: string, opts: RasterOptions = {}): Promise<Uint8Array> {
  const { png } = await renderPixels(source, opts);
  return png;
}

/** Render `.pdg` source to a JPEG (8× by default, white background). */
export async function renderToJpeg(source: string, opts: RasterOptions = {}): Promise<Uint8Array> {
  const { raw } = await renderPixels(source, opts);
  const jpeg = (await import('jpeg-js')).default;
  const encoded = jpeg.encode(
    { data: Buffer.from(raw.pixels), width: raw.width, height: raw.height },
    JPEG_QUALITY,
  );
  return encoded.data;
}
