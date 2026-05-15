# 仕様変更・更新指示

このファイルは Claude Code への実装指示です。
現在の `dungeon-raid` プロジェクトに対して以下の変更を加えてください。

---

## 1. 入力方式の変更：クリックではなくドラッグで経路を引く

### 変更内容

- **マウスボタンを押し続けている間だけ**経路を伸ばせるようにする
- `pointerdown` でドラッグ開始（プレイヤーマス上でなくてもドラッグ開始できるが、経路はプレイヤーマスから始まる）
- `pointermove` 中にグリッドセルをなぞると経路が伸びる（現在の実装を維持）
- `pointerup` で経路確定（移動を実行する）
- **グリッド外でマウスボタンを離した場合はキャンセル**（経路をリセット）

### 実装メモ

`GameScene.js` の `_setupInput()` を修正する。

```js
// pointerdown: プレイヤーマス上でドラッグ開始
// pointermove: ドラッグ中に経路を伸ばす
// pointerup（グリッド内）: 移動確定 → _confirmMove() を呼ぶ
// pointerup（グリッド外）or pointerupoutside: キャンセル → _cancelPath()
```

`this.input.on('pointerup', ...)` に加えて
`this.input.on('pointerupoutside', ...)` または
`pointerup` イベント内で `_pointerToCell()` が null を返すかチェックしてキャンセルする。

---

## 2. 終着地点の条件変更

### 変更前
> 終着地点は「空マス（type === 'empty'）」のみ

### 変更後
> 終着地点は「**敵マス以外**」であればOK
> 具体的には `type` が `'goblin'` / `'archer'` / `'orc'` でなければ終着にできる

### 実装メモ

`GameState.js` の `isValidDestination()` を修正する。

```js
isValidDestination(path) {
  if (path.length < 2) return false
  const dest = path[path.length - 1]
  const cell = this.getCell(dest.r, dest.c)
  if (!cell) return false
  const ENEMIES = ['goblin', 'archer', 'orc']
  return !ENEMIES.includes(cell.type)
}
```

---

## 3. 経路プレビュー：撃破確定の敵に ✕ を表示

### 仕様

- 経路を引いている最中、通過する敵に対して「撃破が確定するかどうか」をリアルタイムに判定する
- 撃破確定（プレイヤーのダメージで敵HPが0以下になる）の場合、**その敵セルの上に ✕ アイコン（または赤いXテキスト）を表示する**
- 経路がキャンセル or 変更されたら ✕ も更新する

### 実装メモ

`GameScene.js` の `_renderPath()` 内で以下を追加する。

```js
// 経路上の敵に対してダメージシミュレーション
let combo = 0
for (let i = 1; i < this.path.length; i++) {
  const { r, c } = this.path[i]
  const cell = this.gs.cells[r][c]
  if (isEnemy(cell)) {
    combo++
    const mult = 1 + (combo - 1) * 0.2
    const dmg = Math.ceil(this.gs.player.atk * mult)
    if (dmg >= cell.hp) {
      // ✕ を表示（既存の cellObjects や専用レイヤーに重ねる）
      showKillMark(r, c)
    }
  }
}
```

✕ の表示には `Phaser.GameObjects.Text` を使い、
セルの中央に赤色の `"✕"` または `"X"` を `setDepth(10)` で重ねる。
`killMarkTexts` などのプール配列で管理し、`_renderPath()` 呼び出しのたびにクリア＆再描画する。

---

## 4. 初期歩数を 7 に変更

### 変更箇所

`src/utils/constants.js` の `INITIAL_PLAYER` を修正する。

```js
export const INITIAL_PLAYER = {
  hp: 20,
  maxHp: 20,
  atk: 3,
  maxSteps: 7,   // 5 → 7 に変更
  coins: 0,
}
```

---

## 5. 移動確定後：経路に沿ってキャラクターをアニメーション移動させる

### 仕様

- マウスボタンを離して移動が確定したあと、プレイヤー（🧙）が経路のセルを1マスずつ順番に移動するアニメーションを再生する
- 各セルへの移動時間は **100〜150ms / マス** 程度
- 移動中に敵セルを通過したとき、戦闘エフェクト（簡易でOK：フラッシュ or 数値表示）を出す
- 移動中はユーザー入力を無効にする（`this.animating = true` を維持）
- アニメーション完了後に `GameState.executeMove()` の結果を反映してセルを更新し、敵フェーズへ進む

### 実装メモ

`GameScene.js` の `_animateMove()` を以下のような再帰ステップ処理に書き換える。

```js
_animateMove() {
  const path = [...this.path]
  this.path = []
  this.animating = true

  // プレイヤーオブジェクトを取得
  const playerObj = this.cellObjects[startR][startC]

  let step = 0
  const moveStep = () => {
    if (step >= path.length - 1) {
      // 全移動完了 → GameState に反映
      const { msgs, combo } = this.gs.executeMove(path)
      // ... メッセージ表示、次フェーズへ
      return
    }
    step++
    const { r, c } = path[step]
    const { x, y } = this._cellCenter(r, c)

    // セルの絵文字を先に消す（プレイヤーが上書きする）
    this.cellObjects[r][c].setAlpha(0.3)

    this.tweens.add({
      targets: playerObj,
      x, y,
      duration: 120,
      ease: 'Linear',
      onComplete: () => {
        // 通過マスの処理（エフェクトのみ：実際のHP計算はexecuteMoveで一括）
        const cell = this.gs.cells[r][c]
        if (isEnemy(cell)) {
          this._flashCombatEffect(x, y)
        }
        this.cellObjects[r][c].setAlpha(1)
        moveStep() // 次のステップへ
      }
    })
  }
  moveStep()
}
```

> **注意**: `GameState.executeMove()` はアニメーション完了後に**1回だけ**呼ぶ。
> アニメーション中は見た目の移動のみ行い、状態変更はまとめて後処理する。

---

## 6. 敵フェーズのオブジェクト出現：1ターンに1個＋落下アニメーション

### 変更内容

1. **1ターンあたりのスポーン数を1個に変更**（現在は最大3個）
2. 出現時に**画面上部から落下してくるアニメーション**を追加する

### スポーン数の変更

`GameState.js` の `_spawnObjects()` を修正する。

```js
_spawnObjects() {
  const empties = this.getEmpties()
  if (empties.length === 0) return []

  // シャッフルして1個だけスポーン
  shuffle(empties)
  const { r, c } = empties[0]
  const obj = this._weightedPick()
  // ... セルに配置
}
```

### 落下アニメーション

`GameScene.js` の `_animateDrops()` を修正する。

```js
_animateDrops(newCells, cb) {
  // newCells: [{r, c}] — 今回スポーンしたセルの座標リスト（GameStateから返す）

  let done = 0
  for (const { r, c } of newCells) {
    const { x, y } = this._cellCenter(r, c)
    const obj = this.cellObjects[r][c]

    // 画面上部（y = -40）からスタート
    obj.setY(-40).setAlpha(1).setScale(1)

    this.tweens.add({
      targets: obj,
      y,
      duration: 350,
      ease: 'Bounce.Out',   // バウンス落下
      onComplete: () => {
        done++
        if (done >= newCells.length) cb()
      }
    })
  }
  if (newCells.length === 0) cb()
}
```

`GameState._spawnObjects()` は新しくスポーンしたセル座標 `[{r, c}]` を返すように変更する。

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `src/utils/constants.js` | `maxSteps: 7` に変更 |
| `src/utils/GameState.js` | `isValidDestination()` 修正、`_spawnObjects()` を1個スポーンに変更しスポーン座標を返す |
| `src/scenes/GameScene.js` | ドラッグ入力・確定ロジック修正、✕表示追加、キャラ移動アニメーション実装、落下アニメーション実装 |

---

## 優先順位

1. 入力方式（ドラッグ＋グリッド外でキャンセル）
2. キャラクター移動アニメーション
3. 落下アニメーション（1個スポーン含む）
4. 撃破確定 ✕ 表示
5. 終着地点条件の緩和
6. 初期歩数7に変更
