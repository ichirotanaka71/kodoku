# 仕様変更 vol.3 — UI強化・経験値・ルート被ダメ予測

---

## 1. 敵タイルの CT 表示を時計アイコンに変更

### 変更内容

- 現在は `CT3` のようなテキストで表示している
- これを **🕐 などの時計絵文字 + 数字** に変更する
- 例: `🕐3` または時計アイコン画像の代わりに Phaser の Text で `⏱ 3` と表示

### 実装メモ

`GameScene.js` の `ctTexts[r][c].setText(...)` 部分を修正する。

```js
// 変更前
ctTxt.setText(`CT${cell.ct}`)

// 変更後
ctTxt.setText(`⏱${cell.ct}`)
```

フォントサイズや位置は既存のままでOK。

---

## 2. 経路引き中の被ダメ予測を HUD の HP 表示に反映

### 仕様

- プレイヤーが経路を引いている最中、その経路を通過したときに**受けるダメージ合計をリアルタイムで計算**する
- HUD の HP 表示を以下のように変更する：

```
通常時:     18/20
経路引き中: 18 → 14/20  （14 が予測HP、赤またはオレンジ色）
```

- 予測HPが 0 以下になる場合は赤くハイライト or 点滅させる
- 経路をキャンセルしたら通常表示に戻す

### 計算ロジック

経路上の敵（撃破できない敵のみ反撃を受ける）から受けるダメージを合算する。
撃破確定の敵（プレイヤーATK × コンボ倍率 >= 敵HP）は反撃なし。

```js
function calcPreviewDamage(path, gs) {
  let combo = 0
  let totalDamage = 0
  for (let i = 1; i < path.length; i++) {
    const cell = gs.cells[path[i].r][path[i].c]
    if (isEnemy(cell)) {
      combo++
      const mult = 1 + (combo - 1) * 0.2
      const playerDmg = Math.ceil(gs.player.atk * mult)
      if (playerDmg < cell.hp) {
        // 撃破できない → 反撃を受ける
        totalDamage += cell.atk
      }
    }
  }
  return totalDamage
}
```

### UIScene.js の変更

`updateSteps()` または新規メソッド `updateHPPreview(previewDamage)` を追加する。

```js
updateHPPreview(damage) {
  const { hp, maxHp } = this.gs.player
  if (damage === 0) {
    this.hudTexts.hp.setText(`${hp}/${maxHp}`)
    this.hudTexts.hp.setColor('#f1f5f9')
  } else {
    const predicted = hp - damage
    const col = predicted <= 0 ? '#f87171' : '#fb923c'
    this.hudTexts.hp.setText(`${hp} → ${predicted}/${maxHp}`)
    this.hudTexts.hp.setColor(col)
  }
}
```

`GameScene.js` の `_extendOrTrimPath()` と `_cancelPath()` の末尾で `updateHPPreview()` を呼ぶ。

---

## 3. 敵撃破時のドロップ変更：放物線アニメーションで近くに着地

### ドロップ内容の変更

現在: コイン or 薬
変更後: **経験値（しずくアイコン 💧）/ 薬（🧪）/ コイン（🪙）** の3種からランダム

```js
// GameState.js の _dropLoot() を修正
_dropLoot(fromR, fromC) {
  // 敵の位置から近い空マス1〜2マス以内を優先して探す
  // なければランダムな空マスに落とす
  const nearby = getNearbyEmpties(fromR, fromC, radius=2)
  const target = nearby.length > 0
    ? nearby[Math.floor(Math.random() * nearby.length)]
    : randomEmpty()

  const roll = Math.random()
  let type
  if (roll < 0.4)      type = 'xp'     // 💧 経験値
  else if (roll < 0.7) type = 'potion' // 🧪 薬
  else                 type = 'coin'   // 🪙 コイン

  this.cells[target.r][target.c] = { type, value: 1 }
  return target // アニメーション用に座標を返す
}
```

### 放物線アニメーション

`GameScene.js` に `_animateLootDrop(fromR, fromC, toR, toC)` を追加する。

```js
_animateLootDrop(fromR, fromC, toR, toC) {
  const from = this._cellCenter(fromR, fromC)
  const to   = this._cellCenter(toR, toC)

  // セルのオブジェクトを一時的に起点に移動してからtween
  const obj = this.cellObjects[toR][toC]
  obj.setPosition(from.x, from.y).setScale(0.5).setAlpha(1)

  // 放物線: x は線形、y は放物線（頂点を作る）
  const midX = (from.x + to.x) / 2
  const midY = Math.min(from.y, to.y) - 60  // 頂点の高さ

  // Phaser に標準の放物線tweenはないので、
  // timeline を使って2段階で近似する
  this.tweens.add({
    targets: obj,
    x: { value: to.x, duration: 400, ease: 'Linear' },
    y: { value: to.y, duration: 400, ease: 'Quad.In' },
    scaleX: 1, scaleY: 1,
    duration: 400,
    onStart: () => {
      // y方向に先に上昇させてから落下する2段tweenで放物線を近似
    },
  })
}
```

より自然な放物線にする場合は `timeline` を使う：

```js
this.tweens.chain({
  targets: obj,
  tweens: [
    { x: midX, y: midY - 30, scaleX: 0.8, scaleY: 0.8, duration: 200, ease: 'Quad.Out' },
    { x: to.x,  y: to.y,     scaleX: 1,   scaleY: 1,   duration: 200, ease: 'Bounce.Out' },
  ],
})
```

---

## 4. 経験値システムの追加

### データ定義

`constants.js` に追加：

```js
export const INITIAL_XP = {
  xp: 0,
  xpMax: 10,
  level: 1,
}
```

`GameState.js` の `reset()` に組み込む：

```js
this.player = {
  ...INITIAL_PLAYER,
  xp: 0,
  xpMax: 10,
  level: 1,
  drain: false,
  bomb: false,
}
```

### 経験値の加算とレベルアップ処理

`GameState.js` に `gainXP(amount)` メソッドを追加：

```js
gainXP(amount) {
  this.player.xp += amount
  const msgs = []
  while (this.player.xp >= this.player.xpMax) {
    this.player.xp -= this.player.xpMax
    this.player.level++
    this.player.xpMax += 5           // 次のレベルの必要経験値 +5
    this.player.maxHp += 5           // MaxHP +5
    this.player.hp = this.player.maxHp  // HP全回復
    msgs.push({ text: `⬆ LEVEL UP! Lv${this.player.level}  MaxHP+5 HP全回復`, color: 'good' })
  }
  return msgs
}
```

`executeMove()` 内で `'xp'` タイルを踏んだときに呼ぶ：

```js
} else if (cell.type === 'xp') {
  const lvMsgs = this.gainXP(1)
  msgs.push({ text: `💧 経験値 +1`, color: 'muted' })
  msgs.push(...lvMsgs)
  this.cells[r][c] = { type: 'empty' }
}
```

### HUD への追加

`UIScene.js` の HUD に XP 欄を追加する。

```js
{ key: 'xp', label: 'XP', x: 510 }  // または既存の COMBO 右に配置
```

表示フォーマット：`0/10`（現在XP / 必要XP）

レベルアップ時は一瞬ゴールド or 黄色にフラッシュさせると◎。

```js
// updateHUD() 内
this.hudTexts.xp.setText(`${p.xp}/${p.xpMax}`)
```

HUD が横に狭い場合は `COMBO` と `XP` を同列に小さく並べるか、
2行目に `LV` と `XP` をまとめて表示する。

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `src/utils/constants.js` | `INITIAL_XP` 追加、`xp` タイルをスポーン対象に追加 |
| `src/utils/GameState.js` | `player` に xp/xpMax/level 追加、`gainXP()` 追加、`_dropLoot()` を近傍着地＋xp含む3種に変更、`executeMove()` に xp 処理追加 |
| `src/scenes/GameScene.js` | CT表示を `⏱N` に変更、`_animateLootDrop()` 追加、ドロップアニメ呼び出し修正、`_extendOrTrimPath()` と `_cancelPath()` で HP プレビュー更新 |
| `src/scenes/UIScene.js` | HP プレビュー表示メソッド追加、XP HUD 欄追加、`updateHUD()` に xp/level 反映 |
