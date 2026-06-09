export type PatternId =
  | 'cond' | 'container' | 'external'
  | 'seq' | 'state' | 'bidir'
  | 'hierarchy' | 'pipeline' | 'parallel'
  | 'handshake' | 'state_with_cond' | 'system';

export const PATTERN_LABEL: Record<PatternId, string> = {
  cond:            '条件分岐',
  container:       '親子構成',
  external:        '親子+外部',
  seq:             'シーケンス',
  state:           '状態遷移',
  bidir:           '双方向通信',
  hierarchy:       '3階層構成',
  pipeline:        'N段階処理',
  parallel:        '並列処理',
  handshake:       '通信ハンドシェイク',
  state_with_cond: '状態判定フロー',
  system:          'システム全体',
};

export const PATTERN_SOURCE: Record<PatternId, string> = {
  cond: `S100 = 開始 / Start
S110 = 判定? / Decision?
S120 = Yes処理 / Yes Process
S130 = No処理 / No Process
S140 = 終了 / End
S100 -> S110
S110 -> S120 : Yes
S110 -> S130 : No
S120 -> S140
S130 -> S140`,

  container: `10 = 親装置 / Parent
11 = 部品1 / Part 1
12 = 部品2 / Part 2
13 = 部品3 / Part 3
10 : 11 12 13`,

  external: `10 = 制御装置 / control device
11 = 入力部 / input
12 = 処理部 / processor
20 = 外部機器 / external device
10 : 11 12
12 -> 20 : 信号 / signal`,

  seq: `100 = クライアント / client
200 = サーバ / server
100 -> 200 : 要求 / request
200 -> 100 : 応答 / response
100 -> 200 : 切断 / disconnect`,

  state: `S1 = 待機 / Idle
S2 = 動作中 / Running
* -> S1
S1 -> S2 : 起動 / start
S2 -> S1 : 停止 / stop`,

  bidir: `100 = 端末A / Terminal A
200 = 端末B / Terminal B
100 <-> 200 : 通信 / comm`,

  hierarchy: `100 = システム / System
10 = サブシステムA / Subsystem A
20 = サブシステムB / Subsystem B
11 = 部品A1 / Part A1
12 = 部品A2 / Part A2
21 = 部品B1 / Part B1
22 = 部品B2 / Part B2
100 : 10 20
10 : 11 12
20 : 21 22`,

  pipeline: `S100 = 入力 / Input
S110 = 前処理 / Preprocess
S120 = 主処理 / Main Process
S130 = 後処理 / Postprocess
S140 = 出力 / Output
S100 -> S110
S110 -> S120
S120 -> S130
S130 -> S140`,

  parallel: `S100 = 開始 / Start
S110 = 分岐 / Branch
S120 = 経路A / Path A
S130 = 経路B / Path B
S140 = 経路C / Path C
S150 = 合流 / Join
S160 = 終了 / End
S100 -> S110
S110 -> S120
S110 -> S130
S110 -> S140
S120 -> S150
S130 -> S150
S140 -> S150
S150 -> S160`,

  handshake: `100 = 端末 / Terminal
200 = サーバ / Server
100 -> 200 : SYN要求 / SYN
200 -> 100 : SYN+ACK / SYN+ACK
100 -> 200 : ACK応答 / ACK
100 <-> 200 : データ交換 / data exchange
100 -> 200 : FIN / FIN
200 -> 100 : ACK / ACK`,

  state_with_cond: `S100 = 待機状態 / Idle state
S110 = 検証処理 / Verify
S120 = OK? / OK?
S130 = 完了状態 / Done state
S140 = 失敗状態 / Failed state
S150 = 再試行 / Retry
S100 -> S110 : 要求 / request
S110 -> S120 : 判定 / check
S120 -> S130 : OK
S120 -> S140 : NG
S140 -> S150
S150 -> S100`,

  system: `100 = システム本体 / Main system
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
30 <-> 40 : 通信 / comm`,
};
