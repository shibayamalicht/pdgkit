import { describe, expect, it } from 'vitest';
import { layout, type Box, type LaidOut } from '../src/core/layout';
import { parse } from '../src/core/parser';
import { PATTERN_SOURCE, type PatternId } from '../src/core/patterns';
import { SAMPLE_ORDER, SAMPLES } from '../src/core/samples';
import type { Doc } from '../src/core/types';

const AUTONOMOUS_DRIVING_SOURCE = `100 = 自動運転制御システム / autonomous driving system
200 = クラウドサーバ / cloud server
300 = 衛星測位システム / GNSS
10 = 認識部 / perception unit
11 = カメラ / camera
12 = LiDAR / LiDAR
13 = センサフュージョン部 / sensor fusion unit
20 = 判断部 / decision unit
21 = 経路計画部 / path planning unit
22 = 行動決定部 / behavior decision unit
30 = 制御部 / control unit
31 = 操舵制御部 / steering control
32 = 制動制御部 / braking control
33 = 駆動制御部 / throttle control
40 = 通信部 / communication unit
100 : 10 20 30 40
10  : 11 12 13
20  : 21 22
30  : 31 32 33
11 -> 13 : 画像 / image
12 -> 13 : 点群 / point cloud
13 -> 21 : 認識結果 / recognition result
21 -> 22 : 計画経路 / planned path
22 => 30 : 制御指令 / control command
30 -> 31 : 操舵指令 / steering
30 -> 32 : 制動指令 / braking
30 -> 33 : 駆動指令 / throttle
40 <-> 200 : クラウド通信 / cloud
300 .> 10 : 測位信号 / GNSS signal`;

const BORDER_CLEARANCE = 1.0;

const MULTI_SYSTEM_SOURCE = `100 = 監視システム / monitoring system
200 = 管理サーバ / management server
300 = 外部通知装置 / external notifier
10 = 取得部 / acquisition unit
11 = カメラ / camera
12 = マイク / microphone
13 = 環境センサ / environment sensor
20 = 解析部 / analysis unit
21 = 画像解析部 / image analyzer
22 = 音声解析部 / audio analyzer
23 = 異常判定部 / anomaly determiner
30 = 制御部 / control unit
31 = 記録制御部 / recording controller
32 = 通知制御部 / notification controller
33 = 電源制御部 / power controller
40 = 通信部 / communication unit
100 : 10 20 30 40
10 : 11 12 13
20 : 21 22 23
30 : 31 32 33
11 -> 21 : 画像 / image
12 -> 22 : 音声 / sound
13 -> 23 : 環境値 / environment value
21 -> 23 : 画像特徴 / image feature
22 -> 23 : 音声特徴 / sound feature
23 => 30 : 異常情報 / anomaly information
30 -> 31 : 記録指令 / recording command
30 -> 32 : 通知指令 / notification command
30 -> 33 : 電源指令 / power command
32 -> 40 : 通知データ / notification data
40 <-> 200 : 管理通信 / management communication
200 -> 300 : 通知 / notification`;

const WEARABLE_ECG_SOURCE = `100 = ウェアラブル端末 / wearable device
200 = スマートフォン / smartphone
300 = クラウドサーバ / cloud server
400 = 医療機関端末 / medical terminal
10 = 電極 / electrode
20 = 増幅部 / amplifier
30 = A/D変換部 / A/D converter
40 = 制御部 / control unit
50 = 無線通信部 / wireless communication unit
60 = 電池 / battery
70 = 表示部 / display
100 : 10 20 30 40 50 60 70
10 -> 20 : 生体電位 / bio potential
20 -> 30 : 増幅信号 / amplified signal
30 -> 40 : デジタル信号 / digital signal
40 -> 70 : 表示データ / display data
40 -> 50 : 送信データ / tx data
50 .> 200 : 心電データ / ECG data
200 .> 300 : アップロード / upload
300 <-> 400 : 診断情報 / diagnostic info
60 .. 20
60 .. 30
60 .. 40
60 .. 50
60 .. 70`;

describe('layout regression coverage', () => {
  for (const id of SAMPLE_ORDER) {
    it(`keeps built-in sample layout stable: ${id}`, () => {
      assertLayoutHealth(SAMPLES[id].source, `sample:${id}`);
    });
  }

  for (const id of Object.keys(PATTERN_SOURCE) as PatternId[]) {
    it(`keeps GUI pattern layout stable: ${id}`, () => {
      assertLayoutHealth(PATTERN_SOURCE[id], `pattern:${id}`);
    });
  }

  it('keeps the autonomous-driving user case clear', () => {
    assertLayoutHealth(AUTONOMOUS_DRIVING_SOURCE, 'autonomous-driving');
  });

  it('keeps a denser three-subsystem patent block clear', () => {
    assertLayoutHealth(MULTI_SYSTEM_SOURCE, 'multi-system');
  });

  it('keeps a dense user-authored wearable block clear', () => {
    assertLayoutHealth(WEARABLE_ECG_SOURCE, 'wearable-ecg');
  });
});

function assertLayoutHealth(source: string, label: string): void {
  const doc = parse(source);
  const errors = doc.diagnostics.filter(d => d.severity === 'error');
  expect(errors, `${label} parse errors`).toHaveLength(0);

  const laid = layout(doc);
  expect(Number.isFinite(laid.width), label).toBe(true);
  expect(Number.isFinite(laid.height), label).toBe(true);
  expect(laid.width, label).toBeGreaterThan(0);
  expect(laid.height, label).toBeGreaterThan(0);
  for (const edge of laid.edges) {
    for (const point of edge.points) {
      expect(Number.isFinite(point[0]), `${label} ${edge.from}->${edge.to}`).toBe(true);
      expect(Number.isFinite(point[1]), `${label} ${edge.from}->${edge.to}`).toBe(true);
    }
  }

  if (doc.kind !== 'block') return;
  assertBlockRoutesAvoidUnrelatedBoxes(doc, laid, label);
}

function assertBlockRoutesAvoidUnrelatedBoxes(doc: Doc, laid: LaidOut, label: string): void {
  const parentMap = buildParentMap(doc);
  const leaves = laid.nodes.filter(n => !n.isContainer);
  const containers = laid.nodes.filter(n => n.isContainer);

  for (const edge of laid.edges) {
    for (const leaf of leaves) {
      if (leaf.id === edge.from || leaf.id === edge.to) continue;
      expect(
        routeIntersectsBox(edge.points, leaf, 0.8),
        `${label} ${edge.from}->${edge.to} crosses leaf ${leaf.id}`,
      ).toBe(false);
    }

    const allowedContainers = new Set([
      edge.from,
      edge.to,
      ...ancestorsOf(edge.from, parentMap),
      ...ancestorsOf(edge.to, parentMap),
    ]);
    const source = laid.nodes.find(n => n.id === edge.from);
    const target = laid.nodes.find(n => n.id === edge.to);
    expect(source, `${label} missing source ${edge.from}`).toBeDefined();
    expect(target, `${label} missing target ${edge.to}`).toBeDefined();
    expect(
      routeRunsNearBoxBorder(edge.points, source!, source!.isContainer ? BORDER_CLEARANCE : 0),
      `${label} ${edge.from}->${edge.to} runs along source border`,
    ).toBe(false);
    expect(
      routeRunsNearBoxBorder(edge.points, target!, target!.isContainer ? BORDER_CLEARANCE : 0),
      `${label} ${edge.from}->${edge.to} runs along target border`,
    ).toBe(false);
    if (source!.isContainer && isAncestorOf(edge.from, edge.to, parentMap)) {
      expect(
        pointInsideBox(edge.points[0], source!, 0.5),
        `${label} ${edge.from}->${edge.to} starts on container border`,
      ).toBe(true);
    } else if (source!.isContainer) {
      expect(
        pointOnBoxBorder(edge.points[0], source!),
        `${label} ${edge.from}->${edge.to} starts inside external container`,
      ).toBe(true);
      expect(
        routeIntersectsBox(edge.points, source!, 0),
        `${label} ${edge.from}->${edge.to} runs through external source container`,
      ).toBe(false);
    }
    if (target!.isContainer && isAncestorOf(edge.to, edge.from, parentMap)) {
      expect(
        pointInsideBox(edge.points.at(-1)!, target!, 0.5),
        `${label} ${edge.from}->${edge.to} ends on container border`,
      ).toBe(true);
    } else if (target!.isContainer) {
      expect(
        pointOnBoxBorder(edge.points.at(-1)!, target!),
        `${label} ${edge.from}->${edge.to} ends inside external container`,
      ).toBe(true);
      expect(
        routeIntersectsBox(edge.points, target!, 0),
        `${label} ${edge.from}->${edge.to} runs through external target container`,
      ).toBe(false);
    }

    for (const container of containers) {
      if (allowedContainers.has(container.id)) continue;
      expect(
        routeIntersectsBox(edge.points, container, 0.8),
        `${label} ${edge.from}->${edge.to} crosses container ${container.id}`,
      ).toBe(false);
      expect(
        routeRunsNearBoxBorder(edge.points, container, BORDER_CLEARANCE),
        `${label} ${edge.from}->${edge.to} overlaps container border ${container.id}`,
      ).toBe(false);
    }

    if (isAncestorOf(edge.from, edge.to, parentMap)) {
      const parent = containers.find(n => n.id === edge.from);
      expect(parent, `${label} missing parent ${edge.from}`).toBeDefined();
      expect(
        pointInsideBox(edge.points[0], parent!, 0.5),
        `${label} ${edge.from}->${edge.to} starts outside parent lane`,
      ).toBe(true);
    }
  }
}

function buildParentMap(doc: Doc): Map<string, string> {
  const parentMap = new Map<string, string>();
  for (const c of doc.containments) {
    for (const child of c.children) parentMap.set(child, c.parent);
  }
  return parentMap;
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

function isAncestorOf(ancestor: string, id: string, parentMap: Map<string, string>): boolean {
  return ancestorsOf(id, parentMap).includes(ancestor);
}

function routeIntersectsBox(points: [number, number][], box: Box, pad: number): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    if (boxInteriorOverlap(points[i], points[i + 1], box, pad) > 0) return true;
  }
  return false;
}

function routeRunsNearBoxBorder(points: [number, number][], box: Box, tolerance: number): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    if (boxBorderOverlap(points[i], points[i + 1], box, tolerance) > 0) return true;
  }
  return false;
}

function pointInsideBox(point: [number, number], box: Box, inset: number): boolean {
  return point[0] > box.x + inset
    && point[0] < box.x + box.w - inset
    && point[1] > box.y + inset
    && point[1] < box.y + box.h - inset;
}

function pointOnBoxBorder(point: [number, number], box: Box): boolean {
  const [x, y] = point;
  const onVertical = (Math.abs(x - box.x) < 0.001 || Math.abs(x - (box.x + box.w)) < 0.001)
    && y >= box.y
    && y <= box.y + box.h;
  const onHorizontal = (Math.abs(y - box.y) < 0.001 || Math.abs(y - (box.y + box.h)) < 0.001)
    && x >= box.x
    && x <= box.x + box.w;
  return onVertical || onHorizontal;
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
  if (Math.abs(a[0] - b[0]) < 0.001) {
    const x = a[0];
    if (x <= left || x >= right) return 0;
    return intervalOverlap(a[1], b[1], top, bottom);
  }
  if (Math.abs(a[1] - b[1]) < 0.001) {
    const y = a[1];
    if (y <= top || y >= bottom) return 0;
    return intervalOverlap(a[0], b[0], left, right);
  }
  return 0;
}

function boxBorderOverlap(
  a: [number, number],
  b: [number, number],
  box: Box,
  tolerance: number,
): number {
  if (Math.abs(a[0] - b[0]) < 0.001) {
    const x = a[0];
    if (
      Math.abs(x - box.x) > tolerance + 0.001
      && Math.abs(x - (box.x + box.w)) > tolerance + 0.001
    ) return 0;
    return intervalOverlap(a[1], b[1], box.y, box.y + box.h);
  }
  if (Math.abs(a[1] - b[1]) < 0.001) {
    const y = a[1];
    if (
      Math.abs(y - box.y) > tolerance + 0.001
      && Math.abs(y - (box.y + box.h)) > tolerance + 0.001
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
