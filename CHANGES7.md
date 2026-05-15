# 仕様変更 vol.7 — 一筆書き入力の改善（斜め・高速移動対応）

## 問題

- 斜め方向への経路が検出されにくい
- 速く動かすと線が出ない（マスをスキップする）

## 原因

`pointermove` イベントは発火頻度に限界があり、
高速移動時にポインターが1フレームで複数マスを飛び越えることがある。
斜めは縦横より移動距離が √2 倍長いため特に飛ばされやすい。

---

## 対策1：前フレームから現フレームへの補間（★最重要）

`pointermove` で受け取った座標だけでなく、
**前回座標から今回座標までを線形補間してその間のマスも全てチェック**する。

```js
private onPointerMove(pointer: Phaser.Input.Pointer): void {
  if (!this.isDragging || this.path.length === 0) return;

  // 前フレームの座標から今フレームまでを補間してサンプリング
  const steps = 8  // 補間ステップ数（多いほど滑らか、8〜12が適切）
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const ix = Phaser.Math.Linear(pointer.prevPosition.x, pointer.worldX, t)
    const iy = Phaser.Math.Linear(pointer.prevPosition.y, pointer.worldY, t)
    this._processPointerAt(ix, iy, pointer)
  }
}
```

実際の処理を `_processPointerAt()` に切り出す：

```js
private _processPointerAt(worldX: number, worldY: number, pointer: Phaser.Input.Pointer): void {
  // グリッド外チェック
  const boardRight  = this.gridOffsetX + GRID_COLS * (CELL_SIZE + CELL_GAP) - CELL_GAP
  const boardBottom = this.gridOffsetY + GRID_ROWS * (CELL_SIZE + CELL_GAP) - CELL_GAP
  if (
    worldX < this.gridOffsetX || worldX > boardRight ||
    worldY < this.gridOffsetY || worldY > boardBottom
  ) {
    this.cancelPath()
    this.isDragging = false
    return
  }

  const hit = this.gridPosAt(worldX, worldY)
  if (!hit) return

  const n = this.path.length
  const last = this.path[n - 1]
  if (last.r === hit.r && last.c === hit.c) return  // 同じマス → 無視

  // バックトラック
  if (n >= 2) {
    const prev = this.path[n - 2]
    if (prev.r === hit.r && prev.c === hit.c) {
      this.setHighlight(this.path[n - 1], false)
      this.path.pop()
      this.redrawChain()
      this._updateStepInfo()
      return
    }
  }

  // 隣接チェック・歩数チェック
  if (!this.isAdjacent(last, hit)) return
  if (this.path.length - 1 >= this.gs.player.maxSteps) return

  this.path.push(hit)
  this.setHighlight(hit, true)
  this.redrawChain()
  this._updateStepInfo()
}
```

---

## 対策2：`gridPosAt()` の判定範囲を広げる

現在はタイル中心から `CELL_SIZE / 2` 以内のみ有効にしているが、
これを **`CELL_SIZE * 0.7`** 程度に広げることで斜め方向の検出が改善する。

```js
private gridPosAt(worldX: number, worldY: number): { r: number; c: number } | null {
  const c = Math.floor((worldX - this.gridOffsetX) / (CELL_SIZE + CELL_GAP))
  const r = Math.floor((worldY - this.gridOffsetY) / (CELL_SIZE + CELL_GAP))
  if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) return null

  const cx = this.gridOffsetX + c * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2
  const cy = this.gridOffsetY + r * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2

  const threshold = CELL_SIZE * 0.7  // 0.5 → 0.7 に拡大（隙間も拾う）
  if (Math.abs(worldX - cx) > threshold || Math.abs(worldY - cy) > threshold) return null

  return { r, c }
}
```

---

## 対策3：Phaser のポインター精度設定を上げる

`main.js` の Phaser config に以下を追加する。

```js
const config = {
  // ...既存の設定...
  input: {
    smoothFactor: 0,        // スムージングを無効化（遅延を排除）
  },
}
```

`smoothFactor` のデフォルトは `0` だが、明示的に指定することで
環境によっては座標の補正が入って遅延するケースを防ぐ。

---

## 対策4：`pointermove` を `update()` ループで処理する（最終手段）

どうしても改善しない場合は `pointermove` イベントではなく、
毎フレームの `update()` でポインター座標を読む方式に変える。

```js
update(): void {
  if (!this.isDragging) return
  const pointer = this.input.activePointer
  if (!pointer.isDown) return
  this._processPointerAt(pointer.worldX, pointer.worldY, pointer)
}
```

イベント駆動より毎フレーム確認のほうが取りこぼしが少なく、
特に60fps環境では安定する。

---

## 推奨適用順序

1. **対策1（補間）** — 効果が最も大きい、まずここから
2. **対策2（判定範囲拡大）** — 対策1と組み合わせると斜めがさらに改善
3. **対策3（smoothFactor）** — 念のため追加
4. **対策4（updateループ）** — 1〜3で解決しない場合のみ

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `src/scenes/GameScene.js` | `onPointerMove()` に補間処理を追加、`_processPointerAt()` を切り出し、`gridPosAt()` の threshold を 0.7 に拡大 |
| `src/main.js` | Phaser config に `input: { smoothFactor: 0 }` を追加 |
