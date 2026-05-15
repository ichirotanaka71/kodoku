# 仕様変更 vol.6 — 終着点ルール変更（撃破確定の敵マスに止まれる）

---

## 変更概要

終着点の条件を以下のように変更する。

| 条件 | 変更前 | 変更後 |
|---|---|---|
| 空マス | ✅ OK | ✅ OK |
| 薬・コイン・経験値マス | ✅ OK | ✅ OK |
| 敵マス（生き残る） | ❌ NG | ❌ NG |
| 敵マス（撃破確定） | ❌ NG | ✅ **OK** |

---

## 実装

### `src/utils/GameState.js` — `isValidDestination()`

```js
isValidDestination(path) {
  if (path.length < 2) return false
  const dest = path[path.length - 1]
  const cell = this.getCell(dest.r, dest.c)
  if (!cell) return false

  const ENEMIES = ['goblin', 'archer', 'orc']
  if (!ENEMIES.includes(cell.type)) return true  // 敵以外は無条件OK

  // 敵マスの場合は「撃破確定」のときのみOK
  return this._isKillShot(path)
}
```

### `src/utils/GameState.js` — `_isKillShot()` を追加

経路をシミュレートして、終着点の敵が撃破されるかどうかを判定する。

```js
_isKillShot(path) {
  const dest = path[path.length - 1]
  let combo = 0
  let destEnemyHp = this.cells[dest.r][dest.c].hp

  for (let i = 1; i < path.length; i++) {
    const { r, c } = path[i]
    const cell = this.cells[r][c]
    const ENEMIES = ['goblin', 'archer', 'orc']
    if (!ENEMIES.includes(cell.type)) continue

    combo++
    const mult = 1 + (combo - 1) * 0.2
    const dmg = Math.ceil(this.player.atk * mult)

    // 終着点の敵の場合、累積ダメージを追跡
    if (r === dest.r && c === dest.c) {
      destEnemyHp -= dmg
      if (destEnemyHp <= 0) return true  // 撃破確定
    }
  }
  return false
}
```

---

## `_renderPath()` への反映（GameScene.js）

終着点が敵マスで撃破確定の場合、緑色で表示する（既存の撃破確定✕表示と連動）。

```js
// 終着点の色分け（既存ロジックを拡張）
if (isLast) {
  const destCell = this.gs.cells[r][c]
  const ENEMIES = ['goblin', 'archer', 'orc']
  if (ENEMIES.includes(destCell.type)) {
    // 敵マスの場合は撃破確定かどうかで色を変える
    col = this.gs.isValidDestination(this.path) ? 0x166534 : 0x7f1d1d
  } else {
    col = destValid ? 0x166534 : 0x7f1d1d
  }
}
```

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `src/utils/GameState.js` | `isValidDestination()` に撃破確定チェックを追加、`_isKillShot()` ヘルパーを追加 |
| `src/scenes/GameScene.js` | `_renderPath()` の終着点カラーロジックを敵マス対応に更新 |
