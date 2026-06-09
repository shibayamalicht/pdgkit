import { describe, expect, it } from 'vitest';
import { renderToSvg } from '../src/node/svg';
import { SAMPLES, SAMPLE_ORDER } from '../src/core/samples';

const BLOCK = `10 = 制御装置 / control device
11 = CPU
12 = メモリ / memory
10 : 11 12
11 - 12`;

describe('renderToSvg', () => {
  it('produces a standalone SVG document with an XML declaration', () => {
    const { svg } = renderToSvg(BLOCK);
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).toContain('<svg');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="');
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('reports the inferred diagram kind and positive display dimensions', () => {
    const r = renderToSvg(BLOCK);
    expect(r.kind).toBe('block');
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
    expect(r.viewBox.width).toBeGreaterThan(0);
  });

  it('crops to a smaller box than the full canvas by default', () => {
    const cropped = renderToSvg(BLOCK, { crop: true });
    const full = renderToSvg(BLOCK, { crop: false });
    // cropping trims the layout margin, so the cropped viewBox starts after 0,0
    expect(cropped.viewBox.minX).toBeGreaterThan(full.viewBox.minX - 0.001);
    expect(cropped.viewBox.width).toBeLessThanOrEqual(full.viewBox.width);
  });

  it('escapes XML special characters in label text', () => {
    const { svg } = renderToSvg('10 = "A < B & C"');
    expect(svg).toContain('&lt;');
    expect(svg).toContain('&amp;');
    expect(svg).not.toContain('A < B & C');
  });

  it('emits both languages in bilingual mode', () => {
    const src = '10 = 制御装置 / control device\n20 = 外部 / external\n10 -> 20';
    const { svg } = renderToSvg(src, { lang: 'both' });
    expect(svg).toContain('制御装置');
    expect(svg).toContain('control device');
  });

  it('renders every built-in sample without throwing and matches its kind', () => {
    for (const id of SAMPLE_ORDER) {
      const { svg, kind } = renderToSvg(SAMPLES[id].source);
      expect(svg, id).toContain('<svg');
      expect(svg.length, id).toBeGreaterThan(100);
      expect(['block', 'flow', 'state', 'seq'], id).toContain(kind);
    }
  });

  it('produces a deterministic result for the same input', () => {
    expect(renderToSvg(BLOCK).svg).toBe(renderToSvg(BLOCK).svg);
  });
});
