export const SHOP_RESTOCK_INTERVAL: number = 80;
export const BOSS_MIN_DEPTH: number = 3;

export const LEVEL_XP_BASE: number = 25;
export const LEVEL_XP_PER_LEVEL: number = 12;

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
