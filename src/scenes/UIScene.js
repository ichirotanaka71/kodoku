import Phaser from 'phaser'
import { COLORS, FONT, GRID_OFFSET_Y } from '../utils/constants.js'

export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' })
  }

  init(data) {
    this.gs = data.gs
    this.gameScene = data.gameScene
  }

  create() {
    this._buildHUD()
    this._buildButtons()
    this._buildStepBar()
    this._buildLogBox()
    this.updateHUD()
  }

  // =============================================
  // HUD (top bar)
  // =============================================
  _buildHUD() {
    this.add.rectangle(270, 52, 540, 100, COLORS.HUD_BG).setOrigin(0.5)

    const labelStyle = { fontSize: '10px', fontFamily: 'monospace', color: '#94a3b8' }
    const valStyle   = { fontSize: '18px', fontFamily: 'monospace', color: '#f1f5f9' }

    const stats = [
      { key: 'hp',    label: 'HP',   x: 36 },
      { key: 'atk',   label: 'ATK',  x: 102 },
      { key: 'steps', label: 'STEP', x: 168 },
      { key: 'coins', label: 'COIN', x: 234 },
      { key: 'turn',  label: 'TURN', x: 300 },
      { key: 'lv',    label: 'LV',   x: 366 },
      { key: 'xp',    label: 'XP',   x: 432 },
      { key: 'combo', label: 'CMB',  x: 504 },
    ]

    this.hudTexts = {}
    for (const s of stats) {
      this.add.text(s.x, 16, s.label, labelStyle).setOrigin(0.5, 0)
      this.hudTexts[s.key] = this.add.text(s.x, 34, '—', valStyle).setOrigin(0.5, 0)
    }

    this.hpBarGfx = this.add.graphics()
    this._drawHPBar()
  }

  _drawHPBar() {
    const gfx = this.hpBarGfx
    gfx.clear()
    const { hp, maxHp } = this.gs.player
    const bw = 100, bh = 6
    const bx = 270 - bw / 2, by = 68
    gfx.fillStyle(COLORS.HP_BAR_BG)
    gfx.fillRoundedRect(bx, by, bw, bh, 3)
    const ratio = Math.max(0, hp / maxHp)
    const col = ratio > 0.5 ? 0x4ade80 : ratio > 0.25 ? 0xfbbf24 : 0xef4444
    gfx.fillStyle(col)
    gfx.fillRoundedRect(bx, by, bw * ratio, bh, 3)
  }

  updateHUD() {
    if (!this.gs) return
    const p = this.gs.player
    this.hudTexts.hp.setText(`${p.hp}/${p.maxHp}`)
    this.hudTexts.hp.setColor(p.hp <= 5 ? '#f87171' : '#f1f5f9')
    this.hudTexts.atk.setText(`${p.atk}`)
    this.hudTexts.steps.setText(`${p.maxSteps}`)
    this.hudTexts.coins.setText(`${p.coins}`)
    this.hudTexts.turn.setText(`${this.gs.turn}`)
    this.hudTexts.lv.setText(`${p.level}`)
    this.hudTexts.xp.setText(`${p.xp}/${p.xpMax}`)
    this.hudTexts.combo.setText(this.gs.lastCombo > 1 ? `${this.gs.lastCombo}` : '—')
    this.hudTexts.combo.setColor(this.gs.lastCombo > 1 ? '#fbbf24' : '#94a3b8')
    this._drawHPBar()
  }

  updateHPPreview(damage) {
    if (!this.gs) return
    const p = this.gs.player
    if (damage === 0) {
      this.hudTexts.hp.setText(`${p.hp}/${p.maxHp}`)
      this.hudTexts.hp.setColor(p.hp <= 5 ? '#f87171' : '#f1f5f9')
    } else {
      const predicted = p.hp - damage
      const col = predicted <= 0 ? '#f87171' : '#fb923c'
      this.hudTexts.hp.setText(`${p.hp}→${predicted}/${p.maxHp}`)
      this.hudTexts.hp.setColor(col)
    }
  }

  // =============================================
  // Step info bar (below grid)
  // =============================================
  _buildStepBar() {
    const y = 640
    this.stepText = this.add.text(270, y, '残り歩数: 7', {
      fontSize: '13px', fontFamily: 'monospace', color: '#94a3b8',
    }).setOrigin(0.5)
  }

  updateSteps(used, max) {
    const rem = max - used
    const col = rem <= 1 ? '#f87171' : rem <= 2 ? '#fbbf24' : '#94a3b8'
    this.stepText.setText(`残り歩数: ${rem} / ${max}`)
    this.stepText.setColor(col)
  }

  // =============================================
  // Buttons
  // =============================================
  _buildButtons() {
    const y = 660
    const btnData = [
      { label: '✓ 確定\n(Enter)', x: 100, action: () => this.gameScene.confirmMove() },
      { label: '✗ キャンセル\n(Esc)',  x: 270, action: () => this.gameScene.cancelPath() },
      { label: '→ スキップ',           x: 430, action: () => this.gameScene.skipTurn() },
    ]

    for (const b of btnData) {
      const bg = this.add.rectangle(b.x, y, 130, 44, 0x1e3a5f)
        .setInteractive({ cursor: 'pointer' })
        .setOrigin(0.5)
      bg.on('pointerover', () => bg.setFillStyle(0x2d5282))
      bg.on('pointerout',  () => bg.setFillStyle(0x1e3a5f))
      bg.on('pointerdown', b.action)

      this.add.text(b.x, y, b.label, {
        fontSize: '12px', fontFamily: 'monospace', color: '#e2e8f0', align: 'center',
      }).setOrigin(0.5)
    }
  }

  // =============================================
  // Path preview (called from GameScene during drag)
  // =============================================
  updateHpRealtime(currentHp, maxHp) {
    if (!this.hudTexts) return
    this.tweens.killTweensOf(this.hudTexts.hp)
    if (currentHp <= 0) {
      this.hudTexts.hp.setAlpha(1)
      this.hudTexts.hp.setText(`💀${currentHp}/${maxHp}`)
      this.hudTexts.hp.setColor('#f87171')
      this.tweens.add({
        targets: this.hudTexts.hp,
        alpha: 0.3,
        duration: 200,
        yoyo: true,
        repeat: -1,
      })
    } else {
      this.hudTexts.hp.setAlpha(1)
      this.hudTexts.hp.setText(`${currentHp}/${maxHp}`)
      this.hudTexts.hp.setColor(currentHp <= 5 ? '#f87171' : '#f1f5f9')
    }
  }

  updatePreview({ dmg, healHp, gainCoins, gainXp }) {
    if (!this.gs) return
    const p = this.gs.player

    // HP（仮死プレビュー対応）
    const predictedHp = p.hp - dmg + healHp
    if (dmg > 0 || healHp > 0) {
      const col = predictedHp <= 0 ? '#f87171' : predictedHp < p.hp ? '#fb923c' : '#4ade80'
      const label = predictedHp <= 0
        ? `${p.hp} → 💀${predictedHp}/${p.maxHp}`
        : `${p.hp} → ${predictedHp}/${p.maxHp}`
      this.hudTexts.hp.setText(label)
      this.hudTexts.hp.setColor(col)
    } else {
      this.hudTexts.hp.setText(`${p.hp}/${p.maxHp}`)
      this.hudTexts.hp.setColor(p.hp <= 5 ? '#f87171' : '#f1f5f9')
    }

    // COIN
    if (gainCoins > 0) {
      this.hudTexts.coins.setText(`${p.coins}→${p.coins + gainCoins}`)
      this.hudTexts.coins.setColor('#fde68a')
    } else {
      this.hudTexts.coins.setText(`${p.coins}`)
      this.hudTexts.coins.setColor('#f1f5f9')
    }

    // XP
    if (gainXp > 0) {
      this.hudTexts.xp.setText(`${p.xp}→${p.xp + gainXp}/${p.xpMax}`)
      this.hudTexts.xp.setColor('#a78bfa')
    } else {
      this.hudTexts.xp.setText(`${p.xp}/${p.xpMax}`)
      this.hudTexts.xp.setColor('#f1f5f9')
    }
  }

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

  // =============================================
  // Log box
  // =============================================
  _buildLogBox() {
    // Thin strip at very bottom (optional)
  }
}
