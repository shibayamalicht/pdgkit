/** PDF output (A4, IPAex font embedded). Vector by default (jsPDF + svg2pdf.js under jsdom, with analytic getBBox/getComputedTextLength shims), falling back to a high-resolution raster PDF if the vector path fails. */

import type { Lang } from '../core/types';
import { estimateTextWidth } from '../core/render';
import { renderToSvg } from './svg';
import { renderToPng } from './raster';
import { fitRectIntoPage } from './ooxml';
import { loadFontBase64, FONT_FAMILY_NAME } from './assets';
import type { ViewBox } from './content-box';

export interface PdfOptions {
  lang?: Lang;
  /** Padding around the content box, in user units (default 3). */
  bleed?: number;
  /** Prefer vector output; fall back to raster on failure (default true). */
  vector?: boolean;
  /** Raster resolution multiplier for the raster path (default 8). */
  scale?: number;
}

/** Render `.pdg` source to a PDF (A4, IPAex font, vector preferred). */
export async function renderToPdf(source: string, opts: PdfOptions = {}): Promise<Uint8Array> {
  const { lang = 'ja', bleed = 3, vector = true, scale = 8 } = opts;
  const { svg, viewBox } = renderToSvg(source, { lang, crop: true, bleed });

  if (vector) {
    try {
      return await renderVectorPdf(svg, viewBox);
    } catch {
      // svg2pdf/jsdom failure — fall back to a faithful raster PDF.
    }
  }
  return await renderRasterPdf(source, viewBox, { lang, scale, bleed });
}

async function renderVectorPdf(svg: string, viewBox: ViewBox): Promise<Uint8Array> {
  const { JSDOM } = await import('jsdom');
  const { jsPDF } = await import('jspdf');
  const { svg2pdf } = await import('svg2pdf.js');

  const dom = new JSDOM(svg, { contentType: 'image/svg+xml' });
  patchSvgGeometry(dom.window);
  const svgEl = dom.window.document.documentElement as unknown as Element;

  // Point all text at the embedded font so svg2pdf emits glyphs from it.
  svgEl.setAttribute('font-family', FONT_FAMILY_NAME);
  for (const t of Array.from(dom.window.document.getElementsByTagName('text'))) {
    t.setAttribute('font-family', FONT_FAMILY_NAME);
  }

  const orientation = viewBox.width > viewBox.height ? 'l' : 'p';
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation });
  try {
    pdf.addFileToVFS(`${FONT_FAMILY_NAME}.ttf`, loadFontBase64());
    pdf.addFont(`${FONT_FAMILY_NAME}.ttf`, FONT_FAMILY_NAME, 'normal');
  } catch {
    /* font embedding is best-effort */
  }

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const fit = fitRectIntoPage(viewBox.width, viewBox.height, pageW, pageH, 10);

  await svg2pdf(svgEl as unknown as Parameters<typeof svg2pdf>[0], pdf, {
    x: fit.x,
    y: fit.y,
    width: fit.width,
    height: fit.height,
  });
  return new Uint8Array(pdf.output('arraybuffer'));
}

async function renderRasterPdf(
  source: string,
  viewBox: ViewBox,
  opts: { lang: Lang; scale: number; bleed: number },
): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf');
  const png = await renderToPng(source, opts);
  const orientation = viewBox.width > viewBox.height ? 'l' : 'p';
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const fit = fitRectIntoPage(viewBox.width, viewBox.height, pageW, pageH, 10);
  const dataUrl = 'data:image/png;base64,' + Buffer.from(png).toString('base64');
  pdf.addImage(dataUrl, 'PNG', fit.x, fit.y, fit.width, fit.height);
  return new Uint8Array(pdf.output('arraybuffer'));
}

/**
 * Install analytic `getBBox` / `getComputedTextLength` (and stub matrix getters)
 * on jsdom's SVGElement prototype. jsdom defines these as throwing stubs, so we
 * override unconditionally. Text metrics reuse the layout heuristic.
 */
function patchSvgGeometry(win: { SVGElement?: { prototype: unknown } }): void {
  const proto = win.SVGElement?.prototype as Record<string, unknown> | undefined;
  if (!proto) return;

  const numOf = (el: { getAttribute?: (n: string) => string | null }, name: string, d = 0): number => {
    const v = Number.parseFloat(el.getAttribute?.(name) ?? '');
    return Number.isFinite(v) ? v : d;
  };

  proto.getBBox = function (this: {
    tagName?: string;
    textContent?: string;
    getAttribute?: (n: string) => string | null;
  }) {
    const tag = (this.tagName ?? '').toLowerCase();
    if (tag === 'rect') {
      return { x: numOf(this, 'x'), y: numOf(this, 'y'), width: numOf(this, 'width'), height: numOf(this, 'height') };
    }
    if (tag === 'circle') {
      const r = numOf(this, 'r');
      return { x: numOf(this, 'cx') - r, y: numOf(this, 'cy') - r, width: 2 * r, height: 2 * r };
    }
    if (tag === 'text') {
      const fs = numOf(this, 'font-size', 2.8);
      return { x: numOf(this, 'x'), y: numOf(this, 'y') - fs, width: estimateTextWidth(this.textContent ?? '', fs), height: fs * 1.2 };
    }
    return { x: 0, y: 0, width: 0, height: 0 };
  };

  proto.getComputedTextLength = function (this: {
    textContent?: string;
    getAttribute?: (n: string) => string | null;
  }) {
    const fs = numOf(this, 'font-size', 2.8);
    return estimateTextWidth(this.textContent ?? '', fs);
  };

  for (const m of ['getCTM', 'getScreenCTM']) {
    if (typeof proto[m] !== 'function') {
      proto[m] = function () {
        return null;
      };
    }
  }
}
