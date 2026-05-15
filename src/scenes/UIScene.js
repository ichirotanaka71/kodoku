import Phaser from 'phaser'
import { COLORS, FONT, GAME_WIDTH, GAME_HEIGHT } from '../utils/constants.js'

const R1L = 8,  R1V = 24   // 行1 ラベル/値 y座標
const R2L = 68, R2V = 84   // 行2 ラベル/値 y座標
const HP_BAR_Y   = R1V + 20  // 44
const XP_BAR_Y   = R2V + 20  // 104
const COIN_BAR_Y = R2V + 20  // 104

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
    this.updateHUD()
  }

  // =============================================
  // HUD（2行構成）
  // =============================================
  _buildHUD() {
    this.add.rectangle(195, 65, 390, 130, COLORS.HUD_BG).setOrigin(0.5)

    const COL = [65, 195, 325]
    const labelStyle = { fontSize: '13px', fontFamily: 'monospace', color: '#94a3b8' }
    const valStyle   = { fontSize: '24px', fontFamily: 'monospace', color: '#f1f5f9' }

    const stats = [
      // 行1: HP / ATK / STEP
      { key: 'hp',    label: 'HP',   col: 0, labelY: R1L, valY: R1V },
      { key: 'atk',   label: 'ATK',  col: 1, labelY: R1L, valY: R1V },
      { key: 'steps', label: 'STEP', col: 2, labelY: R1L, valY: R1V },
      // 行2: COIN / XP / LV
      { key: 'coins', label: 'COIN', col: 0, labelY: R2L, valY: R2V },
      { key: 'xp',    label: 'XP',   col: 1, labelY: R2L, valY: R2V },
      { key: 'level', label: 'LV',   col: 2, labelY: R2L, valY: R2V },
    ]

    this.hudTexts = {}
    for (const s of stats) {
      this.add.text(COL[s.col], s.labelY, s.label, labelStyle).setOrigin(0, 0)
      this.hudTexts[s.key] = this.add.text(COL[s.col], s.valY, '—', valStyle).setOrigin(0, 0)
    }

    this.hpBarGfx = this.add.graphics()

    this.digitalBars = {}
    this._buildDigitalBar('steps', 350, HP_BAR_Y,   7,  0x4cc9f0)
    this._buildDigitalBar('xp',    235, XP_BAR_Y,   5,  0xa78bfa)
    this._buildDigitalBar('coins', 105, COIN_BAR_Y, 10, 0xfde68a)
  }

  _drawBarAt(gfx, cx, by, ratio, color) {
    const bw = 80
    gfx.clear()
    gfx.fillStyle(0x1e293b)
    gfx.fillRoundedRect(cx - bw / 2, by, bw, 5, 2)
    gfx.fillStyle(color)
    gfx.fillRoundedRect(cx - bw / 2, by, bw * Math.min(1, Math.max(0, ratio)), 5, 2)
  }

  _buildDigitalBar(key, cx, cy, total, colorFill, colorEmpty = 0x1e3a5f) {
    const blockH = 6
    const gap    = 2
    const totalW = 80
    const blockW = Math.floor((totalW - gap * (total - 1)) / total)
    const gfx = this.add.graphics().setDepth(3)
    this.digitalBars[key] = { gfx, cx, cy, total, blockW, blockH, gap, colorFill, colorEmpty }
  }

  _updateDigitalBar(key, current, maxVal = null) {
    const bar = this.digitalBars?.[key]
    if (!bar) return
    const { gfx, cx, cy, total, blockW, blockH, gap, colorFill, colorEmpty } = bar
    const filled = Math.round((current / (maxVal ?? total)) * total)
    const startX = cx - (total * (blockW + gap) - gap) / 2
    gfx.clear()
    for (let i = 0; i < total; i++) {
      const bx = startX + i * (blockW + gap)
      gfx.fillStyle(i < filled ? colorFill : colorEmpty)
      gfx.fillRoundedRect(bx, cy, blockW, blockH, 1)
    }
  }

  updateAllBars(previewHp = null, previewXp = null, previewCoin = null) {
    if (!this.gs) return
    const p = this.gs.player

    const hpRatio = (previewHp ?? p.hp) / p.maxHp
    this._drawBarAt(this.hpBarGfx, 75, HP_BAR_Y, hpRatio,
      hpRatio > 0.5 ? 0x4ade80 : hpRatio > 0.25 ? 0xfbbf24 : 0xef4444)

    this._updateDigitalBar('xp',    previewXp    ?? p.xp,    p.xpMax)
    this._updateDigitalBar('coins', previewCoin  ?? p.coins, 10)
  }

  updateHUD() {
    if (!this.gs) return
    const p = this.gs.player
    this.tweens.killTweensOf(this.hudTexts.hp)
    this.hudTexts.hp.setAlpha(1)
    this.hudTexts.hp.setText(`${p.hp}/${p.maxHp}`)
    this.hudTexts.hp.setColor(p.hp <= 5 ? '#f87171' : '#f1f5f9')
    this.hudTexts.atk.setText(`${p.atk}`)
    this.hudTexts.atk.setColor('#f1f5f9')
    this.hudTexts.coins.setText(`${p.coins}`)
    this.hudTexts.xp.setText(`${p.xp}/${p.xpMax}`)
    this.hudTexts.level.setText(`${p.level}`)
    // xpMax が変わったら XP バーのブロック数を再構築
    const xpBar = this.digitalBars?.['xp']
    if (xpBar && xpBar.total !== p.xpMax) {
      xpBar.gfx.destroy()
      this._buildDigitalBar('xp', 235, XP_BAR_Y, p.xpMax, 0xa78bfa)
    }
    this.updateStepDisplay(p.maxSteps, p.maxSteps)
    this.updateAllBars()
    if (this.turnText) this.turnText.setText(`TURN ${this.gs.turn}`)
  }

  // =============================================
  // リアルタイム HP（仮死表示・点滅）
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
    this.updateAllBars()
  }

  // =============================================
  // ATK（コンボ時に倍率表示）
  // =============================================
  updateAtkDisplay(baseAtk, combo = 0) {
    const txt = this.hudTexts?.atk
    if (!txt) return
    if (combo <= 1) {
      txt.setText(`${baseAtk}`)
      txt.setColor('#f1f5f9')
      return
    }
    const mult = 1 + (combo - 1) * 0.2
    txt.setText(`${(baseAtk * mult).toFixed(1)}`)
    if (combo === 2)      txt.setColor('#fbbf24')
    else if (combo === 3) txt.setColor('#f97316')
    else                  txt.setColor('#ef4444')
  }

  // =============================================
  // STEP（経路引き中・カウントアップ演出対応）
  // =============================================
  updateStepDisplay(remaining, maxSteps, isRestoring = false) {
    if (!this.hudTexts?.steps) return
    this.hudTexts.steps.setText(`${remaining}`)
    if (isRestoring) {
      this.hudTexts.steps.setColor('#4ade80')
    } else if (remaining <= 2) {
      this.hudTexts.steps.setColor('#f87171')
    } else if (remaining < maxSteps) {
      this.hudTexts.steps.setColor('#fbbf24')
    } else {
      this.hudTexts.steps.setColor('#f1f5f9')
    }
    this._updateDigitalBar('steps', remaining, maxSteps)
  }

  // =============================================
  // 経路プレビュー（矢印なし・色のみ）
  // =============================================
  updatePreview({ dmg, healHp, gainCoins, gainXp }) {
    if (!this.gs) return
    const p = this.gs.player

    // HP
    const predictedHp = p.hp - dmg + healHp
    if (dmg > 0 || healHp > 0) {
      const col = predictedHp <= 0 ? '#f87171' : predictedHp < p.hp ? '#fb923c' : '#4ade80'
      this.hudTexts.hp.setText(`${predictedHp}/${p.maxHp}`)
      this.hudTexts.hp.setColor(col)
    } else {
      this.hudTexts.hp.setText(`${p.hp}/${p.maxHp}`)
      this.hudTexts.hp.setColor(p.hp <= 5 ? '#f87171' : '#f1f5f9')
    }

    // COIN（合計値表示）
    if (gainCoins > 0) {
      this.hudTexts.coins.setText(`${p.coins + gainCoins}`)
      this.hudTexts.coins.setColor('#fde68a')
    } else {
      this.hudTexts.coins.setText(`${p.coins}`)
      this.hudTexts.coins.setColor('#f1f5f9')
    }

    // XP（合計値表示）
    if (gainXp > 0) {
      const predictedXp = Math.min(p.xpMax, p.xp + gainXp)
      this.hudTexts.xp.setText(`${predictedXp}/${p.xpMax}`)
      this.hudTexts.xp.setColor('#a78bfa')
    } else {
      this.hudTexts.xp.setText(`${p.xp}/${p.xpMax}`)
      this.hudTexts.xp.setColor('#f1f5f9')
    }

    // デジタルバーも合計値で更新
    this._updateDigitalBar('coins', p.coins + gainCoins, 10)
    this._updateDigitalBar('xp', Math.min(p.xpMax, p.xp + gainXp), p.xpMax)
  }

  getHudTargetPos(key) {
    const txt = this.hudTexts?.[key]
    if (!txt) return { x: 195, y: 60 }
    return {
      x: txt.x + txt.width / 2,
      y: txt.y + txt.height / 2,
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
  // Buttons
  // =============================================
  _buildButtons() {
    const y = GAME_HEIGHT - 40
    const skipX = GAME_WIDTH / 2 - 50

    const bg = this.add.rectangle(skipX, y, 140, 52, 0x1e3a5f)
      .setInteractive({ cursor: 'pointer' })
      .setOrigin(0.5)
      .setDepth(10)
    bg.on('pointerover', () => bg.setFillStyle(0x2d5282))
    bg.on('pointerout',  () => bg.setFillStyle(0x1e3a5f))
    bg.on('pointerdown', () => this.gameScene.skipTurn())

    this.add.text(skipX, y, 'スキップ', {
      fontSize: '18px',
      fontFamily: 'monospace',
      color: '#e2e8f0',
    }).setOrigin(0.5).setDepth(11)

    this.turnText = this.add.text(GAME_WIDTH - 20, y, 'TURN 1', {
      fontSize: '13px',
      fontFamily: 'monospace',
      color: '#475569',
    }).setOrigin(1, 0.5).setDepth(10)
  }
}
