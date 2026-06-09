import type { Bilingual, Doc, Edge, EdgeOp } from './types';

export type Box = { x: number; y: number; w: number; h: number };

export type Shape = 'box' | 'round' | 'diamond' | 'circle' | 'actor';

export type LaidOutNode = Box & {
  id: string;
  label: Bilingual;
  shape: Shape;
  isContainer: boolean;
};

export type LaidOutEdge = {
  from: string;
  to: string;
  points: [number, number][];
  label?: Bilingual;
  op: EdgeOp;
  isLifeline?: boolean;
};

export type LaidOut = {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  width: number;
  height: number;
  kind: Doc['kind'];
};

type RouteObstacle = Box & { id: string; isContainer: boolean };
type RouteSide = 'right' | 'left' | 'bottom' | 'top';
type RoutePort = { point: [number, number]; side: RouteSide; offsetPenalty: number };
type ChildArrangement = 'stack' | 'grid';
type BlockRoutePlan = {
  edge: Edge;
  index: number;
  routeA?: Box;
  routeB?: Box;
  endpointBoundaries: Box[];
  endpointInteriorBarriers: Box[];
  bounds?: Box;
};
type ArrowGuardObstacle = RouteObstacle & {
  edgeIndex: number;
  edgeFrom: string;
  edgeTo: string;
};
type EdgeGuardObstacle = RouteObstacle & {
  edgeIndex: number;
  edgeOp: EdgeOp;
  orientation: 'vertical' | 'horizontal';
};

const NODE_W = 36;
const NODE_H = 14;
const PAD = 8;
const GRID_GAP = 24;
const TITLE_H = 5;
const PARENT_EDGE_LANE_H = 14;
const MARGIN = 8;
const ROOT_GAP = MARGIN * 4;
const ROUTE_GAP = PAD * 1.5;
const OBSTACLE_PAD = 0.8;
const BORDER_CLEARANCE = 4.0;
const ARROW_TERMINAL_CLEARANCE = 4.6;
const THICK_ARROW_TERMINAL_CLEARANCE = 5.4;
const VERTICAL_PORT_RATIO = 0.25;
const PORT_STUB = 6;
const MAX_ROUTE_LANES = 18;
const LOOP_LANE_GAP = 10;
const LOOP_LANE_STEP = 7;
const EPS = 0.001;

export function layout(doc: Doc): LaidOut {
  switch (doc.kind) {
    case 'block': return layoutBlock(doc);
    case 'flow':  return layoutFlow(doc);
    case 'state': return layoutState(doc);
    case 'seq':   return layoutSeq(doc);
  }
}

function layoutBlock(doc: Doc): LaidOut {
  const childMap = new Map<string, string[]>();
  for (const c of doc.containments) childMap.set(c.parent, c.children);
  const parentMap = new Map<string, string>();
  for (const c of doc.containments) {
    for (const child of c.children) parentMap.set(child, c.parent);
  }
  const childIds = new Set<string>();
  for (const cs of childMap.values()) for (const c of cs) childIds.add(c);
  const allIds = [...doc.nodes.keys()];
  const roots = allIds.filter(id => !childIds.has(id));

  const placed: LaidOutNode[] = [];
  const positions = new Map<string, Box>();

  function size(id: string): { w: number; h: number } {
    const children = childMap.get(id);
    if (!children || children.length === 0) return { w: NODE_W, h: NODE_H };
    const sizes = children.map(size);
    if (arrangementOf(id) === 'grid') {
      const cols = gridColsOf(id, children);
      const colW = Math.max(...sizes.map(s => s.w));
      const rowHeights = gridRowHeights(sizes, cols);
      return {
        w: cols * colW + 2 * PAD + (cols - 1) * GRID_GAP,
        h: titleHeightOf(id)
          + rowHeights.reduce((sum, h) => sum + h, 0)
          + 2 * PAD
          + Math.max(0, rowHeights.length - 1) * GRID_GAP,
      };
    }
    const maxW = Math.max(...sizes.map(s => s.w));
    const totH = sizes.reduce((a, b) => a + b.h, 0);
    return {
      w: maxW + 2 * PAD,
      h: titleHeightOf(id) + totH + 2 * PAD + (children.length - 1) * GRID_GAP,
    };
  }

  function arrangementOf(id: string): ChildArrangement {
    const children = childMap.get(id);
    if (!children || children.length <= 2) return 'stack';
    if (hasParentToChildEdges(id, children)) return 'grid';
    return hasLinearChildFlow(children, doc.edges, childMap) ? 'stack' : 'grid';
  }

  function gridColsOf(id: string, children: string[]): number {
    if (hasParentToChildEdges(id, children)) return Math.min(children.length, 4);
    if (children.length >= 7) return 4;
    if (children.length >= 5) return 3;
    return 2;
  }

  function gridRowHeights(sizes: { w: number; h: number }[], cols: number): number[] {
    const rows = Math.ceil(sizes.length / cols);
    const heights: number[] = [];
    for (let row = 0; row < rows; row++) {
      const rowSizes = sizes.slice(row * cols, row * cols + cols);
      heights.push(Math.max(...rowSizes.map(s => s.h)));
    }
    return heights;
  }

  function titleHeightOf(id: string): number {
    const children = childMap.get(id);
    return children && hasParentToChildEdges(id, children)
      ? TITLE_H + PARENT_EDGE_LANE_H
      : TITLE_H;
  }

  function hasParentToChildEdges(id: string, children: string[]): boolean {
    return doc.edges.some(edge => (
      edge.from === id
      && children.some(child => child === edge.to || containsDescendant(child, edge.to, childMap))
    ));
  }

  function place(id: string, ox: number, oy: number): void {
    const s = size(id);
    positions.set(id, { x: ox, y: oy, w: s.w, h: s.h });
    const node = doc.nodes.get(id);
    const children = childMap.get(id);
    if (!children || children.length === 0) {
      placed.push({
        id, x: ox, y: oy, w: s.w, h: s.h,
        label: node?.label ?? {},
        shape: 'box',
        isContainer: false,
      });
      return;
    }
    const sizes = children.map(size);
    if (arrangementOf(id) === 'grid') {
      const cols = gridColsOf(id, children);
      const colW = Math.max(...sizes.map(s => s.w));
      const rowHeights = gridRowHeights(sizes, cols);
      const rowTops: number[] = [];
      let rowTop = oy + titleHeightOf(id) + PAD;
      for (let row = 0; row < rowHeights.length; row++) {
        rowTops[row] = rowTop;
        rowTop += rowHeights[row] + GRID_GAP;
      }
      for (let i = 0; i < children.length; i++) {
        const r = Math.floor(i / cols);
        const cc = i % cols;
        const cx = ox + PAD + cc * (colW + GRID_GAP) + (colW - sizes[i].w) / 2;
        const cy = rowTops[r] + (rowHeights[r] - sizes[i].h) / 2;
        place(children[i], cx, cy);
      }
      alignGridRows(children, sizes, rowHeights, rowTops, cols, childMap, doc.edges, positions, placed);
    } else {
      const maxW = Math.max(...sizes.map(s => s.w));
      let yy = oy + titleHeightOf(id) + PAD;
      for (let i = 0; i < children.length; i++) {
        const cx = ox + PAD + (maxW - sizes[i].w) / 2;
        place(children[i], cx, yy);
        yy += sizes[i].h + GRID_GAP;
      }
    }
    placed.push({
      id, x: ox, y: oy, w: s.w, h: s.h,
      label: node?.label ?? {},
      shape: 'box',
      isContainer: true,
    });
  }

  let cur = MARGIN;
  for (const r of roots) {
    const previousIds = new Set(positions.keys());
    place(r, cur, MARGIN);
    const subtreeIds = collectSubtreeIds(r, childMap);
    const dy = rootAlignmentDelta(r, subtreeIds, previousIds, doc.edges, positions);
    if (Math.abs(dy) >= EPS) shiftSubtree(subtreeIds, dy, positions, placed);
    const sz = size(r);
    cur += sz.w + ROOT_GAP;
  }

  const edges = makeBlockEdges(doc.edges, positions, placed, parentMap);

  placed.sort((a, b) => {
    if (a.isContainer !== b.isContainer) return a.isContainer ? -1 : 1;
    if (a.isContainer && b.isContainer) {
      const depthDiff = depthOf(a.id, parentMap) - depthOf(b.id, parentMap);
      if (depthDiff !== 0) return depthDiff;
      return b.w * b.h - a.w * a.h;
    }
    return a.y - b.y || a.x - b.x;
  });

  const boxes = [...positions.values()];
  const edgePoints = edges.flatMap(edge => edge.points);
  const maxBoxX = boxes.length ? Math.max(...boxes.map(b => b.x + b.w)) : MARGIN;
  const maxBoxY = boxes.length ? Math.max(...boxes.map(b => b.y + b.h)) : MARGIN;
  const maxEdgeX = edgePoints.length ? Math.max(...edgePoints.map(([x]) => x)) : MARGIN;
  const maxEdgeY = edgePoints.length ? Math.max(...edgePoints.map(([, y]) => y)) : MARGIN;
  const width = Math.max(maxBoxX, maxEdgeX) + MARGIN;
  const height = Math.max(maxBoxY, maxEdgeY) + MARGIN;
  return { nodes: placed, edges, width, height, kind: 'block' };
}

function layoutFlow(doc: Doc): LaidOut {
  const ids = [...doc.nodes.keys()];
  const { byRank } = computeRanks(doc);

  function shapeOf(id: string): Shape {
    const n = doc.nodes.get(id);
    const ja = n?.label.ja ?? '';
    const en = n?.label.en ?? '';
    if (ja.endsWith('?') || en.endsWith('?')) return 'diamond';
    const inc = doc.edges.filter(e => e.to === id).length;
    const out = doc.edges.filter(e => e.from === id).length;
    if (inc === 0 || out === 0) return 'round';
    return 'box';
  }

  const V_GAP = 14;
  const H_GAP = 10;
  const positions = new Map<string, Box>();
  const sortedRanks = [...byRank.keys()].sort((a, b) => a - b);
  let y = MARGIN;

  for (const r of sortedRanks) {
    const lane = byRank.get(r)!;
    const widths = lane.map(id => shapeOf(id) === 'diamond' ? NODE_W * 1.2 : NODE_W);
    const totalW = widths.reduce((a, b) => a + b, 0) + (lane.length - 1) * H_GAP;
    let x = MARGIN;
    const canvasW = Math.max(totalW + 2 * MARGIN, 200);
    x = (canvasW - totalW) / 2;
    for (let i = 0; i < lane.length; i++) {
      positions.set(lane[i], { x, y, w: widths[i], h: NODE_H });
      x += widths[i] + H_GAP;
    }
    y += NODE_H + V_GAP;
  }
  for (const id of ids) {
    if (!positions.has(id)) {
      positions.set(id, { x: MARGIN, y, w: NODE_W, h: NODE_H });
      y += NODE_H + V_GAP;
    }
  }

  const placed: LaidOutNode[] = [];
  for (const [id, b] of positions) {
    placed.push({
      id, ...b,
      label: doc.nodes.get(id)?.label ?? {},
      shape: shapeOf(id),
      isContainer: false,
    });
  }
  const edges = makeEdges(doc.edges, positions);
  const { width, height } = flowExtent(placed, edges);
  return { nodes: placed, edges, width, height, kind: 'flow' };
}

function layoutState(doc: Doc): LaidOut {
  const { byRank } = computeRanks(doc);
  function shapeOf(id: string): Shape {
    if (id === '*') return 'circle';
    return 'round';
  }
  const V_GAP = 14, H_GAP = 10;
  const positions = new Map<string, Box>();
  const sortedRanks = [...byRank.keys()].sort((a, b) => a - b);
  let y = MARGIN;
  for (const r of sortedRanks) {
    const lane = byRank.get(r)!;
    const widths = lane.map(id => shapeOf(id) === 'circle' ? 6 : NODE_W);
    const heights = lane.map(id => shapeOf(id) === 'circle' ? 6 : NODE_H);
    const totalW = widths.reduce((a, b) => a + b, 0) + (lane.length - 1) * H_GAP;
    const canvasW = Math.max(totalW + 2 * MARGIN, 200);
    let x = (canvasW - totalW) / 2;
    for (let i = 0; i < lane.length; i++) {
      positions.set(lane[i], { x, y: y + (NODE_H - heights[i]) / 2, w: widths[i], h: heights[i] });
      x += widths[i] + H_GAP;
    }
    y += NODE_H + V_GAP;
  }
  for (const id of doc.nodes.keys()) {
    if (!positions.has(id)) {
      positions.set(id, { x: MARGIN, y, w: NODE_W, h: NODE_H });
      y += NODE_H + V_GAP;
    }
  }
  const placed: LaidOutNode[] = [];
  for (const [id, b] of positions) {
    placed.push({
      id, ...b,
      label: doc.nodes.get(id)?.label ?? {},
      shape: shapeOf(id),
      isContainer: false,
    });
  }
  const edges = makeEdges(doc.edges, positions);
  const { width, height } = flowExtent(placed, edges);
  return { nodes: placed, edges, width, height, kind: 'state' };
}

function layoutSeq(doc: Doc): LaidOut {
  const seen = new Set<string>();
  const actors: string[] = [];
  for (const e of doc.edges) {
    for (const id of [e.from, e.to]) {
      if (!seen.has(id)) { seen.add(id); actors.push(id); }
    }
  }
  for (const id of doc.nodes.keys()) {
    if (!seen.has(id)) { seen.add(id); actors.push(id); }
  }
  const ACTOR_W = 40, ACTOR_H = 12, COL_GAP = 28, MSG_GAP = 12;

  const xOf = new Map<string, number>();
  const placed: LaidOutNode[] = [];
  let x = MARGIN;
  for (const id of actors) {
    xOf.set(id, x + ACTOR_W / 2);
    placed.push({
      id, x, y: MARGIN, w: ACTOR_W, h: ACTOR_H,
      label: doc.nodes.get(id)?.label ?? {},
      shape: 'actor',
      isContainer: false,
    });
    x += ACTOR_W + COL_GAP;
  }

  let y = MARGIN + ACTOR_H + MSG_GAP;
  const msgEdges: LaidOutEdge[] = [];
  for (const e of doc.edges) {
    const xa = xOf.get(e.from);
    const xb = xOf.get(e.to);
    if (xa === undefined || xb === undefined) continue;
    msgEdges.push({
      from: e.from, to: e.to,
      points: [[xa, y], [xb, y]],
      label: e.label,
      op: e.op,
    });
    y += MSG_GAP;
  }
  const lifelines: LaidOutEdge[] = actors.map(id => ({
    from: id, to: id,
    points: [[xOf.get(id)!, MARGIN + ACTOR_H], [xOf.get(id)!, y + MSG_GAP]],
    op: 'dashed',
    isLifeline: true,
  }));

  return {
    nodes: placed,
    edges: [...lifelines, ...msgEdges],
    width: x,
    height: y + MARGIN * 2,
    kind: 'seq',
  };
}

function computeRanks(doc: Doc): { byRank: Map<number, string[]> } {
  const ids = [...doc.nodes.keys()];
  const incoming = new Map<string, number>();
  for (const id of ids) incoming.set(id, 0);
  for (const e of doc.edges) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
  const outgoing = new Map<string, string[]>();
  for (const e of doc.edges) {
    if (!outgoing.has(e.from)) outgoing.set(e.from, []);
    outgoing.get(e.from)!.push(e.to);
  }

  let sources = ids.filter(id => incoming.get(id) === 0);
  if (sources.length === 0) {
    sources = ids.includes('*') ? ['*'] : (ids.length ? [ids[0]] : []);
  }

  const rank = new Map<string, number>();
  const visited = new Set<string>();
  for (const s of sources) {
    rank.set(s, 0);
    visited.add(s);
  }
  let frontier = [...sources];
  while (frontier.length) {
    const next: string[] = [];
    for (const n of frontier) {
      const r = rank.get(n)!;
      for (const m of outgoing.get(n) ?? []) {
        if (!visited.has(m)) {
          rank.set(m, r + 1);
          visited.add(m);
          next.push(m);
        }
      }
    }
    frontier = next;
  }
  let maxRank = 0;
  for (const r of rank.values()) if (r > maxRank) maxRank = r;
  for (const id of ids) {
    if (!visited.has(id)) {
      maxRank++;
      rank.set(id, maxRank);
      visited.add(id);
    }
  }

  const byRank = new Map<number, string[]>();
  for (const [id, r] of rank) {
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(id);
  }
  return { byRank };
}

function makeEdges(srcEdges: Edge[], positions: Map<string, Box>): LaidOutEdge[] {
  const boxes = [...positions.values()];
  const rightLimit = boxes.length ? Math.max(...boxes.map(b => b.x + b.w)) : MARGIN;

  // A feedback edge points back to an earlier rank (target above source). Routed
  // straight it overlaps the forward chain, so route it out to a dedicated side
  // lane on the right; larger spans take outer lanes so nested loops don't cross.
  const feedback = srcEdges
    .map((e, index) => ({ index, a: positions.get(e.from), b: positions.get(e.to) }))
    .filter((r): r is { index: number; a: Box; b: Box } =>
      !!r.a && !!r.b && r.b.y + r.b.h <= r.a.y + EPS)
    .sort((p, q) => feedbackSpan(p.a, p.b) - feedbackSpan(q.a, q.b));
  const laneOf = new Map<number, number>();
  feedback.forEach((r, nest) => laneOf.set(r.index, nest));

  return srcEdges.map((e, index): LaidOutEdge => {
    const a = positions.get(e.from);
    const b = positions.get(e.to);
    if (!a || !b) {
      return { from: e.from, to: e.to, points: [], label: e.label, op: e.op };
    }
    const nest = laneOf.get(index);
    const points = nest === undefined
      ? orthogonalRoute(a, b)
      : feedbackRoute(a, b, rightLimit + LOOP_LANE_GAP + nest * LOOP_LANE_STEP);
    return { from: e.from, to: e.to, points, label: e.label, op: e.op };
  });
}

function feedbackSpan(a: Box, b: Box): number {
  return (a.y + a.h / 2) - (b.y + b.h / 2);
}

/** Route a loop-back edge out to a vertical side lane and into the target's right side. */
function feedbackRoute(a: Box, b: Box, laneX: number): [number, number][] {
  const ay = a.y + a.h / 2;
  const by = b.y + b.h / 2;
  return [
    [a.x + a.w, ay],
    [laneX, ay],
    [laneX, by],
    [b.x + b.w, by],
  ];
}

function flowExtent(placed: LaidOutNode[], edges: LaidOutEdge[]): { width: number; height: number } {
  let maxX = MARGIN;
  let maxY = MARGIN;
  for (const n of placed) {
    if (n.x + n.w > maxX) maxX = n.x + n.w;
    if (n.y + n.h > maxY) maxY = n.y + n.h;
  }
  for (const e of edges) {
    for (const [x, y] of e.points) {
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { width: maxX + MARGIN, height: maxY + MARGIN };
}

function hasLinearChildFlow(
  children: string[],
  edges: Edge[],
  childMap: Map<string, string[]>,
): boolean {
  const childSet = new Set(children);
  const pairs = new Set<string>();
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const child of children) {
    incoming.set(child, 0);
    outgoing.set(child, 0);
  }

  for (const edge of edges) {
    const from = topChildFor(edge.from, childSet, childMap);
    const to = topChildFor(edge.to, childSet, childMap);
    if (!from || !to || from === to) continue;
    const key = `${from}|${to}`;
    if (pairs.has(key)) continue;
    pairs.add(key);
    outgoing.set(from, (outgoing.get(from) ?? 0) + 1);
    incoming.set(to, (incoming.get(to) ?? 0) + 1);
  }

  if (pairs.size < children.length - 1) return false;
  let starts = 0;
  let ends = 0;
  for (const child of children) {
    const inc = incoming.get(child) ?? 0;
    const out = outgoing.get(child) ?? 0;
    if (inc > 1 || out > 1) return false;
    if (inc === 0 && out === 1) starts++;
    if (inc === 1 && out === 0) ends++;
  }
  return starts === 1 && ends === 1;
}

function topChildFor(
  id: string,
  childSet: Set<string>,
  childMap: Map<string, string[]>,
): string | undefined {
  if (childSet.has(id)) return id;
  for (const child of childSet) {
    if (containsDescendant(child, id, childMap)) return child;
  }
  return undefined;
}

function containsDescendant(
  ancestor: string,
  id: string,
  childMap: Map<string, string[]>,
): boolean {
  const children = childMap.get(ancestor);
  if (!children) return false;
  for (const child of children) {
    if (child === id || containsDescendant(child, id, childMap)) return true;
  }
  return false;
}

function collectSubtreeIds(id: string, childMap: Map<string, string[]>): Set<string> {
  const ids = new Set<string>([id]);
  for (const child of childMap.get(id) ?? []) {
    for (const descendant of collectSubtreeIds(child, childMap)) ids.add(descendant);
  }
  return ids;
}

function alignGridRows(
  children: string[],
  sizes: { w: number; h: number }[],
  rowHeights: number[],
  rowTops: number[],
  cols: number,
  childMap: Map<string, string[]>,
  edges: Edge[],
  positions: Map<string, Box>,
  placed: LaidOutNode[],
): void {
  const rows = Math.ceil(children.length / cols);
  for (let row = 0; row < rows; row++) {
    const rowChildren = children.slice(row * cols, row * cols + cols);
    const rowTop = rowTops[row];
    const rowH = rowHeights[row];
    if (rowTop === undefined || rowH === undefined) continue;
    for (const child of rowChildren) {
      const childIndex = children.indexOf(child);
      const childSize = sizes[childIndex];
      if (!childSize || childSize.h >= rowH - EPS) continue;
      const subtreeIds = collectSubtreeIds(child, childMap);
      const siblingIds = new Set<string>();
      for (const sibling of rowChildren) {
        if (sibling === child) continue;
        for (const id of collectSubtreeIds(sibling, childMap)) siblingIds.add(id);
      }
      const deltas: number[] = [];
      for (const edge of edges) {
        const fromChild = subtreeIds.has(edge.from);
        const toChild = subtreeIds.has(edge.to);
        if (fromChild && siblingIds.has(edge.to)) {
          addWeightedDelta(
            deltas,
            centerY(positions.get(edge.to)) - centerY(positions.get(edge.from)),
            alignmentWeight(edge, false),
          );
        } else if (toChild && siblingIds.has(edge.from)) {
          addWeightedDelta(
            deltas,
            centerY(positions.get(edge.from)) - centerY(positions.get(edge.to)),
            alignmentWeight(edge, true),
          );
        }
      }
      if (deltas.length === 0) continue;
      deltas.sort((a, b) => a - b);
      const desired = deltas[Math.floor(deltas.length / 2)];
      const box = positions.get(child);
      if (!box) continue;
      const minDy = rowTop - box.y;
      const maxDy = rowTop + rowH - childSize.h - box.y;
      const dy = Math.min(maxDy, Math.max(minDy, desired));
      if (Math.abs(dy) >= EPS) shiftSubtree(subtreeIds, dy, positions, placed);
    }
  }
}

function rootAlignmentDelta(
  rootId: string,
  subtreeIds: Set<string>,
  previousIds: Set<string>,
  edges: Edge[],
  positions: Map<string, Box>,
): number {
  const deltas: number[] = [];
  for (const edge of edges) {
    const fromCurrent = subtreeIds.has(edge.from);
    const toCurrent = subtreeIds.has(edge.to);
    const fromPrevious = previousIds.has(edge.from);
    const toPrevious = previousIds.has(edge.to);

    if (fromCurrent && toPrevious) {
      addWeightedDelta(
        deltas,
        centerY(positions.get(edge.to)) - centerY(positions.get(edge.from)),
        alignmentWeight(edge, false),
      );
    } else if (toCurrent && fromPrevious) {
      addWeightedDelta(
        deltas,
        centerY(positions.get(edge.from)) - centerY(positions.get(edge.to)),
        alignmentWeight(edge, true),
      );
    }
  }

  if (deltas.length === 0) return 0;
  deltas.sort((a, b) => a - b);
  const desired = deltas[Math.floor(deltas.length / 2)];
  const root = positions.get(rootId);
  if (!root) return desired;
  return Math.max(MARGIN - root.y, desired);
}

function addWeightedDelta(deltas: number[], delta: number, weight: number): void {
  if (!Number.isFinite(delta)) return;
  for (let i = 0; i < weight; i++) deltas.push(delta);
}

function alignmentWeight(edge: Edge, currentIsTarget: boolean): number {
  const feedback = edge.op === 'dashed' || edge.op === 'dashed-arrow';
  return (feedback ? 1 : 3) + (currentIsTarget ? 1 : 0);
}

function centerY(box: Box | undefined): number {
  return box ? box.y + box.h / 2 : Number.NaN;
}

function shiftSubtree(
  ids: Set<string>,
  dy: number,
  positions: Map<string, Box>,
  placed: LaidOutNode[],
): void {
  for (const id of ids) {
    const box = positions.get(id);
    if (box) box.y += dy;
  }
  for (const node of placed) {
    if (ids.has(node.id)) node.y += dy;
  }
}

function makeBlockEdges(
  srcEdges: Edge[],
  positions: Map<string, Box>,
  obstacles: RouteObstacle[],
  parentMap: Map<string, string>,
): LaidOutEdge[] {
  const containerIds = new Set(obstacles.filter(o => o.isContainer).map(o => o.id));
  const plans = srcEdges.map((edge, index): BlockRoutePlan => {
    const a = positions.get(edge.from);
    const b = positions.get(edge.to);
    if (!a || !b) {
      return { edge, index, endpointBoundaries: [], endpointInteriorBarriers: [] };
    }
    const routeA = routeEndpointBox(edge.from, edge.to, positions, parentMap, containerIds) ?? a;
    const routeB = routeEndpointBox(edge.to, edge.from, positions, parentMap, containerIds) ?? b;
    const endpointBoundaries = [
      ...(routeA === a ? [] : [a]),
      ...(routeB === b ? [] : [b]),
    ];
    const endpointInteriorBarriers = [
      ...(isExternalContainerEndpoint(edge.from, edge.to, parentMap, containerIds) ? [a] : []),
      ...(isExternalContainerEndpoint(edge.to, edge.from, parentMap, containerIds) ? [b] : []),
    ];
    return {
      edge,
      index,
      routeA,
      routeB,
      endpointBoundaries,
      endpointInteriorBarriers,
      bounds: commonRoutingBounds(edge.from, edge.to, parentMap, positions),
    };
  });

  return routePlansSequentially(plans, obstacles, parentMap);
}

function routePlansSequentially(
  plans: BlockRoutePlan[],
  baseObstacles: RouteObstacle[],
  parentMap: Map<string, string>,
): LaidOutEdge[] {
  const routed: LaidOutEdge[] = [];
  for (const plan of plans) {
    const searchBox = routeSearchBox(plan);
    const routedArrowGuards = routed.flatMap((edge, index) => arrowGuardObstaclesFor(edge, index));
    const routedEdgeGuards = routed.flatMap((edge, index) => edgeGuardObstaclesFor(edge, index));
    const extraArrowGuards = routedArrowGuards.filter(guard => (
      guard.edgeIndex !== plan.index
      && !sharesRouteEndpoint(guard, plan.edge)
      && (!searchBox || boxesOverlap(searchBox, guard))
    ));
    const extraEdgeGuards = routedEdgeGuards.filter(guard => shouldUseEdgeGuard(guard, plan, searchBox));
    routed.push(routeBlockPlan(plan, [...baseObstacles, ...extraArrowGuards, ...extraEdgeGuards], parentMap));
  }
  return routed;
}

function routeBlockPlan(
  plan: BlockRoutePlan,
  obstacles: RouteObstacle[],
  parentMap: Map<string, string>,
): LaidOutEdge {
  const { edge, routeA, routeB } = plan;
  if (!routeA || !routeB) {
    return { from: edge.from, to: edge.to, points: [], label: edge.label, op: edge.op };
  }
  return {
    from: edge.from,
    to: edge.to,
    points: avoidObstaclesRoute(
      routeA,
      routeB,
      edge.from,
      edge.to,
      obstacles,
      parentMap,
      plan.bounds,
      plan.endpointBoundaries,
      plan.endpointInteriorBarriers,
      edge.op,
    ),
    label: edge.label,
    op: edge.op,
  };
}

function arrowGuardObstaclesFor(edge: LaidOutEdge, edgeIndex: number): ArrowGuardObstacle[] {
  if (edge.isLifeline || edge.points.length < 2) return [];
  const guards: ArrowGuardObstacle[] = [];
  if (hasEndArrow(edge.op)) {
    guards.push(makeArrowGuard(edge, edgeIndex, edge.points[edge.points.length - 1], 'end'));
  }
  if (edge.op === 'bidir') {
    guards.push(makeArrowGuard(edge, edgeIndex, edge.points[0], 'start'));
  }
  return guards;
}

function hasEndArrow(op: EdgeOp): boolean {
  return op !== 'line' && op !== 'dashed';
}

function makeArrowGuard(
  edge: LaidOutEdge,
  edgeIndex: number,
  tip: [number, number],
  side: 'start' | 'end',
): ArrowGuardObstacle {
  const half = edge.op === 'thick' ? 5.0 : 4.2;
  return {
    id: `__arrow_guard_${edgeIndex}_${side}`,
    x: tip[0] - half,
    y: tip[1] - half,
    w: half * 2,
    h: half * 2,
    isContainer: false,
    edgeIndex,
    edgeFrom: edge.from,
    edgeTo: edge.to,
  };
}

function sharesRouteEndpoint(guard: ArrowGuardObstacle, edge: Edge): boolean {
  return guard.edgeFrom === edge.from
    || guard.edgeFrom === edge.to
    || guard.edgeTo === edge.from
    || guard.edgeTo === edge.to;
}

function edgeGuardObstaclesFor(edge: LaidOutEdge, edgeIndex: number): EdgeGuardObstacle[] {
  if (edge.points.length < 2) return [];
  const guards: EdgeGuardObstacle[] = [];
  const clear = 2.2;
  const trim = 1.2;
  for (let i = 0; i < edge.points.length - 1; i++) {
    const a = edge.points[i];
    const b = edge.points[i + 1];
    const len = segmentLength(a, b);
    if (len <= trim * 2) continue;
    if (Math.abs(a[0] - b[0]) < EPS) {
      const y1 = Math.min(a[1], b[1]) + trim;
      const y2 = Math.max(a[1], b[1]) - trim;
      guards.push({
        id: `__edge_guard_${edgeIndex}_${i}`,
        x: a[0] - clear,
        y: y1,
        w: clear * 2,
        h: y2 - y1,
        isContainer: false,
        edgeIndex,
        edgeOp: edge.op,
        orientation: 'vertical',
      });
    } else if (Math.abs(a[1] - b[1]) < EPS) {
      const x1 = Math.min(a[0], b[0]) + trim;
      const x2 = Math.max(a[0], b[0]) - trim;
      guards.push({
        id: `__edge_guard_${edgeIndex}_${i}`,
        x: x1,
        y: a[1] - clear,
        w: x2 - x1,
        h: clear * 2,
        isContainer: false,
        edgeIndex,
        edgeOp: edge.op,
        orientation: 'horizontal',
      });
    }
  }
  return guards;
}

function shouldUseEdgeGuard(
  guard: EdgeGuardObstacle,
  plan: BlockRoutePlan,
  searchBox: Box | undefined,
): boolean {
  if (guard.edgeIndex === plan.index) return false;
  return !searchBox || boxesOverlap(searchBox, guard);
}

function routeSearchBox(plan: BlockRoutePlan): Box | undefined {
  if (!plan.routeA || !plan.routeB) return undefined;
  const left = Math.min(plan.routeA.x, plan.routeB.x);
  const top = Math.min(plan.routeA.y, plan.routeB.y);
  const right = Math.max(plan.routeA.x + plan.routeA.w, plan.routeB.x + plan.routeB.w);
  const bottom = Math.max(plan.routeA.y + plan.routeA.h, plan.routeB.y + plan.routeB.h);
  const pad = ROUTE_GAP * 4;
  const candidate = {
    x: left - pad,
    y: top - pad,
    w: right - left + pad * 2,
    h: bottom - top + pad * 2,
  };
  if (!plan.bounds) return candidate;
  return {
    x: Math.max(candidate.x, plan.bounds.x),
    y: Math.max(candidate.y, plan.bounds.y),
    w: Math.min(candidate.x + candidate.w, plan.bounds.x + plan.bounds.w) - Math.max(candidate.x, plan.bounds.x),
    h: Math.min(candidate.y + candidate.h, plan.bounds.y + plan.bounds.h) - Math.max(candidate.y, plan.bounds.y),
  };
}

function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w
    && a.x + a.w > b.x
    && a.y < b.y + b.h
    && a.y + a.h > b.y;
}

function routeEndpointBox(
  id: string,
  otherId: string,
  positions: Map<string, Box>,
  parentMap: Map<string, string>,
  containerIds: Set<string>,
): Box | undefined {
  const container = positions.get(id);
  const other = positions.get(otherId);
  if (!container || !other) return undefined;

  if (!isAncestorOf(id, otherId, parentMap)) {
    if (!containerIds.has(id)) return undefined;
    return container;
  }

  const left = container.x + PAD;
  const right = container.x + container.w - PAD;
  const top = container.y + TITLE_H + PAD / 2;
  const x = Math.min(right, Math.max(left, other.x + other.w / 2));
  return { x: x - 0.1, y: top - 0.1, w: 0.2, h: 0.2 };
}

function isExternalContainerEndpoint(
  id: string,
  otherId: string,
  parentMap: Map<string, string>,
  containerIds: Set<string>,
): boolean {
  return containerIds.has(id) && !isAncestorOf(id, otherId, parentMap);
}

function isAncestorOf(ancestor: string, id: string, parentMap: Map<string, string>): boolean {
  let cur = id;
  const seen = new Set<string>();
  while (parentMap.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = parentMap.get(cur)!;
    if (cur === ancestor) return true;
  }
  return false;
}

function depthOf(id: string, parentMap: Map<string, string>): number {
  let depth = 0;
  let cur = id;
  const seen = new Set<string>();
  while (parentMap.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = parentMap.get(cur)!;
    depth++;
  }
  return depth;
}

function avoidObstaclesRoute(
  a: Box,
  b: Box,
  from: string,
  to: string,
  obstacles: RouteObstacle[],
  parentMap: Map<string, string>,
  bounds?: Box,
  endpointBoundaries: Box[] = [],
  endpointInteriorBarriers: Box[] = [],
  op: EdgeOp = 'line',
  strictEdgeGuards = true,
): [number, number][] {
  const routedObstacles = obstacles.filter(o => o.id !== from && o.id !== to);
  const leafObstacles = routedObstacles.filter(o => !o.isContainer);
  const hardLeafObstacles = leafObstacles.filter(o => o.id.startsWith('__arrow_guard_'));
  const allowedContainers = allowedContainerIds(from, to, parentMap);
  const passableContainerObstacles = routedObstacles
    .filter(o => o.isContainer && allowedContainers.has(o.id));
  const blockedContainerObstacles = routedObstacles
    .filter(o => o.isContainer && !allowedContainers.has(o.id));
  const externalContainerObstacles = passableContainerObstacles.filter(o => (
    isAncestorOf(o.id, from, parentMap) !== isAncestorOf(o.id, to, parentMap)
  ));
  const boundaryObstacles = endpointBoundaries.map((box, index) => ({
    ...box,
    id: `__endpoint_boundary_${index}`,
    isContainer: true,
  }));
  const realLeafObstacles = leafObstacles.filter(o => !o.id.startsWith('__'));
  const edgeGuardObstacles = leafObstacles.filter(isEdgeGuardObstacle);
  const straight = preferredStraightRoute(a, b);
  if (
    straight
    && hasArrowTerminalClearance(straight, op)
    && (!bounds || routeFitsBounds(straight, bounds))
    && !routeIntersectsAnyInterior(straight, realLeafObstacles, OBSTACLE_PAD)
    && !routeIntersectsAnyInterior(straight, hardLeafObstacles, OBSTACLE_PAD)
    && (!strictEdgeGuards || !routeSharesAnyEdgeGuardLane(straight, edgeGuardObstacles))
    && !routeIntersectsAnyInterior(straight, blockedContainerObstacles, OBSTACLE_PAD)
    && !routeIntersectsAnyInterior(straight, endpointInteriorBarriers, 0)
    && !routeOverlapsAnyBorder(straight, [
      ...endpointBoundaries,
      ...passableContainerObstacles,
      ...blockedContainerObstacles,
    ], BORDER_CLEARANCE)
  ) {
    return straight;
  }
  const lanes = routeLanes(a, b, [...routedObstacles, ...boundaryObstacles], bounds);
  let best = orthogonalRoute(a, b);
  let bestScore = Number.POSITIVE_INFINITY;

  for (const start of portsOf(a)) {
    for (const end of portsOf(b)) {
      const sourcePort = start.point;
      const targetPort = end.point;
      const sp = portLeadPoint(start);
      const ep = portLeadPoint(end);
      const candidates: [number, number][][] = [
        [sourcePort, sp, [ep[0], sp[1]], ep, targetPort],
        [sourcePort, sp, [sp[0], ep[1]], ep, targetPort],
      ];
      if (Math.abs(sp[0] - ep[0]) < EPS || Math.abs(sp[1] - ep[1]) < EPS) {
        candidates.push([sourcePort, sp, ep, targetPort]);
      }
      for (const x of lanes.xs) {
        candidates.push([sourcePort, sp, [x, sp[1]], [x, ep[1]], ep, targetPort]);
      }
      for (const y of lanes.ys) {
        candidates.push([sourcePort, sp, [sp[0], y], [ep[0], y], ep, targetPort]);
      }
      for (const x of lanes.xs) {
        for (const y of lanes.ys) {
          candidates.push([sourcePort, sp, [x, sp[1]], [x, y], [ep[0], y], ep, targetPort]);
          candidates.push([sourcePort, sp, [sp[0], y], [x, y], [x, ep[1]], ep, targetPort]);
        }
      }

      for (const candidate of candidates) {
        const normalized = normalizeRoute(candidate);
        if (!isOrthogonalRoute(normalized)) continue;
        if (!hasArrowTerminalClearance(normalized, op)) continue;
        if (bounds && !routeFitsBounds(normalized, bounds)) continue;
        if (routeOverlapsAnyBorder(normalized, [a, b], 0)) continue;
        if (routeIntersectsAnyInterior(normalized, endpointInteriorBarriers, 0)) continue;
        if (routeIntersectsAnyInterior(normalized, realLeafObstacles, OBSTACLE_PAD)) continue;
        if (routeIntersectsAnyInterior(normalized, hardLeafObstacles, OBSTACLE_PAD)) continue;
        if (strictEdgeGuards && routeSharesAnyEdgeGuardLane(normalized, edgeGuardObstacles)) continue;
        if (routeIntersectsAnyInterior(normalized, blockedContainerObstacles, OBSTACLE_PAD)) continue;
        if (routeOverlapsAnyBorder(normalized, [
          ...endpointBoundaries,
          ...passableContainerObstacles,
          ...blockedContainerObstacles,
        ], BORDER_CLEARANCE)) continue;
        const score = scoreRoute(
          normalized,
          a,
          b,
          leafObstacles,
          blockedContainerObstacles,
          passableContainerObstacles,
          externalContainerObstacles,
          endpointBoundaries,
        )
          + portPairPenalty(a, b, start.side, end.side, op)
          + start.offsetPenalty
          + end.offsetPenalty;
        if (score < bestScore) {
          best = normalized;
          bestScore = score;
        }
      }
    }
  }

  if (bestScore === Number.POSITIVE_INFINITY) {
    if (strictEdgeGuards && edgeGuardObstacles.length > 0) {
      return avoidObstaclesRoute(
        a,
        b,
        from,
        to,
        obstacles,
        parentMap,
        bounds,
        endpointBoundaries,
        endpointInteriorBarriers,
        op,
        false,
      );
    }
    return orthogonalRoute(a, b);
  }
  return best;
}

function preferredStraightRoute(a: Box, b: Box): [number, number][] | undefined {
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;
  if (Math.abs(acy - bcy) < EPS) {
    if (a.x + a.w <= b.x) return [[a.x + a.w, acy], [b.x, bcy]];
    if (b.x + b.w <= a.x) return [[a.x, acy], [b.x + b.w, bcy]];
  }
  if (Math.abs(acx - bcx) < EPS) {
    if (a.y + a.h <= b.y) return [[acx, a.y + a.h], [bcx, b.y]];
    if (b.y + b.h <= a.y) return [[acx, a.y], [bcx, b.y + b.h]];
  }
  return undefined;
}

function hasArrowTerminalClearance(points: [number, number][], op: EdgeOp): boolean {
  if (points.length < 2) return false;
  if (op !== 'line' && op !== 'dashed') {
    if (terminalSegmentLength(points, false) < arrowTerminalClearance(op)) return false;
  }
  if (op === 'bidir') {
    if (terminalSegmentLength(points, true) < arrowTerminalClearance(op)) return false;
  }
  return true;
}

function terminalSegmentLength(points: [number, number][], atStart: boolean): number {
  if (points.length < 2) return 0;
  const a = atStart ? points[0] : points[points.length - 1];
  const b = atStart ? points[1] : points[points.length - 2];
  return segmentLength(a, b);
}

function arrowTerminalClearance(op: EdgeOp): number {
  return op === 'thick' ? THICK_ARROW_TERMINAL_CLEARANCE : ARROW_TERMINAL_CLEARANCE;
}

function routeIntersectsAnyInterior(
  points: [number, number][],
  boxes: Box[],
  pad: number,
): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    for (const box of boxes) {
      if (boxInteriorOverlap(points[i], points[i + 1], box, pad) > EPS) return true;
    }
  }
  return false;
}

function routeOverlapsAnyBorder(points: [number, number][], boxes: Box[], tolerance: number): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    for (const box of boxes) {
      if (boxBorderProximityOverlap(points[i], points[i + 1], box, tolerance) > EPS) return true;
    }
  }
  return false;
}

function routeSharesAnyEdgeGuardLane(points: [number, number][], guards: EdgeGuardObstacle[]): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    for (const guard of guards) {
      if (segmentSharesEdgeGuardLane(points[i], points[i + 1], guard)) return true;
    }
  }
  return false;
}

function segmentSharesEdgeGuardLane(
  a: [number, number],
  b: [number, number],
  guard: EdgeGuardObstacle,
): boolean {
  const segmentVertical = Math.abs(a[0] - b[0]) < EPS;
  const segmentHorizontal = Math.abs(a[1] - b[1]) < EPS;
  if (segmentVertical && guard.orientation === 'vertical') {
    const guardX = guard.x + guard.w / 2;
    if (Math.abs(a[0] - guardX) > guard.w / 2 + EPS) return false;
    return intervalOverlap(a[1], b[1], guard.y, guard.y + guard.h) > EPS;
  }
  if (segmentHorizontal && guard.orientation === 'horizontal') {
    const guardY = guard.y + guard.h / 2;
    if (Math.abs(a[1] - guardY) > guard.h / 2 + EPS) return false;
    return intervalOverlap(a[0], b[0], guard.x, guard.x + guard.w) > EPS;
  }
  return false;
}

function allowedContainerIds(from: string, to: string, parentMap: Map<string, string>): Set<string> {
  return new Set([from, to, ...ancestorsOf(from, parentMap), ...ancestorsOf(to, parentMap)]);
}

function portsOf(box: Box): RoutePort[] {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const xOffset = Math.min(box.w * 0.25, Math.max(3, box.w / 2 - 4));
  const yOffset = Math.min(box.h * 0.25, Math.max(2, box.h / 2 - 3));
  const sidePenalty = 9;
  return [
    { point: [box.x + box.w, cy], side: 'right', offsetPenalty: 0 },
    { point: [box.x, cy], side: 'left', offsetPenalty: 0 },
    { point: [cx, box.y + box.h], side: 'bottom', offsetPenalty: 0 },
    { point: [cx, box.y], side: 'top', offsetPenalty: 0 },
    { point: [box.x + box.w, cy - yOffset], side: 'right', offsetPenalty: sidePenalty },
    { point: [box.x + box.w, cy + yOffset], side: 'right', offsetPenalty: sidePenalty },
    { point: [box.x, cy - yOffset], side: 'left', offsetPenalty: sidePenalty },
    { point: [box.x, cy + yOffset], side: 'left', offsetPenalty: sidePenalty },
    { point: [cx - xOffset, box.y + box.h], side: 'bottom', offsetPenalty: sidePenalty },
    { point: [cx + xOffset, box.y + box.h], side: 'bottom', offsetPenalty: sidePenalty },
    { point: [cx - xOffset, box.y], side: 'top', offsetPenalty: sidePenalty },
    { point: [cx + xOffset, box.y], side: 'top', offsetPenalty: sidePenalty },
  ];
}

function portLeadPoint(port: RoutePort): [number, number] {
  const [x, y] = port.point;
  switch (port.side) {
    case 'right': return [x + PORT_STUB, y];
    case 'left': return [x - PORT_STUB, y];
    case 'bottom': return [x, y + PORT_STUB];
    case 'top': return [x, y - PORT_STUB];
  }
}

function portPairPenalty(source: Box, target: Box, start: RouteSide, end: RouteSide, op: EdgeOp): number {
  const sx = source.x + source.w / 2;
  const sy = source.y + source.h / 2;
  const tx = target.x + target.w / 2;
  const ty = target.y + target.h / 2;
  const dx = tx - sx;
  const dy = ty - sy;
  if (op === 'dashed') return dashedPortPairPenalty(start, end, dx, dy, source, target);
  return sourcePortPenalty(start, dx, dy, source) + targetPortPenalty(end, dx, dy, target);
}

function dashedPortPairPenalty(
  start: RouteSide,
  end: RouteSide,
  dx: number,
  dy: number,
  source: Box,
  target: Box,
): number {
  if (Math.abs(dy) > Math.min(source.h, target.h) * 0.8) {
    const startDesired = dy > 0 ? 'bottom' : 'top';
    const endDesired = dy > 0 ? 'top' : 'bottom';
    return dashedSidePenalty(start, startDesired) + dashedSidePenalty(end, endDesired);
  }
  if (Math.abs(dx) > Math.min(source.w, target.w) * 0.8) {
    const startDesired = dx > 0 ? 'right' : 'left';
    const endDesired = dx > 0 ? 'left' : 'right';
    return dashedSidePenalty(start, startDesired) + dashedSidePenalty(end, endDesired);
  }
  return 0;
}

function dashedSidePenalty(side: RouteSide, desired: RouteSide): number {
  if (side === desired) return 0;
  if (side === oppositeSide(desired)) return 1400;
  return 450;
}

function sourcePortPenalty(side: RouteSide, dx: number, dy: number, box: Box): number {
  if (Math.abs(dy) > box.h * 0.8 && Math.abs(dy) >= Math.abs(dx) * VERTICAL_PORT_RATIO) {
    const desired = dy > 0 ? 'bottom' : 'top';
    if (side === desired) return 0;
    return side === oppositeSide(desired) ? 800 : 180;
  }
  if (Math.abs(dx) > box.w * 0.5) {
    const desired = dx > 0 ? 'right' : 'left';
    if (side === desired) return 0;
    return side === oppositeSide(desired) ? 900 : 90;
  }
  if (Math.abs(dy) > box.h * 0.8) {
    const desired = dy > 0 ? 'bottom' : 'top';
    if (side === desired) return 0;
    return side === oppositeSide(desired) ? 600 : 120;
  }
  return 0;
}

function targetPortPenalty(side: RouteSide, dx: number, dy: number, box: Box): number {
  if (Math.abs(dy) > box.h * 0.8 && Math.abs(dy) >= Math.abs(dx) * VERTICAL_PORT_RATIO) {
    const desired = dy > 0 ? 'top' : 'bottom';
    if (side === desired) return 0;
    return side === oppositeSide(desired) ? 1400 : 360;
  }
  if (Math.abs(dx) > box.w * 0.5 && Math.abs(dx) >= Math.abs(dy) * 1.2) {
    const desired = dx > 0 ? 'left' : 'right';
    if (side === desired) return 0;
    return side === oppositeSide(desired) ? 1200 : 220;
  }
  if (Math.abs(dy) > box.h * 0.35) {
    const desired = dy > 0 ? 'top' : 'bottom';
    if (side === desired) return 0;
    return (side === 'left' || side === 'right') ? 9000 : 1200;
  }
  if (Math.abs(dx) > box.w * 0.5) {
    const desired = dx > 0 ? 'left' : 'right';
    if (side === desired) return 0;
    return side === oppositeSide(desired) ? 1000 : 160;
  }
  return 0;
}

function oppositeSide(side: RouteSide): RouteSide {
  switch (side) {
    case 'right': return 'left';
    case 'left': return 'right';
    case 'bottom': return 'top';
    case 'top': return 'bottom';
  }
}

function routeLanes(
  a: Box,
  b: Box,
  obstacles: RouteObstacle[],
  bounds?: Box,
): { xs: number[]; ys: number[] } {
  const boxes = [a, b, ...obstacles];
  const laneMargin = ROUTE_GAP * 2;
  const minX = bounds ? bounds.x : Math.max(MARGIN, Math.min(...boxes.map(o => o.x)) - laneMargin);
  const maxX = bounds ? bounds.x + bounds.w : Math.max(...boxes.map(o => o.x + o.w)) + laneMargin;
  const minY = bounds ? bounds.y : Math.max(MARGIN, Math.min(...boxes.map(o => o.y)) - laneMargin);
  const maxY = bounds ? bounds.y + bounds.h : Math.max(...boxes.map(o => o.y + o.h)) + laneMargin;
  const xs = [(a.x + a.w / 2 + b.x + b.w / 2) / 2];
  const ys = [(a.y + a.h / 2 + b.y + b.h / 2) / 2];

  for (const box of boxes) {
    for (const gap of [ROUTE_GAP, ROUTE_GAP * 1.5, ROUTE_GAP * 2]) {
      xs.push(box.x - gap, box.x + box.w + gap);
      ys.push(box.y - gap, box.y + box.h + gap);
    }
  }
  if (bounds) {
    xs.push(bounds.x, bounds.x + bounds.w);
    ys.push(bounds.y, bounds.y + bounds.h);
  }

  return {
    xs: limitRouteLanes(
      uniqueSorted(xs.filter(x => x >= minX && x <= maxX)),
      (a.x + a.w / 2 + b.x + b.w / 2) / 2,
    ),
    ys: limitRouteLanes(
      uniqueSorted(ys.filter(y => y >= minY && y <= maxY)),
      (a.y + a.h / 2 + b.y + b.h / 2) / 2,
    ),
  };
}

function limitRouteLanes(values: number[], anchor: number): number[] {
  if (values.length <= MAX_ROUTE_LANES) return values;
  const keep = new Set<number>([values[0], values[values.length - 1]]);
  for (const value of [...values].sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor))) {
    keep.add(value);
    if (keep.size >= MAX_ROUTE_LANES) break;
  }
  return [...keep].sort((a, b) => a - b);
}

function commonRoutingBounds(
  from: string,
  to: string,
  parentMap: Map<string, string>,
  positions: Map<string, Box>,
): Box | undefined {
  const common = nearestCommonAncestor(from, to, parentMap);
  if (!common) return undefined;
  const box = positions.get(common);
  if (!box) return undefined;
  const inset = ROUTE_GAP / 2;
  const top = box.y + TITLE_H + PAD / 2;
  const bottom = box.y + box.h - inset;
  return {
    x: box.x + inset,
    y: top,
    w: Math.max(0, box.w - inset * 2),
    h: Math.max(0, bottom - top),
  };
}

function nearestCommonAncestor(
  from: string,
  to: string,
  parentMap: Map<string, string>,
): string | undefined {
  const toAncestors = new Set(ancestorsOf(to, parentMap));
  return ancestorsOf(from, parentMap).find(id => toAncestors.has(id));
}

function ancestorsOf(id: string, parentMap: Map<string, string>): string[] {
  const out: string[] = [];
  let cur = id;
  const seen = new Set<string>();
  while (parentMap.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = parentMap.get(cur)!;
    out.push(cur);
  }
  return out;
}

function routeFitsBounds(points: [number, number][], bounds: Box): boolean {
  const right = bounds.x + bounds.w;
  const bottom = bounds.y + bounds.h;
  return points.every(([x, y]) => (
    x >= bounds.x - EPS
    && x <= right + EPS
    && y >= bounds.y - EPS
    && y <= bottom + EPS
  ));
}

function uniqueSorted(values: number[]): number[] {
  const seen = new Set<string>();
  const out: number[] = [];
  for (const value of values) {
    const rounded = Math.round(value * 1000) / 1000;
    const key = rounded.toFixed(3);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rounded);
  }
  return out.sort((a, b) => a - b);
}

function normalizeRoute(points: [number, number][]): [number, number][] {
  const deduped: [number, number][] = [];
  for (const point of points) {
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.abs(prev[0] - point[0]) >= EPS || Math.abs(prev[1] - point[1]) >= EPS) {
      deduped.push(point);
    }
  }

  const out: [number, number][] = [];
  for (const point of deduped) {
    out.push(point);
    while (out.length >= 3) {
      const a = out[out.length - 3];
      const b = out[out.length - 2];
      const c = out[out.length - 1];
      const sameX = Math.abs(a[0] - b[0]) < EPS && Math.abs(b[0] - c[0]) < EPS;
      const sameY = Math.abs(a[1] - b[1]) < EPS && Math.abs(b[1] - c[1]) < EPS;
      if (!sameX && !sameY) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

function isOrthogonalRoute(points: [number, number][]): boolean {
  if (points.length < 2) return false;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (Math.abs(a[0] - b[0]) >= EPS && Math.abs(a[1] - b[1]) >= EPS) return false;
  }
  return true;
}

function scoreRoute(
  points: [number, number][],
  source: Box,
  target: Box,
  leafObstacles: RouteObstacle[],
  blockedContainerObstacles: RouteObstacle[],
  passableContainerObstacles: RouteObstacle[],
  externalContainerObstacles: RouteObstacle[],
  endpointBoundaries: Box[],
): number {
  let score = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    score += segmentLength(a, b);
    const sourceInterior = boxInteriorOverlap(a, b, source, 0);
    if (sourceInterior > 0) score += 220000 + sourceInterior * 1500;
    const targetInterior = boxInteriorOverlap(a, b, target, 0);
    if (targetInterior > 0) score += 220000 + targetInterior * 1500;
    const sourceBorder = boxBorderOverlap(a, b, source);
    if (sourceBorder > 0) score += 8000 + sourceBorder * 120;
    const targetBorder = boxBorderOverlap(a, b, target);
    if (targetBorder > 0) score += 8000 + targetBorder * 120;
    for (const boundary of endpointBoundaries) {
      const overlap = boxBorderOverlap(a, b, boundary);
      if (overlap > 0) score += 12000 + overlap * 160;
    }
    for (const obstacle of leafObstacles) {
      const overlap = boxInteriorOverlap(a, b, obstacle, OBSTACLE_PAD);
      if (overlap > 0) score += leafObstaclePenalty(obstacle, a, b, overlap);
    }
    for (const obstacle of blockedContainerObstacles) {
      const overlap = boxInteriorOverlap(a, b, obstacle, OBSTACLE_PAD);
      if (overlap > 0) score += 180000 + overlap * 1200;
      const border = boxBorderOverlap(a, b, obstacle);
      if (border > 0) score += 18000 + border * 300;
    }
    for (const obstacle of passableContainerObstacles) {
      const titleOverlap = boxInteriorOverlap(a, b, containerTitleRoutingBand(obstacle), OBSTACLE_PAD);
      if (titleOverlap > 0) score += 14000 + titleOverlap * 120;
      const overlap = boxBorderOverlap(a, b, obstacle);
      if (overlap > 0) score += 6000 + overlap * 120;
    }
    for (const obstacle of externalContainerObstacles) {
      const overlap = boxInteriorOverlap(a, b, obstacle, 0);
      if (overlap > 0) score += overlap * 40;
    }
  }
  score += Math.max(0, points.length - 2) * 3;
  score += routeExcursionPenalty(points, source, target);
  return score;
}

function routeExcursionPenalty(points: [number, number][], source: Box, target: Box): number {
  const pad = ROUTE_GAP * 5;
  const left = Math.min(source.x, target.x) - pad;
  const top = Math.min(source.y, target.y) - pad;
  const right = Math.max(source.x + source.w, target.x + target.w) + pad;
  const bottom = Math.max(source.y + source.h, target.y + target.h) + pad;
  let penalty = 0;
  for (const [x, y] of points) {
    if (x < left) penalty += (left - x) * 90;
    if (x > right) penalty += (x - right) * 90;
    if (y < top) penalty += (top - y) * 90;
    if (y > bottom) penalty += (y - bottom) * 90;
  }
  return penalty;
}

function leafObstaclePenalty(
  obstacle: RouteObstacle,
  a: [number, number],
  b: [number, number],
  overlap: number,
): number {
  if (obstacle.id.startsWith('__arrow_guard_')) return 70000 + overlap * 700;
  if (isEdgeGuardObstacle(obstacle)) return edgeGuardPenalty(obstacle, a, b, overlap);
  return 160000 + overlap * 1200;
}

function edgeGuardPenalty(
  obstacle: EdgeGuardObstacle,
  a: [number, number],
  b: [number, number],
  overlap: number,
): number {
  const segmentVertical = Math.abs(a[0] - b[0]) < EPS;
  const guardVertical = obstacle.orientation === 'vertical';
  if (segmentVertical === guardVertical) return 85000 + overlap * 1200;
  return 500 + overlap * 160;
}

function isEdgeGuardObstacle(obstacle: RouteObstacle): obstacle is EdgeGuardObstacle {
  return obstacle.id.startsWith('__edge_guard_')
    && 'orientation' in obstacle
    && (obstacle.orientation === 'vertical' || obstacle.orientation === 'horizontal');
}

function containerTitleRoutingBand(container: RouteObstacle): Box {
  return {
    x: container.x,
    y: container.y,
    w: container.w,
    h: TITLE_H + PAD,
  };
}

function segmentLength(a: [number, number], b: [number, number]): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function boxInteriorOverlap(
  a: [number, number],
  b: [number, number],
  box: Box,
  pad: number,
): number {
  const left = box.x - pad;
  const right = box.x + box.w + pad;
  const top = box.y - pad;
  const bottom = box.y + box.h + pad;
  if (Math.abs(a[0] - b[0]) < EPS) {
    const x = a[0];
    if (x <= left || x >= right) return 0;
    return intervalOverlap(a[1], b[1], top, bottom);
  }
  if (Math.abs(a[1] - b[1]) < EPS) {
    const y = a[1];
    if (y <= top || y >= bottom) return 0;
    return intervalOverlap(a[0], b[0], left, right);
  }
  return 0;
}

function boxBorderOverlap(a: [number, number], b: [number, number], box: Box): number {
  return boxBorderProximityOverlap(a, b, box, 0);
}

function boxBorderProximityOverlap(
  a: [number, number],
  b: [number, number],
  box: Box,
  tolerance: number,
): number {
  if (Math.abs(a[0] - b[0]) < EPS) {
    const x = a[0];
    if (
      Math.abs(x - box.x) > tolerance + EPS
      && Math.abs(x - (box.x + box.w)) > tolerance + EPS
    ) return 0;
    return intervalOverlap(a[1], b[1], box.y, box.y + box.h);
  }
  if (Math.abs(a[1] - b[1]) < EPS) {
    const y = a[1];
    if (
      Math.abs(y - box.y) > tolerance + EPS
      && Math.abs(y - (box.y + box.h)) > tolerance + EPS
    ) return 0;
    return intervalOverlap(a[0], b[0], box.x, box.x + box.w);
  }
  return 0;
}

function intervalOverlap(a1: number, a2: number, b1: number, b2: number): number {
  const minA = Math.min(a1, a2);
  const maxA = Math.max(a1, a2);
  const minB = Math.min(b1, b2);
  const maxB = Math.max(b1, b2);
  return Math.max(0, Math.min(maxA, maxB) - Math.max(minA, minB));
}

function orthogonalRoute(a: Box, b: Box): [number, number][] {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;

  let pa: [number, number], pb: [number, number];
  const separatedHorizontally = a.x + a.w <= b.x || b.x + b.w <= a.x;
  const separatedVertically = a.y + a.h <= b.y || b.y + b.h <= a.y;
  const horizontal = separatedHorizontally
    ? true
    : separatedVertically
      ? false
      : Math.abs(dx) > Math.abs(dy);

  if (horizontal) {
    pa = [dx > 0 ? a.x + a.w : a.x, ca.y];
    pb = [dx > 0 ? b.x : b.x + b.w, cb.y];
    if (Math.abs(pa[1] - pb[1]) < 0.5) return [pa, pb];
    const midX = (pa[0] + pb[0]) / 2;
    return [pa, [midX, pa[1]], [midX, pb[1]], pb];
  } else {
    pa = [ca.x, dy > 0 ? a.y + a.h : a.y];
    pb = [cb.x, dy > 0 ? b.y : b.y + b.h];
    if (Math.abs(pa[0] - pb[0]) < 0.5) return [pa, pb];
    const midY = (pa[1] + pb[1]) / 2;
    return [pa, [pa[0], midY], [pb[0], midY], pb];
  }
}
