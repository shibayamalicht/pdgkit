import { describe, expect, it } from 'vitest';
import { parse } from '../src/core/parser';
import { PATTERN_SOURCE, type PatternId } from '../src/core/patterns';
import type { DiagramKind } from '../src/core/types';

const EXPECTED_KIND: Record<PatternId, DiagramKind> = {
  cond: 'flow',
  container: 'block',
  external: 'block',
  seq: 'seq',
  state: 'state',
  bidir: 'seq',
  hierarchy: 'block',
  pipeline: 'flow',
  parallel: 'flow',
  handshake: 'seq',
  state_with_cond: 'flow',
  system: 'block',
};

describe('GUI patterns', () => {
  for (const id of Object.keys(PATTERN_SOURCE) as PatternId[]) {
    it(`parses cleanly: ${id}`, () => {
      const doc = parse(PATTERN_SOURCE[id]);
      const errors = doc.diagnostics.filter(d => d.severity === 'error');

      expect(errors, `Errors found in ${id}: ${JSON.stringify(errors)}`).toHaveLength(0);
      expect(doc.kind).toBe(EXPECTED_KIND[id]);
    });
  }

  it('uses a decision node in the state decision flow pattern', () => {
    const doc = parse(PATTERN_SOURCE.state_with_cond);
    const decision = doc.nodes.get('S120');

    expect(decision?.label.ja).toBe('OK?');
    expect(doc.kind).toBe('flow');
  });
});
