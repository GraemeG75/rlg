import type { Entity, GearRarity, Item, Shop, ShopEconomy } from '../core/types';

export type PanelMode = 'none' | 'inventory' | 'shop' | 'quest';

export type PanelContext = {
  mode: PanelMode;
  player: Entity;
  items: Item[];
  activeShop?: Shop;
  canShop: boolean;
  quests: import('../core/types').Quest[];
  activeTownId?: string;
  shopCategory: 'all' | 'potion' | 'weapon' | 'armor';
  shopEconomy?: ShopEconomy;
  shopBuyPrices?: Record<string, number>;
  shopSellPrices?: Record<string, number>;
};

export function renderPanelHtml(ctx: PanelContext): string {
  if (ctx.mode === 'inventory') {
    return renderInventory(ctx.player, ctx.items);
  }
  if (ctx.mode === 'shop') {
    return renderShop(ctx.player, ctx.items, ctx.activeShop, ctx.canShop, ctx.shopCategory, ctx.shopEconomy, ctx.shopBuyPrices, ctx.shopSellPrices);
  }
  if (ctx.mode === 'quest') {
    return renderQuestLog(ctx.quests, ctx.activeTownId, ctx.items);
  }
  return `<div class="small muted">Panels: <b>I</b> inventory • <b>B</b> shop (in town) • <b>Q</b> quests (in town)</div>`;
}

const RARITY_LABEL: Record<GearRarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary'
};

function renderRarityBadge(item: Item): string {
  const rarity: GearRarity = item.rarity ?? 'common';
  const label: string = RARITY_LABEL[rarity];
  return `<span class="rarityBadge rarity-${rarity}">${escapeHtml(label)}</span>`;
}

function formatItemExtra(it: Item): string {
  if (it.kind === 'potion') {
    return `(+${it.healAmount ?? 0} HP)`;
  }

  const parts: string[] = [];
  if (it.kind === 'weapon') {
    parts.push(`+${it.attackBonus ?? 0} Atk`);
    if ((it.critChance ?? 0) > 0) {
      parts.push(`+${it.critChance}% Crit`);
    }
    if ((it.lifesteal ?? 0) > 0) {
      parts.push(`+${it.lifesteal}% Leech`);
    }
  }
  if (it.kind === 'armor') {
    parts.push(`+${it.defenseBonus ?? 0} Def`);
    if ((it.dodgeChance ?? 0) > 0) {
      parts.push(`+${it.dodgeChance}% Dodge`);
    }
    if ((it.thorns ?? 0) > 0) {
      parts.push(`+${it.thorns} Thorns`);
    }
  }

  return parts.length > 0 ? `(${parts.join(', ')})` : '';
}

function renderInventory(player: Entity, items: Item[]): string {
  const invItems: Item[] = player.inventory.map((id: string) => items.find((x) => x.id === id)).filter((x: Item | undefined): x is Item => !!x);

  const weaponId: string | undefined = player.equipment.weaponItemId;
  const armorId: string | undefined = player.equipment.armorItemId;

  const weapon: Item | undefined = weaponId ? items.find((x) => x.id === weaponId) : undefined;
  const armor: Item | undefined = armorId ? items.find((x) => x.id === armorId) : undefined;

  const lines: string[] = [];
  lines.push(`<div class="panelTitle"><b>Inventory</b><span class="tag">I to close</span></div>`);
  lines.push(`<div class="small panelMeta">Gold: <b>${player.gold}</b> • Level: <b>${player.level}</b> • XP: <b>${player.xp}</b></div>`);
  lines.push(`<div class="small panelLine">Weapon: ${weapon ? `<b>${escapeHtml(weapon.name)}</b>` : `<span class="muted">none</span>`}</div>`);
  lines.push(`<div class="small panelLine">Armor: ${armor ? `<b>${escapeHtml(armor.name)}</b>` : `<span class="muted">none</span>`}</div>`);
  lines.push(`<div class="sep"></div>`);

  if (invItems.length === 0) {
    lines.push(`<div class="small muted">Empty.</div>`);
    return lines.join('');
  }

  lines.push(`<div class="grid">`);
  for (const it of invItems.slice(0, 60)) {
    const extra: string = formatItemExtra(it);
    const actions: string[] = [];

    if (it.kind === 'potion') {
      actions.push(`<button class="btnTiny" data-act="use" data-item="${it.id}">Use</button>`);
    }
    if (it.kind === 'weapon') {
      const currentWeaponId: string | undefined = player.equipment.weaponItemId;
      const currentWeapon = currentWeaponId ? items.find((x) => x.id === currentWeaponId) : undefined;
      const curAtk: number = currentWeapon?.attackBonus ?? 0;
      const newAtk: number = it.attackBonus ?? 0;
      const delta: number = newAtk - curAtk;
      actions.push(
        `<button class="btnTiny" data-act="equipWeapon" data-item="${it.id}">Equip ${delta === 0 ? '' : delta > 0 ? '(+' + delta + ')' : '(' + delta + ')'}</button>`
      );
    }
    if (it.kind === 'armor') {
      const currentArmorId: string | undefined = player.equipment.armorItemId;
      const currentArmor = currentArmorId ? items.find((x) => x.id === currentArmorId) : undefined;
      const curDef: number = currentArmor?.defenseBonus ?? 0;
      const newDef: number = it.defenseBonus ?? 0;
      const delta: number = newDef - curDef;
      actions.push(
        `<button class="btnTiny" data-act="equipArmor" data-item="${it.id}">Equip ${delta === 0 ? '' : delta > 0 ? '(+' + delta + ')' : '(' + delta + ')'}</button>`
      );
    }

    actions.push(`<button class="btnTiny" data-act="drop" data-item="${it.id}">Drop</button>`);

    const rarityBadge: string = renderRarityBadge(it);
    lines.push(`<div class="small">• ${rarityBadge}${escapeHtml(it.name)} <span class="muted">${escapeHtml(extra)}</span></div>`);
    lines.push(`<div class="row" style="justify-content:flex-end;">${actions.join('')}</div>`);
  }
  lines.push(`</div>`);

  return lines.join('');
}

function renderShop(
  player: Entity,
  items: Item[],
  shop: Shop | undefined,
  canShop: boolean,
  category: 'all' | 'potion' | 'weapon' | 'armor',
  economy: ShopEconomy | undefined,
  buyPrices: Record<string, number> | undefined,
  sellPrices: Record<string, number> | undefined
): string {
  const lines: string[] = [];
  lines.push(`<div class="panelTitle"><b>Town Shop</b><span class="tag">B to close</span></div>`);

  if (!canShop) {
    lines.push(`<div class="small muted">You need to be standing on a town tile (T) to shop.</div>`);
    return lines.join('');
  }

  if (!shop) {
    lines.push(`<div class="small muted">No shop found for this town.</div>`);
    return lines.join('');
  }

  lines.push(`<div class="small panelMeta">Gold: <b>${player.gold}</b></div>`);
  if (economy) {
    const specialtyLabel: string = economy.specialty === 'all' ? 'General' : economy.specialty[0].toUpperCase() + economy.specialty.slice(1);
    const featuredItem: Item | undefined = economy.featuredItemId ? items.find((x) => x.id === economy.featuredItemId) : undefined;
    const featuredText: string = featuredItem ? `Featured deal: <b>${escapeHtml(featuredItem.name)}</b> (-20%)` : 'Featured deal: none';
    lines.push(
      `<div class="small shopMeta">` +
        `Economy: <b>${escapeHtml(economy.moodLabel)}</b> • ` +
        `Specialty: <b>${escapeHtml(specialtyLabel)}</b> • ` +
        `Restock in <b>${economy.restockIn}</b>` +
        `</div>`
    );
    lines.push(`<div class="small shopDeal">${featuredText}</div>`);
  }
  lines.push(
    `<div class="row" style="margin-top:6px;">` +
      `<button class="btnTiny" data-act="shopCat" data-cat="all">All</button>` +
      `<button class="btnTiny" data-act="shopCat" data-cat="potion">Potions</button>` +
      `<button class="btnTiny" data-act="shopCat" data-cat="weapon">Weapons</button>` +
      `<button class="btnTiny" data-act="shopCat" data-cat="armor">Armor</button>` +
      `</div>`
  );
  lines.push(`<div class="sep"></div>`);
  lines.push(`<div class="panelSectionTitle">Buy</div>`);
  lines.push(`<div class="grid">`);

  for (const id of shop.stockItemIds.slice(0, 40)) {
    const it: Item | undefined = items.find((x) => x.id === id);
    if (!it) {
      continue;
    }
    if (category !== 'all' && it.kind !== category) {
      continue;
    }

    const price: number = buyPrices?.[it.id] ?? it.value;
    const extra: string = formatItemExtra(it);

    const rarityBadge: string = renderRarityBadge(it);
    const isFeatured: boolean = economy?.featuredItemId === it.id;
    const canAfford: boolean = player.gold >= price;
    lines.push(
      `<div class="small">• ${rarityBadge}${escapeHtml(it.name)} ` +
        `${isFeatured ? `<span class=\"dealTag\">Deal</span>` : ''}` +
        ` <span class="muted">${escapeHtml(extra)}</span> ` +
        `<span class="priceTag ${canAfford ? 'priceOk' : 'priceBad'}">${price}g</span>` +
        `</div>`
    );
    lines.push(
      `<div class="row" style="justify-content:flex-end;">` +
        `<button class="btnTiny" data-act="buy" data-item="${it.id}" ${canAfford ? '' : 'disabled'}>Buy</button>` +
        `</div>`
    );
  }
  lines.push(`</div>`);

  lines.push(`<div class="sep"></div>`);
  lines.push(`<div class="panelSectionTitle">Sell (from inventory)</div>`);

  const invItems: Item[] = player.inventory.map((iid: string) => items.find((x) => x.id === iid)).filter((x: Item | undefined): x is Item => !!x);

  if (invItems.length === 0) {
    lines.push(`<div class="small muted">Nothing to sell.</div>`);
    return lines.join('');
  }

  lines.push(`<div class="grid">`);
  for (const it of invItems.slice(0, 30)) {
    const price: number = sellPrices?.[it.id] ?? Math.max(1, Math.floor(it.value * 0.5));
    const rarityBadge: string = renderRarityBadge(it);
    lines.push(`<div class="small">• ${rarityBadge}${escapeHtml(it.name)} <span class="priceTag">${price}g</span></div>`);
    lines.push(`<div class="row" style="justify-content:flex-end;"><button class="btnTiny" data-act="sell" data-item="${it.id}">Sell</button></div>`);
  }
  lines.push(`</div>`);

  return lines.join('');
}

function renderQuestLog(quests: import('../core/types').Quest[], activeTownId: string | undefined, items: Item[]): string {
  const lines: string[] = [];
  lines.push(`<div class="panelTitle"><b>Quests</b><span class="tag">Q to close</span></div>`);

  if (!activeTownId) {
    lines.push(`<div class="small muted">Visit a town to manage quests.</div>`);
  }

  const scoped: import('../core/types').Quest[] = activeTownId ? quests.filter((q) => q.townId === activeTownId) : quests;
  if (scoped.length === 0) {
    lines.push(`<div class="small muted">No quests available.</div>`);
    return lines.join('');
  }

  lines.push(`<div class="sep"></div>`);
  for (const q of scoped) {
    const status: string = q.turnedIn ? 'Turned in' : q.completed ? 'Complete' : 'Active';
    const progress: string = q.kind === 'reachDepth' ? `Depth ${q.currentCount}/${q.targetCount}` : `Progress ${q.currentCount}/${q.targetCount}`;
    const rewardItem: Item | undefined = q.rewardItemId ? items.find((it) => it.id === q.rewardItemId) : undefined;
    const rewardOptions: Item[] = q.rewardItemIds
      ? q.rewardItemIds.map((id) => items.find((it) => it.id === id)).filter((it): it is Item => !!it)
      : [];
    const rewardItemLabel: string = rewardItem
      ? `, ${renderRarityBadge(rewardItem)}${escapeHtml(rewardItem.name)} <span class="tag tagChosen">Chosen</span>`
      : '';
    lines.push(`<div class="small"><b>${escapeHtml(q.description)}</b></div>`);
    lines.push(`<div class="small panelLine">${escapeHtml(progress)} • Reward: ${q.rewardGold}g, ${q.rewardXp} XP${rewardItemLabel}</div>`);
    if (!rewardItem && rewardOptions.length > 0) {
      const optionLabels: string = rewardOptions
        .map((it) => `${renderRarityBadge(it)}${escapeHtml(it.name)}`)
        .join(' <span class="muted">or</span> ');
      lines.push(`<div class="small panelLine">Choose 1: ${optionLabels}</div>`);
    }
    lines.push(`<div class="small muted">Status: ${escapeHtml(status)}</div>`);

    if (activeTownId && q.townId === activeTownId && q.completed && !q.turnedIn) {
      if (!rewardItem && rewardOptions.length > 0) {
        for (const option of rewardOptions) {
          lines.push(
            `<div class="row" style="justify-content:flex-end;">` +
              `<button class="btnTiny" data-act="chooseReward" data-quest="${q.id}" data-reward="${option.id}">` +
              `${renderRarityBadge(option)}Choose ${escapeHtml(option.name)}` +
              `</button>` +
              `</div>`
          );
        }
      } else {
        lines.push(
          `<div class="row" style="justify-content:flex-end;"><button class="btnTiny" data-act="turnIn" data-quest="${q.id}">Turn In</button></div>`
        );
      }
    }
    lines.push(`<div class="sep"></div>`);
  }

  return lines.join('');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
