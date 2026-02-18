import { GearRarity } from '../core/types';
import { t } from '../i18n';

export type WeaponTemplate = {
  noun: string;
  baseAttack: number;
  scale: number;
};

export type ArmorTemplate = {
  noun: string;
  baseDefense: number;
  scale: number;
};

export type GearAffix = {
  name: string;
  attackBonus?: number;
  defenseBonus?: number;
  critChance?: number;
  dodgeChance?: number;
  lifesteal?: number;
  thorns?: number;
};

export type RarityConfig = {
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

export const WEAPON_PREFIXES: readonly GearAffix[] = [
  { name: t('weapon.prefix.sunforged'), attackBonus: 1 },
  { name: t('weapon.prefix.stormcall'), critChance: 3, attackBonus: 1 },
  { name: t('weapon.prefix.glimmering'), critChance: 4 },
  { name: t('weapon.prefix.nightfall'), critChance: 2 },
  { name: t('weapon.prefix.emberforged'), attackBonus: 1 },
  { name: t('weapon.prefix.voidbound'), lifesteal: 3 },
  { name: t('weapon.prefix.ironchant'), attackBonus: 1, critChance: 2 },
  { name: t('weapon.prefix.frostvein'), critChance: 3 }
] as const;

export const WEAPON_SUFFIXES: readonly GearAffix[] = [
  { name: t('weapon.suffix.fox'), critChance: 5 },
  { name: t('weapon.suffix.embers'), attackBonus: 1 },
  { name: t('weapon.suffix.depths'), lifesteal: 5 },
  { name: t('weapon.suffix.dawn'), critChance: 3 },
  { name: t('weapon.suffix.ruin'), attackBonus: 2 },
  { name: t('weapon.suffix.tempest'), critChance: 4, attackBonus: 1 },
  { name: t('weapon.suffix.echoes'), lifesteal: 4 }
] as const;

export const WEAPON_BASES: readonly WeaponTemplate[] = [
  { noun: t('weapon.base.blade'), baseAttack: 2, scale: 2 },
  { noun: t('weapon.base.halberd'), baseAttack: 3, scale: 3 },
  { noun: t('weapon.base.longspear'), baseAttack: 3, scale: 2 },
  { noun: t('weapon.base.warhammer'), baseAttack: 4, scale: 4 },
  { noun: t('weapon.base.scimitar'), baseAttack: 2, scale: 1 },
  { noun: t('weapon.base.greatsword'), baseAttack: 4, scale: 3 },
  { noun: t('weapon.base.quarterstaff'), baseAttack: 2, scale: 2 }
] as const;

export const ARMOR_PREFIXES: readonly GearAffix[] = [
  { name: t('armor.prefix.runeward'), defenseBonus: 1 },
  { name: t('armor.prefix.starwoven'), dodgeChance: 3 },
  { name: t('armor.prefix.stoneplate'), defenseBonus: 2 },
  { name: t('armor.prefix.whispersteel'), dodgeChance: 4 },
  { name: t('armor.prefix.moonlit'), dodgeChance: 6 },
  { name: t('armor.prefix.ashen'), thorns: 2 },
  { name: t('armor.prefix.verdant'), thorns: 3 }
] as const;

export const ARMOR_SUFFIXES: readonly GearAffix[] = [
  { name: t('armor.suffix.resilience'), defenseBonus: 1 },
  { name: t('armor.suffix.mirage'), dodgeChance: 6 },
  { name: t('armor.suffix.glacier'), defenseBonus: 1 },
  { name: t('armor.suffix.sparks'), thorns: 2 },
  { name: t('armor.suffix.sentinel'), defenseBonus: 2 },
  { name: t('armor.suffix.cinders'), thorns: 3 }
] as const;

export const ARMOR_BASES: readonly ArmorTemplate[] = [
  { noun: t('armor.base.vestments'), baseDefense: 1, scale: 3 },
  { noun: t('armor.base.scaleMail'), baseDefense: 2, scale: 2 },
  { noun: t('armor.base.battlemantle'), baseDefense: 2, scale: 3 },
  { noun: t('armor.base.coat'), baseDefense: 1, scale: 2 },
  { noun: t('armor.base.carapace'), baseDefense: 3, scale: 4 },
  { noun: t('armor.base.guardplate'), baseDefense: 3, scale: 3 }
] as const;

export const RARITY_CONFIGS: readonly RarityConfig[] = [
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

export const RARITY_CONFIG_BY_KEY: Record<GearRarity, RarityConfig> = RARITY_CONFIGS.reduce(
  (acc: Record<GearRarity, RarityConfig>, cfg: RarityConfig) => {
    acc[cfg.key] = cfg;
    return acc;
  },
  {} as Record<GearRarity, RarityConfig>
);
