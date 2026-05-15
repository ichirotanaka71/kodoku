import Phaser from 'phaser'
import { GameScene } from './scenes/GameScene.js'
import { UIScene } from './scenes/UIScene.js'
import { ShopScene } from './scenes/ShopScene.js'
import { GameOverScene } from './scenes/GameOverScene.js'

const config = {
  type: Phaser.AUTO,
  width: 390,
  height: 844,
  backgroundColor: '#1a1a2e',
  parent: 'game-container',
  scene: [GameScene, UIScene, ShopScene, GameOverScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    pixelArt: false,
  },
}

new Phaser.Game(config)
