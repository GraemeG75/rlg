import type { Entity, Item, Shop } from "../core/types";

export type PanelMode = "none" | "inventory" | "shop";

export type PanelContext = {
  mode: PanelMode;
  player: Entity;
  items: Item[];
  activeShop?: Shop;
  canShop: boolean;
};

export function renderPanelHtml(ctx: PanelContext): string {
  if (ctx.mode === "inventory") return renderInventory(ctx.player, ctx.items);
  if (ctx.mode === "shop") return renderShop(ctx.player, ctx.items, ctx.activeShop, ctx.canShop);
  return `<div class="small muted">Panels: <b>I</b> inventory • <b>B</b> shop (in town)</div>`;
}

function renderInventory(player: Entity, items: Item[]): string {
  const invItems: Item[] = player.inventory
    .map((id: string) => items.find((x) => x.id === id))
    .filter((x: Item | undefined): x is Item => !!x);

  const weaponId: string | undefined = player.equipment.weaponItemId;
  const armorId: string | undefined = player.equipment.armorItemId;

  const weapon: Item | undefined = weaponId ? items.find((x) => x.id === weaponId) : undefined;
  const armor: Item | undefined = armorId ? items.find((x) => x.id === armorId) : undefined;

  const lines: string[] = [];
  lines.push(`<div class="panelTitle"><b>Inventory</b><span class="tag">I to close</span></div>`);
  lines.push(`<div class="small">Gold: <b>${player.gold}</b> • Level: <b>${player.level}</b> • XP: <b>${player.xp}</b></div>`);
  lines.push(`<div class="small">Weapon: ${weapon ? `<b>${escapeHtml(weapon.name)}</b>` : `<span class="muted">none</span>`}</div>`);
  lines.push(`<div class="small">Armor: ${armor ? `<b>${escapeHtml(armor.name)}</b>` : `<span class="muted">none</span>`}</div>`);
  lines.push(`<div class="sep"></div>`);

  if (invItems.length === 0) {
    lines.push(`<div class="small muted">Empty.</div>`);
    return lines.join("");
  }

  lines.push(`<div class="grid">`);
  for (const it of invItems.slice(0, 60)) {
    const extra: string =
      it.kind === "potion" ? `(+${it.healAmount ?? 0} HP)` :
      it.kind === "weapon" ? `(+${it.attackBonus ?? 0} Atk)` :
      it.kind === "armor" ? `(+${it.defenseBonus ?? 0} Def)` : "";
    const actions: string[] = [];

    if (it.kind === "potion") actions.push(`<button class="btnTiny" data-act="use" data-item="${it.id}">Use</button>`);
    if (it.kind === "weapon") actions.push(`<button class="btnTiny" data-act="equipWeapon" data-item="${it.id}">Equip</button>`);
    if (it.kind === "armor") actions.push(`<button class="btnTiny" data-act="equipArmor" data-item="${it.id}">Equip</button>`);

    actions.push(`<button class="btnTiny" data-act="drop" data-item="${it.id}">Drop</button>`);

    lines.push(`<div class="small">• ${escapeHtml(it.name)} <span class="muted">${escapeHtml(extra)}</span></div>`);
    lines.push(`<div class="row" style="justify-content:flex-end;">${actions.join("")}</div>`);
  }
  lines.push(`</div>`);

  return lines.join("");
}

function renderShop(player: Entity, items: Item[], shop: Shop | undefined, canShop: boolean): string {
  const lines: string[] = [];
  lines.push(`<div class="panelTitle"><b>Town Shop</b><span class="tag">B to close</span></div>`);

  if (!canShop) {
    lines.push(`<div class="small muted">You need to be standing on a town tile (T) to shop.</div>`);
    return lines.join("");
  }

  if (!shop) {
    lines.push(`<div class="small muted">No shop found for this town.</div>`);
    return lines.join("");
  }

  lines.push(`<div class="small">Gold: <b>${player.gold}</b></div>`);
  lines.push(`<div class="sep"></div>`);
  lines.push(`<div class="small muted">Buy</div>`);
  lines.push(`<div class="grid">`);

  for (const id of shop.stockItemIds.slice(0, 40)) {
    const it: Item | undefined = items.find((x) => x.id === id);
    if (!it) continue;

    const price: number = it.value;
    const extra: string =
      it.kind === "potion" ? `(+${it.healAmount ?? 0} HP)` :
      it.kind === "weapon" ? `(+${it.attackBonus ?? 0} Atk)` :
      it.kind === "armor" ? `(+${it.defenseBonus ?? 0} Def)` : "";

    lines.push(`<div class="small">• ${escapeHtml(it.name)} <span class="muted">${escapeHtml(extra)}</span> <span class="muted">(${price}g)</span></div>`);
    lines.push(`<div class="row" style="justify-content:flex-end;"><button class="btnTiny" data-act="buy" data-item="${it.id}">Buy</button></div>`);
  }
  lines.push(`</div>`);

  lines.push(`<div class="sep"></div>`);
  lines.push(`<div class="small muted">Sell (from inventory)</div>`);

  const invItems: Item[] = player.inventory
    .map((iid: string) => items.find((x) => x.id === iid))
    .filter((x: Item | undefined): x is Item => !!x);

  if (invItems.length === 0) {
    lines.push(`<div class="small muted">Nothing to sell.</div>`);
    return lines.join("");
  }

  lines.push(`<div class="grid">`);
  for (const it of invItems.slice(0, 30)) {
    const price: number = Math.max(1, Math.floor(it.value * 0.5));
    lines.push(`<div class="small">• ${escapeHtml(it.name)} <span class="muted">(${price}g)</span></div>`);
    lines.push(`<div class="row" style="justify-content:flex-end;"><button class="btnTiny" data-act="sell" data-item="${it.id}">Sell</button></div>`);
  }
  lines.push(`</div>`);

  return lines.join("");
}

function escapeHtml(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
