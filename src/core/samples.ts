export const SAMPLE_ORDER = [
  'block',
  'system',
  'iot',
  'imagePipeline',
  'controlLoop',
  'flow',
  'state',
  'seq',
  'handshake',
] as const;

export type SampleId = typeof SAMPLE_ORDER[number];

type Sample = { label: string; hint: string; source: string };

export const SAMPLES: Record<SampleId, Sample> = {
  block: {
    label: 'ブロック図',
    hint: '「:」を使うとブロック図になる',
    source: `# ブロック図(装置クレーム用)
# ヒント:「:」で包含関係を書く → ブロック図と判定される

10 = 制御装置 / control device
11 = CPU
12 = メモリ / memory
13 = "I/O インターフェース" / "I/O interface"
20 = 外部機器 / external device

10 : 11 12 13

11 - 12
11 - 13
13 -> 20 : 信号 / signal
`,
  },
  system: {
    label: 'システム全体',
    hint: '階層構成 + 外部接続',
    source: `# システム全体(階層+外部接続)
# ヒント: 内部ブロックと外部装置を分けて書くと、特許図面らしい構成になる

100 = システム本体 / Main system
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
30 <-> 40 : 通信 / comm
`,
  },
  iot: {
    label: 'IoT/クラウド',
    hint: 'センサ端末・ゲートウェイ・クラウドの典型構成',
    source: `# IoT/クラウド構成
# ヒント: 端末内部の構成とクラウド側の構成を別コンテナにする

100 = センサ端末 / sensor terminal
10 = 検出部 / detector
11 = 温度センサ / temperature sensor
12 = 加速度センサ / acceleration sensor
20 = 処理部 / processor
21 = 取得部 / acquisition unit
22 = 判定部 / determination unit
30 = 通信部 / communication unit
200 = ゲートウェイ / gateway
300 = クラウドサーバ / cloud server
310 = 受信部 / receiver
320 = 解析部 / analyzer
330 = 記憶部 / storage

100 : 10 20 30
10 : 11 12
20 : 21 22
300 : 310 320 330

10 -> 20 : センサ値 / sensor value
20 -> 30 : 送信データ / transmission data
30 .> 200 : 無線 / wireless
200 -> 310 : 中継 / relay
310 -> 320 : データ / data
320 -> 330 : 結果 / result
`,
  },
  imagePipeline: {
    label: '画像処理',
    hint: '画像入力から判定結果までの処理パイプライン',
    source: `# 画像処理パイプライン(方法クレーム用)
# ヒント: 片方向の接続のみならフローチャートとして描画される

S100 = 画像を取得 / Acquire image
S110 = 前処理 / Preprocess
S120 = 特徴量を抽出 / Extract features
S130 = 欠陥あり? / Defect?
S140 = アラートを出力 / Output alert
S150 = 正常結果を記録 / Record normal result
S160 = 終了 / End

S100 -> S110
S110 -> S120
S120 -> S130
S130 -> S140 : Yes
S130 -> S150 : No
S140 -> S160
S150 -> S160
`,
  },
  controlLoop: {
    label: '制御ループ',
    hint: 'センサ・制御器・アクチュエータのフィードバック構成',
    source: `# 制御ループ(装置クレーム用)
# ヒント: ループする構成は、1つのシステム内で時計回りに並べると読みやすい

100 = 制御システム / control system
10 = 制御部 / controller
11 = 目標値取得部 / target acquisition unit
12 = 偏差算出部 / error calculator
13 = 指令生成部 / command generator
20 = 駆動部 / driver
30 = センサ部 / sensor unit
40 = 対象装置 / controlled object

100 : 30 10 40 20
10 : 11 12 13

30 -> 12 : 測定値 / measured value
11 -> 12 : 目標値 / target value
12 -> 13 : 偏差 / error
13 -> 20 : 指令 / command
20 -> 40 : 駆動信号 / drive signal
40 .> 30 : フィードバック / feedback
`,
  },
  flow: {
    label: 'フローチャート',
    hint: 'ラベルに「?」がある → フローと判定',
    source: `# フローチャート(方法クレーム用)
# ヒント:ラベル末尾に「?」 → 菱形(条件分岐)に自動推論

S100 = 開始 / Start
S110 = 条件A? / "Condition A?"
S120 = 処理X / Process X
S130 = 処理Y / Process Y
S140 = 終了 / End

S100 -> S110
S110 -> S120 : Yes
S110 -> S130 : No
S120 -> S140
S130 -> S140
`,
  },
  state: {
    label: '状態遷移図',
    hint: '「*」を使う → 状態遷移と判定',
    source: `# 状態遷移図
# ヒント:「*」が初期/終端の符号(黒丸で描画)

S1 = 待機 / Idle
S2 = 動作中 / Running
S3 = エラー / Error

* -> S1
S1 -> S2 : 起動 / start
S2 -> S1 : 停止 / stop
S2 -> S3 : 異常 / fault
S3 -> S1 : リセット / reset
S3 -> *
`,
  },
  seq: {
    label: 'シーケンス図',
    hint: '「:」も「?」も「*」もない → シーケンス',
    source: `# シーケンス図(プロトコル系)
# ヒント:包含も?も*も無い → シーケンス図として描画
#         アクタは登場順に左から並ぶ

100 = クライアント / client
200 = サーバ / server

100 -> 200 : 認証要求 / auth request
200 -> 100 : トークン / token
100 -> 200 : リソース要求 / resource request
200 -> 100 : リソース応答 / resource response
`,
  },
  handshake: {
    label: 'ハンドシェイク',
    hint: '要求/応答/確立/終了の通信シーケンス',
    source: `# 通信ハンドシェイク(シーケンス図)
# ヒント: 往復メッセージがあるとシーケンス図になる

100 = 端末 / terminal
200 = サーバ / server

100 -> 200 : 接続要求 / connect request
200 -> 100 : 応答 / response
100 -> 200 : 認証情報 / credentials
200 -> 100 : 認証結果 / auth result
100 <-> 200 : データ通信 / data exchange
100 -> 200 : 切断要求 / disconnect
200 -> 100 : 切断完了 / disconnected
`,
  },
};
