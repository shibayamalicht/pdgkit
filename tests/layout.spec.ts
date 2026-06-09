import { describe, expect, it } from 'vitest';
import type { Box, LaidOutEdge } from '../src/core/layout';
import { layout } from '../src/core/layout';
import { parse } from '../src/core/parser';
import { SAMPLES } from '../src/core/samples';

const SYSTEM_SOURCE = `100 = システム本体 / Main system
10 = 制御部 / Control
20 = 通信部 / Comm
11 = CPU
12 = メモリ / memory
21 = 無線部 / wireless
22 = 有線部 / wired
30 = 外部サーバ / external server
40 = 外部端末 / external terminal
100 : 10 20
10 : 11 12
20 : 21 22
21 .> 40 : 無線 / wireless
22 -> 30 : 有線 / wired
30 <-> 40 : 通信 / comm`;

const BASIC_BLOCK_SOURCE = `10 = 制御装置 / control device
11 = CPU
12 = メモリ / memory
13 = "I/O インターフェース" / "I/O interface"
20 = 外部機器 / external device

10 : 11 12 13

11 - 12
11 - 13
13 -> 20 : 信号 / signal`;

const EXTERNAL_CONTROL_LOOP_SOURCE = `100 = 制御装置 / control device
10 = 制御部 / controller
11 = 目標値取得部 / target acquisition unit
12 = 偏差算出部 / error calculator
13 = 指令生成部 / command generator
20 = 駆動部 / driver
30 = センサ部 / sensor unit
40 = 対象装置 / controlled object

100 : 10 20
10 : 11 12 13

30 -> 12 : 測定値 / measured value
11 -> 12 : 目標値 / target value
12 -> 13 : 偏差 / error
13 -> 20 : 指令 / command
20 -> 40 : 駆動信号 / drive signal
40 .> 30 : フィードバック / feedback`;

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

describe('block layout', () => {
  it('draws outer containers before nested containers', () => {
    const laid = layout(parse(SYSTEM_SOURCE));
    const containers = laid.nodes.filter(n => n.isContainer).map(n => n.id);

    expect(containers.indexOf('100')).toBeLessThan(containers.indexOf('10'));
    expect(containers.indexOf('100')).toBeLessThan(containers.indexOf('20'));
  });

  it('routes edges between horizontally separated boxes out from the side', () => {
    const laid = layout(parse(SYSTEM_SOURCE));
    const source = laid.nodes.find(n => n.id === '22');
    const edge = laid.edges.find(e => e.from === '22' && e.to === '30');
    const [start, next] = edge?.points ?? [];

    expect(source).toBeDefined();
    expect(start).toEqual([source!.x + source!.w, source!.y + source!.h / 2]);
    expect(next[1]).toBe(start[1]);
    expect(next[0]).toBeGreaterThan(start[0]);
  });

  it('keeps routed edges from crossing visible intermediate boxes', () => {
    const laid = layout(parse(SYSTEM_SOURCE));
    const wireless = laid.edges.find(e => e.from === '21' && e.to === '40');
    const server = laid.nodes.find(n => n.id === '30');

    expect(wireless).toBeDefined();
    expect(server).toBeDefined();
    expect(routeIntersectsBox(wireless!.points, server!, 0.8)).toBe(false);
  });

  it('avoids running routed edges along container borders', () => {
    const laid = layout(parse(SYSTEM_SOURCE));
    const wired = laid.edges.find(e => e.from === '22' && e.to === '30');
    const system = laid.nodes.find(n => n.id === '100');

    expect(wired).toBeDefined();
    expect(system).toBeDefined();
    expect(routeOverlapsBoxBorder(wired!.points, system!)).toBe(false);
  });

  it('aligns external root blocks with connected internal blocks instead of top-aligning them', () => {
    const laid = layout(parse(SYSTEM_SOURCE));
    const wired = laid.edges.find(e => e.from === '22' && e.to === '30');
    const wireless = laid.edges.find(e => e.from === '21' && e.to === '40');
    const wiredUnit = laid.nodes.find(n => n.id === '22');
    const server = laid.nodes.find(n => n.id === '30');
    const terminal = laid.nodes.find(n => n.id === '40');

    expect(wired).toBeDefined();
    expect(wireless).toBeDefined();
    expect(wiredUnit).toBeDefined();
    expect(server).toBeDefined();
    expect(terminal).toBeDefined();
    expect(centerY(server!)).toBe(centerY(wiredUnit!));
    expect(centerY(terminal!)).toBe(centerY(server!));
    expect(wired!.points[0][1]).toBe(wired!.points.at(-1)![1]);
  });

  it('keeps internal sibling routes inside their parent container', () => {
    const laid = layout(parse(BASIC_BLOCK_SOURCE));
    const internal = laid.edges.find(e => e.from === '11' && e.to === '13');
    const parent = laid.nodes.find(n => n.id === '10');
    const middle = laid.nodes.find(n => n.id === '12');

    expect(internal).toBeDefined();
    expect(parent).toBeDefined();
    expect(middle).toBeDefined();
    expect(routeFitsInsideBox(internal!.points, parent!, 2)).toBe(true);
    expect(routeIntersectsBox(internal!.points, middle!, 0.8)).toBe(false);
  });

  it('uses grid placement for three-child patent blocks to avoid bus-like detours', () => {
    const laid = layout(parse(BASIC_BLOCK_SOURCE));
    const cpu = laid.nodes.find(n => n.id === '11');
    const memory = laid.nodes.find(n => n.id === '12');
    const io = laid.nodes.find(n => n.id === '13');
    const internal = laid.edges.find(e => e.from === '11' && e.to === '13');

    expect(cpu).toBeDefined();
    expect(memory).toBeDefined();
    expect(io).toBeDefined();
    expect(memory!.x).toBeGreaterThan(cpu!.x);
    expect(io!.y).toBeGreaterThan(cpu!.y);
    expect(internal?.points).toHaveLength(2);
    expect(internal!.points[0][0]).toBe(internal!.points[1][0]);
  });

  it('stacks linear child flows inside patent block containers', () => {
    const laid = layout(parse(SAMPLES.iot.source));
    const receiver = laid.nodes.find(n => n.id === '310');
    const analyzer = laid.nodes.find(n => n.id === '320');
    const storage = laid.nodes.find(n => n.id === '330');
    const terminalDetector = laid.nodes.find(n => n.id === '10');
    const terminalProcessor = laid.nodes.find(n => n.id === '20');
    const terminalComm = laid.nodes.find(n => n.id === '30');

    expect(receiver).toBeDefined();
    expect(analyzer).toBeDefined();
    expect(storage).toBeDefined();
    expect(centerX(receiver!)).toBe(centerX(analyzer!));
    expect(centerX(analyzer!)).toBe(centerX(storage!));
    expect(receiver!.y).toBeLessThan(analyzer!.y);
    expect(analyzer!.y).toBeLessThan(storage!.y);

    expect(terminalDetector).toBeDefined();
    expect(terminalProcessor).toBeDefined();
    expect(terminalComm).toBeDefined();
    expect(centerX(terminalDetector!)).toBe(centerX(terminalProcessor!));
    expect(centerX(terminalProcessor!)).toBe(centerX(terminalComm!));
  });

  it('keeps IoT sample routes away from unrelated leaf boxes', () => {
    const laid = layout(parse(SAMPLES.iot.source));
    const leaves = laid.nodes.filter(n => !n.isContainer);

    for (const edge of laid.edges) {
      for (const leaf of leaves) {
        if (leaf.id === edge.from || leaf.id === edge.to) continue;
        expect(
          routeIntersectsBox(edge.points, leaf, 0.8),
          `${edge.from}->${edge.to} crosses ${leaf.id}`,
        ).toBe(false);
      }
    }
  });

  it('routes gateway-to-cloud-child connections horizontally after root alignment', () => {
    const laid = layout(parse(SAMPLES.iot.source));
    const relay = laid.edges.find(e => e.from === '200' && e.to === '310');
    const gateway = laid.nodes.find(n => n.id === '200');
    const receiver = laid.nodes.find(n => n.id === '310');
    const points = relay?.points ?? [];
    const end = points[points.length - 1];

    expect(gateway).toBeDefined();
    expect(receiver).toBeDefined();
    expect(centerY(gateway!)).toBe(centerY(receiver!));
    expect(end).toEqual([receiver!.x, centerY(receiver!)]);
    expect(points[0][1]).toBe(end[1]);
  });

  it('keeps the gateway relay label anchor clear of the cloud container title area', () => {
    const laid = layout(parse(SAMPLES.iot.source));
    const relay = laid.edges.find(e => e.from === '200' && e.to === '310');
    const gateway = laid.nodes.find(n => n.id === '200');
    const cloud = laid.nodes.find(n => n.id === '300');

    expect(relay).toBeDefined();
    expect(gateway).toBeDefined();
    expect(cloud).toBeDefined();
    expect(cloud!.x - (gateway!.x + gateway!.w)).toBeGreaterThanOrEqual(32);
    expect(longestSegmentMidpoint(relay!.points)[0]).toBeLessThan(cloud!.x);
  });

  it('lays out the built-in control loop as a compact clockwise loop', () => {
    const laid = layout(parse(SAMPLES.controlLoop.source));
    const feedback = laid.edges.find(e => e.from === '40' && e.to === '30');
    const sensor = laid.nodes.find(n => n.id === '30');
    const controller = laid.nodes.find(n => n.id === '10');
    const driver = laid.nodes.find(n => n.id === '20');
    const target = laid.nodes.find(n => n.id === '40');
    const drive = laid.edges.find(e => e.from === '20' && e.to === '40');
    const error = laid.nodes.find(n => n.id === '12');
    const measured = laid.edges.find(e => e.from === '30' && e.to === '12');

    expect(feedback).toBeDefined();
    expect(sensor).toBeDefined();
    expect(controller).toBeDefined();
    expect(driver).toBeDefined();
    expect(target).toBeDefined();
    expect(drive).toBeDefined();
    expect(error).toBeDefined();
    expect(measured).toBeDefined();
    expect(sensor!.x).toBeLessThan(controller!.x);
    expect(target!.x).toBeLessThan(driver!.x);
    expect(sensor!.y).toBeLessThan(target!.y);
    expect(controller!.y).toBeLessThan(driver!.y);
    expect(laid.height).toBeLessThan(220);
    expect(target!.y - sensor!.y).toBeLessThan(100);
    expect(centerY(sensor!)).toBe(centerY(error!));
    expect(measured!.points[0][1]).toBe(measured!.points.at(-1)![1]);
    expect(drive!.points[0][1]).toBe(drive!.points.at(-1)![1]);
    expect(feedback!.points).toHaveLength(2);
    expect(feedback!.points[0][0]).toBe(feedback!.points[1][0]);
    expect(feedback!.points[0][1]).toBeGreaterThan(feedback!.points[1][1]);
  });

  it('vertically aligns user-authored external control-loop blocks by connection', () => {
    const laid = layout(parse(EXTERNAL_CONTROL_LOOP_SOURCE));
    const sensor = laid.nodes.find(n => n.id === '30');
    const error = laid.nodes.find(n => n.id === '12');
    const driver = laid.nodes.find(n => n.id === '20');
    const target = laid.nodes.find(n => n.id === '40');
    const measured = laid.edges.find(e => e.from === '30' && e.to === '12');
    const drive = laid.edges.find(e => e.from === '20' && e.to === '40');

    expect(sensor).toBeDefined();
    expect(error).toBeDefined();
    expect(driver).toBeDefined();
    expect(target).toBeDefined();
    expect(measured).toBeDefined();
    expect(drive).toBeDefined();
    expect(centerY(sensor!)).toBe(centerY(error!));
    expect(centerY(target!)).toBe(centerY(driver!));
    expect(measured!.points[0][1]).toBe(measured!.points.at(-1)![1]);
    expect(drive!.points[0][1]).toBe(drive!.points.at(-1)![1]);
  });

  it('keeps control-loop routes away from unrelated leaf boxes', () => {
    const laid = layout(parse(SAMPLES.controlLoop.source));
    const leaves = laid.nodes.filter(n => !n.isContainer);

    for (const edge of laid.edges) {
      for (const leaf of leaves) {
        if (leaf.id === edge.from || leaf.id === edge.to) continue;
        expect(
          routeIntersectsBox(edge.points, leaf, 0.8),
          `${edge.from}->${edge.to} crosses ${leaf.id}`,
        ).toBe(false);
      }
    }
  });

  it('routes external GNSS input around unrelated containers in autonomous-driving diagrams', () => {
    const laid = layout(parse(AUTONOMOUS_DRIVING_SOURCE));
    const gnss = laid.edges.find(e => e.from === '300' && e.to === '10');
    const perception = laid.nodes.find(n => n.id === '10');
    const decision = laid.nodes.find(n => n.id === '20');
    const control = laid.nodes.find(n => n.id === '30');

    expect(gnss).toBeDefined();
    expect(perception).toBeDefined();
    expect(decision).toBeDefined();
    expect(control).toBeDefined();
    expect(pointOnBoxBorder(gnss!.points.at(-1)!, perception!)).toBe(true);
    expect(routeIntersectsBox(gnss!.points, perception!, 0)).toBe(false);
    expect(routeIntersectsBox(gnss!.points, decision!, 0.8)).toBe(false);
    expect(routeIntersectsBox(gnss!.points, control!, 0.8)).toBe(false);
  });

  it('keeps autonomous-driving command routes away from unrelated containers', () => {
    const laid = layout(parse(AUTONOMOUS_DRIVING_SOURCE));
    const command = laid.edges.find(e => e.from === '22' && e.to === '30');
    const pointCloud = laid.edges.find(e => e.from === '12' && e.to === '13');
    const perception = laid.nodes.find(n => n.id === '10');
    const control = laid.nodes.find(n => n.id === '30');
    const comm = laid.nodes.find(n => n.id === '40');

    expect(command).toBeDefined();
    expect(pointCloud).toBeDefined();
    expect(perception).toBeDefined();
    expect(control).toBeDefined();
    expect(comm).toBeDefined();
    expect(routeIntersectsBox(command!.points, perception!, 0.8)).toBe(false);
    expect(routeIntersectsBox(command!.points, comm!, 0.8)).toBe(false);
    expect(pointOnBoxBorder(command!.points.at(-1)!, control!)).toBe(true);
    expect(pointInsideBox(command!.points.at(-1)!, control!, 0.5)).toBe(false);
    expect(command!.points.at(-1)![1]).toBe(control!.y);
    expect(terminalSegmentLength(command!.points, false)).toBeGreaterThanOrEqual(5.4);
    expect(terminalSegmentLength(pointCloud!.points, false)).toBeGreaterThanOrEqual(4.6);
  });

  it('starts parent-to-child control arrows inside the parent container', () => {
    const laid = layout(parse(AUTONOMOUS_DRIVING_SOURCE));
    const control = laid.nodes.find(n => n.id === '30');
    const controlChildren = ['31', '32', '33'].map(id => laid.nodes.find(n => n.id === id));

    expect(control).toBeDefined();
    for (const child of controlChildren) expect(child).toBeDefined();
    expect(controlChildren[0]!.y).toBe(controlChildren[1]!.y);
    expect(controlChildren[1]!.y).toBe(controlChildren[2]!.y);
    for (const target of ['31', '32', '33']) {
      const edge = laid.edges.find(e => e.from === '30' && e.to === target);
      const child = laid.nodes.find(n => n.id === target);
      expect(edge).toBeDefined();
      expect(child).toBeDefined();
      expect(pointInsideBox(edge!.points[0], control!, 0.5), `30->${target}`).toBe(true);
      expect(pointOnBoxBorder(edge!.points[0], control!), `30->${target}`).toBe(false);
      expect(edge!.points).toHaveLength(2);
      expect(edge!.points[0][0]).toBe(edge!.points[1][0]);
      expect(edge!.points[0][1]).toBeLessThan(child!.y - 6);
    }
  });

  it('does not route horizontal autonomous-driving inputs into the 21-22 arrow line', () => {
    const laid = layout(parse(AUTONOMOUS_DRIVING_SOURCE));
    const planning = laid.nodes.find(n => n.id === '21');
    const recognition = laid.edges.find(e => e.from === '13' && e.to === '21');
    const plannedPath = laid.edges.find(e => e.from === '21' && e.to === '22');

    expect(planning).toBeDefined();
    expect(recognition).toBeDefined();
    expect(plannedPath).toBeDefined();
    expect(pointOnBoxBorder(recognition!.points.at(-1)!, planning!)).toBe(true);
    expect(recognition!.points.at(-1)).not.toEqual(plannedPath!.points[0]);
  });

  it('lays out dense wearable blocks so main signal flow stays horizontal and power lines stay outside it', () => {
    const doc = parse(WEARABLE_ECG_SOURCE);
    const laid = layout(doc);
    const electrode = laid.nodes.find(n => n.id === '10');
    const amplifier = laid.nodes.find(n => n.id === '20');
    const converter = laid.nodes.find(n => n.id === '30');
    const control = laid.nodes.find(n => n.id === '40');
    const battery = laid.nodes.find(n => n.id === '60');
    const powerToAmplifier = laid.edges.find(e => e.from === '60' && e.to === '20');
    const powerToConverter = laid.edges.find(e => e.from === '60' && e.to === '30');
    const powerToControl = laid.edges.find(e => e.from === '60' && e.to === '40');

    expect(doc.nodes.get('30')?.label.ja).toBe('A/D変換部');
    expect(electrode).toBeDefined();
    expect(amplifier).toBeDefined();
    expect(converter).toBeDefined();
    expect(control).toBeDefined();
    expect(battery).toBeDefined();
    expect(centerY(electrode!)).toBe(centerY(amplifier!));
    expect(centerY(amplifier!)).toBe(centerY(converter!));
    expect(centerY(converter!)).toBe(centerY(control!));
    expect(electrode!.x).toBeLessThan(amplifier!.x);
    expect(amplifier!.x).toBeLessThan(converter!.x);
    expect(converter!.x).toBeLessThan(control!.x);
    expect(centerX(battery!)).toBe(centerX(amplifier!));
    expect(powerToAmplifier).toBeDefined();
    expect(powerToAmplifier!.points).toHaveLength(2);
    expect(powerToAmplifier!.points[0][0]).toBe(powerToAmplifier!.points[1][0]);
    expect(powerToAmplifier!.points[0][1]).toBeGreaterThan(powerToAmplifier!.points[1][1]);
    expect(powerToConverter).toBeDefined();
    expect(powerToControl).toBeDefined();
    expect(powerToConverter!.points.at(-1)).toEqual([centerX(converter!), converter!.y + converter!.h]);
    expect(pointOnBoxBorder(powerToControl!.points.at(-1)!, control!)).toBe(true);
    expect(powerToControl!.points.at(-1)![1]).toBe(control!.y + control!.h);
  });

  it('separates dense wearable signal, display, and radio routes into distinct lanes', () => {
    const laid = layout(parse(WEARABLE_ECG_SOURCE));
    const txData = laid.edges.find(e => e.from === '40' && e.to === '50');
    const displayData = laid.edges.find(e => e.from === '40' && e.to === '70');
    const ecgData = laid.edges.find(e => e.from === '50' && e.to === '200');
    const powerEdges = laid.edges.filter(e => e.from === '60');

    expect(txData).toBeDefined();
    expect(displayData).toBeDefined();
    expect(ecgData).toBeDefined();
    expect(routesHaveSharedLane(txData!.points, displayData!.points, 2)).toBe(false);
    expect(routesHaveSharedLane(txData!.points, ecgData!.points, 2)).toBe(false);
    expect(routesHaveSharedLane(displayData!.points, ecgData!.points, 2)).toBe(false);
    for (const signalEdge of [txData!, displayData!]) {
      for (const powerEdge of powerEdges) {
        expect(
          routesHaveSharedLane(signalEdge.points, powerEdge.points, 2),
          `${signalEdge.from}->${signalEdge.to} shares a lane with ${powerEdge.from}->${powerEdge.to}`,
        ).toBe(false);
      }
    }
  });

  it('keeps unrelated wearable routes out of arrowhead areas', () => {
    const laid = layout(parse(WEARABLE_ECG_SOURCE));
    const arrowEdges = laid.edges.filter(edge => edge.op !== 'line' && edge.op !== 'dashed');

    for (const guarded of arrowEdges) {
      const guards = arrowTipGuards(guarded);
      for (const edge of laid.edges) {
        if (edge === guarded || edgeSharesEndpoint(edge, guarded)) continue;
        for (const guard of guards) {
          expect(
            routeIntersectsBox(edge.points, guard, 0),
            `${edge.from}->${edge.to} crosses arrowhead of ${guarded.from}->${guarded.to}`,
          ).toBe(false);
        }
      }
    }
  });

  it('separates AMR power and docking dashed routes into distinct lanes', () => {
    const laid = layout(parse(AMR_SOURCE));
    const powerEdges = laid.edges.filter(edge => edge.from === '19');
    const dockingEdge = laid.edges.find(edge => edge.from === '300' && edge.to === '18');

    expect(powerEdges).toHaveLength(5);
    expect(dockingEdge).toBeDefined();

    for (let i = 0; i < powerEdges.length; i++) {
      for (let j = i + 1; j < powerEdges.length; j++) {
        expect(
          routesHaveSharedLane(powerEdges[i].points, powerEdges[j].points, 2),
          `${powerEdges[i].from}->${powerEdges[i].to} shares a lane with ${powerEdges[j].from}->${powerEdges[j].to}`,
        ).toBe(false);
      }
    }
    for (const edge of powerEdges) {
      expect(
        routesHaveSharedLane(dockingEdge!.points, edge.points, 2),
        `300->18 shares a lane with ${edge.from}->${edge.to}`,
      ).toBe(false);
    }
  });

  it('separates parallel EV charging power and charging-control routes', () => {
    const laid = layout(parse(EV_FAST_CHARGING_SOURCE));
    const power = laid.edges.find(edge => edge.from === '40' && edge.to === '300' && edge.op === 'line');
    const control = laid.edges.find(edge => edge.from === '40' && edge.to === '300' && edge.op === 'bidir');

    expect(power).toBeDefined();
    expect(control).toBeDefined();
    expect(routesHaveSharedLane(power!.points, control!.points, 2)).toBe(false);
    expect(Math.max(...control!.points.map(([, y]) => y))).toBeLessThan(60);
  });

  it('keeps EV external service routes from deeply sharing lanes with station wiring', () => {
    const laid = layout(parse(EV_FAST_CHARGING_SOURCE));
    const stationRoutes = [
      requiredEdge(laid.edges, '40', '300', 'line'),
      requiredEdge(laid.edges, '40', '300', 'bidir'),
      requiredEdge(laid.edges, '60', '400', 'bidir'),
      requiredEdge(laid.edges, '500', '80', 'dashed-arrow'),
      requiredEdge(laid.edges, '500', '60', 'dashed-arrow'),
    ];

    for (let i = 0; i < stationRoutes.length; i++) {
      for (let j = i + 1; j < stationRoutes.length; j++) {
        expect(
          routesHaveSharedLane(stationRoutes[i].points, stationRoutes[j].points, 4),
          `${stationRoutes[i].from}->${stationRoutes[i].to} shares a lane with ${stationRoutes[j].from}->${stationRoutes[j].to}`,
        ).toBe(false);
      }
    }
  });

  it('keeps EV internal control routes from collapsing onto the same lane', () => {
    const laid = layout(parse(EV_FAST_CHARGING_SOURCE));
    const controlRoutes = [
      requiredEdge(laid.edges, '50', '20', 'arrow'),
      requiredEdge(laid.edges, '50', '30', 'arrow'),
      requiredEdge(laid.edges, '50', '70', 'arrow'),
      requiredEdge(laid.edges, '70', '50', 'arrow'),
      requiredEdge(laid.edges, '80', '50', 'arrow'),
    ];

    for (let i = 0; i < controlRoutes.length; i++) {
      for (let j = i + 1; j < controlRoutes.length; j++) {
        expect(
          routesHaveSharedLane(controlRoutes[i].points, controlRoutes[j].points, 4),
          `${controlRoutes[i].from}->${controlRoutes[i].to} shares a lane with ${controlRoutes[j].from}->${controlRoutes[j].to}`,
        ).toBe(false);
      }
    }
  });
});

function requiredEdge(edges: LaidOutEdge[], from: string, to: string, op?: string): LaidOutEdge {
  const edge = edges.find(e => e.from === from && e.to === to && (op === undefined || e.op === op));
  expect(edge, `${from}->${to}${op ? ` (${op})` : ''}`).toBeDefined();
  return edge!;
}

function centerX(box: Box): number {
  return box.x + box.w / 2;
}

function centerY(box: Box): number {
  return box.y + box.h / 2;
}

function longestSegmentMidpoint(points: [number, number][]): [number, number] {
  let best = 0;
  let bestLen = -1;
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.abs(points[i + 1][0] - points[i][0])
      + Math.abs(points[i + 1][1] - points[i][1]);
    if (len > bestLen) {
      bestLen = len;
      best = i;
    }
  }
  return [
    (points[best][0] + points[best + 1][0]) / 2,
    (points[best][1] + points[best + 1][1]) / 2,
  ];
}

function routeIntersectsBox(points: [number, number][], box: Box, pad: number): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    if (boxInteriorOverlap(points[i], points[i + 1], box, pad) > 0) return true;
  }
  return false;
}

function routeOverlapsBoxBorder(points: [number, number][], box: Box): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    if (boxBorderOverlap(points[i], points[i + 1], box) > 0) return true;
  }
  return false;
}

function routeFitsInsideBox(points: [number, number][], box: Box, inset: number): boolean {
  const left = box.x + inset;
  const right = box.x + box.w - inset;
  const top = box.y + inset;
  const bottom = box.y + box.h - inset;
  return points.every(([x, y]) => x >= left && x <= right && y >= top && y <= bottom);
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

function routesHaveSharedLane(
  a: [number, number][],
  b: [number, number][],
  minOverlap: number,
): boolean {
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      if (segmentsShareLane(a[i], a[i + 1], b[j], b[j + 1], minOverlap)) return true;
    }
  }
  return false;
}

function segmentsShareLane(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number],
  minOverlap: number,
): boolean {
  const aVertical = Math.abs(a1[0] - a2[0]) < 0.001;
  const bVertical = Math.abs(b1[0] - b2[0]) < 0.001;
  if (aVertical !== bVertical) return false;
  if (aVertical) {
    if (Math.abs(a1[0] - b1[0]) > 0.001) return false;
    return intervalOverlap(a1[1], a2[1], b1[1], b2[1]) > minOverlap;
  }
  if (Math.abs(a1[1] - b1[1]) > 0.001) return false;
  return intervalOverlap(a1[0], a2[0], b1[0], b2[0]) > minOverlap;
}

function terminalSegmentLength(points: [number, number][], atStart: boolean): number {
  if (points.length < 2) return 0;
  const a = atStart ? points[0] : points[points.length - 1];
  const b = atStart ? points[1] : points[points.length - 2];
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

function arrowTipGuards(edge: {
  from: string;
  to: string;
  op: string;
  points: [number, number][];
}): Box[] {
  if (edge.points.length < 2) return [];
  const guards: Box[] = [];
  if (edge.op !== 'line' && edge.op !== 'dashed') {
    guards.push(boxAround(edge.points[edge.points.length - 1], 2.8));
  }
  if (edge.op === 'bidir') guards.push(boxAround(edge.points[0], 2.8));
  return guards;
}

function boxAround(point: [number, number], half: number): Box {
  return { x: point[0] - half, y: point[1] - half, w: half * 2, h: half * 2 };
}

function edgeSharesEndpoint(
  a: { from: string; to: string },
  b: { from: string; to: string },
): boolean {
  return a.from === b.from || a.from === b.to || a.to === b.from || a.to === b.to;
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

function boxBorderOverlap(a: [number, number], b: [number, number], box: Box): number {
  if (Math.abs(a[0] - b[0]) < 0.001) {
    const x = a[0];
    if (Math.abs(x - box.x) >= 0.001 && Math.abs(x - (box.x + box.w)) >= 0.001) return 0;
    return intervalOverlap(a[1], b[1], box.y, box.y + box.h);
  }
  if (Math.abs(a[1] - b[1]) < 0.001) {
    const y = a[1];
    if (Math.abs(y - box.y) >= 0.001 && Math.abs(y - (box.y + box.h)) >= 0.001) return 0;
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
