# 仕様変更 vol.7b — 一筆書き入力改善（修正版）

CHANGES7.md の対策2は逆効果のため差し替え。
対策1（補間）のみ維持し、`gridPosAt()` を修正する。

---

## 対策2を元に戻す（重要）

`gridPosAt()` の threshold を **`CELL_SIZE * 0.7`** にした場合、
隣マスの判定領域と重複して誤検知が起きる。

threshold の上限は `STEP / 2 - 1px` 未満でなければならない。

```
CELL_SIZE = 64, CELL_GAP = 4, STEP = 68
STEP / 2 = 34px が安全な上限
```

### 修正後の `gridPosAt()`

threshold によるチェック自体を**撤廃**し、
`Math.floor` による格子計算だけで判定する。

```js
private gridPosAt(worldX: number, worldY: number): { r: number; c: number } | null {
  const col = Math.floor((worldX - this.gridOffsetX) / (CELL_SIZE + CELL_GAP))
  const row = Math.floor((worldY - this.gridOffsetY) / (CELL_SIZE + CELL_GAP))
  if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) return null
  return { r: row, c: col }
}
```

`Math.floor` の格子計算はSTEP単位で完全に分割されるため
隣マスと衝突しない。threshold チェックは不要。

---

## 対策1（補間）はそのまま維持

```js
private onPointerMove(pointer: Phaser.Input.Pointer): void {
  if (!this.isDragging || this.path.length === 0) return

  const steps = 8
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const ix = Phaser.Math.Linear(pointer.prevPosition.x, pointer.worldX, t)
    const iy = Phaser.Math.Linear(pointer.prevPosition.y, pointer.worldY, t)
    this._processPointerAt(ix, iy)
  }
}
```

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `src/scenes/GameScene.js` | `gridPosAt()` から threshold チェックを削除、`Math.floor` のみで判定 |
