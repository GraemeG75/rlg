import {
  ActionKind,
  CharacterClass,
  DungeonTile,
  EntityKind,
  GearRarity,
  Gender,
  ItemKind,
  Mode,
  OverworldTile,
  PanelMode,
  QuestKind,
  ShopSpecialty,
  StatusEffectKind,
  TownTile,
  type Action,
  type CharacterStory,
  type Entity,
  type Item,
  type Point,
  type Shop,
  type ShopEconomy
} from './core/types';
import { Rng } from './core/rng';
import { add, manhattan } from './core/util';
import {
  Overworld,
  caveBaseIdFromWorldPos,
  caveSeedFromWorldPos,
  dungeonBaseIdFromWorldPos,
  dungeonLevelId,
  dungeonSeedFromWorldPos,
  townIdFromWorldPos,
  townSeedFromWorldPos
} from './maps/overworld';
import type { Dungeon } from './maps/dungeon';
import { DungeonGenerator, DungeonLayout, DungeonTheme, generateAmbushArena, getDungeonTile, randomFloorPoint } from './maps/dungeon';
import type { Town } from './maps/town';
import { generateTown, getTownTile } from './maps/town';
import { FieldOfView } from './systems/fov';
import { canEnterDungeonTile, canEnterOverworldTile, canEnterTownTile, isBlockedByEntity } from './systems/rules';
import { MonsterAI } from './systems/ai';
import { OverworldNavigator } from './systems/navigation';
import { PixiRenderer, PixiRenderMode } from './render/pixi';
import { MessageLog } from './ui/log';
import { loadFromBase62String, loadFromLocalStorage, saveToLocalStorage, serializeSaveDataBase62, type SaveDataV3 } from './core/save';
import { renderPanelHtml } from './ui/panel';
import { hash2D } from './core/hash';
import { t } from './i18n';

type RendererMode = PixiRenderMode;

type DungeonStackFrame = {
  baseId: string;
  depth: number;
  entranceWorldPos: Point;
  layout: DungeonLayout;
  isAmbush?: boolean;
};

type GameState = {
  worldSeed: number;
  rng: Rng;

  mode: Mode;

  overworld: Overworld;

  dungeons: Map<string, Dungeon>;
  dungeonStack: DungeonStackFrame[];
  towns: Map<string, Town>;
  currentTownId?: string;
  townReturnPos?: Point;

  player: Entity;
  playerClass: CharacterClass;
  story: CharacterStory;
  entities: Entity[];
  items: Item[];

  shops: Map<string, Shop>;

  rendererMode: RendererMode;
  useFov: boolean;

  activePanel: PanelMode;
  shopCategory: ShopSpecialty;

  turnCounter: number;
  quests: import('./core/types').Quest[];

  // Navigation helpers
  mapOpen: boolean;
  mapCursor: Point;
  destination?: Point;
  autoPath?: Point[];

  log: MessageLog;
  preferRoads: boolean;
};

type ClassConfig = {
  name: string;
  description: string;
  maxHp: number;
  baseAttack: number;
  baseDefense: number;
  strength: number;
  agility: number;
  intellect: number;
};

type GearSpec = {
  name: string;
  attackBonus?: number;
  defenseBonus?: number;
  value: number;
  upgradeName: string;
};

type ClassGearConfig = {
  weapon: GearSpec & { attackBonus: number };
  armor: GearSpec & { defenseBonus: number };
};

type WeaponTemplate = {
  noun: string;
  baseAttack: number;
  scale: number;
};

type ArmorTemplate = {
  noun: string;
  baseDefense: number;
  scale: number;
};

type MonsterKey = 'slime' | 'goblin' | 'orc' | 'wraith';

const CLASS_CONFIG: Record<CharacterClass, ClassConfig> = {
  warrior: {
    name: t('class.warrior.name'),
    description: t('class.warrior.desc'),
    maxHp: 28,
    baseAttack: 4,
    baseDefense: 2,
    strength: 6,
    agility: 3,
    intellect: 2
  },
  rogue: {
    name: t('class.rogue.name'),
    description: t('class.rogue.desc'),
    maxHp: 22,
    baseAttack: 3,
    baseDefense: 1,
    strength: 3,
    agility: 6,
    intellect: 3
  },
  mage: {
    name: t('class.mage.name'),
    description: t('class.mage.desc'),
    maxHp: 18,
    baseAttack: 2,
    baseDefense: 0,
    strength: 2,
    agility: 3,
    intellect: 7
  }
};

const CLASS_GEAR: Record<CharacterClass, ClassGearConfig> = {
  warrior: {
    weapon: { name: t('gear.warrior.weapon'), attackBonus: 3, value: 32, upgradeName: t('gear.warrior.weapon.upgrade') },
    armor: { name: t('gear.warrior.armor'), defenseBonus: 2, value: 30, upgradeName: t('gear.warrior.armor.upgrade') }
  },
  rogue: {
    weapon: { name: t('gear.rogue.weapon'), attackBonus: 2, value: 28, upgradeName: t('gear.rogue.weapon.upgrade') },
    armor: { name: t('gear.rogue.armor'), defenseBonus: 1, value: 26, upgradeName: t('gear.rogue.armor.upgrade') }
  },
  mage: {
    weapon: { name: t('gear.mage.weapon'), attackBonus: 3, value: 30, upgradeName: t('gear.mage.weapon.upgrade') },
    armor: { name: t('gear.mage.armor'), defenseBonus: 1, value: 24, upgradeName: t('gear.mage.armor.upgrade') }
  }
};

type GearAffix = {
  name: string;
  attackBonus?: number;
  defenseBonus?: number;
  critChance?: number;
  dodgeChance?: number;
  lifesteal?: number;
  thorns?: number;
};

const WEAPON_PREFIXES: readonly GearAffix[] = [
  { name: t('weapon.prefix.sunforged'), attackBonus: 1 },
  { name: t('weapon.prefix.stormcall'), critChance: 3, attackBonus: 1 },
  { name: t('weapon.prefix.glimmering'), critChance: 4 },
  { name: t('weapon.prefix.nightfall'), critChance: 2 },
  { name: t('weapon.prefix.emberforged'), attackBonus: 1 },
  { name: t('weapon.prefix.voidbound'), lifesteal: 3 },
  { name: t('weapon.prefix.ironchant'), attackBonus: 1, critChance: 2 },
  { name: t('weapon.prefix.frostvein'), critChance: 3 }
] as const;

const WEAPON_SUFFIXES: readonly GearAffix[] = [
  { name: t('weapon.suffix.fox'), critChance: 5 },
  { name: t('weapon.suffix.embers'), attackBonus: 1 },
  { name: t('weapon.suffix.depths'), lifesteal: 5 },
  { name: t('weapon.suffix.dawn'), critChance: 3 },
  { name: t('weapon.suffix.ruin'), attackBonus: 2 },
  { name: t('weapon.suffix.tempest'), critChance: 4, attackBonus: 1 },
  { name: t('weapon.suffix.echoes'), lifesteal: 4 }
] as const;

const WEAPON_BASES: readonly WeaponTemplate[] = [
  { noun: t('weapon.base.blade'), baseAttack: 2, scale: 2 },
  { noun: t('weapon.base.halberd'), baseAttack: 3, scale: 3 },
  { noun: t('weapon.base.longspear'), baseAttack: 3, scale: 2 },
  { noun: t('weapon.base.warhammer'), baseAttack: 4, scale: 4 },
  { noun: t('weapon.base.scimitar'), baseAttack: 2, scale: 1 },
  { noun: t('weapon.base.greatsword'), baseAttack: 4, scale: 3 },
  { noun: t('weapon.base.quarterstaff'), baseAttack: 2, scale: 2 }
] as const;

const ARMOR_PREFIXES: readonly GearAffix[] = [
  { name: t('armor.prefix.runeward'), defenseBonus: 1 },
  { name: t('armor.prefix.starwoven'), dodgeChance: 3 },
  { name: t('armor.prefix.stoneplate'), defenseBonus: 2 },
  { name: t('armor.prefix.whispersteel'), dodgeChance: 4 },
  { name: t('armor.prefix.moonlit'), dodgeChance: 6 },
  { name: t('armor.prefix.ashen'), thorns: 2 },
  { name: t('armor.prefix.verdant'), thorns: 3 }
] as const;

const ARMOR_SUFFIXES: readonly GearAffix[] = [
  { name: t('armor.suffix.resilience'), defenseBonus: 1 },
  { name: t('armor.suffix.mirage'), dodgeChance: 6 },
  { name: t('armor.suffix.glacier'), defenseBonus: 1 },
  { name: t('armor.suffix.sparks'), thorns: 2 },
  { name: t('armor.suffix.sentinel'), defenseBonus: 2 },
  { name: t('armor.suffix.cinders'), thorns: 3 }
] as const;

const ARMOR_BASES: readonly ArmorTemplate[] = [
  { noun: t('armor.base.vestments'), baseDefense: 1, scale: 3 },
  { noun: t('armor.base.scaleMail'), baseDefense: 2, scale: 2 },
  { noun: t('armor.base.battlemantle'), baseDefense: 2, scale: 3 },
  { noun: t('armor.base.coat'), baseDefense: 1, scale: 2 },
  { noun: t('armor.base.carapace'), baseDefense: 3, scale: 4 },
  { noun: t('armor.base.guardplate'), baseDefense: 3, scale: 3 }
] as const;

type RarityConfig = {
  key: GearRarity;
  label: string;
  namePrefix: string;
  attackBonus: number;
  defenseBonus: number;
  weaponCritChance: number;
  weaponLifesteal: number;
  armorDodgeChance: number;
  armorThorns: number;
  valueMultiplier: number;
  baseWeight: number;
  depthWeight: number;
};

const RARITY_CONFIGS: readonly RarityConfig[] = [
  {
    key: GearRarity.Common,
    label: t('rarity.common.label'),
    namePrefix: '',
    attackBonus: 0,
    defenseBonus: 0,
    weaponCritChance: 0,
    weaponLifesteal: 0,
    armorDodgeChance: 0,
    armorThorns: 0,
    valueMultiplier: 1,
    baseWeight: 80,
    depthWeight: 0
  },
  {
    key: GearRarity.Uncommon,
    label: t('rarity.uncommon.label'),
    namePrefix: t('rarity.uncommon.prefix'),
    attackBonus: 1,
    defenseBonus: 1,
    weaponCritChance: 2,
    weaponLifesteal: 1,
    armorDodgeChance: 2,
    armorThorns: 1,
    valueMultiplier: 1.25,
    baseWeight: 42,
    depthWeight: 3
  },
  {
    key: GearRarity.Rare,
    label: t('rarity.rare.label'),
    namePrefix: t('rarity.rare.prefix'),
    attackBonus: 2,
    defenseBonus: 2,
    weaponCritChance: 4,
    weaponLifesteal: 2,
    armorDodgeChance: 4,
    armorThorns: 2,
    valueMultiplier: 1.65,
    baseWeight: 18,
    depthWeight: 4
  },
  {
    key: GearRarity.Epic,
    label: t('rarity.epic.label'),
    namePrefix: t('rarity.epic.prefix'),
    attackBonus: 3,
    defenseBonus: 3,
    weaponCritChance: 6,
    weaponLifesteal: 3,
    armorDodgeChance: 6,
    armorThorns: 3,
    valueMultiplier: 2.25,
    baseWeight: 6,
    depthWeight: 3
  },
  {
    key: GearRarity.Legendary,
    label: t('rarity.legendary.label'),
    namePrefix: t('rarity.legendary.prefix'),
    attackBonus: 4,
    defenseBonus: 4,
    weaponCritChance: 9,
    weaponLifesteal: 5,
    armorDodgeChance: 9,
    armorThorns: 4,
    valueMultiplier: 3.1,
    baseWeight: 2,
    depthWeight: 2
  }
] as const;

const RARITY_CONFIG_BY_KEY: Record<GearRarity, RarityConfig> = RARITY_CONFIGS.reduce(
  (acc: Record<GearRarity, RarityConfig>, cfg: RarityConfig) => {
    acc[cfg.key] = cfg;
    return acc;
  },
  {} as Record<GearRarity, RarityConfig>
);

const SHOP_RESTOCK_INTERVAL: number = 80;

/**
 * Computes the shop economy for the current restock cycle.
 * @param s The game state.
 * @param shop The shop instance.
 * @returns The shop economy.
 */
function getShopEconomy(s: GameState, shop: Shop): ShopEconomy {
  const cycle: number = Math.floor(s.turnCounter / SHOP_RESTOCK_INTERVAL);
  const seed: number = hash2D(s.worldSeed, shop.townWorldPos.x, shop.townWorldPos.y) ^ (cycle * 0x9e3779b9) ^ 0x5f10;
  const rng: Rng = new Rng(seed);

  const moodRoll: number = rng.nextInt(0, 100);
  let moodLabel: string = t('shop.mood.steady');
  let buyMultiplier: number = 1.0;
  let sellMultiplier: number = 0.5;

  if (moodRoll < 22) {
    moodLabel = t('shop.mood.booming');
    buyMultiplier = 0.9;
    sellMultiplier = 0.55;
  } else if (moodRoll < 45) {
    moodLabel = t('shop.mood.tight');
    buyMultiplier = 1.15;
    sellMultiplier = 0.45;
  }

  let specialty: ShopSpecialty = ShopSpecialty.All;
  const specialtyRoll: number = rng.nextInt(0, 100);
  if (specialtyRoll >= 40) {
    const roll: number = rng.nextInt(0, 3);
    specialty = roll === 0 ? ShopSpecialty.Potion : roll === 1 ? ShopSpecialty.Weapon : ShopSpecialty.Armor;
  }

  const featuredItemId: string | undefined = getFeaturedShopItemId(shop, rng);
  const restockIn: number = SHOP_RESTOCK_INTERVAL - (s.turnCounter % SHOP_RESTOCK_INTERVAL);

  return { moodLabel, specialty, buyMultiplier, sellMultiplier, featuredItemId, restockIn };
}

/**
 * Picks a featured item id from shop stock.
 * @param shop The shop instance.
 * @param rng The RNG.
 * @returns The featured item id, or undefined.
 */
function getFeaturedShopItemId(shop: Shop, rng: Rng): string | undefined {
  if (shop.stockItemIds.length === 0) {
    return undefined;
  }
  const roll: number = rng.nextInt(0, 100);
  if (roll < 65) {
    return undefined;
  }

  const ids: string[] = [...shop.stockItemIds].sort();
  const idx: number = rng.nextInt(0, ids.length);
  return ids[idx];
}

function specialtyMatchesItem(specialty: ShopSpecialty, kind: ItemKind): boolean {
  switch (specialty) {
    case ShopSpecialty.All:
      return true;
    case ShopSpecialty.Potion:
      return kind === ItemKind.Potion;
    case ShopSpecialty.Weapon:
      return kind === ItemKind.Weapon;
    case ShopSpecialty.Armor:
      return kind === ItemKind.Armor;
    default:
      return false;
  }
}

/**
 * Returns the price multiplier for an item's rarity.
 * @param item The item.
 * @returns The price multiplier.
 */
function getRarityPriceMultiplier(item: Item): number {
  const rarity: GearRarity = item.rarity ?? GearRarity.Common;
  switch (rarity) {
    case GearRarity.Uncommon:
      return 1.03;
    case GearRarity.Rare:
      return 1.06;
    case GearRarity.Epic:
      return 1.1;
    case GearRarity.Legendary:
      return 1.15;
    case GearRarity.Common:
    default:
      return 1;
  }
}

/**
 * Computes the shop buy price for an item.
 * @param shop The shop instance.
 * @param item The item.
 * @param economy The shop economy.
 * @returns The buy price.
 */
function getShopBuyPrice(shop: Shop, item: Item, economy: ShopEconomy): number {
  let multiplier: number = economy.buyMultiplier;
  if (economy.specialty !== ShopSpecialty.All) {
    multiplier += specialtyMatchesItem(economy.specialty, item.kind) ? -0.08 : 0.04;
  }
  if (economy.featuredItemId && economy.featuredItemId === item.id) {
    multiplier *= 0.8;
  }
  multiplier *= getRarityPriceMultiplier(item);
  return Math.max(1, Math.round(item.value * multiplier));
}

/**
 * Computes the shop sell price for an item.
 * @param shop The shop instance.
 * @param item The item.
 * @param economy The shop economy.
 * @returns The sell price.
 */
function getShopSellPrice(shop: Shop, item: Item, economy: ShopEconomy): number {
  let multiplier: number = economy.sellMultiplier;
  if (economy.specialty !== ShopSpecialty.All) {
    multiplier += specialtyMatchesItem(economy.specialty, item.kind) ? 0.03 : -0.02;
  }
  multiplier *= getRarityPriceMultiplier(item);
  return Math.max(1, Math.round(item.value * multiplier));
}

/**
 * Builds shop pricing tables for the current state.
 * @param s The game state.
 * @param shop The shop instance.
 * @returns The pricing data.
 */
function buildShopPricing(s: GameState, shop: Shop): { economy: ShopEconomy; buyPrices: Record<string, number>; sellPrices: Record<string, number> } {
  const economy: ShopEconomy = getShopEconomy(s, shop);
  const buyPrices: Record<string, number> = {};
  const sellPrices: Record<string, number> = {};

  for (const id of shop.stockItemIds) {
    const it: Item | undefined = s.items.find((x) => x.id === id);
    if (!it) {
      continue;
    }
    buyPrices[id] = getShopBuyPrice(shop, it, economy);
  }

  for (const iid of s.player.inventory) {
    const it: Item | undefined = s.items.find((x) => x.id === iid);
    if (!it) {
      continue;
    }
    sellPrices[iid] = getShopSellPrice(shop, it, economy);
  }

  return { economy, buyPrices, sellPrices };
}

/**
 * Ensures class attributes are initialized on the player.
 * @param player The player entity.
 * @param classType The player class.
 */
function ensureClassAttributes(player: Entity, classType: CharacterClass): void {
  const cfg: ClassConfig = CLASS_CONFIG[classType];
  player.classType = classType;
  if (player.statusEffects === undefined) {
    player.statusEffects = [];
  }
  if (player.strength === undefined) {
    player.strength = cfg.strength;
  }
  if (player.agility === undefined) {
    player.agility = cfg.agility;
  }
  if (player.intellect === undefined) {
    player.intellect = cfg.intellect;
  }
}

/**
 * Picks a random element from a readonly array.
 * @param arr The array to pick from.
 * @param rng The RNG.
 * @returns The selected element.
 */
function randChoice<T>(arr: readonly T[], rng: Rng): T {
  return arr[rng.nextInt(0, arr.length)];
}

/**
 * Returns the localized monster name for a key.
 * @param key The monster key.
 * @returns The monster name.
 */
function monsterName(key: MonsterKey): string {
  return t(`monster.${key}`);
}

/**
 * Returns the localized plural monster name for a key.
 * @param key The monster key.
 * @returns The plural name.
 */
function monsterPlural(key: MonsterKey): string {
  return t(`monster.${key}.plural`);
}

type Pronouns = {
  subject: string;
  object: string;
  possessive: string;
  reflexive: string;
};

/**
 * Returns localized pronouns for a gender.
 * @param gender The gender.
 * @returns The pronouns object.
 */
function pronounsFor(gender: Gender): Pronouns {
  return {
    subject: t(`pronoun.subject.${gender}`),
    object: t(`pronoun.object.${gender}`),
    possessive: t(`pronoun.possessive.${gender}`),
    reflexive: t(`pronoun.reflexive.${gender}`)
  };
}

const STORY_ORIGINS: readonly string[] = ['story.origin.1', 'story.origin.2', 'story.origin.3', 'story.origin.4'];
const STORY_UPBRINGING: readonly string[] = ['story.upbringing.1', 'story.upbringing.2', 'story.upbringing.3', 'story.upbringing.4'];
const STORY_TURNING_POINTS: readonly string[] = ['story.turningPoint.1', 'story.turningPoint.2', 'story.turningPoint.3'];
const STORY_AMBITIONS: readonly string[] = ['story.ambitions.1', 'story.ambitions.2', 'story.ambitions.3'];

/**
 * Builds a character backstory.
 * @param rng The RNG.
 * @param classType The player class.
 * @param gender The player gender.
 * @returns The generated story.
 */
function buildStory(rng: Rng, classType: CharacterClass, gender: Gender): CharacterStory {
  const pronouns = pronounsFor(gender);
  const className: string = t(`class.${classType}.name`);
  const vars = {
    className,
    gender: t(`gender.${gender}`),
    subject: pronouns.subject,
    object: pronouns.object,
    possessive: pronouns.possessive,
    reflexive: pronouns.reflexive
  };

  const origin: string = t(randChoice(STORY_ORIGINS, rng), vars);
  const upbringing: string = t(randChoice(STORY_UPBRINGING, rng), vars);
  const turningPoint: string = t(randChoice(STORY_TURNING_POINTS, rng), vars);
  const ambitions: string = t(randChoice(STORY_AMBITIONS, rng), vars);

  return {
    origin,
    upbringing,
    turningPoint,
    ambitions,
    events: []
  };
}

/**
 * Adds a story event to the current story log.
 * @param state The game state.
 * @param titleKey The i18n title key.
 * @param detailKey The i18n detail key.
 * @param vars Optional template variables.
 */
function addStoryEvent(state: GameState, titleKey: string, detailKey: string, vars: Record<string, string | number> = {}): void {
  state.story.events.push({
    turn: state.turnCounter,
    title: t(titleKey, vars),
    detail: t(detailKey, vars)
  });
}

/**
 * Builds an item name from optional prefix and suffix parts.
 * @param prefix The name prefix.
 * @param base The base name.
 * @param suffix The name suffix.
 * @returns The combined item name.
 */
function buildItemName(prefix: string | undefined, base: string, suffix: string | undefined): string {
  const parts: string[] = [];
  if (prefix) {
    parts.push(prefix);
  }
  parts.push(base);
  if (suffix) {
    parts.push(suffix);
  }
  return parts.join(' ');
}

/**
 * Rolls a rarity configuration based on power.
 * @param power The item power.
 * @param rng The RNG.
 * @returns The rarity configuration.
 */
function rollRarity(power: number, rng: Rng): RarityConfig {
  const depthFactor: number = Math.max(0, power - 1);
  const weights: number[] = [];
  let total: number = 0;
  for (const cfg of RARITY_CONFIGS) {
    const weight: number = Math.max(1, Math.floor(cfg.baseWeight + cfg.depthWeight * depthFactor));
    weights.push(weight);
    total += weight;
  }

  let roll: number = rng.nextInt(0, total);
  for (let i: number = 0; i < RARITY_CONFIGS.length; i++) {
    roll -= weights[i];
    if (roll < 0) {
      return RARITY_CONFIGS[i];
    }
  }

  return RARITY_CONFIGS[RARITY_CONFIGS.length - 1];
}

/**
 * Generates a weapon item for loot.
 * @param id The item id.
 * @param power The item power.
 * @param rng The RNG.
 * @returns The weapon item.
 */
function generateWeaponLoot(id: string, power: number, rng: Rng): Item {
  const rarity: RarityConfig = rollRarity(Math.max(1, power), rng);
  const base: WeaponTemplate = randChoice(WEAPON_BASES, rng);
  const prefix: GearAffix | undefined = rng.nextInt(0, 100) < 65 ? randChoice(WEAPON_PREFIXES, rng) : undefined;
  const suffix: GearAffix | undefined = rng.nextInt(0, 100) < 55 ? randChoice(WEAPON_SUFFIXES, rng) : undefined;
  const scaling: number = Math.max(1, Math.floor(Math.max(1, power) / base.scale));
  const variance: number = rng.nextInt(0, 2);
  const affixAttack: number = (prefix?.attackBonus ?? 0) + (suffix?.attackBonus ?? 0);
  const attackBonus: number = Math.max(1, base.baseAttack + scaling + variance + rarity.attackBonus + affixAttack);
  const critChance: number = (prefix?.critChance ?? 0) + (suffix?.critChance ?? 0) + rarity.weaponCritChance;
  const lifesteal: number = (prefix?.lifesteal ?? 0) + (suffix?.lifesteal ?? 0) + rarity.weaponLifesteal;
  const value: number = Math.max(1, Math.round((16 + attackBonus * 9) * rarity.valueMultiplier));
  const nameBase: string = buildItemName(prefix?.name, base.noun, suffix?.name);
  const name: string = `${rarity.namePrefix ? `${rarity.namePrefix} ` : ''}${nameBase}`.trim();
  return { id, kind: ItemKind.Weapon, name, attackBonus, value, rarity: rarity.key, critChance, lifesteal };
}

/**
 * Generates an armor item for loot.
 * @param id The item id.
 * @param power The item power.
 * @param rng The RNG.
 * @returns The armor item.
 */
function generateArmorLoot(id: string, power: number, rng: Rng): Item {
  const rarity: RarityConfig = rollRarity(Math.max(1, power), rng);
  const base: ArmorTemplate = randChoice(ARMOR_BASES, rng);
  const prefix: GearAffix | undefined = rng.nextInt(0, 100) < 60 ? randChoice(ARMOR_PREFIXES, rng) : undefined;
  const suffix: GearAffix | undefined = rng.nextInt(0, 100) < 45 ? randChoice(ARMOR_SUFFIXES, rng) : undefined;
  const scaling: number = Math.max(1, Math.floor(Math.max(1, power) / base.scale));
  const variance: number = rng.nextInt(0, 2) === 0 ? 0 : 1;
  const affixDefense: number = (prefix?.defenseBonus ?? 0) + (suffix?.defenseBonus ?? 0);
  const defenseBonus: number = Math.max(1, base.baseDefense + scaling + variance + rarity.defenseBonus + affixDefense);
  const dodgeChance: number = (prefix?.dodgeChance ?? 0) + (suffix?.dodgeChance ?? 0) + rarity.armorDodgeChance;
  const thorns: number = (prefix?.thorns ?? 0) + (suffix?.thorns ?? 0) + rarity.armorThorns;
  const value: number = Math.max(1, Math.round((14 + defenseBonus * 8) * rarity.valueMultiplier));
  const nameBase: string = buildItemName(prefix?.name, base.noun, suffix?.name);
  const name: string = `${rarity.namePrefix ? `${rarity.namePrefix} ` : ''}${nameBase}`.trim();
  return { id, kind: ItemKind.Armor, name, defenseBonus, value, rarity: rarity.key, dodgeChance, thorns };
}

/**
 * Creates a gear item with fixed stats.
 * @param id The item id.
 * @param slot The gear slot.
 * @param spec The gear spec.
 * @param attackBonus Optional attack bonus.
 * @param defenseBonus Optional defense bonus.
 * @param value The item value.
 * @returns The gear item.
 */
function createGearItem(
  id: string,
  slot: ItemKind.Weapon | ItemKind.Armor,
  spec: GearSpec,
  attackBonus: number | undefined,
  defenseBonus: number | undefined,
  value: number
): Item {
  if (slot === ItemKind.Weapon) {
    return { id, kind: ItemKind.Weapon, name: spec.name, attackBonus: attackBonus ?? spec.attackBonus ?? 0, value, rarity: GearRarity.Common };
  }
  return { id, kind: ItemKind.Armor, name: spec.name, defenseBonus: defenseBonus ?? spec.defenseBonus ?? 0, value, rarity: GearRarity.Common };
}

/**
 * Ensures the player has their starting gear.
 * @param state The game state.
 * @param classType The player class.
 */
function ensureStartingGear(state: GameState, classType: CharacterClass): void {
  const gear: ClassGearConfig | undefined = CLASS_GEAR[classType];
  if (!gear) {
    return;
  }

  const messages: string[] = [];

  const weaponId: string = `starter_${classType}_weapon_${state.worldSeed}`;
  const armorId: string = `starter_${classType}_armor_${state.worldSeed}`;

  const hasWeaponItem: boolean = state.items.some((it) => it.id === weaponId);
  const hasArmorItem: boolean = state.items.some((it) => it.id === armorId);

  if (!state.player.equipment.weaponItemId || !hasWeaponItem) {
    const weapon: Item = hasWeaponItem
      ? (state.items.find((it) => it.id === weaponId) as Item)
      : createGearItem(weaponId, ItemKind.Weapon, gear.weapon, gear.weapon.attackBonus, undefined, gear.weapon.value);

    if (!hasWeaponItem) {
      state.items.push(weapon);
    }
    if (!state.player.inventory.includes(weapon.id)) {
      state.player.inventory.push(weapon.id);
    }
    state.player.equipment.weaponItemId = weapon.id;
    messages.push(gear.weapon.name);
  }

  if (!state.player.equipment.armorItemId || !hasArmorItem) {
    const armor: Item = hasArmorItem
      ? (state.items.find((it) => it.id === armorId) as Item)
      : createGearItem(armorId, ItemKind.Armor, gear.armor, undefined, gear.armor.defenseBonus, gear.armor.value);

    if (!hasArmorItem) {
      state.items.push(armor);
    }
    if (!state.player.inventory.includes(armor.id)) {
      state.player.inventory.push(armor.id);
    }
    state.player.equipment.armorItemId = armor.id;
    messages.push(gear.armor.name);
  }

  if (messages.length > 0) {
    state.log.push(t('item.starting.gear', { items: messages.join(' & ') }));
  }
}

/**
 * Creates a class-specific upgrade item.
 * @param classType The player class.
 * @param slot The gear slot.
 * @param id The item id.
 * @param upgradeLevel The upgrade level.
 * @param rng The RNG.
 * @returns The upgrade item.
 */
function createClassUpgradeItem(classType: CharacterClass, slot: ItemKind.Weapon | ItemKind.Armor, id: string, upgradeLevel: number, rng: Rng): Item {
  const gear: ClassGearConfig = CLASS_GEAR[classType];
  const spec: GearSpec = slot === ItemKind.Weapon ? gear.weapon : gear.armor;
  const level: number = Math.max(1, upgradeLevel);
  const rarity: RarityConfig = rollRarity(level, rng);

  if (slot === ItemKind.Weapon) {
    const baseAttack: number = spec.attackBonus ?? 0;
    const attackBonus: number = baseAttack + level + rarity.attackBonus;
    const nameBase: string = `${spec.upgradeName} +${attackBonus - baseAttack}`;
    const name: string = rarity.namePrefix ? `${rarity.namePrefix} ${nameBase}` : nameBase;
    const baseValue: number = spec.value + level * 18;
    const value: number = Math.max(1, Math.round(baseValue * rarity.valueMultiplier));
    const critChance: number = rarity.weaponCritChance;
    const lifesteal: number = rarity.weaponLifesteal;
    return { id, kind: ItemKind.Weapon, name, attackBonus, value, rarity: rarity.key, critChance, lifesteal };
  }

  const baseDefense: number = spec.defenseBonus ?? 0;
  const defenseGain: number = Math.max(1, Math.floor(level / 2));
  const defenseBonus: number = baseDefense + defenseGain + rarity.defenseBonus;
  const nameBase: string = `${spec.upgradeName} +${defenseBonus - baseDefense}`;
  const name: string = rarity.namePrefix ? `${rarity.namePrefix} ${nameBase}` : nameBase;
  const baseValue: number = spec.value + level * 16;
  const value: number = Math.max(1, Math.round(baseValue * rarity.valueMultiplier));
  const dodgeChance: number = rarity.armorDodgeChance;
  const thorns: number = rarity.armorThorns;
  return { id, kind: ItemKind.Armor, name, defenseBonus, value, rarity: rarity.key, dodgeChance, thorns };
}

const asciiEl: HTMLElement = document.getElementById('ascii')!;
const canvasWrap: HTMLElement = document.getElementById('canvasWrap')!;
const hudBarEl: HTMLElement = document.getElementById('hudBar')!;
const modePill: HTMLElement = document.getElementById('modePill')!;
const renderPill: HTMLElement = document.getElementById('renderPill')!;
const statsEl: HTMLElement = document.getElementById('stats')!;
const panelEl: HTMLElement = document.getElementById('panel')!;
const logEl: HTMLElement = document.getElementById('log')!;
const todoTitleEl: HTMLElement = document.getElementById('todoTitle')!;
const todoListEl: HTMLElement = document.getElementById('todoList')!;
const controlsHintEl: HTMLElement = document.getElementById('controlsHint')!;
const supportLeadEl: HTMLElement = document.getElementById('supportLead')!;
const supportLinkEl: HTMLAnchorElement = document.getElementById('supportLink') as HTMLAnchorElement;
const supportTailEl: HTMLElement = document.getElementById('supportTail')!;
const overworldHintEl: HTMLElement = document.getElementById('overworldHint')!;
const menuActionsLabel: HTMLElement = document.getElementById('menuActionsLabel')!;
const menuPanelsLabel: HTMLElement = document.getElementById('menuPanelsLabel')!;
const menuRenderLabel: HTMLElement = document.getElementById('menuRenderLabel')!;
const nameLabel: HTMLElement = document.getElementById('nameLabel')!;
const genderLabel: HTMLElement = document.getElementById('genderLabel')!;
const btnCanvas: HTMLButtonElement = document.getElementById('btnCanvas') as HTMLButtonElement;
const btnNewSeed: HTMLButtonElement = document.getElementById('btnNewSeed') as HTMLButtonElement;
const btnSave: HTMLButtonElement = document.getElementById('btnSave') as HTMLButtonElement;
const btnLoad: HTMLButtonElement = document.getElementById('btnLoad') as HTMLButtonElement;
const btnExportSave: HTMLButtonElement = document.getElementById('btnExportSave') as HTMLButtonElement;
const btnImportSave: HTMLButtonElement = document.getElementById('btnImportSave') as HTMLButtonElement;
const btnInv: HTMLButtonElement = document.getElementById('btnInv') as HTMLButtonElement;
const btnShop: HTMLButtonElement = document.getElementById('btnShop') as HTMLButtonElement;
const btnStory: HTMLButtonElement = document.getElementById('btnStory') as HTMLButtonElement;
const btnMap: HTMLButtonElement = document.getElementById('btnMap') as HTMLButtonElement;
const canvas: HTMLCanvasElement = document.getElementById('gameCanvas') as HTMLCanvasElement;
const canvasRenderer: PixiRenderer = new PixiRenderer(canvas);
const minimapWrap: HTMLElement = document.getElementById('minimapWrap')!;
const minimapCanvas: HTMLCanvasElement = document.getElementById('minimap') as HTMLCanvasElement;
const minimapCtx: CanvasRenderingContext2D | null = minimapCanvas.getContext('2d');
const pathModeLabel: HTMLElement = document.getElementById('pathModeLabel')!;
const btnPathMode: HTMLButtonElement = document.getElementById('btnPathMode') as HTMLButtonElement;
const classModal: HTMLElement = document.getElementById('classSelect')!;
const classSelectTitle: HTMLElement = document.getElementById('classSelectTitle')!;
const classSelectSubtitle: HTMLElement = document.getElementById('classSelectSubtitle')!;
const classButtons: HTMLButtonElement[] = Array.from(classModal.querySelectorAll<HTMLButtonElement>('[data-class]'));
const nameInput: HTMLInputElement = document.getElementById('nameInput') as HTMLInputElement;
const nameErrorEl: HTMLElement = document.getElementById('nameError')!;
const btnNameRandom: HTMLButtonElement = document.getElementById('btnNameRandom') as HTMLButtonElement;
const genderOptionsWrap: HTMLElement = document.getElementById('genderOptions')!;
const genderRadios: HTMLInputElement[] = Array.from(genderOptionsWrap.querySelectorAll<HTMLInputElement>('input[name="genderOption"]'));
const btnLoadFromModal: HTMLButtonElement = document.getElementById('btnLoadFromModal') as HTMLButtonElement;
const saveModal: HTMLElement = document.getElementById('saveModal')!;
const saveModalTitle: HTMLElement = document.getElementById('saveModalTitle')!;
const saveModalHint: HTMLElement = document.getElementById('saveModalHint')!;
const saveJsonText: HTMLTextAreaElement = document.getElementById('saveJsonText') as HTMLTextAreaElement;
const btnSaveModalCopy: HTMLButtonElement = document.getElementById('btnSaveModalCopy') as HTMLButtonElement;
const btnSaveModalLoad: HTMLButtonElement = document.getElementById('btnSaveModalLoad') as HTMLButtonElement;
const btnSaveModalClose: HTMLButtonElement = document.getElementById('btnSaveModalClose') as HTMLButtonElement;

type SaveModalMode = 'export' | 'import';
let saveModalMode: SaveModalMode = 'export';

let pendingSeed: number = Date.now() & 0xffffffff;
let pendingClass: CharacterClass = CharacterClass.Warrior;
let pendingGender: Gender = Gender.Female;
let pendingName: string = '';
canvasWrap.classList.add('displayNone');

/**
 * Computes the Pixi view size in tiles.
 * @returns The view size in tiles.
 */
function getPixiViewSize(): { w: number; h: number } {
  const tileSize: number = 16;
  const widthPx: number = Math.max(1, Math.floor(canvas.width));
  const heightPx: number = Math.max(1, Math.floor(canvas.height));
  const w: number = Math.max(1, Math.floor(widthPx / tileSize));
  const h: number = Math.max(1, Math.floor(heightPx / tileSize));
  return { w, h };
}

/**
 * Applies static localized strings to UI elements.
 */
function applyStaticI18n(): void {
  document.title = t('app.title');
  controlsHintEl.textContent = t('ui.hint.controls');
  supportLeadEl.textContent = t('ui.support.cta');
  supportLinkEl.textContent = t('ui.support.linkText');
  supportTailEl.textContent = t('ui.support.tail');
  overworldHintEl.innerHTML = t('ui.overworld.hint', {
    dungeonKey: '<b>D</b>',
    caveKey: '<b>C</b>',
    townKey: '<b>T</b>',
    roadKey: '<b>=</b>',
    mapKey: '<b>M</b>',
    enterKey: '<b>Enter</b>',
    downKey: '<b>&gt;</b>',
    upKey: '<b>&lt;</b>'
  });

  menuActionsLabel.textContent = t('ui.menu.actions');
  menuPanelsLabel.textContent = t('ui.menu.panels');
  menuRenderLabel.textContent = t('ui.menu.render');
  nameLabel.textContent = t('ui.name.label');
  genderLabel.textContent = t('ui.gender.label');
  todoTitleEl.textContent = t('ui.todo.title');
  pathModeLabel.textContent = t('ui.pathMode.label');

  btnCanvas.textContent = t('ui.buttons.canvas');
  btnNewSeed.textContent = t('ui.buttons.newSeed');
  btnSave.textContent = t('ui.buttons.save');
  btnLoad.textContent = t('ui.buttons.load');
  btnExportSave.textContent = t('ui.buttons.exportSave');
  btnImportSave.textContent = t('ui.buttons.importSave');
  btnInv.textContent = t('ui.buttons.inventory');
  btnShop.textContent = t('ui.buttons.shop');
  btnStory.textContent = t('ui.buttons.story');
  btnMap.textContent = t('ui.buttons.map');

  classSelectTitle.textContent = t('ui.classSelect.title');
  classSelectSubtitle.textContent = t('ui.classSelect.subtitle');
  btnLoadFromModal.textContent = t('ui.classSelect.load');
  btnNameRandom.textContent = t('ui.name.random');

  nameInput.placeholder = t('ui.name.placeholder');
  nameInput.value = pendingName;
  nameErrorEl.textContent = '';

  const genderOptions: Array<{ key: Gender; label: string }> = [
    { key: Gender.Female, label: t('gender.female') },
    { key: Gender.Male, label: t('gender.male') },
    { key: Gender.Nonbinary, label: t('gender.nonbinary') }
  ];
  for (const option of genderOptions) {
    const optionLabel: HTMLElement | null = genderOptionsWrap.querySelector(`[data-gender-option="${option.key}"]`);
    if (optionLabel) {
      optionLabel.textContent = option.label;
    }
    const radio: HTMLInputElement | undefined = genderRadios.find((input) => input.value === option.key);
    if (radio) {
      radio.setAttribute('aria-label', option.label);
    }
  }
  setGenderSelection(pendingGender);

  classButtons.forEach((btn) => {
    const classType: CharacterClass | undefined = btn.dataset.class as CharacterClass | undefined;
    if (!classType) {
      return;
    }
    const cfg: ClassConfig = CLASS_CONFIG[classType];
    const modalDesc: string = t(`class.${classType}.modal`);
    const statLine: string = t('class.stats.line', { str: cfg.strength, agi: cfg.agility, int: cfg.intellect });
    btn.innerHTML = `<strong>${escapeHtml(cfg.name)}</strong><span>${escapeHtml(modalDesc)}</span><small>${escapeHtml(statLine)}</small>`;
  });

  btnSaveModalCopy.textContent = t('ui.saveModal.copy');
  btnSaveModalLoad.textContent = t('ui.saveModal.load');
  btnSaveModalClose.textContent = t('ui.saveModal.close');
}

applyStaticI18n();

function setGenderSelection(gender: Gender): void {
  let matched: boolean = false;
  genderRadios.forEach((radio) => {
    const isMatch: boolean = radio.value === gender;
    radio.checked = isMatch;
    if (isMatch) {
      matched = true;
    }
  });
  if (!matched && genderRadios.length > 0) {
    genderRadios[0].checked = true;
  }
}

function getSelectedGender(): Gender {
  const selected: HTMLInputElement | undefined = genderRadios.find((radio) => radio.checked);
  if (selected) {
    return selected.value as Gender;
  }
  if (genderRadios.length > 0) {
    return genderRadios[0].value as Gender;
  }
  return pendingGender;
}

/**
 * Normalizes a raw player name input.
 * @param raw The raw input.
 * @returns The normalized name.
 */
function normalizePlayerName(raw: string): string {
  const trimmed: string = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return t('entity.playerName');
  }
  return trimmed.slice(0, 24);
}

/**
 * Validates a player name.
 * @param raw The raw input.
 * @returns Validation status and message.
 */
function validatePlayerName(raw: string): { ok: boolean; message: string } {
  const name: string = normalizePlayerName(raw);
  if (name.length < 2) {
    return { ok: false, message: t('ui.name.error.length') };
  }
  if (!/^[A-Za-z][A-Za-z '\-]*$/.test(name)) {
    return { ok: false, message: t('ui.name.error.chars') };
  }
  if (/^[-']|[-']$/.test(name)) {
    return { ok: false, message: t('ui.name.error.punct') };
  }
  return { ok: true, message: '' };
}

/**
 * Generates a random player name.
 * @returns The generated name.
 */
function generateRandomName(): string {
  const starts: string[] = ['Ar', 'Bel', 'Cor', 'Dar', 'El', 'Fa', 'Gal', 'Hal', 'Is', 'Ka', 'Lor', 'Ma', 'Nor', 'Or', 'Per'];
  const mids: string[] = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'eo', 'io', 'oa'];
  const ends: string[] = ['dor', 'lin', 'mar', 'ric', 'vyn', 'dell', 'ran', 'reth', 'thas', 'mir', 'win', 'gorn', 'sor', 'len', 'var'];
  const secondEnds: string[] = ['a', 'ia', 'el', 'wyn', 'is', 'eth', 'ara', 'en', 'ys', 'iel'];
  const useSecond: boolean = Math.random() < 0.35;
  const name: string =
    starts[Math.floor(Math.random() * starts.length)] +
    mids[Math.floor(Math.random() * mids.length)] +
    ends[Math.floor(Math.random() * ends.length)] +
    (useSecond ? secondEnds[Math.floor(Math.random() * secondEnds.length)] : '');
  return name.slice(0, 24);
}

pendingName = generateRandomName();
nameInput.value = pendingName;

/**
 * Creates a new game state.
 * @param worldSeed The world seed.
 * @param classChoice The player class.
 * @param gender The player gender.
 * @param name The player name.
 * @returns The initialized game state.
 */
function newGame(worldSeed: number, classChoice: CharacterClass, gender: Gender, name: string): GameState {
  const rng: Rng = new Rng(worldSeed);
  const overworld: Overworld = new Overworld(worldSeed);
  const cfg: ClassConfig = CLASS_CONFIG[classChoice];
  const story: CharacterStory = buildStory(rng, classChoice, gender);

  const player: Entity = {
    id: 'player',
    kind: EntityKind.Player,
    name,
    glyph: '@',
    pos: findStartPosition(overworld, rng),
    mapRef: { kind: Mode.Overworld },
    hp: cfg.maxHp,
    maxHp: cfg.maxHp,
    baseAttack: cfg.baseAttack,
    baseDefense: cfg.baseDefense,
    level: 1,
    xp: 0,
    gold: 20,
    inventory: [],
    equipment: {},
    classType: classChoice,
    gender,
    strength: cfg.strength,
    agility: cfg.agility,
    intellect: cfg.intellect,
    statusEffects: []
  };

  const state: GameState = {
    worldSeed,
    rng,
    mode: Mode.Overworld,
    overworld,
    dungeons: new Map<string, Dungeon>(),
    dungeonStack: [],
    towns: new Map<string, Town>(),
    currentTownId: undefined,
    townReturnPos: undefined,
    player,
    playerClass: classChoice,
    story,
    entities: [player],
    items: [],
    shops: new Map<string, Shop>(),
    rendererMode: PixiRenderMode.Isometric,
    useFov: true,
    activePanel: PanelMode.None,
    shopCategory: ShopSpecialty.All,
    turnCounter: 0,
    quests: [],
    mapOpen: false,
    mapCursor: { x: 0, y: 0 },
    destination: undefined,
    autoPath: undefined,
    log: new MessageLog(160),
    preferRoads: true
  };

  state.log.push(t('log.welcome'));
  state.log.push(t('log.controls'));
  state.log.push(t('log.controls.system'));
  state.log.push(t('log.classStats', { name: cfg.name, str: cfg.strength, agi: cfg.agility, int: cfg.intellect }));
  ensureStartingGear(state, classChoice);
  addStoryEvent(state, 'story.event.begin.title', 'story.event.begin.detail', { className: cfg.name });
  return state;
}
/**
 * Finds a valid starting position on the overworld.
 * @param overworld The overworld instance.
 * @param rng The RNG.
 * @returns The starting position.
 */
function findStartPosition(overworld: Overworld, rng: Rng): Point {
  for (let i: number = 0; i < 4000; i++) {
    const x: number = rng.nextInt(-200, 200);
    const y: number = rng.nextInt(-200, 200);
    if (canEnterOverworldTile(overworld, { x, y })) {
      return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

let state: GameState = newGame(pendingSeed, pendingClass, pendingGender, pendingName);
let overworldNavigator: OverworldNavigator = new OverworldNavigator(state.overworld);

/**
 * Hides the class selection modal.
 */
function hideClassModal(): void {
  classModal.classList.add('hidden');
}

/**
 * Shows the class selection modal and focuses the name input.
 */
function showClassModal(): void {
  classModal.classList.remove('hidden');
  if (!pendingName) {
    pendingName = generateRandomName();
  }
  nameInput.value = pendingName;
  nameInput.classList.remove('invalid');
  nameErrorEl.textContent = '';
  nameInput.focus();
  nameInput.select();
}

/**
 * Checks whether the class selection modal is visible.
 * @returns True if visible.
 */
function isClassModalVisible(): boolean {
  return !classModal.classList.contains('hidden');
}

/**
 * Starts a new run with the selected class.
 * @param classChoice The chosen class.
 */
function startNewRun(classChoice: CharacterClass): void {
  pendingClass = classChoice;
  const gender: Gender = getSelectedGender();
  pendingGender = gender;
  let rawName: string = nameInput.value;
  if (!rawName.trim()) {
    const generated: string = generateRandomName();
    nameInput.value = generated;
    rawName = generated;
  }
  const name: string = normalizePlayerName(rawName);
  const validation = validatePlayerName(name);
  if (!validation.ok) {
    nameInput.classList.add('invalid');
    nameErrorEl.textContent = validation.message;
    nameInput.focus();
    nameInput.select();
    return;
  }
  pendingName = name;
  nameInput.classList.remove('invalid');
  nameErrorEl.textContent = '';
  state = newGame(pendingSeed, classChoice, gender, name);
  overworldNavigator = new OverworldNavigator(state.overworld);
  combat.setState(state);
  hideClassModal();
  syncRendererUi();
  render();
}

/**
 * Returns the current dungeon based on player map ref.
 * @param s The game state.
 * @returns The current dungeon, or undefined.
 */
function getCurrentDungeon(s: GameState): Dungeon | undefined {
  if (s.player.mapRef.kind !== Mode.Dungeon) {
    return undefined;
  }
  return s.dungeons.get(s.player.mapRef.dungeonId);
}

/**
 * Returns the current town based on player map ref.
 * @param s The game state.
 * @returns The current town, or undefined.
 */
function getCurrentTown(s: GameState): Town | undefined {
  if (s.player.mapRef.kind !== Mode.Town) {
    return undefined;
  }
  return s.towns.get(s.player.mapRef.townId);
}

/**
 * Ensures a dungeon level exists, generating if needed.
 * @param s The game state.
 * @param baseId The dungeon base id.
 * @param depth The dungeon depth.
 * @param entranceWorldPos The entrance world position.
 * @param layout The dungeon layout.
 * @returns The dungeon level.
 */
function ensureDungeonLevel(s: GameState, baseId: string, depth: number, entranceWorldPos: Point, layout: DungeonLayout): Dungeon {
  const levelId: string = dungeonLevelId(baseId, depth);
  const existing: Dungeon | undefined = s.dungeons.get(levelId);
  if (existing) {
    return existing;
  }

  const baseSeed: number =
    layout === DungeonLayout.Caves
      ? caveSeedFromWorldPos(s.worldSeed, entranceWorldPos.x, entranceWorldPos.y)
      : dungeonSeedFromWorldPos(s.worldSeed, entranceWorldPos.x, entranceWorldPos.y);
  const levelSeed: number = (baseSeed ^ (depth * 0x9e3779b9)) | 0;

  const generator: DungeonGenerator = new DungeonGenerator({
    dungeonId: levelId,
    baseId,
    depth,
    seed: levelSeed,
    width: 80,
    height: 50,
    layout
  });
  const dungeon: Dungeon = generator.generate();

  spawnMonstersInDungeon(s, dungeon, levelSeed);
  spawnLootInDungeon(s, dungeon, levelSeed);
  spawnBossInDungeon(s, dungeon, levelSeed);

  s.dungeons.set(levelId, dungeon);
  return dungeon;
}

/**
 * Ensures the town interior exists, generating if needed.
 * @param s The game state.
 * @param townCenter The town center point.
 * @returns The town interior.
 */
function ensureTownInterior(s: GameState, townCenter: Point): Town {
  const townId: string = townIdFromWorldPos(s.worldSeed, townCenter.x, townCenter.y);
  const existing: Town | undefined = s.towns.get(townId);
  if (existing) {
    return existing;
  }

  const seed: number = townSeedFromWorldPos(s.worldSeed, townCenter.x, townCenter.y);
  const town: Town = generateTown(townId, seed);
  s.towns.set(townId, town);
  return town;
}

const BOSS_MIN_DEPTH: number = 3;

/**
 * Spawns a batch of monsters into a dungeon.
 * @param s The game state.
 * @param dungeon The dungeon instance.
 * @param seed The RNG seed.
 */
function spawnMonstersInDungeon(s: GameState, dungeon: Dungeon, seed: number): void {
  const monsterCount: number = 5 + Math.min(12, dungeon.depth * 2);
  const rng: Rng = new Rng(seed ^ 0xbeef);
  const playerLevel: number = s.player.level;

  for (let i: number = 0; i < monsterCount; i++) {
    const p: Point = randomFloorPoint(dungeon, seed + 1000 + i * 17);

    const roll: number = rng.nextInt(0, 100);
    const monster = createMonsterForDepth(dungeon.depth, roll, s.rng, dungeon.id, i, p, playerLevel);

    s.entities.push(monster);
  }
}

function spawnAmbushMonsters(s: GameState, dungeon: Dungeon, seed: number, playerLevel: number): void {
  const rng: Rng = new Rng(seed ^ 0xa51d);
  const desired: number = Math.max(2, Math.min(6, 2 + Math.floor(playerLevel / 3)));
  const depth: number = Math.max(1, Math.floor((playerLevel + 1) / 2));
  const used: Set<string> = new Set<string>();

  for (let i: number = 0; i < desired; i++) {
    let spawn: Point | undefined;
    for (let attempts: number = 0; attempts < 200; attempts++) {
      const candidate: Point = randomFloorPoint(dungeon, seed + 2000 + i * 37 + attempts * 11);
      if ((candidate.x === dungeon.stairsUp.x && candidate.y === dungeon.stairsUp.y) || used.has(`${candidate.x},${candidate.y}`)) {
        continue;
      }
      spawn = candidate;
      used.add(`${candidate.x},${candidate.y}`);
      break;
    }
    if (!spawn) {
      const fx: number = Math.max(1, Math.min(dungeon.width - 2, dungeon.stairsUp.x + (i % 2 === 0 ? 1 : -1)));
      const fy: number = Math.max(1, Math.min(dungeon.height - 2, dungeon.stairsUp.y));
      if (getDungeonTile(dungeon, fx, fy) === DungeonTile.Wall) {
        const altY: number = Math.max(1, Math.min(dungeon.height - 2, dungeon.stairsUp.y + (i % 2 === 0 ? 1 : -1)));
        spawn = { x: dungeon.stairsUp.x, y: altY };
      } else {
        spawn = { x: fx, y: fy };
      }
      used.add(`${spawn.x},${spawn.y}`);
    }

    const roll: number = rng.nextInt(0, 100);
    const monster: Entity = createMonsterForDepth(depth, roll, s.rng, dungeon.id, i, spawn, playerLevel);
    s.entities.push(monster);
  }
}

/**
 * Creates a monster scaled to the dungeon depth.
 * @param depth The dungeon depth.
 * @param roll The percentile roll.
 * @param rng The RNG.
 * @param dungeonId The dungeon id.
 * @param i The monster index.
 * @param p The spawn position.
 * @returns The monster entity.
 */
function createMonsterForDepth(depth: number, roll: number, rng: Rng, dungeonId: string, i: number, p: Point, playerLevel: number): Entity {
  const levelDelta: number = Math.max(0, playerLevel - depth);
  const effectiveDepth: number = depth + Math.floor(levelDelta / 2);
  const monsterLevel: number = Math.max(1, Math.floor((depth + playerLevel) / 2));

  // Slime: weak, Orc: tougher, Goblin: baseline
  if (roll < 30) {
    return {
      id: `m_${dungeonId}_${i}`,
      kind: EntityKind.Monster,
      name: monsterName('slime'),
      glyph: 's',
      pos: p,
      mapRef: { kind: Mode.Dungeon, dungeonId },
      hp: 4 + effectiveDepth,
      maxHp: 4 + effectiveDepth,
      baseAttack: 1 + Math.floor(effectiveDepth / 2),
      baseDefense: 0,
      level: monsterLevel,
      xp: 0,
      gold: 0,
      inventory: [],
      equipment: {}
    };
  }

  if (roll < 60) {
    return {
      id: `m_${dungeonId}_${i}`,
      kind: EntityKind.Monster,
      name: monsterName('goblin'),
      glyph: 'g',
      pos: p,
      mapRef: { kind: Mode.Dungeon, dungeonId },
      hp: 6 + effectiveDepth * 2,
      maxHp: 6 + effectiveDepth * 2,
      baseAttack: 2 + effectiveDepth,
      baseDefense: Math.floor(effectiveDepth / 3),
      level: monsterLevel,
      xp: 0,
      gold: 0,
      inventory: [],
      equipment: {}
    };
  }

  if (depth >= 2 && roll < 82) {
    return {
      id: `m_${dungeonId}_${i}`,
      kind: EntityKind.Monster,
      name: monsterName('wraith'),
      glyph: 'w',
      pos: p,
      mapRef: { kind: Mode.Dungeon, dungeonId },
      hp: 7 + effectiveDepth * 2,
      maxHp: 7 + effectiveDepth * 2,
      baseAttack: 2 + effectiveDepth,
      baseDefense: Math.floor(effectiveDepth / 3),
      level: monsterLevel,
      xp: 0,
      gold: 0,
      inventory: [],
      equipment: {},
      statusEffects: [],
      specialCooldown: 0
    };
  }

  return {
    id: `m_${dungeonId}_${i}`,
    kind: EntityKind.Monster,
    name: monsterName('orc'),
    glyph: 'O',
    pos: p,
    mapRef: { kind: Mode.Dungeon, dungeonId },
    hp: 10 + effectiveDepth * 3,
    maxHp: 10 + effectiveDepth * 3,
    baseAttack: 3 + effectiveDepth,
    baseDefense: 1 + Math.floor(effectiveDepth / 2),
    level: Math.max(monsterLevel, 2),
    xp: 0,
    gold: 0,
    inventory: [],
    equipment: {},
    statusEffects: []
  };
}

/**
 * Returns a boss name based on a dungeon theme.
 * @param theme The dungeon theme.
 * @returns The boss name.
 */
function bossNameForTheme(theme: DungeonTheme): string {
  switch (theme) {
    case 'caves':
      return t('boss.caves');
    case 'crypt':
      return t('boss.crypt');
    case 'ruins':
    default:
      return t('boss.ruins');
  }
}

/**
 * Returns a boss name based on dungeon depth.
 * @param depth The dungeon depth.
 * @returns The boss name.
 */
function bossNameForDepth(depth: number): string {
  if (depth < 3) {
    return t('boss.ruins');
  }
  if (depth < 6) {
    return t('boss.caves');
  }
  return t('boss.crypt');
}

/**
 * Spawns a boss into the dungeon if eligible.
 * @param s The game state.
 * @param dungeon The dungeon instance.
 * @param seed The RNG seed.
 */
function spawnBossInDungeon(s: GameState, dungeon: Dungeon, seed: number): void {
  if (dungeon.depth < BOSS_MIN_DEPTH) {
    return;
  }
  if (s.entities.some((e) => e.isBoss && e.mapRef.kind === Mode.Dungeon && e.mapRef.dungeonId === dungeon.id)) {
    return;
  }

  const rng: Rng = new Rng(seed ^ 0xb055);
  const p: Point = dungeon.bossRoom ? dungeon.bossRoom.center : randomFloorPoint(dungeon, seed + 7000);
  const name: string = bossNameForTheme(dungeon.theme);
  const hp: number = 24 + dungeon.depth * 7;
  const boss: Entity = {
    id: `boss_${dungeon.id}`,
    kind: EntityKind.Monster,
    name,
    glyph: 'B',
    pos: p,
    mapRef: { kind: Mode.Dungeon, dungeonId: dungeon.id },
    hp,
    maxHp: hp,
    baseAttack: 5 + dungeon.depth * 2,
    baseDefense: 2 + Math.floor(dungeon.depth / 2),
    level: 1,
    xp: 0,
    gold: 0,
    inventory: [],
    equipment: {},
    statusEffects: [],
    isBoss: true
  };

  s.entities.push(boss);
}

/**
 * Spawns loot items into the dungeon.
 * @param s The game state.
 * @param dungeon The dungeon instance.
 * @param seed The RNG seed.
 */
function spawnLootInDungeon(s: GameState, dungeon: Dungeon, seed: number): void {
  const rng: Rng = new Rng(seed ^ 0x51f15);
  const lootCount: number = 8;

  for (let i: number = 0; i < lootCount; i++) {
    const p: Point = randomFloorPoint(dungeon, seed + 5000 + i * 31);
    const roll: number = rng.nextInt(0, 100);
    const baseId: string = `it_${dungeon.id}_${i}`;

    let item: Item;
    if (roll < 55) {
      item = {
        id: baseId,
        kind: ItemKind.Potion,
        name: dungeon.depth >= 4 ? t('item.potion.greater') : t('item.potion.healing'),
        healAmount: 8 + dungeon.depth * 2,
        value: 10 + dungeon.depth * 2
      };
    } else if (roll < 80) {
      const power: number = Math.max(1, dungeon.depth + rng.nextInt(0, 2));
      item = generateWeaponLoot(`${baseId}_w`, power, rng);
    } else if (roll < 95) {
      const power: number = Math.max(1, dungeon.depth + rng.nextInt(0, 2));
      item = generateArmorLoot(`${baseId}_a`, power, rng);
    } else {
      const slot: ItemKind.Weapon | ItemKind.Armor = rng.nextInt(0, 2) === 0 ? ItemKind.Weapon : ItemKind.Armor;
      const upgradeId: string = `${baseId}_class_${slot}`;
      const upgradeLevel: number = Math.max(1, Math.floor(dungeon.depth / 2) + 1);
      item = createClassUpgradeItem(s.playerClass, slot, upgradeId, upgradeLevel, rng);
    }

    item.mapRef = { kind: Mode.Dungeon, dungeonId: dungeon.id };
    item.pos = p;
    s.items.push(item);
  }
}

/**
 * Returns the town id under the player if any.
 * @returns The town id, or undefined.
 */
function getActiveTownId(): string | undefined {
  if (state.mode === Mode.Town) {
    return state.currentTownId;
  }
  if (state.mode !== Mode.Overworld) {
    return undefined;
  }
  const tile = state.overworld.getTile(state.player.pos.x, state.player.pos.y);
  if (tile !== 'town' && !tile.startsWith('town_')) {
    return undefined;
  }
  const center: Point | undefined = state.overworld.getTownCenter(state.player.pos.x, state.player.pos.y);
  if (!center) {
    return townIdFromWorldPos(state.worldSeed, state.player.pos.x, state.player.pos.y);
  }
  return townIdFromWorldPos(state.worldSeed, center.x, center.y);
}

/**
 * Ensures the town has quests generated.
 * @param s The game state.
 * @param townPos The town position.
 */
function ensureQuestForTown(s: GameState, townPos: Point): void {
  const center: Point = s.overworld.getTownCenter(townPos.x, townPos.y) ?? townPos;
  const townId: string = townIdFromWorldPos(s.worldSeed, center.x, center.y);

  // If we already have quests for this town, do nothing.
  if (s.quests.some((q) => q.townId === townId)) {
    return;
  }

  // Generate 1-2 quests deterministically from seed + town coords.
  const seed: number = hash2D(s.worldSeed, center.x, center.y) ^ 0xa11ce;
  const rng: Rng = new Rng(seed);

  const questCount: number = 1 + rng.nextInt(0, 2);
  const monsterPool: MonsterKey[] = ['slime', 'goblin', 'orc'];
  for (let i: number = 0; i < questCount; i++) {
    const questRoll: number = rng.nextInt(0, 100);

    if (questRoll < 55) {
      const minDepth: number = 1 + rng.nextInt(0, 4);
      const targetCount: number = 6 + rng.nextInt(0, 8);
      const rewardGold: number = 20 + minDepth * 10 + rng.nextInt(0, 10);
      const rewardXp: number = 18 + minDepth * 8 + rng.nextInt(0, 10);

      const q: import('./core/types').Quest = {
        id: `q_${townId}_${i}`,
        townId,
        kind: QuestKind.KillMonsters,
        description: t('quest.killMonsters.desc', { count: targetCount, depth: minDepth }),
        targetCount,
        currentCount: 0,
        minDungeonDepth: minDepth,
        rewardGold,
        rewardXp,
        completed: false,
        turnedIn: false
      };

      q.rewardItemIds = maybeCreateQuestRewards(s, rng, q.id, minDepth + 1);

      s.quests.push(q);
      continue;
    }

    if (questRoll < 85) {
      const minDepth: number = 1 + rng.nextInt(0, 4);
      const targetCount: number = 4 + rng.nextInt(0, 6);
      const rewardGold: number = 22 + minDepth * 12 + rng.nextInt(0, 12);
      const rewardXp: number = 20 + minDepth * 9 + rng.nextInt(0, 10);
      const targetPool: MonsterKey[] = minDepth >= 2 ? [...monsterPool, 'wraith'] : monsterPool;
      const targetKey: MonsterKey = targetPool[rng.nextInt(0, targetPool.length)];
      const targetMonster: string = monsterName(targetKey);
      const targetLabel: string = monsterPlural(targetKey);

      const q: import('./core/types').Quest = {
        id: `q_${townId}_${i}`,
        townId,
        kind: QuestKind.SlayMonster,
        description: t('quest.slayMonsters.desc', { count: targetCount, target: targetLabel, depth: minDepth }),
        targetCount,
        currentCount: 0,
        targetMonster,
        minDungeonDepth: minDepth,
        rewardGold,
        rewardXp,
        completed: false,
        turnedIn: false
      };

      q.rewardItemIds = maybeCreateQuestRewards(s, rng, q.id, minDepth + 1);

      s.quests.push(q);
      continue;
    }

    if (questRoll < 95) {
      const targetDepth: number = 2 + rng.nextInt(0, 5);
      const rewardGold: number = 25 + targetDepth * 12 + rng.nextInt(0, 12);
      const rewardXp: number = 22 + targetDepth * 10 + rng.nextInt(0, 10);
      const q: import('./core/types').Quest = {
        id: `q_${townId}_${i}`,
        townId,
        kind: QuestKind.ReachDepth,
        description: t('quest.reachDepth.desc', { depth: targetDepth }),
        targetCount: targetDepth,
        currentCount: 0,
        targetDepth,
        minDungeonDepth: 0,
        rewardGold,
        rewardXp,
        completed: false,
        turnedIn: false
      };

      q.rewardItemIds = maybeCreateQuestRewards(s, rng, q.id, targetDepth + 1);

      s.quests.push(q);
      continue;
    }

    const bossDepth: number = Math.max(BOSS_MIN_DEPTH, 3 + rng.nextInt(0, 4));
    const bossName: string = bossNameForDepth(bossDepth);
    const rewardGold: number = 40 + bossDepth * 14 + rng.nextInt(0, 16);
    const rewardXp: number = 35 + bossDepth * 12 + rng.nextInt(0, 12);
    const q: import('./core/types').Quest = {
      id: `q_${townId}_${i}`,
      townId,
      kind: QuestKind.SlayBoss,
      description: t('quest.slayBoss.desc', { boss: bossName, depth: bossDepth }),
      targetCount: 1,
      currentCount: 0,
      targetMonster: bossName,
      minDungeonDepth: bossDepth,
      rewardGold,
      rewardXp,
      completed: false,
      turnedIn: false
    };

    q.rewardItemIds = createBossQuestRewards(s, rng, q.id, bossDepth + 2, bossName);

    s.quests.push(q);
  }
}

/**
 * Possibly creates quest reward item ids based on a roll.
 * @param s The game state.
 * @param rng The RNG.
 * @param questId The quest id.
 * @param power The reward power.
 * @returns Reward item ids, or undefined.
 */
function maybeCreateQuestRewards(s: GameState, rng: Rng, questId: string, power: number): string[] | undefined {
  const roll: number = rng.nextInt(0, 100);
  if (roll > 40) {
    return undefined;
  }

  const firstType: string = pickQuestRewardType(rng);
  let secondType: string = pickQuestRewardType(rng);
  if (secondType === firstType) {
    secondType = pickQuestRewardType(rng);
  }

  const firstId: string = createQuestRewardItem(s, rng, questId, power, 'a', firstType);
  const secondId: string = createQuestRewardItem(s, rng, questId, power, 'b', secondType);
  return [firstId, secondId];
}

/**
 * Creates reward items for boss quests.
 * @param s The game state.
 * @param rng The RNG.
 * @param questId The quest id.
 * @param power The reward power.
 * @param bossName The boss name.
 * @returns Reward item ids.
 */
function createBossQuestRewards(s: GameState, rng: Rng, questId: string, power: number, bossName: string): string[] {
  const weaponId: string = `${questId}_reward_boss_w`;
  if (!s.items.some((it) => it.id === weaponId)) {
    const item: Item = createBossRelicItem(rng, weaponId, ItemKind.Weapon, power, bossName);
    s.items.push(item);
  }

  const armorId: string = `${questId}_reward_boss_a`;
  if (!s.items.some((it) => it.id === armorId)) {
    const item: Item = createBossRelicItem(rng, armorId, ItemKind.Armor, power, bossName);
    s.items.push(item);
  }

  return [weaponId, armorId];
}

/**
 * Creates a boss relic item.
 * @param rng The RNG.
 * @param id The item id.
 * @param slot The gear slot.
 * @param power The reward power.
 * @param bossName The boss name.
 * @returns The relic item.
 */
function createBossRelicItem(rng: Rng, id: string, slot: ItemKind.Weapon | ItemKind.Armor, power: number, bossName: string): Item {
  if (slot === ItemKind.Weapon) {
    const item: Item = generateWeaponLoot(id, Math.max(1, power), rng);
    item.rarity = GearRarity.Legendary;
    item.attackBonus = (item.attackBonus ?? 0) + 3;
    item.value = Math.round(item.value * 2.4);
    item.name = t('item.relic.blade', { bossName });
    return item;
  }

  const item: Item = generateArmorLoot(id, Math.max(1, power), rng);
  item.rarity = GearRarity.Legendary;
  item.defenseBonus = (item.defenseBonus ?? 0) + 2;
  item.value = Math.round(item.value * 2.4);
  item.name = t('item.relic.aegis', { bossName });
  return item;
}

/**
 * Drops boss loot at the boss position if not already dropped.
 * @param s The game state.
 * @param boss The boss entity.
 */
function dropBossLoot(s: GameState, boss: Entity): void {
  if (!boss.isBoss || boss.mapRef.kind !== Mode.Dungeon) {
    return;
  }
  const dungeon: Dungeon | undefined = s.dungeons.get(boss.mapRef.dungeonId);
  if (!dungeon) {
    return;
  }

  const id: string = `boss_${dungeon.id}_loot`;
  if (s.items.some((it) => it.id === id)) {
    return;
  }

  const seed: number = hash2D(s.worldSeed ^ dungeon.depth, boss.pos.x, boss.pos.y) ^ 0xb055;
  const rng: Rng = new Rng(seed);
  const slot: ItemKind.Weapon | ItemKind.Armor = rng.nextInt(0, 2) === 0 ? ItemKind.Weapon : ItemKind.Armor;
  const item: Item = createBossRelicItem(rng, id, slot, dungeon.depth + 4, boss.name);
  item.mapRef = { kind: Mode.Dungeon, dungeonId: dungeon.id };
  item.pos = { x: boss.pos.x, y: boss.pos.y };
  s.items.push(item);
  s.log.push(t('log.boss.drop', { boss: boss.name, item: item.name }));
  addStoryEvent(s, 'story.event.boss.title', 'story.event.boss.detail', { boss: boss.name, depth: dungeon.depth });
}

/**
 * Picks a reward type key.
 * @param rng The RNG.
 * @returns The reward type key.
 */
function pickQuestRewardType(rng: Rng): string {
  const rewardTypeRoll: number = rng.nextInt(0, 100);
  if (rewardTypeRoll < 45) {
    return 'p';
  }
  if (rewardTypeRoll < 75) {
    return 'w';
  }
  return 'a';
}

/**
 * Creates a quest reward item for a quest.
 * @param s The game state.
 * @param rng The RNG.
 * @param questId The quest id.
 * @param power The reward power.
 * @param suffix The reward suffix.
 * @param typeKey The reward type key.
 * @returns The reward item id.
 */
function createQuestRewardItem(s: GameState, rng: Rng, questId: string, power: number, suffix: string, typeKey: string): string {
  if (typeKey === 'p') {
    const id: string = `${questId}_reward_${suffix}_p`;
    if (!s.items.some((it) => it.id === id)) {
      const healAmount: number = 8 + power * 2;
      const item: Item = {
        id,
        kind: ItemKind.Potion,
        name: power >= 4 ? t('item.potion.greater') : t('item.potion.healing'),
        healAmount,
        value: 10 + power * 2
      };
      s.items.push(item);
    }
    return id;
  }

  if (typeKey === 'w') {
    const id: string = `${questId}_reward_${suffix}_w`;
    if (!s.items.some((it) => it.id === id)) {
      const item: Item = generateWeaponLoot(id, Math.max(1, power), rng);
      s.items.push(item);
    }
    return id;
  }

  const id: string = `${questId}_reward_${suffix}_a`;
  if (!s.items.some((it) => it.id === id)) {
    const item: Item = generateArmorLoot(id, Math.max(1, power), rng);
    s.items.push(item);
  }
  return id;
}

/**
 * Records a monster kill against quest progress.
 * @param s The game state.
 * @param dungeonDepth The current dungeon depth.
 * @param monsterName The monster name.
 * @param isBoss Whether the monster is a boss.
 */
function recordKillForQuests(s: GameState, dungeonDepth: number, monsterName: string, isBoss: boolean): void {
  for (const q of s.quests) {
    if (q.kind !== QuestKind.KillMonsters && q.kind !== QuestKind.SlayMonster && q.kind !== QuestKind.SlayBoss) {
      continue;
    }
    if (q.completed || q.turnedIn) {
      continue;
    }
    if (dungeonDepth < q.minDungeonDepth) {
      continue;
    }
    if (q.kind === QuestKind.SlayMonster && q.targetMonster && q.targetMonster !== monsterName) {
      continue;
    }
    if (q.kind === QuestKind.SlayBoss) {
      if (!isBoss) {
        continue;
      }
      if (q.targetMonster && q.targetMonster !== monsterName) {
        continue;
      }
    }

    q.currentCount += 1;
    if (q.currentCount >= q.targetCount) {
      q.currentCount = q.targetCount;
      q.completed = true;
      s.log.push(t('log.quest.complete', { desc: q.description }));
    }
  }
}

/**
 * Records dungeon depth progress for reach-depth quests.
 * @param s The game state.
 * @param dungeonDepth The current dungeon depth.
 */
function recordDepthForQuests(s: GameState, dungeonDepth: number): void {
  for (const q of s.quests) {
    if (q.kind !== QuestKind.ReachDepth) {
      continue;
    }
    if (q.completed || q.turnedIn) {
      continue;
    }

    q.currentCount = Math.max(q.currentCount, dungeonDepth);
    if (q.currentCount >= q.targetCount) {
      q.currentCount = q.targetCount;
      q.completed = true;
      s.log.push(t('log.quest.complete', { desc: q.description }));
    }
  }
}

/**
 * Applies start-of-turn status effects to the player.
 * @param s The game state.
 */
function applyStatusEffectsStartOfTurn(s: GameState): void {
  const effects = s.player.statusEffects ?? [];
  if (effects.length === 0) {
    return;
  }

  for (const eff of effects) {
    if (eff.kind === StatusEffectKind.Poison) {
      s.player.hp -= eff.potency;
      s.log.push(t('log.poison.tick', { dmg: eff.potency, hp: Math.max(0, s.player.hp), maxHp: s.player.maxHp }));
    }
    eff.remainingTurns -= 1;
  }

  s.player.statusEffects = effects.filter((e) => e.remainingTurns > 0);

  if (s.player.hp <= 0) {
    s.log.push(t('log.poison.death'));
  }
}

/**
 * Applies a poison effect when a slime attacks.
 * @param attacker The attacking entity.
 */
function maybeApplyPoisonFromAttacker(attacker: Entity): void {
  // Slimes have a chance to poison.
  if (attacker.name !== monsterName('slime')) {
    return;
  }
  const roll: number = state.rng.nextInt(0, 100);
  if (roll >= 20) {
    return;
  }

  const effects = state.player.statusEffects ?? [];
  const existing = effects.find((e) => e.kind === StatusEffectKind.Poison);
  if (existing) {
    existing.remainingTurns = Math.max(existing.remainingTurns, 5);
    existing.potency = Math.max(existing.potency, 1);
  } else {
    effects.push({ kind: StatusEffectKind.Poison, remainingTurns: 5, potency: 1 });
  }
  state.player.statusEffects = effects;
  state.log.push(t('log.poisoned'));
}

/**
 * Restocks a shop on its interval.
 * @param s The game state.
 * @param shop The shop instance.
 */
function maybeRestockShop(s: GameState, shop: Shop): void {
  // Restock every 80 turns (simple timer) - deterministic but time-based.
  const needsRestock: boolean = s.turnCounter % SHOP_RESTOCK_INTERVAL === 0;

  if (!needsRestock) {
    return;
  }

  const seed: number =
    hash2D(s.worldSeed, shop.townWorldPos.x, shop.townWorldPos.y) ^ (Math.floor(s.turnCounter / SHOP_RESTOCK_INTERVAL) * 0x9e3779b9);
  const rng: Rng = new Rng(seed);

  // Replace stock item definitions (remove old ones first)
  const oldIds: Set<string> = new Set<string>(shop.stockItemIds);
  s.items = s.items.filter((it) => !oldIds.has(it.id));

  const stock: string[] = [];
  const tierLevel: number = Math.max(1, Math.floor(s.turnCounter / SHOP_RESTOCK_INTERVAL) + 1);
  for (let i: number = 0; i < 10; i++) {
    const roll: number = rng.nextInt(0, 100);
    const itemId: string = `shop_${shop.id}_${Math.floor(s.turnCounter / SHOP_RESTOCK_INTERVAL)}_${i}`;

    let item: Item;
    if (roll < 45) {
      item = { id: itemId, kind: ItemKind.Potion, name: t('item.potion.healing'), healAmount: 10, value: 14 };
    } else if (roll < 75) {
      const power: number = tierLevel + rng.nextInt(0, 2);
      item = generateWeaponLoot(itemId, power, rng);
    } else {
      const power: number = tierLevel + rng.nextInt(0, 2);
      item = generateArmorLoot(itemId, power, rng);
    }

    s.items.push(item);
    stock.push(itemId);
  }

  addClassGearToShop(s, shop.id, stock, Math.max(1, Math.floor(s.turnCounter / SHOP_RESTOCK_INTERVAL)), rng);

  shop.stockItemIds = stock;
  s.log.push(t('log.shop.restock'));
}

/**
 * Adds class-specific gear to a shop.
 * @param s The game state.
 * @param shopId The shop id.
 * @param stock The current stock list.
 * @param tier The shop tier.
 * @param rng The RNG.
 */
function addClassGearToShop(s: GameState, shopId: string, stock: string[], tier: number, rng: Rng): void {
  if (!CLASS_GEAR[s.playerClass]) {
    return;
  }

  const existingIds: Set<string> = new Set<string>(stock);
  const upgradeLevel: number = Math.max(1, tier + 1);

  const weaponId: string = `shop_${shopId}_class_weapon_${tier}`;
  if (!existingIds.has(weaponId) && !s.items.some((it) => it.id === weaponId)) {
    const item: Item = createClassUpgradeItem(s.playerClass, ItemKind.Weapon, weaponId, upgradeLevel, rng);
    s.items.push(item);
    stock.push(weaponId);
  }

  const armorId: string = `shop_${shopId}_class_armor_${tier}`;
  if (!existingIds.has(armorId) && !s.items.some((it) => it.id === armorId)) {
    const item: Item = createClassUpgradeItem(s.playerClass, ItemKind.Armor, armorId, upgradeLevel, rng);
    s.items.push(item);
    stock.push(armorId);
  }
}

/**
 * Ensures the town has a shop entry and stock.
 * @param s The game state.
 * @param townPos The town position.
 * @returns The shop instance.
 */
function ensureShopForTown(s: GameState, townPos: Point): Shop {
  const center: Point = s.overworld.getTownCenter(townPos.x, townPos.y) ?? townPos;
  const shopId: string = townIdFromWorldPos(s.worldSeed, center.x, center.y);
  const existing: Shop | undefined = s.shops.get(shopId);
  if (existing) {
    return existing;
  }

  const stock: string[] = [];
  const seed: number = hash2D(s.worldSeed, center.x, center.y);
  const rng: Rng = new Rng(seed ^ 0xc0ffee);

  // Generate 10 stock items that persist per town.
  for (let i: number = 0; i < 10; i++) {
    const roll: number = rng.nextInt(0, 100);

    const itemId: string = `shop_${shopId}_${i}`;
    let item: Item;

    if (roll < 45) {
      item = { id: itemId, kind: ItemKind.Potion, name: t('item.potion.healing'), healAmount: 10, value: 14 };
    } else if (roll < 75) {
      const power: number = 1 + rng.nextInt(0, 2);
      item = generateWeaponLoot(itemId, power, rng);
    } else {
      const power: number = 1 + rng.nextInt(0, 2);
      item = generateArmorLoot(itemId, power, rng);
    }

    // Shop stock is not placed on the map.
    s.items.push(item);
    stock.push(itemId);
  }

  addClassGearToShop(s, shopId, stock, 0, rng);

  const created: Shop = { id: shopId, townWorldPos: { x: center.x, y: center.y }, stockItemIds: stock };
  s.shops.set(shopId, created);
  return created;
}

/**
 * Returns true when the player is inside a town.
 * @returns True when in town.
 */
function isStandingOnTown(): boolean {
  return state.mode === Mode.Town;
}

/**
 * Returns the town tile at the player position.
 * @returns The town tile, or undefined.
 */
function getTownTileAtPlayer(): TownTile | undefined {
  if (state.mode !== Mode.Town) {
    return undefined;
  }
  const town: Town | undefined = getCurrentTown(state);
  if (!town) {
    return undefined;
  }
  return getTownTile(town, state.player.pos.x, state.player.pos.y);
}

/**
 * Returns true if the player is at or near the town gate.
 * @returns True if near the gate.
 */
function isAtOrNearTownGate(): boolean {
  if (state.mode !== Mode.Town) {
    return false;
  }
  const town: Town | undefined = getCurrentTown(state);
  if (!town) {
    return false;
  }
  const px: number = state.player.pos.x;
  const py: number = state.player.pos.y;
  const current: TownTile = getTownTile(town, px, py);
  if (current === TownTile.Gate || current === TownTile.Road) {
    return true;
  }
  const neighbors: Point[] = [
    { x: px + 1, y: py },
    { x: px - 1, y: py },
    { x: px, y: py + 1 },
    { x: px, y: py - 1 }
  ];
  for (const n of neighbors) {
    if (n.x < 0 || n.y < 0 || n.x >= town.width || n.y >= town.height) {
      continue;
    }
    if (getTownTile(town, n.x, n.y) === TownTile.Gate) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true if the shop panel can open here.
 * @returns True if a shop is available.
 */
function canOpenShopHere(): boolean {
  return state.mode === Mode.Town && getTownTileAtPlayer() === TownTile.Shop;
}

/**
 * Returns true if the quest panel can open here.
 * @returns True if a quest is available.
 */
function canOpenQuestHere(): boolean {
  return state.mode === Mode.Town && getTownTileAtPlayer() === TownTile.Tavern;
}

/**
 * Returns the current town world position if relevant.
 * @returns The town world position, or undefined.
 */
function getActiveTownWorldPos(): Point | undefined {
  if (state.mode === Mode.Town) {
    return state.townReturnPos;
  }
  if (state.mode !== Mode.Overworld) {
    return undefined;
  }
  const tile = state.overworld.getTile(state.player.pos.x, state.player.pos.y);
  if (
    tile === OverworldTile.Town ||
    tile === OverworldTile.TownShop ||
    tile === OverworldTile.TownTavern ||
    tile === OverworldTile.TownSmith ||
    tile === OverworldTile.TownHouse
  ) {
    return { x: state.player.pos.x, y: state.player.pos.y };
  }
  return undefined;
}

/**
 * Returns the entrance type under the player in overworld.
 * @returns The entrance kind, or undefined.
 */
function getOverworldEntranceKind(): 'dungeon' | 'cave' | undefined {
  if (state.mode !== Mode.Overworld) {
    return undefined;
  }
  const tile = state.overworld.getTile(state.player.pos.x, state.player.pos.y);
  if (tile === OverworldTile.Dungeon) {
    return 'dungeon';
  }
  if (tile === OverworldTile.Cave) {
    return 'cave';
  }
  return undefined;
}

/**
 * Returns true if standing on a dungeon entrance.
 * @returns True if at a dungeon entrance.
 */
function isStandingOnDungeonEntrance(): boolean {
  return getOverworldEntranceKind() !== undefined;
}

/**
 * Returns true if standing on a town building.
 * @returns True if at a town building.
 */
function isStandingOnTownBuilding(): boolean {
  if (state.mode !== Mode.Overworld) {
    return false;
  }
  const tile = state.overworld.getTile(state.player.pos.x, state.player.pos.y);
  return tile === OverworldTile.TownShop || tile === OverworldTile.TownTavern || tile === OverworldTile.TownSmith || tile === OverworldTile.TownHouse;
}

/**
 * Removes dead non-player entities.
 * @param s The game state.
 */
function removeDeadEntities(s: GameState): void {
  s.entities = s.entities.filter((e: Entity) => e.hp > 0 || e.kind === EntityKind.Player);
}

function cleanupAmbushState(dungeonId: string): void {
  state.dungeons.delete(dungeonId);
  state.items = state.items.filter((it) => !it.mapRef || it.mapRef.kind !== Mode.Dungeon || it.mapRef.dungeonId !== dungeonId);
  state.entities = state.entities.filter(
    (e: Entity) => e.kind === EntityKind.Player || e.mapRef.kind !== Mode.Dungeon || e.mapRef.dungeonId !== dungeonId
  );
}

function resolveAmbushVictory(dungeon: Dungeon): void {
  const stackFrame: DungeonStackFrame | undefined = state.dungeonStack[0];
  const returnPos: Point = stackFrame?.entranceWorldPos ?? { x: state.player.pos.x, y: state.player.pos.y };
  const baseReward: number = 10 + state.player.level * 4;
  const bonus: number = state.rng.nextInt(0, 8);
  const rewardGold: number = baseReward + bonus;
  state.player.gold += rewardGold;
  state.log.push(t('log.ambush.victory', { gold: rewardGold }));

  state.mode = Mode.Overworld;
  state.player.mapRef = { kind: Mode.Overworld };
  state.player.pos = { x: returnPos.x, y: returnPos.y };
  state.dungeonStack = [];
  state.destination = undefined;
  state.autoPath = undefined;

  cleanupAmbushState(dungeon.id);

  state.log.push(t('log.enter.overworld'));
}

function checkAmbushCompletion(): void {
  if (state.mode !== Mode.Dungeon) {
    return;
  }
  const dungeon: Dungeon | undefined = getCurrentDungeon(state);
  if (!dungeon || !dungeon.isAmbush || dungeon.ambushCleared) {
    return;
  }

  const remaining: boolean = state.entities.some(
    (e) => e.kind === EntityKind.Monster && e.mapRef.kind === Mode.Dungeon && e.mapRef.dungeonId === dungeon.id && e.hp > 0
  );
  if (!remaining) {
    dungeon.ambushCleared = true;
    state.log.push(t('log.ambush.cleared'));
  }
}

/**
 * Handles a player action and advances the turn.
 * @param action The action to handle.
 */
function handleAction(action: Action): void {
  if (action.kind === ActionKind.ToggleRenderer) {
    state.rendererMode = state.rendererMode === PixiRenderMode.Isometric ? PixiRenderMode.Canvas : PixiRenderMode.Isometric;
    state.log.push(state.rendererMode === PixiRenderMode.Isometric ? t('log.renderer.iso') : t('log.renderer.topdown'));
    syncRendererUi();
    render();
    return;
  }

  if (action.kind === ActionKind.ToggleFov) {
    state.useFov = !state.useFov;
    state.log.push(state.useFov ? t('log.fov.on') : t('log.fov.off'));
    render();
    return;
  }

  if (action.kind === ActionKind.ToggleInventory) {
    state.activePanel = state.activePanel === PanelMode.Inventory ? PanelMode.None : PanelMode.Inventory;
    render();
    return;
  }

  if (action.kind === ActionKind.ToggleShop) {
    if (state.activePanel === PanelMode.Shop) {
      state.activePanel = PanelMode.None;
      render();
      return;
    }
    if (!canOpenShopHere()) {
      state.log.push(t('log.shop.find'));
      render();
      return;
    }
    state.activePanel = PanelMode.Shop;
    const townPos: Point | undefined = getActiveTownWorldPos();
    if (townPos) {
      ensureShopForTown(state, townPos);
      ensureQuestForTown(state, townPos);
      const shopNow: Shop = ensureShopForTown(state, townPos);
      maybeRestockShop(state, shopNow);
    }
    render();
    return;
  }

  if (action.kind === ActionKind.ToggleMap) {
    state.mapOpen = !state.mapOpen;
    state.log.push(state.mapOpen ? t('log.map.open') : t('log.map.closed'));
    render();
    return;
  }

  if (action.kind === ActionKind.CancelAuto) {
    state.destination = undefined;
    state.autoPath = undefined;
    state.log.push(t('log.autoWalk.cancel'));
    render();
    return;
  }

  if (action.kind === ActionKind.ToggleQuest) {
    if (state.activePanel === PanelMode.Quest) {
      state.activePanel = PanelMode.None;
      render();
      return;
    }
    if (!canOpenQuestHere()) {
      state.log.push(t('log.quest.find'));
      render();
      return;
    }
    state.activePanel = PanelMode.Quest;
    const townPos: Point | undefined = getActiveTownWorldPos();
    if (townPos) {
      ensureQuestForTown(state, townPos);
      const shopNow: Shop = ensureShopForTown(state, townPos);
      maybeRestockShop(state, shopNow);
    }
    render();
    return;
  }

  if (action.kind === ActionKind.ToggleStory) {
    state.activePanel = state.activePanel === PanelMode.Story ? PanelMode.None : PanelMode.Story;
    render();
    return;
  }

  if (action.kind === ActionKind.Save) {
    doSave();
    render();
    return;
  }

  if (action.kind === ActionKind.Load) {
    doLoad();
    syncRendererUi();
    render();
    return;
  }

  if (action.kind === ActionKind.Help) {
    state.log.push(t('log.help'));
    render();
    return;
  }

  // Turn-based effects tick at the start of each action that advances time.
  state.turnCounter += 1;
  applyStatusEffectsStartOfTurn(state);
  if (state.player.hp <= 0) {
    render();
    return;
  }

  const acted: boolean = playerTurn(action);
  if (!acted) {
    render();
    return;
  }

  monstersTurn();
  removeDeadEntities(state);
  checkAmbushCompletion();

  if (state.player.hp <= 0) {
    state.log.push(t('log.death.restart'));
  }

  render();
}

/**
 * Performs the player turn and returns whether time advanced.
 * @param action The player action.
 * @returns True if the action advanced time.
 */
function playerTurn(action: Action): boolean {
  if (state.player.hp <= 0) {
    return false;
  }

  if (state.mode === Mode.Overworld && state.autoPath && state.autoPath.length >= 2) {
    // If the player presses a time-advancing key (move or space), advance one step along the path.
    if (action.kind === ActionKind.Move || action.kind === ActionKind.Wait) {
      const next: Point = state.autoPath[1];
      if (!canEnterOverworldTile(state.overworld, next)) {
        state.log.push(t('log.autoWalk.blocked'));
        state.destination = undefined;
        state.autoPath = undefined;
        return false;
      }

      state.player.pos = { x: next.x, y: next.y };
      state.autoPath = state.autoPath.slice(1);

      if (state.destination && state.player.pos.x === state.destination.x && state.player.pos.y === state.destination.y) {
        state.log.push(t('log.autoWalk.arrived'));
        state.destination = undefined;
        state.autoPath = undefined;
      }

      const tile = state.overworld.getTile(state.player.pos.x, state.player.pos.y);
      if (tile === 'dungeon') {
        state.log.push(t('log.autoWalk.dungeonFound'));
      }
      if (tile === 'cave') {
        state.log.push(t('log.autoWalk.caveFound'));
      }
      if (isStandingOnTownBuilding()) {
        state.log.push(t('log.autoWalk.townFound'));
      }

      return true;
    }
  }

  if (action.kind === ActionKind.Wait) {
    state.log.push(t('log.wait'));
    return true;
  }

  if (action.kind === ActionKind.Pickup) {
    return pickupAtPlayer();
  }

  if (action.kind === ActionKind.Use) {
    if (state.mode === Mode.Overworld) {
      const entrance = getOverworldEntranceKind();
      if (entrance) {
        enterDungeonAt(state.player.pos, entrance);
        return true;
      }
      if (isStandingOnTownBuilding()) {
        enterTownAt(state.player.pos);
        return true;
      }
      state.log.push(t('log.use.none'));
      return false;
    } else if (state.mode === Mode.Dungeon) {
      const dungeon: Dungeon | undefined = getCurrentDungeon(state);
      if (!dungeon) {
        return false;
      }

      const tile = getDungeonTile(dungeon, state.player.pos.x, state.player.pos.y);
      if (tile === DungeonTile.StairsUp) {
        if (dungeon.isAmbush && dungeon.ambushCleared) {
          resolveAmbushVictory(dungeon);
          return true;
        }

        goUpLevelOrExit();
        return true;
      }
      if (tile === DungeonTile.StairsDown) {
        if (dungeon.isAmbush) {
          state.log.push(t('log.ambush.noDescend'));
          return false;
        }

        goDownLevel();
        return true;
      }

      state.log.push(t('log.use.none'));
      return false;
    } else {
      const town: Town | undefined = getCurrentTown(state);
      if (!town) {
        return false;
      }
      if (isAtOrNearTownGate()) {
        state.log.push(t('log.town.exitSlip'));
        exitTownToOverworld();
        return true;
      }
      state.log.push(t('log.town.exitFind'));
      return false;
    }
  }

  if (action.kind === ActionKind.Move) {
    return tryMovePlayer(action.dx, action.dy);
  }

  return false;
}

/**
 * Attempts to pick up an item at the player position.
 * @returns True if an item was picked up.
 */
function pickupAtPlayer(): boolean {
  const dungeon: Dungeon | undefined = getCurrentDungeon(state);
  if (state.mode !== Mode.Dungeon || !dungeon) {
    state.log.push(t('log.pickup.onlyDungeon'));
    return false;
  }

  for (const it of state.items) {
    if (!it.mapRef || !it.pos) {
      continue;
    }
    if (it.mapRef.kind !== Mode.Dungeon) {
      continue;
    }
    if (it.mapRef.dungeonId !== dungeon.id) {
      continue;
    }

    if (it.pos.x === state.player.pos.x && it.pos.y === state.player.pos.y) {
      it.mapRef = undefined;
      it.pos = undefined;
      state.player.inventory.push(it.id);
      state.log.push(t('item.pickup', { name: it.name }));
      return true;
    }
  }

  state.log.push(t('log.pickup.none'));
  return false;
}

/**
 * Tries to move the player by delta in the current mode.
 * @param dx The x delta.
 * @param dy The y delta.
 * @returns True if movement occurred.
 */
function tryMovePlayer(dx: number, dy: number): boolean {
  const target: Point = add(state.player.pos, { x: dx, y: dy });

  if (state.mode === Mode.Dungeon) {
    const dungeon: Dungeon | undefined = getCurrentDungeon(state);
    if (!dungeon) {
      return false;
    }

    const blocker: Entity | undefined = isBlockedByEntity(state.entities, Mode.Dungeon, dungeon.id, undefined, target);
    if (blocker && blocker.kind === EntityKind.Monster) {
      combat.attack(state.player, blocker);
      return true;
    }

    if (!canEnterDungeonTile(dungeon, target)) {
      return false;
    }

    state.player.pos = target;
    return true;
  }

  if (state.mode === Mode.Town) {
    const town: Town | undefined = getCurrentTown(state);
    if (!town) {
      return false;
    }

    const blocker: Entity | undefined = isBlockedByEntity(state.entities, Mode.Town, undefined, town.id, target);
    if (blocker && blocker.kind === EntityKind.Monster) {
      combat.attack(state.player, blocker);
      return true;
    }

    if (!canEnterTownTile(town, target)) {
      return false;
    }

    state.player.pos = target;
    if (getTownTile(town, target.x, target.y) === TownTile.Gate) {
      state.log.push(t('log.town.passGate'));
      exitTownToOverworld();
    }
    return true;
  }

  // Overworld movement supports "run" (dx/dy can be +/-5 via shift). Move step-by-step so collisions work.
  const steps: number = Math.max(Math.abs(dx), Math.abs(dy));
  const stepX: number = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const stepY: number = dy === 0 ? 0 : dy > 0 ? 1 : -1;

  let moved: boolean = false;

  for (let i: number = 0; i < steps; i++) {
    const next: Point = add(state.player.pos, { x: stepX, y: stepY });
    if (!canEnterOverworldTile(state.overworld, next)) {
      break;
    }
    state.player.pos = next;
    moved = true;

    // Auto-walk cancels if user manually moves.
    state.destination = undefined;
    state.autoPath = undefined;

    const tile = state.overworld.getTile(next.x, next.y);
    if (tile === OverworldTile.Dungeon) {
      state.log.push(t('log.map.dungeonFound'));
    }
    if (tile === OverworldTile.Cave) {
      state.log.push(t('log.map.caveFound'));
    }
    const isTown =
      tile === OverworldTile.TownShop || tile === OverworldTile.TownTavern || tile === OverworldTile.TownSmith || tile === OverworldTile.TownHouse;
    if (isTown) {
      state.log.push(t('log.map.townFound'));
    }

    if (maybeTriggerAmbush(tile)) {
      moved = true;
      break;
    }
  }

  return moved;
}

type LevelUpGains = {
  hp: number;
  attack: number;
  defense: number;
  strength: number;
  agility: number;
  intellect: number;
};

// Handles combat resolution and experience flow.
class CombatEngine {
  private state: GameState;

  public constructor(state: GameState) {
    this.state = state;
  }

  public setState(state: GameState): void {
    this.state = state;
  }

  public getEquippedAttackBonus(entity: Entity): number {
    return this.getEquippedWeaponItem(entity)?.attackBonus ?? 0;
  }

  public getEquippedDefenseBonus(entity: Entity): number {
    return this.getEquippedArmorItem(entity)?.defenseBonus ?? 0;
  }

  public getEquippedCritChance(entity: Entity): number {
    return this.getEquippedWeaponItem(entity)?.critChance ?? 0;
  }

  public getEquippedLifesteal(entity: Entity): number {
    return this.getEquippedWeaponItem(entity)?.lifesteal ?? 0;
  }

  public getEquippedDodgeChance(entity: Entity): number {
    return this.getEquippedArmorItem(entity)?.dodgeChance ?? 0;
  }

  public getEquippedThorns(entity: Entity): number {
    return this.getEquippedArmorItem(entity)?.thorns ?? 0;
  }

  public xpToNextLevel(level: number): number {
    return 25 + (level - 1) * 12;
  }

  public awardXp(amount: number): void {
    const state: GameState = this.state;
    state.player.xp += amount;
    while (state.player.xp >= this.xpToNextLevel(state.player.level)) {
      state.player.xp -= this.xpToNextLevel(state.player.level);
      state.player.level += 1;
      const gains: LevelUpGains = this.applyLevelUpGrowth(state.player, state.playerClass);
      state.player.hp = state.player.maxHp;
      state.log.push(t('log.levelUp', { level: state.player.level }));
      canvasRenderer.triggerLevelUpEffect();
      runFxRenderLoop(1200);
      addStoryEvent(state, 'story.event.levelUp.title', 'story.event.levelUp.detail', { level: state.player.level });
      const gainParts: string[] = [t('log.levelUp.gain.hp', { value: gains.hp }), t('log.levelUp.gain.atk', { value: gains.attack })];
      if (gains.defense > 0) {
        gainParts.push(t('log.levelUp.gain.def', { value: gains.defense }));
      }
      state.log.push(
        t('log.levelUp.gains', {
          gains: gainParts.join(', '),
          str: state.player.strength ?? 0,
          agi: state.player.agility ?? 0,
          int: state.player.intellect ?? 0
        })
      );
    }
  }

  public attack(attacker: Entity, defender: Entity): void {
    const state: GameState = this.state;
    let atk: number = attacker.baseAttack + this.getEquippedAttackBonus(attacker);
    let def: number = defender.baseDefense + this.getEquippedDefenseBonus(defender);
    const originalDef: number = def;

    let damageMultiplier: number = 1;
    const suffixParts: string[] = [];
    let playerVerb: string = t('combat.verb.hit');
    let critChance: number = 0;

    if (defender.kind === EntityKind.Player) {
      const dodgeChance: number = Math.min(50, this.getEquippedDodgeChance(defender));
      if (dodgeChance > 0 && state.rng.nextInt(0, 100) < dodgeChance) {
        state.log.push(t('log.combat.dodge'));
        return;
      }
    }

    if (attacker.kind === EntityKind.Player) {
      const classType: CharacterClass = state.playerClass;
      ensureClassAttributes(attacker, classType);

      switch (classType) {
        case 'warrior': {
          const strength: number = attacker.strength ?? 0;
          atk += Math.floor(strength / 2);
          playerVerb = t('combat.verb.cleave');
          break;
        }
        case 'rogue': {
          const agility: number = attacker.agility ?? 0;
          atk += Math.floor(agility / 2);
          critChance = Math.min(60, 10 + agility * 4);
          playerVerb = t('combat.verb.stab');
          break;
        }
        case 'mage':
        default: {
          const intellect: number = attacker.intellect ?? 0;
          atk += Math.floor(intellect / 2);
          def = Math.floor(def * 0.5);
          if (def < originalDef) {
            suffixParts.push(t('combat.suffix.armorMelts'));
          }
          playerVerb = t('combat.verb.blast');
          break;
        }
      }

      critChance = Math.min(75, critChance + this.getEquippedCritChance(attacker));
      if (critChance > 0 && state.rng.nextInt(0, 100) < critChance) {
        damageMultiplier = 2;
        if (playerVerb === t('combat.verb.stab')) {
          playerVerb = t('combat.verb.backstab');
        }
        suffixParts.push(t('combat.suffix.critical'));
      }
    }

    const roll: number = state.rng.nextInt(0, 5);
    const raw: number = atk + roll;
    let dmg: number = Math.max(1, raw - def);
    dmg = Math.max(1, Math.floor(dmg * damageMultiplier));

    defender.hp -= dmg;

    if (attacker.kind === EntityKind.Player) {
      const lifesteal: number = Math.min(50, this.getEquippedLifesteal(attacker));
      if (lifesteal > 0) {
        const heal: number = Math.min(attacker.maxHp - attacker.hp, Math.floor((dmg * lifesteal) / 100));
        if (heal > 0) {
          attacker.hp += heal;
          state.log.push(t('log.combat.lifesteal', { amount: heal }));
        }
      }
    }

    if (defender.kind === EntityKind.Player && attacker.kind === EntityKind.Monster) {
      const thorns: number = Math.min(20, this.getEquippedThorns(defender));
      if (thorns > 0) {
        attacker.hp -= thorns;
        state.log.push(t('log.combat.thorns', { name: attacker.name, amount: thorns }));
        if (attacker.hp <= 0) {
          state.log.push(t('log.combat.dies', { name: attacker.name }));
          const xp: number = 6 + (attacker.baseAttack + attacker.baseDefense);
          const gold: number = 2 + state.rng.nextInt(0, 4);
          state.player.gold += gold;
          state.log.push(t('log.combat.loot', { xp, gold }));
          this.awardXp(xp);

          const currentDepth: number = state.dungeonStack[state.dungeonStack.length - 1]?.depth ?? 0;
          if (attacker.isBoss) {
            dropBossLoot(state, attacker);
          }
          recordKillForQuests(state, currentDepth, attacker.name, !!attacker.isBoss);
        }
      }
    }

    const defenderHpText: string = `(${Math.max(0, defender.hp)}/${defender.maxHp})`;
    const suffix: string = suffixParts.length > 0 ? ` (${suffixParts.join(', ')})` : '';
    if (attacker.kind === EntityKind.Player) {
      state.log.push(
        t('log.combat.player', {
          verb: playerVerb,
          target: defender.name,
          dmg,
          suffix,
          hp: defenderHpText
        })
      );
    } else if (defender.kind === EntityKind.Player) {
      state.log.push(t('log.combat.monsterHitsYou', { name: attacker.name, dmg, hp: defenderHpText }));
    } else {
      state.log.push(
        t('log.combat.monsterHitsMonster', {
          attacker: attacker.name,
          defender: defender.name,
          dmg,
          hp: defenderHpText
        })
      );
    }

    if (defender.hp <= 0) {
      if (defender.kind === EntityKind.Player) {
        state.log.push(t('log.combat.playerDeath'));
      } else {
        state.log.push(t('log.combat.dies', { name: defender.name }));
      }

      if (attacker.kind === EntityKind.Player) {
        const xp: number = 6 + (defender.baseAttack + defender.baseDefense);
        const gold: number = 2 + state.rng.nextInt(0, 4);
        state.player.gold += gold;
        state.log.push(t('log.combat.loot', { xp, gold }));
        this.awardXp(xp);

        const currentDepth: number = state.dungeonStack[state.dungeonStack.length - 1]?.depth ?? 0;
        if (defender.isBoss) {
          dropBossLoot(state, defender);
        }
        recordKillForQuests(state, currentDepth, defender.name, !!defender.isBoss);
      }
    }
  }

  public wraithDrain(attacker: Entity, defender: Entity): void {
    const state: GameState = this.state;
    const def: number = defender.baseDefense + this.getEquippedDefenseBonus(defender);
    const base: number = 2 + Math.floor(attacker.baseAttack / 2) + state.rng.nextInt(0, 3);
    const dmg: number = Math.max(1, base - Math.floor(def * 0.3));
    defender.hp -= dmg;

    const heal: number = Math.min(attacker.maxHp - attacker.hp, Math.floor(dmg * 0.6));
    if (heal > 0) {
      attacker.hp += heal;
    }

    const defenderHpText: string = `(${Math.max(0, defender.hp)}/${defender.maxHp})`;
    const healText: string = heal > 0 ? ` ${t('log.wraith.heal', { name: monsterName('wraith'), amount: heal })}` : '';
    state.log.push(t('log.wraith.drain', { name: monsterName('wraith'), dmg, hp: defenderHpText, healText }));

    if (defender.hp <= 0) {
      state.log.push(t('log.combat.playerDeath'));
    }
  }

  private getEquippedWeaponItem(entity: Entity): Item | undefined {
    const weaponId: string | undefined = entity.equipment.weaponItemId;
    if (!weaponId) {
      return undefined;
    }
    return this.state.items.find((item) => item.id === weaponId);
  }

  private getEquippedArmorItem(entity: Entity): Item | undefined {
    const armorId: string | undefined = entity.equipment.armorItemId;
    if (!armorId) {
      return undefined;
    }
    return this.state.items.find((item) => item.id === armorId);
  }

  private applyLevelUpGrowth(player: Entity, classType: CharacterClass): LevelUpGains {
    ensureClassAttributes(player, classType);

    const level: number = player.level;
    let gains: LevelUpGains;

    switch (classType) {
      case 'warrior': {
        gains = {
          hp: 6,
          attack: 2,
          defense: level % 2 === 0 ? 1 : 0,
          strength: 2,
          agility: level % 3 === 0 ? 1 : 0,
          intellect: level % 4 === 0 ? 1 : 0
        };
        break;
      }
      case 'rogue': {
        gains = {
          hp: 4,
          attack: 1,
          defense: level % 3 === 0 ? 1 : 0,
          strength: 1,
          agility: 2,
          intellect: level % 2 === 0 ? 1 : 0
        };
        break;
      }
      case 'mage':
      default: {
        gains = {
          hp: 3,
          attack: 1,
          defense: level % 4 === 0 ? 1 : 0,
          strength: level % 4 === 0 ? 1 : 0,
          agility: level % 3 === 0 ? 1 : 0,
          intellect: 2
        };
        break;
      }
    }

    player.maxHp += gains.hp;
    player.baseAttack += gains.attack;
    player.baseDefense += gains.defense;
    player.strength = (player.strength ?? 0) + gains.strength;
    player.agility = (player.agility ?? 0) + gains.agility;
    player.intellect = (player.intellect ?? 0) + gains.intellect;

    return gains;
  }
}

const combat: CombatEngine = new CombatEngine(state);

/**
 * Executes the monsters' turn in a dungeon.
 */
function monstersTurn(): void {
  if (state.mode !== Mode.Dungeon) {
    return;
  }

  const dungeon: Dungeon | undefined = getCurrentDungeon(state);
  if (!dungeon) {
    return;
  }

  let visible: Set<string> | undefined;

  if (state.useFov) {
    const fov: FieldOfView = new FieldOfView(dungeon);
    fov.decayVisibility();
    visible = fov.compute(state.player.pos, 10);
  }

  const ai: MonsterAI = new MonsterAI(dungeon, state.entities);

  for (const e of state.entities) {
    if (e.kind !== EntityKind.Monster) {
      continue;
    }
    if (e.hp <= 0) {
      continue;
    }
    if (e.mapRef.kind !== Mode.Dungeon) {
      continue;
    }
    if (e.mapRef.dungeonId !== dungeon.id) {
      continue;
    }

    if (e.glyph === 'w') {
      const cd: number = e.specialCooldown ?? 0;
      if (cd > 0) {
        e.specialCooldown = cd - 1;
      }
    }

    const dist: number = manhattan(e.pos, state.player.pos);
    const chaseOk: boolean = !state.useFov || (visible ? visible.has(`${e.pos.x},${e.pos.y}`) : true);
    if (dist <= 1) {
      const hpBefore: number = state.player.hp;
      combat.attack(e, state.player);
      if (state.player.hp < hpBefore && state.player.hp > 0) {
        maybeApplyPoisonFromAttacker(e);
      }
      continue;
    }

    if (e.glyph === 'w' && (e.specialCooldown ?? 0) === 0 && dist <= 4 && chaseOk && state.rng.nextInt(0, 100) < 20) {
      combat.wraithDrain(e, state.player);
      e.specialCooldown = 3;
      continue;
    }
    if (dist <= 12 && chaseOk) {
      const next: Point | undefined = ai.nextStep(e, state.player);
      if (!next) {
        continue;
      }

      const blocked: Entity | undefined = isBlockedByEntity(state.entities, Mode.Dungeon, dungeon.id, undefined, next);
      if (blocked) {
        continue;
      }

      if (canEnterDungeonTile(dungeon, next)) {
        e.pos = next;
      }
    }
  }
}

/**
 * Enters a dungeon or cave at the given world position.
 * @param worldPos The overworld position.
 * @param entranceKind The entrance kind.
 */
function enterDungeonAt(worldPos: Point, entranceKind: 'dungeon' | 'cave'): void {
  const layout: DungeonLayout = entranceKind === 'cave' ? DungeonLayout.Caves : DungeonLayout.Rooms;
  const baseId: string =
    entranceKind === 'cave'
      ? caveBaseIdFromWorldPos(state.worldSeed, worldPos.x, worldPos.y)
      : dungeonBaseIdFromWorldPos(state.worldSeed, worldPos.x, worldPos.y);
  const depth: number = 0;

  const dungeon: Dungeon = ensureDungeonLevel(state, baseId, depth, worldPos, layout);

  state.dungeonStack = [{ baseId, depth, entranceWorldPos: { x: worldPos.x, y: worldPos.y }, layout }];
  state.mode = Mode.Dungeon;
  state.player.mapRef = { kind: Mode.Dungeon, dungeonId: dungeon.id };
  state.player.pos = { x: dungeon.stairsUp.x, y: dungeon.stairsUp.y };

  state.log.push(entranceKind === 'cave' ? t('log.enter.cave') : t('log.enter.dungeon'));
  addStoryEvent(state, 'story.event.enterDungeon.title', 'story.event.enterDungeon.detail', { depth: 0 });
  triggerDungeonBanner(depth);
}

function ambushThemeForTile(tile: OverworldTile): DungeonTheme {
  switch (tile) {
    case OverworldTile.Forest:
    case OverworldTile.Grass:
    case OverworldTile.Cave:
      return DungeonTheme.Caves;
    case OverworldTile.Mountain:
    case OverworldTile.MountainSnow:
    case OverworldTile.Dungeon:
      return DungeonTheme.Crypt;
    case OverworldTile.Road:
      return DungeonTheme.Ruins;
    default:
      return DungeonTheme.Caves;
  }
}

function startAmbushEncounter(tile: OverworldTile, origin: Point): void {
  const baseHash: number = hash2D(state.worldSeed, origin.x, origin.y);
  const seed: number = (state.rng.nextInt(0, 0x7fffffff) ^ baseHash) | 0;
  const ambushId: string = `ambush_${origin.x}_${origin.y}_${state.turnCounter}_${seed & 0xffff}`;
  const depth: number = Math.max(1, Math.floor((state.player.level + 1) / 2));
  const theme: DungeonTheme = ambushThemeForTile(tile);
  const arena: Dungeon = generateAmbushArena({ dungeonId: ambushId, baseId: ambushId, depth, seed, theme });

  state.dungeons.set(ambushId, arena);
  spawnAmbushMonsters(state, arena, seed, state.player.level);

  state.dungeonStack = [
    {
      baseId: ambushId,
      depth: 0,
      entranceWorldPos: { x: origin.x, y: origin.y },
      layout: DungeonLayout.Rooms,
      isAmbush: true
    }
  ];
  state.mode = Mode.Dungeon;
  state.destination = undefined;
  state.autoPath = undefined;
  state.player.mapRef = { kind: Mode.Dungeon, dungeonId: ambushId };
  state.player.pos = { x: arena.stairsUp.x, y: arena.stairsUp.y };

  state.log.push(t('log.ambush.start'));
  triggerAmbushBanner();
}

function maybeTriggerAmbush(tile: OverworldTile): boolean {
  if (state.mode !== Mode.Overworld) {
    return false;
  }
  if (
    tile === OverworldTile.Town ||
    tile === OverworldTile.TownShop ||
    tile === OverworldTile.TownTavern ||
    tile === OverworldTile.TownSmith ||
    tile === OverworldTile.TownHouse
  ) {
    return false;
  }
  if (tile === OverworldTile.Water || tile === OverworldTile.WaterDeep) {
    return false;
  }

  let chance: number = 0;
  if (tile === OverworldTile.Forest) {
    chance = 6;
  } else if (tile === OverworldTile.Grass) {
    chance = 3;
  } else if (tile === OverworldTile.Road) {
    chance = 1;
  } else if (tile === OverworldTile.Cave || tile === OverworldTile.Dungeon) {
    chance = 0;
  } else {
    chance = 2;
  }

  if (chance <= 0) {
    return false;
  }

  if (state.rng.nextInt(0, 100) < chance) {
    startAmbushEncounter(tile, { x: state.player.pos.x, y: state.player.pos.y });
    return true;
  }

  return false;
}

/**
 * Enters a town at the given world position.
 * @param worldPos The overworld position.
 */
function enterTownAt(worldPos: Point): void {
  const center: Point = state.overworld.getTownCenter(worldPos.x, worldPos.y) ?? worldPos;
  const town: Town = ensureTownInterior(state, center);
  state.mode = Mode.Town;
  state.currentTownId = town.id;
  state.townReturnPos = { x: worldPos.x, y: worldPos.y };
  state.destination = undefined;
  state.autoPath = undefined;
  state.player.mapRef = { kind: Mode.Town, townId: town.id };
  state.player.pos = { x: town.entrance.x, y: town.entrance.y };
  state.log.push(t('log.enter.town'));
  addStoryEvent(state, 'story.event.enterTown.title', 'story.event.enterTown.detail', { townId: town.id });
}

/**
 * Exits the town back to the overworld.
 */
function exitTownToOverworld(): void {
  const returnPos: Point = state.townReturnPos ?? { x: 0, y: 0 };
  state.mode = Mode.Overworld;
  state.player.mapRef = { kind: Mode.Overworld };
  state.player.pos = { x: returnPos.x, y: returnPos.y };
  state.currentTownId = undefined;
  state.townReturnPos = undefined;
  state.log.push(t('log.enter.overworld'));
  addStoryEvent(state, 'story.event.returnOverworld.title', 'story.event.returnOverworld.detail');
}

/**
 * Descends one dungeon level.
 */
function goDownLevel(): void {
  const current: DungeonStackFrame | undefined = state.dungeonStack[state.dungeonStack.length - 1];
  if (!current) {
    return;
  }

  const nextDepth: number = current.depth + 1;
  const dungeon: Dungeon = ensureDungeonLevel(state, current.baseId, nextDepth, current.entranceWorldPos, current.layout);

  state.dungeonStack.push({ baseId: current.baseId, depth: nextDepth, entranceWorldPos: current.entranceWorldPos, layout: current.layout });
  state.player.mapRef = { kind: Mode.Dungeon, dungeonId: dungeon.id };
  state.player.pos = { x: dungeon.stairsUp.x, y: dungeon.stairsUp.y };
  state.log.push(t('log.dungeon.descend', { depth: nextDepth, theme: t(`theme.${dungeon.theme}`) }));
  addStoryEvent(state, 'story.event.descend.title', 'story.event.descend.detail', { depth: nextDepth, theme: t(`theme.${dungeon.theme}`) });
  recordDepthForQuests(state, nextDepth);
  triggerDungeonBanner(nextDepth);
}

/**
 * Ascends one dungeon level or exits to overworld.
 */
function goUpLevelOrExit(): void {
  if (state.dungeonStack.length <= 1) {
    const top: DungeonStackFrame | undefined = state.dungeonStack[0];
    if (!top) {
      return;
    }

    if (top.isAmbush) {
      cleanupAmbushState(top.baseId);
    }

    state.mode = Mode.Overworld;
    state.player.mapRef = { kind: Mode.Overworld };
    state.player.pos = { x: top.entranceWorldPos.x, y: top.entranceWorldPos.y };
    state.dungeonStack = [];
    state.destination = undefined;
    state.autoPath = undefined;
    state.log.push(t('log.enter.overworld'));
    addStoryEvent(state, 'story.event.returnOverworld.title', 'story.event.returnOverworld.detail');
    return;
  }

  state.dungeonStack.pop();
  const prev: DungeonStackFrame = state.dungeonStack[state.dungeonStack.length - 1];
  const dungeonId: string = dungeonLevelId(prev.baseId, prev.depth);
  const dungeon: Dungeon | undefined = state.dungeons.get(dungeonId);
  if (!dungeon) {
    return;
  }

  state.player.mapRef = { kind: Mode.Dungeon, dungeonId };
  state.player.pos = { x: dungeon.stairsDown.x, y: dungeon.stairsDown.y };
  state.log.push(t('log.dungeon.ascend', { depth: prev.depth }));
  addStoryEvent(state, 'story.event.ascend.title', 'story.event.ascend.detail', { depth: prev.depth });
  triggerDungeonBanner(prev.depth);
}

/**
 * Sets an auto-walk destination on the overworld.
 * @param dest The destination point.
 */
function setDestination(dest: Point): void {
  if (state.mode !== Mode.Overworld) {
    return;
  }

  const path = findOverworldPath(state.player.pos, dest);

  if (!path || path.length < 2) {
    state.log.push(t('log.path.none'));
    state.destination = undefined;
    state.autoPath = undefined;
    return;
  }

  state.destination = dest;
  state.autoPath = path;
  state.log.push(t('log.autoWalk.set', { x: dest.x, y: dest.y }));
}

function findOverworldPath(from: Point, to: Point): Point[] | undefined {
  return overworldNavigator.findPath(from, to, {
    preferRoads: state.preferRoads,
    maxNodes: 20000
  });
}

function togglePathPreference(): void {
  state.preferRoads = !state.preferRoads;
  state.log.push(state.preferRoads ? t('log.autoWalk.mode.roads') : t('log.autoWalk.mode.direct'));

  if (state.mode === Mode.Overworld && state.destination) {
    const refreshed: Point[] | undefined = findOverworldPath(state.player.pos, state.destination);
    if (!refreshed || refreshed.length < 2) {
      state.log.push(t('log.path.none'));
      state.destination = undefined;
      state.autoPath = undefined;
    } else {
      state.autoPath = refreshed;
    }
  }

  render();
}

function updatePathPreferenceUi(): void {
  btnPathMode.textContent = state.preferRoads ? t('ui.pathMode.roads') : t('ui.pathMode.direct');
  btnPathMode.setAttribute('aria-pressed', state.preferRoads ? 'true' : 'false');
}

/**
 * Syncs renderer UI visibility with the chosen renderer.
 */
function syncRendererUi(): void {
  asciiEl.style.display = 'none';
  canvasWrap.style.display = 'block';
}

let fxRenderUntil: number = 0;
let fxRenderHandle: number = 0;

/**
 * Runs a temporary render loop for time-based FX.
 * @param durationMs The duration in milliseconds.
 */
function runFxRenderLoop(durationMs: number): void {
  fxRenderUntil = Math.max(fxRenderUntil, performance.now() + durationMs);
  if (fxRenderHandle) {
    return;
  }

  const tick = (): void => {
    if (performance.now() >= fxRenderUntil) {
      fxRenderHandle = 0;
      render();
      return;
    }

    render();
    fxRenderHandle = requestAnimationFrame(tick);
  };

  fxRenderHandle = requestAnimationFrame(tick);
}

/**
 * Triggers the dungeon depth banner.
 * @param depth The dungeon depth.
 */
function triggerDungeonBanner(depth: number): void {
  canvasRenderer.triggerBannerEffect(t('ui.fx.dungeonDepth', { depth: depth + 1 }), 1200);
  runFxRenderLoop(1200);
}

function triggerAmbushBanner(): void {
  canvasRenderer.triggerBannerEffect(t('ui.fx.ambush'), 1400);
  runFxRenderLoop(1400);
}

/**
 * Renders the full game UI and scene.
 */
function render(): void {
  const dungeon: Dungeon | undefined = getCurrentDungeon(state);
  const town: Town | undefined = getCurrentTown(state);

  modePill.textContent =
    state.mode === Mode.Overworld
      ? t('ui.mode.overworld')
      : state.mode === Mode.Town
        ? t('ui.mode.town')
        : t('ui.mode.dungeon', {
            depth: state.dungeonStack[state.dungeonStack.length - 1]?.depth ?? 0,
            theme: dungeon?.theme ? t(`theme.${dungeon.theme}`) : '?'
          });

  renderPill.textContent = t('ui.render.pill', { fov: state.useFov ? t('ui.fov.on') : t('ui.fov.off') });

  if (state.mode === Mode.Dungeon && dungeon && state.useFov) {
    const fov: FieldOfView = new FieldOfView(dungeon);
    fov.decayVisibility();
    fov.compute(state.player.pos, 10);
  }

  const classInfo: ClassConfig = CLASS_CONFIG[state.playerClass];
  const atk: number = state.player.baseAttack + combat.getEquippedAttackBonus(state.player);
  const def: number = state.player.baseDefense + combat.getEquippedDefenseBonus(state.player);
  const str: number = state.player.strength ?? 0;
  const agi: number = state.player.agility ?? 0;
  const intl: number = state.player.intellect ?? 0;
  const nextXp: number = combat.xpToNextLevel(state.player.level);
  const hpRatio: number = Math.max(0, Math.min(1, state.player.hp / Math.max(1, state.player.maxHp)));
  const xpRatio: number = Math.max(0, Math.min(1, state.player.xp / Math.max(1, nextXp)));

  const statusText: string = (state.player.statusEffects ?? []).map((e) => `${t(`status.${e.kind}`)}:${e.remainingTurns}`).join(', ') || t('ui.none');

  hudBarEl.innerHTML = `
    <div class="hudBarRow">
      <div class="hudBarItem">
        <div class="hudBarLabel">${escapeHtml(t('ui.stats.hp', { hp: state.player.hp, maxHp: state.player.maxHp }))}</div>
        <div class="hudBarTrack">
          <div class="hudBarFill hp" style="width: ${Math.round(hpRatio * 100)}%"></div>
          <div class="hudBarText">${escapeHtml(t('ui.stats.level', { level: state.player.level }))}</div>
        </div>
      </div>
      <div class="hudBarItem">
        <div class="hudBarLabel">${escapeHtml(t('ui.stats.xp', { xp: state.player.xp, next: nextXp }))}</div>
        <div class="hudBarTrack">
          <div class="hudBarFill xp" style="width: ${Math.round(xpRatio * 100)}%"></div>
          <div class="hudBarText">${escapeHtml(t('ui.stats.gold', { gold: state.player.gold }))}</div>
        </div>
      </div>
    </div>
  `;

  renderMinimap();

  statsEl.innerHTML = `
    <div class="kv"><div><b>${escapeHtml(state.player.name)}</b> <span class="muted">${escapeHtml(
      t('ui.stats.level', { level: state.player.level })
    )}</span></div><div>${escapeHtml(t('ui.stats.hp', { hp: state.player.hp, maxHp: state.player.maxHp }))}</div></div>
    <div class="kv small"><div>${escapeHtml(t('ui.stats.class', { className: classInfo.name }))}</div><div>${escapeHtml(
      t('ui.stats.statsLine', { str, agi, int: intl })
    )}</div></div>
    <div class="kv small"><div>${escapeHtml(t('ui.stats.atk', { atk }))}</div><div>${escapeHtml(t('ui.stats.def', { def }))}</div></div>
    <div class="kv small"><div>${escapeHtml(t('ui.stats.xp', { xp: state.player.xp, next: nextXp }))}</div><div>${escapeHtml(
      t('ui.stats.gold', { gold: state.player.gold })
    )}</div></div>
    <div class="kv small"><div>${escapeHtml(t('ui.stats.pos', { x: state.player.pos.x, y: state.player.pos.y }))}</div><div class="muted">${escapeHtml(
      t('ui.stats.turn', { turn: state.turnCounter })
    )}</div></div>
    <div class="kv small"><div class="muted">${escapeHtml(t('ui.stats.status', { status: statusText }))}</div><div class="muted">${escapeHtml(
      t('ui.stats.seed', { seed: state.worldSeed })
    )}</div></div>
  `;

  const townPos: Point | undefined = getActiveTownWorldPos();
  const activeShop: Shop | undefined = townPos ? ensureShopForTown(state, townPos) : undefined;
  if (activeShop) {
    if (townPos) {
      ensureQuestForTown(state, townPos);
    }
    maybeRestockShop(state, activeShop);
  }
  const shopPricing = activeShop ? buildShopPricing(state, activeShop) : undefined;
  const activeTownId: string | undefined = getActiveTownId();
  panelEl.innerHTML = renderPanelHtml({
    mode: state.activePanel,
    player: state.player,
    items: state.items,
    activeShop,
    canShop: isStandingOnTown(),
    quests: state.quests,
    story: state.story,
    activeTownId,
    shopCategory: state.shopCategory,
    shopEconomy: shopPricing?.economy,
    shopBuyPrices: shopPricing?.buyPrices,
    shopSellPrices: shopPricing?.sellPrices
  });

  logEl.innerHTML = state.log
    .all()
    .slice(0, 160)
    .map((m) => `<div>• ${escapeHtml(m.text)}</div>`)
    .join('');

  todoListEl.innerHTML = `
    <div>• ${escapeHtml(t('ui.todo.item.towns'))}</div>
    <div>• ${escapeHtml(t('ui.todo.item.classes'))}</div>
    <div>• ${escapeHtml(t('ui.todo.item.potions'))}</div>
    <div>• ${escapeHtml(t('ui.todo.item.translations'))}</div>
    <div>• ${escapeHtml(t('ui.todo.item.stats'))}</div>
    <div>• ${escapeHtml(t('ui.todo.item.ui'))}</div>
    <div>• ${escapeHtml(t('ui.todo.item.graphics'))}</div>
  `;

  asciiEl.style.display = 'none';
  canvasWrap.style.display = 'block';
  const view = getPixiViewSize();
  canvasRenderer.render(
    {
      mode: state.mode,
      overworld: state.overworld,
      dungeon,
      town,
      player: state.player,
      entities: state.entities,
      items: state.items,
      useFov: state.useFov
    },
    view.w,
    view.h,
    state.rendererMode
  );
}

/**
 * Renders the minimap overlay.
 */
function renderMinimap(): void {
  updatePathPreferenceUi();

  if (!minimapCtx) {
    return;
  }

  minimapWrap.classList.toggle('displayNone', !state.mapOpen);
  if (!state.mapOpen) {
    return;
  }

  const ctx = minimapCtx;
  const tileSize: number = 4;
  const viewW: number = Math.floor(minimapCanvas.width / tileSize);
  const viewH: number = Math.floor(minimapCanvas.height / tileSize);
  const halfW: number = Math.floor(viewW / 2);
  const halfH: number = Math.floor(viewH / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#140f0b';
  ctx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

  if (state.mode !== Mode.Overworld) {
    ctx.fillStyle = '#c7b79b';
    ctx.font = '14px Georgia, Times New Roman, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('ui.map.unavailable'), minimapCanvas.width / 2, minimapCanvas.height / 2);
    return;
  }

  for (let y: number = -halfH; y <= halfH; y += 1) {
    for (let x: number = -halfW; x <= halfW; x += 1) {
      const wx: number = state.player.pos.x + x;
      const wy: number = state.player.pos.y + y;
      const tile = state.overworld.getTile(wx, wy);
      ctx.fillStyle = minimapColor(tile);
      ctx.fillRect((x + halfW) * tileSize, (y + halfH) * tileSize, tileSize, tileSize);
    }
  }

  ctx.fillStyle = '#f3e8d3';
  ctx.fillRect(halfW * tileSize, halfH * tileSize, tileSize, tileSize);
}

/**
 * Returns the minimap color for a tile.
 * @param tile The overworld tile key.
 * @returns The hex color.
 */
function minimapColor(tile: string): string {
  switch (tile) {
    case 'water':
      return '#2b4b6b';
    case 'water_deep':
      return '#0a2b4d';
    case 'forest':
      return '#1f3b2b';
    case 'grass':
      return '#2f5a34';
    case 'mountain':
      return '#5a4a3b';
    case 'mountain_snow':
      return '#d9dfe6';
    case 'road':
      return '#8a6b44';
    case 'cave':
      return '#6a5a4a';
    case 'dungeon':
      return '#9b4a3a';
    case 'town':
    case 'town_shop':
    case 'town_tavern':
    case 'town_smith':
    case 'town_house':
      return '#c9a06b';
    default:
      return '#2a241b';
  }
}

// Panel actions (inventory/shop buttons)
panelEl.addEventListener('click', (e: MouseEvent) => {
  const target: HTMLElement | null = e.target as HTMLElement;
  if (!target) {
    return;
  }
  const act: string | null = target.getAttribute('data-act');
  const itemId: string | null = target.getAttribute('data-item');
  const questId: string | null = target.getAttribute('data-quest');
  const rewardId: string | null = target.getAttribute('data-reward');
  if (!act) {
    return;
  }

  if (act === 'use') {
    if (!itemId) {
      return;
    }
    usePotion(itemId);
    render();
    return;
  }
  if (act === 'equipWeapon') {
    if (!itemId) {
      return;
    }
    equipWeapon(itemId);
    render();
    return;
  }
  if (act === 'equipArmor') {
    if (!itemId) {
      return;
    }
    equipArmor(itemId);
    render();
    return;
  }
  if (act === 'drop') {
    if (!itemId) {
      return;
    }
    dropItem(itemId);
    render();
    return;
  }
  if (act === 'buy') {
    if (!itemId) {
      return;
    }
    buyItem(itemId);
    render();
    return;
  }
  if (act === 'sell') {
    if (!itemId) {
      return;
    }
    sellItem(itemId);
    render();
    return;
  }
  if (act === 'shopCat') {
    const cat: string | null = target.getAttribute('data-cat');
    let nextCategory: ShopSpecialty | undefined;
    switch (cat) {
      case ShopSpecialty.All:
        nextCategory = ShopSpecialty.All;
        break;
      case ShopSpecialty.Potion:
        nextCategory = ShopSpecialty.Potion;
        break;
      case ShopSpecialty.Weapon:
        nextCategory = ShopSpecialty.Weapon;
        break;
      case ShopSpecialty.Armor:
        nextCategory = ShopSpecialty.Armor;
        break;
      default:
        nextCategory = undefined;
    }
    if (nextCategory) {
      state.shopCategory = nextCategory;
    }
    render();
    return;
  }
  if (act === 'turnIn') {
    if (questId) {
      turnInQuest(questId);
    }
    render();
    return;
  }
  if (act === 'chooseReward') {
    if (questId && rewardId) {
      chooseQuestReward(questId, rewardId);
    }
    render();
    return;
  }
});

/**
 * Consumes a potion from the inventory.
 * @param itemId The potion item id.
 */
function usePotion(itemId: string): void {
  const it: Item | undefined = state.items.find((x) => x.id === itemId);
  if (!it || it.kind !== ItemKind.Potion) {
    return;
  }
  if (!state.player.inventory.includes(itemId)) {
    return;
  }

  const heal: number = it.healAmount ?? 8;
  const before: number = state.player.hp;
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + heal);

  state.player.inventory = state.player.inventory.filter((x) => x !== itemId);
  state.items = state.items.filter((x) => x.id !== itemId);

  state.log.push(t('item.drink', { name: it.name, amount: state.player.hp - before }));
}

/**
 * Equips a weapon by item id.
 * @param itemId The weapon item id.
 */
function equipWeapon(itemId: string): void {
  const it: Item | undefined = state.items.find((x) => x.id === itemId);
  if (!it || it.kind !== ItemKind.Weapon) {
    return;
  }
  if (!state.player.inventory.includes(itemId)) {
    return;
  }
  state.player.equipment.weaponItemId = itemId;
  state.log.push(t('item.equip.weapon', { name: it.name }));
}

/**
 * Equips an armor item by id.
 * @param itemId The armor item id.
 */
function equipArmor(itemId: string): void {
  const it: Item | undefined = state.items.find((x) => x.id === itemId);
  if (!it || it.kind !== ItemKind.Armor) {
    return;
  }
  if (!state.player.inventory.includes(itemId)) {
    return;
  }
  state.player.equipment.armorItemId = itemId;
  state.log.push(t('item.equip.armor', { name: it.name }));
}

/**
 * Drops or discards an item.
 * @param itemId The item id.
 */
function dropItem(itemId: string): void {
  const it: Item | undefined = state.items.find((x) => x.id === itemId);
  if (!it) {
    return;
  }
  if (!state.player.inventory.includes(itemId)) {
    return;
  }

  // Drop only if in dungeon; else just discard (simple for now)
  if (state.mode === Mode.Dungeon) {
    const dungeon: Dungeon | undefined = getCurrentDungeon(state);
    if (dungeon) {
      it.mapRef = { kind: Mode.Dungeon, dungeonId: dungeon.id };
      it.pos = { x: state.player.pos.x, y: state.player.pos.y };
      state.log.push(t('item.drop', { name: it.name }));
    }
  } else {
    state.log.push(t('item.discard', { name: it.name }));
    state.items = state.items.filter((x) => x.id !== itemId);
  }

  state.player.inventory = state.player.inventory.filter((x) => x !== itemId);
  if (state.player.equipment.weaponItemId === itemId) {
    state.player.equipment.weaponItemId = undefined;
  }
  if (state.player.equipment.armorItemId === itemId) {
    state.player.equipment.armorItemId = undefined;
  }
}

/**
 * Purchases an item from the shop.
 * @param itemId The item id.
 */
function buyItem(itemId: string): void {
  if (!canOpenShopHere()) {
    state.log.push(t('log.shop.needBuy'));
    return;
  }
  const it: Item | undefined = state.items.find((x) => x.id === itemId);
  if (!it) {
    return;
  }

  const townPos: Point | undefined = getActiveTownWorldPos();
  const activeShop: Shop | undefined = townPos ? ensureShopForTown(state, townPos) : undefined;
  if (!activeShop) {
    return;
  }
  const economy: import('./core/types').ShopEconomy = getShopEconomy(state, activeShop);
  const price: number = getShopBuyPrice(activeShop, it, economy);
  if (state.player.gold < price) {
    state.log.push(t('log.shop.notEnoughGold'));
    return;
  }

  state.player.gold -= price;
  state.player.inventory.push(it.id);
  state.log.push(t('item.bought', { name: it.name, price }));
}

/**
 * Sells an item to the shop.
 * @param itemId The item id.
 */
function sellItem(itemId: string): void {
  if (!canOpenShopHere()) {
    state.log.push(t('log.shop.needSell'));
    return;
  }
  const it: Item | undefined = state.items.find((x) => x.id === itemId);
  if (!it) {
    return;
  }
  if (!state.player.inventory.includes(itemId)) {
    return;
  }

  const townPos: Point | undefined = getActiveTownWorldPos();
  const activeShop: Shop | undefined = townPos ? ensureShopForTown(state, townPos) : undefined;
  if (!activeShop) {
    return;
  }
  const economy: import('./core/types').ShopEconomy = getShopEconomy(state, activeShop);
  const price: number = getShopSellPrice(activeShop, it, economy);
  state.player.gold += price;

  state.player.inventory = state.player.inventory.filter((x) => x !== itemId);
  if (state.player.equipment.weaponItemId === itemId) {
    state.player.equipment.weaponItemId = undefined;
  }
  if (state.player.equipment.armorItemId === itemId) {
    state.player.equipment.armorItemId = undefined;
  }

  // Keep item definition in items list so it can be re-sold later? We'll remove it to simplify.
  state.items = state.items.filter((x) => x.id !== itemId);

  state.log.push(t('item.sold', { name: it.name, price }));
}

/**
 * Turns in a completed quest.
 * @param questId The quest id.
 */
function turnInQuest(questId: string): void {
  const townId: string | undefined = getActiveTownId();
  if (!townId) {
    state.log.push(t('log.quest.needTown'));
    return;
  }

  const q = state.quests.find((x) => x.id === questId);
  if (!q) {
    return;
  }
  if (q.townId !== townId) {
    state.log.push(t('log.quest.otherTown'));
    return;
  }
  if (q.turnedIn) {
    return;
  }
  if (!q.completed) {
    state.log.push(t('log.quest.notComplete'));
    return;
  }
  if (q.rewardItemIds && !q.rewardItemId) {
    state.log.push(t('log.quest.chooseReward'));
    return;
  }

  q.turnedIn = true;
  state.player.gold += q.rewardGold;
  combat.awardXp(q.rewardXp);
  if (q.rewardItemId) {
    const rewardItem: Item | undefined = state.items.find((it) => it.id === q.rewardItemId);
    if (rewardItem) {
      if (!state.player.inventory.includes(rewardItem.id)) {
        state.player.inventory.push(rewardItem.id);
      }
      state.log.push(t('log.quest.reward', { name: rewardItem.name }));
    } else {
      state.log.push(t('log.quest.rewardMissing'));
    }
  }
  state.log.push(t('log.quest.turnedIn', { gold: q.rewardGold, xp: q.rewardXp }));
  addStoryEvent(state, 'story.event.quest.title', 'story.event.quest.detail', { desc: q.description });
}

/**
 * Chooses a reward for a quest.
 * @param questId The quest id.
 * @param rewardId The reward item id.
 */
function chooseQuestReward(questId: string, rewardId: string): void {
  const q = state.quests.find((x) => x.id === questId);
  if (!q) {
    return;
  }
  if (q.turnedIn || !q.completed) {
    return;
  }
  if (!q.rewardItemIds || !q.rewardItemIds.includes(rewardId)) {
    return;
  }
  q.rewardItemId = rewardId;
  const rewardItem: Item | undefined = state.items.find((it) => it.id === rewardId);
  if (rewardItem) {
    state.log.push(t('log.quest.rewardChosen', { name: rewardItem.name }));
  } else {
    state.log.push(t('log.quest.rewardChosenGeneric'));
  }
}

/**
 * Escapes HTML special characters.
 * @param s The raw string.
 * @returns The escaped string.
 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Maps a keyboard event to a game action.
 * @param e The keyboard event.
 * @returns The action, or undefined.
 */
function keyToAction(e: KeyboardEvent): Action | undefined {
  if (e.key === 'r' || e.key === 'R') {
    return { kind: ActionKind.ToggleRenderer };
  }
  if (e.key === 'f' || e.key === 'F') {
    return { kind: ActionKind.ToggleFov };
  }
  if (e.key === '?') {
    return { kind: ActionKind.Help };
  }

  if (e.key === 'p' || e.key === 'P') {
    return { kind: ActionKind.Save };
  }
  if (e.key === 'o' || e.key === 'O') {
    return { kind: ActionKind.Load };
  }

  if (e.key === 'i' || e.key === 'I') {
    return { kind: ActionKind.ToggleInventory };
  }
  if (e.key === 'b' || e.key === 'B') {
    return { kind: ActionKind.ToggleShop };
  }
  if (e.key === 'q' || e.key === 'Q') {
    return { kind: ActionKind.ToggleQuest };
  }
  if (e.key === 'h' || e.key === 'H') {
    return { kind: ActionKind.ToggleStory };
  }
  if (e.key === 'm' || e.key === 'M') {
    return { kind: ActionKind.ToggleMap };
  }

  if (e.key === 'g' || e.key === 'G' || e.key === ',') {
    return { kind: ActionKind.Pickup };
  }

  if (e.key === 'Enter') {
    return { kind: ActionKind.Use };
  }
  if (e.key === 'c' || e.key === 'C') {
    return { kind: ActionKind.CancelAuto };
  }
  if (e.key === ' ') {
    return { kind: ActionKind.Wait };
  }

  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
    return { kind: ActionKind.Move, dx: 0, dy: -1 * (e.shiftKey ? 5 : 1) };
  }
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
    return { kind: ActionKind.Move, dx: 0, dy: 1 * (e.shiftKey ? 5 : 1) };
  }
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    return { kind: ActionKind.Move, dx: -1 * (e.shiftKey ? 5 : 1), dy: 0 };
  }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    return { kind: ActionKind.Move, dx: 1 * (e.shiftKey ? 5 : 1), dy: 0 };
  }

  return undefined;
}

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (isClassModalVisible()) {
    if (e.key === 'o' || e.key === 'O') {
      e.preventDefault();
      doLoad();
      syncRendererUi();
      render();
    }
    return;
  }
  const a: Action | undefined = keyToAction(e);
  if (!a) {
    return;
  }
  e.preventDefault();
  handleAction(a);
});

btnCanvas.addEventListener('click', () => {
  state.rendererMode = PixiRenderMode.Canvas;
  syncRendererUi();
  render();
});

btnNewSeed.addEventListener('click', () => {
  pendingSeed = Date.now() & 0xffffffff;
  state.log.push(t('log.newSeed', { seed: pendingSeed }));
  showClassModal();
});

btnSave.addEventListener('click', () => {
  doSave();
  render();
});
btnLoad.addEventListener('click', () => {
  doLoad();
  syncRendererUi();
  render();
});

btnInv.addEventListener('click', () => {
  state.activePanel = state.activePanel === PanelMode.Inventory ? PanelMode.None : PanelMode.Inventory;
  render();
});
btnShop.addEventListener('click', () => {
  state.activePanel = state.activePanel === PanelMode.Shop ? PanelMode.None : PanelMode.Shop;
  if (state.activePanel === PanelMode.Shop && isStandingOnTown()) {
    ensureShopForTown(state, state.player.pos);
  }
  render();
});

btnStory.addEventListener('click', () => {
  state.activePanel = state.activePanel === PanelMode.Story ? PanelMode.None : PanelMode.Story;
  render();
});

btnMap.addEventListener('click', () => {
  handleAction({ kind: ActionKind.ToggleMap });
});

btnPathMode.addEventListener('click', () => {
  togglePathPreference();
});

classButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const choice = btn.dataset.class as CharacterClass | undefined;
    if (!choice) {
      return;
    }
    startNewRun(choice);
  });
});

nameInput.addEventListener('input', () => {
  const trimmed: string = nameInput.value.trim();
  if (!trimmed) {
    nameInput.classList.remove('invalid');
    nameErrorEl.textContent = '';
    return;
  }
  const validation = validatePlayerName(nameInput.value);
  if (validation.ok) {
    nameInput.classList.remove('invalid');
    nameErrorEl.textContent = '';
  } else {
    nameInput.classList.add('invalid');
    nameErrorEl.textContent = validation.message;
  }
});

btnNameRandom.addEventListener('click', () => {
  const name: string = generateRandomName();
  nameInput.value = name;
  pendingName = name;
  nameInput.classList.remove('invalid');
  nameErrorEl.textContent = '';
  nameInput.focus();
  nameInput.select();
});

genderRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    if (radio.checked) {
      pendingGender = radio.value as Gender;
    }
  });
});

btnLoadFromModal.addEventListener('click', () => {
  doLoad();
  syncRendererUi();
  render();
});

btnExportSave.addEventListener('click', () => {
  exportSaveJson();
  render();
});

btnImportSave.addEventListener('click', () => {
  importSaveJson();
  syncRendererUi();
  render();
});

btnSaveModalClose.addEventListener('click', () => {
  closeSaveModal();
});

btnSaveModalCopy.addEventListener('click', () => {
  copySaveJson();
});

btnSaveModalLoad.addEventListener('click', () => {
  loadSaveFromModal();
  syncRendererUi();
  render();
});

saveModal.addEventListener('click', (e: MouseEvent) => {
  if (e.target === saveModal) {
    closeSaveModal();
  }
});

/**
 * Builds the save data object from current state.
 * @returns The save data.
 */
function buildSaveData(): SaveDataV3 {
  const dungeons: Dungeon[] = [...state.dungeons.values()];
  const shops: Shop[] = [...state.shops.values()];

  return {
    version: 3,
    worldSeed: state.worldSeed,
    mode: state.mode,
    playerId: state.player.id,
    playerClass: state.playerClass,
    playerGender: state.player.gender,
    story: state.story,
    entities: state.entities,
    items: state.items,
    dungeons,
    shops,
    entranceReturnPos: state.dungeonStack[0]?.entranceWorldPos,
    townReturnPos: state.townReturnPos,
    townId: state.currentTownId,
    activePanel: state.activePanel,
    turnCounter: state.turnCounter,
    quests: state.quests,
    preferRoads: state.preferRoads
  };
}

/**
 * Saves current state to local storage.
 */
function doSave(): void {
  const data: SaveDataV3 = buildSaveData();
  saveToLocalStorage(data);
  state.log.push(t('log.saved'));
}

/**
 * Applies loaded save data to state.
 * @param data The loaded save data.
 * @returns True if applied successfully.
 */
function applyLoadedSave(data: SaveDataV3): boolean {
  const rng: Rng = new Rng(data.worldSeed);
  const overworld: Overworld = new Overworld(data.worldSeed);
  const resolvedMode: Mode = data.mode === Mode.Town && (!data.townId || !data.townReturnPos) ? Mode.Overworld : data.mode;

  const dungeonsMap: Map<string, Dungeon> = new Map<string, Dungeon>();
  for (const d of data.dungeons) dungeonsMap.set(d.id, d);

  const shopsMap: Map<string, Shop> = new Map<string, Shop>();
  for (const s of data.shops) shopsMap.set(s.id, s);

  const townsMap: Map<string, Town> = new Map<string, Town>();
  if (resolvedMode === Mode.Town && data.townId && data.townReturnPos) {
    const center: Point | undefined = overworld.getTownCenter(data.townReturnPos.x, data.townReturnPos.y);
    if (center) {
      const seed: number = townSeedFromWorldPos(data.worldSeed, center.x, center.y);
      const town: Town = generateTown(data.townId, seed);
      townsMap.set(data.townId, town);
    }
  }

  const player: Entity | undefined = data.entities.find((e) => e.id === data.playerId);
  if (player && !player.statusEffects) {
    player.statusEffects = [];
  }
  if (!player) {
    state.log.push(t('log.load.missingPlayer'));
    return false;
  }

  const loadedClass: CharacterClass = data.playerClass ?? player.classType ?? CharacterClass.Warrior;
  const loadedGender: Gender = data.playerGender ?? player.gender ?? Gender.Female;
  ensureClassAttributes(player, loadedClass);
  player.gender = loadedGender;

  const loadedStory: CharacterStory = data.story ?? buildStory(rng, loadedClass, loadedGender);

  state = {
    worldSeed: data.worldSeed,
    rng,
    mode: resolvedMode,
    overworld,
    dungeons: dungeonsMap,
    dungeonStack: rebuildDungeonStackFromPlayer(data, player),
    towns: townsMap,
    currentTownId: resolvedMode === Mode.Town ? data.townId : undefined,
    townReturnPos: resolvedMode === Mode.Town ? data.townReturnPos : undefined,
    player,
    playerClass: loadedClass,
    story: loadedStory,
    entities: data.entities,
    items: data.items,
    shops: shopsMap,
    rendererMode: state.rendererMode,
    useFov: state.useFov,
    activePanel: data.activePanel ?? PanelMode.None,
    shopCategory: ShopSpecialty.All,
    turnCounter: data.turnCounter ?? 0,
    quests: data.quests ?? [],
    mapOpen: true,
    mapCursor: { x: 0, y: 0 },
    destination: undefined,
    autoPath: undefined,
    log: new MessageLog(160),
    preferRoads: data.preferRoads ?? true
  };
  overworldNavigator = new OverworldNavigator(state.overworld);
  combat.setState(state);

  if (resolvedMode === Mode.Overworld && player.mapRef.kind === Mode.Town) {
    player.mapRef = { kind: Mode.Overworld };
  }
  if (resolvedMode === Mode.Town && data.townId && player.mapRef.kind !== Mode.Town) {
    player.mapRef = { kind: Mode.Town, townId: data.townId };
  }

  ensureStartingGear(state, loadedClass);
  pendingClass = loadedClass;
  pendingSeed = data.worldSeed;
  hideClassModal();
  state.log.push(t('log.loaded'));
  const loadedCfg: ClassConfig = CLASS_CONFIG[loadedClass];
  state.log.push(
    t('log.classStats', {
      name: loadedCfg.name,
      str: state.player.strength ?? 0,
      agi: state.player.agility ?? 0,
      int: state.player.intellect ?? 0
    })
  );
  return true;
}

/**
 * Loads a save from local storage.
 */
function doLoad(): void {
  const data: SaveDataV3 | undefined = loadFromLocalStorage();
  if (!data) {
    state.log.push(t('log.load.none'));
    return;
  }
  applyLoadedSave(data);
}

/**
 * Exports the current save to the modal.
 */
function exportSaveJson(): void {
  const code: string = serializeSaveDataBase62(buildSaveData());
  openSaveModal('export', code);
  state.log.push(t('log.save.shareReady'));
}

/**
 * Opens the import modal.
 */
function importSaveJson(): void {
  openSaveModal('import');
}

/**
 * Opens the save modal in the specified mode.
 * @param mode The modal mode.
 * @param json The optional JSON content.
 */
function openSaveModal(mode: SaveModalMode, json: string = ''): void {
  saveModalMode = mode;
  saveModalTitle.textContent = mode === 'export' ? t('ui.saveModal.title.export') : t('ui.saveModal.title.import');
  saveModalHint.textContent = mode === 'export' ? t('ui.saveModal.hint.export') : t('ui.saveModal.hint.import');
  saveJsonText.value = json;
  saveJsonText.readOnly = mode === 'export';
  saveJsonText.placeholder = mode === 'export' ? '' : t('ui.saveModal.placeholder');
  btnSaveModalCopy.style.display = mode === 'export' ? 'inline-block' : 'none';
  btnSaveModalLoad.style.display = mode === 'import' ? 'inline-block' : 'none';
  saveModal.classList.remove('hidden');
  setTimeout(() => {
    saveJsonText.focus();
    saveJsonText.select();
  }, 0);
}

/**
 * Closes the save modal.
 */
function closeSaveModal(): void {
  saveModal.classList.add('hidden');
}

/**
 * Copies the save JSON to clipboard.
 */
function copySaveJson(): void {
  const text: string = saveJsonText.value;
  if (!text) {
    return;
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        state.log.push(t('log.save.copied'));
      })
      .catch(() => {
        fallbackCopySaveJson(text);
      });
    return;
  }

  fallbackCopySaveJson(text);
}

/**
 * Uses a legacy copy fallback for save JSON.
 * @param text The JSON text.
 */
function fallbackCopySaveJson(text: string): void {
  saveJsonText.focus();
  saveJsonText.select();
  const ok: boolean = document.execCommand('copy');
  if (ok) {
    state.log.push(t('log.save.copied'));
  } else {
    state.log.push(t('log.save.copyFailed'));
  }
}

/**
 * Loads a save pasted into the modal.
 */
function loadSaveFromModal(): void {
  const code: string = saveJsonText.value.trim();
  if (!code) {
    state.log.push(t('log.save.pasteFirst'));
    return;
  }
  const data: SaveDataV3 | undefined = loadFromBase62String(code);
  if (!data) {
    state.log.push(t('log.save.invalid'));
    return;
  }
  if (applyLoadedSave(data)) {
    closeSaveModal();
  }
}

/**
 * Returns the dungeon layout from a base id.
 * @param baseId The base id.
 * @returns The dungeon layout.
 */
function layoutFromBaseId(baseId: string): DungeonLayout {
  return baseId.startsWith('cave_') ? DungeonLayout.Caves : DungeonLayout.Rooms;
}

/**
 * Rebuilds the dungeon stack from save data.
 * @param data The save data.
 * @param player The player entity.
 * @returns The dungeon stack frames.
 */
function rebuildDungeonStackFromPlayer(data: SaveDataV3, player: Entity): DungeonStackFrame[] {
  const mapRef = player.mapRef;
  if (mapRef.kind !== Mode.Dungeon) {
    return [];
  }
  const dungeon: Dungeon | undefined = data.dungeons.find((d) => d.id === mapRef.dungeonId);
  if (!dungeon) {
    return [];
  }

  const entranceWorldPos: Point = data.entranceReturnPos ?? { x: 0, y: 0 };
  const frames: DungeonStackFrame[] = [];
  const layout: DungeonLayout = layoutFromBaseId(dungeon.baseId);
  for (let depth: number = 0; depth <= dungeon.depth; depth++) {
    frames.push({ baseId: dungeon.baseId, depth, entranceWorldPos, layout });
  }
  return frames;
}

syncRendererUi();
render();
