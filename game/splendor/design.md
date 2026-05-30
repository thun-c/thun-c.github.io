# GitHub Pages版「宝石の煌めき」設計案

## 目的

GitHub Pagesで公開された `game/splendor/index.html` をウェブブラウザで開くだけで遊べる、「宝石の煌めき」風ゲームを作る。

- インストール不要
- ユーザー側のサーバー起動不要
- ユーザー側のファイル操作不要
- キーボード不要
- マウス操作だけで全手番を完結
- 2-4人の同じ端末での対面プレイを優先
- 公式画像や商標素材は使わず、種類・数字・アイコン風の自作UIで表現する

## 想定する実行方法

ユーザーはGitHub PagesのURLにアクセスするだけでよい。HTML、CSS、JavaScript、JSONはすべて同じリポジトリ内の静的ファイルとして配信する。

```text
game/splendor/
  index.html
  design.md
  rule.md
  css/
    style.css
  data/
    cards.json
    nobles.json
  js/
    ai.js
    game.js
    ui.js
    main.js
```

カード・貴族データは `data/cards.json` と `data/nobles.json` に分け、起動時に `fetch()` で読み込む。GitHub Pages上ではHTTPS配信になるため、ユーザー側はローカルファイル制限を意識しなくてよい。

`js/ai.js` はCPU対戦用に確保しておく。MVPでは空に近い実装でもよいが、後からCPUを追加できるよう、ゲームロジックはUIやマウスイベントに依存させない。

開発中に手元で確認する場合だけ、必要に応じてローカルHTTPサーバーを使う。これは開発者向けの都合であり、遊ぶユーザーには要求しない。

## 対応範囲

### MVPで作るもの

- 2-4人の同じ端末での対面プレイ
- 基本セットのルール
- 発展カード3段、各4枚公開
- 宝石トークン、黄金トークン
- 公開されている発展カードの予約、購入
- 貴族タイルの獲得
- 10トークン上限の処理
- 15点到達後の最終ラウンド
- 勝敗判定
- 操作ログ
- 新規ゲーム開始
- CPU対戦を後から追加しやすい状態・アクション設計
- `easy` CPU
- ゲーム開始時の手番順シャッフル

### 後回しにするもの

- `normal` / `hard` CPUの評価強化
- オンライン対戦
- セーブデータ共有
- アニメーション演出の作り込み
- スマートフォン専用レイアウト
- 拡張セット、別版ルール

## 画面構成

```text
+----------------------------------------------------------+
| ゲーム状態: 現在プレイヤー / ラウンド / 終了条件          |
+----------------------+-------------------+---------------+
| 貴族タイル            | 発展カード市場     | トークン置き場 |
|                      | Level 3: 4枚       | 光 雷 精 炎 闇 |
|                      | Level 2: 4枚       | 黄金           |
|                      | Level 1: 4枚       |               |
+----------------------+-------------------+---------------+
| 現在プレイヤー詳細: 点数 / ボーナス / 所持トークン / 予約 |
+----------------------------------------------------------+
| 他プレイヤー概要                                         |
+----------------------------------------------------------+
| 操作ログ                                                 |
+----------------------------------------------------------+
```

### カード表示

カードはクリックできる固定サイズのパネルにする。

- 左上: 威信ポイント
- 右上: ボーナス種類
- 下部: コスト
- 購入可能なカードは強調表示
- 予約可能なカードは通常表示
- 操作できないカードは薄く表示

カードのクリック時は、すぐ実行せずに操作メニューを出す。

- `購入`
- `予約`
- `閉じる`

購入できない場合は、`購入` ボタンを無効化し、足りない種類を表示する。

### トークン表示

トークン置き場は種類ごとの丸いボタンにする。各ボタンに残り枚数を表示する。

- 光
- 雷
- 精
- 炎
- 闇
- 黄金

宝石トークンをクリックすると「取る候補」に入る。候補が合法手になると `確定` ボタンを有効化する。

黄金トークンは直接クリックで取れない。カード予約時だけ自動で取る。

## マウスだけの手番フロー

手番開始時、プレイヤーは画面上の要素をクリックして行動を選ぶ。

### 宝石を取る

1. トークン置き場の宝石をクリックする。
2. 画面下部に選択中トークンを表示する。
3. 合法なら `このトークンを取る` を押せる。
4. 確定後、10枚を超えていれば返却モードに入る。
5. 必要なら貴族判定を行う。
6. 次のプレイヤーへ進む。

合法判定:

- 異なる種類を最大3枚
- 同じ種類2枚は、その種類が取る前に4枚以上ある場合のみ
- 黄金は選択不可
- 場の残数を超えて選択不可

### カードを予約する

1. 公開カードをクリックする。
2. `予約` を押す。
3. 予約上限が3枚未満なら予約する。
4. 黄金トークンが残っていれば1枚得る。
5. 公開カードの場合は山札から補充する。
6. 10枚を超えていれば返却モードに入る。
7. 次のプレイヤーへ進む。

このブラウザ版では、同じPC上でマウスを回して遊ぶことを想定し、山札からの予約は禁止する。予約カードは全員に表向きで見える。

### カードを購入する

1. 公開カードまたは自分の予約カードをクリックする。
2. `購入` を押す。
3. 支払い確認ダイアログを出す。
4. 自動支払い案を表示する。
5. 必要なら黄金トークンの割り当てをクリックで変更する。
6. `購入確定` で支払う。
7. カードを自分の場に追加する。
8. 公開カードの場合は山札から補充する。
9. 貴族判定を行う。
10. 次のプレイヤーへ進む。

支払いは、まずボーナスを差し引き、不足分を通常トークンで払い、さらに不足した種類を黄金で補う。黄金の使い方が複数ある場合だけ、プレイヤーに選ばせる。

### トークン返却

手番終了時にトークンが11枚以上なら返却モードに入る。

1. 自分の所持トークンをクリックして返却候補に入れる。
2. 合計10枚以下になると `返却して続行` が有効になる。
3. 確定後、貴族判定またはターン終了へ進む。

### 貴族獲得

条件を満たした貴族が1枚なら自動獲得する。

複数ある場合は貴族選択モードに入り、獲得する1枚をクリックして選ぶ。

## 状態設計

### GameState

```js
{
  players: Player[],
  turnOrder: [2, 0, 1],
  currentTurnOrderIndex: 0,
  currentPlayerIndex: 2,
  startPlayerIndex: 2,
  round: 1,
  phase: "action",
  settings: {
    playerCount: 2,
    players: [
      { type: "human", name: "Player 1" },
      { type: "cpu", name: "CPU 1", difficulty: "easy" }
    ]
  },
  bank: { white: 7, blue: 7, green: 7, red: 7, black: 7, gold: 5 },
  decks: {
    level1: Card[],
    level2: Card[],
    level3: Card[]
  },
  market: {
    level1: Card[],
    level2: Card[],
    level3: Card[]
  },
  nobles: Noble[],
  selectedTokens: {},
  pendingPayment: null,
  pendingNobles: [],
  finalRoundTriggeredBy: null,
  log: [],
  winnerIds: []
}
```

### Player

```js
{
  id: 0,
  name: "Player 1",
  type: "human",
  difficulty: null,
  tokens: { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 },
  cards: Card[],
  reserved: Card[],
  nobles: Noble[],
  score: 0
}
```

### Card

```js
{
  id: "L1-001",
  level: 1,
  points: 0,
  bonus: "white",
  cost: { white: 0, blue: 1, green: 1, red: 1, black: 1 }
}
```

### Noble

```js
{
  id: "N-001",
  points: 3,
  requirement: { white: 4, blue: 4, green: 0, red: 0, black: 0 }
}
```

CPUプレイヤーの場合は次のようにする。

```js
{
  id: 1,
  name: "CPU 1",
  type: "cpu",
  difficulty: "easy",
  tokens: { white: 0, blue: 0, green: 0, red: 0, black: 0, gold: 0 },
  cards: Card[],
  reserved: Card[],
  nobles: Noble[],
  score: 0
}
```

## CPU対戦を見据えた設計

CPU対戦は後回しでも、MVPの時点でルール処理とUI処理を分離する。

人間プレイヤーもCPUプレイヤーも、最終的には同じ `Action` を作り、それを `applyAction()` に渡してゲーム状態を更新する。マウス操作は `Action` を作るためのUIであり、ルールそのものではない。

### Action

```js
{
  type: "takeTokens",
  playerId: 0,
  tokens: { white: 1, blue: 1, green: 1, red: 0, black: 0, gold: 0 }
}
```

代表的なアクション:

- `takeTokens`
- `reserveCard`
- `buyCard`
- `discardTokens`
- `claimNoble`
- `cancelSelection`

### ルールエンジン

ルールエンジンはDOMを触らず、GameStateとActionだけを扱う。

- `getLegalActions(game, playerId)` で現在選べる合法手を列挙する。
- `applyAction(game, action)` で状態を更新する。
- `applyAction()` は人間とCPUで共通に使う。
- UIは合法手を見てボタンの有効・無効を決める。
- CPUは合法手を見て1つ選ぶ。

この形にしておくと、CPUの強さを変えても、購入・予約・貴族・終了判定などのルール処理を作り直さずに済む。

### CPUの判断

CPU実装時は `js/ai.js` に次の関数を置く。

```js
function chooseCpuAction(game, playerId, difficulty) {
  const view = createPlayerView(game, playerId);
  const actions = getLegalActions(game, playerId);
  return chooseActionByHeuristic(view, actions, difficulty);
}
```

最初のCPUは強くなくてよい。実装しやすい順に追加する。

1. `easy`: 合法手からそれらしい手を選ぶ。買えるカードを優先し、買えなければ購入に近づく宝石を取る。
2. `normal`: 得点カード、貴族条件、ボーナス種類の不足を評価する。
3. `hard`: 数手先の購入候補や相手の予約妨害も軽く見る。

### CPU手番の流れ

`advanceTurn()` 後、現在プレイヤーがCPUならUIをロックしてCPU処理を走らせる。

```js
const currentPlayer = getCurrentPlayer(game);

if (currentPlayer.type === "cpu") {
  setTimeout(() => {
    const action = chooseCpuAction(game, currentPlayer.id, currentPlayer.difficulty);
    game = applyAction(game, action);
    render(game);
    continueCpuTurnIfNeeded(game);
  }, 400);
}
```

購入後の貴族選択や、10枚超過時の返却もCPUに選ばせる。そのため、CPUは通常手番だけでなく `discard` や `noble` フェーズの合法手も選べる必要がある。

### 情報の見え方

CPUが不必要に有利にならないよう、CPU判断には `createPlayerView(game, playerId)` を渡せる設計にする。

- 公開カード、公開貴族、場のトークンは見える。
- 予約カードは全員に見える。
- 山札順は見ない。

最初の実装ではGameStateを直接見てもよいが、CPUを強くしていく段階で `createPlayerView()` に切り替えられるようにしておく。

## 主要関数

### 初期化

- `createNewGame(playerConfigs)`
- `createPlayer(id, config)`
- `createBank(playerCount)`
- `shuffle(array)`
- `dealMarket(decks)`
- `dealNobles(playerCount)`

### ルール判定

- `canTakeTokens(game, selection)`
- `canReserveCard(game, player)`
- `canBuyCard(player, card)`
- `calculatePaymentOptions(player, card)`
- `getPlayerBonuses(player)`
- `getPlayerScore(player)`
- `getEligibleNobles(player, nobles)`
- `isTokenLimitExceeded(player)`
- `isFinalRoundComplete(game)`
- `getWinners(game)`
- `getLegalActions(game, playerId)`
- `createPlayerView(game, playerId)`

### 状態更新

- `applyAction(game, action)`
- `takeTokens(game, selection)`
- `reserveCard(game, source)`
- `buyCard(game, source, payment)`
- `discardTokens(game, selection)`
- `claimNoble(game, nobleId)`
- `advanceTurn(game)`

### UI

- `render(game)`
- `renderMarket(game)`
- `renderBank(game)`
- `renderPlayerArea(game)`
- `renderActionPanel(game)`
- `showCardMenu(card, source)`
- `showPaymentDialog(card, paymentOptions)`
- `showGameOverDialog(winners)`

### CPU

- `chooseCpuAction(game, playerId, difficulty)`
- `chooseActionByHeuristic(playerView, actions, difficulty)`
- `scoreAction(playerView, action, difficulty)`

## フェーズ設計

`phase` で操作可能な内容を切り替える。

| phase | 状態 | 操作 |
| --- | --- | --- |
| `setup` | ゲーム開始前 | 人数選択、開始 |
| `action` | 通常手番 | トークン選択、カード購入、カード予約 |
| `payment` | 購入確認 | 黄金の割り当て、購入確定 |
| `discard` | トークン返却 | 返却トークン選択 |
| `noble` | 貴族選択 | 獲得する貴族を選択 |
| `gameOver` | 終了 | 勝者表示、新規ゲーム |

## 操作ミス対策

- 手番中の選択は `キャンセル` で戻せる。
- 購入・予約・返却は確認ボタンを押すまで確定しない。
- 合法でない操作ボタンは無効化する。
- 操作ログに直近の行動を残す。
- `1手戻す` はMVPでは任意。入れる場合は `history` にGameStateのスナップショットを保存する。

## 見た目の方針

ブラウザゲームとして盤面を見渡しやすくする。

- カード、トークン、貴族は固定サイズにしてクリックしやすくする。
- 見た目だけに依存しないよう、トークンには文字ラベルも入れる。
- 現在プレイヤーを明確に表示する。
- 購入可能、予約可能、選択中、無効状態を視覚的に分ける。
- 公式アートは使わず、CSSだけでカードとトークンを描く。

## ブラウザ保存

MVPでは、ゲーム中断に備えてブラウザの `localStorage` に保存する。

- `splendorLocalGame.current`: 現在のGameState
- `splendorLocalGame.settings`: プレイヤー人数、名前など

保存タイミング:

- 新規ゲーム開始
- 手番終了
- ゲーム終了

タイトル画面では、保存データがあれば `続きから` を表示する。

## 実装順序

1. `index.html`、`style.css`、`main.js` の最小構成を作る。
2. `data/cards.json` と `data/nobles.json` にダミーデータを置く。
3. `fetch()` でJSONを読み込み、市場表示を作る。
4. GameStateと描画を接続する。
5. `Action`、`getLegalActions()`、`applyAction()` の骨組みを作る。
6. トークン取得を実装する。
7. カード購入を実装する。
8. カード予約を実装する。
9. トークン10枚上限を実装する。
10. 貴族獲得を実装する。
11. 15点終了と勝敗判定を実装する。
12. 全カード・貴族データを入力する。
13. 保存・再開を実装する。
14. クリック範囲、無効状態、確認ダイアログを磨く。
15. `js/ai.js` に `easy` CPUを追加する。

## テスト観点

- 2人、3人、4人で初期トークン数が正しい。
- 公開カードが各レベル4枚ずつ並ぶ。
- 異なる種類3枚を取れる。
- 同じ種類2枚は場に4枚以上ある場合だけ取れる。
- 黄金を単独で取れない。
- 予約カードは3枚まで。
- 黄金がない状態でも予約できる。
- ボーナスで購入コストが減る。
- 黄金が任意種類として支払いに使える。
- 購入後に公開カードが補充される。
- 10枚を超えたら返却が必須になる。
- 貴族条件にトークンは数えない。
- 同時に複数貴族を満たしたら1枚だけ選ぶ。
- 15点到達後、最終プレイヤーまで手番が回る。
- 同点時は購入カード枚数が少ない方が勝つ。
- それでも同点なら同点勝利になる。

## 注意点

この実装はGitHub Pagesで静的に動くブラウザゲームとして設計する。公開状態になるため、ゲーム名、カード構成、文言、画像、商標などの扱いは別途確認する。
