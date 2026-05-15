# 仕様変更 vol.5 — 敵情報表示・ヒットストップ・ドロップ調整

---

## 1. 敵タイルクリックで情報ポップアップを表示

### 仕様

- 敵タイルをクリック（ドラッグ開始ではなく単純なタップ/クリック）したとき、
  その敵の詳細情報をポップアップで表示する
- ポップアップ表示中も経路入力は止めない（情報表示は非ブロッキング）
- 別のマスをクリックするか、一定時間（3秒程度）で自動的に閉じる

### 表示内容

```
┌─────────────────┐
│ 👺 ゴブリン      │
│ HP   : 8 / 10   │
│ ATK  : 2        │
│ CT   : ⏱ 2      │
│ スキル: 仲間召喚  │
└─────────────────┘
```

### 実装メモ

`GameScene.js` に `_showEnemyInfo(r, c)` メソッドを追加。

```js
_showEnemyInfo(r, c) {
  const cell = this.gs.cells[r][c]
  const def = ENEMY_DEFS[cell.type]
  const { x, y } = this._cellCenter(r, c)

  // 既存のポップアップがあれば破棄
  if (this.enemyPopup) this.enemyPopup.destroy()

  // ポップアップをセルの右上あたりに配置（画面端なら左側に出す）
  const popX = x + 70 > 520 ? x - 70 : x + 70
  const popY = y - 20

  const lines = [
    `${def.emoji} ${def.label}`,
    `HP  : ${cell.hp} / ${cell.maxHp}`,
    `ATK : ${cell.atk}`,
    `CT  : ⏱${cell.ct}`,
    `スキル: ${def.skillDesc}`,
  ].join('\n')

  this.enemyPopup = this.add.text(popX, popY, lines, {
    fontSize: '12px',
    fontFamily: 'monospace',
    color: '#f1f5f9',
    backgroundColor: '#0d1b2a',
    padding: { x: 10, y: 8 },
    lineSpacing: 4,
  }).setDepth(50).setOrigin(0.5, 0.5)

  // 枠線（Graphics）
  // 3秒後に自動消去
  this.time.delayedCall(3000, () => {
    if (this.enemyPopup) {
      this.enemyPopup.destroy()
      this.enemyPopup = null
    }
  })
}
```

`pointerdown` イベントで、ドラッグを開始しないケース（プレイヤーマス以外の敵タイルを単押し）のときに呼ぶ。
経路引き開始（プレイヤーマスのクリック）との競合に注意。

---

## 2. ヒットストップ演出

### 仕様

以下のタイミングでヒットストップ（短い画面フリーズ＋演出）を入れる：

| タイミング | 演出内容 |
|---|---|
| 敵と接触（ダメージ交換） | 画面を一瞬シェイク＋赤フラッシュ＋ダメージ数値を浮かせる |
| 敵を撃破 | 敵タイルをスケールアップして消滅＋白フラッシュ＋「KILL!」テキスト |
| アイテム取得 | タイルをポップ（scale 1→1.4→1）＋取得内容をフロートテキスト |
| レベルアップ | 画面全体を一瞬ゴールドフラッシュ＋「LEVEL UP!」大テキスト |

### ヒットストップの実装

ヒットストップとは「数フレームだけゲームの進行を止める」演出。
Phaser では `this.time.timeScale` を一時的に 0 にすることで実現できる。

```js
_hitStop(duration = 80) {
  // tweenは止めずにtimeScaleだけ落とす
  this.time.timeScale = 0.05
  this.time.delayedCall(duration, () => {
    this.time.timeScale = 1.0
  })
}
```

### 個別演出の実装

#### ダメージ数値フロート（敵に当たったとき）

```js
_showDamageNumber(r, c, dmg, isKill) {
  const { x, y } = this._cellCenter(r, c)
  const color = isKill ? '#ffffff' : '#fbbf24'
  const size  = isKill ? '22px' : '18px'
  const label = isKill ? `${dmg}💀` : `-${dmg}`

  const txt = this.add.text(x, y, label, {
    fontSize: size, fontFamily: 'monospace',
    color, stroke: '#000', strokeThickness: 3,
  }).setOrigin(0.5).setDepth(40)

  this.tweens.add({
    targets: txt,
    y: y - 50, alpha: 0,
    duration: 700, ease: 'Power2',
    onComplete: () => txt.destroy(),
  })
}
```

#### 敵撃破エフェクト

```js
_killEffect(r, c) {
  const obj = this.cellObjects[r][c]
  this.tweens.add({
    targets: obj,
    scaleX: 1.8, scaleY: 1.8, alpha: 0,
    duration: 200, ease: 'Power2',
    onComplete: () => { obj.setScale(1).setAlpha(1) }
  })
}
```

#### 画面シェイク（敵から反撃を受けたとき）

```js
// Phaser 組み込みのカメラシェイク
this.cameras.main.shake(80, 0.006)
```

### `_animateMove()` への組み込み

キャラクターが各セルを通過する `moveStep()` の中で、
セルのタイプに応じて演出を呼び出す。

```js
// 敵と接触（生き残り）
this._hitStop(80)
this.cameras.main.shake(80, 0.005)
this._showDamageNumber(r, c, playerDmg, false)

// 敵撃破
this._hitStop(100)
this._killEffect(r, c)
this._showDamageNumber(r, c, playerDmg, true)

// アイテム取得
this._itemPickupEffect(r, c)
```

---

## 3. 経験値のドロップルール変更

### 変更内容

- 経験値（💧）は**敵を倒したときのみ**ドロップする
- 通常のランダムスポーン（`_spawnObjects()`）には含めない
- ドロップ確率：敵撃破時に **100%** で経験値1つをドロップ
  （薬・コインは追加でランダムドロップのまま）

### 実装メモ

#### `GameState.js` — `_spawnObjects()` の重みテーブルから xp を削除

```js
// constants.js の SPAWN_WEIGHTS から xp を削除
export const SPAWN_WEIGHTS = [
  { type: 'goblin', w: 35 },
  { type: 'archer', w: 20 },
  { type: 'orc',    w: 10 },
  { type: 'potion', w: 20 },  // xp削除分を他に分配
  { type: 'coin',   w: 15 },
]
```

#### `GameState.js` — `_dropLoot()` を分離

敵撃破時のドロップを「xp固定1個 ＋ ランダムで薬orコイン」に変更。

```js
_dropLoot(fromR, fromC) {
  const results = []

  // 経験値は必ずドロップ
  const xpSpot = this._findNearbyEmpty(fromR, fromC)
  if (xpSpot) {
    this.cells[xpSpot.r][xpSpot.c] = { type: 'xp', value: 1 }
    results.push(xpSpot)
  }

  // 薬 or コインをランダムで追加ドロップ（50%）
  if (Math.random() < 0.5) {
    const spot = this._findNearbyEmpty(fromR, fromC, exclude=[xpSpot])
    if (spot) {
      this.cells[spot.r][spot.c] = {
        type: Math.random() < 0.5 ? 'potion' : 'coin',
        value: 1,
      }
      results.push(spot)
    }
  }

  return results  // アニメーション用に座標リストを返す
}
```

---

## 4. 経験値の初期MAX値を 10 → 5 に変更

### 変更箇所

`constants.js` の `INITIAL_XP`（または `INITIAL_PLAYER`）を修正。

```js
export const INITIAL_PLAYER = {
  hp: 20,
  maxHp: 20,
  atk: 3,
  maxSteps: 7,
  coins: 0,
  xp: 0,
  xpMax: 5,    // 10 → 5 に変更
  level: 1,
}
```

レベルアップ時の `xpMax` 増加は `+5` のまま維持（Lv2で10、Lv3で15…）。

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `src/utils/constants.js` | `SPAWN_WEIGHTS` から xp 削除、`xpMax` 初期値を 5 に変更 |
| `src/utils/GameState.js` | `_dropLoot()` を「xp固定＋ランダム追加」に変更、`_findNearbyEmpty()` ヘルパー追加 |
| `src/scenes/GameScene.js` | `_showEnemyInfo()` 追加、`_hitStop()` 追加、`_showDamageNumber()` 追加、`_killEffect()` 追加、`_animateMove()` に演出を組み込み、敵クリック判定を追加 |
