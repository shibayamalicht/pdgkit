import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToSvg, validate, toSvgString, VERSION } from '../src/browser';

const pkgVersion = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version as string;

afterEach(() => {
  // ensure no ambient document leaks between tests
  delete (globalThis as { document?: unknown }).document;
});

describe('browser entry', () => {
  it('exposes a version and renders SVG', () => {
    expect(VERSION).toBe(pkgVersion);
    const { svg, kind } = renderToSvg('10 = A\n11 = B\n10 : 11');
    expect(svg).toContain('<svg');
    expect(kind).toBe('block');
    expect(toSvgString('10 = A\n11 = B\n10 -> 11')).toContain('<svg');
  });

  it('validates source', () => {
    const r = validate('#! kind: flow\nS1 = 開始\nS2 = 終了\nS1 -> S2');
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('flow');
  });

  it('does not use, and restores, a pre-existing ambient document (browser safety)', () => {
    const dummy = {
      createElementNS() {
        throw new Error('ambient document must not be used');
      },
    };
    (globalThis as { document?: unknown }).document = dummy;

    const { svg } = renderToSvg('10 = テスト / test\n20 = 外部\n10 -> 20 : 信号');
    expect(svg).toContain('<svg');
    expect(svg).toContain('テスト');
    // the page's real document is left intact
    expect((globalThis as { document?: unknown }).document).toBe(dummy);
  });

  it('escapes XML special characters', () => {
    const { svg } = renderToSvg('10 = "A < B & C"');
    expect(svg).toContain('&lt;');
    expect(svg).toContain('&amp;');
    expect(svg).not.toContain('A < B & C');
  });
});
