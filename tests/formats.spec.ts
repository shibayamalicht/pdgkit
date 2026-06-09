import { describe, expect, it } from 'vitest';
import { renderToPng, renderToJpeg } from '../src/node/raster';
import { renderToPdf } from '../src/node/pdf';
import { renderToPptx } from '../src/node/pptx';
import { unzipSync } from 'fflate';

const SRC = `10 = 制御装置 / control device
11 = CPU
12 = メモリ / memory
10 : 11 12
11 - 12
13 -> 20 : 信号 / signal
20 = 外部機器 / external device`;

const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const isPdf = (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF
const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b;

describe('raster output', () => {
  it('renders a PNG with the embedded font', { timeout: 60000 }, async () => {
    const png = await renderToPng(SRC, { lang: 'ja', scale: 2 });
    expect(isPng(png)).toBe(true);
    expect(png.length).toBeGreaterThan(1000);
  });

  it('renders a JPEG', { timeout: 60000 }, async () => {
    const jpg = await renderToJpeg(SRC, { lang: 'ja', scale: 2 });
    expect(isJpeg(jpg)).toBe(true);
    expect(jpg.length).toBeGreaterThan(1000);
  });
});

describe('pdf output', () => {
  it('renders a vector PDF (svg2pdf under jsdom)', { timeout: 120000 }, async () => {
    const pdf = await renderToPdf(SRC, { lang: 'ja', vector: true });
    expect(isPdf(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('renders a raster-fallback PDF', { timeout: 60000 }, async () => {
    const pdf = await renderToPdf(SRC, { lang: 'ja', vector: false, scale: 2 });
    expect(isPdf(pdf)).toBe(true);
  });
});

describe('pptx output', () => {
  it('renders an image PPTX that is a valid OOXML package', { timeout: 60000 }, async () => {
    const pptx = await renderToPptx(SRC, { lang: 'ja', scale: 2 });
    expect(isZip(pptx)).toBe(true);
    const files = unzipSync(pptx);
    expect(Object.keys(files)).toContain('ppt/slides/slide1.xml');
    expect(Object.keys(files)).toContain('ppt/media/image1.png');
    expect(Object.keys(files)).toContain('[Content_Types].xml');
  });

  it('renders an editable PPTX with shapes and connectors', { timeout: 60000 }, async () => {
    const pptx = await renderToPptx(SRC, { lang: 'ja', editable: true });
    expect(isZip(pptx)).toBe(true);
    const files = unzipSync(pptx);
    const slide = new TextDecoder().decode(files['ppt/slides/slide1.xml']);
    expect(slide).toContain('<p:sp>'); // shapes (rects/text)
    expect(slide).toContain('<p:cxnSp>'); // connectors (edges)
    expect(files['ppt/media/image1.png']).toBeUndefined(); // no embedded image
  });
});
