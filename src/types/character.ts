import type { CharacterClass } from './enums';

export type ClassConfig = {
  name: string;
  description: string;
  maxHp: number;
  baseAttack: number;
  baseDefense: number;
  strength: number;
  agility: number;
  intellect: number;
};

export type GearSpec = {
  name: string;
  attackBonus?: number;
  defenseBonus?: number;
  value: number;
  upgradeName: string;
};

export type ClassGearConfig = {
  weapon: GearSpec & { attackBonus: number };
  armor: GearSpec & { defenseBonus: number };
};
