import type { Action, CharacterClass, CharacterStory, Entity, Gender, GearRarity, Item, Mode, Point, Shop } from './core/types';
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
import type { Dungeon, DungeonLayout, DungeonTheme } from './maps/dungeon';
import { generateDungeon, getDungeonTile, randomFloorPoint } from './maps/dungeon';
import type { Town } from './maps/town';
import { generateTown, getTownTile } from './maps/town';
import { computeDungeonFov, decayVisibilityToSeen } from './systems/fov';
import { canEnterDungeonTile, canEnterOverworldTile, canEnterTownTile, isBlockedByEntity } from './systems/rules';
import { nextMonsterStep } from './systems/ai';
import { PixiRenderer } from './render/pixi';
import { MessageLog } from './ui/log';
import { loadFromBase62String, loadFromLocalStorage, saveToLocalStorage, serializeSaveDataBase62, type SaveDataV3 } from './core/save';
import { renderPanelHtml, type PanelMode } from './ui/panel';
import { aStar } from './systems/astar';
import { hash2D } from './core/hash';
import { t } from './i18n';

type RendererMode = 'canvas' | 'isometric';

type DungeonStackFrame = {
  baseId: string;
  depth: number;
  entranceWorldPos: Point;
  layout: DungeonLayout;
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
  shopCategory: 'all' | 'potion' | 'weapon' | 'armor';

  turnCounter: number;
  quests: import('./core/types').Quest[];

  // Navigation helpers
  mapOpen: boolean;
  mapCursor: Point;
  destination?: Point;
  autoPath?: Point[];

  log: MessageLog;
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
    key: 'common',
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
    key: 'uncommon',
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
    key: 'rare',
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
    key: 'epic',
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
    key: 'legendary',
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

function getShopEconomy(s: GameState, shop: Shop): import('./core/types').ShopEconomy {
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

  let specialty: 'all' | 'potion' | 'weapon' | 'armor' = 'all';
  const specialtyRoll: number = rng.nextInt(0, 100);
  if (specialtyRoll >= 40) {
    specialty = rng.nextInt(0, 3) === 0 ? 'potion' : rng.nextInt(0, 2) === 0 ? 'weapon' : 'armor';
  }

  const featuredItemId: string | undefined = getFeaturedShopItemId(shop, rng);
  const restockIn: number = SHOP_RESTOCK_INTERVAL - (s.turnCounter % SHOP_RESTOCK_INTERVAL);

  return { moodLabel, specialty, buyMultiplier, sellMultiplier, featuredItemId, restockIn };
}

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

function getRarityPriceMultiplier(item: Item): number {
  const rarity: GearRarity = item.rarity ?? 'common';
  switch (rarity) {
    case 'uncommon':
      return 1.03;
    case 'rare':
      return 1.06;
    case 'epic':
      return 1.1;
    case 'legendary':
      return 1.15;
    case 'common':
    default:
      return 1;
  }
}

function getShopBuyPrice(shop: Shop, item: Item, economy: import('./core/types').ShopEconomy): number {
  let multiplier: number = economy.buyMultiplier;
  if (economy.specialty !== 'all') {
    multiplier += item.kind === economy.specialty ? -0.08 : 0.04;
  }
  if (economy.featuredItemId && economy.featuredItemId === item.id) {
    multiplier *= 0.8;
  }
  multiplier *= getRarityPriceMultiplier(item);
  return Math.max(1, Math.round(item.value * multiplier));
}

function getShopSellPrice(shop: Shop, item: Item, economy: import('./core/types').ShopEconomy): number {
  let multiplier: number = economy.sellMultiplier;
  if (economy.specialty !== 'all') {
    multiplier += item.kind === economy.specialty ? 0.03 : -0.02;
  }
  multiplier *= getRarityPriceMultiplier(item);
  return Math.max(1, Math.round(item.value * multiplier));
}

function buildShopPricing(
  s: GameState,
  shop: Shop
): { economy: import('./core/types').ShopEconomy; buyPrices: Record<string, number>; sellPrices: Record<string, number> } {
  const economy: import('./core/types').ShopEconomy = getShopEconomy(s, shop);
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

function randChoice<T>(arr: readonly T[], rng: Rng): T {
  return arr[rng.nextInt(0, arr.length)];
}

function monsterName(key: MonsterKey): string {
  return t(`monster.${key}`);
}

function monsterPlural(key: MonsterKey): string {
  return t(`monster.${key}.plural`);
}

type Pronouns = {
  subject: string;
  object: string;
  possessive: string;
  reflexive: string;
};

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

function addStoryEvent(state: GameState, titleKey: string, detailKey: string, vars: Record<string, string | number> = {}): void {
  state.story.events.push({
    turn: state.turnCounter,
    title: t(titleKey, vars),
    detail: t(detailKey, vars)
  });
}

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
  return { id, kind: 'weapon', name, attackBonus, value, rarity: rarity.key, critChance, lifesteal };
}

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
  return { id, kind: 'armor', name, defenseBonus, value, rarity: rarity.key, dodgeChance, thorns };
}

function createGearItem(
  id: string,
  slot: 'weapon' | 'armor',
  spec: GearSpec,
  attackBonus: number | undefined,
  defenseBonus: number | undefined,
  value: number
): Item {
  if (slot === 'weapon') {
    return { id, kind: 'weapon', name: spec.name, attackBonus: attackBonus ?? spec.attackBonus ?? 0, value, rarity: 'common' };
  }
  return { id, kind: 'armor', name: spec.name, defenseBonus: defenseBonus ?? spec.defenseBonus ?? 0, value, rarity: 'common' };
}

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
      : createGearItem(weaponId, 'weapon', gear.weapon, gear.weapon.attackBonus, undefined, gear.weapon.value);

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
      : createGearItem(armorId, 'armor', gear.armor, undefined, gear.armor.defenseBonus, gear.armor.value);

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

function createClassUpgradeItem(classType: CharacterClass, slot: 'weapon' | 'armor', id: string, upgradeLevel: number, rng: Rng): Item {
  const gear: ClassGearConfig = CLASS_GEAR[classType];
  const spec: GearSpec = slot === 'weapon' ? gear.weapon : gear.armor;
  const level: number = Math.max(1, upgradeLevel);
  const rarity: RarityConfig = rollRarity(level, rng);

  if (slot === 'weapon') {
    const baseAttack: number = spec.attackBonus ?? 0;
    const attackBonus: number = baseAttack + level + rarity.attackBonus;
    const nameBase: string = `${spec.upgradeName} +${attackBonus - baseAttack}`;
    const name: string = rarity.namePrefix ? `${rarity.namePrefix} ${nameBase}` : nameBase;
    const baseValue: number = spec.value + level * 18;
    const value: number = Math.max(1, Math.round(baseValue * rarity.valueMultiplier));
    const critChance: number = rarity.weaponCritChance;
    const lifesteal: number = rarity.weaponLifesteal;
    return { id, kind: 'weapon', name, attackBonus, value, rarity: rarity.key, critChance, lifesteal };
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
  return { id, kind: 'armor', name, defenseBonus, value, rarity: rarity.key, dodgeChance, thorns };
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

function getPixiViewSize(): { w: number; h: number } {
  const tileSize: number = 16;
  const widthPx: number = Math.max(1, Math.floor(canvas.width));
  const heightPx: number = Math.max(1, Math.floor(canvas.height));
  const w: number = Math.max(1, Math.floor(widthPx / tileSize));
  const h: number = Math.max(1, Math.floor(heightPx / tileSize));
  return { w, h };
}

const classModal: HTMLElement = document.getElementById('classSelect')!;
const classSelectTitle: HTMLElement = document.getElementById('classSelectTitle')!;
const classSelectSubtitle: HTMLElement = document.getElementById('classSelectSubtitle')!;
const classButtons: HTMLButtonElement[] = Array.from(classModal.querySelectorAll<HTMLButtonElement>('[data-class]'));
const nameInput: HTMLInputElement = document.getElementById('nameInput') as HTMLInputElement;
const nameErrorEl: HTMLElement = document.getElementById('nameError')!;
const btnNameRandom: HTMLButtonElement = document.getElementById('btnNameRandom') as HTMLButtonElement;
const genderSelect: HTMLSelectElement = document.getElementById('genderSelect') as HTMLSelectElement;
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
let pendingClass: CharacterClass = 'warrior';
let pendingGender: Gender = 'female';
let pendingName: string = '';
canvasWrap.classList.add('displayNone');

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
    { key: 'female', label: t('gender.female') },
    { key: 'male', label: t('gender.male') },
    { key: 'nonbinary', label: t('gender.nonbinary') }
  ];
  genderSelect.innerHTML = '';
  for (const option of genderOptions) {
    const opt = document.createElement('option');
    opt.value = option.key;
    opt.textContent = option.label;
    genderSelect.appendChild(opt);
  }
  genderSelect.value = pendingGender;

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

function normalizePlayerName(raw: string): string {
  const trimmed: string = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return t('entity.playerName');
  }
  return trimmed.slice(0, 24);
}

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

function newGame(worldSeed: number, classChoice: CharacterClass, gender: Gender, name: string): GameState {
  const rng: Rng = new Rng(worldSeed);
  const overworld: Overworld = new Overworld(worldSeed);
  const cfg: ClassConfig = CLASS_CONFIG[classChoice];
  const story: CharacterStory = buildStory(rng, classChoice, gender);

  const player: Entity = {
    id: 'player',
    kind: 'player',
    name,
    glyph: '@',
    pos: findStartPosition(overworld, rng),
    mapRef: { kind: 'overworld' },
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
    mode: 'overworld',
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
    rendererMode: 'isometric',
    useFov: true,
    activePanel: 'none',
    shopCategory: 'all',
    turnCounter: 0,
    quests: [],
    mapOpen: false,
    mapCursor: { x: 0, y: 0 },
    destination: undefined,
    autoPath: undefined,
    log: new MessageLog(160)
  };

  state.log.push(t('log.welcome'));
  state.log.push(t('log.controls'));
  state.log.push(t('log.controls.system'));
  state.log.push(t('log.classStats', { name: cfg.name, str: cfg.strength, agi: cfg.agility, int: cfg.intellect }));
  ensureStartingGear(state, classChoice);
  addStoryEvent(state, 'story.event.begin.title', 'story.event.begin.detail', { className: cfg.name });
  return state;
}

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

function hideClassModal(): void {
  classModal.classList.add('hidden');
}

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

function isClassModalVisible(): boolean {
  return !classModal.classList.contains('hidden');
}

function startNewRun(classChoice: CharacterClass): void {
  pendingClass = classChoice;
  const gender = (genderSelect.value as Gender) || pendingGender;
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
  hideClassModal();
  syncRendererUi();
  render();
}

function getCurrentDungeon(s: GameState): Dungeon | undefined {
  if (s.player.mapRef.kind !== 'dungeon') {
    return undefined;
  }
  return s.dungeons.get(s.player.mapRef.dungeonId);
}

function getCurrentTown(s: GameState): Town | undefined {
  if (s.player.mapRef.kind !== 'town') {
    return undefined;
  }
  return s.towns.get(s.player.mapRef.townId);
}

function ensureDungeonLevel(s: GameState, baseId: string, depth: number, entranceWorldPos: Point, layout: DungeonLayout): Dungeon {
  const levelId: string = dungeonLevelId(baseId, depth);
  const existing: Dungeon | undefined = s.dungeons.get(levelId);
  if (existing) {
    return existing;
  }

  const baseSeed: number =
    layout === 'caves'
      ? caveSeedFromWorldPos(s.worldSeed, entranceWorldPos.x, entranceWorldPos.y)
      : dungeonSeedFromWorldPos(s.worldSeed, entranceWorldPos.x, entranceWorldPos.y);
  const levelSeed: number = (baseSeed ^ (depth * 0x9e3779b9)) | 0;

  const dungeon: Dungeon = generateDungeon(levelId, baseId, depth, levelSeed, 80, 50, layout);

  spawnMonstersInDungeon(s, dungeon, levelSeed);
  spawnLootInDungeon(s, dungeon, levelSeed);
  spawnBossInDungeon(s, dungeon, levelSeed);

  s.dungeons.set(levelId, dungeon);
  return dungeon;
}

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

function spawnMonstersInDungeon(s: GameState, dungeon: Dungeon, seed: number): void {
  const monsterCount: number = 5 + Math.min(12, dungeon.depth * 2);
  const rng: Rng = new Rng(seed ^ 0xbeef);

  for (let i: number = 0; i < monsterCount; i++) {
    const p: Point = randomFloorPoint(dungeon, seed + 1000 + i * 17);

    const roll: number = rng.nextInt(0, 100);
    const monster = createMonsterForDepth(dungeon.depth, roll, s.rng, dungeon.id, i, p);

    s.entities.push(monster);
  }
}

function createMonsterForDepth(depth: number, roll: number, rng: Rng, dungeonId: string, i: number, p: Point): Entity {
  // Slime: weak, Orc: tougher, Goblin: baseline
  if (roll < 30) {
    return {
      id: `m_${dungeonId}_${i}`,
      kind: 'monster',
      name: monsterName('slime'),
      glyph: 's',
      pos: p,
      mapRef: { kind: 'dungeon', dungeonId },
      hp: 4 + depth,
      maxHp: 4 + depth,
      baseAttack: 1 + Math.floor(depth / 2),
      baseDefense: 0,
      level: 1,
      xp: 0,
      gold: 0,
      inventory: [],
      equipment: {}
    };
  }

  if (roll < 60) {
    return {
      id: `m_${dungeonId}_${i}`,
      kind: 'monster',
      name: monsterName('goblin'),
      glyph: 'g',
      pos: p,
      mapRef: { kind: 'dungeon', dungeonId },
      hp: 6 + depth * 2,
      maxHp: 6 + depth * 2,
      baseAttack: 2 + depth,
      baseDefense: Math.floor(depth / 3),
      level: 1,
      xp: 0,
      gold: 0,
      inventory: [],
      equipment: {}
    };
  }

  if (depth >= 2 && roll < 82) {
    return {
      id: `m_${dungeonId}_${i}`,
      kind: 'monster',
      name: monsterName('wraith'),
      glyph: 'w',
      pos: p,
      mapRef: { kind: 'dungeon', dungeonId },
      hp: 7 + depth * 2,
      maxHp: 7 + depth * 2,
      baseAttack: 2 + depth,
      baseDefense: Math.floor(depth / 3),
      level: 1,
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
    kind: 'monster',
    name: monsterName('orc'),
    glyph: 'O',
    pos: p,
    mapRef: { kind: 'dungeon', dungeonId },
    hp: 10 + depth * 3,
    maxHp: 10 + depth * 3,
    baseAttack: 3 + depth,
    baseDefense: 1 + Math.floor(depth / 2),
    level: 1,
    xp: 0,
    gold: 0,
    inventory: [],
    equipment: {},
    statusEffects: []
  };
}

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

function bossNameForDepth(depth: number): string {
  if (depth < 3) {
    return t('boss.ruins');
  }
  if (depth < 6) {
    return t('boss.caves');
  }
  return t('boss.crypt');
}

function spawnBossInDungeon(s: GameState, dungeon: Dungeon, seed: number): void {
  if (dungeon.depth < BOSS_MIN_DEPTH) {
    return;
  }
  if (s.entities.some((e) => e.isBoss && e.mapRef.kind === 'dungeon' && e.mapRef.dungeonId === dungeon.id)) {
    return;
  }

  const rng: Rng = new Rng(seed ^ 0xb055);
  const p: Point = dungeon.bossRoom ? dungeon.bossRoom.center : randomFloorPoint(dungeon, seed + 7000);
  const name: string = bossNameForTheme(dungeon.theme);
  const hp: number = 24 + dungeon.depth * 7;
  const boss: Entity = {
    id: `boss_${dungeon.id}`,
    kind: 'monster',
    name,
    glyph: 'B',
    pos: p,
    mapRef: { kind: 'dungeon', dungeonId: dungeon.id },
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
        kind: 'potion',
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
      const slot: 'weapon' | 'armor' = rng.nextInt(0, 2) === 0 ? 'weapon' : 'armor';
      const upgradeId: string = `${baseId}_class_${slot}`;
      const upgradeLevel: number = Math.max(1, Math.floor(dungeon.depth / 2) + 1);
      item = createClassUpgradeItem(s.playerClass, slot, upgradeId, upgradeLevel, rng);
    }

    item.mapRef = { kind: 'dungeon', dungeonId: dungeon.id };
    item.pos = p;
    s.items.push(item);
  }
}

function getActiveTownId(): string | undefined {
  if (state.mode === 'town') {
    return state.currentTownId;
  }
  if (state.mode !== 'overworld') {
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
        kind: 'killMonsters',
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
        kind: 'slayMonster',
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
        kind: 'reachDepth',
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
      kind: 'slayBoss',
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

function createBossQuestRewards(s: GameState, rng: Rng, questId: string, power: number, bossName: string): string[] {
  const weaponId: string = `${questId}_reward_boss_w`;
  if (!s.items.some((it) => it.id === weaponId)) {
    const item: Item = createBossRelicItem(rng, weaponId, 'weapon', power, bossName);
    s.items.push(item);
  }

  const armorId: string = `${questId}_reward_boss_a`;
  if (!s.items.some((it) => it.id === armorId)) {
    const item: Item = createBossRelicItem(rng, armorId, 'armor', power, bossName);
    s.items.push(item);
  }

  return [weaponId, armorId];
}

function createBossRelicItem(rng: Rng, id: string, slot: 'weapon' | 'armor', power: number, bossName: string): Item {
  if (slot === 'weapon') {
    const item: Item = generateWeaponLoot(id, Math.max(1, power), rng);
    item.rarity = 'legendary';
    item.attackBonus = (item.attackBonus ?? 0) + 3;
    item.value = Math.round(item.value * 2.4);
    item.name = t('item.relic.blade', { bossName });
    return item;
  }

  const item: Item = generateArmorLoot(id, Math.max(1, power), rng);
  item.rarity = 'legendary';
  item.defenseBonus = (item.defenseBonus ?? 0) + 2;
  item.value = Math.round(item.value * 2.4);
  item.name = t('item.relic.aegis', { bossName });
  return item;
}

function dropBossLoot(s: GameState, boss: Entity): void {
  if (!boss.isBoss || boss.mapRef.kind !== 'dungeon') {
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
  const slot: 'weapon' | 'armor' = rng.nextInt(0, 2) === 0 ? 'weapon' : 'armor';
  const item: Item = createBossRelicItem(rng, id, slot, dungeon.depth + 4, boss.name);
  item.mapRef = { kind: 'dungeon', dungeonId: dungeon.id };
  item.pos = { x: boss.pos.x, y: boss.pos.y };
  s.items.push(item);
  s.log.push(t('log.boss.drop', { boss: boss.name, item: item.name }));
  addStoryEvent(s, 'story.event.boss.title', 'story.event.boss.detail', { boss: boss.name, depth: dungeon.depth });
}

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

function createQuestRewardItem(s: GameState, rng: Rng, questId: string, power: number, suffix: string, typeKey: string): string {
  if (typeKey === 'p') {
    const id: string = `${questId}_reward_${suffix}_p`;
    if (!s.items.some((it) => it.id === id)) {
      const healAmount: number = 8 + power * 2;
      const item: Item = {
        id,
        kind: 'potion',
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

function recordKillForQuests(s: GameState, dungeonDepth: number, monsterName: string, isBoss: boolean): void {
  for (const q of s.quests) {
    if (q.kind !== 'killMonsters' && q.kind !== 'slayMonster' && q.kind !== 'slayBoss') {
      continue;
    }
    if (q.completed || q.turnedIn) {
      continue;
    }
    if (dungeonDepth < q.minDungeonDepth) {
      continue;
    }
    if (q.kind === 'slayMonster' && q.targetMonster && q.targetMonster !== monsterName) {
      continue;
    }
    if (q.kind === 'slayBoss') {
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

function recordDepthForQuests(s: GameState, dungeonDepth: number): void {
  for (const q of s.quests) {
    if (q.kind !== 'reachDepth') {
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

function applyStatusEffectsStartOfTurn(s: GameState): void {
  const effects = s.player.statusEffects ?? [];
  if (effects.length === 0) {
    return;
  }

  for (const eff of effects) {
    if (eff.kind === 'poison') {
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
  const existing = effects.find((e) => e.kind === 'poison');
  if (existing) {
    existing.remainingTurns = Math.max(existing.remainingTurns, 5);
    existing.potency = Math.max(existing.potency, 1);
  } else {
    effects.push({ kind: 'poison', remainingTurns: 5, potency: 1 });
  }
  state.player.statusEffects = effects;
  state.log.push(t('log.poisoned'));
}

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
      item = { id: itemId, kind: 'potion', name: t('item.potion.healing'), healAmount: 10, value: 14 };
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

function addClassGearToShop(s: GameState, shopId: string, stock: string[], tier: number, rng: Rng): void {
  if (!CLASS_GEAR[s.playerClass]) {
    return;
  }

  const existingIds: Set<string> = new Set<string>(stock);
  const upgradeLevel: number = Math.max(1, tier + 1);

  const weaponId: string = `shop_${shopId}_class_weapon_${tier}`;
  if (!existingIds.has(weaponId) && !s.items.some((it) => it.id === weaponId)) {
    const item: Item = createClassUpgradeItem(s.playerClass, 'weapon', weaponId, upgradeLevel, rng);
    s.items.push(item);
    stock.push(weaponId);
  }

  const armorId: string = `shop_${shopId}_class_armor_${tier}`;
  if (!existingIds.has(armorId) && !s.items.some((it) => it.id === armorId)) {
    const item: Item = createClassUpgradeItem(s.playerClass, 'armor', armorId, upgradeLevel, rng);
    s.items.push(item);
    stock.push(armorId);
  }
}

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
      item = { id: itemId, kind: 'potion', name: t('item.potion.healing'), healAmount: 10, value: 14 };
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

function isStandingOnTown(): boolean {
  return state.mode === 'town';
}

function getTownTileAtPlayer(): import('./core/types').TownTile | undefined {
  if (state.mode !== 'town') {
    return undefined;
  }
  const town: Town | undefined = getCurrentTown(state);
  if (!town) {
    return undefined;
  }
  return getTownTile(town, state.player.pos.x, state.player.pos.y);
}

function isAtOrNearTownGate(): boolean {
  if (state.mode !== 'town') {
    return false;
  }
  const town: Town | undefined = getCurrentTown(state);
  if (!town) {
    return false;
  }
  const px: number = state.player.pos.x;
  const py: number = state.player.pos.y;
  const current: import('./core/types').TownTile = getTownTile(town, px, py);
  if (current === 'gate' || current === 'road') {
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
    if (getTownTile(town, n.x, n.y) === 'gate') {
      return true;
    }
  }
  return false;
}

function canOpenShopHere(): boolean {
  return state.mode === 'town' && getTownTileAtPlayer() === 'shop';
}

function canOpenQuestHere(): boolean {
  return state.mode === 'town' && getTownTileAtPlayer() === 'tavern';
}

function getActiveTownWorldPos(): Point | undefined {
  if (state.mode === 'town') {
    return state.townReturnPos;
  }
  if (state.mode !== 'overworld') {
    return undefined;
  }
  const tile = state.overworld.getTile(state.player.pos.x, state.player.pos.y);
  if (tile === 'town' || tile.startsWith('town_')) {
    return { x: state.player.pos.x, y: state.player.pos.y };
  }
  return undefined;
}

function getOverworldEntranceKind(): 'dungeon' | 'cave' | undefined {
  if (state.mode !== 'overworld') {
    return undefined;
  }
  const tile = state.overworld.getTile(state.player.pos.x, state.player.pos.y);
  if (tile === 'dungeon') {
    return 'dungeon';
  }
  if (tile === 'cave') {
    return 'cave';
  }
  return undefined;
}

function isStandingOnDungeonEntrance(): boolean {
  return getOverworldEntranceKind() !== undefined;
}

function removeDeadEntities(s: GameState): void {
  s.entities = s.entities.filter((e: Entity) => e.hp > 0 || e.kind === 'player');
}

function handleAction(action: Action): void {
  if (action.kind === 'toggleRenderer') {
    state.rendererMode = state.rendererMode === 'isometric' ? 'canvas' : 'isometric';
    state.log.push(state.rendererMode === 'isometric' ? t('log.renderer.iso') : t('log.renderer.topdown'));
    syncRendererUi();
    render();
    return;
  }

  if (action.kind === 'toggleFov') {
    state.useFov = !state.useFov;
    state.log.push(state.useFov ? t('log.fov.on') : t('log.fov.off'));
    render();
    return;
  }

  if (action.kind === 'toggleInventory') {
    state.activePanel = state.activePanel === 'inventory' ? 'none' : 'inventory';
    render();
    return;
  }

  if (action.kind === 'toggleShop') {
    if (state.activePanel === 'shop') {
      state.activePanel = 'none';
      render();
      return;
    }
    if (!canOpenShopHere()) {
      state.log.push(t('log.shop.find'));
      render();
      return;
    }
    state.activePanel = 'shop';
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

  if (action.kind === 'toggleMap') {
    state.mapOpen = !state.mapOpen;
    state.log.push(state.mapOpen ? t('log.map.open') : t('log.map.closed'));
    render();
    return;
  }

  if (action.kind === 'cancelAuto') {
    state.destination = undefined;
    state.autoPath = undefined;
    state.log.push(t('log.autoWalk.cancel'));
    render();
    return;
  }

  if (action.kind === 'toggleQuest') {
    if (state.activePanel === 'quest') {
      state.activePanel = 'none';
      render();
      return;
    }
    if (!canOpenQuestHere()) {
      state.log.push(t('log.quest.find'));
      render();
      return;
    }
    state.activePanel = 'quest';
    const townPos: Point | undefined = getActiveTownWorldPos();
    if (townPos) {
      ensureQuestForTown(state, townPos);
      const shopNow: Shop = ensureShopForTown(state, townPos);
      maybeRestockShop(state, shopNow);
    }
    render();
    return;
  }

  if (action.kind === 'toggleStory') {
    state.activePanel = state.activePanel === 'story' ? 'none' : 'story';
    render();
    return;
  }

  if (action.kind === 'save') {
    doSave();
    render();
    return;
  }

  if (action.kind === 'load') {
    doLoad();
    syncRendererUi();
    render();
    return;
  }

  if (action.kind === 'help') {
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

  if (state.player.hp <= 0) {
    state.log.push(t('log.death.restart'));
  }

  render();
}

function playerTurn(action: Action): boolean {
  if (state.player.hp <= 0) {
    return false;
  }

  if (state.mode === 'overworld' && state.autoPath && state.autoPath.length >= 2) {
    // If the player presses a time-advancing key (move or space), advance one step along the path.
    if (action.kind === 'move' || action.kind === 'wait') {
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
      if (tile === 'town_gate') {
        state.log.push(t('log.autoWalk.townFound'));
      }

      return true;
    }
  }

  if (action.kind === 'wait') {
    state.log.push(t('log.wait'));
    return true;
  }

  if (action.kind === 'pickup') {
    return pickupAtPlayer();
  }

  if (action.kind === 'use') {
    if (state.mode === 'overworld') {
      const entrance = getOverworldEntranceKind();
      if (entrance) {
        enterDungeonAt(state.player.pos, entrance);
        return true;
      }
      const tile = state.overworld.getTile(state.player.pos.x, state.player.pos.y);
      if (tile === 'town_gate') {
        enterTownAt(state.player.pos);
        return true;
      }
      state.log.push(t('log.use.none'));
      return false;
    } else if (state.mode === 'dungeon') {
      const dungeon: Dungeon | undefined = getCurrentDungeon(state);
      if (!dungeon) {
        return false;
      }

      const tile = getDungeonTile(dungeon, state.player.pos.x, state.player.pos.y);
      if (tile === 'stairsUp') {
        goUpLevelOrExit();
        return true;
      }
      if (tile === 'stairsDown') {
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

  if (action.kind === 'move') {
    return tryMovePlayer(action.dx, action.dy);
  }

  return false;
}

function pickupAtPlayer(): boolean {
  const dungeon: Dungeon | undefined = getCurrentDungeon(state);
  if (state.mode !== 'dungeon' || !dungeon) {
    state.log.push(t('log.pickup.onlyDungeon'));
    return false;
  }

  for (const it of state.items) {
    if (!it.mapRef || !it.pos) {
      continue;
    }
    if (it.mapRef.kind !== 'dungeon') {
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

function tryMovePlayer(dx: number, dy: number): boolean {
  const target: Point = add(state.player.pos, { x: dx, y: dy });

  if (state.mode === 'dungeon') {
    const dungeon: Dungeon | undefined = getCurrentDungeon(state);
    if (!dungeon) {
      return false;
    }

    const blocker: Entity | undefined = isBlockedByEntity(state.entities, 'dungeon', dungeon.id, undefined, target);
    if (blocker && blocker.kind === 'monster') {
      attack(state.player, blocker);
      return true;
    }

    if (!canEnterDungeonTile(dungeon, target)) {
      return false;
    }

    state.player.pos = target;
    return true;
  }

  if (state.mode === 'town') {
    const town: Town | undefined = getCurrentTown(state);
    if (!town) {
      return false;
    }

    const blocker: Entity | undefined = isBlockedByEntity(state.entities, 'town', undefined, town.id, target);
    if (blocker && blocker.kind === 'monster') {
      attack(state.player, blocker);
      return true;
    }

    if (!canEnterTownTile(town, target)) {
      return false;
    }

    state.player.pos = target;
    if (getTownTile(town, target.x, target.y) === 'gate') {
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
    if (tile === 'dungeon') {
      state.log.push(t('log.map.dungeonFound'));
    }
    if (tile === 'cave') {
      state.log.push(t('log.map.caveFound'));
    }
    if (tile === 'town_gate') {
      state.log.push(t('log.map.townFound'));
    }
  }

  return moved;
}

function getEquippedWeaponItem(entity: Entity): Item | undefined {
  const weaponId: string | undefined = entity.equipment.weaponItemId;
  if (!weaponId) {
    return undefined;
  }
  return state.items.find((x) => x.id === weaponId);
}

function getEquippedArmorItem(entity: Entity): Item | undefined {
  const armorId: string | undefined = entity.equipment.armorItemId;
  if (!armorId) {
    return undefined;
  }
  return state.items.find((x) => x.id === armorId);
}

function getEquippedAttackBonus(entity: Entity): number {
  return getEquippedWeaponItem(entity)?.attackBonus ?? 0;
}

function getEquippedDefenseBonus(entity: Entity): number {
  return getEquippedArmorItem(entity)?.defenseBonus ?? 0;
}

function getEquippedCritChance(entity: Entity): number {
  return getEquippedWeaponItem(entity)?.critChance ?? 0;
}

function getEquippedLifesteal(entity: Entity): number {
  return getEquippedWeaponItem(entity)?.lifesteal ?? 0;
}

function getEquippedDodgeChance(entity: Entity): number {
  return getEquippedArmorItem(entity)?.dodgeChance ?? 0;
}

function getEquippedThorns(entity: Entity): number {
  return getEquippedArmorItem(entity)?.thorns ?? 0;
}

type LevelUpGains = {
  hp: number;
  attack: number;
  defense: number;
  strength: number;
  agility: number;
  intellect: number;
};

function applyLevelUpGrowth(player: Entity, classType: CharacterClass): LevelUpGains {
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

function awardXp(amount: number): void {
  state.player.xp += amount;
  while (state.player.xp >= xpToNextLevel(state.player.level)) {
    state.player.xp -= xpToNextLevel(state.player.level);
    state.player.level += 1;
    const gains: LevelUpGains = applyLevelUpGrowth(state.player, state.playerClass);
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

function xpToNextLevel(level: number): number {
  return 25 + (level - 1) * 12;
}

function attack(attacker: Entity, defender: Entity): void {
  let atk: number = attacker.baseAttack + getEquippedAttackBonus(attacker);
  let def: number = defender.baseDefense + getEquippedDefenseBonus(defender);
  const originalDef: number = def;

  let damageMultiplier: number = 1;
  const suffixParts: string[] = [];
  let playerVerb: string = t('combat.verb.hit');
  let critChance: number = 0;

  if (defender.kind === 'player') {
    const dodgeChance: number = Math.min(50, getEquippedDodgeChance(defender));
    if (dodgeChance > 0 && state.rng.nextInt(0, 100) < dodgeChance) {
      state.log.push(t('log.combat.dodge'));
      return;
    }
  }

  if (attacker.kind === 'player') {
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

    critChance = Math.min(75, critChance + getEquippedCritChance(attacker));
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

  if (attacker.kind === 'player') {
    const lifesteal: number = Math.min(50, getEquippedLifesteal(attacker));
    if (lifesteal > 0) {
      const heal: number = Math.min(attacker.maxHp - attacker.hp, Math.floor((dmg * lifesteal) / 100));
      if (heal > 0) {
        attacker.hp += heal;
        state.log.push(t('log.combat.lifesteal', { amount: heal }));
      }
    }
  }

  if (defender.kind === 'player' && attacker.kind === 'monster') {
    const thorns: number = Math.min(20, getEquippedThorns(defender));
    if (thorns > 0) {
      attacker.hp -= thorns;
      state.log.push(t('log.combat.thorns', { name: attacker.name, amount: thorns }));
      if (attacker.hp <= 0) {
        state.log.push(t('log.combat.dies', { name: attacker.name }));
        const xp: number = 6 + (attacker.baseAttack + attacker.baseDefense);
        const gold: number = 2 + state.rng.nextInt(0, 4);
        state.player.gold += gold;
        state.log.push(t('log.combat.loot', { xp, gold }));
        awardXp(xp);

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
  if (attacker.kind === 'player') {
    state.log.push(
      t('log.combat.player', {
        verb: playerVerb,
        target: defender.name,
        dmg,
        suffix,
        hp: defenderHpText
      })
    );
  } else if (defender.kind === 'player') {
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
    if (defender.kind === 'player') {
      state.log.push(t('log.combat.playerDeath'));
    } else {
      state.log.push(t('log.combat.dies', { name: defender.name }));
    }

    if (attacker.kind === 'player') {
      const xp: number = 6 + (defender.baseAttack + defender.baseDefense);
      const gold: number = 2 + state.rng.nextInt(0, 4);
      state.player.gold += gold;
      state.log.push(t('log.combat.loot', { xp, gold }));
      awardXp(xp);

      const currentDepth: number = state.dungeonStack[state.dungeonStack.length - 1]?.depth ?? 0;
      if (defender.isBoss) {
        dropBossLoot(state, defender);
      }
      recordKillForQuests(state, currentDepth, defender.name, !!defender.isBoss);
    }
  }
}

function wraithDrain(attacker: Entity, defender: Entity): void {
  const def: number = defender.baseDefense + getEquippedDefenseBonus(defender);
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

function monstersTurn(): void {
  if (state.mode !== 'dungeon') {
    return;
  }

  const dungeon: Dungeon | undefined = getCurrentDungeon(state);
  if (!dungeon) {
    return;
  }

  let visible: Set<string> | undefined;

  if (state.useFov) {
    decayVisibilityToSeen(dungeon);
    visible = computeDungeonFov(dungeon, state.player.pos, 10);
  }

  for (const e of state.entities) {
    if (e.kind !== 'monster') {
      continue;
    }
    if (e.hp <= 0) {
      continue;
    }
    if (e.mapRef.kind !== 'dungeon') {
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
      attack(e, state.player);
      if (state.player.hp < hpBefore && state.player.hp > 0) {
        maybeApplyPoisonFromAttacker(e);
      }
      continue;
    }

    if (e.glyph === 'w' && (e.specialCooldown ?? 0) === 0 && dist <= 4 && chaseOk && state.rng.nextInt(0, 100) < 20) {
      wraithDrain(e, state.player);
      e.specialCooldown = 3;
      continue;
    }
    if (dist <= 12 && chaseOk) {
      const next: Point | undefined = nextMonsterStep(e, state.player, dungeon, state.entities);
      if (!next) {
        continue;
      }

      const blocked: Entity | undefined = isBlockedByEntity(state.entities, 'dungeon', dungeon.id, undefined, next);
      if (blocked) {
        continue;
      }

      if (canEnterDungeonTile(dungeon, next)) {
        e.pos = next;
      }
    }
  }
}

function enterDungeonAt(worldPos: Point, entranceKind: 'dungeon' | 'cave'): void {
  const layout: DungeonLayout = entranceKind === 'cave' ? 'caves' : 'rooms';
  const baseId: string =
    entranceKind === 'cave'
      ? caveBaseIdFromWorldPos(state.worldSeed, worldPos.x, worldPos.y)
      : dungeonBaseIdFromWorldPos(state.worldSeed, worldPos.x, worldPos.y);
  const depth: number = 0;

  const dungeon: Dungeon = ensureDungeonLevel(state, baseId, depth, worldPos, layout);

  state.dungeonStack = [{ baseId, depth, entranceWorldPos: { x: worldPos.x, y: worldPos.y }, layout }];
  state.mode = 'dungeon';
  state.player.mapRef = { kind: 'dungeon', dungeonId: dungeon.id };
  state.player.pos = { x: dungeon.stairsUp.x, y: dungeon.stairsUp.y };

  state.log.push(entranceKind === 'cave' ? t('log.enter.cave') : t('log.enter.dungeon'));
  addStoryEvent(state, 'story.event.enterDungeon.title', 'story.event.enterDungeon.detail', { depth: 0 });
  triggerDungeonBanner(depth);
}

function enterTownAt(worldPos: Point): void {
  const center: Point = state.overworld.getTownCenter(worldPos.x, worldPos.y) ?? worldPos;
  const town: Town = ensureTownInterior(state, center);
  state.mode = 'town';
  state.currentTownId = town.id;
  state.townReturnPos = { x: worldPos.x, y: worldPos.y };
  state.destination = undefined;
  state.autoPath = undefined;
  state.player.mapRef = { kind: 'town', townId: town.id };
  state.player.pos = { x: town.entrance.x, y: town.entrance.y };
  state.log.push(t('log.enter.town'));
  addStoryEvent(state, 'story.event.enterTown.title', 'story.event.enterTown.detail', { townId: town.id });
}

function exitTownToOverworld(): void {
  const returnPos: Point = state.townReturnPos ?? { x: 0, y: 0 };
  state.mode = 'overworld';
  state.player.mapRef = { kind: 'overworld' };
  state.player.pos = { x: returnPos.x, y: returnPos.y };
  state.currentTownId = undefined;
  state.townReturnPos = undefined;
  state.log.push(t('log.enter.overworld'));
  addStoryEvent(state, 'story.event.returnOverworld.title', 'story.event.returnOverworld.detail');
}

function goDownLevel(): void {
  const current: DungeonStackFrame | undefined = state.dungeonStack[state.dungeonStack.length - 1];
  if (!current) {
    return;
  }

  const nextDepth: number = current.depth + 1;
  const dungeon: Dungeon = ensureDungeonLevel(state, current.baseId, nextDepth, current.entranceWorldPos, current.layout);

  state.dungeonStack.push({ baseId: current.baseId, depth: nextDepth, entranceWorldPos: current.entranceWorldPos, layout: current.layout });
  state.player.mapRef = { kind: 'dungeon', dungeonId: dungeon.id };
  state.player.pos = { x: dungeon.stairsUp.x, y: dungeon.stairsUp.y };
  state.log.push(t('log.dungeon.descend', { depth: nextDepth, theme: t(`theme.${dungeon.theme}`) }));
  addStoryEvent(state, 'story.event.descend.title', 'story.event.descend.detail', { depth: nextDepth, theme: t(`theme.${dungeon.theme}`) });
  recordDepthForQuests(state, nextDepth);
  triggerDungeonBanner(nextDepth);
}

function goUpLevelOrExit(): void {
  if (state.dungeonStack.length <= 1) {
    const top: DungeonStackFrame | undefined = state.dungeonStack[0];
    if (!top) {
      return;
    }

    state.mode = 'overworld';
    state.player.mapRef = { kind: 'overworld' };
    state.player.pos = { x: top.entranceWorldPos.x, y: top.entranceWorldPos.y };
    state.dungeonStack = [];
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

  state.player.mapRef = { kind: 'dungeon', dungeonId };
  state.player.pos = { x: dungeon.stairsDown.x, y: dungeon.stairsDown.y };
  state.log.push(t('log.dungeon.ascend', { depth: prev.depth }));
  addStoryEvent(state, 'story.event.ascend.title', 'story.event.ascend.detail', { depth: prev.depth });
  triggerDungeonBanner(prev.depth);
}

function setDestination(dest: Point): void {
  if (state.mode !== 'overworld') {
    return;
  }

  const path = aStar(
    state.player.pos,
    dest,
    (p: Point) => canEnterOverworldTile(state.overworld, p),
    (_p: Point) => false,
    20000
  );

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

function syncRendererUi(): void {
  asciiEl.style.display = 'none';
  canvasWrap.style.display = 'block';
}

let fxRenderUntil: number = 0;
let fxRenderHandle: number = 0;

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

function triggerDungeonBanner(depth: number): void {
  canvasRenderer.triggerBannerEffect(t('ui.fx.dungeonDepth', { depth: depth + 1 }), 1200);
  runFxRenderLoop(1200);
}

function render(): void {
  const dungeon: Dungeon | undefined = getCurrentDungeon(state);
  const town: Town | undefined = getCurrentTown(state);

  modePill.textContent =
    state.mode === 'overworld'
      ? t('ui.mode.overworld')
      : state.mode === 'town'
        ? t('ui.mode.town')
        : t('ui.mode.dungeon', {
            depth: state.dungeonStack[state.dungeonStack.length - 1]?.depth ?? 0,
            theme: dungeon?.theme ? t(`theme.${dungeon.theme}`) : '?'
          });

  renderPill.textContent = t('ui.render.pill', { fov: state.useFov ? t('ui.fov.on') : t('ui.fov.off') });

  if (state.mode === 'dungeon' && dungeon && state.useFov) {
    decayVisibilityToSeen(dungeon);
    computeDungeonFov(dungeon, state.player.pos, 10);
  }

  const classInfo: ClassConfig = CLASS_CONFIG[state.playerClass];
  const atk: number = state.player.baseAttack + getEquippedAttackBonus(state.player);
  const def: number = state.player.baseDefense + getEquippedDefenseBonus(state.player);
  const str: number = state.player.strength ?? 0;
  const agi: number = state.player.agility ?? 0;
  const intl: number = state.player.intellect ?? 0;
  const nextXp: number = xpToNextLevel(state.player.level);
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
    state.rendererMode === 'isometric' ? 'isometric' : 'canvas'
  );
}

function renderMinimap(): void {
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

  if (state.mode !== 'overworld') {
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
    case 'town_square':
      return '#d7b46a';
    case 'town_road':
      return '#b58d57';
    case 'town_gate':
      return '#c6a069';
    case 'town_wall':
      return '#7a6750';
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
    if (cat === 'all' || cat === 'potion' || cat === 'weapon' || cat === 'armor') {
      state.shopCategory = cat;
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

function usePotion(itemId: string): void {
  const it: Item | undefined = state.items.find((x) => x.id === itemId);
  if (!it || it.kind !== 'potion') {
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

function equipWeapon(itemId: string): void {
  const it: Item | undefined = state.items.find((x) => x.id === itemId);
  if (!it || it.kind !== 'weapon') {
    return;
  }
  if (!state.player.inventory.includes(itemId)) {
    return;
  }
  state.player.equipment.weaponItemId = itemId;
  state.log.push(t('item.equip.weapon', { name: it.name }));
}

function equipArmor(itemId: string): void {
  const it: Item | undefined = state.items.find((x) => x.id === itemId);
  if (!it || it.kind !== 'armor') {
    return;
  }
  if (!state.player.inventory.includes(itemId)) {
    return;
  }
  state.player.equipment.armorItemId = itemId;
  state.log.push(t('item.equip.armor', { name: it.name }));
}

function dropItem(itemId: string): void {
  const it: Item | undefined = state.items.find((x) => x.id === itemId);
  if (!it) {
    return;
  }
  if (!state.player.inventory.includes(itemId)) {
    return;
  }

  // Drop only if in dungeon; else just discard (simple for now)
  if (state.mode === 'dungeon') {
    const dungeon: Dungeon | undefined = getCurrentDungeon(state);
    if (dungeon) {
      it.mapRef = { kind: 'dungeon', dungeonId: dungeon.id };
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
  awardXp(q.rewardXp);
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function keyToAction(e: KeyboardEvent): Action | undefined {
  if (e.key === 'r' || e.key === 'R') {
    return { kind: 'toggleRenderer' };
  }
  if (e.key === 'f' || e.key === 'F') {
    return { kind: 'toggleFov' };
  }
  if (e.key === '?') {
    return { kind: 'help' };
  }

  if (e.key === 'p' || e.key === 'P') {
    return { kind: 'save' };
  }
  if (e.key === 'o' || e.key === 'O') {
    return { kind: 'load' };
  }

  if (e.key === 'i' || e.key === 'I') {
    return { kind: 'toggleInventory' };
  }
  if (e.key === 'b' || e.key === 'B') {
    return { kind: 'toggleShop' };
  }
  if (e.key === 'q' || e.key === 'Q') {
    return { kind: 'toggleQuest' };
  }
  if (e.key === 'h' || e.key === 'H') {
    return { kind: 'toggleStory' };
  }
  if (e.key === 'm' || e.key === 'M') {
    return { kind: 'toggleMap' };
  }

  if (e.key === 'g' || e.key === 'G' || e.key === ',') {
    return { kind: 'pickup' };
  }

  if (e.key === 'Enter') {
    return { kind: 'use' };
  }
  if (e.key === 'c' || e.key === 'C') {
    return { kind: 'cancelAuto' };
  }
  if (e.key === ' ') {
    return { kind: 'wait' };
  }

  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
    return { kind: 'move', dx: 0, dy: -1 * (e.shiftKey ? 5 : 1) };
  }
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
    return { kind: 'move', dx: 0, dy: 1 * (e.shiftKey ? 5 : 1) };
  }
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    return { kind: 'move', dx: -1 * (e.shiftKey ? 5 : 1), dy: 0 };
  }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    return { kind: 'move', dx: 1 * (e.shiftKey ? 5 : 1), dy: 0 };
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
  state.rendererMode = 'canvas';
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
  state.activePanel = state.activePanel === 'inventory' ? 'none' : 'inventory';
  render();
});
btnShop.addEventListener('click', () => {
  state.activePanel = state.activePanel === 'shop' ? 'none' : 'shop';
  if (state.activePanel === 'shop' && isStandingOnTown()) {
    ensureShopForTown(state, state.player.pos);
  }
  render();
});

btnStory.addEventListener('click', () => {
  state.activePanel = state.activePanel === 'story' ? 'none' : 'story';
  render();
});

btnMap.addEventListener('click', () => {
  handleAction({ kind: 'toggleMap' });
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
    quests: state.quests
  };
}

function doSave(): void {
  const data: SaveDataV3 = buildSaveData();
  saveToLocalStorage(data);
  state.log.push(t('log.saved'));
}

function applyLoadedSave(data: SaveDataV3): boolean {
  const rng: Rng = new Rng(data.worldSeed);
  const overworld: Overworld = new Overworld(data.worldSeed);
  const resolvedMode: Mode = data.mode === 'town' && (!data.townId || !data.townReturnPos) ? 'overworld' : data.mode;

  const dungeonsMap: Map<string, Dungeon> = new Map<string, Dungeon>();
  for (const d of data.dungeons) dungeonsMap.set(d.id, d);

  const shopsMap: Map<string, Shop> = new Map<string, Shop>();
  for (const s of data.shops) shopsMap.set(s.id, s);

  const townsMap: Map<string, Town> = new Map<string, Town>();
  if (resolvedMode === 'town' && data.townId && data.townReturnPos) {
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

  const loadedClass: CharacterClass = data.playerClass ?? player.classType ?? 'warrior';
  const loadedGender: Gender = data.playerGender ?? player.gender ?? 'female';
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
    currentTownId: resolvedMode === 'town' ? data.townId : undefined,
    townReturnPos: resolvedMode === 'town' ? data.townReturnPos : undefined,
    player,
    playerClass: loadedClass,
    story: loadedStory,
    entities: data.entities,
    items: data.items,
    shops: shopsMap,
    rendererMode: state.rendererMode,
    useFov: state.useFov,
    activePanel: (data.activePanel as PanelMode) ?? 'none',
    shopCategory: 'all',
    turnCounter: data.turnCounter ?? 0,
    quests: data.quests ?? [],
    mapOpen: true,
    mapCursor: { x: 0, y: 0 },
    destination: undefined,
    autoPath: undefined,
    log: new MessageLog(160)
  };

  if (resolvedMode === 'overworld' && player.mapRef.kind === 'town') {
    player.mapRef = { kind: 'overworld' };
  }
  if (resolvedMode === 'town' && data.townId && player.mapRef.kind !== 'town') {
    player.mapRef = { kind: 'town', townId: data.townId };
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

function doLoad(): void {
  const data: SaveDataV3 | undefined = loadFromLocalStorage();
  if (!data) {
    state.log.push(t('log.load.none'));
    return;
  }
  applyLoadedSave(data);
}

function exportSaveJson(): void {
  const code: string = serializeSaveDataBase62(buildSaveData());
  openSaveModal('export', code);
  state.log.push(t('log.save.shareReady'));
}

function importSaveJson(): void {
  openSaveModal('import');
}

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

function closeSaveModal(): void {
  saveModal.classList.add('hidden');
}

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

function layoutFromBaseId(baseId: string): DungeonLayout {
  return baseId.startsWith('cave_') ? 'caves' : 'rooms';
}

function rebuildDungeonStackFromPlayer(data: SaveDataV3, player: Entity): DungeonStackFrame[] {
  const mapRef = player.mapRef;
  if (mapRef.kind !== 'dungeon') {
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
