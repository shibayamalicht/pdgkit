import { describe, expect, it } from 'vitest';
import type { Box, LaidOutEdge } from '../src/core/layout';
import { layout } from '../src/core/layout';
import { parse } from '../src/core/parser';
import { chooseLabelPlacement } from '../src/core/render';

const AMR_SOURCE = `100 = 搬送ロボット / autonomous mobile robot
200 = 倉庫管理サーバ / WMS server
300 = 充電ステーション / charging station
400 = 上位基幹システム / ERP system
10 = 制御部 / control unit
11 = LiDAR / LiDAR
12 = カメラ / camera
13 = エンコーダ / encoder
14 = 経路計画部 / path planner
15 = 走行制御部 / drive controller
16 = 駆動モータ / drive motor
17 = 荷物保持部 / cargo holder
18 = 無線通信部 / wireless unit
19 = バッテリ / battery
100 : 10 11 12 13 14 15 16 17 18 19
11 -> 10 : 点群 / point cloud
12 -> 10 : 画像 / image
13 -> 15 : 回転量 / encoder data
10 -> 14 : 環境情報 / environment
14 -> 15 : 経路指令 / planned path
15 -> 16 : 駆動指令 / drive cmd
10 -> 17 : 荷役指令 / cargo cmd
10 -> 18 : 送信データ / tx data
18 <-> 200 : 配車・状態 / dispatch
200 <-> 400 : 在庫連携 / inventory
300 .> 18 : 充電位置情報 / dock info
19 .. 10
19 .. 15
19 .. 16
19 .. 17
19 .. 18`;

const EV_FAST_CHARGING_SOURCE = `100 = 充電ステーション / charging station
200 = 電力系統 / power grid
300 = 電気自動車 / electric vehicle
400 = 課金管理サーバ / billing server
500 = 利用者端末 / user device
10 = 受電部 / power receiver
20 = AC/DC変換部 / AC-DC converter
30 = 出力制御部 / output controller
40 = 充電コネクタ / charging connector
50 = 制御部 / control unit
60 = 通信部 / communication unit
70 = 操作パネル / operation panel
80 = 認証部 / authentication unit
100 : 10 20 30 40 50 60 70 80
200 - 10
10 - 20
20 - 30
30 - 40
40 - 300 : 充電電力 / charging power
50 -> 20 : 変換指令 / conversion cmd
50 -> 30 : 出力指令 / output cmd
50 -> 70 : 表示データ / display
70 -> 50 : 操作入力 / user input
80 -> 50 : 認証結果 / auth result
50 -> 60 : 送信データ / tx data
60 <-> 400 : 課金情報 / billing
40 <-> 300 : 充電制御 / CAN
500 .> 80 : 認証情報 / auth info
500 .> 60 : 予約情報 / reservation`;

describe('edge label placement', () => {
  it('keeps user-authored AMR labels clear of endpoint boxes', () => {
    const laid = layout(parse(AMR_SOURCE));
    const leaves = laid.nodes.filter(n => !n.isContainer);

    for (const edge of [
      requiredEdge(laid.edges, '10', '17'),
      requiredEdge(laid.edges, '12', '10'),
    ]) {
      const label = edge.label?.ja;
      expect(label).toBeTruthy();
      const placement = chooseLabelPlacement(edge, [label!], laid);

      for (const node of leaves) {
        expect(
          rectOverlapArea(placement.box, expandBox(node, 0.6)),
          `${edge.from}->${edge.to} label overlaps ${node.id}`,
        ).toBe(0);
      }
    }
  });

  it('keeps user-authored AMR edge labels clear of earlier labels', () => {
    const laid = layout(parse(AMR_SOURCE));
    const occupied: Box[] = [];
    const placements = new Map<string, Box>();

    for (const edge of laid.edges) {
      const label = edge.label?.ja;
      if (!label) continue;
      const placement = chooseLabelPlacement(edge, [label], laid, occupied);
      occupied.push(expandBox(placement.box, 0.8));
      placements.set(`${edge.from}->${edge.to}`, placement.box);
    }

    const environment = placements.get('10->14');
    const txData = placements.get('10->18');
    expect(environment).toBeDefined();
    expect(txData).toBeDefined();
    expect(rectOverlapArea(environment!, txData!)).toBe(0);
  });

  it('keeps EV charging-power labels clear of the vehicle box', () => {
    const laid = layout(parse(EV_FAST_CHARGING_SOURCE));
    const occupied: Box[] = [];
    let chargingPower: Box | undefined;

    for (const edge of laid.edges) {
      const label = edge.label?.ja;
      if (!label) continue;
      const placement = chooseLabelPlacement(edge, [label], laid, occupied);
      occupied.push(expandBox(placement.box, 0.8));
      if (label === '充電電力') chargingPower = placement.box;
    }

    const vehicle = laid.nodes.find(n => n.id === '300');
    const station = laid.nodes.find(n => n.id === '100');
    expect(chargingPower).toBeDefined();
    expect(vehicle).toBeDefined();
    expect(station).toBeDefined();
    expect(rectOverlapArea(chargingPower!, expandBox(vehicle!, 1.4))).toBe(0);
    expect(rectBorderBandOverlapArea(chargingPower!, station!, 1.2)).toBe(0);
  });

  it('keeps EV tx-data labels clear of the control-unit box', () => {
    const laid = layout(parse(EV_FAST_CHARGING_SOURCE));
    const occupied: Box[] = [];
    let txData: Box | undefined;

    for (const edge of laid.edges) {
      const label = edge.label?.ja;
      if (!label) continue;
      const placement = chooseLabelPlacement(edge, [label], laid, occupied);
      occupied.push(expandBox(placement.box, 0.8));
      if (label === '送信データ') txData = placement.box;
    }

    const control = laid.nodes.find(n => n.id === '50');
    expect(txData).toBeDefined();
    expect(control).toBeDefined();
    expect(rectOverlapArea(txData!, expandBox(control!, 0.4))).toBe(0);
  });
});

function requiredEdge(edges: LaidOutEdge[], from: string, to: string): LaidOutEdge {
  const edge = edges.find(e => e.from === from && e.to === to);
  expect(edge, `${from}->${to}`).toBeDefined();
  return edge!;
}

function expandBox(box: Box, pad: number): Box {
  return { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
}

function rectOverlapArea(a: Box, b: Box): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

function rectBorderBandOverlapArea(a: Box, b: Box, band: number): number {
  return rectOverlapArea(a, { x: b.x - band, y: b.y - band, w: band * 2, h: b.h + band * 2 })
    + rectOverlapArea(a, { x: b.x + b.w - band, y: b.y - band, w: band * 2, h: b.h + band * 2 })
    + rectOverlapArea(a, { x: b.x - band, y: b.y - band, w: b.w + band * 2, h: band * 2 })
    + rectOverlapArea(a, { x: b.x - band, y: b.y + b.h - band, w: b.w + band * 2, h: band * 2 });
}
