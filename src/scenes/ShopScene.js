import Phaser from 'phaser'
import { COLORS, UPGRADES } from '../utils/constants.js'

export class ShopScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ShopScene' })
  }

  init(data) {
    this.gs = data.gs
    this.gameScene = data.gameScene
  }

  create() {
    // Dim overlay
    this.add.rectangle(270, 360, 540, 720, 0x000000, 0.75)

    // Panel
    const panel = this.add.rectangle(270, 360, 440, 400, 0x0d1b2a)
      .setStrokeStyle(1, 0x334155)

    this.add.text(270, 190, '🛒  ショップ', {
      fontSize: '22px', fontFamily: 'monospace', color: '#f1f5f9',
    }).setOrigin(0.5)

    this.add.text(270, 222, 'アップグレードを1つ選んでください', {
      fontSize: '13px', fontFamily: 'monospace', color: '#94a3b8',
    }).setOrigin(0.5)

    // Pick 4 random upgrades
    const pool = [...UPGRADES].sort(() => Math.random() - 0.5).slice(0, 4)

    const positions = [
      { x: 160, y: 300 },
      { x: 380, y: 300 },
      { x: 160, y: 420 },
      { x: 380, y: 420 },
    ]

    pool.forEach((upg, i) => {
      const { x, y } = positions[i]
      this._buildCard(x, y, upg)
    })
  }

  _buildCard(x, y, upg) {
    const bg = this.add.rectangle(x, y, 180, 90, 0x1e3a5f)
      .setInteractive({ cursor: 'pointer' })
      .setStrokeStyle(1, 0x3b5998)

    bg.on('pointerover', () => {
      bg.setFillStyle(0x2d5282)
      bg.setStrokeStyle(2, 0x60a5fa)
    })
    bg.on('pointerout', () => {
      bg.setFillStyle(0x1e3a5f)
      bg.setStrokeStyle(1, 0x3b5998)
    })
    bg.on('pointerdown', () => {
      upg.apply(this.gs.player)
      this._close(`アップグレード: ${upg.label}`)
    })

    this.add.text(x, y - 18, upg.label, {
      fontSize: '16px', fontFamily: 'monospace', color: '#f1f5f9',
    }).setOrigin(0.5)

    this.add.text(x, y + 10, upg.desc, {
      fontSize: '12px', fontFamily: 'monospace', color: '#94a3b8',
    }).setOrigin(0.5)
  }

  _close(msg) {
    this.gameScene._floatText(msg, 'good')
    this.scene.stop()
    this.gameScene.resumeAfterShop()
  }
}
