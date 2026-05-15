# 仕様変更 vol.10 — 敵・オブジェクト調整（岩・アーチャー刷新）

---

## 1. オークを削除、岩を追加

### オーク
- **削除する**（スポーンテーブルから除外、ENEMY_DEFS からも削除）

### 岩（新規追加）

| パラメータ | 値 |
|---|---|
| HP | 10 |
| ATK | 0 |
| CT | なし |
| スキル | なし |
| ドロップ | 🪙 コインのみ（確定1個） |

岩は**敵フェーズで何もしない**（CT カウントもスキル発動もなし）。
ただし経路上に通過すると HP10 分のダメージを与える必要があるため、
歩数コストがかかる障害物として機能する。

#### `constants.js` の変更

```js
// ENEMY_DEFS から orc を削除、rock を追加
export const ENEMY_DEFS = {
  goblin: { ... },  // 変更なし
  archer: { ... },  // 後述
  rock: {
    key: 'rock',
    emoji: '🪨',
    label: '岩',
    hp: 10,
    atk: 0,
    ct: null,
    xp: 0,
    coins: 1,       // コインのみ確定ドロップ
    skill: 'none',
    skillDesc: '—',
  },
}

// SPAWN_WEIGHTS から orc を削除、rock を追加
export const SPAWN_WEIGHTS = [
  { type: 'goblin', w: 35 },
  { type: 'archer', w: 20 },
  { type: 'rock',   w: 15 },
  { type: 'potion', w: 15 },
  { type: 'coin',   w: 15 },
]
```

#### `GameState.js` の変更

`getAllEnemies()` に rock を含める（HPがあるため攻撃対象）。
ただし CT カウント対象からは外す。

```js
// _tickSkills() 内
// rock は CT カウントしない
if (cell.type === 'goblin' || cell.type === 'archer') {
  cell.ct--
  // ...
}
```

`_dropLoot()` で rock 撃破時はコインのみドロップ：

```js
_dropLoot(fromR, fromC, enemyType) {
  if (enemyType === 'rock') {
    // コインのみ確定ドロップ、経験値なし
    const spot = this._findNearbyEmpty(fromR, fromC)
    if (spot) this.cells[spot.r][spot.c] = { type: 'coin', value: 1 }
    return spot ? [spot] : []
  }

  // 通常敵（goblin, archer）は既存処理
  // xp 確定 + ランダムで coin or potion
  ...
}
```

`executeMove()` に rock を敵として処理するが ATK=0 なので反撃ダメージなし：

```js
// rock も goblin/archer と同じ戦闘フローに乗せる
// atk: 0 なので反撃ダメージが 0 になるだけ
const ENEMIES = ['goblin', 'archer', 'rock']
```

---

## 2. アーチャーの刷新

### 変更後のパラメータ

| パラメータ | 変更前 | 変更後 |
|---|---|---|
| HP | 8 | 5 |
| ATK | 3 | 1（近接） |
| CT | 4 | なし |
| スキル | なし | **射撃（毎ターン・位置条件）** |

### 射撃スキルの仕様

- **発動条件**：敵フェーズ開始時、アーチャーとプレイヤーが**同じ行（row）または同じ列（col）**にいる場合
- **射程**：無限（盤面端まで）
- **ダメージ**：3
- **貫通**：他の敵タイルには当たらず、プレイヤーにのみヒット
- **発動タイミング**：毎ターン（CT なし、軸が合えば必ず撃つ）

### `GameState.js` の変更

`_tickSkills()` にアーチャーの射撃処理を追加：

```js
_tickSkills() {
  const msgs = []
  const { r: pr, c: pc } = this.playerPos

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = this.cells[r][c]

      // ゴブリン：CT カウント＋召喚
      if (cell.type === 'goblin') {
        cell.ct--
        if (cell.ct <= 0) {
          cell.ct = ENEMY_DEFS.goblin.ct
          const empties = this.getEmpties()
          if (empties.length > 0) {
            const spot = empties[Math.floor(Math.random() * empties.length)]
            const def = ENEMY_DEFS.goblin
            this.cells[spot.r][spot.c] = {
              type: 'goblin', hp: def.hp, maxHp: def.hp, atk: def.atk, ct: def.ct
            }
            msgs.push({ text: `👺 ゴブリンが仲間を召喚！`, color: 'warn' })
          }
        }
      }

      // アーチャー：毎ターン、軸が合えば射撃
      if (cell.type === 'archer') {
        const sameRow = r === pr
        const sameCol = c === pc
        if (sameRow || sameCol) {
          this.player.hp -= 3
          msgs.push({ text: `🏹 アーチャーの矢が飛んできた！ -3HP`, color: 'bad' })
        }
      }
    }
  }

  return msgs
}
```

### 矢のアニメーション（`GameScene.js`）

`_doEnemyPhase()` 内で、射撃が発生したアーチャーの座標から
プレイヤー位置に向かって矢のテキストを飛ばす。

```js
_animateArrowShot(fromR, fromC, toR, toC, onComplete) {
  const from = this._cellCenter(fromR, fromC)
  const to   = this._cellCenter(toR,   toC)

  const arrow = this.add.text(from.x, from.y, '➶', {
    fontSize: '20px', color: '#fbbf24',
  }).setOrigin(0.5).setDepth(20)

  // 矢の向きを回転
  const angle = Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y)
  arrow.setRotation(angle)

  this.tweens.add({
    targets: arrow,
    x: to.x,
    y: to.y,
    duration: 250,
    ease: 'Linear',
    onComplete: () => {
      arrow.destroy()
      // カメラシェイク
      this.cameras.main.shake(60, 0.005)
      if (onComplete) onComplete()
    },
  })
}
```

`enemyPhase()` が射撃情報（どのアーチャーが撃ったか）を返すように変更し、
`_doEnemyPhase()` でアニメーションを呼ぶ。

```js
// GameState.js の enemyPhase() の返り値に shots を追加
return { msgs, shots: [{fromR, fromC, toR, toC}, ...] }
```

---

## 経路プレビューへの影響

アーチャーの射撃は**プレイヤーフェーズではなく敵フェーズ**に発動するため、
経路プレビューには影響しない（プレイヤーが動いた後に撃ってくる）。

ただし将来的に「移動後にアーチャーの射線に入るかどうかの警告」を
プレビューに表示する拡張は可能。

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `src/utils/constants.js` | `ENEMY_DEFS` から orc 削除・rock 追加、アーチャー更新、`SPAWN_WEIGHTS` 更新 |
| `src/utils/GameState.js` | `_tickSkills()` にアーチャー射撃追加、`getAllEnemies()` に rock 追加、CT カウントから rock 除外、`_dropLoot()` に rock 分岐追加、`enemyPhase()` の返り値に shots 追加 |
| `src/scenes/GameScene.js` | `_animateArrowShot()` 追加、`_doEnemyPhase()` で shots を受け取りアニメーション実行 |
