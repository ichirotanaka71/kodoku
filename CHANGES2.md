# 仕様変更 vol.2 — 経路ルール修正

## 変更概要

**同一マスへの再訪問を許可する。**
禁止するのは「直前のステップにいたマスへ戻ること（Uターン）」のみ。

---

## 変更前の挙動

```
path に既に含まれているマスをクリック/なぞると、
そこまで経路をトリムして「折り返し」扱いにしていた。
→ 結果として同じ敵を1ターンに複数回攻撃できなかった。
```

## 変更後の挙動

```
Uターン（直前のマスへの逆戻り）だけを禁止。
それ以外は同じマスへ何度でも戻ってよい。
→ 同じ敵マスを複数回通過して、繰り返しダメージを与えられる。
```

### Uターンの定義（変わらず）

```
path = [..., A, B] の状態で次に A を選ぼうとした場合 → Uターン → 禁止
path = [..., A, B, C, A] のように間に別マスを挟んで A に戻る → 許可
```

---

## 変更箇所

### `src/utils/GameState.js` — `isValidPathStep()`

現在の実装は「既に path にあるマスへの追加」を禁止している箇所があるため削除する。

```js
// 変更前
isValidPathStep(path, next) {
  if (path.length === 0) return false
  const last = path[path.length - 1]
  if (Math.abs(last.r - next.r) > 1 || Math.abs(last.c - next.c) > 1) return false
  if (last.r === next.r && last.c === next.c) return false
  // Uターン禁止
  if (path.length >= 2) {
    const prev = path[path.length - 2]
    if (prev.r === next.r && prev.c === next.c) return false
  }
  // ★ 既存マスへの追加を禁止していた箇所（削除またはコメントアウト）
  return true
}
```

上記はすでにほぼ正しい構造だが、
**`_extendOrTrimPath()` 側で「既存マスを検出したらトリムする」処理をしている場合は削除する。**

### `src/scenes/GameScene.js` — `_extendOrTrimPath()`

以下のトリム処理を**削除**する。

```js
// 削除する処理
const existIdx = this.path.findIndex((p, i) => i > 0 && p.r === r && p.c === c)
if (existIdx > 0) {
  this.path = this.path.slice(0, existIdx + 1)
  this._renderPath()
  this._updateStepInfo()
  return
}
```

削除後、既存マスへの追加は通常の `isValidPathStep()` チェック（Uターンのみ禁止）を通過すれば追加される。

---

## ダメージ計算への影響

同じ敵マスを複数回通過した場合、**通過のたびに攻撃が発生する**。
コンボカウンターは「敵マスを通過した回数」でカウントされるため、
同じ敵を2回通れば combo=1, combo=2 として倍率が乗る。

`GameState.js` の `executeMove()` は現在セルを通過するたびに処理するため、
**敵HPが0になったターン以降はそのマスが `empty` になり、追加ダメージは発生しない**（正常動作）。

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `src/scenes/GameScene.js` | `_extendOrTrimPath()` のトリム処理を削除 |
| `src/utils/GameState.js` | `isValidPathStep()` に既存マス禁止ロジックがあれば削除（Uターン禁止のみ残す） |
