export type Point = { x: number; y: number };

export enum Mode {
  Overworld = 'overworld',
  Dungeon = 'dungeon',
  Town = 'town',
  Dead = 'dead'
}

export type MapRef = { kind: Mode.Overworld } | { kind: Mode.Dungeon; dungeonId: string } | { kind: Mode.Town; townId: string };

export enum CharacterClass {
  Warrior = 'warrior',
  Mage = 'mage',
  Rogue = 'rogue'
}

export enum Gender {
  Female = 'female',
  Male = 'male',
  Nonbinary = 'nonbinary'
}

export enum EntityKind {
  Player = 'player',
  Monster = 'monster'
}

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
  gender?: Gender;
  strength?: number;
  agility?: number;
  intellect?: number;
  statusEffects?: StatusEffect[];
  specialCooldown?: number;
  isBoss?: boolean;
};

export type StoryEvent = {
  turn: number;
  title: string;
  detail: string;
};

export type CharacterStory = {
  origin: string;
  upbringing: string;
  turningPoint: string;
  ambitions: string;
  events: StoryEvent[];
};

export enum GearRarity {
  Common = 'common',
  Uncommon = 'uncommon',
  Rare = 'rare',
  Epic = 'epic',
  Legendary = 'legendary'
}

export enum ItemKind {
  Potion = 'potion',
  Weapon = 'weapon',
  Armor = 'armor'
}

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
  specialty: ShopSpecialty;
  buyMultiplier: number;
  sellMultiplier: number;
  featuredItemId?: string;
  restockIn: number;
};

export enum ShopSpecialty {
  All = 'all',
  Potion = 'potion',
  Weapon = 'weapon',
  Armor = 'armor'
}

export enum PanelMode {
  None = 'none',
  Inventory = 'inventory',
  Shop = 'shop',
  Quest = 'quest',
  Story = 'story'
}

export type Action =
  | { kind: ActionKind.Move; dx: number; dy: number }
  | { kind: ActionKind.Use }
  | { kind: ActionKind.Wait }
  | { kind: ActionKind.Pickup }
  | { kind: ActionKind.ToggleInventory }
  | { kind: ActionKind.ToggleShop }
  | { kind: ActionKind.ToggleQuest }
  | { kind: ActionKind.ToggleStory }
  | { kind: ActionKind.ToggleMap }
  | { kind: ActionKind.CancelAuto }
  | { kind: ActionKind.ToggleRenderer }
  | { kind: ActionKind.ToggleFov }
  | { kind: ActionKind.Help }
  | { kind: ActionKind.Save }
  | { kind: ActionKind.Load };

export enum ActionKind {
  Move = 'move',
  Use = 'use',
  Wait = 'wait',
  Pickup = 'pickup',
  ToggleInventory = 'toggleInventory',
  ToggleShop = 'toggleShop',
  ToggleQuest = 'toggleQuest',
  ToggleStory = 'toggleStory',
  ToggleMap = 'toggleMap',
  CancelAuto = 'cancelAuto',
  ToggleRenderer = 'toggleRenderer',
  ToggleFov = 'toggleFov',
  Help = 'help',
  Save = 'save',
  Load = 'load'
}

export enum OverworldTile {
  WaterDeep = 'water_deep',
  Water = 'water',
  Grass = 'grass',
  Forest = 'forest',
  Mountain = 'mountain',
  MountainSnow = 'mountain_snow',
  Cave = 'cave',
  Dungeon = 'dungeon',
  Town = 'town',
  TownShop = 'town_shop',
  TownTavern = 'town_tavern',
  TownSmith = 'town_smith',
  TownHouse = 'town_house',
  Road = 'road'
}

export enum TownTile {
  Wall = 'wall',
  Floor = 'floor',
  Road = 'road',
  Square = 'square',
  Gate = 'gate',
  Shop = 'shop',
  Tavern = 'tavern',
  Smith = 'smith',
  House = 'house'
}

export enum DungeonTile {
  Wall = 'wall',
  Floor = 'floor',
  BossFloor = 'bossFloor',
  StairsUp = 'stairsUp',
  StairsDown = 'stairsDown'
}

export enum TileVisibility {
  Unseen = 'unseen',
  Seen = 'seen',
  Visible = 'visible'
}

export enum StatusEffectKind {
  Poison = 'poison'
}

export type StatusEffect = {
  kind: StatusEffectKind;
  remainingTurns: number;
  potency: number;
};

export enum QuestKind {
  KillMonsters = 'killMonsters',
  SlayMonster = 'slayMonster',
  ReachDepth = 'reachDepth',
  SlayBoss = 'slayBoss'
}

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
