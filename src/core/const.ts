export const SHOP_RESTOCK_INTERVAL: number = 80;
export const BOSS_MIN_DEPTH: number = 3;

export const LEVEL_XP_BRACKETS: { maxLevel: number; base: number; growthRate: number }[] = [
  { maxLevel: 10, base: 25, growthRate: 1.25 }, // Levels 1-10
  { maxLevel: 20, base: 25, growthRate: 1.33 }, // Levels 11-20
  { maxLevel: 30, base: 25, growthRate: 1.4 }, // Levels 21-30
  { maxLevel: 40, base: 25, growthRate: 1.45 }, // Levels 31-40
  { maxLevel: 50, base: 25, growthRate: 1.5 }, // Levels 41-50
  { maxLevel: 60, base: 25, growthRate: 1.55 }, // Levels 51-60
  { maxLevel: 70, base: 25, growthRate: 1.6 }, // Levels 61-70
  { maxLevel: 80, base: 25, growthRate: 1.65 }, // Levels 71-80
  { maxLevel: 90, base: 25, growthRate: 1.7 }, // Levels 81-90
  { maxLevel: 100, base: 25, growthRate: 1.75 }, // Levels 91-100
  { maxLevel: 110, base: 25, growthRate: 1.8 }, // Levels 101-110
  { maxLevel: 120, base: 25, growthRate: 1.85 }, // Levels 111-120
  { maxLevel: Infinity, base: 25, growthRate: 1.9 } // Levels 121+
];

export const AMBUSH_CHANCE: Record<string, number> = {
  forest: 6,
  grass: 3,
  road: 1,
  cave: 0,
  dungeon: 0,
  default: 2
};

export const MONSTER_SPAWN = {
  baseCount: 7,
  depthCap: 14,
  depthMultiplier: 2,
  ambushMin: 3,
  ambushMax: 7,
  ambushBase: 3,
  ambushLevelDiv: 2
};

export const MONSTER_SCALING = {
  // Monster level calculation
  levelPlayerWeight: 0.7, // Weight towards player level (vs dungeon depth)
  levelMinimum: 1,

  // HP scaling per monster type
  hp: {
    slime: { base: 8, perLevel: 3 },
    goblin: { base: 12, perLevel: 4 },
    wraith: { base: 15, perLevel: 5 },
    orc: { base: 20, perLevel: 6 }
  },

  // Attack scaling per monster type
  attack: {
    slime: { base: 2, perLevel: 0.6 },
    goblin: { base: 3, perLevel: 0.8 },
    wraith: { base: 4, perLevel: 1.0 },
    orc: { base: 5, perLevel: 1.2 }
  },

  // Defense scaling per monster type
  defense: {
    slime: { base: 0, perLevel: 0.2 },
    goblin: { base: 1, perLevel: 0.3 },
    wraith: { base: 2, perLevel: 0.4 },
    orc: { base: 3, perLevel: 0.5 }
  }
};

export const COMBAT = {
  hit: {
    playerBase: 70,
    playerAgiMult: 3,
    playerLevelDiv: 2,
    playerMin: 25,
    playerMax: 95,
    monsterBase: 60,
    monsterLevelMult: 3,
    monsterMin: 25,
    monsterMax: 90
  },
  dodgeCap: 50,
  crit: {
    rogueBase: 10,
    rogueAgiMult: 4,
    rogueCap: 60,
    totalCap: 75,
    damageMult: 2
  },
  damage: {
    rollMaxExclusive: 6,
    playerDefMultiplier: 0.9,
    mageDefMultiplier: 0.5,
    monsterDamageMultiplier: 1.15
  },
  lifestealCap: 50,
  thornsCap: 20,
  wraithDefMultiplier: 0.3,
  wraithHealRatio: 0.6
};

export const OVERWORLD_HEIGHT = {
  mountainSnowMultiplier: 2
};

export const RENDER_TILE_SIZE: number = 16;
export const RENDER_RESOLUTION: number = 1;
