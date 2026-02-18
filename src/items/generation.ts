import type { Item, CharacterClass } from '../core/types';
import { ItemKind, GearRarity } from '../core/types';
import { Rng } from '../core/rng';
import { t } from '../i18n';
import {
  type RarityConfig,
  type WeaponTemplate,
  type ArmorTemplate,
  type GearAffix,
  RARITY_CONFIGS,
  WEAPON_BASES,
  WEAPON_PREFIXES,
  WEAPON_SUFFIXES,
  ARMOR_BASES,
  ARMOR_PREFIXES,
  ARMOR_SUFFIXES
} from '../config/items';
import { type ClassGearConfig, type GearSpec, CLASS_GEAR } from '../config/classes';

export interface GameStateForGear {
  worldSeed: number;
  items: Item[];
  player: {
    inventory: string[];
    equipment: {
      weaponItemId?: string;
      armorItemId?: string;
    };
  };
  log: string[];
}

export class ItemGenerator {
  private randChoice<T>(arr: readonly T[], rng: Rng): T {
    return arr[rng.nextInt(0, arr.length)];
  }

  public buildItemName(prefix: string | undefined, base: string, suffix: string | undefined): string {
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

  public rollRarity(power: number, rng: Rng): RarityConfig {
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

  public generateWeaponLoot(id: string, power: number, rng: Rng): Item {
    const rarity: RarityConfig = this.rollRarity(Math.max(1, power), rng);
    const base: WeaponTemplate = this.randChoice(WEAPON_BASES, rng);
    const prefix: GearAffix | undefined = rng.nextInt(0, 100) < 65 ? this.randChoice(WEAPON_PREFIXES, rng) : undefined;
    const suffix: GearAffix | undefined = rng.nextInt(0, 100) < 55 ? this.randChoice(WEAPON_SUFFIXES, rng) : undefined;
    const scaling: number = Math.max(1, Math.floor(Math.max(1, power) / base.scale));
    const variance: number = rng.nextInt(0, 2);
    const affixAttack: number = (prefix?.attackBonus ?? 0) + (suffix?.attackBonus ?? 0);
    const attackBonus: number = Math.max(1, base.baseAttack + scaling + variance + rarity.attackBonus + affixAttack);
    const critChance: number = (prefix?.critChance ?? 0) + (suffix?.critChance ?? 0) + rarity.weaponCritChance;
    const lifesteal: number = (prefix?.lifesteal ?? 0) + (suffix?.lifesteal ?? 0) + rarity.weaponLifesteal;
    const value: number = Math.max(1, Math.round((16 + attackBonus * 9) * rarity.valueMultiplier));
    const nameBase: string = this.buildItemName(prefix?.name, base.noun, suffix?.name);
    const name: string = `${rarity.namePrefix ? `${rarity.namePrefix} ` : ''}${nameBase}`.trim();
    return { id, kind: ItemKind.Weapon, name, attackBonus, value, rarity: rarity.key, critChance, lifesteal };
  }

  public generateArmorLoot(id: string, power: number, rng: Rng): Item {
    const rarity: RarityConfig = this.rollRarity(Math.max(1, power), rng);
    const base: ArmorTemplate = this.randChoice(ARMOR_BASES, rng);
    const prefix: GearAffix | undefined = rng.nextInt(0, 100) < 60 ? this.randChoice(ARMOR_PREFIXES, rng) : undefined;
    const suffix: GearAffix | undefined = rng.nextInt(0, 100) < 45 ? this.randChoice(ARMOR_SUFFIXES, rng) : undefined;
    const scaling: number = Math.max(1, Math.floor(Math.max(1, power) / base.scale));
    const variance: number = rng.nextInt(0, 2) === 0 ? 0 : 1;
    const affixDefense: number = (prefix?.defenseBonus ?? 0) + (suffix?.defenseBonus ?? 0);
    const defenseBonus: number = Math.max(1, base.baseDefense + scaling + variance + rarity.defenseBonus + affixDefense);
    const dodgeChance: number = (prefix?.dodgeChance ?? 0) + (suffix?.dodgeChance ?? 0) + rarity.armorDodgeChance;
    const thorns: number = (prefix?.thorns ?? 0) + (suffix?.thorns ?? 0) + rarity.armorThorns;
    const value: number = Math.max(1, Math.round((14 + defenseBonus * 8) * rarity.valueMultiplier));
    const nameBase: string = this.buildItemName(prefix?.name, base.noun, suffix?.name);
    const name: string = `${rarity.namePrefix ? `${rarity.namePrefix} ` : ''}${nameBase}`.trim();
    return { id, kind: ItemKind.Armor, name, defenseBonus, value, rarity: rarity.key, dodgeChance, thorns };
  }

  public createGearItem(
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

  public ensureStartingGear(state: GameStateForGear, classType: CharacterClass): void {
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
        : this.createGearItem(weaponId, ItemKind.Weapon, gear.weapon, gear.weapon.attackBonus, undefined, gear.weapon.value);

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
        : this.createGearItem(armorId, ItemKind.Armor, gear.armor, undefined, gear.armor.defenseBonus, gear.armor.value);

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

  public createClassUpgradeItem(classType: CharacterClass, slot: ItemKind.Weapon | ItemKind.Armor, id: string, upgradeLevel: number, rng: Rng): Item {
    const gear: ClassGearConfig = CLASS_GEAR[classType];
    const spec: GearSpec = slot === ItemKind.Weapon ? gear.weapon : gear.armor;
    const level: number = Math.max(1, upgradeLevel);
    const rarity: RarityConfig = this.rollRarity(level, rng);

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
}
