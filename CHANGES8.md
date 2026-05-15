# 仕様変更 vol.8 — 経路プレビュー拡張・敵情報表示・移動時オブジェクト処理

---

## 1. 経路引き中のリアルタイムプレビュー拡張

### 現状
HP のみ予測更新されている。

### 変更後
経路上のオブジェクトを全てシミュレートして HUD をリアルタイム更新する。

| 取得オブジェクト | 更新する HUD |
|---|---|
| 🧪 薬 | HP（+1 per 薬） |
| 🪙 コイン | COIN カウント |
| 💧 経験値 | XP カウント |
| 敵（生き残り） | HP（敵ATKぶん減少） |
| 敵（撃破確定） | HP 変動なし（反撃なし） |

### 実装

`GameScene.js` に `_calcPathPreview(path)` を追加する。

```js
_calcPathPreview(path) {
  let dmg = 0
  let healHp = 0
  let gainCoins = 0
  let gainXp = 0
  let combo = 0

  for (let i = 1; i < path.length; i++) {
    const cell = this.gs.cells[path[i].r][path[i].c]
    if (cell.type === 'goblin' || cell.type === 'archer' || cell.type === 'orc') {
      combo++
      const mult = 1 + (combo - 1) * 0.2
      const playerDmg = Math.ceil(this.gs.player.atk * mult)
      if (playerDmg < cell.hp) dmg += cell.atk  // 撃破できない → 反撃あり
    } else if (cell.type === 'potion') {
      healHp++
    } else if (cell.type === 'coin') {
      gainCoins++
    } else if (cell.type === 'xp') {
      gainXp++
    }
  }

  return { dmg, healHp, gainCoins, gainXp }
}
```

`_extendOrTrimPath()` と `_cancelPath()` の末尾で呼び出し、
`UIScene` の新メソッド `updatePreview()` に渡す。

```js
// GameScene.js
const preview = this._calcPathPreview(this.path)
this.scene.get('UIScene')?.updatePreview(preview)
```

```js
// UIScene.js
updatePreview({ dmg, healHp, gainCoins, gainXp }) {
  const p = this.gs.player

  // HP
  const predictedHp = p.hp - dmg + healHp
  if (dmg > 0 || healHp > 0) {
    const col = predictedHp <= 0 ? '#f87171' : predictedHp < p.hp ? '#fb923c' : '#4ade80'
    this.hudTexts.hp.setText(`${p.hp} → ${predictedHp}/${p.maxHp}`)
    this.hudTexts.hp.setColor(col)
  } else {
    this.hudTexts.hp.setText(`${p.hp}/${p.maxHp}`)
    this.hudTexts.hp.setColor('#f1f5f9')
  }

  // COIN
  if (gainCoins > 0) {
    this.hudTexts.coins.setText(`${p.coins} → ${p.coins + gainCoins}`)
    this.hudTexts.coins.setColor('#fde68a')
  } else {
    this.hudTexts.coins.setText(`${p.coins}`)
    this.hudTexts.coins.setColor('#f1f5f9')
  }

  // XP
  if (gainXp > 0) {
    this.hudTexts.xp.setText(`${p.xp} → ${p.xp + gainXp}/${p.xpMax}`)
    this.hudTexts.xp.setColor('#a78bfa')
  } else {
    this.hudTexts.xp.setText(`${p.xp}/${p.xpMax}`)
    this.hudTexts.xp.setColor('#f1f5f9')
  }
}
```

キャンセル時は `updatePreview({ dmg:0, healHp:0, gainCoins:0, gainXp:0 })` を呼んで通常表示に戻す。

---

## 2. 敵タイルに現HP・攻撃力を常時表示

### 仕様

敵タイルの上に以下を常時表示する（CT表示と併存）。

```
┌──────────────┐
│ ⏱2      HP8 │   ← 左:CT  右:現HP
│    👺        │
│ ✕（撃破確定）│
│ ⚔2           │   ← 左下:ATK
└──────────────┘
```

### 実装

`GameScene.js` の `_buildGrid()` でセルごとに以下のテキストオブジェクトを追加する。

```js
// HP表示（右上）
const hpText = this.add.text(x + 28, y - 26, '', {
  fontSize: '10px', fontFamily: 'monospace', color: '#fca5a5',
}).setOrigin(1, 0).setDepth(6)
this.enemyHpTexts[r][c] = hpText

// ATK表示（左下）
const atkText = this.add.text(x - 28, y + 14, '', {
  fontSize: '10px', fontFamily: 'monospace', color: '#fda4af',
}).setOrigin(0, 0).setDepth(6)
this.enemyAtkTexts[r][c] = atkText
```

`_renderCells()` の敵ケースに追加：

```js
case 'goblin':
case 'archer':
case 'orc':
  // ...既存の処理...
  this.enemyHpTexts[r][c].setText(`HP${cell.hp}`)
  this.enemyAtkTexts[r][c].setText(`⚔${cell.atk}`)
  break

// 空マスの場合はクリア
default:
  this.enemyHpTexts[r][c].setText('')
  this.enemyAtkTexts[r][c].setText('')
```

---

## 3. 移動時のオブジェクト接触処理（アニメーション付き）

### 概要

キャラクターが経路を歩き、オブジェクトと重なった瞬間に**一時ストップ**して
種類に応じた演出を行う。

### 3-1. コイン獲得：HUD コインに吸い込まれる

```js
async _collectCoin(r, c) {
  const { x, y } = this._cellCenter(r, c)
  const coinObj = this.cellObjects[r][c]

  // HUD のコイン表示位置（UIScene から取得 or 固定座標）
  const hudCoinPos = { x: 290, y: 90 }  // UIScene の COIN HUD 座標

  // セルのコインオブジェクトを複製してアニメーション
  const flyObj = this.add.text(x, y, '🪙', { fontSize: '24px' })
    .setOrigin(0.5).setDepth(30)

  coinObj.setText('')  // 元のセルを即座に消す

  await new Promise(resolve => {
    this.tweens.add({
      targets: flyObj,
      x: hudCoinPos.x,
      y: hudCoinPos.y,
      scaleX: 0.3,
      scaleY: 0.3,
      duration: 400,
      ease: 'Quad.In',
      onComplete: () => {
        flyObj.destroy()
        // HUD カウントアップ + バウンス
        this.gs.player.coins++
        this.scene.get('UIScene')?.updateHUD()
        this.scene.get('UIScene')?.bounceHUD('coins')
        resolve()
      },
    })
  })
}
```

### 3-2. 薬獲得：HUD HP に吸い込まれる

```js
async _collectPotion(r, c) {
  const { x, y } = this._cellCenter(r, c)
  const hudHpPos = { x: 44, y: 90 }  // UIScene の HP HUD 座標

  const flyObj = this.add.text(x, y, '🧪', { fontSize: '24px' })
    .setOrigin(0.5).setDepth(30)

  this.cellObjects[r][c].setText('')

  await new Promise(resolve => {
    this.tweens.add({
      targets: flyObj,
      x: hudHpPos.x,
      y: hudHpPos.y,
      scaleX: 0.3,
      scaleY: 0.3,
      duration: 400,
      ease: 'Quad.In',
      onComplete: () => {
        flyObj.destroy()
        this.gs.player.hp = Math.min(this.gs.player.maxHp, this.gs.player.hp + 1)
        this.scene.get('UIScene')?.updateHUD()
        this.scene.get('UIScene')?.bounceHUD('hp')
        resolve()
      },
    })
  })
}
```

### 3-3. 経験値獲得：HUD XP に吸い込まれる（レベルアップ処理は保留）

```js
async _collectXp(r, c) {
  const { x, y } = this._cellCenter(r, c)
  const hudXpPos = { x: 510, y: 90 }  // UIScene の XP HUD 座標

  const flyObj = this.add.text(x, y, '💧', { fontSize: '24px' })
    .setOrigin(0.5).setDepth(30)

  this.cellObjects[r][c].setText('')

  await new Promise(resolve => {
    this.tweens.add({
      targets: flyObj,
      x: hudXpPos.x,
      y: hudXpPos.y,
      scaleX: 0.3,
      scaleY: 0.3,
      duration: 400,
      ease: 'Quad.In',
      onComplete: () => {
        flyObj.destroy()
        // レベルアップ判定は保留。XPのみ加算
        this.gs.player.xp = Math.min(this.gs.player.xpMax, this.gs.player.xp + 1)
        this.scene.get('UIScene')?.updateHUD()
        this.scene.get('UIScene')?.bounceHUD('xp')
        resolve()
      },
    })
  })
}
```

### 3-4. 敵との戦闘処理

```js
async _fightEnemy(r, c, combo) {
  const cell = this.gs.cells[r][c]
  const mult = 1 + (combo - 1) * 0.2
  const playerDmg = Math.ceil(this.gs.player.atk * mult)

  // ヒットストップ
  this._hitStop(80)

  // ダメージ数値フロート
  this._showDamageNumber(r, c, playerDmg, playerDmg >= cell.hp)

  cell.hp -= playerDmg

  if (cell.hp <= 0) {
    // 撃破
    await this._killEffect(r, c)
    this.gs.cells[r][c] = { type: 'empty' }
    // ドロップ処理（既存の _dropLoot を呼ぶ）
    const drops = this.gs._dropLoot(r, c)
    this._animateLootDrop(drops)
  } else {
    // 生き残り → 反撃
    this.cameras.main.shake(80, 0.005)
    this.gs.player.hp -= cell.hp <= 0 ? 0 : cell.atk
    this.scene.get('UIScene')?.updateHUD()
    // 敵HPテキストを更新
    this.enemyHpTexts[r][c].setText(`HP${cell.hp}`)
  }
}
```

### 3-5. `moveStep()` への組み込み

```js
// _animateMove() 内の moveStep() を async に変更し、
// セル種別に応じて await で各処理を呼ぶ

const moveStep = async () => {
  if (step >= path.length - 1) {
    // 全移動完了
    this._doEnemyPhase()
    return
  }
  step++
  const { r, c } = path[step]
  const { x, y } = this._cellCenter(r, c)

  // プレイヤーをマスに移動
  await this._movePlayerTo(x, y)  // 120ms tween を Promise 化

  // オブジェクト処理（一時ストップして演出）
  const cell = this.gs.cells[r][c]
  if (cell.type === 'coin') {
    await this._collectCoin(r, c)
  } else if (cell.type === 'potion') {
    await this._collectPotion(r, c)
  } else if (cell.type === 'xp') {
    await this._collectXp(r, c)
  } else if (cell.type === 'goblin' || cell.type === 'archer' || cell.type === 'orc') {
    await this._fightEnemy(r, c, combo++)
  }

  moveStep()
}
```

### 3-6. `bounceHUD()` を UIScene に追加

HUD のカウントアップ時にバウンスアニメーションを付ける。

```js
// UIScene.js
bounceHUD(key) {
  const txt = this.hudTexts[key]
  if (!txt) return
  this.tweens.add({
    targets: txt,
    scaleX: 1.4, scaleY: 1.4,
    duration: 80,
    yoyo: true,
    ease: 'Power1',
  })
}
```

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `src/scenes/GameScene.js` | `_calcPathPreview()` 追加、`enemyHpTexts`/`enemyAtkTexts` 追加、`_collectCoin/Potion/Xp()` 追加、`_fightEnemy()` 追加、`moveStep()` を async 化して各処理を組み込み |
| `src/scenes/UIScene.js` | `updatePreview()` 追加、`bounceHUD()` 追加 |
