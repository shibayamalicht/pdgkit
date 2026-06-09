import type { LaidOut, LaidOutEdge, LaidOutNode } from './layout';
import type { Bilingual, EdgeOp, Lang } from './types';

const NS = 'http://www.w3.org/2000/svg';
const FONT_FAMILY = '"Hiragino Sans", "Yu Gothic", "Noto Sans CJK JP", sans-serif';
const LABEL_OFFSET = 4.0;
const LABEL_FONT_JA = 2.4;
const LABEL_FONT_EN = 2.1;
const LABEL_GAP = 0.6;
const LABEL_OFFSET_STEPS = [0, 3.2, 6.4];
const EPS = 0.001;

export type RenderOptions = { lang?: Lang };

export type LabelPlacement = {
  box: { x: number; y: number; w: number; h: number };
  lineA: [number, number];
  lineB: [number, number];
  score: number;
  vertical: boolean;
  anchor: string;
  ja: { x: number; y: number; baseline: string };
  en?: { x: number; y: number; baseline: string };
};

export function render(laid: LaidOut, opts: RenderOptions = {}): SVGSVGElement {
  const lang = opts.lang ?? 'ja';
  const svg = el('svg', {
    xmlns: NS,
    viewBox: `0 0 ${laid.width} ${laid.height}`,
    'font-family': FONT_FAMILY,
    'shape-rendering': 'geometricPrecision',
  });

  const containers = laid.nodes.filter(n => n.isContainer);
  const leaves = laid.nodes.filter(n => !n.isContainer);
  const labelBoxes: BoxLike[] = [];

  for (const c of containers) svg.appendChild(renderContainer(c, lang));
  for (const e of laid.edges) svg.appendChild(renderEdge(e, lang, laid, labelBoxes));
  for (const e of laid.edges) svg.appendChild(renderEdgeHeads(e));
  for (const n of leaves) svg.appendChild(renderNode(n, lang));

  return svg;
}

function renderContainer(n: LaidOutNode, lang: Lang): SVGElement {
  const g = el('g');
  g.appendChild(el('rect', {
    x: n.x, y: n.y, width: n.w, height: n.h,
    fill: 'white',
    stroke: '#000',
    'stroke-width': 0.3,
  }));
  const labels = pickLabel(n.label, lang);
  if (labels.length || n.id) {
    const t = el('text', {
      x: n.x + 2,
      y: n.y + 3.5,
      'font-size': 2.6,
      fill: '#000',
    });
    t.textContent = (n.id ? n.id + ' ' : '') + (labels[0] ?? '');
    g.appendChild(t);
  }
  return g;
}

function renderNode(n: LaidOutNode, lang: Lang): SVGElement {
  const g = el('g');
  g.appendChild(renderShape(n));
  const lines: string[] = [];
  if (n.id && n.id !== '*') lines.push(n.id);
  const labels = pickLabel(n.label, lang);
  for (const l of labels) lines.push(l);
  if (lines.length === 0) return g;

  const fontSize = 2.8;
  const lineH = fontSize * 1.2;
  const totalH = lines.length * lineH;
  const startY = n.y + n.h / 2 - totalH / 2 + lineH * 0.8;
  for (let i = 0; i < lines.length; i++) {
    const t = el('text', {
      x: n.x + n.w / 2,
      y: startY + i * lineH,
      'font-size': fontSize,
      fill: '#000',
      'text-anchor': 'middle',
    });
    t.textContent = lines[i];
    g.appendChild(t);
  }
  return g;
}

function renderShape(n: LaidOutNode): SVGElement {
  const stroke = '#000';
  const fill = 'white';
  const sw = 0.4;
  switch (n.shape) {
    case 'round':
      return el('rect', {
        x: n.x, y: n.y, width: n.w, height: n.h,
        rx: Math.min(n.w, n.h) / 2, ry: Math.min(n.w, n.h) / 2,
        fill, stroke, 'stroke-width': sw,
      });
    case 'circle': {
      const r = Math.min(n.w, n.h) / 2;
      return el('circle', {
        cx: n.x + n.w / 2, cy: n.y + n.h / 2, r,
        fill: '#000', stroke,
      });
    }
    case 'diamond': {
      const cx = n.x + n.w / 2;
      const cy = n.y + n.h / 2;
      const pts = [[cx, n.y], [n.x + n.w, cy], [cx, n.y + n.h], [n.x, cy]]
        .map(p => p.join(',')).join(' ');
      return el('polygon', { points: pts, fill, stroke, 'stroke-width': sw });
    }
    case 'actor':
    case 'box':
    default:
      return el('rect', {
        x: n.x, y: n.y, width: n.w, height: n.h,
        fill, stroke, 'stroke-width': sw,
      });
  }
}

function renderEdge(
  e: LaidOutEdge,
  lang: Lang,
  laid: LaidOut,
  labelBoxes: BoxLike[],
): SVGElement {
  const g = el('g');
  if (e.points.length < 2) return g;
  const bodyPoints = edgeBodyPoints(e);
  if (bodyPoints.length < 2) return g;
  const d = bodyPoints
    .map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`))
    .join(' ');
  const path = el('path', {
    d,
    fill: 'none',
    stroke: '#000',
    'stroke-width': strokeWidth(e.op),
    'stroke-linecap': 'butt',
    'stroke-linejoin': 'miter',
  });
  const dash = strokeDash(e.op);
  if (dash) path.setAttribute('stroke-dasharray', dash);
  g.appendChild(path);

  const labels = pickLabel(e.label, lang);
  if (labels.length) {
    const ja = labels[0];
    const en = labels[1];
    const placement = chooseLabelPlacement(e, labels, laid, labelBoxes);
    labelBoxes.push(expandBox(placement.box, 0.8));

    const drawText = (
      text: string, x: number, y: number, fontSize: number,
      anchor: string, baseline: string,
    ) => {
      const t = el('text', {
        x, y,
        'font-size': fontSize,
        fill: '#000',
        'text-anchor': anchor,
        'dominant-baseline': baseline,
      });
      t.textContent = text;
      g.appendChild(t);
    };

    drawText(ja, placement.ja.x, placement.ja.y, LABEL_FONT_JA, placement.anchor, placement.ja.baseline);
    if (en && placement.en) {
      drawText(en, placement.en.x, placement.en.y, LABEL_FONT_EN, placement.anchor, placement.en.baseline);
    }
  }

  return g;
}

function renderEdgeHeads(e: LaidOutEdge): SVGElement {
  const g = el('g');
  if (e.isLifeline) return g;
  const endHead = arrowHeadFor(e, false);
  const startHead = arrowHeadFor(e, true);
  if (endHead) g.appendChild(endHead);
  if (startHead) g.appendChild(startHead);
  return g;
}

function strokeWidth(op: EdgeOp): number {
  return op === 'thick' ? 0.7 : 0.4;
}

function strokeDash(op: EdgeOp): string | null {
  return (op === 'dashed' || op === 'dashed-arrow') ? '1.4 1.2' : null;
}

function edgeBodyPoints(e: LaidOutEdge): [number, number][] {
  let points = e.points.map((p): [number, number] => [p[0], p[1]]);
  if (e.op !== 'line' && e.op !== 'dashed') {
    points = trimPolyline(points, false, arrowLength(e.op));
  }
  if (e.op === 'bidir') {
    points = trimPolyline(points, true, arrowLength(e.op));
  }
  return points;
}

function trimPolyline(
  points: [number, number][],
  atStart: boolean,
  amount: number,
): [number, number][] {
  if (points.length < 2 || amount <= 0) return points;
  const out = atStart ? [...points].reverse() : [...points];
  let remaining = amount;
  while (out.length >= 2 && remaining > 0) {
    const tip = out[out.length - 1];
    const prev = out[out.length - 2];
    const dx = prev[0] - tip[0];
    const dy = prev[1] - tip[1];
    const len = Math.hypot(dx, dy);
    if (len < EPS) {
      out.pop();
      continue;
    }
    if (len > remaining) {
      out[out.length - 1] = [
        tip[0] + (dx / len) * remaining,
        tip[1] + (dy / len) * remaining,
      ];
      remaining = 0;
    } else {
      out.pop();
      remaining -= len;
    }
  }
  return atStart ? out.reverse() : out;
}

function arrowLength(op: EdgeOp): number {
  return op === 'thick' ? 3.4 : 2.8;
}

function arrowHeadFor(e: LaidOutEdge, atStart: boolean): SVGElement | null {
  if (e.points.length < 2) return null;
  if (atStart && e.op !== 'bidir') return null;
  if (!atStart && (e.op === 'line' || e.op === 'dashed')) return null;
  const points = atStart ? e.points : [...e.points].reverse();
  return renderArrowHead(points[0], points[1], e.op === 'thick');
}

function renderArrowHead(
  tip: [number, number],
  next: [number, number],
  bold: boolean,
): SVGElement | null {
  const dx = next[0] - tip[0];
  const dy = next[1] - tip[1];
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return null;
  const ux = dx / len;
  const uy = dy / len;
  const arrowLen = bold ? 3.4 : 2.8;
  const halfW = bold ? 1.6 : 1.25;
  const bx = tip[0] + ux * arrowLen;
  const by = tip[1] + uy * arrowLen;
  const px = -uy;
  const py = ux;
  const pts = [
    tip,
    [bx + px * halfW, by + py * halfW],
    [bx - px * halfW, by - py * halfW],
  ].map(p => p.join(',')).join(' ');
  return el('polygon', {
    points: pts,
    fill: '#000',
    stroke: '#000',
    'stroke-width': 0,
  });
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K, attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function pickLabel(b: Bilingual | undefined, lang: Lang): string[] {
  if (!b) return [];
  if (lang === 'ja') return b.ja ? [b.ja] : (b.en ? [b.en] : []);
  if (lang === 'en') return b.en ? [b.en] : (b.ja ? [b.ja] : []);
  const out: string[] = [];
  if (b.ja) out.push(b.ja);
  if (b.en) out.push(b.en);
  return out;
}

export function chooseLabelPlacement(
  edge: LaidOutEdge,
  labels: string[],
  laid: LaidOut,
  occupiedLabels: BoxLike[] = [],
): LabelPlacement {
  const candidates: LabelPlacement[] = [];
  const textW = Math.max(...labels.map((label, index) => estimateTextWidth(
    label,
    index === 0 ? LABEL_FONT_JA : LABEL_FONT_EN,
  )));
  const textH = labels.length > 1
    ? LABEL_FONT_JA + LABEL_FONT_EN + LABEL_GAP
    : LABEL_FONT_JA;

  for (let i = 0; i < edge.points.length - 1; i++) {
    const a = edge.points[i];
    const b = edge.points[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.abs(dx) + Math.abs(dy);
    if (len < 8) continue;
    for (const t of [0.5, 0.35, 0.65, 0.22, 0.78]) {
      const x = a[0] + dx * t;
      const y = a[1] + dy * t;
      for (const offsetStep of LABEL_OFFSET_STEPS) {
        const offset = LABEL_OFFSET + offsetStep;
        const offsetPenalty = offsetStep * 9;
        if (Math.abs(dy) < EPS) {
          candidates.push(makeHorizontalLabel(edge, laid, occupiedLabels, labels, textW, textH, a, b, x, y, 'above', offset, offsetPenalty));
          candidates.push(makeHorizontalLabel(edge, laid, occupiedLabels, labels, textW, textH, a, b, x, y, 'below', offset, offsetPenalty));
        } else if (Math.abs(dx) < EPS) {
          candidates.push(makeVerticalLabel(edge, laid, occupiedLabels, labels, textW, textH, a, b, x, y, 'right', offset, offsetPenalty));
          candidates.push(makeVerticalLabel(edge, laid, occupiedLabels, labels, textW, textH, a, b, x, y, 'left', offset, offsetPenalty));
        }
      }
    }
  }

  if (candidates.length === 0) {
    const [a, b] = longestSegment(edge.points);
    const x = (a[0] + b[0]) / 2;
    const y = (a[1] + b[1]) / 2;
  return Math.abs(b[1] - a[1]) >= Math.abs(b[0] - a[0])
      ? makeVerticalLabel(edge, laid, occupiedLabels, labels, textW, textH, a, b, x, y, 'right', LABEL_OFFSET, 0)
      : makeHorizontalLabel(edge, laid, occupiedLabels, labels, textW, textH, a, b, x, y, 'above', LABEL_OFFSET, 0);
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates[0];
}

function makeHorizontalLabel(
  edge: LaidOutEdge,
  laid: LaidOut,
  occupiedLabels: BoxLike[],
  labels: string[],
  textW: number,
  textH: number,
  lineA: [number, number],
  lineB: [number, number],
  x: number,
  lineY: number,
  side: 'above' | 'below',
  offset: number,
  offsetPenalty: number,
): LabelPlacement {
  const top = side === 'above' ? lineY - offset - textH : lineY + offset;
  const box = { x: x - textW / 2, y: top, w: textW, h: textH };
  let jaY: number;
  let enY: number | undefined;
  if (labels.length > 1) {
    jaY = top + LABEL_FONT_JA;
    enY = jaY + LABEL_GAP + LABEL_FONT_EN;
  } else {
    jaY = top + LABEL_FONT_JA;
  }
  const placement: LabelPlacement = {
    box,
    lineA,
    lineB,
    score: 0,
    vertical: false,
    anchor: 'middle',
    ja: { x, y: jaY, baseline: 'alphabetic' },
    en: enY === undefined ? undefined : { x, y: enY, baseline: 'alphabetic' },
  };
  placement.score = labelPlacementScore(placement, edge, laid, occupiedLabels) + (side === 'above' ? 0 : 8) + offsetPenalty;
  return placement;
}

function makeVerticalLabel(
  edge: LaidOutEdge,
  laid: LaidOut,
  occupiedLabels: BoxLike[],
  labels: string[],
  textW: number,
  textH: number,
  lineA: [number, number],
  lineB: [number, number],
  lineX: number,
  y: number,
  side: 'right' | 'left',
  offset: number,
  offsetPenalty: number,
): LabelPlacement {
  const x = side === 'right' ? lineX + offset : lineX - offset;
  const box = {
    x: side === 'right' ? x : x - textW,
    y: y - textH / 2,
    w: textW,
    h: textH,
  };
  const anchor = side === 'right' ? 'start' : 'end';
  const jaY = labels.length > 1
    ? y - LABEL_FONT_JA / 2 - LABEL_GAP / 2
    : y;
  const enY = labels.length > 1
    ? y + LABEL_FONT_EN / 2 + LABEL_GAP / 2
    : undefined;
  const placement: LabelPlacement = {
    box,
    lineA,
    lineB,
    score: 0,
    vertical: true,
    anchor,
    ja: { x, y: jaY, baseline: 'middle' },
    en: enY === undefined ? undefined : { x, y: enY, baseline: 'middle' },
  };
  placement.score = labelPlacementScore(placement, edge, laid, occupiedLabels) + (side === 'right' ? 0 : 8) + offsetPenalty;
  return placement;
}

function labelPlacementScore(
  placement: LabelPlacement,
  edge: LaidOutEdge,
  laid: LaidOut,
  occupiedLabels: BoxLike[],
): number {
  let score = placement.vertical ? 5 : 0;
  const box = placement.box;

  if (box.x < 0) score += Math.abs(box.x) * 300;
  if (box.y < 0) score += Math.abs(box.y) * 300;
  if (box.x + box.w > laid.width) score += (box.x + box.w - laid.width) * 300;
  if (box.y + box.h > laid.height) score += (box.y + box.h - laid.height) * 300;

  for (const node of laid.nodes) {
    if (node.isContainer) {
      const title = { x: node.x, y: node.y, w: node.w, h: 6 };
      score += rectOverlapArea(box, title) * 900;
      score += rectBorderOverlapPenalty(box, node) * 1800;
      score += rectBorderBandOverlapArea(box, node, 1.8) * 9000;
    } else {
      const bodyOverlap = rectOverlapArea(box, node);
      if (bodyOverlap > 0) score += 1000000 + bodyOverlap * 50000;
      score += rectOverlapArea(box, expandBox(node, 1.8)) * 5200;
    }
  }

  for (const other of laid.edges) {
    for (let i = 0; i < other.points.length - 1; i++) {
      const a = other.points[i];
      const b = other.points[i + 1];
      const overlap = segmentIntersectsRect(a, b, expandBox(box, 0.8));
      if (!overlap) continue;
      score += other === edge ? 35 : 380;
    }
  }

  for (const occupied of occupiedLabels) {
    score += rectOverlapArea(box, occupied) * 18000;
  }

  const segmentLen = Math.abs(placement.lineA[0] - placement.lineB[0])
    + Math.abs(placement.lineA[1] - placement.lineB[1]);
  const labelSpan = placement.vertical ? box.h : box.w;
  score += Math.max(0, Math.max(36, labelSpan * 2.4) - segmentLen) * 80;
  const center = placement.vertical
    ? box.y + box.h / 2
    : box.x + box.w / 2;
  const start = placement.vertical ? placement.lineA[1] : placement.lineA[0];
  const end = placement.vertical ? placement.lineB[1] : placement.lineB[0];
  const endpointDistance = Math.min(Math.abs(center - start), Math.abs(center - end));
  score += Math.max(0, 12 - endpointDistance) * 80;

  return score;
}

export function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const char of text) {
    if (char === ' ') width += fontSize * 0.35;
    else if (char.charCodeAt(0) <= 0x7f) width += fontSize * 0.58;
    else width += fontSize;
  }
  return Math.max(fontSize * 2, width);
}

function longestSegment(pts: [number, number][]): [[number, number], [number, number]] {
  let best = 0;
  let bestLen = -1;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0];
    const dy = pts[i + 1][1] - pts[i][1];
    const len = dx * dx + dy * dy;
    if (len > bestLen) { bestLen = len; best = i; }
  }
  const a = pts[best];
  const b = pts[best + 1];
  return [a, b];
}

function expandBox(box: { x: number; y: number; w: number; h: number }, pad: number): BoxLike {
  return { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
}

type BoxLike = { x: number; y: number; w: number; h: number };

function rectOverlapArea(a: BoxLike, b: BoxLike): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

function rectBorderOverlapPenalty(a: BoxLike, b: BoxLike): number {
  const nearLeft = Math.abs(a.x - b.x) < 1 || Math.abs(a.x + a.w - b.x) < 1;
  const nearRight = Math.abs(a.x - (b.x + b.w)) < 1 || Math.abs(a.x + a.w - (b.x + b.w)) < 1;
  const nearTop = Math.abs(a.y - b.y) < 1 || Math.abs(a.y + a.h - b.y) < 1;
  const nearBottom = Math.abs(a.y - (b.y + b.h)) < 1 || Math.abs(a.y + a.h - (b.y + b.h)) < 1;
  return Number(nearLeft || nearRight || nearTop || nearBottom);
}

function rectBorderBandOverlapArea(a: BoxLike, b: BoxLike, band: number): number {
  return rectOverlapArea(a, { x: b.x - band, y: b.y - band, w: band * 2, h: b.h + band * 2 })
    + rectOverlapArea(a, { x: b.x + b.w - band, y: b.y - band, w: band * 2, h: b.h + band * 2 })
    + rectOverlapArea(a, { x: b.x - band, y: b.y - band, w: b.w + band * 2, h: band * 2 })
    + rectOverlapArea(a, { x: b.x - band, y: b.y + b.h - band, w: b.w + band * 2, h: band * 2 });
}

function segmentIntersectsRect(
  a: [number, number],
  b: [number, number],
  box: BoxLike,
): boolean {
  const left = box.x;
  const right = box.x + box.w;
  const top = box.y;
  const bottom = box.y + box.h;
  if (Math.abs(a[0] - b[0]) < EPS) {
    const x = a[0];
    if (x <= left || x >= right) return false;
    return intervalOverlap(a[1], b[1], top, bottom) > EPS;
  }
  if (Math.abs(a[1] - b[1]) < EPS) {
    const y = a[1];
    if (y <= top || y >= bottom) return false;
    return intervalOverlap(a[0], b[0], left, right) > EPS;
  }
  return false;
}

function intervalOverlap(a1: number, a2: number, b1: number, b2: number): number {
  const minA = Math.min(a1, a2);
  const maxA = Math.max(a1, a2);
  const minB = Math.min(b1, b2);
  const maxB = Math.max(b1, b2);
  return Math.max(0, Math.min(maxA, maxB) - Math.max(minA, minB));
}
