import { describe, expect, it } from 'vitest';
import { parse, splitBilingual, stripComment } from '../src/core/parser';

describe('PatentDSL parser', () => {
  it('parses a definition', () => {
    const d = parse('10 = 制御装置 / control device');
    expect(d.diagnostics.filter(x => x.severity === 'error')).toHaveLength(0);
    const n = d.nodes.get('10')!;
    expect(n.label.ja).toBe('制御装置');
    expect(n.label.en).toBe('control device');
    expect(n.implicit).toBe(false);
  });

  it('parses definition with quoted slash', () => {
    const d = parse('13 = "I/O" / "I/O interface"');
    expect(d.nodes.get('13')!.label.ja).toBe('I/O');
    expect(d.nodes.get('13')!.label.en).toBe('I/O interface');
  });

  it('parses containment', () => {
    const d = parse(`
10 = A
11 = B
12 = C
10 : 11 12
`);
    expect(d.containments).toHaveLength(1);
    expect(d.containments[0].parent).toBe('10');
    expect(d.containments[0].children).toEqual(['11', '12']);
    expect(d.kind).toBe('block');
  });

  it('parses each connection operator', () => {
    const d = parse(`
1 = A
2 = B
1 - 2
1 -> 2
1 .. 2
1 .> 2
1 => 2
1 <-> 2
`);
    expect(d.edges.map(e => e.op)).toEqual([
      'line', 'arrow', 'dashed', 'dashed-arrow', 'thick', 'bidir',
    ]);
  });

  it('swaps endpoints for reverse arrow', () => {
    const d = parse(`
1 = A
2 = B
1 <- 2
`);
    expect(d.edges).toHaveLength(1);
    expect(d.edges[0].from).toBe('2');
    expect(d.edges[0].to).toBe('1');
    expect(d.edges[0].op).toBe('arrow');
  });

  it('parses edge with bilingual label', () => {
    const d = parse(`
1 = A
2 = B
1 -> 2 : 信号 / signal
`);
    expect(d.edges[0].label?.ja).toBe('信号');
    expect(d.edges[0].label?.en).toBe('signal');
  });

  it('infers flow when label ends with ?', () => {
    const d = parse(`
A = 開始
B = 条件?
A -> B
`);
    expect(d.kind).toBe('flow');
  });

  it('infers state when * appears', () => {
    const d = parse(`
S1 = 待機
* -> S1
S1 -> *
`);
    expect(d.kind).toBe('state');
    expect(d.nodes.has('*')).toBe(true);
  });

  it('infers seq when there is a bidirectional pair (round-trip)', () => {
    const d = parse(`
A = X
B = Y
A -> B : msg
B -> A : reply
`);
    expect(d.kind).toBe('seq');
  });

  it('infers seq when <-> operator is used', () => {
    const d = parse(`
A = X
B = Y
A <-> B : comm
`);
    expect(d.kind).toBe('seq');
  });

  it('infers flow for linear pipeline (one-way only)', () => {
    const d = parse(`
S100 = 入力
S110 = 処理
S120 = 出力
S100 -> S110
S110 -> S120
`);
    expect(d.kind).toBe('flow');
  });

  it('strips comments', () => {
    expect(stripComment('10 = A # comment')).toBe('10 = A ');
    expect(stripComment('10 = "A#B" # real comment')).toBe('10 = "A#B" ');
  });

  it('splits bilingual outside quotes', () => {
    expect(splitBilingual('制御 / control')).toEqual({ ja: '制御', en: 'control' });
    expect(splitBilingual('"a/b" / "c"')).toEqual({ ja: 'a/b', en: 'c' });
    expect(splitBilingual('A/D変換部 / A/D converter')).toEqual({
      ja: 'A/D変換部',
      en: 'A/D converter',
    });
    expect(splitBilingual('one only')).toEqual({ ja: 'one only' });
  });

  it('keeps slash terms inside unquoted Japanese labels', () => {
    const d = parse('30 = A/D変換部 / A/D converter');

    expect(d.nodes.get('30')!.label).toEqual({
      ja: 'A/D変換部',
      en: 'A/D converter',
    });
  });

  it('auto-creates implicit nodes from connections', () => {
    const d = parse('1 -> 2');
    expect(d.nodes.get('1')?.implicit).toBe(true);
    expect(d.nodes.get('2')?.implicit).toBe(true);
  });
});
