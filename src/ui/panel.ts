import type { CharacterStory, Entity, Item, Shop, ShopEconomy, PanelContext, Quest } from '../types';
import { GearRarity, ItemKind, PanelMode, QuestKind, ShopSpecialty } from '../types/enums';
import { t } from '../i18n';

/**
 * Renders the side panel based on the current mode.
 * @param ctx The panel context.
 * @returns The HTML string.
 */
export function renderPanelHtml(ctx: PanelContext): string {
  if (ctx.mode === PanelMode.Inventory) {
    return renderInventory(ctx.player, ctx.items);
  }
  if (ctx.mode === PanelMode.Shop) {
    return renderShop(ctx.player, ctx.items, ctx.activeShop, ctx.canShop, ctx.shopCategory, ctx.shopEconomy, ctx.shopBuyPrices, ctx.shopSellPrices);
  }
  if (ctx.mode === PanelMode.Quest) {
    return renderQuestLog(ctx.quests, ctx.activeTownId, ctx.items);
  }
  if (ctx.mode === PanelMode.Story) {
    return renderStory(ctx.story, ctx.player);
  }
  const invTag: string = `<b>${escapeHtml(t('panel.tag.inventory'))}</b>`;
  const shopTag: string = `<b>${escapeHtml(t('panel.tag.shop'))}</b>`;
  const questTag: string = `<b>${escapeHtml(t('panel.tag.quest'))}</b>`;
  const storyTag: string = `<b>${escapeHtml(t('panel.tag.story'))}</b>`;
  return `<div class="small muted">${t('panel.default', { inv: invTag, shop: shopTag, quest: questTag, story: storyTag })}</div>`;
}

/**
 * Renders a rarity badge for an item.
 * @param item The item.
 * @returns The HTML string.
 */
function renderRarityBadge(item: Item): string {
  const rarity: GearRarity = item.rarity ?? GearRarity.Common;
  const label: string = t(`rarity.${rarity}.label`);
  return `<span class="rarityBadge rarity-${rarity}">${escapeHtml(label)}</span>`;
}

/**
 * Formats the extra stat info for an item.
 * @param it The item.
 * @returns The formatted string.
 */
function formatItemExtra(it: Item): string {
  if (it.kind === ItemKind.Potion) {
    return t('panel.item.extra.potion', { amount: it.healAmount ?? 0 });
  }

  const parts: string[] = [];
  if (it.kind === ItemKind.Weapon) {
    parts.push(t('panel.item.extra.attack', { amount: it.attackBonus ?? 0 }));
    if ((it.critChance ?? 0) > 0) {
      parts.push(t('panel.item.extra.crit', { amount: it.critChance ?? 0 }));
    }
    if ((it.lifesteal ?? 0) > 0) {
      parts.push(t('panel.item.extra.leech', { amount: it.lifesteal ?? 0 }));
    }
  }
  if (it.kind === ItemKind.Armor) {
    parts.push(t('panel.item.extra.defense', { amount: it.defenseBonus ?? 0 }));
    if ((it.dodgeChance ?? 0) > 0) {
      parts.push(t('panel.item.extra.dodge', { amount: it.dodgeChance ?? 0 }));
    }
    if ((it.thorns ?? 0) > 0) {
      parts.push(t('panel.item.extra.thorns', { amount: it.thorns ?? 0 }));
    }
  }

  return parts.length > 0 ? `(${parts.join(', ')})` : '';
}

/**
 * Renders the inventory panel.
 * @param player The player entity.
 * @param items The item list.
 * @returns The HTML string.
 */
function renderInventory(player: Entity, items: Item[]): string {
  const invItems: Item[] = player.inventory.map((id: string) => items.find((x) => x.id === id)).filter((x: Item | undefined): x is Item => !!x);

  const weaponId: string | undefined = player.equipment.weaponItemId;
  const armorId: string | undefined = player.equipment.armorItemId;

  const weapon: Item | undefined = weaponId ? items.find((x) => x.id === weaponId) : undefined;
  const armor: Item | undefined = armorId ? items.find((x) => x.id === armorId) : undefined;

  const lines: string[] = [];
  lines.push(
    `<div class="panelTitle"><b>${escapeHtml(t('panel.inventory.title'))}</b><span class="tag">${escapeHtml(t('panel.inventory.close'))}</span></div>`
  );
  lines.push(
    `<div class="small panelMeta">${escapeHtml(t('panel.inventory.gold', { gold: player.gold }))} • ${escapeHtml(
      t('panel.inventory.level', { level: player.level })
    )} • ${escapeHtml(t('panel.inventory.xp', { xp: player.xp }))}</div>`
  );
  lines.push(
    `<div class="small panelLine">${escapeHtml(t('panel.inventory.weapon'))} ` +
      `${weapon ? `<b>${escapeHtml(weapon.name)}</b>` : `<span class="muted">${escapeHtml(t('panel.inventory.none'))}</span>`}</div>`
  );
  lines.push(
    `<div class="small panelLine">${escapeHtml(t('panel.inventory.armor'))} ` +
      `${armor ? `<b>${escapeHtml(armor.name)}</b>` : `<span class="muted">${escapeHtml(t('panel.inventory.none'))}</span>`}</div>`
  );
  lines.push(`<div class="sep"></div>`);

  if (invItems.length === 0) {
    lines.push(`<div class="small muted">${escapeHtml(t('panel.inventory.empty'))}</div>`);
    return lines.join('');
  }

  lines.push(`<div class="grid">`);
  for (const it of invItems.slice(0, 60)) {
    const extra: string = formatItemExtra(it);
    const actions: string[] = [];

    if (it.kind === ItemKind.Potion) {
      actions.push(`<button class="btnTiny" data-act="use" data-item="${it.id}">${escapeHtml(t('panel.inventory.use'))}</button>`);
    }
    if (it.kind === ItemKind.Weapon) {
      const currentWeaponId: string | undefined = player.equipment.weaponItemId;
      const currentWeapon = currentWeaponId ? items.find((x) => x.id === currentWeaponId) : undefined;
      const curAtk: number = currentWeapon?.attackBonus ?? 0;
      const newAtk: number = it.attackBonus ?? 0;
      const delta: number = newAtk - curAtk;
      const deltaLabel: string = delta === 0 ? '' : delta > 0 ? `(+${delta})` : `(${delta})`;
      actions.push(
        `<button class="btnTiny" data-act="equipWeapon" data-item="${it.id}">${escapeHtml(
          t('panel.inventory.equip', { delta: deltaLabel }).trim()
        )}</button>`
      );
    }
    if (it.kind === ItemKind.Armor) {
      const currentArmorId: string | undefined = player.equipment.armorItemId;
      const currentArmor = currentArmorId ? items.find((x) => x.id === currentArmorId) : undefined;
      const curDef: number = currentArmor?.defenseBonus ?? 0;
      const newDef: number = it.defenseBonus ?? 0;
      const delta: number = newDef - curDef;
      const deltaLabel: string = delta === 0 ? '' : delta > 0 ? `(+${delta})` : `(${delta})`;
      actions.push(
        `<button class="btnTiny" data-act="equipArmor" data-item="${it.id}">${escapeHtml(
          t('panel.inventory.equip', { delta: deltaLabel }).trim()
        )}</button>`
      );
    }

    actions.push(`<button class="btnTiny" data-act="drop" data-item="${it.id}">${escapeHtml(t('panel.inventory.drop'))}</button>`);

    const rarityBadge: string = renderRarityBadge(it);
    lines.push(`<div class="small">• ${rarityBadge}${escapeHtml(it.name)} <span class="muted">${escapeHtml(extra)}</span></div>`);
    lines.push(`<div class="row" style="justify-content:flex-end;">${actions.join('')}</div>`);
  }
  lines.push(`</div>`);

  return lines.join('');
}

/**
 * Renders the shop panel.
 * @param player The player entity.
 * @param items The item list.
 * @param shop The active shop.
 * @param canShop Whether the player can shop.
 * @param category The active shop category.
 * @param economy The shop economy info.
 * @param buyPrices The computed buy prices.
 * @param sellPrices The computed sell prices.
 * @returns The HTML string.
 */
function renderShop(
  player: Entity,
  items: Item[],
  shop: Shop | undefined,
  canShop: boolean,
  category: ShopSpecialty,
  economy: ShopEconomy | undefined,
  buyPrices: Record<string, number> | undefined,
  sellPrices: Record<string, number> | undefined
): string {
  const lines: string[] = [];
  lines.push(
    `<div class="panelTitle"><b>${escapeHtml(t('panel.shop.title'))}</b><span class="tag">${escapeHtml(t('panel.shop.close'))}</span></div>`
  );

  if (!canShop) {
    lines.push(`<div class="small muted">${escapeHtml(t('panel.shop.needTownTile'))}</div>`);
    return lines.join('');
  }

  if (!shop) {
    lines.push(`<div class="small muted">${escapeHtml(t('panel.shop.noShop'))}</div>`);
    return lines.join('');
  }

  lines.push(`<div class="small panelMeta">${escapeHtml(t('panel.shop.gold', { gold: player.gold }))}</div>`);
  if (economy) {
    const specialtyLabel: string =
      economy.specialty === ShopSpecialty.All ? t('panel.shop.specialty.general') : t(`panel.shop.specialty.${economy.specialty}`);
    const featuredItem: Item | undefined = economy.featuredItemId ? items.find((x) => x.id === economy.featuredItemId) : undefined;
    const featuredText: string = featuredItem
      ? t('panel.shop.featured', { item: `<b>${escapeHtml(featuredItem.name)}</b>`, discount: 20 })
      : t('panel.shop.featured.none');
    lines.push(
      `<div class="small shopMeta">` +
        `${escapeHtml(
          t('panel.shop.economy', {
            mood: economy.moodLabel,
            specialty: specialtyLabel,
            restock: economy.restockIn
          })
        )}` +
        `</div>`
    );
    lines.push(`<div class="small shopDeal">${featuredText}</div>`);
  }
  lines.push(
    `<div class="row" style="margin-top:6px;">` +
      `<button class="btnTiny" data-act="shopCat" data-cat="all">${escapeHtml(t('panel.shop.filter.all'))}</button>` +
      `<button class="btnTiny" data-act="shopCat" data-cat="potion">${escapeHtml(t('panel.shop.filter.potions'))}</button>` +
      `<button class="btnTiny" data-act="shopCat" data-cat="weapon">${escapeHtml(t('panel.shop.filter.weapons'))}</button>` +
      `<button class="btnTiny" data-act="shopCat" data-cat="armor">${escapeHtml(t('panel.shop.filter.armor'))}</button>` +
      `</div>`
  );
  lines.push(`<div class="sep"></div>`);
  lines.push(`<div class="panelSectionTitle">${escapeHtml(t('panel.shop.buy'))}</div>`);
  lines.push(`<div class="grid">`);

  for (const id of shop.stockItemIds.slice(0, 40)) {
    const it: Item | undefined = items.find((x) => x.id === id);
    if (!it) {
      continue;
    }
    if (category !== ShopSpecialty.All && it.kind !== category) {
      continue;
    }

    const price: number = buyPrices?.[it.id] ?? it.value;
    const extra: string = formatItemExtra(it);

    const rarityBadge: string = renderRarityBadge(it);
    const isFeatured: boolean = economy?.featuredItemId === it.id;
    const canAfford: boolean = player.gold >= price;
    lines.push(
      `<div class="small">• ${rarityBadge}${escapeHtml(it.name)} ` +
        `${isFeatured ? `<span class=\"dealTag\">${escapeHtml(t('panel.shop.deal'))}</span>` : ''}` +
        ` <span class="muted">${escapeHtml(extra)}</span> ` +
        `<span class="priceTag ${canAfford ? 'priceOk' : 'priceBad'}">${escapeHtml(t('panel.price', { price }))}</span>` +
        `</div>`
    );
    lines.push(
      `<div class="row" style="justify-content:flex-end;">` +
        `<button class="btnTiny" data-act="buy" data-item="${it.id}" ${canAfford ? '' : 'disabled'}>${escapeHtml(t('panel.shop.buy'))}</button>` +
        `</div>`
    );
  }
  lines.push(`</div>`);

  lines.push(`<div class="sep"></div>`);
  lines.push(`<div class="panelSectionTitle">${escapeHtml(t('panel.shop.sell'))}</div>`);

  const invItems: Item[] = player.inventory.map((iid: string) => items.find((x) => x.id === iid)).filter((x: Item | undefined): x is Item => !!x);

  if (invItems.length === 0) {
    lines.push(`<div class="small muted">${escapeHtml(t('panel.shop.sell.none'))}</div>`);
    return lines.join('');
  }

  lines.push(`<div class="grid">`);
  for (const it of invItems.slice(0, 30)) {
    const price: number = sellPrices?.[it.id] ?? Math.max(1, Math.floor(it.value * 0.5));
    const rarityBadge: string = renderRarityBadge(it);
    lines.push(
      `<div class="small">• ${rarityBadge}${escapeHtml(it.name)} <span class="priceTag">${escapeHtml(t('panel.price', { price }))}</span></div>`
    );
    lines.push(
      `<div class="row" style="justify-content:flex-end;"><button class="btnTiny" data-act="sell" data-item="${it.id}">${escapeHtml(
        t('panel.shop.sell.action')
      )}</button></div>`
    );
  }
  lines.push(`</div>`);

  return lines.join('');
}

/**
 * Renders the quest log panel.
 * @param quests The available quests.
 * @param activeTownId The active town id.
 * @param items The item list.
 * @returns The HTML string.
 */
function renderQuestLog(quests: import('../core/types').Quest[], activeTownId: string | undefined, items: Item[]): string {
  const lines: string[] = [];
  lines.push(
    `<div class="panelTitle"><b>${escapeHtml(t('panel.quest.title'))}</b><span class="tag">${escapeHtml(t('panel.quest.close'))}</span></div>`
  );

  if (!activeTownId) {
    lines.push(`<div class="small muted">${escapeHtml(t('panel.quest.needTown'))}</div>`);
  }

  const scoped: import('../core/types').Quest[] = activeTownId ? quests.filter((q) => q.townId === activeTownId) : quests;
  if (scoped.length === 0) {
    lines.push(`<div class="small muted">${escapeHtml(t('panel.quest.none'))}</div>`);
    return lines.join('');
  }

  lines.push(`<div class="sep"></div>`);
  for (const q of scoped) {
    const status: string = q.turnedIn ? t('quest.status.turnedIn') : q.completed ? t('quest.status.complete') : t('quest.status.active');
    const progress: string =
      q.kind === QuestKind.ReachDepth
        ? t('panel.quest.progress.depth', { current: q.currentCount, target: q.targetCount })
        : t('panel.quest.progress.count', { current: q.currentCount, target: q.targetCount });
    const rewardItem: Item | undefined = q.rewardItemId ? items.find((it) => it.id === q.rewardItemId) : undefined;
    const rewardOptions: Item[] = q.rewardItemIds
      ? q.rewardItemIds.map((id) => items.find((it) => it.id === id)).filter((it): it is Item => !!it)
      : [];
    const rewardItemLabel: string = rewardItem
      ? t('quest.reward.itemChosen', {
          item: `${renderRarityBadge(rewardItem)}${escapeHtml(rewardItem.name)}`,
          chosen: `<span class=\"tag tagChosen\">${escapeHtml(t('panel.quest.chosen'))}</span>`
        })
      : '';
    lines.push(`<div class="small"><b>${escapeHtml(q.description)}</b></div>`);
    lines.push(
      `<div class="small panelLine">${escapeHtml(progress)} • ${t('panel.quest.reward', {
        gold: q.rewardGold,
        xp: q.rewardXp,
        item: rewardItemLabel
      })}</div>`
    );
    if (!rewardItem && rewardOptions.length > 0) {
      const optionLabels: string = rewardOptions
        .map((it) => `${renderRarityBadge(it)}${escapeHtml(it.name)}`)
        .join(` <span class="muted">${escapeHtml(t('panel.quest.or'))}</span> `);
      lines.push(`<div class="small panelLine">${t('panel.quest.choose1', { options: optionLabels })}</div>`);
    }
    lines.push(`<div class="small muted">${escapeHtml(t('panel.quest.status', { status }))}</div>`);

    if (activeTownId && q.townId === activeTownId && q.completed && !q.turnedIn) {
      if (!rewardItem && rewardOptions.length > 0) {
        for (const option of rewardOptions) {
          lines.push(
            `<div class="row" style="justify-content:flex-end;">` +
              `<button class="btnTiny" data-act="chooseReward" data-quest="${q.id}" data-reward="${option.id}">` +
              `${renderRarityBadge(option)}${escapeHtml(t('panel.quest.choose', { item: option.name }))}` +
              `</button>` +
              `</div>`
          );
        }
      } else {
        lines.push(
          `<div class="row" style="justify-content:flex-end;"><button class="btnTiny" data-act="turnIn" data-quest="${q.id}">${escapeHtml(
            t('panel.quest.turnIn')
          )}</button></div>`
        );
      }
    }
    lines.push(`<div class="sep"></div>`);
  }

  return lines.join('');
}

/**
 * Renders the story panel.
 * @param story The character story.
 * @param player The player entity.
 * @returns The HTML string.
 */
function renderStory(story: CharacterStory, player: Entity): string {
  const lines: string[] = [];
  lines.push(
    `<div class="panelTitle"><b>${escapeHtml(t('panel.story.title'))}</b><span class="tag">${escapeHtml(t('panel.story.close'))}</span></div>`
  );
  lines.push(`<div class="small panelLine">${escapeHtml(t('panel.story.subtitle', { name: player.name }))}</div>`);
  lines.push(`<div class="sep"></div>`);

  lines.push(`<div class="panelSectionTitle">${escapeHtml(t('story.section.origin'))}</div>`);
  lines.push(`<div class="small">${escapeHtml(story.origin)}</div>`);
  lines.push(`<div class="panelSectionTitle marginTop10">${escapeHtml(t('story.section.upbringing'))}</div>`);
  lines.push(`<div class="small">${escapeHtml(story.upbringing)}</div>`);
  lines.push(`<div class="panelSectionTitle marginTop10">${escapeHtml(t('story.section.turningPoint'))}</div>`);
  lines.push(`<div class="small">${escapeHtml(story.turningPoint)}</div>`);
  lines.push(`<div class="panelSectionTitle marginTop10">${escapeHtml(t('story.section.ambitions'))}</div>`);
  lines.push(`<div class="small">${escapeHtml(story.ambitions)}</div>`);

  if (story.events.length > 0) {
    lines.push(`<div class="sep"></div>`);
    lines.push(`<div class="panelSectionTitle">${escapeHtml(t('story.section.timeline'))}</div>`);
    for (const ev of story.events.slice().reverse().slice(0, 24)) {
      lines.push(`<div class="small"><b>${escapeHtml(ev.title)}</b> <span class="muted">• ${escapeHtml(ev.detail)}</span></div>`);
    }
  }

  return lines.join('');
}

/**
 * Escapes HTML entities in a string.
 * @param s The input string.
 * @returns The escaped string.
 */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
