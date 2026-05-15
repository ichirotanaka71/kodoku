# 仕様変更 vol.9 — 仮死システム＋演出まとめ発火

---

## 設計方針

| 項目 | タイミング | 理由 |
|---|---|---|
| HP の増減計算 | 通過時リアルタイム | 仮死・蘇生の戦術を成立させるため |
| HP バーの表示更新 | 通過時リアルタイム | プレイヤーが仮死状態を把握できるようにするため |
| コイン・薬・XP のHUDアニメーション | 終着点到着後まとめて発火 | 爽快感のため |
| 死亡判定 | 終着点到着後 | 仮死からの蘇生を可能にするため |
| 敵との戦闘処理 | 通過時リアルタイム | 経路順序が戦闘結果に影響するため |

---

## 1. 仮死システム

### 仕様

- 移動中に HP が 0 以下になっても**その場では死なない**
- HP がマイナスになっても歩き続ける
- 終着点に到着した時点で HP が 0 以下なら**ゲームオーバー**
- 終着点到着時に HP が 1 以上なら生存

### HP バーの仮死表示

移動中に HP がマイナスになった場合：
- HP バーを**赤点滅**させる
- HUD の HP テキストを `💀-2/20` のように表示する

```js
// UIScene.js
updateHpRealtime(currentHp, maxHp) {
  if (currentHp <= 0) {
    this.hudTexts.hp.setText(`💀${currentHp}/${maxHp}`)
    this.hudTexts.hp.setColor('#f87171')
    // 点滅
    this.tweens.add({
      targets: this.hudTexts.hp,
      alpha: 0.3,
      duration: 200,
      yoyo: true,
      repeat: -1,
    })
  } else {
    this.tweens.killTweensOf(this.hudTexts.hp)
    this.hudTexts.hp.setAlpha(1)
    this.hudTexts.hp.setText(`${currentHp}/${maxHp}`)
    const col = currentHp <= 5 ? '#f87171' : '#f1f5f9'
    this.hudTexts.hp.setColor(col)
  }
}
```

---

## 2. 移動処理のフロー

### `moveStep()` の処理順序

```
1. プレイヤーをマスに移動（tween 120ms）

2. マスのオブジェクトを処理：
   - 敵   → 即時戦闘処理（HP増減・演出）
   - 薬   → HP+1 を即時計算、HUD の HP バーを即時更新
             flyQueue に { type:'potion', from:{x,y} } を積む
   - コイン → coins+1 を即時計算
             flyQueue に { type:'coin', from:{x,y} } を積む
   - XP   → xp+1 を即時計算
             flyQueue に { type:'xp', from:{x,y} } を積む

3. HP をリアルタイム更新（updateHpRealtime）

4. 次のマスへ
```

### 終着点到着後の処理

```
5. flyQueue を全て発火（コイン・薬・XP がいっせいに HUD へ飛ぶ）

6. 死亡判定：HP <= 0 → ゲームオーバー

7. 敵フェーズへ
```

---

## 3. 実装

### `_animateMove()` の構造

```js
_animateMove() {
  const path = [...this.path]
  this.path = []
  this.animating = true

  // flyQueue: 終着点到着後にまとめてアニメーションするキュー
  const flyQueue = []
  let combo = 0

  // moveStep を async/await チェーンで処理
  const moveStep = async () => {
    if (step >= path.length - 1) {
      // ── 全マス移動完了 ──

      // flyQueue を一斉発火
      await this._fireFlyQueue(flyQueue)

      // 死亡判定
      if (this.gs.player.hp <= 0) {
        this.gs.phase = 'gameover'
        // ゲームオーバー処理
        return
      }

      // 敵フェーズへ
      this._doEnemyPhase()
      return
    }

    step++
    const { r, c } = path[step]
    const { x, y } = this._cellCenter(r, c)

    // プレイヤー移動
    await this._movePlayerTo(x, y)

    // オブジェクト処理
    const cell = this.gs.cells[r][c]

    if (cell.type === 'potion') {
      this.gs.player.hp += 1  // マイナスでも加算
      this.gs.cells[r][c] = { type: 'empty' }
      flyQueue.push({ type: 'potion', from: { x, y } })
      // HP バーのみリアルタイム更新
      this.scene.get('UIScene')?.updateHpRealtime(
        this.gs.player.hp, this.gs.player.maxHp
      )

    } else if (cell.type === 'coin') {
      this.gs.player.coins++
      this.gs.cells[r][c] = { type: 'empty' }
      flyQueue.push({ type: 'coin', from: { x, y } })
      // コインは終着後まで HUD 更新しない

    } else if (cell.type === 'xp') {
      this.gs.player.xp = Math.min(this.gs.player.xpMax, this.gs.player.xp + 1)
      this.gs.cells[r][c] = { type: 'empty' }
      flyQueue.push({ type: 'xp', from: { x, y } })
      // XP は終着後まで HUD 更新しない

    } else if (isEnemy(cell)) {
      combo++
      await this._fightEnemy(r, c, combo)
      // HP バーのみリアルタイム更新（反撃ダメージ反映）
      this.scene.get('UIScene')?.updateHpRealtime(
        this.gs.player.hp, this.gs.player.maxHp
      )
    }

    moveStep()
  }

  let step = 0
  moveStep()
}
```

### `_fireFlyQueue()` — 一斉発火

```js
async _fireFlyQueue(queue) {
  if (queue.length === 0) return

  const HUD_POS = {
    coin:   { x: 290, y: 90 },
    potion: { x: 44,  y: 90 },
    xp:     { x: 510, y: 90 },
  }
  const ICON = {
    coin: '🪙', potion: '🧪', xp: '💧',
  }

  // 全て同時に飛ばす（await しない）
  const promises = queue.map(item => new Promise(resolve => {
    const flyObj = this.add.text(item.from.x, item.from.y, ICON[item.type], {
      fontSize: '24px',
    }).setOrigin(0.5).setDepth(30)

    this.tweens.add({
      targets: flyObj,
      x: HUD_POS[item.type].x,
      y: HUD_POS[item.type].y,
      scaleX: 0.3,
      scaleY: 0.3,
      duration: 400,
      ease: 'Quad.In',
      onComplete: () => {
        flyObj.destroy()
        resolve()
      },
    })
  }))

  // 全アニメーション完了を待つ
  await Promise.all(promises)

  // 全部飛び終わったら HUD を一括更新＋バウンス
  const ui = this.scene.get('UIScene')
  ui?.updateHUD()
  ui?.bounceHUD('coins')
  ui?.bounceHUD('xp')
}
```

---

## 4. 経路プレビューへの反映

仮死を考慮した予測HPを表示する。

```js
// _calcPathPreview() の HP 表示部分
const predictedHp = p.hp - dmg + healHp
const col = predictedHp <= 0
  ? '#f87171'          // 仮死（赤）
  : predictedHp < p.hp
    ? '#fb923c'        // ダメージあり（オレンジ）
    : '#4ade80'        // 回復（緑）

// 仮死になる場合は 💀 を付ける
const hpLabel = predictedHp <= 0
  ? `${p.hp} → 💀${predictedHp}/${p.maxHp}`
  : `${p.hp} → ${predictedHp}/${p.maxHp}`
```

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `src/scenes/GameScene.js` | `_animateMove()` に flyQueue 導入、`_fireFlyQueue()` 追加、死亡判定を終着点到着後に移動、仮死中も移動継続 |
| `src/scenes/UIScene.js` | `updateHpRealtime()` 追加（仮死表示・点滅）、`_calcPathPreview()` の仮死プレビュー対応 |
