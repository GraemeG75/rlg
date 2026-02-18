export enum Mode {
  Overworld = 'overworld',
  Dungeon = 'dungeon',
  Town = 'town',
  Dead = 'dead'
}

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

export enum QuestKind {
  KillMonsters = 'killMonsters',
  SlayMonster = 'slayMonster',
  ReachDepth = 'reachDepth',
  SlayBoss = 'slayBoss'
}

export enum DungeonTheme {
  Crypt = 'crypt',
  Caves = 'caves',
  Ruins = 'ruins'
}

export enum DungeonLayout {
  Rooms = 'rooms',
  Caves = 'caves'
}

export enum PixiRenderMode {
  Canvas = 'canvas',
  Isometric = 'isometric'
}
