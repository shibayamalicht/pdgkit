import { describe, expect, it } from 'vitest';
import { validate } from '../src/node/validate';
import { SAMPLES, SAMPLE_ORDER } from '../src/core/samples';

describe('validate', () => {
  it('accepts a clean block diagram', () => {
    const r = validate('10 = 制御装置\n11 = CPU\n10 : 11\n10 - 11');
    expect(r.ok).toBe(true);
    expect(r.kind).toBe('block');
    expect(r.counts.errors).toBe(0);
  });

  it('treats every built-in sample as valid', () => {
    for (const id of SAMPLE_ORDER) {
      const r = validate(SAMPLES[id].source);
      expect(r.ok, `${id}: ${JSON.stringify(r.diagnostics)}`).toBe(true);
    }
  });

  it('passes a matching kind assertion', () => {
    const r = validate('#! kind: block\n10 = A\n11 = B\n10 : 11');
    expect(r.declaredKind).toBe('block');
    expect(r.kindMatches).toBe(true);
    expect(r.ok).toBe(true);
  });

  it('flags a mismatched kind assertion as an error', () => {
    // declares block, but with no containment and a `?` label it infers flow
    const r = validate('#! kind: block\nS1 = 条件? \nS2 = 次\nS1 -> S2');
    expect(r.declaredKind).toBe('block');
    expect(r.kind).toBe('flow');
    expect(r.kindMatches).toBe(false);
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.message.includes('図種アサーション不一致'))).toBe(true);
  });

  it('accepts looser directive spellings', () => {
    expect(validate('# pdgkit: kind = flow\nA -> B').declaredKind).toBe('flow');
    expect(validate('# kind seq\nA <-> B').declaredKind).toBe('seq');
  });

  it('hints on chained-arrow syntax', () => {
    const r = validate('A -> B -> C');
    expect(r.ok).toBe(false); // parser emits 構文不明
    expect(r.diagnostics.some((d) => d.message.includes('連鎖記法'))).toBe(true);
  });

  it('hints on operators without surrounding spaces', () => {
    const r = validate('11-12');
    expect(r.diagnostics.some((d) => d.message.includes('半角スペース'))).toBe(true);
  });

  it('surfaces parser redefinition warnings', () => {
    const r = validate('10 = A\n10 = B');
    expect(r.counts.warnings).toBeGreaterThanOrEqual(1);
    expect(r.ok).toBe(true); // warnings do not fail validation
  });
});
