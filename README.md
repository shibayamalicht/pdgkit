# pdgkit

pdgkit は、特許図面記述言語 PatentDSL（`.pdg`）から特許図面を生成する、ブラウザ非依存のライブラリおよびコマンドラインツールです。

`.pdg` は **P**atent **D**iagram **G**rammar の略で、特許図面に必要な符号、包含関係、接続関係を記述するための専用記法を指します。PatentDSL の記法をそのまま用い、ブロック図、フローチャート、シーケンス図、状態遷移図を、定義・包含・接続の 3 種類の文で記述します。入力内容から図種を自動判定し、SVG、PNG、JPEG、PDF、PPTX、編集可能 PPTX、符号表 Markdown、符号表 CSV を出力します。

pdgkit は、本家 PatentDSL がブラウザ上の単一 HTML ツールであるのに対し、その構文解析・自動レイアウト・描画エンジンを Node から、あるいは任意の言語から呼び出せる部品として再実装したものです。AI による明細書作成ツールに組み込み、AI に特許図面を描かせることを主な目的とします。

## 目次

1. [概要](#概要)
2. [PatentDSL との関係](#patentdsl-との関係)
3. [設計方針](#設計方針)
4. [主な機能](#主な機能)
5. [インストール](#インストール)
6. [使い方](#使い方)
   - [AI に自然文で頼む](#ai-に自然文で頼む)
   - [ライブラリとして（Node / TypeScript）](#ライブラリとしてnode--typescript)
   - [コマンドラインとして](#コマンドラインとして)
   - [ChatGPT / Claude などの Web チャットと併用する](#chatgpt--claude-などの-web-チャットと併用する)
   - [Claude Code / Codex などのコーディングエージェントと併用する](#claude-code--codex-などのコーディングエージェントと併用する)
   - [各種 LLM API に組み込む](#各種-llm-api-に組み込む)
   - [MCP サーバとして](#mcp-サーバとして)
7. [AI に図を描かせるワークフロー](#ai-に図を描かせるワークフロー)
8. [基本記法](#基本記法)
9. [ライブラリ API](#ライブラリ-api)
10. [CLI リファレンス](#cli-リファレンス)
11. [出力形式](#出力形式)
12. [アーキテクチャ](#アーキテクチャ)
13. [本家との忠実性](#本家との忠実性)
14. [開発](#開発)
15. [プライバシー](#プライバシー)
16. [ライセンス](#ライセンス)
17. [クレジット](#クレジット)

## 概要

pdgkit は次の 3 つの経路で、あらゆるホストに組み込めます。

- npm ライブラリとして直接 import する（Node / TypeScript）
- コマンドラインツールを子プロセスとして起動する（Python その他、言語を問わない）
- MCP サーバとして公開する（LLM エージェント）

知能（自然言語から良い `.pdg` を書く判断）はホスト側の AI が担い、pdgkit は決定論的な検証と描画に徹します。同じ入力からは常に同じ出力が得られ、乱数・時刻・フォント実測には依存しません。

## PatentDSL との関係

| 項目 | PatentDSL（本家） | pdgkit |
|---|---|---|
| 形態 | 単一 HTML（ブラウザ GUI） | npm ライブラリ + CLI（ヘッドレス） |
| 実行環境 | ブラウザ | Node 18 以上 / 任意言語から子プロセス |
| 主な用途 | 人が手で図を描く | プログラムや AI が図を生成・検証・描画する |
| 入力 | エディタへの手入力 | `.pdg` テキスト（API 引数・ファイル・標準入力） |
| 記法 | `.pdg` | 同一（同じ構文解析・レイアウト・描画を移植） |

`.pdg` ソースは本家と pdgkit で完全に相互運用できます。記法の詳細は [docs/spec.md](docs/spec.md) を参照してください。本家リポジトリは [shibayamalicht/patent_dsl](https://github.com/shibayamalicht/patent_dsl) です。

## 設計方針

- 1 行 = 1 文。改行が文の終わり。
- 文要素は定義・包含・接続の 3 種類のみ。キーワードを持たない。
- 図種は構造から自動推論される。
- 符号（reference numerals）を直接 ID として扱い、明細書本文と照合できる。
- 座標指定・色指定を持たない。レイアウトは自動のみ。特許図面の慣習に従い黒線のみで描画する。

## 主な機能

- テキストから SVG 図面を生成
- PNG / JPEG の高解像度出力（8 倍、白背景）
- A4 PDF 出力（日本語フォント埋め込み、ベクタ。失敗時はラスタにフォールバック）
- PPTX 出力（画像配置）および編集可能 PPTX 出力（図形変換）
- 符号表の Markdown / CSV 出力
- 構文検証と図種アサーション（AI 生成物の自己修正に利用）
- 日本語・英語・日英併記の表示切替
- MCP サーバ（検証・描画ツールの提供）
- コアは外部依存なし、SVG 出力はブラウザも jsdom も不要

## インストール

pdgkit は **Node.js 18 以上**で動きます。

### Node.js を用意する（まだの方へ）

すでに Node.js が入っている場合は次の「pdgkit を入れる」へ。まだの場合は先に入れます。

- **共通（推奨）**: [nodejs.org](https://nodejs.org/) から **LTS 版**のインストーラをダウンロードして実行。
- **macOS**: 上のインストーラ、または [Homebrew](https://brew.sh/) で `brew install node`。
- **Windows**: 上のインストーラ（`.msi`）、または PowerShell で `winget install OpenJS.NodeJS.LTS`。

入れたら、ターミナル（Windows は PowerShell かコマンドプロンプト）で次を実行し、バージョンが表示されれば準備完了です。

```bash
node -v   # v18 以上であること
npm -v
```

### pdgkit を入れる

npm のパッケージ名は **`@shibayama/pdgkit`** です（`pdgkit` は既存パッケージと名前が近いためスコープ付きで公開しています）。インストール後に使えるコマンド名は **`pdgkit`** / **`pdgkit-mcp`** で、`import` するモジュール名は `@shibayama/pdgkit` です。

```bash
npm install @shibayama/pdgkit
```

CLI を単発で使うだけなら、インストール不要で `npx @shibayama/pdgkit` も使えます。

```bash
npx @shibayama/pdgkit render fig1.pdg -o fig1.svg
```

ソースから使う場合:

```bash
git clone https://github.com/shibayamalicht/pdgkit
cd pdgkit
npm install
npm run build
```

ラスタ・PDF・PPTX 出力に用いる依存（`@resvg/resvg-js`、`jspdf`、`jsdom` など）は遅延読み込みされます。SVG と検証だけを使う場合は読み込まれません。

## 使い方

pdgkit の主な使い方は、AI に日本語で頼んで図を作らせることです。まず代表的な頼み方を示し、続いて各実行環境への接続方法を説明します。

### AI に自然文で頼む

pdgkit の主な使い方は、AI に日本語で頼んで図を作らせることです。**コードを実行できる AI**(ChatGPT のコードインタープリタ、Claude Code / Codex などのエージェント)なら、導入から図のファイル生成まで会話内で完結します。確実なのは次の 2 通りです。

- **明示手順プロンプト(下記・推奨)** — 1 つのプロンプトに「pdgkit を使う手順」と「発明」をまとめて渡す。AI が自前で図を描いてしまうのを防げます。
- **MCP 登録** — [MCP サーバとして](#mcp-サーバとして) を一度登録すれば、以降どの会話でも「〜を描いて」と頼むだけで pdgkit が呼ばれます(対応クライアント限定)。

> **注意**: 「図を描いて」とだけ頼むと、AI は pdgkit を使わず**自前で図を生成してしまう**ことがあります(特に ChatGPT のコードインタープリタ)。「pdgkit を使う」ことをプロンプトに含めると確実です。コードを実行できない素のチャットでの使い方は「[C. コードを実行できない素のチャット](#c-コードを実行できない素のチャット)」を参照してください。

#### 明示手順プロンプト(推奨)

次のテンプレの「発明」だけを、図にしたい内容に差し替えて貼り付けます。

```text
pdgkit を使って特許図面を描いてください。自分で図を描かず、必ず下のコマンドを実行して、pdgkit が出力したファイルを返してください。

1. npm install @shibayama/pdgkit
2. npx @shibayama/pdgkit guide を実行し、表示された記法ガイドに従う
3. 下の発明について .pdg を書いて fig.pdg に保存する（図種は内容から最適なものを選ぶ。私が指定したらそれに従う）
4. npx @shibayama/pdgkit validate fig.pdg がエラーなしになるまで直す
5. npx @shibayama/pdgkit render fig.pdg -o fig.svg（PNG なら --to png、PDF なら --to pdf）で図を作り、ダウンロードできるようにする

発明:
撮像装置に関する。本装置は、被写体を撮像して画像信号を出力する撮像部と、
撮像部からの画像信号にノイズ低減とエッジ強調を行う画像処理部と、
画像処理部が処理した画像データを格納する記憶部と、
画像データを外部サーバへ送信する通信部と、これらを制御する制御部と、を備える。
画像は撮像部から画像処理部、画像処理部から記憶部の順に処理され、
記憶部の画像は制御部の指示で通信部を介して外部サーバへ送信される。
```

「発明」は、構成・方法・状態・やりとり・クレーム文など図にしたい内容に置き換えます(書き方は下の「頼み方の例」を参照)。図種を指定したいときは「フローチャートにして」などと一言添え、出力形式は手順 5 を `--to png` / `--to pdf` / `--to pptx`(編集可能版は `--to pptx --editable`)に変えます。

#### 一度セットアップして、続けて頼む(手軽版)

同じ会話で何枚も作るときは、最初に一度だけセットアップを頼み、以降は短い依頼を続けられます。ただし会話が長くなると AI が pdgkit を使うのを忘れて自前描画に戻ることがあります。そうなったら、上の明示手順プロンプトに切り替えてください。

最初に一度だけ、次を貼り付けます。

```text
これから特許図面を作ります。次の準備をして、以降のルールに従ってください。
1. npm install @shibayama/pdgkit を実行する。
2. npx @shibayama/pdgkit guide を実行し、表示された PatentDSL(.pdg)の記法に厳密に従う。
3. 以降この会話では、私が図を頼んだら自分で図を描かず、必ず pdgkit を使うこと。
   .pdg を書いて fig.pdg に保存し、npx @shibayama/pdgkit validate fig.pdg でエラーが無いことを確認してから、
   npx @shibayama/pdgkit render fig.pdg（既定は SVG。指定があれば --to png / jpeg / pdf / pptx）で図のファイルを作り、
   実行したコマンドを短く示して、私がダウンロードできるようにすること。
図種や出力形式は、私が指定しなければ内容から最適なものを選んで構いません。準備ができたら「準備完了」とだけ返してください。
```

「準備完了」と返ってきたら、作りたい図を伝えます。**各依頼の頭に「pdgkit で」と付ける**と、pdgkit 経由が確実になります(コードボックス 1 つが 1 つの依頼。コピーして送ってください)。

**構成・装置（ブロック図になりやすい）** — 何が何を含み、何がどこへ流れるかを書く:

```text
pdgkit で、制御装置の構成図を描いて。制御装置は CPU、メモリ、I/O インターフェースを内蔵し、I/O インターフェースが外部機器へ信号を送る。
```

```text
pdgkit で、センサ端末の構成図を描いて。検出部（温度センサと加速度センサ）、処理部（取得部と判定部）、通信部を備え、検出部から処理部、処理部から通信部の順にデータが流れ、通信部からゲートウェイへ無線送信する。日英併記で。
```

```text
pdgkit で、制御ループの図を描いて。制御システムは制御部・駆動部・センサ部・対象装置から成り、制御部が指令で駆動部を動かし、駆動部が対象装置を駆動し、センサ部が状態を検出して制御部へフィードバックする。
```

**処理・方法（フローチャートになりやすい）** — 手順と分岐・ループを書く:

```text
pdgkit で、検査方法のフローチャートを描いて。画像取得→前処理→特徴抽出→欠陥あり? と進み、欠陥ありなら警告出力、無しなら正常記録、いずれも終了へ。
```

```text
pdgkit で、ログイン処理のフローチャートを描いて。入力→認証成功? で分岐し、成功ならホーム画面へ、失敗なら入力へ戻って再試行する。
```

**状態・やりとり:**

```text
pdgkit で、装置の状態遷移図を描いて。待機・動作中・エラーの3状態があり、起動で動作中、停止で待機、異常でエラー、リセットで待機に戻る。
```

```text
pdgkit で、クライアントとサーバの、認証からリソース取得までのシーケンス図を描いて。認証要求→トークン応答→リソース要求→リソース応答の順。
```

**クレーム文からの変換** — クレーム本文をそのまま貼って図種を指定する:

```text
pdgkit で、次の装置クレームを構成図にして。「撮像部と、前記撮像部が取得した画像を処理する画像処理部と、処理結果を表示する表示部と、を備える撮像装置。」
```

```text
pdgkit で、次の方法クレームをフローチャートにして。「画像を取得するステップと、前記画像から特徴量を抽出するステップと、欠陥の有無を判定するステップと、欠陥が有る場合に警告を出力するステップと、を含む検査方法。」
```

**出力形式を指定したいとき** — 続けて一言頼むだけです（指定しなければ SVG）:

- 出願用の PDF にする → 「さっきの図を PDF にして」
- 編集できる PowerPoint にする → 「編集できる PPTX にして」
- 画像（PNG）にする → 「PNG で出して」
- 日英併記にする → 「日英併記で出して」
- 符号表（符号の説明）も出す → 「符号表も Markdown で出して」

> **AI が自分で図を描いてしまう**ときは、上の「明示手順プロンプト」に切り替えてください。図がうまく描けないときは、AI に「`npx @shibayama/pdgkit guide` をもう一度読んで、`npx @shibayama/pdgkit validate` のエラーが無くなるまで直して」と伝えます。PNG / PDF / PPTX は環境により失敗することがありますが、SVG は確実に出ます。

### ライブラリとして（Node / TypeScript）

pdgkit はコンパイル済みの JavaScript と型定義（`.d.ts`）を同梱しています。**TypeScript のインストールは不要**で、素の JavaScript からも TypeScript からもそのまま使えます（下の例は TypeScript ですが、JavaScript でも同じ `import` で動きます）。

```ts
import { validate, renderToSvg, renderToPng } from '@shibayama/pdgkit';

const source = `#! kind: block
10 = 制御装置 / control device
11 = CPU
12 = メモリ / memory
13 = "I/O インターフェース" / "I/O interface"
20 = 外部機器 / external device
10 : 11 12 13
11 - 12
13 -> 20 : 信号 / signal`;

// 1. まず検証する（AI 生成物は必ず通す）
const result = validate(source);
if (!result.ok) {
  console.error(result.diagnostics);   // 修正のためホスト AI に返す
}

// 2. 描画する
const { svg } = renderToSvg(source, { lang: 'ja' });
const png = await renderToPng(source, { lang: 'ja' });   // Uint8Array
```

依存ゼロの構文解析・レイアウト・描画だけが必要なら `pdgkit/core` から import します。

```ts
import { parse, layout, render } from '@shibayama/pdgkit/core';
```

### コマンドラインとして

```bash
pdgkit render fig1.pdg -o fig1.svg
pdgkit render fig1.pdg --to png -o fig1.png
pdgkit render fig1.pdg --to pdf -o fig1.pdf
pdgkit render fig1.pdg --to pptx --editable -o fig1.pptx
pdgkit render --sample block --lang both -o block.svg

cat fig1.pdg | pdgkit validate -
pdgkit refs fig1.pdg --format csv -o signs.csv
pdgkit samples
```

`<入力>` はファイルパス、`-`（標準入力）、または `--sample <id>` で省略します。

### ChatGPT / Claude などの Web チャットと併用する

使い方は、そのチャットが「コードを実行できるか」で 3 通りに分かれます。コードを実行できるチャットなら、チャット内だけで完結します。

#### A. コードを実行できるチャット（推奨）

ChatGPT のコードインタープリタは、2026 年初頭以降 Node.js と `npm install` に対応しています（一般的なネット接続はオフですが、パッケージのインストールは可能です）。このようなチャットでは、pdgkit を導入して図の生成・ダウンロードまでチャット内で完結できます。**記法ガイドはパッケージに同梱されているので、プロンプトに貼り付ける必要はありません**（`npx @shibayama/pdgkit guide` で読めます）。**図種（ブロック図など）も指定不要で、AI が発明内容から選びます**。

依頼の仕方は、上の「[AI に自然文で頼む](#ai-に自然文で頼む)」の**明示手順プロンプト**をそのまま使ってください（「発明」だけ差し替え）。「図を描いて」とだけ頼むと AI が自前で図を生成してしまうことがあるため、pdgkit を使う手順を明示するこの形が確実です。

注: PNG / JPEG / PDF / PPTX はネイティブ依存（`@resvg/resvg-js`）などを使うため、コンテナ環境に依存します。確実に動くのは依存ゼロの SVG です。Node が使える環境なら全形式が動きます。

#### B. ブラウザ内 JavaScript だけ実行できるチャット（Claude.ai の分析ツールなど）

`npm install` は使えませんが、ブラウザ用のグローバルバンドル `dist/pdgkit.global.js`（依存ゼロ・約 48KB の IIFE）を貼り付ければ、SVG の生成と検証ができます。PNG / PDF / PPTX はネイティブ依存のためこの環境では作れません。バンドルは描画器であって記法の説明は含まないので、AI に `.pdg` を書かせる場合は下の C のチートシート（または `pdgkit guide` の全文）も一緒に渡してください。

このバンドルは、本物の `document` がある環境でも内部の SVG シリアライザだけで動作し、ページの `document` を書き換えません。

使い方:

1. `https://unpkg.com/@shibayama/pdgkit`（= 同梱の `dist/pdgkit.global.js`）の中身を実行欄に貼り付ける。グローバル変数 `pdgkit` が定義される。
2. 続けて pdgkit を呼ぶ。

```js
// pdgkit.global.js を貼った後で:
const src = `#! kind: block
10 = 制御装置 / control device
11 = CPU
12 = メモリ / memory
10 : 11 12
11 -> 12 : 信号 / signal`;

const v = pdgkit.validate(src);                 // { ok, kind, diagnostics, ... }
const { svg } = pdgkit.renderToSvg(src, { lang: 'ja' });
// svg を画面に表示する、またはファイルとして出力する
```

ページに組み込む場合は CDN から読み込むこともできます。

```html
<script src="https://unpkg.com/@shibayama/pdgkit"></script>
<script>
  const { svg } = pdgkit.renderToSvg("10 = A\n11 = B\n10 : 11");
</script>
```

グローバル `pdgkit` には `renderToSvg` / `toSvgString` / `validate` / `parse` / `layout` / `render` / `refsToMarkdown` / `refsToCsv` などが含まれます。ビルドは `npm run build` で `dist/pdgkit.global.js` を生成します。

#### C. コードを実行できない素のチャット

このケースだけはパッケージを使えないため、AI に記法を伝える必要があります。とはいえ全文を貼らなくても、次の短いチートシートで簡単な図は十分に書けます。AI には `.pdg` テキストだけを書かせ、その出力を手元の pdgkit（または本家 PatentDSL の HTML）で図にします。図種は指定しなくても、AI が発明内容から選びます。

```text
あなたは特許図面を PatentDSL（.pdg）で書くアシスタントです。次の記法で
.pdg のコードブロックだけを出力してください。

- 1 行 1 文。3 種類: 定義「10 = 名称 / name」、包含「親 : 子 子」、
  接続「A -> B : ラベル」（演算子の前後は半角スペース。連鎖 A -> B -> C は不可、1 行 1 本）。
- 1 行目に図種を宣言: #! kind: block | flow | state | seq。
- 図種は内容から選ぶ: 構成・〜を備える = block、処理の流れ = flow（末尾「?」で
  条件分岐の菱形）、状態と遷移 = state（初期・終端は *）、主体間の往復 = seq。
- ラベルは「日本語 / english」。

発明:
（ここに発明の構成を、できるだけ具体的に書く。例: どの部が何を含み、
　どの部からどの部へ何が渡されるか、外部機器との関係はどうか、など）
```

より複雑な図や高い確実性が必要なときは、`npx @shibayama/pdgkit guide`（または同梱の [docs/ai-authoring-guide.md](docs/ai-authoring-guide.md)）の全文を貼ると精度が上がります。

得られた出力を保存して描画します。

```bash
pbpaste > fig1.pdg          # クリップボードから保存（macOS の例）
pdgkit validate fig1.pdg    # 検証（エラーがあればチャットに戻して直させる）
pdgkit render fig1.pdg -o fig1.svg
```

### Claude Code / Codex などのコーディングエージェントと併用する

シェルを実行できるエージェントは、pdgkit を直接呼び出せます。

1. プロジェクトに pdgkit を導入する（`npm install @shibayama/pdgkit`）。
2. エージェントに記法ガイドを読ませる（例: 「`npx @shibayama/pdgkit guide` を実行してその記法に従い、`.pdg` を書いて、`pdgkit validate` が通るまで直してから `pdgkit render` で図にして」）。ガイドは同梱なので貼り付け不要。図種も指定不要で、内容から選ばせてよい。
3. エージェントは `.pdg` を生成し、`pdgkit validate` で自己検証し、`pdgkit render` で図を書き出す。

さらに [MCP サーバ](#mcp-サーバとして)を登録すると、エージェントは `pdg_render`（`format: png`）で図を画像として受け取り、レイアウトを目で確認して直すループを回せます。

### 各種 LLM API に組み込む

明細書作成ツールに組み込む基本形は「ガイドを system に入れて `.pdg` を生成 → `validate()` で検証 → 通れば描画」です。

Node（Anthropic SDK の例。任意のチャット API で同様に書けます）:

```ts
import Anthropic from '@anthropic-ai/sdk';
import { loadAuthoringGuide, validate, renderToPng } from '@shibayama/pdgkit';

// 記法ガイドはパッケージ同梱。これを system プロンプトに入れるだけ（貼り付け不要）。
const guide = loadAuthoringGuide();

const client = new Anthropic();

async function draw(description: string): Promise<Uint8Array> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: description }];
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2000,
      system: guide,
      messages,
    });
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    const pdg = extractCodeBlock(text);
    const v = validate(pdg);
    if (v.ok) return renderToPng(pdg, { lang: 'ja' });
    // 検証エラーを返して修正させる
    messages.push({ role: 'assistant', content: text });
    messages.push({ role: 'user', content: `次の診断を直して .pdg を再出力してください:\n${JSON.stringify(v.diagnostics)}` });
  }
  throw new Error('valid な .pdg を生成できませんでした');
}

function extractCodeBlock(text: string): string {
  const m = text.match(/```(?:pdg)?\n([\s\S]*?)```/);
  return (m ? m[1] : text).trim();
}
```

Python（API で `.pdg` を得て、CLI を子プロセスで描画する例）:

```python
import subprocess

def render_pdg(pdg_source: str, to: str = "svg", out: str = "fig.svg") -> None:
    # まず検証
    v = subprocess.run(["pdgkit", "validate", "-"], input=pdg_source,
                       text=True, capture_output=True)
    if v.returncode != 0:
        raise RuntimeError(v.stderr)   # 診断を LLM に戻して再生成する
    # 描画
    subprocess.run(["pdgkit", "render", "-", "--to", to, "-o", out],
                   input=pdg_source, text=True, check=True)
```

ガイド本文は、インストール後 `node_modules/@shibayama/pdgkit/docs/ai-authoring-guide.md` にあります。

### MCP サーバとして

MCP（Model Context Protocol）に対応した AI クライアント（Claude Desktop / Claude Code / Codex CLI など）に pdgkit を **一度だけ登録**しておくと、以後は**どの会話でも**「〜の図を描いて」と頼むだけで、AI が pdgkit を呼び出して図を作ります。「AI に自然文で頼む」のようにセットアップ依頼を毎回貼る必要がなくなり、図の確認・修正・出力までその場で完結します。

**用意するもの**: Node.js 18 以上（`pdgkit-mcp` の実行に必要。導入は[インストール](#インストール)を参照）と、Claude Desktop / Claude Code / Codex CLI のいずれか。

#### 1. pdgkit を入れる

```bash
npm install -g @shibayama/pdgkit
```

これで MCP サーバの起動コマンド `pdgkit-mcp` が使えるようになります。グローバル導入したくない場合は、次の登録で `npx` を使う形にできます。

#### 2. AI クライアントに登録する

**Claude Desktop の場合**

設定 → 開発者 →「構成を編集（Edit Config）」から、次の設定ファイルを開きます（直接編集してもOK）。

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

`mcpServers` に pdgkit を追加して保存します。

```json
{
  "mcpServers": {
    "pdgkit": { "command": "pdgkit-mcp" }
  }
}
```

グローバル導入していない場合は、`npx` 経由にします（事前インストール不要）。

```json
{
  "mcpServers": {
    "pdgkit": { "command": "npx", "args": ["-y", "--package", "pdgkit", "pdgkit-mcp"] }
  }
}
```

保存したら、**Claude Desktop を完全に終了して再起動**してください（再起動しないと反映されません）。

**Claude Code の場合**

ターミナルで 1 コマンドです。

```bash
claude mcp add pdgkit -- pdgkit-mcp
# グローバル導入していない場合:
claude mcp add pdgkit -- npx -y --package @shibayama/pdgkit pdgkit-mcp
```

`claude mcp list` に pdgkit が表示されれば登録完了です。

**Codex CLI（OpenAI）の場合**

Codex CLI を入れていなければ入れます。MCP 対応版が必要です（`codex mcp` サブコマンドがあれば対応しています）。

```bash
npm install -g @openai/codex   # 既に入っている場合は最新へ更新
codex --version                # バージョン確認
```

登録はターミナルで 1 コマンドです。

```bash
codex mcp add pdgkit -- pdgkit-mcp
# グローバル導入していない場合:
codex mcp add pdgkit -- npx -y --package @shibayama/pdgkit pdgkit-mcp
```

または設定ファイル `~/.codex/config.toml` に直接書きます。

```toml
[mcp_servers.pdgkit]
command = "pdgkit-mcp"
# グローバル導入していない場合は command/args を次のようにする:
# command = "npx"
# args = ["-y", "--package", "pdgkit", "pdgkit-mcp"]
```

`codex mcp list` に pdgkit が表示されれば登録完了です。

#### 3. 使う

あとは普通に日本語で頼むだけです（1 つずつ送れます）。例:

```text
制御装置の構成図を描いて。制御装置は CPU、メモリ、I/O インターフェースを内蔵し、I/O インターフェースが外部機器へ信号を送る。
```

```text
さっきの図を PNG で見せて。
```

```text
編集できる PPTX にして。
```

Claude は内容に応じて次のツールを使い分けます（あなたが意識する必要はありません）。

| ツール | 内容 |
|---|---|
| `pdg_validate` | `.pdg` を検証し、推論図種・宣言図種・診断を返す |
| `pdg_render` | `.pdg` を描画。`format` で svg / png / jpeg / pdf / pptx を選択（`editable: true` で編集可能 PPTX） |
| `pdg_refs` | 符号表（Markdown / CSV） |

**出力の受け取り方**:

- SVG はテキスト、PNG / JPEG は**画像としてその場に表示**されます。
- PDF / PPTX は**ファイルに保存**され、保存先のフルパスが返されます。保存先は `pdgkit-mcp` の作業ディレクトリです。**Claude Code では、開いているワークスペース（作業ディレクトリ）にそのまま保存されます**（`figure.pptx` など）。Claude Desktop はサーバの起動場所によって作業ディレクトリが変わるため、置き場所を決めたいときだけ「〜に保存して」と保存先を伝えてください。

#### うまくいかないとき

- ツールが出てこない → Claude Desktop を**完全に再起動**。Claude Code は `claude mcp list`、Codex は `codex mcp list` で登録を確認。
- `pdgkit-mcp` が見つからない → `npm install -g @shibayama/pdgkit` を実行、または npx 形式の登録に変更。**Claude Desktop（GUI アプリ）はターミナルと PATH が異なり、グローバル導入しても見つからないことがあります**。その場合は `which pdgkit-mcp`（macOS / Linux）で表示される**フルパス**を `command` に指定してください。
- Node が無い → Node.js 18 以上をインストール。
- `npm run mcp` は pdgkit のソースを clone して pdgkit 自体を開発する人向けのショートカットで、通常の利用では使いません。

## AI に図を描かせるワークフロー

組み込み先では次のループを推奨します。

```text
ホスト AI が .pdg を生成
  -> validate() で検証
  -> エラーがあれば診断をホスト AI に返して修正させる（繰り返す）
  -> ok になったら renderToSvg / renderToPng などで描画
  -> 必要なら描画結果を AI に見せて、構造を直させる
```

要点は次の 3 つです。

1. 生成した `.pdg` は必ず `validate()` を通す。構文ミスは機械的に検出・修正できる。
2. 図種は宣言ではなく構造の結果である。包含 `:` が 1 つでもあればブロック図、ラベル末尾 `?` でフローチャート、符号 `*` で状態遷移図、`<->` や往復でシーケンス図に自動的に切り替わる。意図しない図種への変化を防ぐため、ソース冒頭に図種アサーション（`#! kind: block` など）を書かせる。
3. 図をまたぐ符号の一貫性はホスト側で管理する。1 ファイル 1 図が原則。

AI に渡す詳細な記述ガイドは [docs/ai-authoring-guide.md](docs/ai-authoring-guide.md) にあります。ホストのシステムプロンプトへそのまま注入できます。

自然文での具体的な指示例(構成図・フローチャート・状態遷移図・シーケンス図・クレーム文からの変換・出力形式の指定)は、[使い方 の「AI に自然文で頼む」](#ai-に自然文で頼む)を参照してください。

## 基本記法

```pdg
# 定義: 符号にラベル（日本語 / english）を付ける
10 = 制御装置 / control device
11 = CPU

# 包含: 親 : 子 子 ...（これがあるとブロック図になる）
10 : 11 12

# 接続: 符号 演算子 符号 [ : ラベル ]（演算子の前後は半角スペース必須）
11 -> 12 : 信号 / signal
```

接続演算子は次のとおりです。

| 演算子 | 内容 | | 演算子 | 内容 |
|---|---|---|---|---|
| `-` | 単線 | | `..` | 破線 |
| `->` | 矢印 | | `.>` | 破線矢印 |
| `<-` | 逆矢印 | | `=>` | 太矢印 |
| `<->` | 双方向 | | | |

完全な仕様は [docs/spec.md](docs/spec.md) を参照してください。

## ライブラリ API

すべて `import { ... } from '@shibayama/pdgkit'` で利用できます。型定義を同梱します。

| 関数 | 種別 | 内容 |
|---|---|---|
| `renderToSvg(source, opts?)` | 同期 | SVG 文字列を含む結果を返す |
| `renderToPng(source, opts?)` | 非同期 | PNG（`Uint8Array`） |
| `renderToJpeg(source, opts?)` | 非同期 | JPEG（`Uint8Array`） |
| `renderToPdf(source, opts?)` | 非同期 | A4 PDF（`Uint8Array`） |
| `renderToPptx(source, opts?)` | 非同期 | PPTX（`Uint8Array`、`editable: true` で編集可能版） |
| `validate(source)` | 同期 | 検証結果（`ok`、`kind`、`diagnostics` ほか） |
| `refsToMarkdown(parse(source))` | 同期 | 符号表 Markdown |
| `refsToCsv(parse(source))` | 同期 | 符号表 CSV |
| `toSvgString(source, lang?)` | 同期 | SVG 文字列のみ |
| `loadAuthoringGuide()` | 同期 | 同梱の AI 記法ガイドを文字列で返す（system プロンプト注入用） |

主なオプション:

- `renderToSvg`: `lang`（`ja` / `en` / `both`、既定 `ja`）、`crop`（既定 true）、`bleed`（既定 3）、`targetSide`（既定 1600）、`xmlDeclaration`（既定 true）
- `renderToPng` / `renderToJpeg`: `lang`、`scale`（既定 8）、`bleed`（既定 3）
- `renderToPdf`: `lang`、`bleed`、`vector`（既定 true、失敗時ラスタにフォールバック）、`scale`
- `renderToPptx`: `lang`、`editable`（既定 false）、`scale`、`bleed`

低レベル API（`parse` → `layout` → `render`）も公開しています。

## CLI リファレンス

```text
pdgkit render   <入力> [--to svg|png|jpeg|pdf|pptx] [--lang ja|en|both] [-o ファイル] [--no-crop] [--editable]
pdgkit validate <入力>
pdgkit refs     <入力> [--format md|csv] [-o ファイル]
pdgkit guide
pdgkit samples
pdgkit version
pdgkit help
```

- `<入力>`: ファイルパス / `-`（標準入力）/ `--sample <id>`
- `pdgkit guide`: AI 向けの記法ガイド（`.pdg` の書き方）を標準出力に印字。AI に貼り付けさせる代わりに読ませる用途。
- `-o, --out`: 出力先（省略時は標準出力。バイナリ形式は `-o` 必須）
- 進捗・診断は標準エラー出力へ。成果物は標準出力へ。
- 終了コード: `0` 成功、`1` 検証エラーまたは実行時エラー、`2` 使い方の誤り

MCP サーバは `pdgkit-mcp` で起動します。

## 出力形式

| 形式 | 内容 |
|---|---|
| SVG | 実描画範囲で切り出したベクタ画像（本家と同じ寸法計算） |
| PNG / JPEG | 高解像度ラスタ（既定 8 倍、白背景、`@resvg/resvg-js`） |
| PDF | A4・IPAex ゴシック埋め込み・ベクタ（jsPDF + svg2pdf.js）。失敗時はラスタにフォールバック |
| PPTX | 16:9 スライドに高解像度画像を配置 |
| PPTX（編集） | SVG の各要素を編集可能な PowerPoint 図形・線・文字へ変換（`--editable`） |
| 符号 MD / CSV | 符号表 |

SVG / PNG / JPEG / PPTX は実描画範囲を計算して小さな余白を付けて切り出します。表示言語の切替はすべての出力に反映されます。すべて Node のみ（ブラウザ不要）で動作します。

## アーキテクチャ

```text
ホスト組み込みの入口
  npm import（Node / TS） / CLI（任意言語の子プロセス） / MCP（エージェント）
        |
src/node  ブラウザ非依存レンダラ
  renderToSvg / renderToPng / renderToJpeg / renderToPdf / renderToPptx
  validate / content-box / dom（SVG シム） / mcp
        |
src/core  純粋・依存ゼロ（PatentDSL から移植、唯一の真実源）
  parse -> layout -> render（SVG 要素） -> refs
```

- コアは純粋で、DOM も外部依存も使わない。`render()` も `createElementNS` / `setAttribute` / `appendChild` / `textContent` の 4 操作のみを使う。
- SVG シム（[src/node/dom.ts](src/node/dom.ts)）がその 4 操作を実装し、XML を正しくエスケープしてシリアライズする。SVG 出力は jsdom 不要・依存ゼロ。jsdom は PDF 経路（svg2pdf が SVG DOM を要求）でのみ用いる。
- 実描画範囲の切り出しは `getBBox()` を使わず、[src/node/content-box.ts](src/node/content-box.ts) が生成済み SVG モデルを走査し、`layout` と同じ文字幅推定で解析的に算出する。
- 決定論。同じ入力からは同じ出力（バイト一致）が得られる。

## 本家との忠実性

- [src/core](src/core) は PatentDSL のソースを基に移植している。本家からの変更は次の 2 点のみ: (1) コンテンツボックス計算で再利用するための `estimateTextWidth` の `export` 追加、(2) フローチャート・状態遷移図で前のランクへ戻る辺（ループ・リトライ）を側方のレーンへ回し、前進線との重なりを避けるレイアウト改良。
- 本家のテスト（構文解析・レイアウト・レイアウト回帰・ラベル配置）を移植し、すべて合格している。
- SVG の切り出し余白（3 単位）・表示寸法（長辺 1600px 以上）は本家の定数と一致する。

## 開発

```bash
npm install
npm run typecheck
npm test          # vitest（コア移植 + Node 層、計 137 テスト）
npm run cli -- render --sample block -o /tmp/x.svg
npm run mcp       # MCP サーバを起動
npm run build     # tsup で dist/（ESM + CJS + 型定義）を生成
```

ディレクトリ構成:

```text
pdgkit/
├── src/
│   ├── core/      純粋コア（PatentDSL 移植）
│   ├── node/      dom / content-box / assets / svg / raster / pdf
│   │              ooxml / pptx / validate / mcp / index
│   └── index.ts   パッケージのメイン入口
├── bin/
│   ├── pdgkit.ts      CLI
│   └── pdgkit-mcp.ts  MCP サーバ（stdio）
├── tests/         移植テスト + Node 層テスト
├── examples/      サンプル .pdg（9 種）
├── assets/        ipaexg.ttf と IPA フォントライセンス全文
├── docs/          spec.md / ai-authoring-guide.md
└── .github/workflows/ci.yml
```

## プライバシー

pdgkit はローカルで動作します。図面生成にあたりネットワーク通信は行いません。LLM API と組み合わせる場合の通信はホスト側の責任範囲です。

## ライセンス

pdgkit 本体は MIT ライセンスです。[LICENSE](LICENSE) を参照してください。

同梱フォント `assets/ipaexg.ttf`（IPAex ゴシック）は IPA フォントライセンス v1.0 に従います（MIT とは別のライセンスです）。全文を [assets/IPA_Font_License_Agreement_v1.0.txt](assets/IPA_Font_License_Agreement_v1.0.txt) に同梱しています。再配布の際は同ライセンス全文を必ず添付してください。

pdgkit は [PatentDSL](https://github.com/shibayamalicht/patent_dsl)（© 2026 しばやま, MIT）から DSL 文法・レイアウト・描画を継承しています。

## クレジット

Copyright (c) 2026 しばやま（PatentDSL 作者）

- PatentDSL — pdgkit の母体。記法と特許図面に特化した自動レイアウト・描画の設計。[shibayamalicht/patent_dsl](https://github.com/shibayamalicht/patent_dsl)
- IPAex ゴシック — 情報処理推進機構（IPA）。同梱日本語フォント。
