import Phaser from 'phaser'

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' })
  }

  init(data) {
    this.gs = data.gs
    this.gameScene = data.gameScene
  }

  create() {
    this.add.rectangle(270, 360, 540, 720, 0x000000, 0.85)

    this.add.text(270, 260, '💀  GAME OVER', {
      fontSize: '32px', fontFamily: 'monospace', color: '#f87171',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5)

    this.add.text(270, 320, `生存ターン数: ${this.gs.turn}`, {
      fontSize: '18px', fontFamily: 'monospace', color: '#f1f5f9',
    }).setOrigin(0.5)

    this.add.text(270, 360, `最大コンボ: ${this.gs.lastCombo}`, {
      fontSize: '16px', fontFamily: 'monospace', color: '#fbbf24',
    }).setOrigin(0.5)

    // Retry button
    const btn = this.add.rectangle(270, 440, 200, 50, 0x1e3a5f)
      .setInteractive({ cursor: 'pointer' })
      .setStrokeStyle(1, 0x60a5fa)

    btn.on('pointerover', () => btn.setFillStyle(0x2d5282))
    btn.on('pointerout',  () => btn.setFillStyle(0x1e3a5f))
    btn.on('pointerdown', () => this._restart())

    this.add.text(270, 440, '▶  もう一度', {
      fontSize: '18px', fontFamily: 'monospace', color: '#e2e8f0',
    }).setOrigin(0.5)

    // Keyboard
    this.input.keyboard.once('keydown-ENTER', () => this._restart())
    this.input.keyboard.once('keydown-SPACE', () => this._restart())
  }

  _restart() {
    this.scene.stop('GameOverScene')
    this.scene.stop('UIScene')
    this.scene.stop('ShopScene')
    this.scene.resume('GameScene')
    this.scene.restart('GameScene')
  }
}
