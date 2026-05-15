import Phaser from 'phaser'
import {
  GRID_COLS, GRID_ROWS, CELL_SIZE, CELL_GAP,
  GRID_OFFSET_X, GRID_OFFSET_Y, COLORS, FONT,
  ENEMY_DEFS, SHOP_COST,
} from '../utils/constants.js'
import { GameState } from '../utils/GameState.js'

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' })
  }

  create() {
    this.gs = new GameState()
    this.path = []
    this.dragging = false
    this.animating = false
    this.enemyPopup = null

    this._buildGrid()
    this._buildPathGraphics()
    this._buildDropAnims()
    this._buildFloatingTexts()
    this.renderAll()

    // Launch UI overlay
    this.scene.launch('UIScene', { gs: this.gs, gameScene: this })

    this._setupInput()

    // Initial spawns (enemy phase without turn increment)
    this.gs._spawnObjects()
    this.renderAll()
  }

  // =========================================================
  // Grid building
  // =========================================================
  _buildGrid() {
    this.cellBgs = []
    this.cellObjects = []   // emoji text objects
    this.hpBars = []
    this.ctTexts = []
    this.enemyHpTexts = []
    this.enemyAtkTexts = []

    for (let r = 0; r < GRID_ROWS; r++) {
      this.cellBgs[r] = []
      this.cellObjects[r] = []
      this.hpBars[r] = []
      this.ctTexts[r] = []
      this.enemyHpTexts[r] = []
      this.enemyAtkTexts[r] = []
      for (let c = 0; c < GRID_COLS; c++) {
        const { x, y } = this._cellCenter(r, c)

        // Background rect
        const bg = this.add.rectangle(x, y, CELL_SIZE - 2, CELL_SIZE - 2, COLORS.CELL_EMPTY)
          .setOrigin(0.5)
        bg.setInteractive()
        this.cellBgs[r][c] = bg

        // HP bar (graphics)
        const hpGfx = this.add.graphics()
        this.hpBars[r][c] = hpGfx

        // CT label（右上）
        const ct = this.add.text(x + 28, y - 26, '', {
          ...FONT.WARN, fontSize: '10px',
        }).setOrigin(1, 0)
        this.ctTexts[r][c] = ct

        // 敵HP表示（下・HPバーの近く）
        const hpTxt = this.add.text(x, y + 28, '', {
          fontSize: '10px', fontFamily: 'monospace', color: '#fca5a5',
        }).setOrigin(0.5, 0).setDepth(6)
        this.enemyHpTexts[r][c] = hpTxt

        // 敵ATK表示（左上）
        const atkTxt = this.add.text(x - 28, y - 26, '', {
          fontSize: '10px', fontFamily: 'monospace', color: '#fda4af',
        }).setOrigin(0, 0).setDepth(6)
        this.enemyAtkTexts[r][c] = atkTxt

        // Object/emoji text
        const obj = this.add.text(x, y, '', {
          fontSize: '28px',
        }).setOrigin(0.5)
        this.cellObjects[r][c] = obj
      }
    }
  }

  _cellCenter(r, c) {
    return {
      x: GRID_OFFSET_X + c * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2,
      y: GRID_OFFSET_Y + r * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2,
    }
  }

  _buildPathGraphics() {
    this.pathGfx = this.add.graphics()
    this.pathGfx.setDepth(5)
  }

  _buildDropAnims() {
    // Container for drop-in animation tweens
    this.dropAnimating = false
  }

  _buildFloatingTexts() {
    this.floatPool = []
    this.killMarkTexts = []
  }

  // =========================================================
  // Rendering
  // =========================================================
  renderAll() {
    this._renderCells()
    this._renderPath()
    this._updateUI()
  }

  _renderCells() {
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const cell = this.gs.cells[r][c]
        const bg = this.cellBgs[r][c]
        const obj = this.cellObjects[r][c]
        const hpGfx = this.hpBars[r][c]
        const ctTxt = this.ctTexts[r][c]
        const { x, y } = this._cellCenter(r, c)

        // Reset position (may have been moved by animation)
        obj.setPosition(x, y)

        // Background color
        bg.setFillStyle(COLORS.CELL_EMPTY)

        // Object
        hpGfx.clear()
        ctTxt.setText('')
        this.enemyHpTexts[r][c].setText('')
        this.enemyAtkTexts[r][c].setText('')

        switch (cell.type) {
          case 'player':
            obj.setText('🧙')
            obj.setFontSize('30px')
            break
          case 'goblin':
            obj.setText('👺')
            obj.setFontSize('26px')
            this._drawHpBar(hpGfx, x, y, cell.hp, cell.maxHp)
            if (cell.ct != null) ctTxt.setText(`⏱${cell.ct}`)
            this.enemyHpTexts[r][c].setText(`HP${cell.hp}`)
            this.enemyAtkTexts[r][c].setText(`⚔${cell.atk}`)
            break
          case 'archer':
            obj.setText('🏹')
            obj.setFontSize('26px')
            this._drawHpBar(hpGfx, x, y, cell.hp, cell.maxHp)
            this.enemyHpTexts[r][c].setText(`HP${cell.hp}`)
            this.enemyAtkTexts[r][c].setText(`⚔${cell.atk}`)
            break
          case 'rock':
            obj.setText('🪨')
            obj.setFontSize('26px')
            this._drawHpBar(hpGfx, x, y, cell.hp, cell.maxHp)
            this.enemyHpTexts[r][c].setText(`HP${cell.hp}`)
            break
          case 'potion':
            obj.setText('🧪')
            obj.setFontSize('26px')
            break
          case 'coin':
            obj.setText('🪙')
            obj.setFontSize('24px')
            break
          case 'xp':
            obj.setText('💧')
            obj.setFontSize('24px')
            break
          default:
            obj.setText('')
        }

        obj.setDepth(4)
        ctTxt.setDepth(6)
        hpGfx.setDepth(4)
      }
    }
  }

  _drawHpBar(gfx, x, y, hp, maxHp) {
    const bw = CELL_SIZE - 12
    const bh = 4
    const bx = x - bw / 2
    const by = y + 22
    gfx.fillStyle(COLORS.HP_BAR_BG)
    gfx.fillRoundedRect(bx, by, bw, bh, 2)
    gfx.fillStyle(COLORS.HP_BAR_FG)
    gfx.fillRoundedRect(bx, by, Math.max(0, bw * (hp / maxHp)), bh, 2)
  }

  _renderPath() {
    const gfx = this.pathGfx
    gfx.clear()

    // Clear kill marks
    for (const km of this.killMarkTexts) km.destroy()
    this.killMarkTexts = []

    if (this.path.length === 0) {
      for (let r = 0; r < GRID_ROWS; r++)
        for (let c = 0; c < GRID_COLS; c++) {
          this.cellBgs[r][c].setFillStyle(COLORS.CELL_EMPTY)
          this.cellBgs[r][c].setStrokeStyle(0)
        }
      this.scene.get('UIScene')?.updatePreview({ dmg: 0, healHp: 0, gainCoins: 0, gainXp: 0 })
      return
    }

    // Highlight path cells
    for (let r = 0; r < GRID_ROWS; r++)
      for (let c = 0; c < GRID_COLS; c++) {
        this.cellBgs[r][c].setFillStyle(COLORS.CELL_EMPTY)
        this.cellBgs[r][c].setStrokeStyle(0)
      }

    const destValid = this.gs.isValidDestination(this.path)

    for (let i = 0; i < this.path.length; i++) {
      const { r, c } = this.path[i]
      if (i === 0) continue // skip player pos
      const isLast = i === this.path.length - 1
      let col
      if (isLast) col = destValid ? 0x166534 : 0x7f1d1d
      else col = 0x1e3a5f
      this.cellBgs[r][c].setFillStyle(col)
    }

    // Draw path lines
    gfx.lineStyle(3, COLORS.PATH_LINE, 0.7)
    gfx.beginPath()
    const start = this._cellCenter(this.path[0].r, this.path[0].c)
    gfx.moveTo(start.x, start.y)
    for (let i = 1; i < this.path.length; i++) {
      const { x, y } = this._cellCenter(this.path[i].r, this.path[i].c)
      gfx.lineTo(x, y)
    }
    gfx.strokePath()

    // Draw path nodes
    for (let i = 1; i < this.path.length; i++) {
      const { r, c } = this.path[i]
      const { x, y } = this._cellCenter(r, c)
      const isLast = i === this.path.length - 1
      if (isLast) {
        gfx.fillStyle(destValid ? COLORS.DEST_OK : COLORS.DEST_NG, 0.9)
        gfx.fillCircle(x, y, 10)
      } else {
        gfx.fillStyle(COLORS.PATH_NODE, 0.6)
        gfx.fillCircle(x, y, 6)
      }
    }

    // Kill marks（simHp で累積ダメージを追跡し、コンボ撃破を正確に判定）
    const simHp = {}
    let combo = 0
    for (let i = 1; i < this.path.length; i++) {
      const { r, c } = this.path[i]
      const cell = this.gs.cells[r][c]
      const isEnemy = cell.type === 'goblin' || cell.type === 'archer' || cell.type === 'rock'
      if (!isEnemy) continue
      const key = `${r},${c}`
      if (!(key in simHp)) simHp[key] = cell.hp
      if (simHp[key] <= 0) continue

      combo++
      const mult = 1 + (combo - 1) * 0.2
      const dmg = Math.ceil(this.gs.player.atk * mult)
      simHp[key] -= dmg
    }

    for (const key of Object.keys(simHp)) {
      if (simHp[key] <= 0) {
        const [r, c] = key.split(',').map(Number)
        const { x, y } = this._cellCenter(r, c)
        const km = this.add.text(x, y, '✕', {
          fontSize: '30px',
          color: '#ef4444',
          stroke: '#000',
          strokeThickness: 3,
        }).setOrigin(0.5).setDepth(20)
        this.killMarkTexts.push(km)
      }
    }

    this.scene.get('UIScene')?.updatePreview(this._calcPathPreview(this.path))
  }

  _calcPathPreview(path) {
    let dmg = 0, healHp = 0, gainCoins = 0, gainXp = 0, combo = 0
    for (let i = 1; i < path.length; i++) {
      const cell = this.gs.cells[path[i].r][path[i].c]
      if (cell.type === 'goblin' || cell.type === 'archer' || cell.type === 'rock') {
        combo++
        const mult = 1 + (combo - 1) * 0.2
        const playerDmg = Math.ceil(this.gs.player.atk * mult)
        if (playerDmg < cell.hp) dmg += cell.atk
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

  _updateUI() {
    this.scene.get('UIScene')?.updateHUD()
  }

  // =========================================================
  // Input
  // =========================================================
  _setupInput() {
    this.input.on('pointerdown', this.onPointerDown, this)
    this.input.on('pointermove', this.onPointerMove, this)
    this.input.on('pointerup',   this.onPointerUp,   this)

    this.input.keyboard.on('keydown-ENTER', () => this._confirmMove())
    this.input.keyboard.on('keydown-SPACE', () => this._confirmMove())
    this.input.keyboard.on('keydown-ESC',   () => this._cancelPath())
  }

  onPointerDown(ptr) {
    // 既存ポップアップを閉じる
    if (this.enemyPopup) { this.enemyPopup.destroy(); this.enemyPopup = null }

    if (this.animating || this.gs.phase !== 'player') return
    const hit = this.gridPosAt(ptr.x, ptr.y)
    if (!hit) return

    const pp = this.gs.playerPos
    if (hit.r === pp.r && hit.c === pp.c) {
      // プレイヤーマス → ドラッグ開始
      this.dragging = true
      this.path = [hit]
      this.setHighlight(hit, true)
      this._renderPath()
      this._updateStepInfo()
      return
    }

    // 敵マス → 情報ポップアップ（ドラッグは開始しない）
    const cell = this.gs.cells[hit.r][hit.c]
    const ENEMIES = ['goblin', 'archer', 'rock']
    if (ENEMIES.includes(cell.type)) this._showEnemyInfo(hit.r, hit.c)
  }

  onPointerMove(ptr) {
    if (!this.dragging || this.animating || this.path.length === 0) return

    // 前フレームから今フレームまで8点補間してマスをスキップしないようにする
    const prevX = ptr.prevPosition?.x ?? ptr.x
    const prevY = ptr.prevPosition?.y ?? ptr.y
    const steps = 8
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const ix = Phaser.Math.Linear(prevX, ptr.x, t)
      const iy = Phaser.Math.Linear(prevY, ptr.y, t)
      this._processPointerAt(ix, iy)
      if (!this.dragging) return  // キャンセルされたら打ち切る
    }
  }

  _processPointerAt(worldX, worldY) {
    // グリッド外に出たらキャンセル
    const boardRight  = GRID_OFFSET_X + GRID_COLS * (CELL_SIZE + CELL_GAP) - CELL_GAP
    const boardBottom = GRID_OFFSET_Y + GRID_ROWS * (CELL_SIZE + CELL_GAP) - CELL_GAP
    if (worldX < GRID_OFFSET_X || worldX > boardRight ||
        worldY < GRID_OFFSET_Y || worldY > boardBottom) {
      this._cancelPath()
      this.dragging = false
      return
    }

    // 末端セル中心からの距離・角度でスナップ（斜め8方向を等確率で検出）
    const last = this.path[this.path.length - 1]
    const { x: lx, y: ly } = this._cellCenter(last.r, last.c)
    const dx = worldX - lx
    const dy = worldY - ly
    const dist = Math.sqrt(dx * dx + dy * dy)

    // デッドゾーン: STEP*√2/2 より大きく設定しないと斜めセル追加直後に即バックトラックする
    // 斜め隣中心距離 = STEP*√2 ≈ 96px → 半分 = 48px を超える値が必要
    if (dist < (CELL_SIZE + CELL_GAP) * 0.75) return

    // 8方向テーブル: 右→右下→下→左下→左→左上→上→右上
    const DR = [0,  1, 1,  1, 0, -1, -1, -1]
    const DC = [1,  1, 0, -1, -1, -1,  0,  1]
    const idx = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8
    const hit = { r: last.r + DR[idx], c: last.c + DC[idx] }

    if (hit.r < 0 || hit.r >= GRID_ROWS || hit.c < 0 || hit.c >= GRID_COLS) return

    const n = this.path.length

    // バックトラック: 直前マスに戻ったら末尾をpopして縮める
    if (n >= 2) {
      const prev = this.path[n - 2]
      if (prev.r === hit.r && prev.c === hit.c) {
        this.setHighlight(this.path[n - 1], false)
        this.path.pop()
        this._renderPath()
        this._updateStepInfo()
        return
      }
    }

    if (hit.r === last.r && hit.c === last.c) return
    if (this.path.length - 1 >= this.gs.player.maxSteps) return

    this.path.push(hit)
    this.setHighlight(hit, true)
    this._renderPath()
    this._updateStepInfo()
  }

  onPointerUp(ptr) {
    if (!this.dragging) return
    this.dragging = false

    const hit = this.gridPosAt(ptr.x, ptr.y)
    if (!hit || this.path.length < 2) {
      this._cancelPath()
      return
    }

    if (!this.gs.isValidDestination(this.path)) {
      this._flashMsg('その敵は撃破できません')
      this._cancelPath()
      return
    }

    this._confirmMove()
  }

  // ワールド座標 → グリッド座標（最近傍セル中心へ丸め、斜めを均等に検出）
  gridPosAt(worldX, worldY) {
    const c = Math.round((worldX - GRID_OFFSET_X - CELL_SIZE / 2) / (CELL_SIZE + CELL_GAP))
    const r = Math.round((worldY - GRID_OFFSET_Y - CELL_SIZE / 2) / (CELL_SIZE + CELL_GAP))
    if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) return null
    return { r, c }
  }

  isAdjacent(a, b) {
    return Math.abs(a.r - b.r) <= 1 && Math.abs(a.c - b.c) <= 1 && !(a.r === b.r && a.c === b.c)
  }

  setHighlight(pos, active) {
    const bg = this.cellBgs[pos.r][pos.c]
    if (!bg) return
    if (active) bg.setStrokeStyle(2, 0xffffff, 0.6)
    else bg.setStrokeStyle(0)
  }

  _updateStepInfo() {
    const steps = this.path.length > 0 ? this.path.length - 1 : 0
    this.scene.get('UIScene')?.updateSteps(steps, this.gs.player.maxSteps)
  }

  // =========================================================
  // Actions (called by UIScene buttons too)
  // =========================================================
  confirmMove() { this._confirmMove() }
  cancelPath() { this._cancelPath() }
  skipTurn() { this._skipTurn() }

  _confirmMove() {
    if (this.animating || this.gs.phase !== 'player') return
    if (this.path.length < 2) { this._flashMsg('経路を引いてください'); return }
    if (!this.gs.isValidDestination(this.path)) { this._flashMsg('終着点は空マスのみ！'); return }

    this.animating = true
    this._animateMove()
  }

  _cancelPath() {
    this.path = []
    this._renderPath()
    this._updateStepInfo()
  }

  _skipTurn() {
    if (this.animating || this.gs.phase !== 'player') return
    this.path = []
    this._doEnemyPhase()
  }

  // =========================================================
  // Move animation
  // =========================================================
  _animateMove() {
    const path = [...this.path]
    this.path = []
    this._renderPath()
    this.animating = true

    const { r: startR, c: startC } = path[0]
    this.gs.cells[startR][startC] = { type: 'empty' }
    const playerObj = this.cellObjects[startR][startC]

    let step = 0
    let combo = 0
    const flyQueue = []  // 終着点でまとめて発火

    const moveStep = async () => {
      if (step >= path.length - 1) {
        const dest = path[path.length - 1]

        // flyQueue を一斉発火（コイン・薬・XP が HUD へ飛ぶ）
        await this._fireFlyQueue(flyQueue)

        // 死亡判定（仮死システム：終着点到着後に判定）
        if (this.gs.player.hp <= 0) {
          this.gs.cells[dest.r][dest.c] = { type: 'player' }
          this.gs.playerPos = { r: dest.r, c: dest.c }
          this.gs.phase = 'gameover'
          this.renderAll()
          this.animating = false
          this._floatText('💀 ゲームオーバー', 'bad')
          this.time.delayedCall(800, () => {
            this.scene.launch('GameOverScene', { gs: this.gs, gameScene: this })
            this.scene.pause()
          })
          return
        }

        // ボム処理
        if (this.gs.player.bomb) {
          let bombHits = 0
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dr === 0 && dc === 0) continue
              const nr = dest.r + dr, nc = dest.c + dc
              if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue
              const bcell = this.gs.cells[nr][nc]
              if (bcell.type === 'goblin' || bcell.type === 'archer' || bcell.type === 'rock') {
                bcell.hp -= this.gs.player.atk
                bombHits++
                if (bcell.hp <= 0) {
                  const drops = this.gs._dropLoot(nr, nc, bcell.type)
                  this.gs.cells[nr][nc] = { type: 'empty' }
                  for (const d of drops) this._updateCell(d.toR, d.toC)
                  this._animateLootDrops(drops)
                }
              }
            }
          }
          if (bombHits > 0) this._floatText(`💣 ボム ${bombHits}体にダメージ！`, 'warn')
        }

        // プレイヤー位置を確定
        this.gs.cells[dest.r][dest.c] = { type: 'player' }
        this.gs.playerPos = { r: dest.r, c: dest.c }
        this.gs.lastCombo = combo

        if (combo > 1) this._showComboFlash(combo)

        // ショップ判定
        if (this.gs.player.coins >= SHOP_COST) {
          this.gs.player.coins -= SHOP_COST
          this.gs.phase = 'shop'
        }

        this.time.delayedCall(combo > 1 ? 400 : 100, () => {
          this.renderAll()
          this.animating = false

          if (this.gs.phase === 'shop') {
            this.time.delayedCall(200, () => {
              this.scene.launch('ShopScene', { gs: this.gs, gameScene: this })
            })
            return
          }
          this._doEnemyPhase()
        })
        return
      }

      step++
      const { r, c } = path[step]
      const { x, y } = this._cellCenter(r, c)

      this.cellObjects[r][c].setAlpha(0.3)
      await this._movePlayerTo(playerObj, x, y)
      this.cellObjects[r][c].setAlpha(1)

      const cell = this.gs.cells[r][c]

      if (cell.type === 'coin') {
        this.gs.player.coins++
        this.cellObjects[r][c].setText('')
        this.gs.cells[r][c] = { type: 'empty' }
        flyQueue.push({ type: 'coin', from: { x, y } })

      } else if (cell.type === 'potion') {
        this.gs.player.hp += 1
        this.cellObjects[r][c].setText('')
        this.gs.cells[r][c] = { type: 'empty' }
        flyQueue.push({ type: 'potion', from: { x, y } })
        // 仮死中の薬は即時HP表示更新（蘇生の可視化）
        this.scene.get('UIScene')?.updateHpRealtime(this.gs.player.hp, this.gs.player.maxHp)

      } else if (cell.type === 'xp') {
        // XP は終着後に gainXP() でまとめて処理する（レベルアップ判定含む）
        this.cellObjects[r][c].setText('')
        this.gs.cells[r][c] = { type: 'empty' }
        flyQueue.push({ type: 'xp', from: { x, y } })

      } else if (cell.type === 'goblin' || cell.type === 'archer' || cell.type === 'rock') {
        combo++
        await this._fightEnemy(r, c, combo)
        // HP をリアルタイム更新（仮死表示・点滅含む）
        this.scene.get('UIScene')?.updateHpRealtime(this.gs.player.hp, this.gs.player.maxHp)
      }

      moveStep()
    }

    moveStep()
  }

  // flyQueue を一斉発火し、全完了後に HUD を更新
  async _fireFlyQueue(queue) {
    if (queue.length === 0) return

    const HUD_POS = {
      coin:   { x: 234, y: 40 },
      potion: { x: 36,  y: 40 },
      xp:     { x: 432, y: 40 },
    }
    const ICON = { coin: '🪙', potion: '🧪', xp: '💧' }
    const xpCount = queue.filter(i => i.type === 'xp').length

    const promises = queue.map(item => new Promise(resolve => {
      const flyObj = this.add.text(item.from.x, item.from.y, ICON[item.type], {
        fontSize: '24px',
      }).setOrigin(0.5).setDepth(30)
      this.tweens.add({
        targets: flyObj,
        x: HUD_POS[item.type].x,
        y: HUD_POS[item.type].y,
        scaleX: 0.3, scaleY: 0.3,
        duration: 400, ease: 'Quad.In',
        onComplete: () => { flyObj.destroy(); resolve() },
      })
    }))

    await Promise.all(promises)

    // XP の gainXP 処理（レベルアップ判定）
    if (xpCount > 0) {
      const lvMsgs = this.gs.gainXP(xpCount)
      lvMsgs.forEach((m, i) => {
        this.time.delayedCall(i * 200, () => this._floatText(m.text, m.color))
      })
    }

    const ui = this.scene.get('UIScene')
    ui?.updateHUD()
    const types = new Set(queue.map(i => i.type))
    if (types.has('coin'))   ui?.bounceHUD('coins')
    if (types.has('potion')) ui?.bounceHUD('hp')
    if (types.has('xp'))     ui?.bounceHUD('xp')
  }

  _animateLootDrop(fromR, fromC, toR, toC, cb) {
    const from = this._cellCenter(fromR, fromC)
    const to   = this._cellCenter(toR, toC)
    const obj  = this.cellObjects[toR][toC]

    obj.setPosition(from.x, from.y).setScale(0.5).setAlpha(1)

    const midX = (from.x + to.x) / 2
    const midY = Math.min(from.y, to.y) - 60

    this.tweens.add({
      targets: obj,
      x: midX, y: midY,
      scaleX: 0.8, scaleY: 0.8,
      duration: 200,
      ease: 'Quad.Out',
      onComplete: () => {
        this.tweens.add({
          targets: obj,
          x: to.x, y: to.y,
          scaleX: 1, scaleY: 1,
          duration: 200,
          ease: 'Bounce.Out',
          onComplete: cb,
        })
      },
    })
  }

  _flashCombatEffect(x, y) {
    const flash = this.add.text(x, y - 10, '⚔', {
      fontSize: '20px',
      stroke: '#000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(15)
    this.tweens.add({
      targets: flash,
      y: y - 30,
      alpha: 0,
      duration: 400,
      onComplete: () => flash.destroy(),
    })
  }

  // プレイヤーオブジェクトを指定座標へ移動（Promise）
  _movePlayerTo(obj, x, y) {
    return new Promise(resolve => {
      this.tweens.add({ targets: obj, x, y, duration: 120, ease: 'Linear', onComplete: resolve })
    })
  }

  // 敵との戦闘（true=撃破, false=生存）
  async _fightEnemy(r, c, combo) {
    const cell = this.gs.cells[r][c]
    const mult = 1 + (combo - 1) * 0.2
    const playerDmg = Math.ceil(this.gs.player.atk * mult)
    const isKill = playerDmg >= cell.hp

    this._hitStop(isKill ? 100 : 80)
    this._showDamageNumber(r, c, playerDmg, isKill)
    cell.hp -= playerDmg

    if (cell.hp <= 0) {
      if (this.gs.player.drain) {
        this.gs.player.hp = Math.min(this.gs.player.maxHp, this.gs.player.hp + 1)
        this._floatText('🩸 ドレイン HP+1', 'good')
      }
      await this._killEffect(r, c)
      const enemyType = cell.type
      this.gs.cells[r][c] = { type: 'empty' }
      const drops = this.gs._dropLoot(r, c, enemyType)
      for (const d of drops) this._updateCell(d.toR, d.toC)
      this._animateLootDrops(drops)
      return true
    } else {
      this.cameras.main.shake(80, 0.005)
      this.gs.player.hp -= cell.atk
      this.scene.get('UIScene')?.updateHUD()
      this.enemyHpTexts[r][c].setText(`HP${cell.hp}`)
      return false
    }
  }

  // 単一セルの表示だけを更新（アニメーション中のドロップ先に使用）
  _updateCell(r, c) {
    const cell = this.gs.cells[r][c]
    const obj = this.cellObjects[r][c]
    const { x, y } = this._cellCenter(r, c)
    obj.setPosition(x, y).setScale(1).setAlpha(1)
    switch (cell.type) {
      case 'xp':     obj.setText('💧').setFontSize('24px'); break
      case 'potion': obj.setText('🧪').setFontSize('26px'); break
      case 'coin':   obj.setText('🪙').setFontSize('24px'); break
      default:       obj.setText('')
    }
    obj.setDepth(4)
  }

  // ドロップアニメーション（複数対応ラッパー）
  _animateLootDrops(drops) {
    for (const d of drops) {
      this._animateLootDrop(d.fromR, d.fromC, d.toR, d.toC, () => {})
    }
  }

  _hitStop(duration = 80) {
    // delayedCall は timeScale の影響を受けるため setTimeout で実時間を使う
    this.time.timeScale = 0.05
    setTimeout(() => { if (this.time) this.time.timeScale = 1.0 }, duration)
  }

  _showDamageNumber(r, c, dmg, isKill) {
    const { x, y } = this._cellCenter(r, c)
    const txt = this.add.text(x, y, isKill ? `${dmg}💀` : `-${dmg}`, {
      fontSize: isKill ? '22px' : '18px',
      fontFamily: 'monospace',
      color: isKill ? '#ffffff' : '#fbbf24',
      stroke: '#000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(40)
    this.tweens.add({
      targets: txt,
      y: y - 50, alpha: 0,
      duration: 700, ease: 'Power2',
      onComplete: () => txt.destroy(),
    })
  }

  _killEffect(r, c) {
    return new Promise(resolve => {
      const obj = this.cellObjects[r][c]
      this.tweens.add({
        targets: obj,
        scaleX: 1.8, scaleY: 1.8, alpha: 0,
        duration: 200, ease: 'Power2',
        onComplete: () => { obj.setScale(1).setAlpha(1); resolve() },
      })
    })
  }

  _itemPickupEffect(r, c) {
    const obj = this.cellObjects[r][c]
    this.tweens.add({
      targets: obj,
      scaleX: 1.4, scaleY: 1.4,
      duration: 80, ease: 'Power2',
      yoyo: true,
    })
  }

  _showEnemyInfo(r, c) {
    const cell = this.gs.cells[r][c]
    const def = ENEMY_DEFS[cell.type]
    const { x, y } = this._cellCenter(r, c)

    if (this.enemyPopup) { this.enemyPopup.destroy(); this.enemyPopup = null }

    const popX = x + 150 > 520 ? x - 80 : x + 80
    const popY = Math.max(y - 20, 130)

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
    }).setDepth(50).setOrigin(0.5, 0)

    this.time.delayedCall(3000, () => {
      if (this.enemyPopup) { this.enemyPopup.destroy(); this.enemyPopup = null }
    })
  }

  _doEnemyPhase() {
    this.animating = true
    const { msgs, newCells, shots } = this.gs.enemyPhase()

    // アーチャー射撃アニメーションを先に再生してから続きへ
    const shotPromises = shots.map(s => this._animateArrowShot(s.fromR, s.fromC, s.toR, s.toC))
    Promise.all(shotPromises).then(() => {
      this._animateDrops(newCells, () => {
        msgs.forEach((m, i) => {
          this.time.delayedCall(i * 100, () => {
            this._floatText(m.text, m.color)
          })
        })
        this.time.delayedCall(msgs.length * 100 + 200, () => {
          this.renderAll()
          this.scene.get('UIScene')?.updateHUD()
          this.animating = false
          this._updateStepInfo()
        })
      })
    })
  }

  _animateArrowShot(fromR, fromC, toR, toC) {
    return new Promise(resolve => {
      const from = this._cellCenter(fromR, fromC)
      const to   = this._cellCenter(toR, toC)
      const arrow = this.add.text(from.x, from.y, '➶', { fontSize: '20px' })
        .setOrigin(0.5).setDepth(25)
      this.tweens.add({
        targets: arrow,
        x: to.x, y: to.y,
        duration: 300, ease: 'Linear',
        onComplete: () => {
          arrow.destroy()
          this.cameras.main.shake(60, 0.004)
          resolve()
        },
      })
    })
  }

  _animateDrops(newCells, cb) {
    this.renderAll()

    if (newCells.length === 0) {
      this.time.delayedCall(100, cb)
      return
    }

    let done = 0
    for (const { r, c } of newCells) {
      const { x, y } = this._cellCenter(r, c)
      const obj = this.cellObjects[r][c]

      obj.setY(-40).setAlpha(1).setScale(1)

      this.tweens.add({
        targets: obj,
        y,
        duration: 350,
        ease: 'Bounce.Out',
        onComplete: () => {
          done++
          if (done >= newCells.length) cb()
        },
      })
    }
  }

  // =========================================================
  // Visual helpers
  // =========================================================
  _floatText(msg, color = 'muted') {
    const colorMap = {
      muted: '#94a3b8',
      good:  '#4ade80',
      bad:   '#f87171',
      warn:  '#fbbf24',
    }
    const hexColor = colorMap[color] || colorMap.muted
    const x = 270
    const y = GRID_OFFSET_Y - 20
    const txt = this.add.text(x, y, msg, {
      fontSize: '13px',
      fontFamily: 'monospace',
      color: hexColor,
      stroke: '#0d1b2a',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20)

    this.tweens.add({
      targets: txt,
      y: y - 40,
      alpha: 0,
      duration: 1800,
      ease: 'Power2',
      onComplete: () => txt.destroy(),
    })
  }

  _flashMsg(msg) {
    this._floatText(`⚠ ${msg}`, 'warn')
  }

  _showComboFlash(combo) {
    const colors = ['#fbbf24', '#f97316', '#ef4444', '#ec4899']
    const col = colors[Math.min(combo - 2, colors.length - 1)]
    const txt = this.add.text(270, 360, `COMBO × ${combo}!!`, {
      fontSize: `${24 + combo * 2}px`,
      fontFamily: 'monospace',
      color: col,
      stroke: '#000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(30)

    this.tweens.add({
      targets: txt,
      scaleX: 1.3, scaleY: 1.3,
      yoyo: true,
      duration: 200,
      onComplete: () => {
        this.tweens.add({
          targets: txt,
          alpha: 0,
          y: txt.y - 30,
          duration: 600,
          onComplete: () => txt.destroy(),
        })
      },
    })
  }

  // Called by ShopScene after upgrade selected
  resumeAfterShop() {
    this.gs.phase = 'player'
    this.renderAll()
    this._doEnemyPhase()
  }
}
