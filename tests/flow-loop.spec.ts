import { describe, expect, it } from 'vitest';
import { layout, type Box, type LaidOutEdge } from '../src/core/layout';
import { parse } from '../src/core/parser';
import { PATTERN_SOURCE } from '../src/core/patterns';

const EPS = 0.001;

describe('flow/state feedback routing', () => {
  it('routes a flow retry edge out to a side lane, clear of the forward chain', () => {
    const src = `S100 = 入力 / Input
S110 = 認証 / Authenticate
D1 = 成功? / Success?
S200 = ホーム / Home
S100 -> S110
S110 -> D1
D1 -> S200 : Yes
D1 -> S100 : No`;
    const laid = layout(parse(src));
    const back = edgeBetween(laid.edges, 'D1', 'S100');
    const forwardDown = edgeBetween(laid.edges, 'D1', 'S200');
    const rightLimit = nodeRightLimit(laid.nodes);

    // The loop-back bends out past every node; the forward edge stays inside.
    expect(maxX(back)).toBeGreaterThan(rightLimit + EPS);
    expect(maxX(forwardDown)).toBeLessThanOrEqual(rightLimit + EPS);
    expect(back.points.length).toBeGreaterThanOrEqual(4);

    // It must not run through any node it does not touch (notably S110), which is
    // the original bug: a straight back-edge overlapping the forward column.
    for (const n of laid.nodes) {
      if (n.id === 'D1' || n.id === 'S100') continue;
      expect(routeIntersectsBox(back.points, n, 0.5), `back crosses ${n.id}`).toBe(false);
    }

    // It re-enters the target from the side, and the canvas grows to fit the lane.
    const s100 = laid.nodes.find(n => n.id === 'S100')!;
    expect(back.points.at(-1)![0]).toBeCloseTo(s100.x + s100.w, 3);
    expect(laid.width).toBeGreaterThanOrEqual(maxX(back));
  });

  it('nests flow feedback lanes so the longer loop stays outside the shorter', () => {
    const src = `S100 = 入力 / Input
S110 = 処理 / Process
S120 = 検証? / Verify?
S130 = 完了 / Done
S100 -> S110
S110 -> S120
S120 -> S130 : OK
S120 -> S110 : NG
S130 -> S100 : next`;
    const laid = layout(parse(src));
    const shortLoop = edgeBetween(laid.edges, 'S120', 'S110'); // spans one rank
    const longLoop = edgeBetween(laid.edges, 'S130', 'S100'); // spans three ranks
    const rightLimit = nodeRightLimit(laid.nodes);

    expect(maxX(shortLoop)).toBeGreaterThan(rightLimit + EPS);
    expect(maxX(longLoop)).toBeGreaterThan(maxX(shortLoop) + EPS);
  });

  it('routes a state back-transition on a side lane (no spurious bidirectional look)', () => {
    const laid = layout(parse(PATTERN_SOURCE.state));
    const back = edgeBetween(laid.edges, 'S2', 'S1');
    const forward = edgeBetween(laid.edges, 'S1', 'S2');
    const rightLimit = nodeRightLimit(laid.nodes);

    expect(maxX(back)).toBeGreaterThan(rightLimit + EPS);
    expect(maxX(forward)).toBeLessThanOrEqual(rightLimit + EPS);
    // The two directions occupy different lanes instead of overlapping.
    expect(maxX(back) - maxX(forward)).toBeGreaterThan(1);
  });
});

function edgeBetween(edges: LaidOutEdge[], from: string, to: string): LaidOutEdge {
  const edge = edges.find(e => e.from === from && e.to === to);
  expect(edge, `edge ${from}->${to}`).toBeDefined();
  return edge!;
}

function maxX(edge: LaidOutEdge): number {
  return Math.max(...edge.points.map(p => p[0]));
}

function nodeRightLimit(nodes: { x: number; w: number }[]): number {
  return Math.max(...nodes.map(n => n.x + n.w));
}

function routeIntersectsBox(points: [number, number][], box: Box, pad: number): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    if (segmentOverlapsBox(points[i], points[i + 1], box, pad)) return true;
  }
  return false;
}

function segmentOverlapsBox(
  a: [number, number],
  b: [number, number],
  box: Box,
  pad: number,
): boolean {
  const left = box.x - pad;
  const right = box.x + box.w + pad;
  const top = box.y - pad;
  const bottom = box.y + box.h + pad;
  if (Math.abs(a[0] - b[0]) < EPS) {
    const x = a[0];
    if (x <= left || x >= right) return false;
    return Math.min(a[1], b[1]) < bottom && Math.max(a[1], b[1]) > top;
  }
  if (Math.abs(a[1] - b[1]) < EPS) {
    const y = a[1];
    if (y <= top || y >= bottom) return false;
    return Math.min(a[0], b[0]) < right && Math.max(a[0], b[0]) > left;
  }
  return false;
}
