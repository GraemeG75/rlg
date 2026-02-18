import type { Item, Shop, ShopEconomy, ShopSpecialty, ItemKind, GearRarity } from '../types';
import { ShopSpecialty as ShopSpecialtyEnum, ItemKind as ItemKindEnum, GearRarity as GearRarityEnum } from '../types/enums';
import type { GameStateForShops } from '../interfaces';
import { Rng } from '../core/rng';
import { hash2D } from '../core/hash';
import { SHOP_RESTOCK_INTERVAL } from '../core/const';
import { t } from '../i18n';

export class ShopManager {
  public getShopEconomy(state: GameStateForShops, shop: Shop): ShopEconomy {
    const cycle: number = Math.floor(state.turnCounter / SHOP_RESTOCK_INTERVAL);
    const seed: number = hash2D(state.worldSeed, shop.townWorldPos.x, shop.townWorldPos.y) ^ (cycle * 0x9e3779b9) ^ 0x5f10;
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

    let specialty: ShopSpecialty = ShopSpecialtyEnum.All;
    const specialtyRoll: number = rng.nextInt(0, 100);
    if (specialtyRoll >= 40) {
      const roll: number = rng.nextInt(0, 3);
      specialty = roll === 0 ? ShopSpecialtyEnum.Potion : roll === 1 ? ShopSpecialtyEnum.Weapon : ShopSpecialtyEnum.Armor;
    }

    const featuredItemId: string | undefined = this.getFeaturedShopItemId(shop, rng);
    const restockIn: number = SHOP_RESTOCK_INTERVAL - (state.turnCounter % SHOP_RESTOCK_INTERVAL);

    return { moodLabel, specialty, buyMultiplier, sellMultiplier, featuredItemId, restockIn };
  }

  public getFeaturedShopItemId(shop: Shop, rng: Rng): string | undefined {
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

  public specialtyMatchesItem(specialty: ShopSpecialty, kind: ItemKind): boolean {
    switch (specialty) {
      case ShopSpecialtyEnum.All:
        return true;
      case ShopSpecialtyEnum.Potion:
        return kind === ItemKindEnum.Potion;
      case ShopSpecialtyEnum.Weapon:
        return kind === ItemKindEnum.Weapon;
      case ShopSpecialtyEnum.Armor:
        return kind === ItemKindEnum.Armor;
      default:
        return false;
    }
  }

  public getRarityPriceMultiplier(item: Item): number {
    const rarity: GearRarity = item.rarity ?? GearRarityEnum.Common;
    switch (rarity) {
      case GearRarityEnum.Uncommon:
        return 1.03;
      case GearRarityEnum.Rare:
        return 1.06;
      case GearRarityEnum.Epic:
        return 1.1;
      case GearRarityEnum.Legendary:
        return 1.15;
      case GearRarityEnum.Common:
      default:
        return 1;
    }
  }

  public getShopBuyPrice(shop: Shop, item: Item, economy: ShopEconomy): number {
    let multiplier: number = economy.buyMultiplier;
    if (economy.specialty !== ShopSpecialtyEnum.All) {
      multiplier += this.specialtyMatchesItem(economy.specialty, item.kind) ? -0.08 : 0.04;
    }
    if (economy.featuredItemId && economy.featuredItemId === item.id) {
      multiplier *= 0.8;
    }
    multiplier *= this.getRarityPriceMultiplier(item);
    return Math.max(1, Math.round(item.value * multiplier));
  }

  public getShopSellPrice(shop: Shop, item: Item, economy: ShopEconomy): number {
    let multiplier: number = economy.sellMultiplier;
    if (economy.specialty !== ShopSpecialtyEnum.All) {
      multiplier += this.specialtyMatchesItem(economy.specialty, item.kind) ? 0.03 : -0.02;
    }
    multiplier *= this.getRarityPriceMultiplier(item);
    return Math.max(1, Math.round(item.value * multiplier));
  }

  public buildShopPricing(
    state: GameStateForShops,
    shop: Shop
  ): { economy: ShopEconomy; buyPrices: Record<string, number>; sellPrices: Record<string, number> } {
    const economy: ShopEconomy = this.getShopEconomy(state, shop);
    const buyPrices: Record<string, number> = {};
    const sellPrices: Record<string, number> = {};

    for (const id of shop.stockItemIds) {
      const it: Item | undefined = state.items.find((x) => x.id === id);
      if (!it) {
        continue;
      }
      buyPrices[id] = this.getShopBuyPrice(shop, it, economy);
    }

    for (const iid of state.player.inventory) {
      const it: Item | undefined = state.items.find((x) => x.id === iid);
      if (!it) {
        continue;
      }
      sellPrices[iid] = this.getShopSellPrice(shop, it, economy);
    }

    return { economy, buyPrices, sellPrices };
  }
}
