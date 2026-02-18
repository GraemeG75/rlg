import type { Point } from './common';
import type { MapRef } from './entity';
import type { ItemKind, GearRarity } from './enums';

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
