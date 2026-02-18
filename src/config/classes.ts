import type { CharacterClass, Entity, ClassConfig, GearSpec, ClassGearConfig } from '../types';
import { t } from '../i18n';

export const CLASS_CONFIG: Record<CharacterClass, ClassConfig> = {
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

export const CLASS_GEAR: Record<CharacterClass, ClassGearConfig> = {
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

export function ensureClassAttributes(player: Entity, classType: CharacterClass): void {
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
