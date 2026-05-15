// Grid configuration
export const GRID_COLS = 7
export const GRID_ROWS = 7
export const CELL_SIZE = 64
export const CELL_GAP = 4
export const GRID_OFFSET_X = 26   // left margin
export const GRID_OFFSET_Y = 110  // top margin (below HUD)

// Colors
export const COLORS = {
  BG:           0x1a1a2e,
  GRID_BG:      0x16213e,
  CELL_EMPTY:   0x0f3460,
  CELL_HOVER:   0x1a4a7a,
  PATH_LINE:    0x4cc9f0,
  PATH_VALID:   0x4ade80,
  PATH_INVALID: 0xf87171,
  PATH_NODE:    0x93c5fd,
  DEST_OK:      0x22c55e,
  DEST_NG:      0xef4444,

  PLAYER:       0x60a5fa,
  GOBLIN:       0x4ade80,
  ARCHER:       0xfbbf24,
  POTION:       0xf472b6,
  COIN:         0xfde68a,
  XP:           0xa78bfa,

  HP_BAR_BG:    0x7f1d1d,
  HP_BAR_FG:    0xef4444,
  CT_TEXT:      0xfbbf24,

  HUD_BG:       0x0d1b2a,
  TEXT_PRIMARY: 0xf1f5f9,
  TEXT_MUTED:   0x94a3b8,
  TEXT_WARN:    0xfbbf24,
  TEXT_GOOD:    0x4ade80,
  TEXT_BAD:     0xf87171,

  COMBO_1:      0xfbbf24,
  COMBO_2:      0xf97316,
  COMBO_3:      0xef4444,
}

// Fonts
export const FONT = {
  PRIMARY: { fontFamily: 'monospace', color: '#f1f5f9' },
  MUTED:   { fontFamily: 'monospace', color: '#94a3b8' },
  WARN:    { fontFamily: 'monospace', color: '#fbbf24' },
  GOOD:    { fontFamily: 'monospace', color: '#4ade80' },
  BAD:     { fontFamily: 'monospace', color: '#f87171' },
}

// Game rules
export const INITIAL_PLAYER = {
  hp: 20,
  maxHp: 20,
  atk: 3,
  maxSteps: 7,
  coins: 0,
  xp: 0,
  xpMax: 5,
  level: 1,
}

export const SHOP_COST = 10

export const UPGRADES = [
  {
    id: 'atk',
    label: '⚔ ATK強化',
    desc: '攻撃力 +1',
    apply: (player) => { player.atk++ },
  },
  {
    id: 'steps',
    label: '👟 歩数強化',
    desc: '最大歩数 +1',
    apply: (player) => { player.maxSteps++ },
  },
  {
    id: 'drain',
    label: '🩸 ドレイン',
    desc: '敵撃破でHP+1',
    apply: (player) => { player.drain = true },
  },
  {
    id: 'bomb',
    label: '💣 ボム',
    desc: '移動終点の周囲8マスにATKダメージ',
    apply: (player) => { player.bomb = true },
  },
  {
    id: 'maxhp',
    label: '❤ MaxHP強化',
    desc: 'MaxHP +5 & HP回復',
    apply: (player) => { player.maxHp += 5; player.hp = Math.min(player.hp + 5, player.maxHp) },
  },
]

// Enemy definitions
export const ENEMY_DEFS = {
  goblin: {
    key: 'goblin',
    emoji: '👺',
    label: 'ゴブリン',
    hp: 10,
    atk: 2,
    ct: 3,
    xp: 3,
    coins: 1,
    skill: 'summon',
    skillDesc: '仲間召喚',
  },
  archer: {
    key: 'archer',
    emoji: '🏹',
    label: 'アーチャー',
    hp: 5,
    atk: 1,
    ct: null,
    xp: 4,
    coins: 1,
    skill: 'shoot',
    skillDesc: '直線射撃 -3HP',
  },
  rock: {
    key: 'rock',
    emoji: '🪨',
    label: '岩',
    hp: 10,
    atk: 0,
    ct: null,
    xp: 0,
    coins: 1,
    skill: 'none',
    skillDesc: '—',
  },
}

export const SPAWN_WEIGHTS = [
  { type: 'goblin', w: 35 },
  { type: 'archer', w: 20 },
  { type: 'rock',   w: 15 },
  { type: 'potion', w: 15 },
  { type: 'coin',   w: 15 },
]
