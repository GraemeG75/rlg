import type { Entity, Item, Mode } from "../core/types";
import type { Overworld } from "../maps/overworld";
import type { Dungeon } from "../maps/dungeon";
import { getDungeonTile, getVisibility } from "../maps/dungeon";

export type RenderContext = {
  mode: Mode;
  overworld: Overworld;
  dungeon: Dungeon | undefined;
  player: Entity;
  entities: Entity[];
  items: Item[];
  useFov: boolean;
};

export function renderAscii(ctx: RenderContext, viewWidth: number, viewHeight: number): string {
  const halfW: number = Math.floor(viewWidth / 2);
  const halfH: number = Math.floor(viewHeight / 2);

  const originX: number = ctx.player.pos.x;
  const originY: number = ctx.player.pos.y;

  let out: string = "";

  for (let y: number = -halfH; y <= halfH; y++) {
    for (let x: number = -halfW; x <= halfW; x++) {
      const wx: number = originX + x;
      const wy: number = originY + y;

      if (x === 0 && y === 0) {
        out += "@";
        continue;
      }

      const entityChar: string | undefined = findEntityChar(ctx, wx, wy);
      if (entityChar) {
        out += entityChar;
        continue;
      }

      const itemChar: string | undefined = findItemChar(ctx, wx, wy);
      if (itemChar) {
        out += itemChar;
        continue;
      }

      if (ctx.mode === "overworld") {
        const t = ctx.overworld.getTile(wx, wy);
        out += overworldChar(t);
      } else {
        const dungeon: Dungeon | undefined = ctx.dungeon;
        if (!dungeon) { out += " "; continue; }
        if (wx < 0 || wy < 0 || wx >= dungeon.width || wy >= dungeon.height) { out += " "; continue; }

        if (ctx.useFov) {
          const v = getVisibility(dungeon, wx, wy);
          if (v === "unseen") { out += " "; continue; }
          // 'seen' renders normally for simplicity; you can dim via CSS later if you want.
        }

        out += dungeonChar(getDungeonTile(dungeon, wx, wy));
      }
    }
    out += "\n";
  }

  return out;
}

function findEntityChar(ctx: RenderContext, x: number, y: number): string | undefined {
  for (const e of ctx.entities) {
    if (e.kind !== "monster") continue;

    if (ctx.mode === "overworld") {
      if (e.mapRef.kind !== "overworld") continue;
    } else {
      if (e.mapRef.kind !== "dungeon") continue;
      if (!ctx.dungeon) continue;
      if (e.mapRef.dungeonId !== ctx.dungeon.id) continue;

      if (ctx.useFov) {
        const v = getVisibility(ctx.dungeon, x, y);
        if (v !== "visible") continue;
      }
    }

    if (e.pos.x === x && e.pos.y === y) return "g";
  }

  return undefined;
}

function findItemChar(ctx: RenderContext, x: number, y: number): string | undefined {
  for (const it of ctx.items) {
    if (!it.mapRef || !it.pos) continue;

    if (ctx.mode === "overworld") {
      if (it.mapRef.kind !== "overworld") continue;
    } else {
      if (it.mapRef.kind !== "dungeon") continue;
      if (!ctx.dungeon) continue;
      if (it.mapRef.dungeonId !== ctx.dungeon.id) continue;
      if (ctx.useFov) {
        const v = getVisibility(ctx.dungeon, x, y);
        if (v !== "visible") continue;
      }
    }

    if (it.pos.x === x && it.pos.y === y) return itemChar(it.kind);
  }

  return undefined;
}

function itemChar(kind: string): string {
  switch (kind) {
    case "potion": return "!";
    case "weapon": return ")";
    case "armor": return "]";
    default: return "?";
  }
}

function overworldChar(tile: string): string {
  switch (tile) {
    case "water": return "~";
    case "grass": return ".";
    case "forest": return "♣";
    case "mountain": return "^";
    case "dungeon": return "D";
    case "town": return "T";
    case "road": return "=";
    default: return "?";
  }
}

function dungeonChar(tile: string): string {
  switch (tile) {
    case "wall": return "#";
    case "floor": return ".";
    case "stairsUp": return "<";
    case "stairsDown": return ">";
    default: return "?";
  }
}
