# 仕様変更 vol.4 — Uターン時の挙動変更

## 変更概要

Uターン入力（直前のマスへ戻る動き）を「禁止してはじく」のではなく、
**「直前のステップをキャンセルして経路を1つ縮める」** 挙動に変更する。

---

## 変更前の挙動

```
経路: [A → B → C] でCの隣のBをなぞる
→ Uターン判定 → 弾く（何も起きない or 別方向に誘導される）
```

## 変更後の挙動

```
経路: [A → B → C] でCの隣のBをなぞる
→ Cへの指定をキャンセル → 経路が [A → B] に縮む

経路: [A → B → C → D] でDの隣のCをなぞる
→ 経路が [A → B → C] に縮む

さらにCの隣のBをなぞる
→ 経路が [A → B] に縮む
```

ドラッグで指を戻すと、なぞった分だけ経路が縮んでいくイメージ。
ダンジョンレイドの一筆書き操作と同じ挙動。

---

## 実装

### `src/scenes/GameScene.js` — `_extendOrTrimPath()`

Uターン判定の処理を「弾く」から「末尾をpopして縮める」に変更する。

```js
_extendOrTrimPath(r, c) {
  const last = this.path[this.path.length - 1]
  if (!last || (last.r === r && last.c === c)) return  // 同じマス → 無視

  // ★ Uターン判定：直前のマス（last-1）と一致したら末尾をpopして縮める
  if (this.path.length >= 2) {
    const prev = this.path[this.path.length - 2]
    if (prev.r === r && prev.c === c) {
      this.path.pop()  // 末尾（last）をキャンセル
      this._renderPath()
      this._updateStepInfo()
      return
    }
  }

  // 通常の隣接チェック
  if (!this.gs.isValidPathStep(this.path, { r, c })) return
  if (this.path.length - 1 >= this.gs.player.maxSteps) return

  this.path.push({ r, c })
  this._renderPath()
  this._updateStepInfo()
}
```

### `src/utils/GameState.js` — `isValidPathStep()`

Uターン禁止チェックは `_extendOrTrimPath()` 側で処理するようになったので、
`isValidPathStep()` からUターン判定を**削除**してもよい（二重管理を避けるため）。

```js
isValidPathStep(path, next) {
  if (path.length === 0) return false
  const last = path[path.length - 1]
  // 隣接チェック（縦横斜め1マス以内）
  if (Math.abs(last.r - next.r) > 1 || Math.abs(last.c - next.c) > 1) return false
  if (last.r === next.r && last.c === next.c) return false
  // Uターン判定はGameScene側で処理するためここでは不要
  return true
}
```

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `src/scenes/GameScene.js` | `_extendOrTrimPath()` のUターン処理を「弾く」→「末尾pop」に変更 |
| `src/utils/GameState.js` | `isValidPathStep()` からUターン禁止チェックを削除（任意） |
