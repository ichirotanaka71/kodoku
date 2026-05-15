import {
  GRID_COLS, GRID_ROWS, INITIAL_PLAYER,
  ENEMY_DEFS, SPAWN_WEIGHTS, SHOP_COST,
} from './constants.js'

export class GameState {
  constructor() {
    this.reset()
  }

  reset() {
    this.player = { ...INITIAL_PLAYER, drain: false, bomb: false }
    this.turn = 1
    this.phase = 'player' // 'player' | 'enemy' | 'shop' | 'gameover'
    this.cells = this._makeGrid()
    this.playerPos = { r: 3, c: 3 }
    this.cells[3][3].type = 'player'
    this.log = []
    this.lastCombo = 0
  }

  _makeGrid() {
    const cells = []
    for (let r = 0; r < GRID_ROWS; r++) {
      cells[r] = []
      for (let c = 0; c < GRID_COLS; c++) {
        cells[r][c] = { type: 'empty' }
      }
    }
    return cells
  }

  getCell(r, c) {
    if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) return null
    return this.cells[r][c]
  }

  setCell(r, c, data) {
    this.cells[r][c] = data
  }

  isEmpty(r, c) {
    const cell = this.getCell(r, c)
    return cell && cell.type === 'empty'
  }

  getEmpties() {
    const list = []
    for (let r = 0; r < GRID_ROWS; r++)
      for (let c = 0; c < GRID_COLS; c++)
        if (this.cells[r][c].type === 'empty') list.push({ r, c })
    return list
  }

  getAllEnemies() {
    const list = []
    for (let r = 0; r < GRID_ROWS; r++)
      for (let c = 0; c < GRID_COLS; c++) {
        const cell = this.cells[r][c]
        if (cell.type === 'goblin' || cell.type === 'archer' || cell.type === 'rock')
          list.push({ r, c, cell })
      }
    return list
  }

  // ------- Enemy phase -------
  enemyPhase() {
    const msgs = []

    const { msgs: skillMsgs, shots } = this._tickSkills()
    msgs.push(...skillMsgs)

    // 敵フェーズのダメージで HP が 0 以下になったら即ゲームオーバー（仮死なし）
    if (this.player.hp <= 0) {
      this.player.hp = 0
      this.phase = 'gameover'
      msgs.push({ text: '💀 アーチャーの矢で倒れた...', color: 'bad' })
      return { msgs, shots, newCells: [] }
    }

    const newCells = this._spawnObjects()

    this.turn++
    return { msgs, newCells, shots }
  }

  _tickSkills() {
    const msgs = []
    const shots = []
    const { r: pr, c: pc } = this.playerPos

    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const cell = this.cells[r][c]

        // ゴブリン：CT カウント＋隣接召喚
        if (cell.type === 'goblin') {
          cell.ct--
          if (cell.ct <= 0) {
            cell.ct = ENEMY_DEFS.goblin.ct
            const adjacentEmpties = []
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue
                const nr = r + dr, nc = c + dc
                if (nr >= 0 && nr < GRID_ROWS && nc >= 0 && nc < GRID_COLS &&
                    this.cells[nr][nc].type === 'empty') {
                  adjacentEmpties.push({ r: nr, c: nc })
                }
              }
            }
            if (adjacentEmpties.length === 0) {
              msgs.push({ text: `👺 ゴブリンが召喚しようとしたが場所がない！`, color: 'muted' })
            } else {
              const spot = adjacentEmpties[Math.floor(Math.random() * adjacentEmpties.length)]
              const def = ENEMY_DEFS.goblin
              this.cells[spot.r][spot.c] = { type: 'goblin', hp: def.hp, maxHp: def.hp, atk: def.atk, ct: def.ct }
              msgs.push({ text: `👺 ゴブリンが仲間を召喚！`, color: 'warn' })
            }
          }
        }

        // アーチャー：上下左右4方向・盤面端まで射撃（斜めは安全）
        if (cell.type === 'archer') {
          const DIRECTIONS = [
            { dr: -1, dc:  0 },
            { dr:  1, dc:  0 },
            { dr:  0, dc: -1 },
            { dr:  0, dc:  1 },
          ]
          for (const { dr, dc } of DIRECTIONS) {
            let tr = r + dr, tc = c + dc
            let hit = false
            while (tr >= 0 && tr < GRID_ROWS && tc >= 0 && tc < GRID_COLS) {
              if (tr === pr && tc === pc) {
                this.player.hp -= 3
                shots.push({ fromR: r, fromC: c, toR: tr, toC: tc, hit: true })
                msgs.push({ text: `🏹 アーチャーの矢がヒット！ -3HP`, color: 'bad' })
                hit = true
                break
              }
              tr += dr
              tc += dc
            }
            if (!hit) {
              // 盤面端（最後の有効マス）まで矢を飛ばす
              shots.push({
                fromR: r, fromC: c,
                toR: tr - dr, toC: tc - dc,
                hit: false,
              })
            }
          }
        }
      }
    }

    return { msgs, shots }
  }

  _spawnObjects() {
    const empties = this.getEmpties()
    if (empties.length === 0) return []

    for (let i = empties.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [empties[i], empties[j]] = [empties[j], empties[i]]
    }
    const { r, c } = empties[0]
    const obj = this._weightedPick()
    if (obj.type === 'goblin' || obj.type === 'archer' || obj.type === 'rock') {
      const def = ENEMY_DEFS[obj.type]
      this.cells[r][c] = { type: obj.type, hp: def.hp, maxHp: def.hp, atk: def.atk, ct: def.ct }
    } else {
      this.cells[r][c] = { type: obj.type, value: 1 }
    }
    return [{ r, c }]
  }

  _weightedPick() {
    const total = SPAWN_WEIGHTS.reduce((s, w) => s + w.w, 0)
    let rand = Math.random() * total
    for (const w of SPAWN_WEIGHTS) {
      rand -= w.w
      if (rand <= 0) return { type: w.type }
    }
    return { type: 'coin' }
  }

  // ------- Player move execution -------
  executeMove(path) {
    const msgs = []
    let combo = 0
    const lootDrops = []

    const { r: pr, c: pc } = this.playerPos
    this.cells[pr][pc] = { type: 'empty' }

    for (let i = 1; i < path.length; i++) {
      const { r, c } = path[i]
      const cell = this.cells[r][c]

      if (cell.type === 'goblin' || cell.type === 'archer' || cell.type === 'orc') {
        combo++
        const mult = 1 + (combo - 1) * 0.2
        const dmg = Math.ceil(this.player.atk * mult)
        cell.hp -= dmg

        const comboTag = combo > 1 ? ` 🔥COMBO×${combo}` : ''
        if (cell.hp <= 0) {
          msgs.push({ text: `${ENEMY_DEFS[cell.type].emoji} 撃破！(${dmg}ダメ${comboTag})`, color: 'good' })
          if (this.player.drain) {
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1)
            msgs.push({ text: `🩸 ドレイン HP+1`, color: 'good' })
          }
          const drops = this._dropLoot(r, c)
          lootDrops.push(...drops)
          this.cells[r][c] = { type: 'empty' }
        } else {
          this.player.hp -= cell.atk
          msgs.push({ text: `${ENEMY_DEFS[cell.type].emoji} 受ダメ ${cell.atk} (残HP ${cell.hp})${comboTag}`, color: 'bad' })
          if (this.player.hp <= 0) {
            this.player.hp = 0
            this.cells[r][c] = { type: 'empty' }
            this.playerPos = { r, c }
            msgs.push({ text: `💀 ゲームオーバー`, color: 'bad' })
            this.phase = 'gameover'
            return { msgs, combo, lootDrops }
          }
        }
      } else if (cell.type === 'potion') {
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1)
        msgs.push({ text: `🧪 薬 HP+1`, color: 'good' })
        this.cells[r][c] = { type: 'empty' }
      } else if (cell.type === 'coin') {
        this.player.coins++
        msgs.push({ text: `🪙 コイン獲得 (${this.player.coins}/${SHOP_COST})`, color: 'muted' })
        this.cells[r][c] = { type: 'empty' }
      } else if (cell.type === 'xp') {
        const lvMsgs = this.gainXP(1)
        msgs.push({ text: `💧 経験値 +1`, color: 'muted' })
        msgs.push(...lvMsgs)
        this.cells[r][c] = { type: 'empty' }
      }
    }

    // Bomb upgrade
    const dest = path[path.length - 1]
    if (this.player.bomb) {
      let bombHits = 0
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          const nr = dest.r + dr, nc = dest.c + dc
          if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue
          const bcell = this.cells[nr][nc]
          if (bcell.type === 'goblin' || bcell.type === 'archer' || bcell.type === 'orc') {
            bcell.hp -= this.player.atk
            bombHits++
            if (bcell.hp <= 0) {
              const drops = this._dropLoot(nr, nc)
              lootDrops.push(...drops)
              this.cells[nr][nc] = { type: 'empty' }
            }
          }
        }
      }
      if (bombHits > 0) msgs.push({ text: `💣 ボム ${bombHits}体にダメージ！`, color: 'warn' })
    }

    this.cells[dest.r][dest.c] = { type: 'player' }
    this.playerPos = { r: dest.r, c: dest.c }
    this.lastCombo = combo

    if (this.player.coins >= SHOP_COST) {
      this.player.coins -= SHOP_COST
      this.phase = 'shop'
    }

    return { msgs, combo, lootDrops }
  }

  gainXP(amount) {
    this.player.xp += amount
    const msgs = []
    while (this.player.xp >= this.player.xpMax) {
      this.player.xp -= this.player.xpMax
      this.player.level++
      this.player.xpMax += 5
      this.player.maxHp += 5
      this.player.hp = this.player.maxHp
      msgs.push({ text: `⬆ LEVEL UP! Lv${this.player.level}  MaxHP+5 HP全回復`, color: 'good' })
    }
    return msgs
  }

  _dropLoot(fromR, fromC, enemyType = null) {
    const drops = []

    // 岩：コインのみ確定ドロップ
    if (enemyType === 'rock') {
      const spot = this._findNearbyEmpty(fromR, fromC)
      if (spot) {
        this.cells[spot.r][spot.c] = { type: 'coin', value: 1 }
        drops.push({ r: spot.r, c: spot.c, type: 'coin' })
      }
      return drops
    }

    // 通常敵：経験値確定 + 50%で薬orコイン
    const xpSpot = this._findNearbyEmpty(fromR, fromC)
    if (xpSpot) {
      this.cells[xpSpot.r][xpSpot.c] = { type: 'xp', value: 1 }
      drops.push({ r: xpSpot.r, c: xpSpot.c, type: 'xp' })
    }

    if (Math.random() < 0.5) {
      const spot = this._findNearbyEmpty(fromR, fromC, xpSpot ? [xpSpot] : [])
      if (spot) {
        const type = Math.random() < 0.5 ? 'potion' : 'coin'
        this.cells[spot.r][spot.c] = { type, value: 1 }
        drops.push({ r: spot.r, c: spot.c, type })
      }
    }

    return drops
  }

  _findNearbyEmpty(fromR, fromC, exclude = []) {
    const nearby = this.getEmpties().filter(e =>
      !(e.r === fromR && e.c === fromC) &&
      Math.abs(e.r - fromR) <= 2 && Math.abs(e.c - fromC) <= 2 &&
      !exclude.some(ex => ex && ex.r === e.r && ex.c === e.c)
    )
    const pool = nearby.length > 0
      ? nearby
      : this.getEmpties().filter(e =>
          !(e.r === fromR && e.c === fromC) &&
          !exclude.some(ex => ex && ex.r === e.r && ex.c === e.c)
        )
    if (pool.length === 0) return null
    return pool[Math.floor(Math.random() * pool.length)]
  }

  // Path validation helpers
  isValidPathStep(path, next) {
    if (path.length === 0) return false
    const last = path[path.length - 1]
    if (Math.abs(last.r - next.r) > 1 || Math.abs(last.c - next.c) > 1) return false
    if (last.r === next.r && last.c === next.c) return false
    return true
  }

  isValidDestination(path) {
    if (path.length < 2) return false
    const dest = path[path.length - 1]
    const cell = this.getCell(dest.r, dest.c)
    if (!cell) return false
    const ENEMIES = ['goblin', 'archer', 'rock']
    if (!ENEMIES.includes(cell.type)) return true
    // 敵マスは撃破確定の場合のみOK
    return this._isKillShot(path)
  }

  _isKillShot(path) {
    const dest = path[path.length - 1]
    const ENEMIES = ['goblin', 'archer', 'rock']
    const simHp = {}
    let combo = 0

    for (let i = 1; i < path.length; i++) {
      const { r, c } = path[i]
      const cell = this.cells[r][c]
      if (!ENEMIES.includes(cell.type)) continue

      const key = `${r},${c}`
      if (!(key in simHp)) simHp[key] = cell.hp
      if (simHp[key] <= 0) continue

      combo++
      const mult = 1 + (combo - 1) * 0.2
      const dmg = Math.ceil(this.player.atk * mult)
      simHp[key] -= dmg

      if (r === dest.r && c === dest.c && simHp[key] <= 0) return true
    }
    return false
  }
}
