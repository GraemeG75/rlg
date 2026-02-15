export type Point = { x: number; y: number };

export type Mode = 'overworld' | 'dungeon';

export type MapRef = { kind: 'overworld' } | { kind: 'dungeon'; dungeonId: string };

export type CharacterClass = 'warrior' | 'mage' | 'rogue';

export type EntityKind = 'player' | 'monster';

export type Equipment = {
  weaponItemId?: string;
  armorItemId?: string;
};

export type Entity = {
  id: string;
  kind: EntityKind;
  name: string;
  glyph: string;

  pos: Point;
  mapRef: MapRef;

  hp: number;
  maxHp: number;

  baseAttack: number;
  baseDefense: number;

  level: number;
  xp: number;
  gold: number;

  inventory: string[]; // item ids
  equipment: Equipment;

  classType?: CharacterClass;
  strength?: number;
  agility?: number;
  intellect?: number;
  statusEffects?: StatusEffect[];
};

export type GearRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type ItemKind = 'potion' | 'weapon' | 'armor';

export type Item = {
  id: string;
  kind: ItemKind;
  name: string;

  // If on ground:
  mapRef?: MapRef;
  pos?: Point;

  // Stats:
  healAmount?: number;
  attackBonus?: number;
  defenseBonus?: number;
  critChance?: number;
  dodgeChance?: number;
  lifesteal?: number;
  thorns?: number;

  // Economy:
  value: number; // buy/sell base price

  rarity?: GearRarity;
};

export type Shop = {
  id: string;
  townWorldPos: Point;
  stockItemIds: string[];
};

export type ShopEconomy = {
  moodLabel: string;
  specialty: 'all' | 'potion' | 'weapon' | 'armor';
  buyMultiplier: number;
  sellMultiplier: number;
  featuredItemId?: string;
  restockIn: number;
};

export type Action =
  | { kind: 'move'; dx: number; dy: number }
  | { kind: 'use' }
  | { kind: 'wait' }
  | { kind: 'pickup' }
  | { kind: 'toggleInventory' }
  | { kind: 'toggleShop' }
  | { kind: 'toggleQuest' }
  | { kind: 'toggleMap' }
  | { kind: 'cancelAuto' }
  | { kind: 'toggleRenderer' }
  | { kind: 'toggleFov' }
  | { kind: 'help' }
  | { kind: 'save' }
  | { kind: 'load' };

export type OverworldTile = 'water' | 'grass' | 'forest' | 'mountain' | 'dungeon' | 'town' | 'road';
export type DungeonTile = 'wall' | 'floor' | 'stairsUp' | 'stairsDown';

export type TileVisibility = 'unseen' | 'seen' | 'visible';

export type StatusEffectKind = 'poison';

export type StatusEffect = {
  kind: StatusEffectKind;
  remainingTurns: number;
  potency: number;
};

export type QuestKind = 'killMonsters' | 'slayMonster' | 'reachDepth';

export type Quest = {
  id: string;
  townId: string;
  kind: QuestKind;
  description: string;

  targetCount: number;
  currentCount: number;

  targetMonster?: string;
  targetDepth?: number;

  minDungeonDepth: number;

  rewardGold: number;
  rewardXp: number;
  rewardItemId?: string;
  rewardItemIds?: string[];
  completed: boolean;
  turnedIn: boolean;
};

export type Message = { text: string; t: number };
