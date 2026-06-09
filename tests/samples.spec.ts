import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse } from '../src/core/parser';
import { renderToSvg } from '../src/node/svg';
import { SAMPLE_ORDER, SAMPLES, type SampleId } from '../src/core/samples';
import type { DiagramKind } from '../src/core/types';

const EXAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples');
const EXAMPLE_FILES = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.pdg')).sort();

const EXPECTED_KIND: Record<SampleId, DiagramKind> = {
  block: 'block',
  system: 'block',
  iot: 'block',
  imagePipeline: 'flow',
  controlLoop: 'block',
  flow: 'flow',
  state: 'state',
  seq: 'seq',
  handshake: 'seq',
};

describe('built-in samples', () => {
  it('keeps the selector order in sync with the sample map', () => {
    expect(new Set(SAMPLE_ORDER)).toEqual(new Set(Object.keys(SAMPLES)));
  });

  for (const id of SAMPLE_ORDER) {
    it(`parses cleanly: ${id}`, () => {
      const doc = parse(SAMPLES[id].source);
      const errors = doc.diagnostics.filter(d => d.severity === 'error');

      expect(errors, `Errors found in ${id}: ${JSON.stringify(errors)}`).toHaveLength(0);
      expect(doc.nodes.size).toBeGreaterThan(0);
      expect(doc.kind).toBe(EXPECTED_KIND[id]);
    });
  }

  it('ships at least the nine canonical example files', () => {
    expect(EXAMPLE_FILES.length).toBeGreaterThanOrEqual(9);
  });

  for (const file of EXAMPLE_FILES) {
    it(`parses and renders example: ${file}`, () => {
      const source = readFileSync(join(EXAMPLES_DIR, file), 'utf8');
      const doc = parse(source);
      const errors = doc.diagnostics.filter(d => d.severity === 'error');

      expect(errors, `Errors found in ${file}: ${JSON.stringify(errors)}`).toHaveLength(0);
      expect(doc.nodes.size).toBeGreaterThan(0);

      // end-to-end: the example must render to a non-trivial SVG document
      const { svg } = renderToSvg(source);
      expect(svg, file).toContain('<svg');
      expect(svg.length, file).toBeGreaterThan(100);
    });
  }
});
